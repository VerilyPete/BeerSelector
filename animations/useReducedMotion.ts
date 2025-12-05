/**
 * Reduced Motion Hook
 *
 * Provides accessibility support by respecting the user's system preference
 * for reduced motion. When enabled, animations are simplified or disabled
 * to accommodate users with vestibular disorders or motion sensitivity.
 *
 * @module animations/useReducedMotion
 *
 * Features:
 * - Automatically detects system reduced motion preference
 * - Provides animation config overrides for reduced motion mode
 * - Uses React Native Reanimated's built-in hook for performance
 * - Returns worklet-safe values for UI thread usage
 *
 * Usage:
 * ```typescript
 * import { useAnimationConfig } from '@/animations';
 *
 * function MyComponent() {
 *   const { shouldAnimate, getSpring, getTiming } = useAnimationConfig();
 *
 *   const animatedStyle = useAnimatedStyle(() => ({
 *     opacity: withTiming(1, getTiming('normal')),
 *     transform: shouldAnimate
 *       ? [{ translateY: withSpring(0, getSpring('responsive')) }]
 *       : [],
 *   }));
 * }
 * ```
 */

import { useReducedMotion as useReanimatedReducedMotion } from 'react-native-reanimated';
import {
  springConfigs,
  timingConfigs,
  easings,
  durations,
  type SpringConfigKey,
  type TimingConfigKey,
} from './config';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for animations when reduced motion is enabled.
 * All animations either complete instantly or are disabled.
 */
export type ReducedMotionConfig = {
  /** Whether animations should play (false when reduced motion is on) */
  shouldAnimate: boolean;
  /** Whether to use instant transitions instead of animations */
  useInstantTransitions: boolean;
  /** Duration override for reduced motion (instant) */
  duration: number;
};

/**
 * Animation configuration hook return type.
 */
export type AnimationConfig = {
  /** Whether reduced motion is enabled */
  isReducedMotion: boolean;
  /** Whether animations should play */
  shouldAnimate: boolean;
  /** Get spring config with reduced motion fallback */
  getSpring: (key: SpringConfigKey) => (typeof springConfigs)[SpringConfigKey];
  /** Get timing config with reduced motion fallback */
  getTiming: (key: TimingConfigKey) => (typeof timingConfigs)[TimingConfigKey];
  /** Get the appropriate duration (instant for reduced motion) */
  getDuration: (key: keyof typeof durations) => number;
  /** Reduced motion specific config */
  reducedMotion: ReducedMotionConfig;
};

// ============================================================================
// Reduced Motion Spring Config
// ============================================================================

/**
 * Spring configuration optimized for reduced motion.
 * Provides instant settling with no overshoot.
 */
const reducedMotionSpring = {
  damping: 100,
  stiffness: 1000,
  mass: 0.5,
  overshootClamping: true,
  restDisplacementThreshold: 0.01,
  restSpeedThreshold: 0.01,
} as const;

/**
 * Timing configuration for reduced motion.
 * Instant transition with no perceptible animation.
 */
const reducedMotionTiming = {
  duration: 0,
  easing: easings.linear,
} as const;

// ============================================================================
// useReducedMotionPreference Hook
// ============================================================================

/**
 * Low-level hook that returns the raw reduced motion preference.
 *
 * This hook wraps Reanimated's useReducedMotion for consistency
 * and to provide a unified API across the app.
 *
 * @returns Whether the user has enabled reduced motion in system settings
 *
 * @example
 * ```typescript
 * const isReducedMotion = useReducedMotionPreference();
 *
 * if (isReducedMotion) {
 *   // Skip or simplify animation
 * }
 * ```
 */
export function useReducedMotionPreference(): boolean {
  const reducedMotion = useReanimatedReducedMotion();
  return reducedMotion;
}

// ============================================================================
// useAnimationConfig Hook
// ============================================================================

/**
 * Comprehensive animation configuration hook with reduced motion support.
 *
 * This is the primary hook for animation configuration in the app.
 * It provides animation configs that automatically adapt based on
 * the user's reduced motion preference.
 *
 * @returns Animation configuration object with methods for getting configs
 *
 * @example
 * ```typescript
 * function AnimatedCard() {
 *   const { shouldAnimate, getSpring, getTiming } = useAnimationConfig();
 *   const scale = useSharedValue(shouldAnimate ? 0.9 : 1);
 *
 *   useEffect(() => {
 *     scale.value = withSpring(1, getSpring('bouncy'));
 *   }, []);
 *
 *   const animatedStyle = useAnimatedStyle(() => ({
 *     transform: [{ scale: scale.value }],
 *   }));
 *
 *   return <Animated.View style={animatedStyle}>...</Animated.View>;
 * }
 * ```
 */
export function useAnimationConfig(): AnimationConfig {
  const isReducedMotion = useReducedMotionPreference();

  // Memoize config getters - these don't change during component lifecycle
  const getSpring = (key: SpringConfigKey) => {
    if (isReducedMotion) {
      return reducedMotionSpring;
    }
    return springConfigs[key];
  };

  const getTiming = (key: TimingConfigKey) => {
    if (isReducedMotion) {
      return reducedMotionTiming;
    }
    return timingConfigs[key];
  };

  const getDuration = (key: keyof typeof durations): number => {
    if (isReducedMotion) {
      return 0;
    }
    return durations[key];
  };

  const reducedMotion: ReducedMotionConfig = {
    shouldAnimate: !isReducedMotion,
    useInstantTransitions: isReducedMotion,
    duration: isReducedMotion ? 0 : durations.normal,
  };

  return {
    isReducedMotion,
    shouldAnimate: !isReducedMotion,
    getSpring,
    getTiming,
    getDuration,
    reducedMotion,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Creates an animation config that respects reduced motion.
 *
 * This is a utility for cases where you need to create a config
 * outside of a React component (e.g., in a worklet).
 *
 * @param isReducedMotion - Whether reduced motion is enabled
 * @returns Object with helper methods for getting configs
 *
 * @example
 * ```typescript
 * // In a worklet
 * const animConfig = createAnimationConfig(reduceMotion.value);
 * const spring = animConfig.spring('responsive');
 * ```
 */
export function createAnimationConfig(isReducedMotion: boolean) {
  return {
    spring: (key: SpringConfigKey) => (isReducedMotion ? reducedMotionSpring : springConfigs[key]),
    timing: (key: TimingConfigKey) => (isReducedMotion ? reducedMotionTiming : timingConfigs[key]),
    duration: (key: keyof typeof durations) => (isReducedMotion ? 0 : durations[key]),
    shouldAnimate: !isReducedMotion,
  };
}

/**
 * Worklet-compatible function to get spring config.
 *
 * Use this in worklets where you need to check reduced motion
 * status and get the appropriate config.
 *
 * @param key - Spring config key
 * @param isReducedMotion - Whether reduced motion is enabled
 * @returns Spring configuration object
 *
 * @example
 * ```typescript
 * const animatedStyle = useAnimatedStyle(() => {
 *   'worklet';
 *   const spring = getSpringConfig('responsive', reduceMotion.value);
 *   return {
 *     transform: [{ scale: withSpring(1, spring) }],
 *   };
 * });
 * ```
 */
export function getSpringConfig(key: SpringConfigKey, isReducedMotion: boolean) {
  'worklet';
  if (isReducedMotion) {
    return reducedMotionSpring;
  }
  return springConfigs[key];
}

/**
 * Worklet-compatible function to get timing config.
 *
 * @param key - Timing config key
 * @param isReducedMotion - Whether reduced motion is enabled
 * @returns Timing configuration object
 */
export function getTimingConfig(key: TimingConfigKey, isReducedMotion: boolean) {
  'worklet';
  if (isReducedMotion) {
    return reducedMotionTiming;
  }
  return timingConfigs[key];
}

// ============================================================================
// Constants Export
// ============================================================================

export { reducedMotionSpring, reducedMotionTiming };
