import { Tabs, useFocusEffect } from 'expo-router';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { HapticTab } from '@/components/HapticTab';
import { IconSymbol } from '@/components/ui/IconSymbol';
import TabBarBackground from '@/components/ui/TabBarBackground';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { isVisitorMode } from '@/src/api/authService';

// Empty component that takes up space but is not interactive
const SpacerTab = () => <View style={styles.spacer} />;

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

  // In visitor mode, use a specific tab button function for each position
  // This approach gives us more control over each position in the tab bar
  const getVisitorTabButton = (position: number) => {
    if (!isInVisitorMode) return HapticTab;
    
    // The layout in visitor mode is:
    // [Empty] [Home] [Empty] [All Beer] [Empty]
    switch (position) {
      case 0: // Left spacer - invisible but takes up space
        return () => <SpacerTab />;
      case 1: // Home tab - visible
        return HapticTab;
      case 2: // Middle spacer - invisible but takes up space
        return () => <SpacerTab />;
      case 3: // All Beer tab - visible
        return HapticTab;
      case 4: // Right spacer - invisible but takes up space
        return () => <SpacerTab />;
      default:
        return () => null; // Other tabs are hidden completely
    }
  };

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarBackground: TabBarBackground,
        tabBarStyle: Platform.select({
          ios: {
            position: 'absolute',
          },
          default: {},
        }),
      }}>
      {/* Left spacer tab in visitor mode */}
      {isInVisitorMode && (
        <Tabs.Screen
          name="spacer_left"
          options={{
            title: "",
            tabBarButton: getVisitorTabButton(0),
            tabBarShowLabel: false,
          }}
          listeners={{
            tabPress: (e) => {
              // Prevent navigation
              e.preventDefault();
            },
          }}
        />
      )}
      
      {/* Home tab */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
          tabBarButton: isInVisitorMode ? getVisitorTabButton(1) : HapticTab,
        }}
      />
      
      {/* Middle spacer tab in visitor mode */}
      {isInVisitorMode && (
        <Tabs.Screen
          name="spacer_middle"
          options={{
            title: "",
            tabBarButton: getVisitorTabButton(2),
            tabBarShowLabel: false,
          }}
          listeners={{
            tabPress: (e) => {
              // Prevent navigation
              e.preventDefault();
            },
          }}
        />
      )}
      
      {/* All Beer tab */}
      <Tabs.Screen
        name="beerlist"
        options={{
          title: 'All Beer',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="mug.fill" color={color} />,
          tabBarButton: isInVisitorMode ? getVisitorTabButton(3) : HapticTab,
        }}
      />
      
      {/* Right spacer tab in visitor mode */}
      {isInVisitorMode && (
        <Tabs.Screen
          name="spacer_right"
          options={{
            title: "",
            tabBarButton: getVisitorTabButton(4),
            tabBarShowLabel: false,
          }}
          listeners={{
            tabPress: (e) => {
              // Prevent navigation
              e.preventDefault();
            },
          }}
        />
      )}
      
      {/* Beerfinder tab - hidden in visitor mode */}
      <Tabs.Screen
        name="mybeers"
        options={{
          title: 'Beerfinder',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="star.fill" color={color} />,
          tabBarButton: isInVisitorMode ? () => null : HapticTab,
        }}
      />
      
      {/* Tasted Brews tab - hidden in visitor mode */}
      <Tabs.Screen
        name="tastedbrews"
        options={{
          title: 'Tasted Brews',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="checkmark.circle.fill" color={color} />,
          tabBarButton: isInVisitorMode ? () => null : HapticTab,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  spacer: {
    flex: 1,
    height: '100%',
  },
});
