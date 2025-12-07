/**
 * useQueuedCheckIn Hook - DEPRECATED
 *
 * This hook is deprecated in favor of useOptimisticCheckIn which provides
 * better user experience with optimistic UI updates and rollback support.
 *
 * For backward compatibility, this hook now wraps useOptimisticCheckIn.
 *
 * @deprecated Use useOptimisticCheckIn instead for optimistic UI updates
 *
 * @example
 * ```tsx
 * // Old way (still works)
 * import { useQueuedCheckIn } from '@/hooks/useQueuedCheckIn';
 * const { queuedCheckIn, isLoading } = useQueuedCheckIn();
 *
 * // New way (recommended)
 * import { useOptimisticCheckIn } from '@/hooks/useOptimisticCheckIn';
 * const { checkInBeer, isChecking } = useOptimisticCheckIn();
 * ```
 */

import { useOptimisticCheckIn } from './useOptimisticCheckIn';
import { BeerWithContainerType } from '@/src/types/beer';

export interface UseQueuedCheckInResult {
  /** Execute a check-in (immediate or queued based on network status) */
  queuedCheckIn: (beer: BeerWithContainerType) => Promise<void>;

  /** Whether a check-in is currently in progress */
  isLoading: boolean;
}

/**
 * Hook for queued check-ins with network awareness
 * @deprecated Use useOptimisticCheckIn instead
 */
export const useQueuedCheckIn = (): UseQueuedCheckInResult => {
  const { checkInBeer, isChecking } = useOptimisticCheckIn();

  return {
    queuedCheckIn: checkInBeer,
    isLoading: isChecking,
  };
};
