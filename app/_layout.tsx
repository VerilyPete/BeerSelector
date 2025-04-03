import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';
import { LogBox } from 'react-native';

import { useColorScheme } from '@/hooks/useColorScheme';
import { initializeBeerDatabase } from '@/src/database/db';

// Disable react-devtools connection to port 8097
if (__DEV__) {
  const originalConsoleError = console.error;
  console.error = (...args) => {
    if (
      args[0] && 
      typeof args[0] === 'string' && 
      (args[0].includes('nw_connection') || 
       args[0].includes('quic_conn') || 
       args[0].includes('8097'))
    ) {
      return;
    }
    originalConsoleError(...args);
  };
  LogBox.ignoreLogs(['nw_connection', 'nw_socket', 'quic_conn']);
}

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    async function prepare() {
      try {
        // Initialize database with retry mechanism
        try {
          await initializeBeerDatabase();
          console.log('Database initialized successfully');
        } catch (dbError) {
          console.error('Database initialization failed, retrying once:', dbError);
          // Wait a moment and try again once
          await new Promise(resolve => setTimeout(resolve, 1000));
          try {
            await initializeBeerDatabase();
            console.log('Database initialized successfully on retry');
          } catch (retryError) {
            console.error('Database initialization failed on retry:', retryError);
            // Continue anyway - we'll handle database errors in the components
          }
        }
        
        if (loaded) {
          await SplashScreen.hideAsync();
        }
      } catch (error) {
        console.error('Error during app initialization:', error);
        // Continue anyway to allow the app to start
      }
    }
    
    prepare();
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
