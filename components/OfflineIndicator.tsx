import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Text, Animated, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNetwork } from '@/context/NetworkContext';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/Colors';

export type OfflineIndicatorProps = {
  message?: string;
};

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({
  message = 'No Internet Connection',
}) => {
  const { isConnected, isInternetReachable, connectionType, isInitialized } = useNetwork();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme() ?? 'dark';
  const colors = Colors[colorScheme];
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [isAnimating, setIsAnimating] = useState(false);

  const shouldShow =
    isInitialized &&
    (isConnected === false || (isConnected === true && isInternetReachable === false));

  useEffect(() => {
    if (shouldShow) {
      setIsAnimating(true);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => setIsAnimating(false));
    }
  }, [shouldShow, fadeAnim]);

  if (!shouldShow && !isAnimating) {
    return null;
  }

  let displayMessage = message;
  if (isConnected === true && isInternetReachable === false) {
    const typeStr =
      connectionType === 'wifi' ? ' (WiFi)' : connectionType === 'cellular' ? ' (Cellular)' : '';
    displayMessage = `Connected but No Internet Access${typeStr}`;
  } else if (connectionType === 'cellular') {
    displayMessage = `${message} (Cellular)`;
  } else if (connectionType === 'wifi') {
    displayMessage = `${message} (WiFi)`;
  }

  return (
    <Animated.View
      style={[
        styles.container,
        {
          paddingTop: insets.top,
          opacity: fadeAnim,
          backgroundColor: colors.backgroundElevated,
          borderBottomColor: colors.error,
        },
      ]}
    >
      <View style={styles.content}>
        <Text
          style={[styles.text, { color: colors.error }]}
          numberOfLines={1}
          accessible={true}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          accessibilityLabel={displayMessage}
        >
          {displayMessage}
        </Text>
      </View>
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
    fontFamily: 'SpaceMono',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
});
