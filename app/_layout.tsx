import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState, useRef } from 'react';
import 'react-native-reanimated';
import { LogBox, Alert, AppState, AppStateStatus } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useColorScheme } from '@/hooks/useColorScheme';
import { initializeBeerDatabase } from '@/src/database/db';
import { getPreference, setPreference, areApiUrlsConfigured } from '@/src/database/preferences';
import { getDatabase, closeDatabaseConnection } from '@/src/database/connection';

// Disable react-devtools connection to port 8097
if (__DEV__) {
  const originalConsoleError = console.error;
  console.error = (...args) => {
    if (
      args[0] &&
      typeof args[0] === 'string' &&
      (args[0].includes('nw_connection') ||
       args[0].includes('quic_conn') ||
       args[0].includes('8097') ||
       args[0].includes('timestamp_locked_on_nw_queue') ||
       args[0].includes('Hit maximum timestamp count'))
    ) {
      return;
    }
    originalConsoleError(...args);
  };
  LogBox.ignoreLogs([
    'nw_connection',
    'nw_socket',
    'quic_conn',
    'Hit maximum timestamp count',
    'timestamp_locked_on_nw_queue'
  ]);
}

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });
  const [initialRoute, setInitialRoute] = useState<string | null>(null);
  const initializationStarted = useRef(false);
  const lifecycleOperationInProgress = useRef(false);

  useEffect(() => {
    async function prepare() {
      // Prevent duplicate initialization
      if (initializationStarted.current) {
        console.log('[DUPLICATE PREVENTED] Initialization already started (useRef guard caught duplicate useEffect run), skipping...');
        return;
      }
      initializationStarted.current = true;

      try {
        // Initialize database with retry mechanism
        let dbInitialized = false;

        try {
          console.log('Initializing database first attempt...');
          await initializeBeerDatabase();
          dbInitialized = true;
          console.log('Database initialized successfully');

          // Check if API URLs are set using centralized helper
          const apiUrlsConfigured = await areApiUrlsConfigured();
          const isFirstLaunch = await getPreference('first_launch');

          // If API URLs are empty or it's first launch, set initial route to settings
          if (!apiUrlsConfigured || isFirstLaunch === 'true') {
              console.log('API URLs not set or first launch, redirecting to settings page');
              // Mark that it's no longer the first launch
              if (isFirstLaunch === 'true') {
                await setPreference('first_launch', 'false', 'Flag indicating if this is the first app launch');
              }

              // Set initial route to settings
              setInitialRoute('/settings');
            } else {
              // Normal app startup flow
              setInitialRoute('(tabs)');

              // Initial data load is handled by initializeBeerDatabase() above
              // (all beers, my beers, and rewards are fetched during initialization)
              // User-triggered refreshes will still work via pull-to-refresh gestures
              console.log('Database initialization complete - initial data already loaded');
            }
          } catch (dbError) {
            console.error('Database initialization failed, retrying once:', dbError);

            if (!dbInitialized) {
              // Wait a moment and try again once
              await new Promise(resolve => setTimeout(resolve, 1000));
              try {
                console.log('Attempting database initialization retry...');
                await initializeBeerDatabase();
                console.log('Database initialized successfully on retry');
                setInitialRoute('(tabs)');
              } catch (retryError) {
                console.error('Database initialization failed on retry:', retryError);
                // Continue anyway - we'll handle database errors in the components
                setInitialRoute('(tabs)');
              }
            } else {
              console.log('Database was already initialized but another error occurred');
              // Database was initialized but something else failed
              setInitialRoute('(tabs)');
            }
          }

        // Do NOT hide splash screen here - it will be hidden after navigation completes
      } catch (error) {
        console.error('Error during app initialization:', error);
        // Continue anyway to allow the app to start
        setInitialRoute('(tabs)');
      }
    }

    prepare();
  }, [loaded]);

  // Database lifecycle management - close on background, reopen on foreground
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (lifecycleOperationInProgress.current) {
        console.warn('Database lifecycle operation already in progress, skipping...');
        return;
      }

      lifecycleOperationInProgress.current = true;
      try {
        if (nextAppState === 'background') {
          console.log('App backgrounding, closing database...');
          try {
            await closeDatabaseConnection();
          } catch (error) {
            console.error('Error closing database on background:', error);
          }
        } else if (nextAppState === 'active') {
          console.log('App foregrounding, reopening database...');
          try {
            await getDatabase();
          } catch (error) {
            console.error('Error reopening database on foreground:', error);
          }
        }
      } finally {
        lifecycleOperationInProgress.current = false;
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, []);

  // Navigate to initial route once determined and hide splash screen
  useEffect(() => {
    if (loaded && initialRoute) {
      console.log(`Navigating to initial route: ${initialRoute}`);
      router.replace(initialRoute as any);

      // Hide splash screen after navigation starts
      // Small delay ensures the new screen has begun rendering
      const hideSplash = async () => {
        try {
          await SplashScreen.hideAsync();
          console.log('Splash screen hidden successfully');
        } catch (error) {
          console.warn('Error hiding splash screen:', error);
        }
      };

      // Use a small timeout to ensure navigation has started
      setTimeout(hideSplash, 150);
    }
  }, [loaded, initialRoute]);

  // Wait until we've determined the initial route
  if (!loaded || !initialRoute) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="settings" options={{ headerShown: false }} />
          <Stack.Screen name="screens/rewards" options={{ headerShown: false }} />
          <Stack.Screen name="+not-found" />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
