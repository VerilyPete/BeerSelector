/**
 * Pull-to-Refresh Animation Hook
 *
 * Provides animated feedback during pull-to-refresh interactions.
 * Tracks pull progress and translates it to visual feedback values
 * that can be used to animate custom refresh indicators.
 *
 * Uses Reanimated 3 worklets for 60fps UI thread animations.
 */

import { useCallback, useRef } from 'react';
import {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withTiming,
  interpolate,
  Extrapolation,
  runOnJS,
  useDerivedValue,
  SharedValue,
  DerivedValue,
} from 'react-native-reanimated';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import * as Haptics from 'expo-haptics';

// ============================================================================
// Types
// ============================================================================

export interface UsePullToRefreshConfig {
  /** Distance in pixels required to trigger refresh (default: 60) */
  refreshThreshold?: number;
  /** Maximum pull distance for visual effects (default: 100) */
  maxPullDistance?: number;
  /** Whether to enable haptic feedback at threshold (default: true) */
  enableHaptics?: boolean;
  /** Callback when refresh threshold is reached */
  onThresholdReached?: () => void;
}

export interface UsePullToRefreshReturn {
  /** Progress value from 0 to 1 based on pull distance */
  pullProgress: DerivedValue<number>;
  /** Whether the user has pulled past the refresh threshold */
  isOverThreshold: DerivedValue<boolean>;
  /** Whether refresh is currently in progress */
  isRefreshing: SharedValue<boolean>;
  /** Rotation angle for spin animation (degrees) */
  rotation: SharedValue<number>;
  /** Handler to attach to FlatList onScroll */
  handleScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  /** Call this when refresh starts */
  startRefresh: () => void;
  /** Call this when refresh ends */
  endRefresh: () => void;
  /** Animated style for the pull indicator container */
  pullIndicatorStyle: ReturnType<typeof useAnimatedStyle>;
  /** Animated style for the fill level (0-100% height) */
  fillStyle: ReturnType<typeof useAnimatedStyle>;
  /** Animated style for the rotation during refresh */
  rotationStyle: ReturnType<typeof useAnimatedStyle>;
  /** Animated style for glow effect during refresh */
  glowStyle: ReturnType<typeof useAnimatedStyle>;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_REFRESH_THRESHOLD = 60;
const DEFAULT_MAX_PULL_DISTANCE = 100;

/** Spring config for smooth animations */
const SPRING_CONFIG = {
  damping: 20,
  stiffness: 200,
  mass: 1,
};

/** Rotation speed during refresh (ms for full rotation) */
const ROTATION_DURATION = 2000;

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook that provides animated values and handlers for custom pull-to-refresh
 * implementations.
 *
 * @example
 * ```tsx
 * const {
 *   handleScroll,
 *   pullIndicatorStyle,
 *   fillStyle,
 *   rotationStyle,
 *   startRefresh,
 *   endRefresh,
 * } = usePullToRefresh({
 *   refreshThreshold: 60,
 *   enableHaptics: true,
 * });
 *
 * // In your FlatList:
 * <FlatList
 *   onScroll={handleScroll}
 *   scrollEventThrottle={16}
 * />
 *
 * // In your refresh header:
 * <Animated.View style={[styles.indicator, pullIndicatorStyle]}>
 *   <Animated.View style={[styles.fill, fillStyle]} />
 * </Animated.View>
 * ```
 */
export function usePullToRefresh(config: UsePullToRefreshConfig = {}): UsePullToRefreshReturn {
  const {
    refreshThreshold = DEFAULT_REFRESH_THRESHOLD,
    maxPullDistance = DEFAULT_MAX_PULL_DISTANCE,
    enableHaptics = true,
    onThresholdReached,
  } = config;

  // Track whether we've already triggered haptic for this pull gesture
  const hasTriggeredHaptic = useRef(false);

  // Shared values for animations (run on UI thread)
  const pullDistance = useSharedValue(0);
  const isRefreshing = useSharedValue(false);
  const rotation = useSharedValue(0);

  // Derived value for pull progress (0 to 1)
  const pullProgress = useDerivedValue(() => {
    return interpolate(
      pullDistance.value,
      [0, refreshThreshold, maxPullDistance],
      [0, 1, 1.2],
      Extrapolation.CLAMP
    );
  });

  // Derived value for whether over threshold
  const isOverThreshold = useDerivedValue(() => {
    return pullDistance.value >= refreshThreshold;
  });

  // Trigger haptic feedback on JS thread
  const triggerHaptic = useCallback(() => {
    if (enableHaptics && !hasTriggeredHaptic.current) {
      hasTriggeredHaptic.current = true;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onThresholdReached?.();
    }
  }, [enableHaptics, onThresholdReached]);

  // Reset haptic trigger flag
  const resetHapticTrigger = useCallback(() => {
    hasTriggeredHaptic.current = false;
  }, []);

  // Handle scroll events to track pull distance
  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset } = event.nativeEvent;

      // Only track when scrolled above content (negative offset = pulling down)
      if (contentOffset.y < 0 && !isRefreshing.value) {
        const newPullDistance = Math.abs(contentOffset.y);
        pullDistance.value = newPullDistance;

        // Check if we crossed the threshold
        if (newPullDistance >= refreshThreshold && !hasTriggeredHaptic.current) {
          runOnJS(triggerHaptic)();
        }
      } else if (contentOffset.y >= 0) {
        // Reset when scrolled back to normal position
        if (pullDistance.value !== 0) {
          pullDistance.value = 0;
          runOnJS(resetHapticTrigger)();
        }
      }
    },
    [pullDistance, isRefreshing, refreshThreshold, triggerHaptic, resetHapticTrigger]
  );

  // Start refresh state
  const startRefresh = useCallback(() => {
    isRefreshing.value = true;
    // Start continuous rotation animation
    rotation.value = 0;
    rotation.value = withRepeat(
      withTiming(360, { duration: ROTATION_DURATION }),
      -1, // Infinite
      false // Don't reverse
    );
  }, [isRefreshing, rotation]);

  // End refresh state
  const endRefresh = useCallback(() => {
    isRefreshing.value = false;
    // Stop rotation with a smooth settle
    rotation.value = withSpring(0, SPRING_CONFIG);
    // Reset pull distance
    pullDistance.value = withSpring(0, SPRING_CONFIG);
    // Reset haptic trigger
    hasTriggeredHaptic.current = false;
  }, [isRefreshing, rotation, pullDistance]);

  // Animated style for the pull indicator container
  const pullIndicatorStyle = useAnimatedStyle(() => {
    const translateY = interpolate(
      pullDistance.value,
      [0, refreshThreshold, maxPullDistance],
      [-40, 0, 20],
      Extrapolation.CLAMP
    );

    const opacity = interpolate(
      pullDistance.value,
      [0, refreshThreshold * 0.3, refreshThreshold],
      [0, 0.5, 1],
      Extrapolation.CLAMP
    );

    return {
      opacity: isRefreshing.value ? 1 : opacity,
      transform: [{ translateY: isRefreshing.value ? 0 : translateY }],
    };
  });

  // Animated style for the fill level
  const fillStyle = useAnimatedStyle(() => {
    const fillPercent = interpolate(pullProgress.value, [0, 1], [0, 100], Extrapolation.CLAMP);

    return {
      height: `${fillPercent}%`,
    };
  });

  // Animated style for rotation during refresh
  const rotationStyle = useAnimatedStyle(() => {
    return {
      transform: [{ rotate: `${rotation.value}deg` }],
    };
  });

  // Animated style for glow effect
  const glowStyle = useAnimatedStyle(() => {
    const glowOpacity = isRefreshing.value
      ? interpolate(
          Math.sin(rotation.value * (Math.PI / 180)),
          [-1, 1],
          [0.3, 0.8],
          Extrapolation.CLAMP
        )
      : 0;

    return {
      opacity: glowOpacity,
    };
  });

  return {
    pullProgress,
    isOverThreshold,
    isRefreshing,
    rotation,
    handleScroll,
    startRefresh,
    endRefresh,
    pullIndicatorStyle,
    fillStyle,
    rotationStyle,
    glowStyle,
  };
}

export default usePullToRefresh;
