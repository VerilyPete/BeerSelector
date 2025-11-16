/**
 * useOptimisticCheckIn Hook - Optimistic UI Updates for Beer Check-Ins
 *
 * This hook provides optimistic UI updates for beer check-ins with:
 * - Immediate UI feedback (beer moves to tasted list instantly)
 * - Rollback on failure (beer returns to untasted list)
 * - Visual state indicators (pending, syncing, success, failed)
 * - Network-aware behavior (queue if offline, execute if online)
 * - Persistence across app restarts
 *
 * @example
 * ```tsx
 * import { useOptimisticCheckIn } from '@/hooks/useOptimisticCheckIn';
 *
 * const { checkInBeer, isChecking, getPendingBeer, retryCheckIn } = useOptimisticCheckIn();
 *
 * // Check in a beer
 * await checkInBeer(beer);
 *
 * // Check if a beer is pending
 * const pending = getPendingBeer(beer.id);
 * ```
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { Alert } from 'react-native';
import { useNetwork } from '@/context/NetworkContext';
import { useOperationQueue } from '@/context/OperationQueueContext';
import { useOptimisticUpdate } from '@/context/OptimisticUpdateContext';
import { useAppContext } from '@/context/AppContext';
import { checkInBeer as checkInBeerApi } from '@/src/api/beerService';
import { myBeersRepository } from '@/src/database/repositories/MyBeersRepository';
import { Beer, Beerfinder } from '@/src/types/beer';
import { OperationType, CheckInBeerPayload } from '@/src/types/operationQueue';
import { OptimisticUpdateType, CheckInRollbackData, OptimisticUpdateStatus } from '@/src/types/optimisticUpdate';
import { getSessionData } from '@/src/api/sessionManager';

export interface UseOptimisticCheckInResult {
  /** Execute a check-in with optimistic UI updates */
  checkInBeer: (beer: Beer) => Promise<void>;

  /** Whether a check-in is currently in progress */
  isChecking: boolean;

  /** Get pending check-in for a beer (if any) */
  getPendingBeer: (beerId: string) => { status: OptimisticUpdateStatus; error?: string } | null;

  /** Retry a failed check-in */
  retryCheckIn: (beerId: string) => Promise<void>;

  /** Manually rollback a check-in */
  rollbackCheckIn: (beerId: string) => Promise<void>;
}

/**
 * Hook for optimistic beer check-ins with UI updates and rollback
 */
export const useOptimisticCheckIn = (): UseOptimisticCheckInResult => {
  const [isChecking, setIsChecking] = useState(false);
  const { isConnected, isInternetReachable } = useNetwork();
  const { queueOperation, onOperationSuccess, onOperationFailure } = useOperationQueue();
  const {
    applyOptimisticUpdate,
    confirmUpdate,
    rollbackUpdate,
    pendingUpdates,
    getUpdateByOperationId,
    linkOperation,
  } = useOptimisticUpdate();
  const { beers, setTastedBeers, refreshBeerData } = useAppContext();

  /**
   * Register callbacks for operation success/failure
   */
  useEffect(() => {
    // On success: confirm the optimistic update
    const unsubscribeSuccess = onOperationSuccess(async (operationId) => {
      const update = getUpdateByOperationId(operationId);
      if (update) {
        console.log('[useOptimisticCheckIn] Confirming optimistic update:', update.id);
        await confirmUpdate(update.id);
      }
    });

    // On failure: rollback the optimistic update
    const unsubscribeFailure = onOperationFailure(async (operationId, operation, error) => {
      const update = getUpdateByOperationId(operationId);
      if (update) {
        console.log('[useOptimisticCheckIn] Rolling back optimistic update:', update.id);
        const rollbackData = await rollbackUpdate(update.id, error);

        if (rollbackData && rollbackData.type === 'CHECK_IN_BEER') {
          // Remove beer from tasted list (rollback)
          await myBeersRepository.delete(rollbackData.beer.id);
          await refreshBeerData();

          Alert.alert(
            'Check-In Failed',
            `${rollbackData.beer.brew_name} could not be checked in: ${error || 'Unknown error'}`,
            [{ text: 'OK' }]
          );
        }
      }
    });

    // CRITICAL: Clean up callbacks on unmount or when dependencies change
    return () => {
      unsubscribeSuccess();
      unsubscribeFailure();
    };
  }, [onOperationSuccess, onOperationFailure, getUpdateByOperationId, confirmUpdate, rollbackUpdate, refreshBeerData]);

  /**
   * Check in a beer with optimistic UI update
   */
  const checkInBeer = useCallback(
    async (beer: Beer): Promise<void> => {
      setIsChecking(true);

      // Declare updateId at function scope so it's accessible in catch block
      let updateId: string | undefined;

      try {
        // Get session data
        const sessionData = await getSessionData();

        if (!sessionData || !sessionData.memberId || !sessionData.storeId || !sessionData.storeName) {
          Alert.alert('Error', 'Please log in to check in beers.');
          return;
        }

        // Check if user is in visitor mode
        if (sessionData.memberId === 'visitor') {
          Alert.alert(
            'Visitor Mode',
            'Check-in requires UFO Club member login. Please log in via Settings.'
          );
          return;
        }

        // Check if beer is already in tasted list
        const wasInTastedBeers = beers.tastedBeers.some((b) => b.id === beer.id);

        if (wasInTastedBeers) {
          Alert.alert('Already Tasted', `${beer.brew_name} is already in your tasted list.`);
          return;
        }

        // Step 1: Apply optimistic update immediately
        console.log('[useOptimisticCheckIn] Applying optimistic update for:', beer.brew_name);

        const rollbackData: CheckInRollbackData = {
          type: 'CHECK_IN_BEER',
          beer,
          wasInAllBeers: true,
          wasInTastedBeers: false,
        };

        updateId = await applyOptimisticUpdate({
          type: OptimisticUpdateType.CHECK_IN_BEER,
          rollbackData,
        });

        // Step 2: Add beer to tasted list immediately (optimistic)
        const tastedBeer: Beerfinder = {
          ...beer,
          tasted_date: new Date().toISOString(),
          roh_lap: sessionData.memberId,
        };

        await myBeersRepository.insertMany([tastedBeer]);
        await refreshBeerData();

        console.log('[useOptimisticCheckIn] Beer added to tasted list (optimistic)');

        // Step 3: Check network connectivity
        const isOnline = isConnected && isInternetReachable;

        if (!isOnline) {
          // Queue the operation for later
          console.log('[useOptimisticCheckIn] Offline - queueing check-in for:', beer.brew_name);

          const payload: CheckInBeerPayload = {
            beerId: beer.id,
            beerName: beer.brew_name,
            storeId: sessionData.storeId,
            storeName: sessionData.storeName,
            memberId: sessionData.memberId,
          };

          const operationId = await queueOperation(OperationType.CHECK_IN_BEER, payload);

          // Link optimistic update to queued operation
          await linkOperation(updateId, operationId);

          Alert.alert(
            'Queued for Later',
            `${beer.brew_name} has been added to your tasted list and will sync when you're back online.`,
            [{ text: 'OK' }]
          );

          return;
        }

        // Step 4: Online - execute check-in immediately
        console.log('[useOptimisticCheckIn] Online - executing check-in for:', beer.brew_name);
        const result = await checkInBeerApi(beer);

        if (result.success) {
          // Success - confirm the optimistic update
          await confirmUpdate(updateId);
          Alert.alert('Success', `Successfully checked in ${beer.brew_name}!`);
        } else {
          // Failed - rollback the optimistic update
          const rollbackData = await rollbackUpdate(updateId, result.error);

          if (rollbackData && rollbackData.type === 'CHECK_IN_BEER') {
            await myBeersRepository.delete(rollbackData.beer.id);
            await refreshBeerData();
          }

          Alert.alert(
            'Check-In Failed',
            result.error || 'Unable to check in beer. Please try again.',
            [{ text: 'OK' }]
          );
        }
      } catch (error) {
        console.error('[useOptimisticCheckIn] Error during check-in:', error);

        // Check if it's a JSON parse error (which often means success on Flying Saucer API)
        if (error instanceof SyntaxError && error.message.includes('JSON Parse error')) {
          // CRITICAL FIX #3: Confirm the optimistic update (don't leave it in PENDING state)
          if (updateId) {
            await confirmUpdate(updateId);
          }
          Alert.alert('Success', `Successfully checked in ${beer.brew_name}!`);
          return;
        }

        // CRITICAL FIX #2: Rollback the optimistic update for generic errors
        if (updateId) {
          try {
            const rollbackData = await rollbackUpdate(
              updateId,
              error instanceof Error ? error.message : 'Unknown error'
            );

            if (rollbackData && rollbackData.type === 'CHECK_IN_BEER') {
              await myBeersRepository.delete(rollbackData.beer.id);
              await refreshBeerData();
            }
          } catch (rollbackError) {
            console.error('[useOptimisticCheckIn] Error during rollback:', rollbackError);
          }
        }

        // Show error alert
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        Alert.alert('Error', errorMessage);
      } finally {
        setIsChecking(false);
      }
    },
    [
      isConnected,
      isInternetReachable,
      queueOperation,
      applyOptimisticUpdate,
      confirmUpdate,
      rollbackUpdate,
      beers.tastedBeers,
      refreshBeerData,
    ]
  );

  /**
   * Get pending check-in for a beer
   */
  const getPendingBeer = useCallback(
    (beerId: string): { status: OptimisticUpdateStatus; error?: string } | null => {
      const update = pendingUpdates.find((u) => {
        if (u.type === OptimisticUpdateType.CHECK_IN_BEER && u.rollbackData.type === 'CHECK_IN_BEER') {
          return u.rollbackData.beer.id === beerId;
        }
        return false;
      });

      if (update) {
        return {
          status: update.status,
          error: update.errorMessage,
        };
      }

      return null;
    },
    [pendingUpdates]
  );

  /**
   * Retry a failed check-in
   */
  const retryCheckIn = useCallback(
    async (beerId: string): Promise<void> => {
      const update = pendingUpdates.find((u) => {
        if (u.type === OptimisticUpdateType.CHECK_IN_BEER && u.rollbackData.type === 'CHECK_IN_BEER') {
          return u.rollbackData.beer.id === beerId;
        }
        return false;
      });

      if (update && update.rollbackData.type === 'CHECK_IN_BEER') {
        const beer = update.rollbackData.beer;
        await checkInBeer(beer);
      }
    },
    [pendingUpdates, checkInBeer]
  );

  /**
   * Manually rollback a check-in
   */
  const rollbackCheckIn = useCallback(
    async (beerId: string): Promise<void> => {
      const update = pendingUpdates.find((u) => {
        if (u.type === OptimisticUpdateType.CHECK_IN_BEER && u.rollbackData.type === 'CHECK_IN_BEER') {
          return u.rollbackData.beer.id === beerId;
        }
        return false;
      });

      if (update) {
        const rollbackData = await rollbackUpdate(update.id);

        if (rollbackData && rollbackData.type === 'CHECK_IN_BEER') {
          await myBeersRepository.delete(rollbackData.beer.id);
          await refreshBeerData();

          Alert.alert('Rolled Back', `${rollbackData.beer.brew_name} has been removed from your tasted list.`);
        }
      }
    },
    [pendingUpdates, rollbackUpdate, refreshBeerData]
  );

  return {
    checkInBeer,
    isChecking,
    getPendingBeer,
    retryCheckIn,
    rollbackCheckIn,
  };
};
