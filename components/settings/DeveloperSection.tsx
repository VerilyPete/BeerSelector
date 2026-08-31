import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/Colors';
import { beerRepository } from '@/src/database/repositories/BeerRepository';
import { myBeersRepository } from '@/src/database/repositories/MyBeersRepository';
import { rewardsRepository } from '@/src/database/repositories/RewardsRepository';
import { getPreference, setPreference } from '@/src/database/preferences';
import { commitTaplistWrite } from '@/src/services/taplistEtag';
import { createMockSession } from '@/src/api/mockSession';
import { clearAuthCookies, clearSessionData } from '@/src/api/sessionManager';
import { clearNativeCookies } from '@/src/api/nativeCookieManager';
import { databaseLockManager } from '@/src/database/DatabaseLockManager';
import SettingsSection from './SettingsSection';
import SettingsItem from './SettingsItem';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export default function DeveloperSection() {
  const [dbStats, setDbStats] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const isMountedRef = useRef(true);

  const colorScheme = useColorScheme() ?? 'dark';
  const colors = Colors[colorScheme];

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const showDatabaseStats = useCallback(async () => {
    if (process.env.EXPO_OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    if (isLoading) return;

    try {
      setIsLoading(true);

      const allBeers = await beerRepository.getAll();
      const myBeers = await myBeersRepository.getAll();
      const rewards = await rewardsRepository.getAll();

      const lastAllBeersRefresh = await getPreference('last_all_beers_refresh');
      const lastMyBeersRefresh = await getPreference('last_my_beers_refresh');

      const stats = `
Database Statistics:
All Beers: ${allBeers.length}
Tasted Beers: ${myBeers.length}
Rewards: ${rewards.length}

Last Refresh:
All Beers: ${lastAllBeersRefresh ? new Date(parseInt(lastAllBeersRefresh)).toLocaleString() : 'Never'}
Tasted Beers: ${lastMyBeersRefresh ? new Date(parseInt(lastMyBeersRefresh)).toLocaleString() : 'Never'}
      `.trim();

      Alert.alert('Database Stats', stats, [{ text: 'OK' }]);

      if (isMountedRef.current) {
        setDbStats(`${allBeers.length} beers, ${myBeers.length} tasted`);
      }
    } catch (error) {
      if (isMountedRef.current) {
        Alert.alert('Error', `Failed to get stats: ${getErrorMessage(error)}`);
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [isLoading]);

  const clearRefreshTimestamps = useCallback(async () => {
    if (process.env.EXPO_OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    Alert.alert(
      'Clear Refresh Timestamps',
      'This will force a data refresh on next app start. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await setPreference('last_all_beers_refresh', '0');
              await setPreference('last_my_beers_refresh', '0');
              Alert.alert('Success', 'Refresh timestamps cleared');
            } catch (error) {
              Alert.alert('Error', `Failed: ${getErrorMessage(error)}`);
            }
          },
        },
      ]
    );
  }, []);

  const viewAllPreferences = useCallback(async () => {
    if (process.env.EXPO_OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    try {
      const prefs = {
        api_base_url: await getPreference('api_base_url'),
        is_visitor_mode: await getPreference('is_visitor_mode'),
        first_launch: await getPreference('first_launch'),
        last_all_beers_refresh: await getPreference('last_all_beers_refresh'),
        last_my_beers_refresh: await getPreference('last_my_beers_refresh'),
      };

      const prefsText = Object.entries(prefs)
        .map(([key, value]) => `${key}: ${value || 'null'}`)
        .join('\n');

      Alert.alert('App Preferences', prefsText, [{ text: 'OK' }]);
    } catch (error) {
      Alert.alert('Error', `Failed to get preferences: ${getErrorMessage(error)}`);
    }
  }, []);

  const handleCreateMockSession = useCallback(async () => {
    if (process.env.EXPO_OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    try {
      await createMockSession();
      Alert.alert('Success', 'Mock session created successfully!');
    } catch (error) {
      console.error('Failed to create mock session:', error);
      Alert.alert('Error', `Failed to create mock session: ${getErrorMessage(error)}`);
    }
  }, []);

  const resetToFirstRun = useCallback(async () => {
    if (process.env.EXPO_OS === 'ios') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }

    Alert.alert(
      'Reset Application',
      'This will clear all data and reset to first-run state. This cannot be undone. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log('Starting application reset...');

              // Before the rows, not after. Emptying `allbeers` first left a
              // window — app death, or a throw in the three awaits that used to
              // sit between — where the table is empty but the ETag is still
              // live. Every 304 path then trusts that ETag and returns without
              // rows. (The fourth await, clearing `all_beers_api_url`, closed
              // the window itself: `prepareAllBeers` then gets a null storeId
              // and never issues a conditional request at all.) Clearing the
              // ETag first inverts the failure into a harmless extra full fetch,
              // and `setPreference` retries contention where the
              // `beerRepository.clear()` below does not.
              await commitTaplistWrite({ kind: 'cleared' });

              await beerRepository.clear();
              console.log('Cleared all beers');

              await myBeersRepository.clear();
              console.log('Cleared tasted beers');

              await rewardsRepository.clear();
              console.log('Cleared rewards');

              const credentialCleanup = await Promise.allSettled([
                clearSessionData(),
                clearAuthCookies(),
                clearNativeCookies(),
              ]);
              const credentialCleanupFailure = credentialCleanup.find(
                result => result.status === 'rejected'
              );
              if (credentialCleanupFailure?.status === 'rejected') {
                throw credentialCleanupFailure.reason;
              }
              console.log('Cleared session data');
              console.log('Cleared authentication cookies');

              // Locked, like the login's gate-close write. The previous comment
              // here argued the opposite — that writing '' rather than a real
              // store URL made the lock unnecessary, because the guard treats ''
              // as "changed" and abandons. That reasoning only covers a '' that
              // lands BEFORE a writer's guard read. One landing after the guard
              // and before the commit leaves the old store's rows and validator
              // committed under a configuration that no longer names them, which
              // is the same bad commit the login-path fix closes.
              // UNTESTED, and untestable as things stand: there is no test file
              // anywhere in this repo referencing DeveloperSection. Removing
              // this lock leaves the entire suite at baseline, so nothing
              // protects it from being undone. Recorded rather than left
              // silent — the two sibling sites in LoginWebView each have a test
              // that stages the interleaving and goes red without the lock, and
              // this one only has the argument.
              await databaseLockManager.withDatabaseLock('developer-reset-config', async () => {
                await setPreference('all_beers_api_url', '', 'API endpoint for fetching all beers');
              });
              await setPreference(
                'my_beers_api_url',
                '',
                'API endpoint for fetching Beerfinder beers'
              );
              await setPreference(
                'first_launch',
                'true',
                'Flag indicating if this is the first app launch'
              );
              await setPreference(
                'is_visitor_mode',
                'false',
                'Flag indicating if user is in visitor mode'
              );
              await setPreference(
                'last_all_beers_refresh',
                '0',
                'Timestamp of last all beers refresh'
              );
              await setPreference(
                'last_my_beers_refresh',
                '0',
                'Timestamp of last my beers refresh'
              );
              console.log('Reset preferences to defaults');

              console.log('Application reset complete!');

              Alert.alert(
                'Reset Complete',
                'The application has been reset. Please restart the app.',
                [{ text: 'OK' }]
              );
            } catch (error) {
              console.error('Failed to reset application:', error);
              Alert.alert('Reset Failed', `An error occurred: ${getErrorMessage(error)}`, [
                { text: 'OK' },
              ]);
            }
          },
        },
      ]
    );
  }, []);

  if (!__DEV__) {
    return null;
  }

  return (
    <View testID="developer-section">
      <SettingsSection
        title="Developer Tools"
        footer={`Environment: ${process.env.NODE_ENV || 'development'} | __DEV__: ${__DEV__ ? 'true' : 'false'}`}
      >
        <SettingsItem
          icon="chart.bar.fill"
          title="Database Statistics"
          subtitle={dbStats || 'View database counts and refresh times'}
          accessoryType={isLoading ? 'loading' : 'chevron'}
          onPress={showDatabaseStats}
          disabled={isLoading}
        />

        <SettingsItem
          icon="clock.arrow.circlepath"
          title="Clear Refresh Timestamps"
          subtitle="Force data refresh on next start"
          accessoryType="chevron"
          onPress={clearRefreshTimestamps}
          disabled={isLoading}
        />

        <SettingsItem
          icon="gearshape.fill"
          title="View Preferences"
          subtitle="Display all app preference values"
          accessoryType="chevron"
          onPress={viewAllPreferences}
          disabled={isLoading}
        />

        <SettingsItem
          icon="flask.fill"
          title="Create Mock Session"
          subtitle="Create a mock session for testing"
          accessoryType="chevron"
          onPress={handleCreateMockSession}
          disabled={isLoading}
          testID="create-mock-session-button"
          showSeparator={false}
        />
      </SettingsSection>

      <SettingsSection title="Danger Zone" footer="Warning: This action cannot be undone.">
        <SettingsItem
          icon="arrow.counterclockwise"
          title="Reset to First-Run State"
          subtitle="Clear all data and settings"
          accessoryType="chevron"
          onPress={resetToFirstRun}
          disabled={isLoading}
          destructive
          showSeparator={false}
          testID="reset-first-run-button"
        />
      </SettingsSection>

      <Text style={[styles.devModeText, { color: colors.textSecondary }]}>
        Development mode - hidden in production builds
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  devModeText: {
    fontFamily: 'SpaceMono',
    fontSize: 11,
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 8,
    marginBottom: 16,
  },
});
