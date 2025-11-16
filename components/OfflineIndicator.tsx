/**
 * OfflineIndicator Component
 *
 * Displays a banner at the top of the screen when the device is offline.
 * Automatically appears when network connection is lost and disappears when reconnected.
 *
 * Features:
 * - Safe area aware positioning
 * - Dark mode compatible
 * - Shows connection type when available
 * - Smooth fade-in/fade-out animations
 * - Non-intrusive design
 *
 * @example
 * ```tsx
 * <View>
 *   <OfflineIndicator />
 *   <MyContent />
 * </View>
 * ```
 */

import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Animated, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedView } from './ThemedView';
import { ThemedText } from './ThemedText';
import { useNetwork } from '@/context/NetworkContext';
import { useColorScheme } from '@/hooks/useColorScheme';

export interface OfflineIndicatorProps {
  /** Optional custom message to display when offline */
  message?: string;
}

/**
 * OfflineIndicator component - Shows banner when device is offline
 */
export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({
  message = 'No Internet Connection',
}) => {
  const { isConnected, isInternetReachable, connectionType, isInitialized } = useNetwork();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [isAnimating, setIsAnimating] = useState(false);

  // Determine if we should show the indicator
  // Show if: explicitly disconnected OR connected but internet not reachable
  const shouldShow = isInitialized && (
    isConnected === false ||
    (isConnected === true && isInternetReachable === false)
  );

  useEffect(() => {
    if (shouldShow) {
      setIsAnimating(true);
      // Fade in
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      // Fade out
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => setIsAnimating(false)); // Mark animation complete
    }
  }, [shouldShow, fadeAnim]);

  // Don't render when hidden and not animating (Fix #1)
  // This prevents invisible overlay from staying mounted
  if (!shouldShow && !isAnimating) {
    return null;
  }

  // Determine message based on network state (Enhanced with Fix #4)
  let displayMessage = message;
  if (isConnected === true && isInternetReachable === false) {
    const typeStr = connectionType === 'wifi' ? ' (WiFi)' :
                    connectionType === 'cellular' ? ' (Cellular)' : '';
    displayMessage = `Connected but No Internet Access${typeStr}`;
  } else if (connectionType === 'cellular') {
    displayMessage = `${message} (Cellular)`;
  } else if (connectionType === 'wifi') {
    displayMessage = `${message} (WiFi)`;
  }

  // Colors for light and dark mode
  const backgroundColor = colorScheme === 'dark' ? '#1a1a1a' : '#f5f5f5';
  const borderColor = colorScheme === 'dark' ? '#ff6b6b' : '#dc3545';
  const textColor = colorScheme === 'dark' ? '#ff6b6b' : '#dc3545';

  return (
    <Animated.View
      style={[
        styles.container,
        {
          paddingTop: insets.top,
          opacity: fadeAnim,
          backgroundColor,
          borderBottomColor: borderColor,
        },
      ]}
    >
      <ThemedView style={styles.content}>
        <ThemedText
          style={[styles.text, { color: textColor }]}
          numberOfLines={1}
          accessible={true}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          accessibilityLabel={displayMessage}
        >
          {displayMessage}
        </ThemedText>
      </ThemedView>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    borderBottomWidth: 2,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  content: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});
