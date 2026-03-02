import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { ChromeStatusBar } from '@/components/ui/ChromeStatusBar';

import { TastedBrewList } from '@/components/TastedBrewList';
import { areApiUrlsConfigured } from '@/src/database/preferences';
import { checkAndRefreshOnAppOpen } from '@/src/services/dataUpdateService';
import ErrorBoundary from '@/components/ErrorBoundary';
import { logError } from '@/src/utils/errorLogger';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/Colors';

export default function TastedBrewsScreen() {
  const [apiUrlsSet, setApiUrlsSet] = useState<boolean | null>(null);
  const colorScheme = useColorScheme() ?? 'dark';
  const colors = Colors[colorScheme];

  useEffect(() => {
    const checkApiUrls = async () => {
      const isConfigured = await areApiUrlsConfigured();
      setApiUrlsSet(isConfigured);
      if (!isConfigured) {
        console.log('API URLs not configured, redirecting to settings');
        router.replace('/settings');
      }
    };
    checkApiUrls();
  }, []);

  useFocusEffect(
    useCallback(() => {
      const refreshDataOnFocus = async () => {
        if (!apiUrlsSet) return;
        console.log('Tasted Brews tab focused, checking for data updates');
        try {
          const result = await checkAndRefreshOnAppOpen(2);
          if (result.updated) {
            console.log('Beer data was updated when Tasted Brews tab became active');
          }
        } catch (error) {
          console.error('Error refreshing data on Tasted Brews tab focus:', error);
        }
      };
      refreshDataOnFocus();
      return () => {};
    }, [apiUrlsSet])
  );

  if (apiUrlsSet === null || !apiUrlsSet) return null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]} testID="tasted-brews-screen">
      <ChromeStatusBar />
      <View style={styles.headerContainer}>
        <Text style={[styles.title, { color: colors.text }]}>Tasted Brews</Text>

      </View>
      <ErrorBoundary
        fallbackMessage="Failed to load tasted brews. Please try again."
        onError={(error, errorInfo) => {
          logError(error, {
            operation: 'TastedBrewList render',
            component: 'TastedBrewsScreen',
            additionalData: { componentStack: errorInfo.componentStack },
          });
        }}
      >
        <TastedBrewList />
      </ErrorBoundary>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerContainer: {
    paddingHorizontal: 18,
    marginTop: 8,
    marginBottom: 16,
    gap: 4,
  },
  title: {
    fontFamily: 'SpaceGrotesk-Bold',
    fontSize: 26,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontFamily: 'SpaceMono',
    fontSize: 11,
  },
});
