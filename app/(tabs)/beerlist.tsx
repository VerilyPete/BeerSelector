import { StyleSheet, View, Text } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { areApiUrlsConfigured } from '@/src/database/preferences';
import { checkAndRefreshOnAppOpen } from '@/src/services/dataUpdateService';
import ErrorBoundary from '@/components/ErrorBoundary';
import { logError } from '@/src/utils/errorLogger';
import { AllBeers } from '@/components/AllBeers';
import { useAppContext } from '@/context/AppContext';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/Colors';

function BeerListScreen() {
  const { session } = useAppContext();
  const colorScheme = useColorScheme() ?? 'dark';
  const colors = Colors[colorScheme];

  return (
    <View testID="all-beers-container" style={[styles.container, { backgroundColor: colors.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'right', 'left']}>
        <View style={styles.headerContainer}>
          <Text style={[styles.title, { color: colors.text }]}>All Beer</Text>
          <Ionicons name="notifications-outline" size={22} color={colors.textSecondary} />
        </View>
        <View style={styles.contentContainer}>
          <ErrorBoundary
            fallbackMessage="Failed to load beer list. Please try again."
            onError={(error, errorInfo) => {
              logError(error, {
                operation: 'AllBeers render',
                component: 'BeerListScreen',
                additionalData: { componentStack: errorInfo.componentStack },
              });
            }}
          >
            <AllBeers />
          </ErrorBoundary>
        </View>
      </SafeAreaView>
    </View>
  );
}

export default function TabOneScreen() {
  const [apiUrlsSet, setApiUrlsSet] = useState<boolean | null>(null);

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
        console.log('Beer list tab focused, checking for data updates');
        try {
          const result = await checkAndRefreshOnAppOpen(2);
          if (result.updated) {
            console.log('Beer data was updated when tab became active');
          }
        } catch (error) {
          console.error('Error refreshing data on tab focus:', error);
        }
      };
      refreshDataOnFocus();
      return () => {};
    }, [apiUrlsSet])
  );

  if (apiUrlsSet === null || !apiUrlsSet) return null;

  return (
    <ErrorBoundary
      fallbackMessage="Failed to load Beerfinder screen. Please try again."
      onError={(error, errorInfo) => {
        logError(error, {
          operation: 'BeerListScreen render',
          component: 'TabOneScreen',
          additionalData: { componentStack: errorInfo.componentStack },
        });
      }}
    >
      <BeerListScreen />
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    marginTop: 8,
    marginBottom: 16,
  },
  title: {
    fontFamily: 'Inter',
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  contentContainer: { flex: 1 },
});
