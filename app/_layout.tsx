import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, router, Href } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState, useRef } from 'react';
import 'react-native-reanimated';
import { LogBox, Alert, AppState, AppStateStatus, Platform, Linking } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useColorScheme } from '@/hooks/useColorScheme';
import {
  syncLiveActivityOnLaunch,
  syncActivityIdFromNative,
  cleanupStaleActivityOnForeground,
} from '@/src/services/liveActivityService';
import { getQueuedBeers } from '@/src/api/queueService';
import { getSessionData } from '@/src/api/sessionManager';
import { isVisitorMode as checkIsVisitorMode } from '@/src/api/authService';
// eslint-disable-next-line no-restricted-imports -- setupDatabase, cleanupBadAbvData, and resetDatabaseState are bootstrap functions, not CRUD
import { setupDatabase, cleanupBadAbvData, resetDatabaseState } from '@/src/database/db';
import {
  fetchAndUpdateAllBeers,
  fetchAndUpdateMyBeers,
  fetchAndUpdateRewards,
} from '@/src/services/dataUpdateService';
import { getPreference, setPreference, areApiUrlsConfigured } from '@/src/database/preferences';
import { getDatabase, closeDatabaseConnection } from '@/src/database/connection';
import { getCurrentSchemaVersion, CURRENT_SCHEMA_VERSION } from '@/src/database/schemaVersion';
import { migrateToVersion3 } from '@/src/database/migrations/migrateToV3';
import { AppProvider } from '@/context/AppContext';
import { NetworkProvider } from '@/context/NetworkContext';
import { OperationQueueProvider } from '@/context/OperationQueueContext';
import { OptimisticUpdateProvider } from '@/context/OptimisticUpdateContext';
import { OfflineIndicator } from '@/components/OfflineIndicator';
import { QueuedOperationsManager } from '@/components/QueuedOperationsManager';
import { MigrationProgressOverlay } from '@/components/MigrationProgressOverlay';

/**
 * Handle deep links from Live Activity.
 * Deep link format: beerselector://beerfinder
 *
 * Note: The /beerfinder route (app/beerfinder.tsx) handles this automatically
 * via Expo Router's deep link matching. This handler is kept for logging
 * and potential future deep link patterns.
 */
const handleDeepLink = (url: string | null) => {
  if (!url) return;
  console.log('[DeepLink] Received URL:', url);
  // Expo Router handles beerselector://beerfinder via app/beerfinder.tsx redirect
};

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
    'timestamp_locked_on_nw_queue',
  ]);
}

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    BeerIcons: require('../assets/fonts/BeerIcons.ttf'),
  });
  const [initialRoute, setInitialRoute] = useState<string | null>(null);
  const [migrationProgress, setMigrationProgress] = useState<number | null>(null);
  const initializationStarted = useRef(false);
  const lifecycleOperationInProgress = useRef(false);

  useEffect(() => {
    async function prepare() {
      // Prevent duplicate initialization
      if (initializationStarted.current) {
        console.log(
          '[DUPLICATE PREVENTED] Initialization already started (useRef guard caught duplicate useEffect run), skipping...'
        );
        return;
      }
      initializationStarted.current = true;

      async function runPostSetupInit(): Promise<void> {
        try {
          await cleanupBadAbvData();
        } catch (e) {
          console.error('[_layout] ABV cleanup failed (non-fatal):', e);
        }

        const shouldFetchData = await areApiUrlsConfigured();
        if (shouldFetchData) {
          try {
            await fetchAndUpdateAllBeers();
          } catch (e) {
            console.error('[_layout] All beers fetch failed:', e);
          }

          try {
            await fetchAndUpdateMyBeers();
          } catch (e) {
            console.error('[_layout] My beers fetch failed:', e);
          }

          try {
            await fetchAndUpdateRewards();
          } catch (e) {
            console.error('[_layout] Rewards fetch failed:', e);
          }
        } else {
          console.log('API URLs not configured, skipping data fetch');
        }
      }

      try {
        // Initialize database with retry mechanism
        let dbInitialized = false;

        try {
          console.log('Initializing database first attempt...');
          await setupDatabase();
          dbInitialized = true;
          console.log('Database initialized successfully');

          await runPostSetupInit();

          // Check for schema migrations
          const db = await getDatabase();
          const currentVersion = await getCurrentSchemaVersion(db);

          if (currentVersion < CURRENT_SCHEMA_VERSION) {
            console.log(
              `Migration needed from version ${currentVersion} to ${CURRENT_SCHEMA_VERSION}...`
            );
            setMigrationProgress(0);

            try {
              // Run migration with progress callback
              await migrateToVersion3(db, (current, total) => {
                const progress = (current / total) * 100;
                setMigrationProgress(progress);
              });

              setMigrationProgress(null);
              console.log('Migration complete, reloading app state...');
            } catch (error) {
              console.error('Migration failed:', error);
              setMigrationProgress(null); // Reset UI even on error
              Alert.alert(
                'Database Update Failed',
                'The app may not function correctly. Please restart the app.',
                [{ text: 'OK' }]
              );
            }
          }

          // Check if API URLs are set using centralized helper
          const apiUrlsConfigured = await areApiUrlsConfigured();
          const isFirstLaunch = await getPreference('first_launch');

          // If API URLs are empty or it's first launch, set initial route to settings
          if (!apiUrlsConfigured || isFirstLaunch === 'true') {
            console.log('API URLs not set or first launch, redirecting to settings page');
            // Mark that it's no longer the first launch
            if (isFirstLaunch === 'true') {
              await setPreference(
                'first_launch',
                'false',
                'Flag indicating if this is the first app launch'
              );
            }

            // Set initial route to settings
            setInitialRoute('/settings');
          } else {
            // Normal app startup flow
            setInitialRoute('(tabs)');

            // Initial data load is handled by fetchAndUpdate* calls above
            // User-triggered refreshes will still work via pull-to-refresh gestures
            console.log('Database initialization complete - initial data already loaded');

            // Sync Live Activity on initial launch (iOS only)
            if (Platform.OS === 'ios') {
              try {
                // Sync with any existing Live Activities from previous app sessions
                // (e.g., if app was force-quit with an active Live Activity)
                await syncActivityIdFromNative();

                // Sync Live Activity with current queue state
                const sessionData = await getSessionData();
                const isVisitor = await checkIsVisitorMode(false);
                await syncLiveActivityOnLaunch(getQueuedBeers, sessionData, isVisitor);
                console.log('Live Activity synced on initial launch');
              } catch (liveActivityError) {
                // Live Activity sync errors should never block the main flow
                console.log(
                  '[_layout] Live Activity sync failed on initial launch:',
                  liveActivityError
                );
              }
            }
          }
        } catch (dbError) {
          console.error('Database initialization failed, retrying once:', dbError);

          if (!dbInitialized) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            try {
              console.log('Attempting database initialization retry...');
              resetDatabaseState();
              await setupDatabase();
              console.log('Database initialized successfully on retry');
              await runPostSetupInit();
              setInitialRoute('(tabs)');
            } catch (retryError) {
              console.error('Database setup failed on retry:', retryError);
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

          // Sync Live Activity on app foreground (iOS only)
          if (Platform.OS === 'ios') {
            try {
              // Sync with native activity state first (recover state after force-quit)
              await syncActivityIdFromNative();

              // Clean up stale activity first (this also cancels pending background task)
              // This ensures activities older than 3 hours are ended before any sync
              await cleanupStaleActivityOnForeground();

              // Only sync if we have an active (non-stale) activity or need to start one
              const sessionData = await getSessionData();
              const isVisitor = await checkIsVisitorMode(false);
              await syncLiveActivityOnLaunch(getQueuedBeers, sessionData, isVisitor);
            } catch (liveActivityError) {
              // Live Activity sync errors should never block the main flow
              console.log('[_layout] Live Activity sync failed on foreground:', liveActivityError);
            }
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

  // Deep link handling for Live Activity taps
  useEffect(() => {
    // Handle initial URL (app opened from deep link while closed)
    const getInitialURL = async () => {
      try {
        const url = await Linking.getInitialURL();
        handleDeepLink(url);
      } catch (error) {
        console.error('[DeepLink] Error getting initial URL:', error);
      }
    };
    getInitialURL();

    // Handle URLs when app is already open (app foregrounded from deep link)
    const linkingSubscription = Linking.addEventListener('url', event => {
      handleDeepLink(event.url);
    });

    return () => {
      linkingSubscription.remove();
    };
  }, []);

  // Navigate to initial route once determined and hide splash screen
  useEffect(() => {
    if (loaded && initialRoute) {
      console.log(`Navigating to initial route: ${initialRoute}`);
      router.replace(initialRoute as Href);

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
      <NetworkProvider>
        <OptimisticUpdateProvider>
          <OperationQueueProvider>
            <AppProvider>
              <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
                <Stack>
                  <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                  <Stack.Screen name="settings" options={{ headerShown: false }} />
                  <Stack.Screen name="screens/rewards" options={{ headerShown: false }} />
                  <Stack.Screen name="+not-found" />
                </Stack>
                <OfflineIndicator />
                <QueuedOperationsManager />
                <StatusBar style="auto" />
                {/* Show migration overlay when migrating */}
                {migrationProgress !== null && (
                  <MigrationProgressOverlay progress={migrationProgress} />
                )}
              </ThemeProvider>
            </AppProvider>
          </OperationQueueProvider>
        </OptimisticUpdateProvider>
      </NetworkProvider>
    </SafeAreaProvider>
  );
}
