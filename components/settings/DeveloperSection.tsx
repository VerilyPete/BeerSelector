import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import * as Haptics from 'expo-haptics';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useThemeColor } from '@/hooks/useThemeColor';
import { beerRepository } from '@/src/database/repositories/BeerRepository';
import { myBeersRepository } from '@/src/database/repositories/MyBeersRepository';
import { rewardsRepository } from '@/src/database/repositories/RewardsRepository';
import { getPreference, setPreference } from '@/src/database/preferences';
import { createMockSession } from '@/src/api/mockSession';
import { clearSessionData } from '@/src/api/sessionManager';
import { clearUntappdCookies } from '@/src/database/db';

interface DeveloperSectionProps {
  cardColor: string;
  tintColor: string;
}

/**
 * Helper function to extract error message from unknown error type
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export default function DeveloperSection({ cardColor, tintColor }: DeveloperSectionProps) {
  const [dbStats, setDbStats] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const isMountedRef = useRef(true);

  // Get destructive color for danger zone (supports both light and dark mode)
  const destructiveColor = useThemeColor(
    { light: '#ff3b30', dark: '#ff453a' },
    'text'
  );

  // Track mounted state to prevent memory leaks
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Only render in development mode
  if (!__DEV__) {
    return null;
  }

  const showDatabaseStats = useCallback(async () => {
    // Add haptic feedback for button press
    if (process.env.EXPO_OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    if (isLoading) return; // Prevent duplicate requests

    try {
      setIsLoading(true);

      const allBeers = await beerRepository.getAll();
      const myBeers = await myBeersRepository.getAll();
      const rewards = await rewardsRepository.getAll();

      const lastAllBeersRefresh = await getPreference('last_all_beers_refresh');
      const lastMyBeersRefresh = await getPreference('last_my_beers_refresh');

      const stats = `
Database Statistics:
━━━━━━━━━━━━━━━━━━━
All Beers: ${allBeers.length}
Tasted Beers: ${myBeers.length}
Rewards: ${rewards.length}

Last Refresh:
All Beers: ${lastAllBeersRefresh ? new Date(parseInt(lastAllBeersRefresh)).toLocaleString() : 'Never'}
Tasted Beers: ${lastMyBeersRefresh ? new Date(parseInt(lastMyBeersRefresh)).toLocaleString() : 'Never'}
      `.trim();

      Alert.alert('Database Stats', stats, [{ text: 'OK' }]);

      // Only update state if component is still mounted
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
    // Add haptic feedback for button press
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
    // Add haptic feedback for button press
    if (process.env.EXPO_OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    try {
      // Get common preferences to display
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
    // Add haptic feedback for button press
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
    // Add warning haptic feedback for destructive action
    if (process.env.EXPO_OS === 'ios') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }

    Alert.alert(
      '⚠️ Reset Application',
      'This will:\n\n• Clear all beer data\n• Clear tasted beers\n• Clear rewards\n• Clear session cookies\n• Reset all settings to defaults\n• Set app to first-run state\n\nThis cannot be undone. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log('Starting application reset...');

              // Clear all data tables
              await beerRepository.clear();
              console.log('✓ Cleared all beers');

              await myBeersRepository.clear();
              console.log('✓ Cleared tasted beers');

              await rewardsRepository.clear();
              console.log('✓ Cleared rewards');

              // Clear Untappd cookies
              await clearUntappdCookies();
              console.log('✓ Cleared Untappd cookies');

              // Clear session data (Flying Saucer cookies)
              await clearSessionData();
              console.log('✓ Cleared session data');

              // Reset preferences using preferences module (consistent with rest of codebase)
              await setPreference('all_beers_api_url', '', 'API endpoint for fetching all beers');
              await setPreference('my_beers_api_url', '', 'API endpoint for fetching Beerfinder beers');
              await setPreference('first_launch', 'true', 'Flag indicating if this is the first app launch');
              await setPreference('is_visitor_mode', 'false', 'Flag indicating if user is in visitor mode');
              await setPreference('last_all_beers_refresh', '0', 'Timestamp of last all beers refresh');
              await setPreference('last_my_beers_refresh', '0', 'Timestamp of last my beers refresh');
              console.log('✓ Reset preferences to defaults');

              console.log('Application reset complete!');

              Alert.alert(
                'Reset Complete',
                'The application has been reset to first-run state. Please restart the app.',
                [{ text: 'OK' }]
              );
            } catch (error) {
              console.error('Failed to reset application:', error);
              Alert.alert(
                'Reset Failed',
                `An error occurred during reset:\n\n${getErrorMessage(error)}\n\nSome data may have been cleared.`,
                [{ text: 'OK' }]
              );
            }
          },
        },
      ]
    );
  }, []);

  return (
    <ThemedView style={[styles.card, { backgroundColor: cardColor }]} testID="developer-section">
      <ThemedText style={styles.cardTitle}>🛠️ Developer Tools</ThemedText>
      <ThemedText style={styles.devWarning}>
        (Development mode only - hidden in production)
      </ThemedText>

      <TouchableOpacity
        style={[styles.button, { borderColor: tintColor }]}
        onPress={showDatabaseStats}
        disabled={isLoading}
        accessible={true}
        accessibilityRole="button"
        accessibilityLabel="Database Statistics"
        accessibilityHint="Shows current database counts and last refresh times"
      >
        <ThemedText style={styles.buttonText}>
          {isLoading ? '⏳ Loading...' : '📊 Database Statistics'}
        </ThemedText>
        {!isLoading && dbStats ? (
          <ThemedText style={styles.statsText}>{dbStats}</ThemedText>
        ) : null}
        {isLoading && (
          <ActivityIndicator
            size="small"
            color={tintColor}
            style={styles.loadingIndicator}
          />
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, { borderColor: tintColor }]}
        onPress={clearRefreshTimestamps}
        disabled={isLoading}
        accessible={true}
        accessibilityRole="button"
        accessibilityLabel="Clear Refresh Timestamps"
        accessibilityHint="Forces a data refresh on next app start"
      >
        <ThemedText style={styles.buttonText}>🔄 Clear Refresh Timestamps</ThemedText>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, { borderColor: tintColor }]}
        onPress={viewAllPreferences}
        disabled={isLoading}
        accessible={true}
        accessibilityRole="button"
        accessibilityLabel="View Preferences"
        accessibilityHint="Displays all app preference values"
      >
        <ThemedText style={styles.buttonText}>⚙️ View Preferences</ThemedText>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, { borderColor: tintColor }]}
        onPress={handleCreateMockSession}
        disabled={isLoading}
        testID="create-mock-session-button"
        accessible={true}
        accessibilityRole="button"
        accessibilityLabel="Create Mock Session"
        accessibilityHint="Creates a mock session for testing purposes"
      >
        <ThemedText style={styles.buttonText}>🧪 Create Mock Session</ThemedText>
      </TouchableOpacity>

      <View style={styles.dangerZone}>
        <ThemedText style={[styles.dangerTitle, { color: destructiveColor }]}>
          ⚠️ Danger Zone
        </ThemedText>
        <TouchableOpacity
          style={[
            styles.dangerButton,
            { borderColor: destructiveColor, backgroundColor: `${destructiveColor}10` },
          ]}
          onPress={resetToFirstRun}
          disabled={isLoading}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Reset to First-Run State"
          accessibilityHint="Warning: Resets all app data and settings. This cannot be undone."
        >
          <ThemedText style={[styles.buttonText, { color: destructiveColor }]}>
            🔄 Reset to First-Run State
          </ThemedText>
        </TouchableOpacity>
      </View>

      <View style={styles.envInfo}>
        <ThemedText style={styles.envText}>
          Environment: {process.env.NODE_ENV || 'development'}
        </ThemedText>
        <ThemedText style={styles.envText}>
          __DEV__: {__DEV__ ? 'true' : 'false'}
        </ThemedText>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 20,
    borderRadius: 12,
    marginBottom: 20,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  devWarning: {
    fontSize: 12,
    opacity: 0.6,
    marginBottom: 16,
    fontStyle: 'italic',
  },
  button: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    minHeight: 44, // iOS HIG minimum touch target size
  },
  buttonText: {
    fontSize: 16,
  },
  statsText: {
    fontSize: 12,
    marginTop: 4,
    opacity: 0.7,
  },
  loadingIndicator: {
    marginTop: 8,
  },
  dangerZone: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 2,
    borderTopColor: 'rgba(255, 59, 48, 0.3)',
  },
  dangerTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  dangerButton: {
    borderWidth: 2,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    minHeight: 44, // iOS HIG minimum touch target size
  },
  envInfo: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(128, 128, 128, 0.2)',
  },
  envText: {
    fontSize: 12,
    opacity: 0.6,
    marginBottom: 4,
  },
});
