import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import 'react-native-reanimated';
import { LogBox, Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useColorScheme } from '@/hooks/useColorScheme';
import { initializeBeerDatabase, getPreference, setPreference } from '@/src/database/db';
import { checkAndRefreshOnAppOpen, manualRefreshAllData, fetchAndUpdateRewards } from '@/src/services/dataUpdateService';
import { getUserFriendlyErrorMessage } from '@/src/utils/notificationUtils';

// Track if database initialization has been started to prevent multiple calls
let dbInitStarted = false;

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

  useEffect(() => {
    async function prepare() {
      try {
        // Initialize database with retry mechanism
        let dbInitialized = false;

        // Only attempt database initialization if not already started
        if (!dbInitStarted) {
          dbInitStarted = true; // Mark as started immediately

          try {
            console.log('Initializing database first attempt...');
            await initializeBeerDatabase();
            dbInitialized = true;
            console.log('Database initialized successfully');

            // Check if API URLs are set
            const allBeersApiUrl = await getPreference('all_beers_api_url');
            const myBeersApiUrl = await getPreference('my_beers_api_url');
            const isFirstLaunch = await getPreference('first_launch');

            // If API URLs are empty or it's first launch, set initial route to settings
            if ((!allBeersApiUrl || !myBeersApiUrl || isFirstLaunch === 'true') && loaded) {
              console.log('API URLs not set or first launch, redirecting to settings page');
              // Mark that it's no longer the first launch
              if (isFirstLaunch === 'true') {
                await setPreference('first_launch', 'false', 'Flag indicating if this is the first app launch');
              }

              // Set initial route to settings
              setInitialRoute('/settings');
              // Navigate immediately to settings
              router.replace('/settings');
            } else {
              // Normal app startup flow
              setInitialRoute('(tabs)');

              // Only check for updates if API URLs are configured
              if (allBeersApiUrl || myBeersApiUrl) {
                // Always refresh core data on app open, and refresh rewards as well
                try {
                  // Kick off core data refresh and rewards refresh in parallel
                  const refreshPromises: Promise<any>[] = [];
                  refreshPromises.push(manualRefreshAllData());
                  refreshPromises.push(fetchAndUpdateRewards());

                  Promise.allSettled(refreshPromises).then(results => {
                    const coreResult = results[0];
                    if (coreResult.status === 'fulfilled') {
                      const value: any = coreResult.value;
                      if (value && !value.hasErrors) {
                        console.log('Core data refreshed successfully on app open');
                      } else if (value && value.hasErrors) {
                        console.warn('Core data refresh completed with errors on app open');
                      }
                    }
                  }).catch(err => {
                    console.error('Error during startup data refresh:', err);
                  });
                } catch (e) {
                  console.error('Failed to initiate startup data refresh:', e);
                }
              } else {
                console.log('API URLs not configured, skipping automatic data refresh');
              }
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
        } else {
          console.log('Database initialization already in progress in another effect, skipping');
          setInitialRoute('(tabs)');
        }

        if (loaded) {
          await SplashScreen.hideAsync();
        }
      } catch (error) {
        console.error('Error during app initialization:', error);
        // Continue anyway to allow the app to start
        setInitialRoute('(tabs)');
      }
    }

    prepare();
  }, [loaded]);

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
