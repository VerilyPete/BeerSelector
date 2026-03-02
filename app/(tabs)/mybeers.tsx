import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { ChromeStatusBar } from '@/components/ui/ChromeStatusBar';
import { ScanlineTitle } from '@/components/ui/ScanlineTitle';

import { Beerfinder } from '@/components/Beerfinder';
import { areApiUrlsConfigured } from '@/src/database/preferences';
import { checkAndRefreshOnAppOpen } from '@/src/services/dataUpdateService';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/Colors';

export default function MyBeersScreen() {
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
        console.log('Beerfinder tab focused, checking for data updates');
        try {
          const result = await checkAndRefreshOnAppOpen(2);
          if (result.updated) {
            console.log('Beer data was updated when Beerfinder tab became active');
          }
        } catch (error) {
          console.error('Error refreshing data on Beerfinder tab focus:', error);
        }
      };
      refreshDataOnFocus();
      return () => {};
    }, [apiUrlsSet])
  );

  if (apiUrlsSet === null || !apiUrlsSet) return null;

  return (
    <View
      style={[styles.container, { backgroundColor: colors.background }]}
      testID="beerfinder-screen"
    >
      <ChromeStatusBar />
      <View style={styles.headerContainer}>
        <ScanlineTitle title="Beerfinder" />
      </View>
      <Beerfinder />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerContainer: {
    paddingHorizontal: 18,
    marginTop: 8,
    marginBottom: 16,
  },
});
