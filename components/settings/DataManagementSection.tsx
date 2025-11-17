import React from 'react';
import { View, TouchableOpacity, StyleSheet, ViewStyle, ActivityIndicator } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useThemeColor } from '@/hooks/useThemeColor';

/**
 * Props for DataManagementSection component
 */
interface DataManagementSectionProps {
  /** Whether API URLs are configured */
  apiUrlsConfigured: boolean;
  /** Whether data refresh is in progress */
  refreshing: boolean;
  /** Callback to refresh all data */
  onRefresh: () => Promise<void>;

  /** Whether this is the first login (affects UI rendering) */
  isFirstLogin: boolean;
  /** Callback to initiate Flying Saucer login */
  onLogin: () => void;

  /** Whether the app can navigate back (affects home button visibility) */
  canGoBack: boolean;
  /** Callback to navigate to home screen */
  onGoHome: () => void;

  /** Custom style for the container */
  style?: ViewStyle;
  /** Test ID for testing */
  testID?: string;
}

/**
 * DataManagementSection Component
 *
 * Manages data-related operations including:
 * - Refreshing beer data from API
 * - Flying Saucer authentication
 * - Navigation to home screen
 *
 * Renders conditionally based on:
 * - API configuration status
 * - First login state
 * - Navigation stack state
 *
 * All buttons are disabled during refresh operations.
 */
export default function DataManagementSection({
  apiUrlsConfigured,
  refreshing,
  onRefresh,
  isFirstLogin,
  onLogin,
  canGoBack,
  onGoHome,
  style,
  testID = 'data-management-section',
}: DataManagementSectionProps) {
  const tintColor = useThemeColor({}, 'tint');
  const buttonBackgroundColor = useThemeColor(
    { light: '#007AFF', dark: '#0A84FF' },
    'tint'
  );

  // Don't render section at all if first login and URLs not configured
  if (isFirstLogin && !apiUrlsConfigured) {
    return null;
  }

  /**
   * Handles refresh button press
   */
  const handleRefresh = async () => {
    try {
      await onRefresh();
    } catch (error) {
      console.error('Error refreshing data:', error);
    }
  };

  return (
    <ThemedView style={[styles.container, style]} testID={testID}>
      {/* Section Title */}
      <ThemedText style={styles.sectionTitle}>Data Management</ThemedText>

      {/* Refresh Button - only show when API URLs are configured */}
      {apiUrlsConfigured && (
        <TouchableOpacity
          testID="refresh-all-data-button"
          style={[
            styles.button,
            { backgroundColor: buttonBackgroundColor },
            refreshing && styles.buttonDisabled,
          ]}
          onPress={handleRefresh}
          disabled={refreshing}
          accessibilityRole="button"
          accessibilityLabel="Refresh all beer data from server"
          accessibilityHint="Downloads latest beer information from Flying Saucer"
          accessibilityState={{ disabled: refreshing }}
        >
          {refreshing ? (
            <View style={styles.buttonContent}>
              <ActivityIndicator
                size="small"
                color="#FFFFFF"
                style={styles.buttonSpinner}
              />
              <ThemedText style={styles.buttonText}>Refreshing data...</ThemedText>
            </View>
          ) : (
            <ThemedText style={styles.buttonText}>Refresh All Beer Data</ThemedText>
          )}
        </TouchableOpacity>
      )}

      {/* Login Button - hidden during first login flow */}
      {!isFirstLogin && (
        <TouchableOpacity
          testID="login-button"
          style={[
            styles.button,
            { backgroundColor: buttonBackgroundColor },
            refreshing && styles.buttonDisabled,
          ]}
          onPress={onLogin}
          disabled={refreshing}
          accessibilityRole="button"
          accessibilityLabel="Login to Flying Saucer account"
          accessibilityHint="Opens login page to authenticate with Flying Saucer"
          accessibilityState={{ disabled: refreshing }}
        >
          <ThemedText style={styles.buttonText}>Login to Flying Saucer</ThemedText>
        </TouchableOpacity>
      )}

      {/* Home Navigation Button - only show when URLs configured and can't go back */}
      {apiUrlsConfigured && !canGoBack && (
        <TouchableOpacity
          style={[
            styles.button,
            { backgroundColor: buttonBackgroundColor },
            refreshing && styles.buttonDisabled,
          ]}
          onPress={onGoHome}
          disabled={refreshing}
          accessibilityRole="button"
          accessibilityLabel="Go to home screen"
          accessibilityHint="Navigates to the main beer list screen"
          accessibilityState={{ disabled: refreshing }}
        >
          <ThemedText style={styles.buttonText}>Go to Home Screen</ThemedText>
        </TouchableOpacity>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  button: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginBottom: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  secondaryButton: {
    // Secondary button styling (e.g., logout)
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSpinner: {
    marginRight: 8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
