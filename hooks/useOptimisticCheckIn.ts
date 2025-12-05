/**
 * useOptimisticCheckIn Hook - Beer Check-In Queue Management
 *
 * This hook handles beer check-ins by sending requests to the server queue.
 * Note: Check-ins require employee confirmation before appearing in tasted list.
 * The tasted brews list only updates when synced from the API after confirmation.
 *
 * Features:
 * - Network-aware behavior (queue if offline, execute if online)
 * - Session validation before check-in
 * - Success/failure feedback via alerts
 *
 * @example
 * ```tsx
 * import { useOptimisticCheckIn } from '@/hooks/useOptimisticCheckIn';
 *
 * const { checkInBeer, isChecking } = useOptimisticCheckIn();
 *
 * // Queue a beer for check-in
 * await checkInBeer(beer);
 * ```
 */

import { useState, useCallback } from 'react';
import { Alert, Platform } from 'react-native';
import { useNetwork } from '@/context/NetworkContext';
import { useOperationQueue } from '@/context/OperationQueueContext';
import { useOptimisticUpdate } from '@/context/OptimisticUpdateContext';
import { useAppContext } from '@/context/AppContext';
import { checkInBeer as checkInBeerApi } from '@/src/api/beerService';
import { BeerWithGlassType } from '@/src/types/beer';
import { OperationType, CheckInBeerPayload } from '@/src/types/operationQueue';
import { OptimisticUpdateType, OptimisticUpdateStatus } from '@/src/types/optimisticUpdate';
import { getSessionData } from '@/src/api/sessionManager';
import { getQueuedBeers } from '@/src/api/queueService';
import { updateLiveActivityWithQueue } from '@/src/services/liveActivityService';

export interface UseOptimisticCheckInResult {
  /** Execute a check-in with optimistic UI updates */
  checkInBeer: (beer: BeerWithGlassType) => Promise<void>;

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
  const { queueOperation } = useOperationQueue();
  const { pendingUpdates } = useOptimisticUpdate();
  const { beers, addQueuedBeer } = useAppContext();

  /**
   * Check in a beer with optimistic UI update
   */
  const checkInBeer = useCallback(
    async (beer: BeerWithGlassType): Promise<void> => {
      setIsChecking(true);

      try {
        // Get session data
        const sessionData = await getSessionData();

        if (
          !sessionData ||
          !sessionData.memberId ||
          !sessionData.storeId ||
          !sessionData.storeName
        ) {
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
        const wasInTastedBeers = beers.tastedBeers.some(b => b.id === beer.id);

        if (wasInTastedBeers) {
          Alert.alert('Already Tasted', `${beer.brew_name} is already in your tasted list.`);
          return;
        }

        // Check network connectivity
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

          await queueOperation(OperationType.CHECK_IN_BEER, payload);

          // Add to queued set to remove from Beerfinder list
          addQueuedBeer(beer.id);

          Alert.alert(
            'Queued for Later',
            `${beer.brew_name} will be queued when you're back online.`,
            [{ text: 'OK' }]
          );

          return;
        }

        // Online - execute check-in immediately
        console.log('[useOptimisticCheckIn] Online - executing check-in for:', beer.brew_name);
        const result = await checkInBeerApi(beer);

        if (result.success) {
          // Add to queued set to remove from Beerfinder list
          addQueuedBeer(beer.id);

          // Update Live Activity with current queue (iOS only)
          if (Platform.OS === 'ios') {
            try {
              const queuedBeers = await getQueuedBeers();
              await updateLiveActivityWithQueue(queuedBeers, sessionData, false);
            } catch (liveActivityError) {
              // Live Activity errors should never block the main flow
              console.log('[useOptimisticCheckIn] Live Activity update failed:', liveActivityError);
            }
          }

          Alert.alert('Success', `${beer.brew_name} has been queued for check-in!`);
        } else {
          Alert.alert(
            'Check-In Failed',
            result.error || 'Unable to queue beer. Please try again.',
            [{ text: 'OK' }]
          );
        }
      } catch (error) {
        console.error('[useOptimisticCheckIn] Error during check-in:', error);

        // Check if it's a JSON parse error (which often means success on Flying Saucer API)
        if (error instanceof SyntaxError && error.message.includes('JSON Parse error')) {
          // Add to queued set to remove from Beerfinder list
          addQueuedBeer(beer.id);

          // Update Live Activity with current queue (iOS only)
          if (Platform.OS === 'ios') {
            try {
              const queuedBeers = await getQueuedBeers();
              const currentSessionData = await getSessionData();
              if (currentSessionData) {
                await updateLiveActivityWithQueue(queuedBeers, currentSessionData, false);
              }
            } catch (liveActivityError) {
              // Live Activity errors should never block the main flow
              console.log('[useOptimisticCheckIn] Live Activity update failed:', liveActivityError);
            }
          }

          Alert.alert('Success', `${beer.brew_name} has been queued for check-in!`);
          return;
        }

        // Show error alert
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        Alert.alert('Error', errorMessage);
      } finally {
        setIsChecking(false);
      }
    },
    [isConnected, isInternetReachable, queueOperation, beers.tastedBeers, addQueuedBeer]
  );

  /**
   * Get pending check-in for a beer
   */
  const getPendingBeer = useCallback(
    (beerId: string): { status: OptimisticUpdateStatus; error?: string } | null => {
      const update = pendingUpdates.find(u => {
        if (
          u.type === OptimisticUpdateType.CHECK_IN_BEER &&
          u.rollbackData.type === 'CHECK_IN_BEER'
        ) {
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
   * @deprecated No longer applicable - check-ins don't have local state to retry
   */
  const retryCheckIn = useCallback(async (_beerId: string): Promise<void> => {
    // No-op: check-ins are queued server-side, not stored locally
  }, []);

  /**
   * Manually rollback a check-in
   * @deprecated No longer applicable - check-ins don't modify local tasted list
   */
  const rollbackCheckIn = useCallback(async (_beerId: string): Promise<void> => {
    // No-op: check-ins don't add to tasted list until employee confirmation
  }, []);

  return {
    checkInBeer,
    isChecking,
    getPendingBeer,
    retryCheckIn,
    rollbackCheckIn,
  };
};
