/**
 * Live Activity Types
 *
 * Type definitions for the iOS Live Activity feature that displays
 * the beer queue on the lock screen and Dynamic Island.
 *
 * These types mirror the Swift types in BeerQueueAttributes.swift
 * to ensure data consistency between React Native and the native widget.
 */

/**
 * Represents a beer in the queue for Live Activity display.
 * The name should already be stripped of container type (e.g., "(Draft)", "(BTL)")
 * before being passed to the Live Activity.
 */
export interface LiveActivityQueuedBeer {
  /** Unique identifier for the queued beer */
  id: string;

  /** Beer name (stripped of container type) */
  name: string;
}

/**
 * Current state of the beer queue for Live Activity updates.
 * This is the ContentState that gets sent to the Live Activity.
 */
export interface LiveActivityQueueState {
  /** Array of beers currently in the queue */
  beers: LiveActivityQueuedBeer[];
}

/**
 * Static attributes set when starting a Live Activity.
 * These values don't change during the activity's lifecycle.
 */
export interface LiveActivityAttributes {
  /** Member ID from Flying Saucer */
  memberId: string;

  /** Store ID */
  storeId: string;
}

/**
 * Combined data for starting a Live Activity.
 */
export interface LiveActivityStartData {
  /** Static attributes */
  attributes: LiveActivityAttributes;

  /** Initial content state */
  contentState: LiveActivityQueueState;
}

/**
 * Result of checking Live Activity support.
 */
export interface LiveActivitySupportResult {
  /** Whether Live Activities are supported on this device */
  isSupported: boolean;

  /** Reason if not supported (e.g., "Android device", "iOS version too low") */
  reason?: string;
}

/**
 * A queued beer for native module communication.
 * Alias for LiveActivityQueuedBeer for clarity in native module data structures.
 */
export interface QueuedBeer {
  /** Unique identifier for the queued beer */
  id: string;

  /** Beer name (stripped of container type) */
  name: string;
}

/**
 * Data passed to startActivity native method.
 * Combines attributes and initial queue state into a flat structure
 * for easier native module communication.
 */
export interface StartActivityData {
  /** Member ID from Flying Saucer */
  memberId: string;

  /** Store ID */
  storeId: string;

  /** Array of beers currently in the queue */
  beers: QueuedBeer[];
}

/**
 * Data passed to updateActivity native method.
 * Contains only the content state (beers array) since attributes are static.
 */
export interface UpdateActivityData {
  /** Array of beers currently in the queue */
  beers: QueuedBeer[];
}

/**
 * Configuration for the restart activity debouncer.
 * Used to prevent UI flicker from rapid consecutive updates.
 */
export interface RestartDebounceConfig {
  /** Debounce delay in milliseconds (default: 500) */
  delayMs: number;

  /** Whether debouncing is enabled (default: true) */
  enabled?: boolean;

  /** Whether to log debug information */
  debug?: boolean;
}

/**
 * Result of a restart activity operation.
 * Provides detailed information about the restart outcome.
 */
export interface RestartActivityResult {
  /** Whether the restart was successful */
  success: boolean;

  /** The new activity ID if successful */
  activityId: string | null;

  /** Whether this was a debounced call (vs immediate) */
  wasDebounced: boolean;

  /** Error message if failed */
  error?: string;
}

/**
 * State of the activity for observation.
 * Maps to iOS ActivityKit activity states.
 */
export type ActivityState =
  | 'active' // Activity is running
  | 'ended' // Activity ended by app
  | 'dismissed' // Activity dismissed by user
  | 'stale'; // Activity is stale (past staleDate)

/**
 * Callback for activity state changes.
 * Used to observe when an activity transitions between states.
 */
export type ActivityStateCallback = (activityId: string, state: ActivityState) => void;
