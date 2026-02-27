import React from 'react';
import { View, ViewStyle } from 'react-native';

import { Colors } from '@/constants/Colors';
import SettingsSection from './SettingsSection';
import SettingsItem from './SettingsItem';

/**
 * Props for DataManagementSection component
 */
type DataManagementSectionProps = {
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
};

/**
 * DataManagementSection Component
 *
 * Manages data-related operations including:
 * - Refreshing beer data from API
 * - Flying Saucer authentication
 * - Navigation to home screen
 *
 * Uses the new SettingsSection and SettingsItem components
 * for consistent styling and dark mode support.
 *
 * All items show loading state during refresh operations.
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

  // Count how many items will be shown to manage separators
  const showRefresh = apiUrlsConfigured;
  const showLogin = !isFirstLogin;
  const showHome = apiUrlsConfigured && !canGoBack;

  return (
    <View style={style} testID={testID}>
      <SettingsSection
        title="Data"
        footer={
          apiUrlsConfigured
            ? 'Refresh to get the latest beer list and rewards from Flying Saucer.'
            : undefined
        }
      >
        {/* Refresh Button */}
        {showRefresh && (
          <SettingsItem
            icon="arrow.clockwise"
            iconBackgroundColor={Colors.light.success}
            title={refreshing ? 'Refreshing...' : 'Refresh All Data'}
            subtitle="Download latest beers and rewards"
            accessoryType={refreshing ? 'loading' : 'none'}
            onPress={handleRefresh}
            disabled={refreshing}
            showSeparator={showLogin || showHome}
            testID="refresh-all-data-button"
          />
        )}

        {/* Login Button */}
        {showLogin && (
          <SettingsItem
            icon="person.crop.circle"
            iconBackgroundColor={Colors.light.tint}
            title="Login to Flying Saucer"
            subtitle="Sign in with your UFO Club account"
            accessoryType="chevron"
            onPress={onLogin}
            disabled={refreshing}
            showSeparator={showHome}
            testID="login-button"
          />
        )}

        {/* Home Navigation Button */}
        {showHome && (
          <SettingsItem
            icon="house.fill"
            iconBackgroundColor="#5856D6"
            title="Go to Home Screen"
            subtitle="Return to the main beer list"
            accessoryType="chevron"
            onPress={onGoHome}
            disabled={refreshing}
            showSeparator={false}
          />
        )}
      </SettingsSection>
    </View>
  );
}
