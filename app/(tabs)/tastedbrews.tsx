import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';

import { TastedBrewList } from '@/components/TastedBrewList';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { areApiUrlsConfigured } from '@/src/database/preferences';
import { checkAndRefreshOnAppOpen } from '@/src/services/dataUpdateService';
import ErrorBoundary from '@/components/ErrorBoundary';
import { logError } from '@/src/utils/errorLogger';

export default function TastedBrewsScreen() {
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
        
        console.log('Tasted Brews tab focused, checking for data updates');
        
        try {
          // Use the same refresh mechanism that runs on app startup
          const result = await checkAndRefreshOnAppOpen(2);
          if (result.updated) {
            console.log('Beer data was updated when Tasted Brews tab became active');
          }
        } catch (error) {
          console.error('Error refreshing data on Tasted Brews tab focus:', error);
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
    <ThemedView style={styles.container} testID="tasted-brews-screen">
      <SafeAreaView style={styles.safeArea} edges={['top', 'right', 'left']}>
        <ThemedText type="title" style={styles.title}>Tasted Brews</ThemedText>
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
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
    marginTop: 8,
    marginLeft: 16,
  },
}); 