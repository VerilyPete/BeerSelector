import { StyleSheet, Text, View, TouchableOpacity, Alert } from 'react-native';
import React, { useState, useEffect, useCallback } from 'react';
import Animated, {
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { IconSymbol } from '@/components/ui/IconSymbol';
import { StatusBar } from 'expo-status-bar';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { AllBeers } from '@/components/AllBeers';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useThemeColor } from '@/hooks/useThemeColor';
import { areApiUrlsConfigured, getPreference } from '@/src/database/preferences';
import { isVisitorMode } from '@/src/api/authService';
import ErrorBoundary from '@/components/ErrorBoundary';
import { logError } from '@/src/utils/errorLogger';

export function BeerListScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const backgroundColor = useThemeColor({}, 'background');
  const [visitorMode, setVisitorMode] = useState(false);
  
  // Function to check visitor mode
  const checkVisitorMode = useCallback(async () => {
    const isVisitor = await isVisitorMode(true);
    setVisitorMode(isVisitor);
  }, []);
  
  // Check for visitor mode on mount
  useEffect(() => {
    checkVisitorMode();
  }, [checkVisitorMode]);
  
  // Recheck when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      console.log('Beer list screen focused, checking visitor mode');
      checkVisitorMode();
      return () => {
        // cleanup if needed
      };
    }, [checkVisitorMode])
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={{flex: 1}} edges={['top', 'right', 'left']}>
        <View style={styles.headerContainer}>
          <ThemedText type="title" style={styles.title}>All Beer</ThemedText>
          {visitorMode && (
            <View style={styles.visitorBadge}>
              <ThemedText style={styles.visitorText}>Guest</ThemedText>
            </View>
          )}
        </View>
        <View style={{flex: 1}}>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    flexGrow: 1,
  },
  titleContainer: {
    padding: 16,
    paddingBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
    marginTop: 8,
    marginLeft: 16,
  },
  beerListContainer: {
    flexGrow: 1,
  },
  homeContainer: {
    flex: 1,
  },
  homeContentContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    paddingTop: 60,
  },
  welcomeTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  welcomeText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 40,
    paddingHorizontal: 20,
  },
  mainButton: {
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 30,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    minWidth: 220,
    alignItems: 'center',
  },
  mainButtonText: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
  },
  settingsButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    padding: 12,
    zIndex: 1,
    backgroundColor: 'rgba(200, 200, 200, 0.3)',
    borderRadius: 30,
  },
  loginPrompt: {
    marginBottom: 40,
    paddingHorizontal: 20,
    textAlign: 'center',
  },
  visitorNote: {
    marginTop: 16,
    fontStyle: 'italic',
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 16,
  },
  visitorBadge: {
    backgroundColor: '#FFB74D',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
  },
  visitorText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#000',
  },
});

export default function HomeScreen() {
  const backgroundColor = useThemeColor({}, 'background');
  const buttonColor = useThemeColor({}, 'tint');
  const colorScheme = useColorScheme() ?? 'light';
  const [apiUrlsSet, setApiUrlsSet] = useState<boolean | null>(null);
  const [inVisitorMode, setInVisitorMode] = useState(false);

  // Function to check settings
  const checkSettings = useCallback(async () => {
    try {
      // First check if we're in visitor mode - force refresh to ensure we have latest value
      const visitorMode = await isVisitorMode(true);
      setInVisitorMode(visitorMode);

      // Use centralized helper to check API URLs (same logic as _layout.tsx)
      const isConfigured = await areApiUrlsConfigured();

      setApiUrlsSet(isConfigured);

      if (!isConfigured) {
        // Log for debugging - _layout.tsx handles initial routing
        if (visitorMode) {
          console.log('Warning: All beers API URL not configured in visitor mode');
        } else {
          console.log('Warning: API URLs not configured, showing login prompt');
        }
      }
    } catch (error) {
      console.error('Error checking settings:', error);
      setApiUrlsSet(false);
      setInVisitorMode(false);
    }
  }, []);

  // Initial settings check on mount
  useEffect(() => {
    console.log('HomeScreen mounted, checking settings');
    checkSettings();
  }, [checkSettings]);
  
  // Reduce the frequency of rechecks on focus - only do it if something changes
  useFocusEffect(
    useCallback(() => {
      // Always check settings when the home screen is focused to ensure we have the most recent visitor mode status
      console.log('HomeScreen focused, checking settings');
      checkSettings();
      return () => {
        // cleanup if needed
      };
    }, [checkSettings])
  );

  // If in visitor mode and API URLs are configured, redirect to beer list tab
  useEffect(() => {
    if (inVisitorMode && apiUrlsSet) {
      console.log('In visitor mode with API URLs configured - showing visitor home screen');
      // No longer auto-redirecting to beer list
    }
  }, [inVisitorMode, apiUrlsSet]);

  // Determine the appropriate button text color based on theme
  const buttonTextColor = colorScheme === 'dark' ? '#000000' : '#FFFFFF';

  // If we're still checking API URL status, show nothing
  if (apiUrlsSet === null) {
    return null;
  }

  // If API URLs aren't set, render a login prompt
  if (!apiUrlsSet) {
    return (
      <ThemedView style={[styles.homeContainer, { backgroundColor }]}>
        <SafeAreaView style={styles.homeContentContainer} edges={['top', 'right', 'left']}>
          <ThemedText type="title" style={styles.welcomeTitle}>Welcome to Beer Selector</ThemedText>
          <ThemedText style={[styles.welcomeText, styles.loginPrompt]}>
            {inVisitorMode ? 
              'Unable to load beer data. Please try logging in again as a visitor.' : 
              'Please log in to your UFO Club account or as a Visitor to start using the app.'}
          </ThemedText>
          <TouchableOpacity
            style={[styles.mainButton, { backgroundColor: buttonColor }]}
            onPress={() => router.navigate('/settings?action=login')}
          >
            <Text style={[styles.mainButtonText, { color: buttonTextColor }]}>Login</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </ThemedView>
    );
  }

  // Modified: Show a visitor-specific home screen instead of redirecting or returning null
  if (inVisitorMode) {
    return (
      <ThemedView style={[styles.homeContainer, { backgroundColor }]}>
        <SafeAreaView style={styles.homeContentContainer} edges={['top', 'right', 'left']}>
          {/* Settings button in top right */}
          <TouchableOpacity
            style={styles.settingsButton}
            onPress={() => router.navigate('/settings')}
          >
            <IconSymbol name="gear" size={28} color={buttonColor} />
          </TouchableOpacity>

          <ThemedText type="title" style={styles.welcomeTitle}>Welcome to Beer Selector</ThemedText>
          <ThemedText style={styles.welcomeText}>
            You're logged in as a Visitor. Please login with your UFO Club account to view the Beerfinder, Tasted Brews, and Rewards.
          </ThemedText>
          <TouchableOpacity
            style={[styles.mainButton, { backgroundColor: buttonColor, marginBottom: 16 }]}
            onPress={() => router.navigate('/(tabs)/beerlist')}
          >
            <Text style={[styles.mainButtonText, { color: buttonTextColor }]}>All Beer</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </ThemedView>
    );
  }

  // Normal view when API URLs are set and not in visitor mode
  return (
    <ThemedView style={[styles.homeContainer, { backgroundColor }]}>
      <SafeAreaView style={styles.homeContentContainer} edges={['top', 'right', 'left']}>
        {/* Settings button in top right */}
        <TouchableOpacity
          style={styles.settingsButton}
          onPress={() => router.navigate('/settings')}
        >
          <IconSymbol name="gear" size={28} color={buttonColor} />
        </TouchableOpacity>

        <ThemedText type="title" style={styles.welcomeTitle}>Welcome to Beer Selector</ThemedText>
        <ThemedText style={styles.welcomeText}>
          What are you drinking tonight?
        </ThemedText>
        <TouchableOpacity
          style={[styles.mainButton, { backgroundColor: buttonColor, marginBottom: 16 }]}
          onPress={() => router.navigate('/(tabs)/beerlist')}
        >
          <Text style={[styles.mainButtonText, { color: buttonTextColor }]}>All Beer</Text>
        </TouchableOpacity>
        {!inVisitorMode && (
          <>
            <TouchableOpacity
              style={[styles.mainButton, { backgroundColor: buttonColor, marginBottom: 16 }]}
              onPress={() => router.navigate('/(tabs)/mybeers')}
            >
              <Text style={[styles.mainButtonText, { color: buttonTextColor }]}>Beerfinder</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.mainButton, { backgroundColor: buttonColor, marginBottom: 16 }]}
              onPress={() => router.navigate('/(tabs)/tastedbrews')}
            >
              <Text style={[styles.mainButtonText, { color: buttonTextColor }]}>Tasted Brews</Text>
            </TouchableOpacity>
          </>
        )}
        <TouchableOpacity
          style={[styles.mainButton, { backgroundColor: buttonColor }]}
          onPress={() => router.push("/screens/rewards" as any)}
        >
          <Text style={[styles.mainButtonText, { color: buttonTextColor }]}>Rewards</Text>
        </TouchableOpacity>
      </SafeAreaView>
    </ThemedView>
  );
}
