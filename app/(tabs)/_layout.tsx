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

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarBackground: TabBarBackground,
        tabBarButton: HapticTab,
        tabBarStyle: Platform.select({
          ios: {
            position: 'absolute',
          },
          default: {},
        }),
      }}>
      
      {/* Conditionally render spacer tabs in visitor mode */}
      {isInVisitorMode && (
        <Tabs.Screen
          name="spacer_left"
          options={{
            title: "",
            tabBarShowLabel: false,
            tabBarIcon: () => null,
            tabBarStyle: { display: 'none' }
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
          tabBarLabelStyle: {
            fontSize: 12,
          }
        }}
      />
      
      {/* Conditionally render middle spacer in visitor mode */}
      {isInVisitorMode && (
        <Tabs.Screen
          name="spacer_middle"
          options={{
            title: "",
            tabBarShowLabel: false,
            tabBarIcon: () => null,
            tabBarStyle: { display: 'none' }
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
          tabBarLabelStyle: {
            fontSize: 12,
          }
        }}
      />
      
      {/* Conditionally render right spacer in visitor mode */}
      {isInVisitorMode && (
        <Tabs.Screen
          name="spacer_right"
          options={{
            title: "",
            tabBarShowLabel: false,
            tabBarIcon: () => null,
            tabBarStyle: { display: 'none' }
          }}
          listeners={{
            tabPress: (e) => {
              // Prevent navigation
              e.preventDefault();
            },
          }}
        />
      )}
      
      {/* Only show Beerfinder and Tasted Brews tabs when not in visitor mode */}
      {!isInVisitorMode && (
        <>
          <Tabs.Screen
            name="mybeers"
            options={{
              title: 'Beerfinder',
              tabBarIcon: ({ color }) => <IconSymbol size={28} name="star.fill" color={color} />,
              tabBarLabelStyle: {
                fontSize: 12,
              }
            }}
          />
          
          <Tabs.Screen
            name="tastedbrews"
            options={{
              title: 'Tasted Brews',
              tabBarIcon: ({ color }) => <IconSymbol size={28} name="checkmark.circle.fill" color={color} />,
              tabBarLabelStyle: {
                fontSize: 12,
              }
            }}
          />
        </>
      )}
    </Tabs>
  );
}
const styles = StyleSheet.create({
  spacer: {
    flex: 1,
    height: '100%',
  },
});

