import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';

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
      <SafeAreaView style={styles.safeArea} edges={['top', 'right', 'left']}>
        <View style={styles.headerContainer}>
          <Text style={[styles.title, { color: colors.text }]}>Tasted Brews</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Your tasting history</Text>
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
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  headerContainer: {
    paddingHorizontal: 24,
    marginTop: 8,
    marginBottom: 16,
    gap: 4,
  },
  title: {
    fontFamily: 'Inter',
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontFamily: 'Space Mono',
    fontSize: 11,
  },
});
