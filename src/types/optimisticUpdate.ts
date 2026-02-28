/**
 * Types for Optimistic UI Update System
 *
 * This module defines types for optimistic UI updates that provide immediate
 * feedback to users while operations are queued or in progress.
 */

import { Beer } from './beer';

/**
 * Type of optimistic update
 */
export enum OptimisticUpdateType {
  /** Beer check-in operation */
  CHECK_IN_BEER = 'CHECK_IN_BEER',

  /** Reward redemption operation */
  REDEEM_REWARD = 'REDEEM_REWARD',

  /** Remove beer from queue */
  REMOVE_FROM_QUEUE = 'REMOVE_FROM_QUEUE',
}

/**
 * Status of an optimistic update
 */
export enum OptimisticUpdateStatus {
  /** Update is pending (UI updated, operation queued) */
  PENDING = 'pending',

  /** Update is being synced to server */
  SYNCING = 'syncing',

  /** Update succeeded (confirmed by server) */
  SUCCESS = 'success',

  /** Update failed (rolled back) */
  FAILED = 'failed',
}

/**
 * Rollback data for beer check-in
 */
export type CheckInRollbackData = {
  /** Type of rollback */
  type: 'CHECK_IN_BEER';

  /** Beer that was checked in */
  beer: Beer;

  /** Whether beer was in allBeers before check-in */
  wasInAllBeers: boolean;

  /** Whether beer was in tastedBeers before check-in */
  wasInTastedBeers: boolean;
};

/**
 * Rollback data for reward redemption
 */
export type RewardRollbackData = {
  /** Type of rollback */
  type: 'REDEEM_REWARD';

  /** Reward ID that was redeemed */
  rewardId: string;

  /** Whether reward was available before redemption */
  wasAvailable: boolean;
};

/**
 * Union type for all rollback data
 */
export type RollbackData = CheckInRollbackData | RewardRollbackData;

/**
 * Optimistic update structure
 */
export type OptimisticUpdate = {
  /** Unique update ID (matches operation ID if queued) */
  id: string;

  /** Type of update */
  type: OptimisticUpdateType;

  /** Current status */
  status: OptimisticUpdateStatus;

  /** Timestamp when update was applied (milliseconds) */
  timestamp: number;

  /** Rollback data to restore previous state */
  rollbackData: RollbackData;

  /** Error message if update failed */
  errorMessage?: string;

  /** Linked operation ID (if queued) */
  operationId?: string;
};

/**
 * Database row representation of an optimistic update
 */
export type OptimisticUpdateRow = {
  id: string;
  type: string;
  status: string;
  timestamp: number;
  rollback_data: string; // JSON stringified
  error_message?: string;
  operation_id?: string;
};

/**
 * Type guard for CheckInRollbackData
 */
export function isCheckInRollbackData(data: unknown): data is CheckInRollbackData {
  if (!data || typeof data !== 'object') {
    return false;
  }

  const d = data as Record<string, unknown>;

  return (
    d['type'] === 'CHECK_IN_BEER' &&
    typeof d['beer'] === 'object' &&
    d['beer'] !== null &&
    typeof d['wasInAllBeers'] === 'boolean' &&
    typeof d['wasInTastedBeers'] === 'boolean'
  );
}

/**
 * Type guard for RewardRollbackData
 */
export function isRewardRollbackData(data: unknown): data is RewardRollbackData {
  if (!data || typeof data !== 'object') {
    return false;
  }

  const d = data as Record<string, unknown>;

  return (
    d['type'] === 'REDEEM_REWARD' &&
    typeof d['rewardId'] === 'string' &&
    typeof d['wasAvailable'] === 'boolean'
  );
}

/**
 * Type guard for OptimisticUpdate
 */
export function isOptimisticUpdate(obj: unknown): obj is OptimisticUpdate {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  const update = obj as Record<string, unknown>;

  return (
    typeof update['id'] === 'string' &&
    typeof update['type'] === 'string' &&
    Object.values(OptimisticUpdateType).includes(update['type'] as OptimisticUpdateType) &&
    typeof update['status'] === 'string' &&
    Object.values(OptimisticUpdateStatus).includes(update['status'] as OptimisticUpdateStatus) &&
    typeof update['timestamp'] === 'number' &&
    typeof update['rollbackData'] === 'object' &&
    update['rollbackData'] !== null
  );
}

/**
 * Configuration for optimistic updates
 */
export type OptimisticUpdateConfig = {
  /** Auto-confirm updates after this many milliseconds (for offline mode) */
  autoConfirmDelayMs: number;

  /** Show pending state for at least this many milliseconds (prevent flicker) */
  minPendingDurationMs: number;

  /** Maximum number of pending updates to track in memory */
  maxPendingUpdates: number;
};

/**
 * Default optimistic update configuration
 */
export const DEFAULT_OPTIMISTIC_CONFIG: OptimisticUpdateConfig = {
  autoConfirmDelayMs: 5 * 60 * 1000, // 5 minutes
  minPendingDurationMs: 500, // 500ms
  maxPendingUpdates: 100,
};
