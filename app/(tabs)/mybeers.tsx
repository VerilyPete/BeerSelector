import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';

import { Beerfinder } from '@/components/Beerfinder';
import { areApiUrlsConfigured } from '@/src/database/preferences';
import { checkAndRefreshOnAppOpen } from '@/src/services/dataUpdateService';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/Colors';

export default function MyBeersScreen() {
  const [apiUrlsSet, setApiUrlsSet] = useState<boolean | null>(null);
  const insets = useSafeAreaInsets();
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
    <View style={[styles.container, { backgroundColor: colors.background }]} testID="beerfinder-screen">
      <View style={[styles.chromeBar, { height: insets.top, backgroundColor: colors.chromeBar }]} />
      <Text style={[styles.title, { color: colors.text }]}>Beerfinder</Text>
      <Beerfinder />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  chromeBar: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.15)',
  },
  title: {
    fontFamily: 'SpaceGrotesk-Bold',
    fontSize: 26,
    letterSpacing: -0.5,
    marginBottom: 16,
    marginTop: 8,
    marginLeft: 18,
  },
});
