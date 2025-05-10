import { Tabs, useFocusEffect } from 'expo-router';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Platform } from 'react-native';

import { HapticTab } from '@/components/HapticTab';
import { IconSymbol } from '@/components/ui/IconSymbol';
import TabBarBackground from '@/components/ui/TabBarBackground';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { isVisitorMode } from '@/src/api/authService';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const [isInVisitorMode, setIsInVisitorMode] = useState(false);
  
  // Function to check visitor mode
  const checkVisitorMode = useCallback(async () => {
    try {
      // Only log in development
      if (__DEV__) {
        console.log('TabLayout checking visitor mode...');
      }
      const visitorMode = await isVisitorMode(true); // Force refresh to ensure we have latest status
      console.log('Visitor mode status:', visitorMode);
      setIsInVisitorMode(visitorMode);
    } catch (error) {
      console.error('Error checking visitor mode:', error);
      setIsInVisitorMode(false);
    }
  }, []);
  
  // Check visitor mode on component mount
  useEffect(() => {
    checkVisitorMode();
  }, [checkVisitorMode]);
  
  // Only recheck on focus if we've been away for a while (helps reduce frequent checks)
  const lastCheckTime = useRef(Date.now());
  
  useFocusEffect(
    useCallback(() => {
      // Always check visitor mode status when tabs gain focus
      if (__DEV__) {
        console.log('Tab layout focused, rechecking visitor mode');
      }
      checkVisitorMode();
      lastCheckTime.current = Date.now();
      return () => {};
    }, [checkVisitorMode])
  );

  // For debugging purposes
  useEffect(() => {
    console.log('Tab layout rendering with visitor mode:', isInVisitorMode);
  }, [isInVisitorMode]);

  // Map of tab names to their configs to ensure consistency
  const tabConfigs = {
    home: {
      title: 'Home',
      icon: 'house.fill'
    },
    allBeer: {
      title: 'All Beer',
      icon: 'mug.fill'
    },
    beerfinder: {
      title: 'Beerfinder',
      icon: 'star.fill'
    },
    tastedBrews: {
      title: 'Tasted Brews',
      icon: 'checkmark.circle.fill'
    }
  };

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarBackground: TabBarBackground,
        tabBarStyle: Platform.select({
          ios: {
            // Use a transparent background on iOS to show the blur effect
            position: 'absolute',
          },
          default: {},
        }),
      }}>
      
      {/* Home tab - always visible */}
      <Tabs.Screen
        name="index"
        options={{
          title: tabConfigs.home.title,
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
        }}
      />
      
      {/* All Beer tab - always visible */}
      <Tabs.Screen
        name="beerlist"
        options={{
          title: tabConfigs.allBeer.title,
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="mug.fill" color={color} />,
        }}
      />
      
      {/* Beerfinder tab - conditionally hidden in visitor mode */}
      <Tabs.Screen
        name="mybeers"
        options={{
          title: tabConfigs.beerfinder.title,
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="star.fill" color={color} />,
          // Hide tab when in visitor mode
          href: isInVisitorMode ? null : undefined,
        }}
      />
      
      {/* Tasted Brews tab - conditionally hidden in visitor mode */}
      <Tabs.Screen
        name="tastedbrews"
        options={{
          title: tabConfigs.tastedBrews.title,
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="checkmark.circle.fill" color={color} />,
          // Hide tab when in visitor mode
          href: isInVisitorMode ? null : undefined,
        }}
      />
    </Tabs>
  );
}

