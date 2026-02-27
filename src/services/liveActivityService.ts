/**
 * Live Activity Service
 *
 * This service manages iOS Live Activities for displaying the beer queue
 * on the lock screen and Dynamic Island. It provides a clean abstraction
 * over the React Native native module.
 *
 * Features:
 * - Platform-aware: Only runs on iOS 16.1+
 * - Visitor mode check: Disabled for visitor mode users
 * - Error resilient: All errors are caught and logged, never crash the app
 * - Local-only updates: No push notifications required
 * - End-and-restart pattern: For auto-dismiss after 3 hours
 * - Debounced restart: Prevents UI flicker from rapid updates
 *
 * @example
 * ```typescript
 * import { updateLiveActivityWithQueue, endLiveActivity } from '@/src/services/liveActivityService';
 *
 * // After successful check-in
 * const queuedBeers = await getQueuedBeers();
 * await updateLiveActivityWithQueue(queuedBeers, session);
 *
 * // When queue becomes empty
 * await endLiveActivity();
 *
 * // For rapid updates (uses debouncing)
 * await debouncedRestartLiveActivity(queueState);
 * ```
 */

import { Platform } from 'react-native';
import LiveActivityModule from 'live-activity';
import { createDebouncer, type Debouncer } from './liveActivityDebounce';
import type {
  LiveActivityQueuedBeer,
  LiveActivityQueueState,
  LiveActivityAttributes,
  StartActivityData,
  RestartActivityResult,
  RestartDebounceConfig,
} from '@/src/types/liveActivity';
import type { QueuedBeer } from '@/src/utils/htmlParser';
import type { SessionData } from '@/src/types/api';

// Module-level state to track current activity
let currentActivityId: string | null = null;

// Module-level state for tracking stale timestamp
// This tracks when the current activity should be considered stale and auto-dismissed
let activityStaleTimestamp: number | null = null;

// Constants
const RESTART_DEBOUNCE_MS = 500;
const STALE_DURATION_MS = 3 * 60 * 60 * 1000; // 3 hours in milliseconds
const STALE_DURATION_SECONDS = 3 * 60 * 60; // 3 hours in seconds

// Module-level debouncer state for restart operations
let restartDebouncer: Debouncer<[StartActivityData], string | null> | null = null;

/**
 * Gets or creates the restart debouncer instance.
 * Uses lazy initialization to avoid creating until first use.
 */
function getRestartDebouncer(): Debouncer<[StartActivityData], string | null> {
  if (!restartDebouncer) {
    restartDebouncer = createDebouncer(async (data: StartActivityData): Promise<string | null> => {
      return LiveActivityModule.restartActivity(data);
    }, RESTART_DEBOUNCE_MS);
  }
  return restartDebouncer;
}

/**
 * Strips container type from beer name.
 * Examples:
 * - "Bell's Hopslam (Draft)" -> "Bell's Hopslam"
 * - "Firestone Walker Parabola (BTL)" -> "Firestone Walker Parabola"
 * - "Stone IPA" -> "Stone IPA" (no change)
 *
 * @param beerName - The full beer name possibly including container type
 * @returns The beer name with container type removed
 */
export function stripContainerType(beerName: string): string {
  return beerName.replace(/ \([^)]+\)$/, '');
}

/**
 * Converts QueuedBeer from API/HTML parser to Live Activity format.
 * Strips container types from beer names for cleaner display.
 *
 * @param beers - Array of queued beers from queueService
 * @returns Array of beers formatted for Live Activity
 */
export function convertToLiveActivityBeers(beers: QueuedBeer[]): LiveActivityQueuedBeer[] {
  return beers.map(beer => ({
    id: beer.id,
    name: stripContainerType(beer.name),
  }));
}

/**
 * Checks if Live Activities are supported on the current device.
 * Returns true only on iOS 16.1+ with ActivityKit available.
 *
 * @returns Promise resolving to true if Live Activities are supported
 */
export async function isLiveActivitySupported(): Promise<boolean> {
  // Only iOS supports Live Activities
  if (Platform.OS !== 'ios') {
    console.log('[LiveActivity] Not iOS platform');
    return false;
  }

  try {
    // Check if activities are enabled on this device
    const isEnabled = await LiveActivityModule.areActivitiesEnabled();
    console.log('[LiveActivity] Activities enabled:', isEnabled);
    return isEnabled;
  } catch (error) {
    console.error('[LiveActivity] Error checking support:', error);
    return false;
  }
}

/**
 * Starts a new Live Activity for the beer queue.
 * If an activity already exists, it will be updated instead.
 *
 * @param queueState - Current state of the beer queue
 * @param attributes - Static attributes (memberId, storeId)
 * @returns Activity ID if successful, null otherwise
 */
export async function startLiveActivity(
  queueState: LiveActivityQueueState,
  attributes: LiveActivityAttributes
): Promise<string | null> {
  try {
    // Check support first
    const isSupported = await isLiveActivitySupported();
    if (!isSupported) {
      console.log('[LiveActivity] Not supported, skipping start');
      return null;
    }

    // Don't start if queue is empty
    if (queueState.beers.length === 0) {
      console.log('[LiveActivity] Cannot start with empty queue');
      return null;
    }

    // Start the activity with the Expo module
    const activityId = await LiveActivityModule.startActivity({
      memberId: attributes.memberId,
      storeId: attributes.storeId,
      beers: queueState.beers,
    });

    currentActivityId = activityId;
    activityStaleTimestamp = Date.now() + STALE_DURATION_MS;
    console.log('[LiveActivity] Started activity:', activityId);

    // Schedule background cleanup task for 3 hours from now
    try {
      await LiveActivityModule.scheduleCleanupTask(STALE_DURATION_SECONDS);
      console.log('[LiveActivity] Scheduled cleanup task for 3 hours');
    } catch (scheduleError) {
      // Cleanup task scheduling failure is non-fatal
      console.warn('[LiveActivity] Failed to schedule cleanup task:', scheduleError);
    }

    return activityId;
  } catch (error) {
    // Handle expected errors gracefully
    const errorMessage = error instanceof Error ? error.message : String(error);

    // "Target is not foreground" happens when app is backgrounding (e.g., locking screen)
    // This is expected and will retry when app comes back to foreground
    if (errorMessage.includes('not foreground')) {
      console.log('[LiveActivity] App not in foreground, will retry when foregrounded');
      return null;
    }

    console.error('[LiveActivity] Error starting activity:', error);
    return null;
  }
}

/**
 * Updates the existing Live Activity with new queue state.
 * If no activity exists and queue has beers, starts a new one.
 * If activity exists but queue is empty, ends the activity.
 *
 * @param queueState - Updated state of the beer queue
 */
export async function updateLiveActivity(queueState: LiveActivityQueueState): Promise<void> {
  try {
    // Check support
    const isSupported = await isLiveActivitySupported();
    if (!isSupported) {
      return;
    }

    // If queue is empty, end any existing activity
    if (queueState.beers.length === 0) {
      await endLiveActivity();
      return;
    }

    // If no current activity, we can't update
    if (!currentActivityId) {
      console.log('[LiveActivity] No activity to update, need to start first');
      return;
    }

    // Update the activity with the Expo module
    await LiveActivityModule.updateActivity(currentActivityId, {
      beers: queueState.beers,
    });
    console.log('[LiveActivity] Updated activity');
  } catch (error) {
    // Handle expected errors gracefully
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('not foreground')) {
      console.log('[LiveActivity] App not in foreground, will retry when foregrounded');
      return;
    }
    console.error('[LiveActivity] Error updating activity:', error);
  }
}

/**
 * Ends the current Live Activity.
 * Safe to call even if no activity exists.
 */
export async function endLiveActivity(): Promise<void> {
  try {
    if (!currentActivityId) {
      console.log('[LiveActivity] No activity to end');
      return;
    }

    await LiveActivityModule.endActivity(currentActivityId);
    console.log('[LiveActivity] Ended activity');
    currentActivityId = null;
    activityStaleTimestamp = null;

    // Cancel any pending background cleanup task
    try {
      LiveActivityModule.cancelCleanupTask();
    } catch (cancelError) {
      // Non-fatal, just log
      console.warn('[LiveActivity] Failed to cancel cleanup task:', cancelError);
    }
  } catch (error) {
    console.error('[LiveActivity] Error ending activity:', error);
    // Reset state even on error to prevent stale references
    currentActivityId = null;
    activityStaleTimestamp = null;
  }
}

/**
 * Ends all Live Activities for this app.
 * Should be called on app launch to ensure clean state if app was force-quit
 * with an active Live Activity.
 *
 * This is safe to call even if no activities exist.
 */
export async function endAllLiveActivities(): Promise<void> {
  try {
    // Only iOS supports Live Activities
    if (Platform.OS !== 'ios') {
      return;
    }

    // End all activities with the Expo module
    await LiveActivityModule.endAllActivities();
    console.log('[LiveActivity] Ended all activities');

    // Reset our tracked state
    currentActivityId = null;
    activityStaleTimestamp = null;

    // Cancel any pending cleanup task since we've ended all activities
    LiveActivityModule.cancelCleanupTask();
  } catch (error) {
    console.error('[LiveActivity] Error ending all activities:', error);
    // Reset state even on error
    currentActivityId = null;
    activityStaleTimestamp = null;
  }
}

/**
 * Gets the current Live Activity ID.
 *
 * @returns The current activity ID or null if no activity is active
 */
export function getCurrentActivityId(): string | null {
  return currentActivityId;
}

// 3 hours in seconds
const MAX_ACTIVITY_AGE_SECONDS = 3 * 60 * 60;

/**
 * Ends any Live Activities that have exceeded the 3-hour maximum age.
 * This should be called on app launch/foreground since iOS doesn't auto-end
 * activities when staleDate passes - it only marks them as stale.
 *
 * @returns Number of activities that were ended
 */
export async function endStaleActivities(): Promise<number> {
  try {
    if (Platform.OS !== 'ios') {
      return 0;
    }

    const endedCount = await LiveActivityModule.endActivitiesOlderThan(MAX_ACTIVITY_AGE_SECONDS);
    if (endedCount > 0) {
      console.log('[LiveActivity] Ended', endedCount, 'stale activities');
      currentActivityId = null;
    }
    return endedCount;
  } catch (error) {
    console.error('[LiveActivity] Error ending stale activities:', error);
    return 0;
  }
}

/**
 * Syncs the JavaScript activity ID with any existing native activities.
 * This should be called on app launch to recover state after force-quit.
 * Also ends any stale activities that have exceeded the 3-hour maximum age.
 *
 * @returns The first existing activity ID, or null if no activities exist
 */
export async function syncActivityIdFromNative(): Promise<string | null> {
  try {
    if (Platform.OS !== 'ios') {
      return null;
    }

    // First, end any stale activities older than 3 hours
    await endStaleActivities();

    const activityIds = await LiveActivityModule.getAllActivityIds();
    if (activityIds && activityIds.length > 0) {
      // Use the first existing activity
      currentActivityId = activityIds[0];
      console.log('[LiveActivity] Synced with existing activity:', currentActivityId);

      // Restore the stale timestamp from native module
      if (currentActivityId) {
        try {
          const staleDateTimestamp =
            await LiveActivityModule.getActivityStaleDate(currentActivityId);
          if (staleDateTimestamp) {
            // staleDateTimestamp is in seconds (Unix epoch), convert to milliseconds
            activityStaleTimestamp = staleDateTimestamp * 1000;
            console.log(
              '[LiveActivity] Restored stale timestamp from native:',
              new Date(activityStaleTimestamp).toISOString()
            );
          }
        } catch (error) {
          console.log('[LiveActivity] Could not restore stale timestamp:', error);
        }
      }

      return currentActivityId;
    }

    console.log('[LiveActivity] No existing activities found');
    currentActivityId = null;
    return null;
  } catch (error) {
    console.error('[LiveActivity] Error syncing activity ID from native:', error);
    return null;
  }
}

/**
 * High-level function to update Live Activity with queue data.
 * Handles all the conversion and state management internally.
 *
 * This is the main function to call after check-in or queue changes.
 *
 * @param queuedBeers - Array of queued beers from queueService
 * @param sessionData - User session data for attributes
 * @param isVisitorMode - Whether user is in visitor mode (disabled for visitors)
 */
export async function updateLiveActivityWithQueue(
  queuedBeers: QueuedBeer[],
  sessionData: SessionData | null,
  isVisitorMode: boolean = false
): Promise<void> {
  try {
    // Skip for visitor mode users
    if (isVisitorMode) {
      console.log('[LiveActivity] Skipping for visitor mode');
      return;
    }

    // Skip if no session data
    if (!sessionData || !sessionData.memberId || !sessionData.storeId) {
      console.log('[LiveActivity] No valid session data');
      return;
    }

    // Convert beers to Live Activity format (strip container types)
    const liveActivityBeers = convertToLiveActivityBeers(queuedBeers);
    const queueState: LiveActivityQueueState = {
      beers: liveActivityBeers,
    };

    console.log(
      '[LiveActivity] updateLiveActivityWithQueue called with',
      liveActivityBeers.length,
      'beers'
    );
    console.log('[LiveActivity] Current activity ID:', currentActivityId);

    // If queue is empty, end activity
    if (liveActivityBeers.length === 0) {
      console.log('[LiveActivity] Queue empty, ending activity');
      await endLiveActivity();
      return;
    }

    // If no current activity, start one
    if (!currentActivityId) {
      console.log('[LiveActivity] No current activity, starting new one');
      await startLiveActivity(queueState, {
        memberId: sessionData.memberId,
        storeId: sessionData.storeId,
      });
    } else {
      // Update existing activity
      console.log('[LiveActivity] Updating existing activity:', currentActivityId);
      await updateLiveActivity(queueState);
    }
  } catch (error) {
    console.error('[LiveActivity] Error in updateLiveActivityWithQueue:', error);
    // Don't throw - Live Activity errors should never crash the app
  }
}

/**
 * Cleans up stale Live Activity when app returns to foreground.
 * If the activity has exceeded its stale timestamp (3 hours since last queue change),
 * it will be ended and the background cleanup task will be cancelled.
 *
 * This is the foreground cleanup layer of the two-layer cleanup strategy:
 * - Layer 1: Background task (best effort, may be delayed by iOS)
 * - Layer 2: Foreground cleanup (guaranteed when user opens app)
 *
 * @returns Promise that resolves when cleanup check is complete
 */
export async function cleanupStaleActivityOnForeground(): Promise<void> {
  // Skip if no activity is tracked
  if (!currentActivityId || !activityStaleTimestamp) {
    return;
  }

  const now = Date.now();
  if (now >= activityStaleTimestamp) {
    console.log('[LiveActivity] Activity is stale, ending...');
    console.log('[LiveActivity] Stale timestamp:', new Date(activityStaleTimestamp).toISOString());
    console.log('[LiveActivity] Current time:', new Date(now).toISOString());

    // endLiveActivity() handles canceling the cleanup task internally
    await endLiveActivity();
  }
}

/**
 * Syncs Live Activity state on app launch/foreground.
 * Fetches current queue and updates/starts/ends activity as needed.
 *
 * Note: Call cleanupStaleActivityOnForeground() before this function
 * to ensure stale activities are cleaned up first.
 *
 * @param getQueuedBeersFunc - Function to fetch queued beers (dependency injection for testability)
 * @param sessionData - User session data
 * @param isVisitorMode - Whether user is in visitor mode
 */
export async function syncLiveActivityOnLaunch(
  getQueuedBeersFunc: () => Promise<QueuedBeer[]>,
  sessionData: SessionData | null,
  isVisitorMode: boolean = false
): Promise<void> {
  try {
    // Skip for visitor mode or no session
    if (isVisitorMode || !sessionData) {
      console.log('[LiveActivity] Skipping sync - visitor mode or no session');
      return;
    }

    // Check if Live Activities are supported
    const isSupported = await isLiveActivitySupported();
    if (!isSupported) {
      console.log('[LiveActivity] Skipping sync - not supported');
      return;
    }

    // Fetch current queue
    const queuedBeers = await getQueuedBeersFunc();
    console.log('[LiveActivity] Syncing on launch, queue size:', queuedBeers.length);

    // Update Live Activity with current queue state
    await updateLiveActivityWithQueue(queuedBeers, sessionData, isVisitorMode);
  } catch (error) {
    console.error('[LiveActivity] Error syncing on launch:', error);
    // Don't throw - sync errors should never crash the app
  }
}

// ============================================================================
// New Restart Pattern Functions
// ============================================================================

/**
 * Queue state for restart operations.
 * Combines member/store IDs with the beer queue.
 */
export type LiveActivityQueueStateWithIds = {
  memberId: string;
  storeId: string;
  beers: LiveActivityQueuedBeer[];
};

/**
 * Restart the Live Activity with new queue state.
 * This ends any existing activity and starts a new one with a fresh 3-hour timeout.
 *
 * This is the recommended way to update activities as it ensures the staleDate
 * is reset, providing reliable auto-dismiss behavior.
 *
 * @param queueState - Queue state including memberId, storeId, and beers
 * @returns RestartActivityResult with success status and new activity ID
 */
export async function restartLiveActivity(
  queueState: LiveActivityQueueStateWithIds
): Promise<RestartActivityResult> {
  if (Platform.OS !== 'ios') {
    return { success: false, activityId: null, wasDebounced: false, error: 'Not iOS' };
  }

  try {
    const enabled = await LiveActivityModule.areActivitiesEnabled();
    if (!enabled) {
      return {
        success: false,
        activityId: null,
        wasDebounced: false,
        error: 'Activities not enabled',
      };
    }

    // Cancel any pending cleanup task before restarting
    try {
      LiveActivityModule.cancelCleanupTask();
    } catch (cancelError) {
      // Non-fatal, just log
      console.warn('[LiveActivity] Failed to cancel cleanup task before restart:', cancelError);
    }

    const data: StartActivityData = {
      memberId: queueState.memberId,
      storeId: queueState.storeId,
      beers: queueState.beers.map(b => ({ id: b.id, name: b.name })),
    };

    const activityId = await LiveActivityModule.restartActivity(data);

    // Update module state
    if (activityId) {
      currentActivityId = activityId;
      activityStaleTimestamp = Date.now() + STALE_DURATION_MS;

      // Schedule new cleanup task for 3 hours from now
      try {
        await LiveActivityModule.scheduleCleanupTask(STALE_DURATION_SECONDS);
        console.log('[LiveActivity] Scheduled cleanup task for 3 hours after restart');
      } catch (scheduleError) {
        // Non-fatal, just log
        console.warn(
          '[LiveActivity] Failed to schedule cleanup task after restart:',
          scheduleError
        );
      }
    } else {
      // Queue was empty, activity ended
      currentActivityId = null;
      activityStaleTimestamp = null;
    }

    return {
      success: true,
      activityId,
      wasDebounced: false,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Handle expected "not foreground" error gracefully
    if (errorMessage.includes('not foreground')) {
      console.log(
        '[LiveActivity] Restart failed - app not in foreground, will retry when foregrounded'
      );
      return {
        success: false,
        activityId: null,
        wasDebounced: false,
        error: errorMessage,
      };
    }

    console.error('[LiveActivity] Error restarting activity:', error);
    return {
      success: false,
      activityId: null,
      wasDebounced: false,
      error: errorMessage,
    };
  }
}

/**
 * Debounced version of restartLiveActivity.
 * Coalesces rapid queue updates to prevent UI flicker.
 *
 * Use this when queue updates may come in rapid succession (e.g., multiple
 * check-ins in quick succession). The debouncer ensures only the final
 * state is sent to the native module after a 500ms quiet period.
 *
 * @param queueState - Queue state including memberId, storeId, and beers
 * @param config - Optional configuration for debouncing behavior
 * @returns RestartActivityResult with success status
 */
export async function debouncedRestartLiveActivity(
  queueState: LiveActivityQueueStateWithIds,
  config?: Partial<RestartDebounceConfig>
): Promise<RestartActivityResult> {
  if (Platform.OS !== 'ios') {
    return { success: false, activityId: null, wasDebounced: false, error: 'Not iOS' };
  }

  // If debouncing is disabled, call restart directly
  if (config?.enabled === false) {
    return restartLiveActivity(queueState);
  }

  try {
    const enabled = await LiveActivityModule.areActivitiesEnabled();
    if (!enabled) {
      return {
        success: false,
        activityId: null,
        wasDebounced: true,
        error: 'Activities not enabled',
      };
    }

    const data: StartActivityData = {
      memberId: queueState.memberId,
      storeId: queueState.storeId,
      beers: queueState.beers.map(b => ({ id: b.id, name: b.name })),
    };

    const debouncer = getRestartDebouncer();
    const activityId = await debouncer.call(data);

    // Update module state
    currentActivityId = activityId;

    return {
      success: activityId !== null,
      activityId,
      wasDebounced: true,
    };
  } catch (error) {
    if (error instanceof Error && error.message === 'Debounced call cancelled') {
      return { success: false, activityId: null, wasDebounced: true, error: 'Cancelled' };
    }
    return {
      success: false,
      activityId: null,
      wasDebounced: true,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Cancel any pending debounced restart.
 * Call this when you need to ensure no pending restart executes
 * (e.g., on logout or when navigating away).
 */
export function cancelPendingRestart(): void {
  restartDebouncer?.cancel();
}

/**
 * Flush any pending debounced restart immediately.
 * Call this when you need the restart to execute now rather than waiting
 * for the debounce timeout (e.g., before app goes to background).
 */
export function flushPendingRestart(): void {
  restartDebouncer?.flush();
}

/**
 * Synchronously end all activities.
 * Used for app termination scenarios where async operations may not complete.
 *
 * This uses a semaphore pattern in the native module with a 1-second timeout
 * to ensure activities are ended before the app terminates.
 *
 * @returns boolean indicating if the operation completed (may be false on timeout)
 */
export function endAllActivitiesSync(): boolean {
  if (Platform.OS !== 'ios') {
    return true;
  }

  try {
    const result = LiveActivityModule.endAllActivitiesSync();
    currentActivityId = null;
    return result;
  } catch (error) {
    console.error('[LiveActivity] Error in endAllActivitiesSync:', error);
    return false;
  }
}
