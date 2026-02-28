/**
 * SkeletonLoader Component System
 *
 * A reusable skeleton loading system for the BeerSelector app.
 * Provides visual loading feedback during data fetching with
 * smooth shimmer animations using react-native-reanimated.
 *
 * Components:
 * - SkeletonBox: Basic rectangular skeleton with shimmer animation
 * - SkeletonText: Text-sized skeleton for text placeholders
 * - SkeletonBeerItem: Pre-built skeleton matching BeerItem layout
 * - SkeletonBeerList: Multiple SkeletonBeerItem for list loading
 *
 * Performance Features:
 * - All animations run on UI thread via Reanimated worklets
 * - Optimized for 60fps on iPhone 11 and equivalent devices
 * - Respects reduced motion accessibility preference
 * - Memory efficient with proper cleanup
 *
 * NOTE: This component requires expo-linear-gradient to be installed:
 * npx expo install expo-linear-gradient
 */

import React, { useCallback, useMemo, useEffect } from 'react';
import { View, StyleSheet, ViewStyle, useColorScheme } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  cancelAnimation,
  interpolate,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '@/constants/Colors';
import { spacing, borderRadii } from '@/constants/spacing';
import { easings, durations } from '@/animations/config';
import { useAnimationConfig } from '@/animations/useReducedMotion';

// ============================================================================
// Types
// ============================================================================

type SkeletonBoxProps = {
  /** Width of the skeleton box (number or percentage string) */
  width?: number | `${number}%`;
  /** Height of the skeleton box */
  height?: number;
  /** Border radius override */
  borderRadius?: number;
  /** Animation duration in milliseconds */
  animationDuration?: number;
  /** Additional styles */
  style?: ViewStyle;
};

type SkeletonTextProps = {
  /** Number of text lines to display */
  lines?: number;
  /** Width of the last line (for natural text appearance) */
  lastLineWidth?: number | `${number}%`;
  /** Line height */
  lineHeight?: number;
  /** Gap between lines */
  lineGap?: number;
  /** Animation duration in milliseconds */
  animationDuration?: number;
  /** Additional styles */
  style?: ViewStyle;
};

type SkeletonBeerItemProps = {
  /** Animation duration in milliseconds */
  animationDuration?: number;
  /** Whether to show glass icon placeholder */
  showGlassIcon?: boolean;
  /** Additional styles */
  style?: ViewStyle;
};

type SkeletonBeerListProps = {
  /** Number of skeleton items to display */
  count?: number;
  /** Animation duration in milliseconds */
  animationDuration?: number;
  /** Additional styles */
  style?: ViewStyle;
};

// ============================================================================
// Constants
// ============================================================================

/** Default shimmer animation duration in ms */
const DEFAULT_ANIMATION_DURATION = durations.shimmer;

/** Default text line height in pixels */
const DEFAULT_LINE_HEIGHT = 16;

/** Default gap between text lines */
const DEFAULT_LINE_GAP = spacing.s;

/** Shimmer gradient width as percentage of container */
const SHIMMER_WIDTH = 200;

// ============================================================================
// Hooks
// ============================================================================

/**
 * Custom hook to get skeleton colors based on current theme.
 *
 * @returns Theme-aware skeleton colors for base and highlight states
 */
const useSkeletonColors = () => {
  const colorScheme = useColorScheme() ?? 'light';

  return useMemo(
    () => ({
      base: Colors[colorScheme].skeletonBase,
      highlight: Colors[colorScheme].skeletonHighlight,
      // Gradient stops for shimmer effect
      gradientColors: [
        Colors[colorScheme].skeletonBase,
        Colors[colorScheme].skeletonHighlight,
        Colors[colorScheme].skeletonBase,
      ] as const,
    }),
    [colorScheme]
  );
};

/**
 * Custom hook to create shimmer animation with reduced motion support.
 *
 * The animation runs entirely on the UI thread for 60fps performance.
 * When reduced motion is enabled, returns a static value (no animation).
 *
 * @param duration - Animation duration in milliseconds
 * @returns Shared value for translateX animation (-1 to 1 range)
 */
const useShimmerAnimation = (duration: number = DEFAULT_ANIMATION_DURATION) => {
  const { isReducedMotion } = useAnimationConfig();
  const translateX = useSharedValue(isReducedMotion ? 0 : -1);

  useEffect(() => {
    // Skip animation if reduced motion is enabled
    if (isReducedMotion) {
      translateX.value = 0;
      return;
    }

    // Start infinite shimmer animation on UI thread
    translateX.value = withRepeat(
      withTiming(1, {
        duration,
        easing: easings.linear, // Linear for smooth continuous shimmer
      }),
      -1, // Infinite repeat
      false // Don't reverse
    );

    // Cleanup: cancel animation on unmount to prevent memory leaks
    return () => {
      cancelAnimation(translateX);
    };
  }, [translateX, duration, isReducedMotion]);

  return translateX;
};

// ============================================================================
// SkeletonBox Component
// ============================================================================

/**
 * Basic rectangular skeleton with shimmer animation.
 *
 * This is the fundamental building block for all skeleton components.
 * Uses Reanimated for 60fps shimmer animation running on the UI thread.
 *
 * @example
 * ```tsx
 * <SkeletonBox width={200} height={20} />
 * <SkeletonBox width="100%" height={40} borderRadius={8} />
 * ```
 */
export const SkeletonBox: React.FC<SkeletonBoxProps> = ({
  width = '100%',
  height = DEFAULT_LINE_HEIGHT,
  borderRadius = borderRadii.s,
  animationDuration = DEFAULT_ANIMATION_DURATION,
  style,
}) => {
  const colors = useSkeletonColors();
  const shimmerTranslate = useShimmerAnimation(animationDuration);

  // Animated style runs on UI thread via worklet
  const animatedStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      transform: [
        {
          translateX: interpolate(shimmerTranslate.value, [-1, 1], [-SHIMMER_WIDTH, SHIMMER_WIDTH]),
        },
      ],
    };
  });

  const containerStyle = useMemo(
    () => [
      styles.skeletonBox,
      {
        width,
        height,
        borderRadius,
        backgroundColor: colors.base,
      },
      style,
    ],
    [width, height, borderRadius, colors.base, style]
  );

  return (
    <View style={containerStyle} testID="skeleton-box">
      <Animated.View style={[styles.shimmerContainer, animatedStyle]}>
        <LinearGradient
          colors={colors.gradientColors}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.shimmerGradient}
        />
      </Animated.View>
    </View>
  );
};

// ============================================================================
// SkeletonText Component
// ============================================================================

/**
 * Text-sized skeleton for text placeholders.
 * Supports multiple lines with configurable widths.
 *
 * @example
 * ```tsx
 * <SkeletonText lines={3} lastLineWidth="60%" />
 * <SkeletonText lines={1} lineHeight={24} />
 * ```
 */
export const SkeletonText: React.FC<SkeletonTextProps> = ({
  lines = 1,
  lastLineWidth = '75%',
  lineHeight = DEFAULT_LINE_HEIGHT,
  lineGap = DEFAULT_LINE_GAP,
  animationDuration = DEFAULT_ANIMATION_DURATION,
  style,
}) => {
  const colors = useSkeletonColors();
  const shimmerTranslate = useShimmerAnimation(animationDuration);

  // Animated style runs on UI thread via worklet
  const animatedStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      transform: [
        {
          translateX: interpolate(shimmerTranslate.value, [-1, 1], [-SHIMMER_WIDTH, SHIMMER_WIDTH]),
        },
      ],
    };
  });

  const renderLines = useCallback(() => {
    const lineElements = [];

    for (let i = 0; i < lines; i++) {
      const isLastLine = i === lines - 1;
      const lineWidth = isLastLine && lines > 1 ? lastLineWidth : '100%';

      lineElements.push(
        <View
          key={i}
          style={[
            styles.skeletonBox,
            {
              width: lineWidth,
              height: lineHeight,
              borderRadius: borderRadii.xs,
              backgroundColor: colors.base,
              marginTop: i > 0 ? lineGap : 0,
            },
          ]}
          testID={`skeleton-text-line-${i}`}
        >
          <Animated.View style={[styles.shimmerContainer, animatedStyle]}>
            <LinearGradient
              colors={colors.gradientColors}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.shimmerGradient}
            />
          </Animated.View>
        </View>
      );
    }

    return lineElements;
  }, [lines, lastLineWidth, lineHeight, lineGap, colors, animatedStyle]);

  return (
    <View style={[styles.textContainer, style]} testID="skeleton-text">
      {renderLines()}
    </View>
  );
};

// ============================================================================
// SkeletonBeerItem Component
// ============================================================================

/**
 * Pre-built skeleton matching the BeerItem layout.
 * Provides a consistent loading placeholder for beer list items.
 *
 * Performance optimized:
 * - Single shared shimmer animation for all elements
 * - Memoized styles to prevent unnecessary recalculations
 * - UI thread animation via Reanimated worklet
 *
 * @example
 * ```tsx
 * <SkeletonBeerItem />
 * <SkeletonBeerItem showGlassIcon={false} />
 * ```
 */
export const SkeletonBeerItem: React.FC<SkeletonBeerItemProps> = ({
  animationDuration = DEFAULT_ANIMATION_DURATION,
  showGlassIcon = true,
  style,
}) => {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = useSkeletonColors();
  const shimmerTranslate = useShimmerAnimation(animationDuration);

  // Single animated style shared by all skeleton elements in this item
  const animatedStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      transform: [
        {
          translateX: interpolate(shimmerTranslate.value, [-1, 1], [-SHIMMER_WIDTH, SHIMMER_WIDTH]),
        },
      ],
    };
  });

  // Card border color based on theme
  const borderColor = colorScheme === 'dark' ? Colors.dark.border : Colors.light.border;

  // Memoized gradient component to reduce re-renders
  const ShimmerGradient = useMemo(
    () => (
      <Animated.View style={[styles.shimmerContainer, animatedStyle]}>
        <LinearGradient
          colors={colors.gradientColors}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.shimmerGradient}
        />
      </Animated.View>
    ),
    [colors.gradientColors, animatedStyle]
  );

  return (
    <View
      style={[styles.beerItemCard, { borderColor, backgroundColor: colors.base }, style]}
      testID="skeleton-beer-item"
      accessibilityLabel="Loading beer item"
      accessibilityRole="progressbar"
    >
      {/* Header row with beer name and glass icon */}
      <View style={styles.beerItemHeaderRow}>
        <View style={styles.beerItemNameContainer}>
          {/* Beer name placeholder - two lines */}
          <View
            style={[
              styles.skeletonBox,
              {
                width: '85%',
                height: 20,
                borderRadius: borderRadii.s,
                backgroundColor: colors.base,
              },
            ]}
          >
            {ShimmerGradient}
          </View>
          <View
            style={[
              styles.skeletonBox,
              {
                width: '60%',
                height: 20,
                borderRadius: borderRadii.s,
                backgroundColor: colors.base,
                marginTop: spacing.xs,
              },
            ]}
          >
            {ShimmerGradient}
          </View>
        </View>

        {/* Glass icon placeholder */}
        {showGlassIcon && (
          <View
            style={[styles.skeletonBox, styles.beerItemGlassIcon, { backgroundColor: colors.base }]}
          >
            {ShimmerGradient}
          </View>
        )}
      </View>

      {/* Brewery placeholder */}
      <View
        style={[
          styles.skeletonBox,
          {
            width: '70%',
            height: 16,
            borderRadius: borderRadii.xs,
            backgroundColor: colors.base,
            marginTop: spacing.s,
          },
        ]}
      >
        {ShimmerGradient}
      </View>

      {/* Style and container placeholder */}
      <View
        style={[
          styles.skeletonBox,
          {
            width: '55%',
            height: 14,
            borderRadius: borderRadii.xs,
            backgroundColor: colors.base,
            marginTop: spacing.xs,
          },
        ]}
      >
        {ShimmerGradient}
      </View>

      {/* Date placeholder */}
      <View
        style={[
          styles.skeletonBox,
          {
            width: '35%',
            height: 12,
            borderRadius: borderRadii.xs,
            backgroundColor: colors.base,
            marginTop: spacing.s,
          },
        ]}
      >
        {ShimmerGradient}
      </View>
    </View>
  );
};

// ============================================================================
// SkeletonBeerList Component
// ============================================================================

/**
 * Multiple SkeletonBeerItem components for list loading states.
 * Use this when loading a list of beers.
 *
 * Performance optimized:
 * - Caps maximum items at 50 to prevent memory issues
 * - Uses key-based rendering for efficient updates
 * - Each item shares animation config but maintains independent state
 *
 * @example
 * ```tsx
 * <SkeletonBeerList count={10} />
 * <SkeletonBeerList count={5} animationDuration={2000} />
 * ```
 */
export const SkeletonBeerList: React.FC<SkeletonBeerListProps> = ({
  count = 10,
  animationDuration = DEFAULT_ANIMATION_DURATION,
  style,
}) => {
  // Handle edge case: negative or invalid count
  const validCount = Math.max(0, Math.min(count, 50)); // Cap at 50 for performance

  const renderItems = useCallback(() => {
    const items = [];

    for (let i = 0; i < validCount; i++) {
      items.push(
        <SkeletonBeerItem key={`skeleton-beer-item-${i}`} animationDuration={animationDuration} />
      );
    }

    return items;
  }, [validCount, animationDuration]);

  return (
    <View
      style={[styles.listContainer, style]}
      testID="skeleton-beer-list"
      accessibilityLabel={`Loading ${validCount} beer items`}
      accessibilityRole="progressbar"
    >
      {renderItems()}
    </View>
  );
};

// ============================================================================
// Legacy SkeletonLoader Export (for backward compatibility)
// ============================================================================

type SkeletonLoaderProps = {
  count?: number;
};

/**
 * Legacy SkeletonLoader component for backward compatibility.
 * Wraps SkeletonBeerList with the original API.
 *
 * @deprecated Use SkeletonBeerList instead for more options
 *
 * @example
 * ```tsx
 * <SkeletonLoader count={10} />
 * ```
 */
export const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({ count = 10 }) => {
  return <SkeletonBeerList count={count} />;
};

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  // Base skeleton box
  skeletonBox: {
    overflow: 'hidden',
    position: 'relative',
  },

  // Shimmer animation container
  shimmerContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '200%',
  },

  // Shimmer gradient
  shimmerGradient: {
    flex: 1,
    width: '100%',
  },

  // Text container
  textContainer: {
    flexDirection: 'column',
  },

  // Beer item card - matches BeerItem.tsx styles
  beerItemCard: {
    borderRadius: spacing.sm, // 12
    borderWidth: 1,
    padding: spacing.m, // 16
    marginHorizontal: spacing.xs, // 4
    marginBottom: spacing.m, // 16
    minHeight: 140,
  },

  // Beer item header row
  beerItemHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.s, // 8
  },

  // Beer item name container
  beerItemNameContainer: {
    flex: 1,
  },

  // Beer item glass icon placeholder
  beerItemGlassIcon: {
    width: 36,
    height: 36,
    borderRadius: borderRadii.s, // 4
  },

  // List container
  listContainer: {
    paddingHorizontal: spacing.sm, // 12
    paddingTop: spacing.s, // 8
  },
});

// ============================================================================
// Default Export
// ============================================================================

export default SkeletonLoader;
