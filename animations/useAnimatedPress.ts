import { useCallback } from 'react';
import { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import type { ViewStyle } from 'react-native';

/**
 * Spring configuration for press animations
 * Provides a snappy but natural feel
 */
const SPRING_CONFIG = {
  damping: 15,
  stiffness: 150,
  mass: 1,
  overshootClamping: false,
  restDisplacementThreshold: 0.01,
  restSpeedThreshold: 0.01,
};

/**
 * Scale values for press states
 */
const SCALE_PRESSED = 0.97;
const SCALE_DEFAULT = 1;

/**
 * Hook return type for useAnimatedPress
 */
export interface UseAnimatedPressReturn {
  /** Animated style to apply to the view */
  animatedStyle: ViewStyle;
  /** Handler for press in event */
  onPressIn: () => void;
  /** Handler for press out event */
  onPressOut: () => void;
}

/**
 * Configuration options for useAnimatedPress
 */
export interface UseAnimatedPressConfig {
  /** Scale factor when pressed (default: 0.97) */
  scaleTo?: number;
  /** Whether the animation is disabled */
  disabled?: boolean;
}

/**
 * A hook that provides animated scale/opacity for touchable feedback
 *
 * This hook creates a subtle press animation that runs on the UI thread
 * for optimal performance. It scales the element to 0.97 on press and
 * returns to 1.0 on release with a spring animation.
 *
 * @example
 * ```tsx
 * function MyButton({ onPress }) {
 *   const { animatedStyle, onPressIn, onPressOut } = useAnimatedPress();
 *
 *   return (
 *     <TouchableOpacity
 *       onPress={onPress}
 *       onPressIn={onPressIn}
 *       onPressOut={onPressOut}
 *       activeOpacity={1}
 *     >
 *       <Animated.View style={[styles.button, animatedStyle]}>
 *         <Text>Press Me</Text>
 *       </Animated.View>
 *     </TouchableOpacity>
 *   );
 * }
 * ```
 */
export function useAnimatedPress(config: UseAnimatedPressConfig = {}): UseAnimatedPressReturn {
  const { scaleTo = SCALE_PRESSED, disabled = false } = config;

  // Shared value for scale animation (runs on UI thread)
  const scale = useSharedValue(SCALE_DEFAULT);

  // Animated style that applies the scale transform
  const animatedStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      transform: [{ scale: scale.value }],
    };
  });

  // Handler for press in - scale down
  const onPressIn = useCallback(() => {
    if (disabled) return;
    scale.value = withSpring(scaleTo, SPRING_CONFIG);
  }, [disabled, scale, scaleTo]);

  // Handler for press out - scale back to normal
  const onPressOut = useCallback(() => {
    if (disabled) return;
    scale.value = withSpring(SCALE_DEFAULT, SPRING_CONFIG);
  }, [disabled, scale]);

  return {
    animatedStyle,
    onPressIn,
    onPressOut,
  };
}
