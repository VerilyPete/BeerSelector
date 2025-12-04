/**
 * Live Activity Expo Module
 *
 * This module provides a clean TypeScript interface to the native iOS Live Activity
 * functionality using the Expo Modules API. It replaces the legacy Native Modules
 * implementation with pure Swift code.
 *
 * Features:
 * - Type-safe interface for all Live Activity operations
 * - Support for the end-and-restart pattern for auto-dismiss
 * - Thread-safe native implementation with NSLock
 * - Activity state observation for user dismissals
 *
 * @example
 * ```typescript
 * import LiveActivityModule from '@/modules/live-activity';
 *
 * // Check if Live Activities are enabled
 * const isEnabled = await LiveActivityModule.areActivitiesEnabled();
 *
 * // Start a new activity
 * const activityId = await LiveActivityModule.startActivity({
 *   memberId: 'M123',
 *   storeId: 'S456',
 *   beers: [{ id: '1', name: 'Test IPA' }],
 * });
 *
 * // Restart activity (end-and-restart pattern)
 * const newActivityId = await LiveActivityModule.restartActivity({
 *   memberId: 'M123',
 *   storeId: 'S456',
 *   beers: [{ id: '1', name: 'Test IPA' }, { id: '2', name: 'Test Stout' }],
 * });
 * ```
 */

import { requireNativeModule } from 'expo-modules-core';

// ============================================================================
// Type Definitions (local to module for package isolation)
// ============================================================================

/**
 * A beer in the queue for Live Activity display.
 */
export interface QueuedBeer {
  /** Unique identifier for the beer */
  id: string;
  /** Display name (container type stripped) */
  name: string;
}

/**
 * Data required to start a Live Activity.
 */
export interface StartActivityData {
  /** Member ID from Flying Saucer */
  memberId: string;
  /** Store ID */
  storeId: string;
  /** Array of beers in the queue */
  beers: QueuedBeer[];
}

/**
 * Data required to update a Live Activity.
 */
export interface UpdateActivityData {
  /** Updated array of beers in the queue */
  beers: QueuedBeer[];
}

/**
 * Alias for QueuedBeer for backward compatibility.
 * @deprecated Use QueuedBeer instead
 */
export type BeerData = QueuedBeer;

// ============================================================================
// Module Interface
// ============================================================================

/**
 * Live Activity Module interface defining all available native functions.
 *
 * Note: StartActivityData and UpdateActivityData types use QueuedBeer (imported from
 * @/src/types/liveActivity) for the beers array. BeerData is a deprecated alias.
 */
export interface LiveActivityModuleInterface {
  /**
   * Checks if Live Activities are enabled on this device.
   * Returns true only on iOS 16.1+ with ActivityKit available and user permission.
   *
   * @returns Promise resolving to true if Live Activities are enabled
   */
  areActivitiesEnabled(): Promise<boolean>;

  /**
   * Starts a new Live Activity for the beer queue.
   *
   * @param data - Activity data including memberId, storeId, and beers
   * @returns Promise resolving to the activity ID
   * @throws LiveActivityUnsupportedException if iOS < 16.1
   * @throws Error if app is not in foreground (iOS requirement)
   */
  startActivity(data: StartActivityData): Promise<string>;

  /**
   * Updates an existing Live Activity with new queue state.
   * Note: This preserves the existing staleDate - use restartActivity() to reset the timer.
   *
   * @param activityId - ID of the activity to update
   * @param data - Updated activity data with new beers array
   * @returns Promise resolving to true if successful
   * @throws ActivityNotFoundException if activity ID not found
   */
  updateActivity(activityId: string, data: UpdateActivityData): Promise<boolean>;

  /**
   * Ends a specific Live Activity.
   *
   * @param activityId - ID of the activity to end
   * @returns Promise resolving to true if successful
   */
  endActivity(activityId: string): Promise<boolean>;

  /**
   * Ends all Live Activities for this app.
   * Safe to call even if no activities exist.
   *
   * @returns Promise resolving to true when complete
   */
  endAllActivities(): Promise<boolean>;

  /**
   * Restarts the Live Activity using the end-and-restart pattern.
   *
   * This is the recommended way to update the activity as it:
   * 1. Ends any existing activities immediately
   * 2. Starts a new activity with fresh 3-hour staleDate
   * 3. Minimizes flicker by executing both in the same Task block
   *
   * If beers array is empty, it will just end the activity and return null.
   *
   * @param data - Activity data for the new activity
   * @returns Promise resolving to new activity ID, or null if queue is empty
   * @throws LiveActivityUnsupportedException if iOS < 16.1
   * @throws LiveActivityDisabledException if user disabled Live Activities
   */
  restartActivity(data: StartActivityData): Promise<string | null>;

  /**
   * Gets all active Live Activity IDs for this app.
   *
   * @returns Promise resolving to array of activity IDs
   */
  getAllActivityIds(): Promise<string[]>;

  /**
   * Ends any Live Activities that have exceeded the specified age.
   * This is used to clean up stale activities on app launch/foreground.
   *
   * Note: iOS staleDate only dims activities, it doesn't auto-dismiss them.
   * This function enforces the 3-hour maximum age policy.
   *
   * @param maxAgeSeconds - Maximum age in seconds (typically 10800 for 3 hours)
   * @returns Promise resolving to the number of activities that were ended
   */
  endActivitiesOlderThan(maxAgeSeconds: number): Promise<number>;

  /**
   * Synchronously ends all Live Activities.
   * Used for app termination scenarios where async operations may not complete.
   * Uses semaphore pattern with 1-second timeout.
   *
   * @returns boolean indicating completion (may timeout)
   */
  endAllActivitiesSync(): boolean;

  /**
   * Schedules a background cleanup task to end Live Activities.
   * The task will run approximately after the specified delay.
   *
   * Note: iOS does not guarantee exact execution time for BGAppRefreshTask.
   * The task may run minutes to hours after the scheduled time, depending on
   * device battery level, user's app usage patterns, and system resources.
   *
   * @param delaySeconds - Delay in seconds before the task should run (typically 10800 for 3 hours)
   * @returns Promise resolving to true if task was scheduled successfully
   */
  scheduleCleanupTask(delaySeconds: number): Promise<boolean>;

  /**
   * Cancels any pending background cleanup task.
   * Call this when restarting an activity (to reschedule with fresh timer)
   * or when the user manually ends the activity.
   *
   * @returns true if cancellation was successful
   */
  cancelCleanupTask(): boolean;

  /**
   * Gets the stale date for a specific activity.
   * The stale date is when the activity should be considered expired.
   *
   * @param activityId - ID of the activity to check
   * @returns Promise resolving to Unix timestamp (seconds since epoch) or null if not found
   */
  getActivityStaleDate(activityId: string): Promise<number | null>;
}

// ============================================================================
// Module Export
// ============================================================================

/**
 * The native Live Activity module.
 *
 * This uses Expo Modules API's requireNativeModule to load the Swift module.
 * The module name "LiveActivity" must match the Name() definition in the Swift code.
 */
const LiveActivityModule = requireNativeModule<LiveActivityModuleInterface>('LiveActivity');

export default LiveActivityModule;
