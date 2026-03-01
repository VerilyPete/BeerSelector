import React from 'react';
import { View, ViewStyle } from 'react-native';
import SettingsSection from './SettingsSection';
import SettingsItem from './SettingsItem';

type DataManagementSectionProps = {
  apiUrlsConfigured: boolean;
  refreshing: boolean;
  onRefresh: () => Promise<void>;
  isFirstLogin: boolean;
  onLogin: () => void;
  canGoBack: boolean;
  onGoHome: () => void;
  style?: ViewStyle;
  testID?: string;
};

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
  if (isFirstLogin && !apiUrlsConfigured) {
    return null;
  }

  const handleRefresh = async () => {
    try {
      await onRefresh();
    } catch (error) {
      console.error('Error refreshing data:', error);
    }
  };

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
        {showRefresh && (
          <SettingsItem
            icon="arrow.clockwise"
            title={refreshing ? 'Refreshing...' : 'Refresh All Data'}
            subtitle="Download latest beers and rewards"
            accessoryType={refreshing ? 'loading' : 'none'}
            onPress={handleRefresh}
            disabled={refreshing}
            showSeparator={showLogin || showHome}
            testID="refresh-all-data-button"
          />
        )}

        {showLogin && (
          <SettingsItem
            icon="person.crop.circle"
            title="Login to Flying Saucer"
            subtitle="Sign in with your UFO Club account"
            accessoryType="chevron"
            onPress={onLogin}
            disabled={refreshing}
            showSeparator={showHome}
            testID="login-button"
          />
        )}

        {showHome && (
          <SettingsItem
            icon="house.fill"
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
