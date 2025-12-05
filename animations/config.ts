/**
 * Animation Configuration Module
 *
 * Provides centralized, performance-optimized animation configurations
 * for the BeerSelector app. All animations are designed to run on the
 * UI thread via React Native Reanimated worklets for 60fps performance.
 *
 * @module animations/config
 *
 * Performance Targets:
 * - All animations at 60fps (16.67ms per frame)
 * - No dropped frames on iPhone 11 or equivalent
 * - Memory efficient (no leaks from shared values)
 *
 * Usage:
 * ```typescript
 * import { springConfigs, timingConfigs, easings } from '@/animations';
 *
 * // Using spring animation
 * const animation = withSpring(targetValue, springConfigs.responsive);
 *
 * // Using timing animation
 * const animation = withTiming(targetValue, {
 *   ...timingConfigs.normal,
 *   easing: easings.smooth,
 * });
 * ```
 */

import { Easing, WithSpringConfig, WithTimingConfig } from 'react-native-reanimated';

// ============================================================================
// Spring Configurations
// ============================================================================

/**
 * Spring animation configurations for different use cases.
 *
 * Physics-based springs provide natural motion and are preferred for
 * interactive animations (gestures, responses to user input).
 *
 * @remarks
 * - `gentle`: Slow, smooth transitions for subtle UI updates
 * - `responsive`: Balanced feel for most interactive elements
 * - `bouncy`: Energetic animations for attention-grabbing elements
 * - `snappy`: Quick, precise movements for micro-interactions
 *
 * @example
 * ```typescript
 * // Gentle slide animation
 * translateX.value = withSpring(100, springConfigs.gentle);
 *
 * // Responsive button press
 * scale.value = withSpring(0.95, springConfigs.responsive);
 *
 * // Bouncy entrance animation
 * scale.value = withSpring(1, springConfigs.bouncy);
 * ```
 */
export const springConfigs = {
  /**
   * Gentle spring - slow, smooth, no overshoot
   * Best for: Subtle transitions, background elements, layout changes
   */
  gentle: {
    damping: 20,
    stiffness: 100,
    mass: 1,
    overshootClamping: false,
    restDisplacementThreshold: 0.01,
    restSpeedThreshold: 0.01,
  } as WithSpringConfig,

  /**
   * Responsive spring - balanced feel for most interactions
   * Best for: Interactive elements, buttons, toggles, sliders
   */
  responsive: {
    damping: 15,
    stiffness: 150,
    mass: 1,
    overshootClamping: false,
    restDisplacementThreshold: 0.01,
    restSpeedThreshold: 0.01,
  } as WithSpringConfig,

  /**
   * Bouncy spring - energetic with visible overshoot
   * Best for: Success states, attention-grabbing elements, playful UI
   */
  bouncy: {
    damping: 10,
    stiffness: 200,
    mass: 1,
    overshootClamping: false,
    restDisplacementThreshold: 0.01,
    restSpeedThreshold: 0.01,
  } as WithSpringConfig,

  /**
   * Snappy spring - quick, precise, minimal overshoot
   * Best for: Micro-interactions, quick state changes, haptic responses
   */
  snappy: {
    damping: 20,
    stiffness: 300,
    mass: 0.8,
    overshootClamping: false,
    restDisplacementThreshold: 0.01,
    restSpeedThreshold: 0.01,
  } as WithSpringConfig,

  /**
   * Stiff spring - immediate response with controlled settling
   * Best for: Immediate feedback, critical state changes
   */
  stiff: {
    damping: 25,
    stiffness: 400,
    mass: 0.5,
    overshootClamping: true,
    restDisplacementThreshold: 0.01,
    restSpeedThreshold: 0.01,
  } as WithSpringConfig,
} as const;

// ============================================================================
// Timing Configurations
// ============================================================================

/**
 * Timing animation configurations for duration-based animations.
 *
 * Use timing animations when you need precise control over duration,
 * such as coordinated multi-element animations or when matching
 * design specifications with exact timings.
 *
 * @remarks
 * - `instant`: Near-immediate transitions (haptic feedback level)
 * - `fast`: Quick transitions for responsive UI
 * - `normal`: Standard duration for most animations
 * - `slow`: Longer duration for dramatic effects
 * - `emphasis`: Extended duration for important state changes
 *
 * @example
 * ```typescript
 * // Quick fade
 * opacity.value = withTiming(1, timingConfigs.fast);
 *
 * // Normal transition with easing
 * translateY.value = withTiming(0, {
 *   ...timingConfigs.normal,
 *   easing: easings.smooth,
 * });
 * ```
 */
export const timingConfigs = {
  /**
   * Instant - nearly immediate (50ms)
   * Best for: Haptic-level feedback, micro-state changes
   */
  instant: {
    duration: 50,
  } as WithTimingConfig,

  /**
   * Fast - quick transitions (150ms)
   * Best for: Hover states, selection changes, quick feedback
   */
  fast: {
    duration: 150,
  } as WithTimingConfig,

  /**
   * Normal - standard duration (250ms)
   * Best for: Most transitions, modal appearances, page transitions
   */
  normal: {
    duration: 250,
  } as WithTimingConfig,

  /**
   * Slow - deliberate transitions (400ms)
   * Best for: Important state changes, dramatic reveals
   */
  slow: {
    duration: 400,
  } as WithTimingConfig,

  /**
   * Emphasis - extended duration (600ms)
   * Best for: Onboarding animations, celebration effects
   */
  emphasis: {
    duration: 600,
  } as WithTimingConfig,

  /**
   * Shimmer - optimized for skeleton loading (1500ms)
   * Best for: Loading states, shimmer effects
   */
  shimmer: {
    duration: 1500,
  } as WithTimingConfig,
} as const;

// ============================================================================
// Easing Presets
// ============================================================================

/**
 * Easing function presets for timing animations.
 *
 * Easing functions define the rate of change over time, creating
 * natural-feeling motion that follows physical principles.
 *
 * @remarks
 * - `default`: Standard ease-in-out for balanced motion
 * - `smooth`: Cubic ease-out for smooth deceleration
 * - `snap`: Quad ease-in-out for snappy feel
 * - `decelerate`: Expo ease-out for dramatic slowdown
 * - `accelerate`: Expo ease-in for building momentum
 * - `linear`: Constant speed (use sparingly)
 *
 * @example
 * ```typescript
 * // Smooth slide out
 * translateX.value = withTiming(100, {
 *   duration: 250,
 *   easing: easings.smooth,
 * });
 *
 * // Snappy toggle
 * rotation.value = withTiming(180, {
 *   duration: 150,
 *   easing: easings.snap,
 * });
 * ```
 */
export const easings = {
  /**
   * Default - standard Material/iOS feel
   * Bezier curve: cubic-bezier(0.25, 0.1, 0.25, 1)
   */
  default: Easing.bezier(0.25, 0.1, 0.25, 1),

  /**
   * Smooth - gentle deceleration
   * Best for: Elements coming to rest
   */
  smooth: Easing.out(Easing.cubic),

  /**
   * Snap - quick and precise
   * Best for: Toggle states, micro-interactions
   */
  snap: Easing.inOut(Easing.quad),

  /**
   * Decelerate - dramatic slowdown
   * Best for: Elements sliding into view
   */
  decelerate: Easing.out(Easing.exp),

  /**
   * Accelerate - building momentum
   * Best for: Elements leaving view
   */
  accelerate: Easing.in(Easing.exp),

  /**
   * Bounce - elastic ending
   * Best for: Playful elements, success states
   */
  bounce: Easing.bounce,

  /**
   * Linear - constant speed
   * Best for: Continuous animations (shimmer, progress)
   * Note: Use sparingly - most UI animations benefit from easing
   */
  linear: Easing.linear,
} as const;

// ============================================================================
// Animation Durations
// ============================================================================

/**
 * Standard animation durations in milliseconds.
 *
 * Use these constants when you need duration values outside of
 * the timing configs, such as for delays or custom animations.
 *
 * @example
 * ```typescript
 * // Staggered animation delay
 * const delay = index * durations.stagger;
 *
 * // Custom sequence timing
 * runOnJS(callback)(durations.normal);
 * ```
 */
export const durations = {
  /** Instant feedback (50ms) */
  instant: 50,
  /** Fast transitions (150ms) */
  fast: 150,
  /** Normal transitions (250ms) */
  normal: 250,
  /** Slow, deliberate (400ms) */
  slow: 400,
  /** Emphasis animations (600ms) */
  emphasis: 600,
  /** Shimmer cycle (1500ms) */
  shimmer: 1500,
  /** Stagger delay between items (50ms) */
  stagger: 50,
  /** Maximum stagger delay (500ms) - caps stagger for long lists */
  staggerMax: 500,
} as const;

// ============================================================================
// List Animation Constants
// ============================================================================

/**
 * Configuration for list item enter animations.
 *
 * These values are optimized for FlatList animations where items
 * enter as they become visible. The stagger is capped to prevent
 * excessively long delays for items deep in the list.
 *
 * @example
 * ```typescript
 * const delay = Math.min(
 *   index * listAnimationConfig.staggerDelay,
 *   listAnimationConfig.maxStaggerDelay
 * );
 * ```
 */
export const listAnimationConfig = {
  /** Initial translateY offset for enter animation */
  enterOffset: 20,
  /** Duration for enter fade/slide */
  enterDuration: 250,
  /** Delay between consecutive items */
  staggerDelay: 50,
  /** Maximum stagger delay to cap long lists */
  maxStaggerDelay: 300,
  /** Number of items to animate at once in viewport */
  maxAnimatedItems: 10,
  /** Easing for list item enter */
  enterEasing: Easing.out(Easing.cubic),
} as const;

// ============================================================================
// Type Exports
// ============================================================================

/** Type for spring configuration keys */
export type SpringConfigKey = keyof typeof springConfigs;

/** Type for timing configuration keys */
export type TimingConfigKey = keyof typeof timingConfigs;

/** Type for easing keys */
export type EasingKey = keyof typeof easings;

/** Type for duration keys */
export type DurationKey = keyof typeof durations;
