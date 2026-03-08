import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/Colors';
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
  const colorScheme = useColorScheme() ?? 'dark';
  const colors = Colors[colorScheme];

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

      {!isFirstLogin && (
        <TouchableOpacity
          style={[
            styles.logoutOuter,
            {
              backgroundColor: colors.destructive,
              borderColor: 'rgba(255, 153, 153, 0.37)',
            },
          ]}
          onPress={onLogin}
          activeOpacity={0.8}
          testID="logout-button"
        >
          <View
            style={[
              styles.logoutInner,
              { backgroundColor: '#1A0000', borderColor: 'rgba(51, 0, 0, 0.5)' },
            ]}
          >
            <Ionicons name="log-out-outline" size={18} color={colors.destructive} />
            <Text style={[styles.logoutText, { color: colors.destructive }]}>LOG OUT</Text>
          </View>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  logoutOuter: {
    borderRadius: 14,
    padding: 2,
    borderWidth: 1,
    marginTop: 20,
    shadowColor: '#FF3333',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  logoutInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 12,
    borderWidth: 1,
  },
  logoutText: {
    fontFamily: 'SpaceMono',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 2,
  },
});
