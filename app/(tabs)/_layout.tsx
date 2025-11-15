import { Tabs } from 'expo-router';
import React, { useEffect } from 'react';
import { Platform } from 'react-native';

import { HapticTab } from '@/components/HapticTab';
import { IconSymbol } from '@/components/ui/IconSymbol';
import TabBarBackground from '@/components/ui/TabBarBackground';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useAppContext } from '@/context/AppContext';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { session } = useAppContext();

  // Use session.isVisitor from context (single source of truth)
  const isInVisitorMode = session.isVisitor;

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

