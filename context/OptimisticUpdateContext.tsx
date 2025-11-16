/**
 * OptimisticUpdateContext - Optimistic UI Update Management
 *
 * This context provides centralized management for optimistic UI updates that:
 * - Apply immediate UI changes for user actions
 * - Store rollback data to restore previous state if operation fails
 * - Track update status (pending, syncing, success, failed)
 * - Automatically rollback on failure
 * - Persist updates to SQLite for app restart resilience
 *
 * Features:
 * - Apply optimistic updates immediately
 * - Confirm updates when operation succeeds
 * - Rollback updates when operation fails
 * - Query pending updates
 * - Link updates to queued operations
 *
 * @example
 * ```tsx
 * // Wrap your app with the provider
 * <OptimisticUpdateProvider>
 *   <App />
 * </OptimisticUpdateProvider>
 *
 * // Use the context in components
 * const { applyOptimisticUpdate, confirmUpdate, rollbackUpdate } = useOptimisticUpdate();
 *
 * // Apply an optimistic check-in
 * const updateId = await applyOptimisticUpdate({
 *   type: OptimisticUpdateType.CHECK_IN_BEER,
 *   rollbackData: { beer, wasInTastedBeers: false }
 * });
 * ```
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { optimisticUpdateRepository } from '@/src/database/repositories/OptimisticUpdateRepository';
import {
  OptimisticUpdate,
  OptimisticUpdateType,
  OptimisticUpdateStatus,
  RollbackData,
  OptimisticUpdateConfig,
  DEFAULT_OPTIMISTIC_CONFIG,
  CheckInRollbackData,
  isCheckInRollbackData,
} from '@/src/types/optimisticUpdate';
import { Beer, Beerfinder } from '@/src/types/beer';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Parameters for applying an optimistic update
 */
export interface ApplyOptimisticUpdateParams {
  /** Type of update */
  type: OptimisticUpdateType;

  /** Rollback data to restore previous state */
  rollbackData: RollbackData;

  /** Optional ID (generated if not provided) */
  id?: string;

  /** Optional operation ID to link */
  operationId?: string;
}

/**
 * Context value interface
 */
export interface OptimisticUpdateContextValue {
  /** List of all optimistic updates */
  optimisticUpdates: OptimisticUpdate[];

  /** List of pending updates (PENDING or SYNCING) */
  pendingUpdates: OptimisticUpdate[];

  /** Whether updates are being loaded from database */
  isLoading: boolean;

  /** Apply an optimistic update immediately */
  applyOptimisticUpdate: (params: ApplyOptimisticUpdateParams) => Promise<string>;

  /** Confirm an update succeeded */
  confirmUpdate: (id: string) => Promise<void>;

  /** Rollback an update (restore previous state) */
  rollbackUpdate: (id: string, error?: string) => Promise<RollbackData | null>;

  /** Get update by ID */
  getUpdate: (id: string) => OptimisticUpdate | null;

  /** Get update by operation ID */
  getUpdateByOperationId: (operationId: string) => OptimisticUpdate | null;

  /** Update status of an update */
  updateStatus: (id: string, status: OptimisticUpdateStatus) => Promise<void>;

  /** Link update to an operation */
  linkOperation: (updateId: string, operationId: string) => Promise<void>;

  /** Clear all updates */
  clearAll: () => Promise<void>;

  /** Refresh updates from database */
  refresh: () => Promise<void>;

  /** Configuration */
  config: OptimisticUpdateConfig;
}

// ============================================================================
// CONTEXT CREATION
// ============================================================================

const OptimisticUpdateContext = createContext<OptimisticUpdateContextValue | undefined>(undefined);

// ============================================================================
// PROVIDER COMPONENT
// ============================================================================

interface OptimisticUpdateProviderProps {
  children: ReactNode;
  /** Optional custom configuration */
  config?: Partial<OptimisticUpdateConfig>;
}

/**
 * OptimisticUpdateProvider component that wraps the application
 */
export const OptimisticUpdateProvider: React.FC<OptimisticUpdateProviderProps> = ({
  children,
  config: customConfig,
}) => {
  const [optimisticUpdates, setOptimisticUpdates] = useState<OptimisticUpdate[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Merge custom config with defaults
  const config = useMemo<OptimisticUpdateConfig>(
    () => ({
      ...DEFAULT_OPTIMISTIC_CONFIG,
      ...customConfig,
    }),
    [customConfig]
  );

  /**
   * Load optimistic updates from database
   */
  const loadUpdates = useCallback(async () => {
    try {
      const updates = await optimisticUpdateRepository.getAll();
      setOptimisticUpdates(updates);
    } catch (error) {
      console.error('[OptimisticUpdateContext] Error loading updates:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Generate unique update ID
   */
  const generateUpdateId = useCallback((): string => {
    return `opt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }, []);

  /**
   * Apply an optimistic update immediately
   */
  const applyOptimisticUpdate = useCallback(
    async (params: ApplyOptimisticUpdateParams): Promise<string> => {
      try {
        const id = params.id || generateUpdateId();

        const update: OptimisticUpdate = {
          id,
          type: params.type,
          status: OptimisticUpdateStatus.PENDING,
          timestamp: Date.now(),
          rollbackData: params.rollbackData,
          operationId: params.operationId,
        };

        // Add to database
        await optimisticUpdateRepository.add(update);

        // Reload updates
        await loadUpdates();

        console.log(`[OptimisticUpdateContext] Applied optimistic update: ${id}`);
        return id;
      } catch (error) {
        console.error('[OptimisticUpdateContext] Error applying optimistic update:', error);
        throw error;
      }
    },
    [generateUpdateId, loadUpdates]
  );

  /**
   * Confirm an update succeeded
   */
  const confirmUpdate = useCallback(async (id: string): Promise<void> => {
    try {
      await optimisticUpdateRepository.updateStatus(id, OptimisticUpdateStatus.SUCCESS);
      await loadUpdates();
      console.log(`[OptimisticUpdateContext] Confirmed update: ${id}`);

      // Auto-cleanup after a short delay
      setTimeout(async () => {
        await optimisticUpdateRepository.delete(id);
        await loadUpdates();
      }, 1000);
    } catch (error) {
      console.error('[OptimisticUpdateContext] Error confirming update:', error);
      throw error;
    }
  }, [loadUpdates]);

  /**
   * Rollback an update (restore previous state)
   */
  const rollbackUpdate = useCallback(async (id: string, error?: string): Promise<RollbackData | null> => {
    try {
      const update = await optimisticUpdateRepository.getById(id);

      if (!update) {
        console.warn(`[OptimisticUpdateContext] Update ${id} not found for rollback`);
        return null;
      }

      // Update status to FAILED
      await optimisticUpdateRepository.updateStatus(
        id,
        OptimisticUpdateStatus.FAILED,
        error
      );

      // Reload updates
      await loadUpdates();

      console.log(`[OptimisticUpdateContext] Rolled back update: ${id}`);

      // Return rollback data so caller can restore state
      return update.rollbackData;
    } catch (error) {
      console.error('[OptimisticUpdateContext] Error rolling back update:', error);
      throw error;
    }
  }, [loadUpdates]);

  /**
   * Get update by ID
   */
  const getUpdate = useCallback(
    (id: string): OptimisticUpdate | null => {
      return optimisticUpdates.find((u) => u.id === id) || null;
    },
    [optimisticUpdates]
  );

  /**
   * Get update by operation ID
   */
  const getUpdateByOperationId = useCallback(
    (operationId: string): OptimisticUpdate | null => {
      return optimisticUpdates.find((u) => u.operationId === operationId) || null;
    },
    [optimisticUpdates]
  );

  /**
   * Update status of an update
   */
  const updateStatus = useCallback(
    async (id: string, status: OptimisticUpdateStatus): Promise<void> => {
      try {
        await optimisticUpdateRepository.updateStatus(id, status);
        await loadUpdates();
      } catch (error) {
        console.error('[OptimisticUpdateContext] Error updating status:', error);
        throw error;
      }
    },
    [loadUpdates]
  );

  /**
   * Link update to an operation
   */
  const linkOperation = useCallback(
    async (updateId: string, operationId: string): Promise<void> => {
      try {
        await optimisticUpdateRepository.linkOperation(updateId, operationId);
        await loadUpdates();
      } catch (error) {
        console.error('[OptimisticUpdateContext] Error linking operation:', error);
        throw error;
      }
    },
    [loadUpdates]
  );

  /**
   * Clear all updates
   */
  const clearAll = useCallback(async (): Promise<void> => {
    try {
      await optimisticUpdateRepository.clearAll();
      await loadUpdates();
      console.log('[OptimisticUpdateContext] Cleared all updates');
    } catch (error) {
      console.error('[OptimisticUpdateContext] Error clearing updates:', error);
      throw error;
    }
  }, [loadUpdates]);

  /**
   * Refresh updates from database
   */
  const refresh = useCallback(async (): Promise<void> => {
    await loadUpdates();
  }, [loadUpdates]);

  // ============================================================================
  // EFFECTS
  // ============================================================================

  /**
   * Load updates on mount and initialize repository
   */
  useEffect(() => {
    const initialize = async () => {
      try {
        await optimisticUpdateRepository.initialize();
        await loadUpdates();
      } catch (error) {
        console.error('[OptimisticUpdateContext] Error initializing:', error);
      }
    };

    initialize();
  }, [loadUpdates]);

  /**
   * Cleanup old completed updates periodically
   */
  useEffect(() => {
    const cleanupInterval = setInterval(async () => {
      try {
        await optimisticUpdateRepository.clearOldCompleted(24 * 60 * 60 * 1000); // 24 hours
      } catch (error) {
        console.error('[OptimisticUpdateContext] Error cleaning up old updates:', error);
      }
    }, 60 * 60 * 1000); // Run every hour

    return () => clearInterval(cleanupInterval);
  }, []);

  // ============================================================================
  // COMPUTED VALUES
  // ============================================================================

  /**
   * Get pending updates (PENDING or SYNCING)
   */
  const pendingUpdates = useMemo(() => {
    return optimisticUpdates.filter(
      (u) =>
        u.status === OptimisticUpdateStatus.PENDING ||
        u.status === OptimisticUpdateStatus.SYNCING
    );
  }, [optimisticUpdates]);

  // ============================================================================
  // CONTEXT VALUE
  // ============================================================================

  const value: OptimisticUpdateContextValue = useMemo(
    () => ({
      optimisticUpdates,
      pendingUpdates,
      isLoading,
      applyOptimisticUpdate,
      confirmUpdate,
      rollbackUpdate,
      getUpdate,
      getUpdateByOperationId,
      updateStatus,
      linkOperation,
      clearAll,
      refresh,
      config,
    }),
    [
      optimisticUpdates,
      pendingUpdates,
      isLoading,
      applyOptimisticUpdate,
      confirmUpdate,
      rollbackUpdate,
      getUpdate,
      getUpdateByOperationId,
      updateStatus,
      linkOperation,
      clearAll,
      refresh,
      config,
    ]
  );

  return <OptimisticUpdateContext.Provider value={value}>{children}</OptimisticUpdateContext.Provider>;
};

// ============================================================================
// CUSTOM HOOK
// ============================================================================

/**
 * Custom hook to access optimistic update context
 * Throws error if used outside of OptimisticUpdateProvider
 *
 * @throws Error if used outside OptimisticUpdateProvider
 * @returns OptimisticUpdateContextValue with update management functions
 *
 * @example
 * ```tsx
 * const { applyOptimisticUpdate, confirmUpdate, rollbackUpdate } = useOptimisticUpdate();
 *
 * // Apply an optimistic update
 * const updateId = await applyOptimisticUpdate({
 *   type: OptimisticUpdateType.CHECK_IN_BEER,
 *   rollbackData: { beer, wasInTastedBeers: false }
 * });
 * ```
 */
export const useOptimisticUpdate = (): OptimisticUpdateContextValue => {
  const context = useContext(OptimisticUpdateContext);

  if (context === undefined) {
    throw new Error('useOptimisticUpdate must be used within an OptimisticUpdateProvider');
  }

  return context;
};
