import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { BeerListScreen } from './index';
import { areApiUrlsConfigured } from '@/src/database/db';
import { isVisitorMode } from '@/src/api/authService';

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
  
  // Don't render anything until we've checked API URL status
  if (apiUrlsSet === null) {
    return null;
  }
  
  // Only render the beer list if API URLs are configured
  if (!apiUrlsSet) {
    return null; // We're redirecting, so no need to render anything
  }
  
  return <BeerListScreen />;
} 