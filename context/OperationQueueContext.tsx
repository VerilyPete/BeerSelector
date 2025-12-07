/**
 * OperationQueueContext - Queued Operations Management
 *
 * This context provides centralized management for operations that fail due to network issues
 * and automatically retries them when connection is restored.
 *
 * Features:
 * - Queue operations when offline
 * - Automatic retry when network restored
 * - Manual retry for individual operations
 * - Clear queue
 * - View queued operations
 * - Exponential backoff for retries
 *
 * @example
 * ```tsx
 * // Wrap your app with the provider
 * <OperationQueueProvider>
 *   <App />
 * </OperationQueueProvider>
 *
 * // Use the context in components
 * const { queueOperation, queuedOperations, isRetrying } = useOperationQueue();
 *
 * // Queue an operation
 * await queueOperation({
 *   type: OperationType.CHECK_IN_BEER,
 *   payload: { beerId, beerName, storeId, storeName, memberId }
 * });
 * ```
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
  useRef,
} from 'react';
import { operationQueueRepository } from '@/src/database/repositories/OperationQueueRepository';
import { getDatabase } from '@/src/database/connection';
import { useNetwork } from './NetworkContext';
import {
  QueuedOperation,
  OperationType,
  OperationStatus,
  OperationPayload,
  OperationExecutionResult,
  DEFAULT_RETRY_CONFIG,
  RetryConfig,
  CheckInBeerPayload,
  isCheckInBeerPayload,
} from '@/src/types/operationQueue';
import { checkInBeer } from '@/src/api/beerService';
import { Beer } from '@/src/types/beer';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Callback for operation success
 */
export type OperationSuccessCallback = (
  operationId: string,
  operation: QueuedOperation
) => Promise<void> | void;

/**
 * Callback for operation failure
 */
export type OperationFailureCallback = (
  operationId: string,
  operation: QueuedOperation,
  error?: string
) => Promise<void> | void;

/**
 * Context value interface
 */
export interface OperationQueueContextValue {
  /** List of all queued operations */
  queuedOperations: QueuedOperation[];

  /** Whether retry is currently in progress */
  isRetrying: boolean;

  /** Queue a new operation (returns operation ID) */
  queueOperation: (type: OperationType, payload: OperationPayload) => Promise<string>;

  /** Retry all pending operations */
  retryAll: () => Promise<void>;

  /** Retry a specific operation by ID */
  retryOperation: (id: string) => Promise<void>;

  /** Clear all operations from queue */
  clearQueue: () => Promise<void>;

  /** Delete a specific operation from queue */
  deleteOperation: (id: string) => Promise<void>;

  /** Refresh the list of queued operations */
  refresh: () => Promise<void>;

  /** Register a callback for operation success */
  onOperationSuccess: (callback: OperationSuccessCallback) => void;

  /** Register a callback for operation failure (permanent) */
  onOperationFailure: (callback: OperationFailureCallback) => void;

  /** Retry configuration */
  retryConfig: RetryConfig;
}

// ============================================================================
// CONTEXT CREATION
// ============================================================================

const OperationQueueContext = createContext<OperationQueueContextValue | undefined>(undefined);

// ============================================================================
// PROVIDER COMPONENT
// ============================================================================

interface OperationQueueProviderProps {
  children: ReactNode;
  /** Optional custom retry configuration */
  retryConfig?: Partial<RetryConfig>;
}

/**
 * OperationQueueProvider component that wraps the application and provides operation queue management
 */
export const OperationQueueProvider: React.FC<OperationQueueProviderProps> = ({
  children,
  retryConfig: customRetryConfig,
}) => {
  const [queuedOperations, setQueuedOperations] = useState<QueuedOperation[]>([]);
  const [isRetrying, setIsRetrying] = useState(false);
  const { isConnected, isInternetReachable, details } = useNetwork();
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousConnectionState = useRef<boolean | null>(null);

  // Callbacks for operation success/failure
  const successCallbacksRef = useRef<OperationSuccessCallback[]>([]);
  const failureCallbacksRef = useRef<OperationFailureCallback[]>([]);

  // Merge custom retry config with defaults
  const retryConfig = useMemo<RetryConfig>(
    () => ({
      ...DEFAULT_RETRY_CONFIG,
      ...customRetryConfig,
    }),
    [customRetryConfig]
  );

  /**
   * Load queued operations from database
   */
  const loadQueuedOperations = useCallback(async () => {
    try {
      const operations = await operationQueueRepository.getAllOperations();
      setQueuedOperations(operations);
    } catch (error) {
      console.error('[OperationQueueContext] Error loading queued operations:', error);
    }
  }, []);

  /**
   * Generate unique operation ID
   */
  const generateOperationId = useCallback((): string => {
    return `op_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }, []);

  /**
   * Queue a new operation (returns operation ID)
   */
  const queueOperation = useCallback(
    async (type: OperationType, payload: OperationPayload): Promise<string> => {
      try {
        const operation: QueuedOperation = {
          id: generateOperationId(),
          type,
          payload,
          timestamp: Date.now(),
          retryCount: 0,
          status: OperationStatus.PENDING,
        };

        // Add to database
        await operationQueueRepository.addOperation(operation);

        // Reload operations
        await loadQueuedOperations();

        console.log(`[OperationQueueContext] Queued operation: ${type} (ID: ${operation.id})`);

        return operation.id;
      } catch (error) {
        console.error('[OperationQueueContext] Error queueing operation:', error);
        throw error;
      }
    },
    [generateOperationId, loadQueuedOperations]
  );

  /**
   * Execute a single operation
   */
  const executeOperation = useCallback(
    async (operation: QueuedOperation): Promise<OperationExecutionResult> => {
      console.log(
        `[OperationQueueContext] Executing operation: ${operation.type} (${operation.id})`
      );

      try {
        switch (operation.type) {
          case OperationType.CHECK_IN_BEER: {
            if (!isCheckInBeerPayload(operation.payload)) {
              throw new Error('Invalid CHECK_IN_BEER payload');
            }

            const payload = operation.payload as CheckInBeerPayload;

            // Create Beer object for checkInBeer function
            const beer: Beer = {
              id: payload.beerId,
              brew_name: payload.beerName,
              brewer: '',
              brewer_loc: '',
              brew_style: '',
              brew_container: '',
              review_count: '',
              review_rating: '',
              brew_description: '',
            };

            const result = await checkInBeer(beer);

            if (result.success) {
              return { success: true };
            }

            return {
              success: false,
              error: result.error || 'Check-in failed',
              isRetryable: true,
            };
          }

          case OperationType.ADD_TO_REWARD_QUEUE:
            // TODO: Implement reward redemption
            console.log('[OperationQueueContext] Reward redemption not yet implemented');
            return {
              success: false,
              error: 'Reward redemption not yet implemented',
              isRetryable: false,
            };

          case OperationType.REFRESH_ALL_DATA:
          case OperationType.REFRESH_REWARDS:
          case OperationType.UPDATE_PREFERENCES:
            // TODO: Implement these operation types
            console.log(`[OperationQueueContext] ${operation.type} not yet implemented`);
            return {
              success: false,
              error: `${operation.type} not yet implemented`,
              isRetryable: false,
            };

          default:
            return {
              success: false,
              error: `Unknown operation type: ${operation.type}`,
              isRetryable: false,
            };
        }
      } catch (error) {
        console.error(`[OperationQueueContext] Error executing operation ${operation.id}:`, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          isRetryable: true, // Assume retryable unless we know otherwise
        };
      }
    },
    []
  );

  /**
   * Calculate delay for exponential backoff
   */
  const calculateRetryDelay = useCallback(
    (retryCount: number): number => {
      const delay = retryConfig.baseDelayMs * Math.pow(2, retryCount);
      return Math.min(delay, retryConfig.maxDelayMs);
    },
    [retryConfig]
  );

  /**
   * Notify success callbacks
   */
  const notifySuccess = useCallback(
    async (operationId: string, operation: QueuedOperation): Promise<void> => {
      for (const callback of successCallbacksRef.current) {
        try {
          await callback(operationId, operation);
        } catch (error) {
          console.error('[OperationQueueContext] Error in success callback:', error);
        }
      }
    },
    []
  );

  /**
   * Notify failure callbacks
   */
  const notifyFailure = useCallback(
    async (operationId: string, operation: QueuedOperation, error?: string): Promise<void> => {
      for (const callback of failureCallbacksRef.current) {
        try {
          await callback(operationId, operation, error);
        } catch (callbackError) {
          console.error('[OperationQueueContext] Error in failure callback:', callbackError);
        }
      }
    },
    []
  );

  /**
   * Retry a specific operation
   */
  const retryOperation = useCallback(
    async (id: string): Promise<void> => {
      try {
        const operation = await operationQueueRepository.getOperationById(id);

        if (!operation) {
          console.warn(`[OperationQueueContext] Operation ${id} not found`);
          return;
        }

        // Atomic update with WHERE clause to prevent concurrent retries
        const db = await getDatabase();
        const updateResult = await db.runAsync(
          `UPDATE operation_queue
           SET status = ?, last_retry_timestamp = ?
           WHERE id = ? AND status != ?`,
          [OperationStatus.RETRYING, Date.now(), id, OperationStatus.RETRYING]
        );

        // If no rows updated, operation is already being retried
        if (updateResult.changes === 0) {
          console.log(`[OperationQueueContext] Operation ${id} is already being retried`);
          return;
        }

        await loadQueuedOperations();

        // Execute the operation
        const result = await executeOperation(operation);

        if (result.success) {
          // Success - mark as success and delete
          await operationQueueRepository.updateStatus(id, OperationStatus.SUCCESS);
          await operationQueueRepository.deleteOperation(id);
          console.log(`[OperationQueueContext] Operation ${id} completed successfully`);

          // Notify success callbacks
          await notifySuccess(id, operation);
        } else if (result.isRetryable && operation.retryCount < retryConfig.maxRetries) {
          // Failed but retryable - increment retry count
          await operationQueueRepository.incrementRetryCount(id, result.error);
          console.log(
            `[OperationQueueContext] Operation ${id} failed (retry ${operation.retryCount + 1}/${retryConfig.maxRetries}): ${result.error}`
          );
        } else {
          // Failed permanently - mark as failed
          await operationQueueRepository.updateStatus(id, OperationStatus.FAILED, result.error);
          console.error(
            `[OperationQueueContext] Operation ${id} failed permanently: ${result.error}`
          );

          // Notify failure callbacks
          await notifyFailure(id, operation, result.error);
        }

        // Reload operations
        await loadQueuedOperations();
      } catch (error) {
        console.error(`[OperationQueueContext] Error retrying operation ${id}:`, error);

        // Update status back to PENDING on error
        try {
          await operationQueueRepository.updateStatus(
            id,
            OperationStatus.PENDING,
            error instanceof Error ? error.message : 'Unknown error'
          );
          await loadQueuedOperations();
        } catch (updateError) {
          console.error('[OperationQueueContext] Error updating operation status:', updateError);
        }
      }
    },
    [executeOperation, loadQueuedOperations, retryConfig.maxRetries, notifySuccess, notifyFailure]
  );

  /**
   * Retry all pending operations
   */
  const retryAll = useCallback(async (): Promise<void> => {
    if (isRetrying) {
      console.log('[OperationQueueContext] Retry already in progress');
      return;
    }

    try {
      setIsRetrying(true);

      const pendingOperations = await operationQueueRepository.getPendingOperations();

      if (pendingOperations.length === 0) {
        console.log('[OperationQueueContext] No pending operations to retry');
        return;
      }

      console.log(
        `[OperationQueueContext] Retrying ${pendingOperations.length} pending operations`
      );

      // Retry operations sequentially to avoid overwhelming the server
      for (const operation of pendingOperations) {
        await retryOperation(operation.id);

        // Add delay between operations based on retry count
        if (operation.retryCount > 0) {
          const delay = calculateRetryDelay(operation.retryCount);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      console.log('[OperationQueueContext] Finished retrying all operations');
    } catch (error) {
      console.error('[OperationQueueContext] Error retrying all operations:', error);
    } finally {
      setIsRetrying(false);
    }
  }, [isRetrying, retryOperation, calculateRetryDelay]);

  /**
   * Clear all operations from queue
   */
  const clearQueue = useCallback(async (): Promise<void> => {
    try {
      await operationQueueRepository.clearAll();
      await loadQueuedOperations();
      console.log('[OperationQueueContext] Queue cleared');
    } catch (error) {
      console.error('[OperationQueueContext] Error clearing queue:', error);
      throw error;
    }
  }, [loadQueuedOperations]);

  /**
   * Delete a specific operation
   */
  const deleteOperation = useCallback(
    async (id: string): Promise<void> => {
      try {
        await operationQueueRepository.deleteOperation(id);
        await loadQueuedOperations();
        console.log(`[OperationQueueContext] Operation ${id} deleted`);
      } catch (error) {
        console.error(`[OperationQueueContext] Error deleting operation ${id}:`, error);
        throw error;
      }
    },
    [loadQueuedOperations]
  );

  /**
   * Refresh the list of queued operations
   */
  const refresh = useCallback(async (): Promise<void> => {
    await loadQueuedOperations();
  }, [loadQueuedOperations]);

  /**
   * Register a callback for operation success
   * Returns an unsubscribe function to clean up the callback
   */
  const onOperationSuccess = useCallback((callback: OperationSuccessCallback): (() => void) => {
    successCallbacksRef.current.push(callback);

    // Return unsubscribe function
    return () => {
      const index = successCallbacksRef.current.indexOf(callback);
      if (index > -1) {
        successCallbacksRef.current.splice(index, 1);
      }
    };
  }, []);

  /**
   * Register a callback for operation failure (permanent)
   * Returns an unsubscribe function to clean up the callback
   */
  const onOperationFailure = useCallback((callback: OperationFailureCallback): (() => void) => {
    failureCallbacksRef.current.push(callback);

    // Return unsubscribe function
    return () => {
      const index = failureCallbacksRef.current.indexOf(callback);
      if (index > -1) {
        failureCallbacksRef.current.splice(index, 1);
      }
    };
  }, []);

  // ============================================================================
  // EFFECTS
  // ============================================================================

  /**
   * Load operations on mount
   */
  useEffect(() => {
    loadQueuedOperations();
  }, [loadQueuedOperations]);

  /**
   * Auto-retry when network connection is restored
   */
  useEffect(() => {
    const currentlyConnected = isConnected && isInternetReachable;
    const wasDisconnected = previousConnectionState.current === false;
    const isNowConnected = currentlyConnected === true;

    // Only trigger retry if we transition from disconnected to connected
    if (wasDisconnected && isNowConnected) {
      console.log('[OperationQueueContext] Network connection restored, scheduling retry');

      // Clear any existing timeout
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }

      // Check if connection is expensive (cellular) and warn user
      const isExpensive = details.isConnectionExpensive === true;

      if (isExpensive) {
        console.log('[OperationQueueContext] Connection is expensive (cellular)');
        // TODO: Consider asking user for permission before retrying on cellular
      }

      // Schedule retry with debounce
      retryTimeoutRef.current = setTimeout(() => {
        retryAll();
      }, retryConfig.reconnectionDebounceMs);
    }

    // Update previous connection state
    previousConnectionState.current = currentlyConnected;

    // Cleanup timeout on unmount
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [
    isConnected,
    isInternetReachable,
    details.isConnectionExpensive,
    retryAll,
    retryConfig.reconnectionDebounceMs,
  ]);

  // ============================================================================
  // CONTEXT VALUE
  // ============================================================================

  const value: OperationQueueContextValue = useMemo(
    () => ({
      queuedOperations,
      isRetrying,
      queueOperation,
      retryAll,
      retryOperation,
      clearQueue,
      deleteOperation,
      refresh,
      onOperationSuccess,
      onOperationFailure,
      retryConfig,
    }),
    [
      queuedOperations,
      isRetrying,
      queueOperation,
      retryAll,
      retryOperation,
      clearQueue,
      deleteOperation,
      refresh,
      onOperationSuccess,
      onOperationFailure,
      retryConfig,
    ]
  );

  return <OperationQueueContext.Provider value={value}>{children}</OperationQueueContext.Provider>;
};

// ============================================================================
// CUSTOM HOOK
// ============================================================================

/**
 * Custom hook to access operation queue context
 * Throws error if used outside of OperationQueueProvider
 *
 * @throws Error if used outside OperationQueueProvider
 * @returns OperationQueueContextValue with queue management functions
 *
 * @example
 * ```tsx
 * const { queueOperation, queuedOperations, isRetrying } = useOperationQueue();
 *
 * // Queue an operation
 * await queueOperation(OperationType.CHECK_IN_BEER, {
 *   beerId: '123',
 *   beerName: 'My Beer',
 *   storeId: '456',
 *   storeName: 'My Store',
 *   memberId: '789'
 * });
 * ```
 */
export const useOperationQueue = (): OperationQueueContextValue => {
  const context = useContext(OperationQueueContext);

  if (context === undefined) {
    throw new Error('useOperationQueue must be used within an OperationQueueProvider');
  }

  return context;
};
