import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { BeerListScreen } from './index';
import { areApiUrlsConfigured } from '@/src/database/preferences';
import { isVisitorMode } from '@/src/api/authService';
import { checkAndRefreshOnAppOpen } from '@/src/services/dataUpdateService';
import ErrorBoundary from '@/components/ErrorBoundary';
import { logError } from '@/src/utils/errorLogger';

export default function TabOneScreen() {
  const [apiUrlsSet, setApiUrlsSet] = useState<boolean | null>(null);
  const [visitorMode, setVisitorMode] = useState(false);
  
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
  
  // Add effect to check visitor mode
  useEffect(() => {
    const checkVisitorMode = async () => {
      const visitor = await isVisitorMode(true); // Force refresh
      setVisitorMode(visitor);
    };
    
    checkVisitorMode();
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