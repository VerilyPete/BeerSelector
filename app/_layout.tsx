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
import { checkAndRefreshOnAppOpen } from '@/src/services/dataUpdateService';
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
                // Check for updates on app open (if it's been at least 12 hours since last check)
                checkAndRefreshOnAppOpen(12).then(result => {
                  if (result.updated) {
                    console.log('Data was updated on app open');
                  }

                  // If there were errors during the refresh, notify the user
                  if (result.errors && result.errors.length > 0) {
                    console.error('Errors during automatic data refresh:', result.errors);

                    // Check if all errors are network-related
                    const allNetworkErrors = result.errors.every(error =>
                      error.type === 'NETWORK_ERROR' || error.type === 'TIMEOUT_ERROR'
                    );

                    // Show the error alert after a short delay to ensure the app is fully loaded
                    setTimeout(() => {
                      if (allNetworkErrors && result.errors.length > 1) {
                        // If all errors are network-related, show a single consolidated message
                        Alert.alert(
                          'Server Connection Error',
                          'Unable to connect to the server. Please check your internet connection and try again later.',
                          [{ text: 'OK' }]
                        );
                      } else {
                        // Otherwise, show the first error
                        const firstError = result.errors[0];
                        const errorMessage = getUserFriendlyErrorMessage(firstError);

                        Alert.alert(
                          'Data Refresh Error',
                          `There was a problem refreshing beer data: ${errorMessage}`,
                          [{ text: 'OK' }]
                        );
                      }
                    }, 1000);
                  }
                }).catch(error => {
                  console.error('Error checking for updates on app open:', error);
                });
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
