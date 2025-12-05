/**
 * AnimatedRefreshHeader Component
 *
 * A custom animated refresh header that shows a beer mug icon filling up
 * as the user pulls to refresh. Provides engaging visual feedback with
 * smooth animations using Reanimated 3.
 *
 * Features:
 * - Beer mug that fills based on pull progress
 * - Smooth rotation animation during refresh
 * - Subtle glow effect while refreshing
 * - Theme-aware colors (light/dark mode)
 * - Accessible with screen reader support
 *
 * Uses View-based rendering for the mug (no SVG dependency required)
 */

import React, { useMemo } from 'react';
import { StyleSheet, View, useColorScheme } from 'react-native';
import Animated, {
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  SharedValue,
  DerivedValue,
} from 'react-native-reanimated';
import { ThemedText } from '@/components/ThemedText';
import { spacing } from '@/constants/spacing';

// ============================================================================
// Types
// ============================================================================

export interface AnimatedRefreshHeaderProps {
  /** Progress value from 0 to 1 (derived value from usePullToRefresh) */
  pullProgress: DerivedValue<number>;
  /** Whether refresh is currently in progress */
  isRefreshing: SharedValue<boolean>;
  /** Rotation value for spin animation (shared value from usePullToRefresh) */
  rotation: SharedValue<number>;
  /** Height of the header container */
  height?: number;
  /** Optional accessibility label */
  accessibilityLabel?: string;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_HEADER_HEIGHT = 80;
const MUG_SIZE = 48;

// Beer colors for the mug
const BEER_COLORS = {
  light: {
    beerTop: '#FCD34D', // IPA Gold - lighter at top (foam)
    beerBottom: '#D97706', // Amber - darker at bottom
    mug: '#78716C', // Stout Light - mug outline
    mugBackground: 'rgba(215, 119, 6, 0.15)', // Amber tint for glass
    glow: '#FBBF24', // Amber glow
    foam: '#FEF3C7', // Light cream foam
  },
  dark: {
    beerTop: '#FCD34D', // IPA Gold
    beerBottom: '#F59E0B', // Amber Primary (brighter for dark mode)
    mug: '#A8A29E', // Cream Muted
    mugBackground: 'rgba(245, 158, 11, 0.2)', // Amber tint for glass
    glow: '#F59E0B', // Amber glow
    foam: '#FEF3C7', // Light cream foam
  },
};

// ============================================================================
// Main Component
// ============================================================================

/**
 * AnimatedRefreshHeader - A beer mug that fills as the user pulls to refresh
 *
 * @example
 * ```tsx
 * const { pullProgress, isRefreshing, rotation } = usePullToRefresh();
 *
 * <AnimatedRefreshHeader
 *   pullProgress={pullProgress}
 *   isRefreshing={isRefreshing}
 *   rotation={rotation}
 * />
 * ```
 */
export const AnimatedRefreshHeader: React.FC<AnimatedRefreshHeaderProps> = ({
  pullProgress,
  isRefreshing,
  rotation,
  height = DEFAULT_HEADER_HEIGHT,
  accessibilityLabel = 'Pull to refresh',
}) => {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = BEER_COLORS[colorScheme];

  // Animated style for the container (fade in/out based on pull)
  const containerStyle = useAnimatedStyle(() => {
    const opacity = interpolate(pullProgress.value, [0, 0.3, 1], [0, 0.5, 1], Extrapolation.CLAMP);

    const translateY = interpolate(pullProgress.value, [0, 1], [-20, 0], Extrapolation.CLAMP);

    return {
      opacity: isRefreshing.value ? 1 : opacity,
      transform: [{ translateY: isRefreshing.value ? 0 : translateY }],
    };
  });

  // Animated style for rotation during refresh
  const rotationStyle = useAnimatedStyle(() => {
    // Only rotate when refreshing
    const rotateValue = isRefreshing.value ? rotation.value : 0;

    return {
      transform: [{ rotate: `${rotateValue}deg` }],
    };
  });

  // Animated style for glow effect
  const glowStyle = useAnimatedStyle(() => {
    // Pulsing glow during refresh
    const glowOpacity = isRefreshing.value
      ? interpolate(
          Math.sin(rotation.value * (Math.PI / 180) * 2), // 2x speed for pulse
          [-1, 1],
          [0.2, 0.6],
          Extrapolation.CLAMP
        )
      : 0;

    return {
      opacity: glowOpacity,
    };
  });

  // Animated style for scale bounce at threshold
  const scaleStyle = useAnimatedStyle(() => {
    const scale = interpolate(
      pullProgress.value,
      [0, 0.95, 1, 1.2],
      [0.8, 0.95, 1.1, 1.15],
      Extrapolation.CLAMP
    );

    return {
      transform: [{ scale: isRefreshing.value ? 1 : scale }],
    };
  });

  // Animated fill height for the beer
  const fillStyle = useAnimatedStyle(() => {
    const fillPercent = isRefreshing.value
      ? 100
      : interpolate(pullProgress.value, [0, 1], [0, 100], Extrapolation.CLAMP);

    return {
      height: `${fillPercent}%`,
    };
  });

  // Animated foam visibility
  const foamStyle = useAnimatedStyle(() => {
    const foamOpacity = isRefreshing.value
      ? 1
      : interpolate(pullProgress.value, [0.3, 0.5, 1], [0, 0.5, 1], Extrapolation.CLAMP);

    return {
      opacity: foamOpacity,
    };
  });

  // Status text based on state
  const statusTextStyle = useAnimatedStyle(() => {
    const opacity = interpolate(pullProgress.value, [0, 0.5, 1], [0, 0.5, 1], Extrapolation.CLAMP);

    return {
      opacity: isRefreshing.value ? 1 : opacity,
    };
  });

  // Memoize the static status text to avoid re-renders
  const refreshingText = useMemo(() => 'Refreshing...', []);
  const releaseText = useMemo(() => 'Release to refresh', []);
  const pullText = useMemo(() => 'Pull to refresh', []);

  return (
    <Animated.View
      style={[styles.container, { height }, containerStyle]}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="progressbar"
    >
      {/* Glow effect behind the mug */}
      <Animated.View style={[styles.glow, { backgroundColor: colors.glow }, glowStyle]} />

      {/* Beer mug with rotation and scale animations */}
      <Animated.View style={[styles.mugContainer, scaleStyle]}>
        <Animated.View style={rotationStyle}>
          <View style={[styles.mugWrapper, { width: MUG_SIZE, height: MUG_SIZE }]}>
            {/* Mug background (glass body) */}
            <View
              style={[
                styles.mugBody,
                { backgroundColor: colors.mugBackground, borderColor: colors.mug },
              ]}
            >
              {/* Beer fill container */}
              <View style={styles.fillWrapper}>
                <Animated.View
                  style={[styles.beerFill, { backgroundColor: colors.beerBottom }, fillStyle]}
                >
                  {/* Foam at top */}
                  <Animated.View
                    style={[styles.foam, { backgroundColor: colors.foam }, foamStyle]}
                  />
                  {/* Gradient overlay for beer color variation */}
                  <View style={[styles.beerGradient, { backgroundColor: colors.beerTop }]} />
                </Animated.View>
              </View>
            </View>

            {/* Mug handle */}
            <View style={[styles.mugHandle, { borderColor: colors.mug }]} />

            {/* Glass highlight */}
            <View style={styles.glassHighlight} />
          </View>
        </Animated.View>
      </Animated.View>

      {/* Status text */}
      <Animated.View style={[styles.textContainer, statusTextStyle]}>
        <StatusText
          pullProgress={pullProgress}
          isRefreshing={isRefreshing}
          pullText={pullText}
          releaseText={releaseText}
          refreshingText={refreshingText}
        />
      </Animated.View>
    </Animated.View>
  );
};

// ============================================================================
// Helper Components
// ============================================================================

interface StatusTextProps {
  pullProgress: DerivedValue<number>;
  isRefreshing: SharedValue<boolean>;
  pullText: string;
  releaseText: string;
  refreshingText: string;
}

/**
 * Status text that changes based on pull state
 */
const StatusText: React.FC<StatusTextProps> = React.memo(
  ({ pullProgress, isRefreshing, pullText, releaseText, refreshingText }) => {
    // Animate opacity for each text based on state
    const pullTextStyle = useAnimatedStyle(() => {
      const showPullText = !isRefreshing.value && pullProgress.value < 1;
      return {
        opacity: showPullText ? 1 : 0,
        position: 'absolute' as const,
      };
    });

    const releaseTextStyle = useAnimatedStyle(() => {
      const showReleaseText = !isRefreshing.value && pullProgress.value >= 1;
      return {
        opacity: showReleaseText ? 1 : 0,
        position: 'absolute' as const,
      };
    });

    const refreshingTextStyle = useAnimatedStyle(() => {
      return {
        opacity: isRefreshing.value ? 1 : 0,
        position: 'absolute' as const,
      };
    });

    return (
      <View style={styles.statusTextContainer}>
        <Animated.View style={pullTextStyle}>
          <ThemedText type="muted" style={styles.statusText}>
            {pullText}
          </ThemedText>
        </Animated.View>

        <Animated.View style={releaseTextStyle}>
          <ThemedText type="muted" style={styles.statusText}>
            {releaseText}
          </ThemedText>
        </Animated.View>

        <Animated.View style={refreshingTextStyle}>
          <ThemedText type="muted" style={styles.statusText}>
            {refreshingText}
          </ThemedText>
        </Animated.View>
      </View>
    );
  }
);

StatusText.displayName = 'StatusText';

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    width: MUG_SIZE * 2,
    height: MUG_SIZE * 2,
    borderRadius: MUG_SIZE,
    opacity: 0,
  },
  mugContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  mugWrapper: {
    position: 'relative',
  },
  mugBody: {
    position: 'absolute',
    left: 0,
    top: 4,
    width: 32,
    height: 40,
    borderWidth: 2,
    borderRadius: 4,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    overflow: 'hidden',
  },
  fillWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    top: 0,
    justifyContent: 'flex-end',
  },
  beerFill: {
    width: '100%',
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
    overflow: 'hidden',
  },
  foam: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 6,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },
  beerGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 8,
    opacity: 0.5,
  },
  mugHandle: {
    position: 'absolute',
    right: 2,
    top: 12,
    width: 12,
    height: 24,
    borderWidth: 2,
    borderLeftWidth: 0,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
    backgroundColor: 'transparent',
  },
  glassHighlight: {
    position: 'absolute',
    left: 4,
    top: 8,
    width: 2,
    height: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    borderRadius: 1,
  },
  textContainer: {
    marginTop: spacing.s,
  },
  statusTextContainer: {
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },
});

export default AnimatedRefreshHeader;
