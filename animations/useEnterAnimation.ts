/**
 * Enter Animation Hook for List Items
 *
 * Provides performant enter animations for FlatList items with staggered
 * delays. Optimized for large lists by only animating visible items
 * and using UI thread worklets for 60fps performance.
 *
 * @module animations/useEnterAnimation
 *
 * Features:
 * - Fade + slide from bottom enter animation
 * - Staggered delays based on item index
 * - Respects reduced motion preference
 * - Memory efficient - no leaks from shared values
 * - Optimized for large lists (caps animation count)
 *
 * Usage:
 * ```typescript
 * import { useEnterAnimation } from '@/animations';
 *
 * function ListItem({ index }: { index: number }) {
 *   const { animatedStyle, triggerEnter } = useEnterAnimation({ index });
 *
 *   useEffect(() => {
 *     triggerEnter();
 *   }, []);
 *
 *   return <Animated.View style={animatedStyle}>...</Animated.View>;
 * }
 * ```
 */

import { useCallback, useEffect, useRef } from 'react';
import {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSpring,
  runOnJS,
  cancelAnimation,
  type SharedValue,
} from 'react-native-reanimated';
import { listAnimationConfig, springConfigs, timingConfigs, easings } from './config';
import { useAnimationConfig } from './useReducedMotion';

// ============================================================================
// Types
// ============================================================================

/**
 * Options for the enter animation hook.
 */
export type UseEnterAnimationOptions = {
  /** Index of the item in the list (for stagger calculation) */
  index: number;
  /** Whether to auto-trigger on mount (default: false) */
  autoTrigger?: boolean;
  /** Custom enter offset in pixels (default: 20) */
  enterOffset?: number;
  /** Custom duration in ms (default: 250) */
  duration?: number;
  /** Custom stagger delay in ms (default: 50) */
  staggerDelay?: number;
  /** Use spring instead of timing (default: false) */
  useSpring?: boolean;
  /** Callback when animation completes */
  onComplete?: () => void;
};

/**
 * Return type for the enter animation hook.
 */
export type UseEnterAnimationReturn = {
  /** Animated style to apply to the component */
  animatedStyle: ReturnType<typeof useAnimatedStyle>;
  /** Function to trigger the enter animation */
  triggerEnter: () => void;
  /** Function to reset to initial state */
  reset: () => void;
  /** Whether the animation has completed */
  hasEntered: SharedValue<boolean>;
  /** Current opacity value */
  opacity: SharedValue<number>;
  /** Current translateY value */
  translateY: SharedValue<number>;
};

/**
 * Options for the list enter animation manager.
 */
export type UseListEnterAnimationOptions = {
  /** Total number of items in the list */
  itemCount: number;
  /** Whether to animate on initial render (default: true) */
  animateOnMount?: boolean;
  /** Maximum items to animate (default: 10) */
  maxAnimatedItems?: number;
  /** Custom stagger delay (default: 50ms) */
  staggerDelay?: number;
};

/**
 * Return type for list enter animation manager.
 */
export type UseListEnterAnimationReturn = {
  /** Get animation props for a specific item */
  getItemAnimationProps: (index: number) => {
    animatedStyle: ReturnType<typeof useAnimatedStyle>;
    triggerEnter: () => void;
  };
  /** Trigger all visible items to animate */
  triggerAllVisible: (visibleIndices: number[]) => void;
  /** Reset all animations */
  resetAll: () => void;
};

// ============================================================================
// useEnterAnimation Hook
// ============================================================================

/**
 * Hook for individual list item enter animations.
 *
 * Provides a fade + slide from bottom animation with staggered delay
 * based on the item's index. Optimized for 60fps by running all
 * animations on the UI thread.
 *
 * @param options - Configuration options
 * @returns Animation controls and animated style
 *
 * @example
 * ```typescript
 * function BeerItem({ beer, index }: { beer: Beer; index: number }) {
 *   const { animatedStyle, triggerEnter } = useEnterAnimation({
 *     index,
 *     autoTrigger: true,
 *     onComplete: () => console.log('Animation complete'),
 *   });
 *
 *   return (
 *     <Animated.View style={[styles.card, animatedStyle]}>
 *       <Text>{beer.name}</Text>
 *     </Animated.View>
 *   );
 * }
 * ```
 */
export function useEnterAnimation(options: UseEnterAnimationOptions): UseEnterAnimationReturn {
  const {
    index,
    autoTrigger = false,
    enterOffset = listAnimationConfig.enterOffset,
    duration = listAnimationConfig.enterDuration,
    staggerDelay = listAnimationConfig.staggerDelay,
    useSpring: useSpringAnim = false,
    onComplete,
  } = options;

  const { isReducedMotion, shouldAnimate } = useAnimationConfig();

  // Shared values for animation - initialized based on reduced motion
  const opacity = useSharedValue(shouldAnimate ? 0 : 1);
  const translateY = useSharedValue(shouldAnimate ? enterOffset : 0);
  const hasEntered = useSharedValue(!shouldAnimate);

  // Track if component is mounted to prevent memory leaks
  const isMounted = useRef(true);

  // Calculate stagger delay (capped to prevent excessive delays)
  const getStaggerDelay = useCallback(() => {
    if (isReducedMotion) return 0;
    const cappedIndex = Math.min(index, listAnimationConfig.maxAnimatedItems);
    return Math.min(cappedIndex * staggerDelay, listAnimationConfig.maxStaggerDelay);
  }, [index, staggerDelay, isReducedMotion]);

  // Callback wrapper for completion
  const handleComplete = useCallback(() => {
    if (isMounted.current && onComplete) {
      onComplete();
    }
  }, [onComplete]);

  // Trigger enter animation
  const triggerEnter = useCallback(() => {
    if (!shouldAnimate) {
      // Instant transition for reduced motion
      opacity.value = 1;
      translateY.value = 0;
      hasEntered.value = true;
      if (onComplete) {
        runOnJS(handleComplete)();
      }
      return;
    }

    const delay = getStaggerDelay();

    if (useSpringAnim) {
      // Spring-based animation
      opacity.value = withDelay(delay, withTiming(1, { duration, easing: easings.smooth }));
      translateY.value = withDelay(
        delay,
        withSpring(0, springConfigs.responsive, finished => {
          if (finished) {
            hasEntered.value = true;
            if (onComplete) {
              runOnJS(handleComplete)();
            }
          }
        })
      );
    } else {
      // Timing-based animation (default)
      opacity.value = withDelay(delay, withTiming(1, { duration, easing: easings.smooth }));
      translateY.value = withDelay(
        delay,
        withTiming(0, { duration, easing: listAnimationConfig.enterEasing }, finished => {
          if (finished) {
            hasEntered.value = true;
            if (onComplete) {
              runOnJS(handleComplete)();
            }
          }
        })
      );
    }
  }, [
    shouldAnimate,
    getStaggerDelay,
    useSpringAnim,
    duration,
    opacity,
    translateY,
    hasEntered,
    onComplete,
    handleComplete,
  ]);

  // Reset animation to initial state
  const reset = useCallback(() => {
    cancelAnimation(opacity);
    cancelAnimation(translateY);
    opacity.value = shouldAnimate ? 0 : 1;
    translateY.value = shouldAnimate ? enterOffset : 0;
    hasEntered.value = !shouldAnimate;
  }, [shouldAnimate, enterOffset, opacity, translateY, hasEntered]);

  // Animated style that combines opacity and transform
  const animatedStyle = useAnimatedStyle(() => {
    return {
      opacity: opacity.value,
      transform: [{ translateY: translateY.value }],
    };
  });

  // Auto-trigger on mount if enabled
  useEffect(() => {
    if (autoTrigger) {
      triggerEnter();
    }
  }, [autoTrigger, triggerEnter]);

  // Cleanup on unmount
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      cancelAnimation(opacity);
      cancelAnimation(translateY);
    };
  }, [opacity, translateY]);

  return {
    animatedStyle,
    triggerEnter,
    reset,
    hasEntered,
    opacity,
    translateY,
  };
}

// ============================================================================
// useFadeEnterAnimation Hook (Simplified version)
// ============================================================================

/**
 * Options for the fade enter animation hook.
 */
export type UseFadeEnterOptions = {
  /** Index for stagger calculation */
  index?: number;
  /** Auto-trigger on mount (default: true) */
  autoTrigger?: boolean;
  /** Animation duration in ms (default: 250) */
  duration?: number;
};

/**
 * Simplified fade-only enter animation.
 *
 * Use this for simpler animations where only opacity transition is needed.
 * More performant than the full enter animation for large lists.
 *
 * @param options - Configuration options
 * @returns Animated style and trigger function
 *
 * @example
 * ```typescript
 * function SimpleItem({ index }: { index: number }) {
 *   const { animatedStyle } = useFadeEnterAnimation({ index });
 *   return <Animated.View style={animatedStyle}>...</Animated.View>;
 * }
 * ```
 */
export function useFadeEnterAnimation(options: UseFadeEnterOptions = {}) {
  const { index = 0, autoTrigger = true, duration = listAnimationConfig.enterDuration } = options;

  const { isReducedMotion, shouldAnimate } = useAnimationConfig();
  const opacity = useSharedValue(shouldAnimate ? 0 : 1);

  const staggerDelay = isReducedMotion
    ? 0
    : Math.min(index * listAnimationConfig.staggerDelay, listAnimationConfig.maxStaggerDelay);

  const triggerEnter = useCallback(() => {
    if (!shouldAnimate) {
      opacity.value = 1;
      return;
    }

    opacity.value = withDelay(staggerDelay, withTiming(1, { duration, easing: easings.smooth }));
  }, [shouldAnimate, staggerDelay, duration, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  useEffect(() => {
    if (autoTrigger) {
      triggerEnter();
    }
  }, [autoTrigger, triggerEnter]);

  useEffect(() => {
    return () => {
      cancelAnimation(opacity);
    };
  }, [opacity]);

  return { animatedStyle, triggerEnter, opacity };
}

// ============================================================================
// useScaleEnterAnimation Hook
// ============================================================================

/**
 * Options for the scale enter animation hook.
 */
export type UseScaleEnterOptions = {
  /** Index for stagger calculation */
  index?: number;
  /** Auto-trigger on mount (default: true) */
  autoTrigger?: boolean;
  /** Initial scale (default: 0.9) */
  initialScale?: number;
};

/**
 * Scale + fade enter animation.
 *
 * Creates a subtle "pop-in" effect by combining scale and opacity.
 * Good for cards, buttons, and interactive elements.
 *
 * @param options - Configuration options
 * @returns Animated style and trigger function
 *
 * @example
 * ```typescript
 * function Card({ index }: { index: number }) {
 *   const { animatedStyle } = useScaleEnterAnimation({
 *     index,
 *     initialScale: 0.85,
 *   });
 *
 *   return <Animated.View style={[styles.card, animatedStyle]}>...</Animated.View>;
 * }
 * ```
 */
export function useScaleEnterAnimation(options: UseScaleEnterOptions = {}) {
  const { index = 0, autoTrigger = true, initialScale = 0.9 } = options;

  const { isReducedMotion, shouldAnimate } = useAnimationConfig();
  const opacity = useSharedValue(shouldAnimate ? 0 : 1);
  const scale = useSharedValue(shouldAnimate ? initialScale : 1);

  const staggerDelay = isReducedMotion
    ? 0
    : Math.min(index * listAnimationConfig.staggerDelay, listAnimationConfig.maxStaggerDelay);

  const triggerEnter = useCallback(() => {
    if (!shouldAnimate) {
      opacity.value = 1;
      scale.value = 1;
      return;
    }

    opacity.value = withDelay(staggerDelay, withTiming(1, timingConfigs.normal));
    scale.value = withDelay(staggerDelay, withSpring(1, springConfigs.responsive));
  }, [shouldAnimate, staggerDelay, opacity, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  useEffect(() => {
    if (autoTrigger) {
      triggerEnter();
    }
  }, [autoTrigger, triggerEnter]);

  useEffect(() => {
    return () => {
      cancelAnimation(opacity);
      cancelAnimation(scale);
    };
  }, [opacity, scale]);

  return { animatedStyle, triggerEnter, opacity, scale };
}

// ============================================================================
// Utility: getVisibleItemIndices
// ============================================================================

/**
 * Extracts visible item indices from FlatList's onViewableItemsChanged callback.
 *
 * Use this with FlatList's viewability config to efficiently animate
 * only visible items.
 *
 * @param viewableItems - Array from onViewableItemsChanged callback
 * @returns Array of visible item indices
 *
 * @example
 * ```typescript
 * const handleViewableItemsChanged = useCallback(
 *   ({ viewableItems }: { viewableItems: ViewToken[] }) => {
 *     const indices = getVisibleItemIndices(viewableItems);
 *     animationManager.triggerAllVisible(indices);
 *   },
 *   []
 * );
 * ```
 */
export function getVisibleItemIndices(
  viewableItems: { index: number | null; isViewable: boolean }[]
): number[] {
  return viewableItems
    .filter(item => item.isViewable && item.index !== null)
    .map(item => item.index as number);
}

/**
 * FlatList viewability configuration optimized for enter animations.
 *
 * Use this with FlatList's viewabilityConfig prop for consistent
 * animation triggering.
 *
 * @example
 * ```typescript
 * <FlatList
 *   viewabilityConfig={viewabilityConfig}
 *   onViewableItemsChanged={handleViewableItemsChanged}
 *   // ...
 * />
 * ```
 */
export const viewabilityConfig = {
  /** Minimum percentage of item that must be visible */
  itemVisiblePercentThreshold: 30,
  /** Minimum time item must be visible before callback fires */
  minimumViewTime: 100,
  /** Wait for interaction before triggering (improves performance) */
  waitForInteraction: false,
} as const;
