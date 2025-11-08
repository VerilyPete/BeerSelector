import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, TouchableOpacity, View, Switch, Alert, TextInput, ScrollView, ActivityIndicator, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router, useLocalSearchParams } from 'expo-router';
import { IconSymbol } from '@/components/ui/IconSymbol';
import * as WebBrowser from 'expo-web-browser';
import { WebView, WebViewNavigation, WebViewMessageEvent } from 'react-native-webview';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useColorScheme } from '@/hooks/useColorScheme';
import { getAllPreferences, getPreference, setPreference, setUntappdCookie, isUntappdLoggedIn, initDatabase, clearUntappdCookies } from '@/src/database/db';
import { manualRefreshAllData, refreshAllDataFromAPI } from '@/src/services/dataUpdateService';
import { LoadingIndicator } from '@/components/LoadingIndicator';
import Constants from 'expo-constants';
import { createMockSession } from '@/src/api/mockSession';
import { getUserFriendlyErrorMessage } from '@/src/utils/notificationUtils';
import { handleVisitorLogin } from '@/src/api/authService';

// Define a Preference type for typechecking
interface Preference {
  key: string;
  value: string;
  description: string;
  editable?: boolean;
}

export default function SettingsScreen() {
  const backgroundColor = useThemeColor({}, 'background');
  const cardColor = useThemeColor({ light: '#F5F5F5', dark: '#1C1C1E' }, 'background');
  const tintColor = useThemeColor({}, 'tint');
  const textColor = useThemeColor({}, 'text');
  const borderColor = useThemeColor({ light: '#e0e0e0', dark: '#333' }, 'text');
  const colorScheme = useColorScheme() ?? 'light';

  // Get URL search params
  const { action } = useLocalSearchParams<{ action?: string }>();

  // Removed the filter preferences and notifications state variables
  const [refreshing, setRefreshing] = useState(false);
  const [preferences, setPreferences] = useState<Preference[]>([]);
  const [loading, setLoading] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [untappdLoginLoading, setUntappdLoginLoading] = useState(false);
  const [untappdWebViewLoading, setUntappdWebViewLoading] = useState(true);
  const [webviewVisible, setWebviewVisible] = useState(false);
  const [untappdWebviewVisible, setUntappdWebviewVisible] = useState(false);
  const webViewRef = useRef<WebView>(null);
  const untappdWebViewRef = useRef<WebView>(null);
  const [apiUrlsConfigured, setApiUrlsConfigured] = useState(false);
  const [isFirstLogin, setIsFirstLogin] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [untappdLoggedInStatus, setUntappdLoggedInStatus] = useState(false);

  // Load preferences on component mount and check if we can go back
  useEffect(() => {
    loadPreferences();
    checkUntappdLoginStatus();

    // Check if this is the initial route or if we can go back
    try {
      setCanGoBack(router.canGoBack());
    } catch (error) {
      // If router.canGoBack() throws, we can't go back
      setCanGoBack(false);
    }
    
    // Auto-open login dialog if action=login is in URL params
    if (action === 'login') {
      handleLogin();
    }
  }, [action]);

  // Function to check Untappd login status
  const checkUntappdLoginStatus = async () => {
    try {
      const loggedIn = await isUntappdLoggedIn();
      setUntappdLoggedInStatus(loggedIn);
    } catch (error) {
      console.error('Error checking Untappd login status:', error);
      setUntappdLoggedInStatus(false);
    }
  };

  // Function to load preferences from the database
  const loadPreferences = async () => {
    try {
      setLoading(true);
      const prefs = await getAllPreferences();
      setPreferences(prefs);

      // Check if API URLs are set
      const allBeersApiUrl = prefs.find(p => p.key === 'all_beers_api_url')?.value;
      const myBeersApiUrl = prefs.find(p => p.key === 'my_beers_api_url')?.value;
      const isFirstLaunch = prefs.find(p => p.key === 'first_launch')?.value === 'true';

      // Set state based on whether URLs are configured
      setApiUrlsConfigured(!!allBeersApiUrl && !!myBeersApiUrl);
      setIsFirstLogin(!allBeersApiUrl || !myBeersApiUrl);
    } catch (error) {
      console.error('Failed to load preferences:', error);
      Alert.alert('Error', 'Failed to load preferences.');
    } finally {
      setLoading(false);
    }
  };

  // Function to handle refreshing all data from APIs
  const handleRefresh = async () => {
    try {
      setRefreshing(true);

      // Perform the refresh of both tables using the conditional update function
      const result = await manualRefreshAllData();

      // Check if there were any errors
      if (result.hasErrors) {
        // If all errors are network-related, show a single consolidated message
        if (result.allNetworkErrors) {
          Alert.alert(
            'Server Connection Error',
            'Unable to connect to the server. Please check your internet connection and try again later.',
            [{ text: 'OK' }]
          );
        }
        // Otherwise, show individual error messages for each endpoint
        else {
          // Collect error messages
          const errorMessages: string[] = [];

          if (!result.allBeersResult.success && result.allBeersResult.error) {
            const allBeersError = getUserFriendlyErrorMessage(result.allBeersResult.error);
            errorMessages.push(`All Beer data: ${allBeersError}`);
          }

          if (!result.myBeersResult.success && result.myBeersResult.error) {
            const myBeersError = getUserFriendlyErrorMessage(result.myBeersResult.error);
            errorMessages.push(`Beerfinder data: ${myBeersError}`);
          }

          // Show error alert with all error messages
          Alert.alert(
            'Data Refresh Error',
            `There were problems refreshing beer data:\n\n${errorMessages.join('\n\n')}`,
            [{ text: 'OK' }]
          );
        }
      }
      // If no errors but data was updated
      else if (result.allBeersResult.dataUpdated || result.myBeersResult.dataUpdated) {
        // Show success message with counts
        const allBeersCount = result.allBeersResult.itemCount || 0;
        const myBeersCount = result.myBeersResult.itemCount || 0;
        
        // Check if user is in visitor mode to customize message
        const isVisitor = await getPreference('is_visitor_mode') === 'true';
        
        let successMessage = `Beer data refreshed successfully!\n\nAll Beer: ${allBeersCount} beers\n`;
        
        if (!isVisitor) {
          successMessage += `Beerfinder: ${myBeersCount} beers`;
        } else {
          successMessage += 'Visitor mode: Personal data not available';
        }

        Alert.alert(
          'Success',
          successMessage
        );
      }
      // If no errors and no data was updated
      else {
        Alert.alert('Info', 'No new data available.');
      }
    } catch (err) {
      console.error('Failed to refresh data:', err);
      Alert.alert('Error', 'Failed to refresh data from server. Please try again later.');
    } finally {
      // Set refreshing to false at the end, in both success and error cases
      setRefreshing(false);
    }
  };

  // Function to handle the login process using WebView
  const handleLogin = async () => {
    try {
      setLoginLoading(true);
      setWebviewVisible(true);
    } catch (error) {
      console.error('Login dialog error:', error);
      Alert.alert('Error', 'Failed to start the login process.');
      setLoginLoading(false);
    }
  };

  // Function to handle the Untappd login process using WebView
  const handleUntappdLogin = async () => {
    try {
      setUntappdLoginLoading(true);
      setUntappdWebviewVisible(true);
    } catch (error) {
      console.error('Untappd login dialog error:', error);
      Alert.alert('Error', 'Failed to start the Untappd login process.');
      setUntappdLoginLoading(false);
    }
  };

  // Track processed URLs to avoid re-injecting JavaScript
  const processedUrlsRef = useRef<Set<string>>(new Set());

  // Handle WebView navigation state changes
  const handleWebViewNavigationStateChange = (navState: WebViewNavigation) => {
    // Only process when page has finished loading
    if (navState.loading) {
      return;
    }

    // Create a unique key for this URL
    const urlKey = navState.url;

    // If we've already processed this URL, skip it
    if (processedUrlsRef.current.has(urlKey)) {
      return;
    }

    // If we're on the member dashboard page
    if (navState.url.includes('member-dash.php')) {
      // Mark as processed
      processedUrlsRef.current.add(urlKey);

      // Inject JavaScript to extract the API URLs and cookies
      if (webViewRef.current) {
        webViewRef.current.injectJavaScript(`
          (function() {
            // Try to find variables in the page
            let userJsonUrl = null;
            let storeJsonUrl = null;

            // Look for PHP variables in script tags
            const scripts = document.querySelectorAll('script');
            for (const script of scripts) {
              const content = script.textContent || script.innerText;

              // Look for user_json_url
              const userMatch = content.match(/\\$user_json_url\\s*=\\s*["']([^"']+)["']/);
              if (userMatch && userMatch[1]) {
                userJsonUrl = userMatch[1];
              }

              // Look for store_json_url
              const storeMatch = content.match(/\\$store_json_url\\s*=\\s*["']([^"']+)["']/);
              if (storeMatch && storeMatch[1]) {
                storeJsonUrl = storeMatch[1];
              }
            }

            // Also look for URLs in the page source
            const html = document.documentElement.outerHTML;

            if (!userJsonUrl) {
              const memberJsonMatch = html.match(/https:\\/\\/[^"'\\s]+bk-member-json\\.php\\?uid=\\d+/i);
              if (memberJsonMatch) {
                userJsonUrl = memberJsonMatch[0];
              }
            }

            if (!storeJsonUrl) {
              const storeJsonMatch = html.match(/https:\\/\\/[^"'\\s]+bk-store-json\\.php\\?sid=\\d+/i);
              if (storeJsonMatch) {
                storeJsonUrl = storeJsonMatch[0];
              }
            }

            // Make a fetch request to the current page to get cookies from headers
            fetch(window.location.href, {
              credentials: 'include'
            }).then(response => {
              // Get cookies from response headers
              const cookies = {};
              const cookieHeader = response.headers.get('set-cookie');
              if (cookieHeader) {
                cookieHeader.split(',').forEach(cookie => {
                  const [cookiePart] = cookie.split(';');
                  const [name, value] = cookiePart.split('=');
                  if (name && value) {
                    cookies[name.trim()] = value.trim();
                  }
                });
              }

              // Send the results back to React Native
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'URLs',
                userJsonUrl,
                storeJsonUrl,
                html: html.substring(0, 1000), // Send a portion of HTML for debugging
                cookies: cookies
              }));
            });

            true; // Return statement needed for Android
          })();
        `);
      }
    }
    // Check if user selected visitor mode
    else if (navState.url.includes('visitor.php')) {
      // Mark as processed
      processedUrlsRef.current.add(urlKey);

      console.log('Visitor mode detected in WebView at URL:', navState.url);

      // Extract cookies and store information for visitor mode
      if (webViewRef.current) {
        webViewRef.current.injectJavaScript(`
          (function() {
            // Extract cookies for visitor mode, focus on getting the store ID
            try {
              const cookies = document.cookie.split(';').reduce((acc, cookie) => {
                const [name, value] = cookie.trim().split('=');
                if (name && value) {
                  acc[name] = value;
                }
                return acc;
              }, {});

              console.log('In WebView - Cookies found:', document.cookie);

              // Send the data back to React Native
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'VISITOR_LOGIN',
                cookies: cookies,
                url: window.location.href,
                rawCookies: document.cookie
              }));
            } catch (error) {
              console.error('Error in visitor cookie extraction:', error);
              // Send error back to React Native
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'VISITOR_LOGIN_ERROR',
                error: error.toString()
              }));
            }

            true; // Return statement needed for Android
          })();
        `);
      }
    }
  };

  // Handle Untappd WebView navigation state changes
  const handleUntappdWebViewNavigationStateChange = (navState: WebViewNavigation) => {
    // Log navigation for debugging
    console.log('Untappd WebView navigating to:', navState.url);

    // Check if we're on Untappd pages
    if (navState.url.includes('untappd.com')) {
      // If we're on the login page, don't do anything special
      if (navState.url.includes('/login')) {
        console.log('On Untappd login page');
      }
      // Check if user has navigated to a profile page, dashboard, or home page, which indicates successful login
      else if (!navState.loading &&
              (navState.url.includes('/user/') ||
               navState.url.includes('/dashboard') ||
               navState.url.includes('/profile') ||
               navState.url.includes('/home'))) {

        console.log('User appears to be logged in - on profile/dashboard/home page');

        // Inject JavaScript to check for logged-in state and extract visible cookies
        if (untappdWebViewRef.current) {
          untappdWebViewRef.current.injectJavaScript(`
            (function() {
              try {
                console.log('Checking login state on page');

                // Check for elements that indicate logged-in state
                const userMenuElement = document.querySelector('.user-menu') ||
                                       document.querySelector('.profile-area') ||
                                       document.querySelector('.user-actions');

                const isLoggedInElement = document.querySelector('.notifications') ||
                                         document.querySelector('.account-action') ||
                                         document.querySelector('.user-profile-area');

                // Check if logout link exists, which definitely indicates logged in state
                const logoutLink = Array.from(document.querySelectorAll('a')).find(
                  a => a.textContent && (a.textContent.includes('Logout') || a.textContent.includes('Sign Out'))
                );

                // Get any visible cookies we can access
                const cookieString = document.cookie;
                const cookies = cookieString.split(';').reduce((acc, cookie) => {
                  const [name, value] = cookie.trim().split('=');
                  if (name && value) {
                    acc[name] = value;
                  }
                  return acc;
                }, {});

                // Send results back to React Native
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'UNTAPPD_LOGIN_CHECK',
                  userMenuExists: !!userMenuElement,
                  isLoggedInElementExists: !!isLoggedInElement,
                  logoutLinkExists: !!logoutLink,
                  cookiesAvailable: Object.keys(cookies),
                  url: window.location.href,
                  pageTitle: document.title
                }));

                // If we have evidence the user is logged in, notify the app
                if (userMenuElement || isLoggedInElement || logoutLink) {
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'UNTAPPD_LOGGED_IN',
                    url: window.location.href,
                    method: 'page_element_detection'
                  }));

                  // Also send any non-HttpOnly cookies we can access
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'UNTAPPD_COOKIES',
                    cookies
                  }));
                }
              } catch (err) {
                console.error('Error in login detection:', err);
              }

              true; // Return statement needed for Android
            })();
          `);
        }
      }
    }
  };

  // Handle messages from WebView
  const handleWebViewMessage = async (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      if (data.type === 'URLs') {
        const { userJsonUrl, storeJsonUrl, cookies } = data;

        if (userJsonUrl && storeJsonUrl) {
          // Explicitly clear visitor mode flag for regular login
          await setPreference('is_visitor_mode', 'false', 'Flag indicating whether the user is in visitor mode');
          
          // Update preferences with new API endpoints
          setPreference('user_json_url', userJsonUrl, 'API endpoint for user data');
          setPreference('store_json_url', storeJsonUrl, 'API endpoint for store data');

          // Also set the API URLs that are used by the rest of the app
          setPreference('my_beers_api_url', userJsonUrl, 'API endpoint for fetching Beerfinder beers');
          setPreference('all_beers_api_url', storeJsonUrl, 'API endpoint for fetching all beers');

          // Save login timestamp
          setPreference('last_login_timestamp', new Date().toISOString(), 'Last successful login timestamp');

          // Save cookies
          setPreference('auth_cookies', JSON.stringify(cookies), 'Authentication cookies');

          // Refresh the data
          handleRefresh();

          // Reload preferences to update the UI
          loadPreferences();

          // Show success message
          Alert.alert(
            'Login Successful',
            'API URLs have been updated and beer data refreshed. You now have access to the full Beer Selector experience.',
            [
              {
                text: 'OK',
                onPress: () => {
                  // Reset login loading state
                  setLoginLoading(false);

                  // Close the WebView
                  setWebviewVisible(false);

                  // Navigate to the main tabs interface
                  setTimeout(() => {
                    router.replace('/(tabs)');
                  }, 300);
                }
              }
            ]
          );
        }
      }
      else if (data.type === 'VISITOR_LOGIN_ERROR') {
        console.error('Error extracting visitor login data in WebView:', data.error);
        Alert.alert(
          'Visitor Login Failed',
          'Could not extract the store information needed for visitor mode. Please try again.',
          [{ text: 'OK' }]
        );
        setLoginLoading(false);
        setWebviewVisible(false);
      }
      else if (data.type === 'VISITOR_LOGIN') {
        const { cookies, rawCookies, url } = data;
        console.log('Received visitor login data', cookies);
        console.log('Raw cookies from WebView:', rawCookies);
        console.log('URL at login time:', url);
        
        // Only process if this is the first visitor login attempt
        // Prevent duplicate processing by checking the webview visibility
        if (!webviewVisible) {
          console.log('Ignoring duplicate visitor login event');
          return;
        }
        
        // Immediately set webview as invisible to prevent duplicate processing
        setWebviewVisible(false);
        
        // Verify we have a store ID in the cookies
        const storeId = cookies.store__id || cookies.store;
        if (!storeId) {
          console.error('No store ID found in visitor cookies. Cookies received:', JSON.stringify(cookies));
          Alert.alert(
            'Visitor Login Failed',
            'Could not find store ID in cookies. Please try again or contact support.',
            [{ text: 'OK' }]
          );
          setLoginLoading(false);
          return;
        }
        
        // Handle visitor login using the API
        try {
          const loginResult = await handleVisitorLogin(cookies);
          console.log('Visitor login result:', loginResult);
          
          if (loginResult.success) {
            // Ensure visitor mode preference is explicitly set to true
            await setPreference('is_visitor_mode', 'true', 'Flag indicating whether the user is in visitor mode');
            
            // Fetch only the store data URL for visitor mode
            // Use the cookies from the data object instead of document.cookie
            const storeJsonUrl = `https://fsbs.beerknurd.com/bk-store-json.php?sid=${storeId}`;
            console.log('Setting all_beers_api_url to:', storeJsonUrl);
            await setPreference('all_beers_api_url', storeJsonUrl, 'API endpoint for fetching all beers');
            
            // For visitor mode, use empty data placeholder instead of dummy URL to prevent network errors
            await setPreference('my_beers_api_url', 'none://visitor_mode', 'Placeholder URL for visitor mode (not a real endpoint)');
            
            // Reset login loading state
            setLoginLoading(false);
            
            // Refresh the data
            handleRefresh();
            
            // Reload preferences to update the UI
            loadPreferences();
            
            // Show success message
            Alert.alert(
              'Visitor Mode Active',
              'You are now browsing as a visitor. Only the All Beer list will be available.',
              [
                {
                  text: 'OK',
                  onPress: () => {
                    // Navigate to the home tab instead of directly to beer list
                    router.replace('/(tabs)');
                  }
                }
              ]
            );
          } else {
            // Show error message
            Alert.alert(
              'Visitor Login Failed',
              loginResult.error || 'Could not log in as visitor. Please try again.',
              [{ text: 'OK' }]
            );
            setLoginLoading(false);
          }
        } catch (error) {
          console.error('Error during visitor login:', error);
          Alert.alert(
            'Error',
            'An error occurred during visitor login. Please try again.',
            [{ text: 'OK' }]
          );
          setLoginLoading(false);
        }
      }
    } catch (error) {
      console.error('Error handling WebView message:', error);
      setLoginLoading(false);
    }
  };

  // Handle messages from Untappd WebView
  const handleUntappdWebViewMessage = (event: WebViewMessageEvent) => {
    try {
      console.log('Received message from Untappd WebView');
      const data = JSON.parse(event.nativeEvent.data);
      console.log('Message type:', data.type);

      // Process detailed login check results
      if (data.type === 'UNTAPPD_LOGIN_CHECK') {
        console.log('Login check details:', {
          userMenuExists: data.userMenuExists,
          isLoggedInElementExists: data.isLoggedInElementExists,
          logoutLinkExists: data.logoutLinkExists,
          cookiesAvailable: data.cookiesAvailable,
          url: data.url,
          pageTitle: data.pageTitle
        });

        // Store this information for debugging but don't take action yet
        setUntappdCookie('login_check_result', JSON.stringify(data), 'Login check results from page');
      }

      // Process cookies received from WebView
      if (data.type === 'UNTAPPD_COOKIES') {
        const { cookies } = data;
        console.log('Received cookies keys:', Object.keys(cookies));

        if (Object.keys(cookies).length === 0) {
          console.log('No cookies received, user probably not logged in yet');
          return;
        }

        // We don't have access to HttpOnly cookies, but we'll still save the visible ones
        // and mark the user as logged in based on the UI detection

        // Save each cookie to the database
        Object.entries(cookies).forEach(([name, value]) => {
          console.log(`Saving cookie: ${name}`);
          setUntappdCookie(name, value as string, `Untappd cookie: ${name}`);
        });

        // Save login timestamp
        setUntappdCookie('last_login_timestamp', new Date().toISOString(), 'Last successful Untappd login timestamp');

        // Save that we had a successful login detection via UI elements
        setUntappdCookie('login_detected_via_ui', 'true', 'Login was detected via UI elements');
      }

      // Explicit login confirmation message
      if (data.type === 'UNTAPPD_LOGGED_IN') {
        console.log('Login confirmed via:', data.method || 'url navigation');

        // Only consider the login successful if we're on a user profile, dashboard or home page
        if (data.url && (data.url.includes('/user/') ||
                         data.url.includes('/dashboard') ||
                         data.url.includes('/profile') ||
                         data.url.includes('/home'))) {

          // Update login status
          setUntappdLoggedInStatus(true);

          // Set a special cookie to mark that we've detected login
          setUntappdCookie('untappd_logged_in_detected', 'true', 'Login was detected by app');

          // Show success message and close WebView
          Alert.alert(
            'Untappd Login Successful',
            'You are now logged in to Untappd.',
            [
              {
                text: 'OK',
                onPress: () => {
                  // Reset login loading state
                  setUntappdLoginLoading(false);

                  // Close the WebView
                  setUntappdWebviewVisible(false);
                }
              }
            ]
          );
        } else {
          console.log('Login message received but not from a profile/home page, ignoring');
        }
      }
    } catch (error) {
      console.error('Error handling Untappd WebView message:', error);
      setUntappdLoginLoading(false);
    }
  };

  // Function to close the WebView and cancel login
  const closeWebView = () => {
    setWebviewVisible(false);
    setLoginLoading(false);
    Alert.alert('Login Cancelled', 'The login process was cancelled.');
  };

  // Function to close the Untappd WebView and cancel login
  const closeUntappdWebView = () => {
    setUntappdWebviewVisible(false);
    setUntappdLoginLoading(false);
    Alert.alert('Untappd Login Cancelled', 'The Untappd login process was cancelled.');
  };

  // Function to create a mock session for testing (dev only)
  const handleCreateMockSession = async () => {
    try {
      await createMockSession();
      Alert.alert('Success', 'Mock session created successfully!');
    } catch (error) {
      console.error('Failed to create mock session:', error);
      Alert.alert('Error', 'Failed to create mock session.');
    }
  };

  // Function to handle Untappd logout
  const handleUntappdLogout = async () => {
    try {
      await clearUntappdCookies();
      setUntappdLoggedInStatus(false);
      Alert.alert(
        'Untappd Credentials Cleared',
        'Your cached Untappd session has been cleared. To fully log out:\n\n1. Press "Check Untappd" while viewing a beer\n2. Manually log out of Untappd from that session\n3. Re-login to Untappd from the settings page',
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.error('Error clearing Untappd credentials:', error);
      Alert.alert(
        'Error',
        'Failed to clear Untappd credentials. Please try again.',
        [{ text: 'OK' }]
      );
    }
  };

  // Render a preference item - simplified to just display
  const renderPreferenceItem = (preference: Preference) => {
    return (
      <View key={preference.key} style={styles.preferenceItem}>
        <ThemedText style={styles.preferenceKey}>{preference.key}</ThemedText>
        <ThemedText style={styles.preferenceDescription}>{preference.description}</ThemedText>
        <ThemedText style={styles.preferenceValue} numberOfLines={2} ellipsizeMode="middle">
          {preference.value}
        </ThemedText>
      </View>
    );
  };

  return (
    <ThemedView style={styles.container}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />

      {/* WebView Modal */}
      <Modal
        visible={webviewVisible}
        animationType="slide"
        onRequestClose={closeWebView}
      >
        <SafeAreaView style={{ flex: 1 }}>
          <View style={styles.webViewHeader}>
            <TouchableOpacity onPress={closeWebView} style={styles.closeButton}>
              <IconSymbol name="xmark" size={22} color={tintColor} />
            </TouchableOpacity>
            <ThemedText style={styles.webViewTitle}>Flying Saucer Login</ThemedText>
          </View>

          <WebView
            ref={webViewRef}
            source={{ uri: 'https://tapthatapp.beerknurd.com/kiosk.php' }}
            onNavigationStateChange={handleWebViewNavigationStateChange}
            onMessage={handleWebViewMessage}
            onError={(syntheticEvent) => {
              const { nativeEvent } = syntheticEvent;
              console.error('WebView error:', nativeEvent);
            }}
            onHttpError={(syntheticEvent) => {
              const { nativeEvent } = syntheticEvent;
              console.error('WebView HTTP error:', nativeEvent.statusCode, nativeEvent.url);
            }}
            style={{ flex: 1 }}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            sharedCookiesEnabled={true}
            scalesPageToFit={false}
            scrollEnabled={true}
            bounces={false}
            allowsBackForwardNavigationGestures={false}
            androidLayerType="hardware"
            cacheEnabled={true}
            cacheMode="LOAD_DEFAULT"
          />
        </SafeAreaView>
      </Modal>

      {/* Untappd WebView Modal */}
      <Modal
        visible={untappdWebviewVisible}
        animationType="slide"
        onRequestClose={closeUntappdWebView}
      >
        <SafeAreaView style={{ flex: 1 }}>
          <View style={styles.webViewHeader}>
            <TouchableOpacity onPress={closeUntappdWebView} style={styles.closeButton}>
              <IconSymbol name="xmark" size={22} color={tintColor} />
            </TouchableOpacity>
            <ThemedText style={styles.webViewTitle}>Untappd Login</ThemedText>
          </View>

          <WebView
            ref={untappdWebViewRef}
            source={{ uri: 'https://untappd.com/login' }}
            onNavigationStateChange={handleUntappdWebViewNavigationStateChange}
            onMessage={handleUntappdWebViewMessage}
            style={{ flex: 1 }}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            sharedCookiesEnabled={true}
            thirdPartyCookiesEnabled={true}
            originWhitelist={['*']}
            allowsInlineMediaPlayback={true}
            applicationNameForUserAgent="Untappd"
            incognito={false}
            mediaPlaybackRequiresUserAction={false}
            onLoadStart={() => setUntappdWebViewLoading(true)}
            onLoadEnd={() => {
              setUntappdWebViewLoading(false);
            }}
            renderLoading={() => (
              <View style={styles.webViewLoadingContainer}>
                <ActivityIndicator size="large" color="#FFAC33" />
                <ThemedText style={styles.webViewLoadingText}>Loading Untappd...</ThemedText>
              </View>
            )}
            startInLoadingState={true}
          />
        </SafeAreaView>
      </Modal>

      <SafeAreaView style={styles.safeArea} edges={['top', 'right', 'left']}>
        {/* Back button - only show if not first login and we can go back */}
        {!isFirstLogin && canGoBack && (
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <IconSymbol name="xmark" size={26} color={tintColor} />
          </TouchableOpacity>
        )}

        <ScrollView style={styles.scrollView}>
          <View style={styles.content}>
            {/* Title Section */}
            <View style={styles.titleSection}>
              <ThemedText type="title" style={styles.pageTitle}>Settings</ThemedText>
            </View>

            {/* First Login Message */}
            {isFirstLogin && (
              <View style={[styles.section, { backgroundColor: cardColor, marginBottom: 20 }]}>
                <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>Welcome to Beer Selector</ThemedText>
                <View style={styles.welcomeMessage}>
                  <ThemedText style={styles.welcomeText}>
                  Please log in to your UFO Club account or as a Visitor to start using the app.
                  </ThemedText>
                  <TouchableOpacity
                    style={[
                      styles.dataButton,
                      styles.loginButton,
                      {
                        backgroundColor: loginLoading ? '#88AAFF' : '#007AFF',
                        borderColor: borderColor,
                        marginTop: 16
                      }
                    ]}
                    onPress={handleLogin}
                    disabled={loginLoading || refreshing}
                  >
                    <ThemedText style={styles.dataButtonText}>
                      {loginLoading ? 'Logging in...' : 'Login to Flying Saucer'}
                    </ThemedText>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* API Endpoints Section - Removed from the UI */}

            {/* About Section */}
            <View style={[styles.section, { backgroundColor: cardColor }]}>
              <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>About</ThemedText>

              <View style={styles.aboutInfo}>
                <ThemedText>Beer Selector</ThemedText>
                <ThemedText style={styles.versionText}>
                  Version {Constants.expoConfig?.version || '1.0.0'} (Build {Constants.expoConfig?.ios?.buildNumber || Constants.expoConfig?.android?.versionCode})
                </ThemedText>
              </View>
            </View>

            {/* Data Management Section - Only show if NOT on first login or if API URLs are configured */}
            {(!isFirstLogin || apiUrlsConfigured) && (
              <View style={[styles.section, { backgroundColor: cardColor }]}>
                <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>Data Management</ThemedText>

                <View style={styles.buttonContainer}>
                  {/* Only show refresh button if API URLs are configured */}
                  {apiUrlsConfigured && (
                    <TouchableOpacity
                      style={[
                        styles.dataButton,
                        {
                          backgroundColor: refreshing ? '#FF8888' : '#FF3B30',
                          borderColor: borderColor
                        }
                      ]}
                      onPress={handleRefresh}
                      disabled={refreshing}
                    >
                      <ThemedText style={styles.dataButtonText}>
                        {refreshing ? 'Refreshing data...' : 'Refresh All Beer Data'}
                      </ThemedText>
                    </TouchableOpacity>
                  )}

                  {/* Login Button - Only show if NOT on first login */}
                  {!isFirstLogin && (
                    <TouchableOpacity
                      style={[
                        styles.dataButton,
                        styles.loginButton,
                        {
                          backgroundColor: loginLoading ? '#88AAFF' : '#007AFF',
                          borderColor: borderColor,
                          marginTop: apiUrlsConfigured ? 12 : 0
                        }
                      ]}
                      onPress={handleLogin}
                      disabled={loginLoading || refreshing}
                    >
                      <ThemedText style={styles.dataButtonText}>
                        {loginLoading ? 'Logging in...' : 'Login to Flying Saucer'}
                      </ThemedText>
                    </TouchableOpacity>
                  )}

                  {/* Untappd Login Button - Always show */}
                  <TouchableOpacity
                    style={[
                      styles.dataButton,
                      styles.untappdButton,
                      {
                        backgroundColor: untappdLoginLoading ? '#F8A34A' : '#FFAC33',
                        borderColor: borderColor,
                        marginTop: 12
                      }
                    ]}
                    onPress={handleUntappdLogin}
                    disabled={untappdLoginLoading || refreshing}
                  >
                    <ThemedText style={styles.dataButtonText}>
                      {untappdLoginLoading
                        ? 'Logging in...'
                        : untappdLoggedInStatus
                          ? 'Reconnect to Untappd'
                          : 'Login to Untappd'}
                    </ThemedText>
                  </TouchableOpacity>

                  {/* Untappd Logout Button - Only show when logged in */}
                  {untappdLoggedInStatus && (
                    <TouchableOpacity
                      style={[
                        styles.dataButton,
                        {
                          backgroundColor: '#FF3B30',
                          borderColor: borderColor,
                          marginTop: 12
                        }
                      ]}
                      onPress={handleUntappdLogout}
                      disabled={refreshing}
                    >
                      <ThemedText style={styles.dataButtonText}>
                        Clear Untappd Credentials
                      </ThemedText>
                    </TouchableOpacity>
                  )}

                  {/* Return to Home button - show when API URLs are configured but we're on first launch */}
                  {apiUrlsConfigured && !canGoBack && (
                    <TouchableOpacity
                      style={[
                        styles.dataButton,
                        styles.homeButton,
                        {
                          backgroundColor: '#34C759',
                          borderColor: borderColor,
                          marginTop: 12
                        }
                      ]}
                      onPress={() => router.replace('/(tabs)')}
                      disabled={refreshing || loginLoading}
                    >
                      <ThemedText style={styles.dataButtonText}>
                        Go to Home Screen
                      </ThemedText>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}

            {/* Development features - only shown in development */}
            {Constants.expoConfig?.extra?.NODE_ENV === 'development' && (
              <View style={styles.section}>
                <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>Development</ThemedText>

                <View style={styles.infoContainer}>
                  <TouchableOpacity style={styles.devButton} onPress={handleCreateMockSession}>
                    <ThemedText style={styles.buttonText}>
                      Create Mock Session
                    </ThemedText>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  backButton: {
    position: 'absolute',
    top: 60,
    right: 20,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(200, 200, 200, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 30,
  },
  titleSection: {
    marginBottom: 20,
    alignItems: 'center',
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  section: {
    borderRadius: 12,
    marginBottom: 20,
    overflow: 'hidden',
  },
  sectionTitle: {
    fontSize: 16,
    padding: 12,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderTopWidth: 0.5,
    borderTopColor: '#CCCCCC',
  },
  aboutInfo: {
    padding: 12,
  },
  versionText: {
    marginTop: 4,
    fontSize: 12,
    opacity: 0.7,
  },
  buttonContainer: {
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 0.5,
    borderTopColor: '#CCCCCC',
  },
  dataButton: {
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    width: '60%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  dataButtonText: {
    color: 'white',
    fontWeight: '600',
  },
  loadingContainer: {
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  preferenceItem: {
    padding: 12,
    borderTopWidth: 0.5,
    borderTopColor: '#CCCCCC',
  },
  preferenceKey: {
    fontWeight: 'bold',
    marginBottom: 4,
  },
  preferenceDescription: {
    fontSize: 12,
    opacity: 0.7,
    marginBottom: 4,
  },
  preferenceValue: {
    fontSize: 12,
  },
  loginButton: {
    marginTop: 12,
  },
  resetButton: {
    marginTop: 12,
    backgroundColor: 'transparent',
    borderWidth: 1,
  },
  resetButtonText: {
    color: '#FF3B30',
  },
  webViewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
    backgroundColor: '#f9f9f9',
  },
  closeButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(200, 200, 200, 0.3)',
  },
  webViewTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginRight: 40, // To balance the close button
  },
  welcomeMessage: {
    padding: 16,
    alignItems: 'center',
  },
  welcomeText: {
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 20,
  },
  homeButton: {
    marginTop: 12,
    backgroundColor: '#34C759',
  },
  devButton: {
    backgroundColor: '#E91E63',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginVertical: 8,
  },
  buttonText: {
    color: 'white',
    fontWeight: '600',
  },
  infoContainer: {
    padding: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  button: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#007AFF',
  },
  untappdButton: {
    marginTop: 12,
    backgroundColor: '#FFAC33',
  },
  loginPageButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(200, 200, 200, 0.3)',
  },
  loginPageButtonText: {
    color: '#FF3B30',
    fontWeight: 'bold',
  },
  webViewLoadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
  },
  webViewLoadingText: {
    marginTop: 10,
    fontSize: 16,
  },
});