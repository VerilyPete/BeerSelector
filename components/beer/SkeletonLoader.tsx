/**
 * MP-3 Step 3b: SkeletonLoader Component
 *
 * Purpose: Provide visual loading feedback during initial data fetch
 * - Displays animated placeholder items during loading
 * - Matches BeerItem visual structure and height for smooth transitions
 * - Supports light and dark themes
 * - Renders efficiently with smooth animations using native driver
 * - Accessible with proper labels for screen readers
 */

import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, ViewStyle } from 'react-native';
import { useThemeColor } from '@/hooks/useThemeColor';

type SkeletonLoaderProps = {
  count?: number; // Default: 10
};

/**
 * SkeletonLoader Component
 *
 * Displays a configurable number of animated skeleton items that match
 * the structure and dimensions of BeerItem for a smooth loading experience.
 *
 * @param count - Number of skeleton items to render (default: 10)
 *
 * @example
 * ```tsx
 * // Default 10 items
 * <SkeletonLoader />
 *
 * // Custom count
 * <SkeletonLoader count={20} />
 * ```
 */
export const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({ count = 10 }) => {
  // Animation value for shimmer effect
  const shimmerValue = useRef(new Animated.Value(0)).current;

  // Theme colors
  const baseColor = useThemeColor(
    { light: '#F5F5F5', dark: '#1C1C1E' },
    'background'
  );
  const shimmerColor = useThemeColor(
    { light: '#E0E0E0', dark: '#2C2C2E' },
    'background'
  );

  // Start shimmer animation on mount
  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerValue, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true, // Use native driver for better performance
        }),
        Animated.timing(shimmerValue, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();

    // Cleanup animation on unmount
    return () => {
      animation.stop();
    };
  }, [shimmerValue]);

  // Interpolate opacity for shimmer effect
  const shimmerOpacity = shimmerValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 1],
  });

  // Handle edge case: negative or invalid count
  const validCount = Math.max(0, count || 10);

  return (
    <View
      style={styles.container}
      testID="skeleton-loader"
      accessibilityLabel="Loading content"
      accessibilityRole="progressbar"
    >
      {Array.from({ length: validCount }).map((_, index) => (
        <View
          key={index}
          style={[styles.skeletonItem, { backgroundColor: baseColor }]}
          testID={`skeleton-item-${index}`}
        >
          {/* Title placeholder - 75% width */}
          <Animated.View
            style={[
              styles.placeholder,
              styles.titlePlaceholder,
              { backgroundColor: shimmerColor, opacity: shimmerOpacity },
            ]}
            testID={`skeleton-item-${index}-title`}
          />

          {/* Brewery placeholder - 60% width */}
          <Animated.View
            style={[
              styles.placeholder,
              styles.breweryPlaceholder,
              { backgroundColor: shimmerColor, opacity: shimmerOpacity },
            ]}
            testID={`skeleton-item-${index}-brewery`}
          />

          {/* Style placeholder - 50% width */}
          <Animated.View
            style={[
              styles.placeholder,
              styles.stylePlaceholder,
              { backgroundColor: shimmerColor, opacity: shimmerOpacity },
            ]}
            testID={`skeleton-item-${index}-style`}
          />

          {/* Date placeholder - 30% width */}
          <Animated.View
            style={[
              styles.placeholder,
              styles.datePlaceholder,
              { backgroundColor: shimmerColor, opacity: shimmerOpacity },
            ]}
            testID={`skeleton-item-${index}-date`}
          />
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 8,
  } as ViewStyle,
  skeletonItem: {
    height: 140, // Match BeerItem collapsed height (120-160px range)
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
    justifyContent: 'space-around',
  } as ViewStyle,
  placeholder: {
    borderRadius: 4,
  } as ViewStyle,
  titlePlaceholder: {
    width: '75%',
    height: 20,
  } as ViewStyle,
  breweryPlaceholder: {
    width: '60%',
    height: 16,
  } as ViewStyle,
  stylePlaceholder: {
    width: '50%',
    height: 16,
  } as ViewStyle,
  datePlaceholder: {
    width: '30%',
    height: 12,
  } as ViewStyle,
});
