/**
 * Types for Operation Queue System
 *
 * This module defines types for queuing operations that fail due to network issues
 * and automatically retrying them when connection is restored.
 */

/**
 * Operation types that can be queued
 */
export enum OperationType {
  /** Beer check-in operation */
  CHECK_IN_BEER = 'CHECK_IN_BEER',

  /** Reward redemption operation */
  ADD_TO_REWARD_QUEUE = 'ADD_TO_REWARD_QUEUE',

  /** Refresh all data operation */
  REFRESH_ALL_DATA = 'REFRESH_ALL_DATA',

  /** Refresh rewards operation */
  REFRESH_REWARDS = 'REFRESH_REWARDS',

  /** Update preferences operation */
  UPDATE_PREFERENCES = 'UPDATE_PREFERENCES',
}

/**
 * Operation status in the queue
 */
export enum OperationStatus {
  /** Operation is pending retry */
  PENDING = 'pending',

  /** Operation is currently being retried */
  RETRYING = 'retrying',

  /** Operation completed successfully */
  SUCCESS = 'success',

  /** Operation failed permanently (max retries exceeded) */
  FAILED = 'failed',
}

/**
 * Beer check-in operation payload
 */
export interface CheckInBeerPayload {
  /** Beer ID to check in */
  beerId: string;

  /** Beer name for display */
  beerName: string;

  /** Store ID where check-in occurred */
  storeId: string;

  /** Store name for display */
  storeName: string;

  /** Member ID who is checking in */
  memberId: string;
}

/**
 * Reward redemption operation payload
 */
export interface RewardRedemptionPayload {
  /** Reward ID to redeem */
  rewardId: string;

  /** Reward type for display */
  rewardType: string;

  /** Member ID who is redeeming */
  memberId: string;
}

/**
 * Refresh data operation payload
 */
export interface RefreshDataPayload {
  /** What data to refresh (all, rewards, beers) */
  dataType: 'all' | 'rewards' | 'beers';
}

/**
 * Update preferences operation payload
 */
export interface UpdatePreferencesPayload {
  /** Preference key */
  key: string;

  /** Preference value */
  value: string;
}

/**
 * Union type for all operation payloads
 */
export type OperationPayload =
  | CheckInBeerPayload
  | RewardRedemptionPayload
  | RefreshDataPayload
  | UpdatePreferencesPayload;

/**
 * Queued operation structure
 */
export interface QueuedOperation {
  /** Unique operation ID */
  id: string;

  /** Type of operation */
  type: OperationType;

  /** Operation-specific payload */
  payload: OperationPayload;

  /** Timestamp when operation was queued (milliseconds) */
  timestamp: number;

  /** Number of retry attempts made */
  retryCount: number;

  /** Current status of the operation */
  status: OperationStatus;

  /** Error message if operation failed */
  errorMessage?: string;

  /** Timestamp of last retry attempt (milliseconds) */
  lastRetryTimestamp?: number;
}

/**
 * Database row representation of a queued operation
 */
export interface QueuedOperationRow {
  id: string;
  type: string;
  payload: string; // JSON stringified
  timestamp: number;
  retry_count: number;
  status: string;
  error_message?: string;
  last_retry_timestamp?: number;
}

/**
 * Type guard to check if an object is a QueuedOperation
 */
export function isQueuedOperation(obj: unknown): obj is QueuedOperation {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  const op = obj as QueuedOperation;

  return (
    typeof op.id === 'string' &&
    typeof op.type === 'string' &&
    Object.values(OperationType).includes(op.type as OperationType) &&
    typeof op.payload === 'object' &&
    op.payload !== null &&
    typeof op.timestamp === 'number' &&
    typeof op.retryCount === 'number' &&
    typeof op.status === 'string' &&
    Object.values(OperationStatus).includes(op.status as OperationStatus)
  );
}

/**
 * Type guard for CheckInBeerPayload
 */
export function isCheckInBeerPayload(payload: unknown): payload is CheckInBeerPayload {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const p = payload as CheckInBeerPayload;

  return (
    typeof p.beerId === 'string' &&
    typeof p.beerName === 'string' &&
    typeof p.storeId === 'string' &&
    typeof p.storeName === 'string' &&
    typeof p.memberId === 'string'
  );
}

/**
 * Type guard for RewardRedemptionPayload
 */
export function isRewardRedemptionPayload(payload: unknown): payload is RewardRedemptionPayload {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const p = payload as RewardRedemptionPayload;

  return (
    typeof p.rewardId === 'string' &&
    typeof p.rewardType === 'string' &&
    typeof p.memberId === 'string'
  );
}

/**
 * Configuration for retry behavior
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxRetries: number;

  /** Base delay in milliseconds (for exponential backoff) */
  baseDelayMs: number;

  /** Maximum delay between retries in milliseconds */
  maxDelayMs: number;

  /** Debounce delay after network reconnection before retrying (milliseconds) */
  reconnectionDebounceMs: number;
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000, // 1 second
  maxDelayMs: 30000, // 30 seconds
  reconnectionDebounceMs: 2000, // 2 seconds
};

/**
 * Result of executing a queued operation
 */
export interface OperationExecutionResult {
  /** Whether the operation succeeded */
  success: boolean;

  /** Error message if operation failed */
  error?: string;

  /** Whether the error is retryable (network error) */
  isRetryable?: boolean;
}
