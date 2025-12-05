import { useEffect } from 'react';
import { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import type { ViewStyle } from 'react-native';

/**
 * Timing configuration for expand/collapse animations
 */
const TIMING_CONFIG = {
  duration: 250,
  easing: Easing.out(Easing.cubic),
};

/**
 * Hook return type for useAnimatedExpand
 */
export interface UseAnimatedExpandReturn {
  /** Animated style to apply to the expanding container */
  animatedStyle: ViewStyle;
  /** Current expansion progress (0-1) - useful for derived animations */
  progress: Readonly<{ value: number }>;
}

/**
 * Configuration options for useAnimatedExpand
 */
export interface UseAnimatedExpandConfig {
  /** Whether the content is expanded */
  isExpanded: boolean;
  /** The expanded height in pixels (optional - uses auto if not provided) */
  expandedHeight?: number;
  /** Animation duration in ms (default: 250) */
  duration?: number;
}

/**
 * A hook for animating expand/collapse transitions
 *
 * This hook provides smooth height and opacity animations for
 * expanding/collapsing content. It runs on the UI thread for
 * optimal performance.
 *
 * Note: For dynamic content heights, consider measuring the content
 * with onLayout and passing the measured height as expandedHeight.
 *
 * @example
 * ```tsx
 * function ExpandableContent({ isExpanded, children }) {
 *   const { animatedStyle } = useAnimatedExpand({ isExpanded });
 *
 *   return (
 *     <Animated.View style={[styles.content, animatedStyle]}>
 *       {children}
 *     </Animated.View>
 *   );
 * }
 * ```
 */
export function useAnimatedExpand(config: UseAnimatedExpandConfig): UseAnimatedExpandReturn {
  const { isExpanded, duration = TIMING_CONFIG.duration } = config;

  // Progress value (0 = collapsed, 1 = expanded)
  const progress = useSharedValue(isExpanded ? 1 : 0);

  // Update progress when isExpanded changes
  useEffect(() => {
    progress.value = withTiming(isExpanded ? 1 : 0, {
      duration,
      easing: TIMING_CONFIG.easing,
    });
  }, [isExpanded, progress, duration]);

  // Animated style for the expanding container
  // Uses opacity for a smooth fade effect during expansion
  const animatedStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      opacity: progress.value,
      // Only render content when expanded or animating
      overflow: 'hidden' as const,
    };
  });

  return {
    animatedStyle,
    progress,
  };
}

/**
 * A hook for animating chevron rotation
 *
 * Commonly used alongside useAnimatedExpand to rotate a chevron
 * icon when content expands/collapses.
 *
 * @example
 * ```tsx
 * function ExpandableHeader({ isExpanded }) {
 *   const { animatedStyle } = useAnimatedChevron({ isExpanded });
 *
 *   return (
 *     <View style={styles.header}>
 *       <Text>Header</Text>
 *       <Animated.View style={animatedStyle}>
 *         <Ionicons name="chevron-down" size={20} />
 *       </Animated.View>
 *     </View>
 *   );
 * }
 * ```
 */
export interface UseAnimatedChevronConfig {
  /** Whether the content is expanded */
  isExpanded: boolean;
  /** Rotation angle when expanded in degrees (default: 180) */
  expandedRotation?: number;
  /** Animation duration in ms (default: 250) */
  duration?: number;
}

export interface UseAnimatedChevronReturn {
  /** Animated style with rotation transform */
  animatedStyle: ViewStyle;
}

export function useAnimatedChevron(config: UseAnimatedChevronConfig): UseAnimatedChevronReturn {
  const { isExpanded, expandedRotation = 180, duration = TIMING_CONFIG.duration } = config;

  // Rotation value (0 = collapsed, expandedRotation = expanded)
  const rotation = useSharedValue(isExpanded ? expandedRotation : 0);

  // Update rotation when isExpanded changes
  useEffect(() => {
    rotation.value = withTiming(isExpanded ? expandedRotation : 0, {
      duration,
      easing: TIMING_CONFIG.easing,
    });
  }, [isExpanded, rotation, expandedRotation, duration]);

  // Animated style with rotation transform
  const animatedStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      transform: [{ rotate: `${rotation.value}deg` }],
    };
  });

  return {
    animatedStyle,
  };
}
