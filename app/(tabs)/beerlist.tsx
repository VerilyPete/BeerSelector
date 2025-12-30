import { StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { areApiUrlsConfigured } from '@/src/database/preferences';
import { checkAndRefreshOnAppOpen } from '@/src/services/dataUpdateService';
import ErrorBoundary from '@/components/ErrorBoundary';
import { logError } from '@/src/utils/errorLogger';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { AllBeers } from '@/components/AllBeers';
import { useAppContext } from '@/context/AppContext';
import { spacing } from '@/constants/spacing';

/**
 * BeerListScreen Component
 * Displays the All Beer view with header and visitor mode indicator
 */
function BeerListScreen() {
  const { session } = useAppContext();

  return (
    <ThemedView testID="all-beers-container" style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'right', 'left']}>
        <View style={styles.headerContainer}>
          <ThemedText type="title" style={styles.title}>
            All Beer
          </ThemedText>
          {session.isVisitor && (
            <View testID="visitor-mode-badge" style={styles.visitorBadge}>
              <ThemedText style={styles.visitorText}>Guest</ThemedText>
            </View>
          )}
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
    </ThemedView>
  );
}

export default function TabOneScreen() {
  const [apiUrlsSet, setApiUrlsSet] = useState<boolean | null>(null);

  // Check if API URLs are configured on component mount
  useEffect(() => {
    const checkApiUrls = async () => {
      const isConfigured = await areApiUrlsConfigured();
      setApiUrlsSet(isConfigured);

      // If API URLs aren't set, redirect to settings
      if (!isConfigured) {
        console.log('API URLs not configured, redirecting to settings');
        router.replace('/settings');
      }
    };

    checkApiUrls();
  }, []);

  // Add focus effect to refresh beer data when tab becomes active
  useFocusEffect(
    useCallback(() => {
      const refreshDataOnFocus = async () => {
        // Don't attempt refresh if API URLs aren't configured
        if (!apiUrlsSet) return;

        console.log('Beer list tab focused, checking for data updates');

        try {
          // Use the same refresh mechanism that runs on app startup
          const result = await checkAndRefreshOnAppOpen(2);
          if (result.updated) {
            console.log('Beer data was updated when tab became active');
          }
        } catch (error) {
          console.error('Error refreshing data on tab focus:', error);
        }
      };

      refreshDataOnFocus();

      return () => {
        // Cleanup if needed
      };
    }, [apiUrlsSet])
  );

  // Don't render anything until we've checked API URL status
  if (apiUrlsSet === null) {
    return null;
  }

  // Only render the beer list if API URLs are configured
  if (!apiUrlsSet) {
    return null; // We're redirecting, so no need to render anything
  }

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
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.m,
    marginTop: spacing.s,
    marginBottom: spacing.m,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  visitorBadge: {
    backgroundColor: '#FFB74D',
    paddingHorizontal: spacing.s,
    paddingVertical: spacing.xs,
    borderRadius: 12,
    marginLeft: spacing.s,
  },
  visitorText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#000',
  },
  contentContainer: {
    flex: 1,
  },
});
