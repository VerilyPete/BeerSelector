/**
 * Animation Module - Barrel Export
 *
 * Centralized animation configuration and hooks for the BeerSelector app.
 * All animations are optimized for 60fps performance on the UI thread
 * and respect the user's reduced motion accessibility preference.
 *
 * @module animations
 *
 * @example
 * ```typescript
 * // Import animation configs
 * import { springConfigs, timingConfigs, easings } from '@/animations';
 *
 * // Use spring animation
 * scale.value = withSpring(1, springConfigs.responsive);
 *
 * // Use timing animation with easing
 * opacity.value = withTiming(1, {
 *   ...timingConfigs.normal,
 *   easing: easings.smooth,
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Use animation hooks with accessibility support
 * import { useAnimationConfig, useEnterAnimation } from '@/animations';
 *
 * function MyComponent({ index }: { index: number }) {
 *   const { shouldAnimate, getSpring } = useAnimationConfig();
 *   const { animatedStyle } = useEnterAnimation({ index, autoTrigger: true });
 *
 *   return <Animated.View style={animatedStyle}>...</Animated.View>;
 * }
 * ```
 *
 * Performance Features:
 * - All animations run on UI thread via Reanimated worklets
 * - Respects system reduced motion preference
 * - Memory efficient with proper cleanup
 * - Optimized spring/timing configs for smooth 60fps
 */

// ============================================================================
// Configuration Exports
// ============================================================================

export {
  // Spring configurations for physics-based animations
  springConfigs,
  // Timing configurations for duration-based animations
  timingConfigs,
  // Easing function presets
  easings,
  // Duration constants in milliseconds
  durations,
  // List animation configuration
  listAnimationConfig,
  // Type exports
  type SpringConfigKey,
  type TimingConfigKey,
  type EasingKey,
  type DurationKey,
} from './config';

// ============================================================================
// Reduced Motion Exports
// ============================================================================

export {
  // Primary hook for animation config with reduced motion support
  useAnimationConfig,
  // Low-level hook for reduced motion preference
  useReducedMotionPreference,
  // Utility for creating animation config (worklet-safe)
  createAnimationConfig,
  // Worklet-safe config getters
  getSpringConfig,
  getTimingConfig,
  // Reduced motion fallback configs
  reducedMotionSpring,
  reducedMotionTiming,
  // Type exports
  type ReducedMotionConfig,
  type AnimationConfig,
} from './useReducedMotion';

// ============================================================================
// Enter Animation Exports
// ============================================================================

export {
  // Primary hook for list item enter animations
  useEnterAnimation,
  // Simplified fade-only enter animation
  useFadeEnterAnimation,
  // Scale + fade enter animation
  useScaleEnterAnimation,
  // Utility for extracting visible indices from FlatList
  getVisibleItemIndices,
  // FlatList viewability config
  viewabilityConfig,
  // Type exports
  type UseEnterAnimationOptions,
  type UseEnterAnimationReturn,
  type UseFadeEnterOptions,
  type UseScaleEnterOptions,
  type UseListEnterAnimationOptions,
  type UseListEnterAnimationReturn,
} from './useEnterAnimation';

// ============================================================================
// Press Animation Exports
// ============================================================================

export {
  useAnimatedPress,
  type UseAnimatedPressReturn,
  type UseAnimatedPressConfig,
} from './useAnimatedPress';

// ============================================================================
// Expand/Collapse Animation Exports
// ============================================================================

export {
  useAnimatedExpand,
  useAnimatedChevron,
  type UseAnimatedExpandReturn,
  type UseAnimatedExpandConfig,
  type UseAnimatedChevronReturn,
  type UseAnimatedChevronConfig,
} from './useAnimatedExpand';

// ============================================================================
// Pull-to-Refresh Animation Exports
// ============================================================================

export {
  usePullToRefresh,
  type UsePullToRefreshConfig,
  type UsePullToRefreshReturn,
} from './usePullToRefresh';
