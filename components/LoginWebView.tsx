import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Modal, View, TouchableOpacity, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, WebViewNavigation, WebViewMessageEvent } from 'react-native-webview';

import { ThemedText } from '@/components/ThemedText';
import { IconSymbol } from '@/components/ui/IconSymbol';
import { useThemeColor } from '@/hooks/useThemeColor';
import { setPreference } from '@/src/database/preferences';
import { handleVisitorLogin } from '@/src/api/authService';
import { saveSessionData, extractSessionDataFromResponse } from '@/src/api/sessionManager';
import { isSessionData } from '@/src/types/api';
import { config } from '@/src/config';

interface LoginWebViewProps {
  visible: boolean;
  onLoginSuccess: () => void;
  onLoginCancel: () => void;
  onRefreshData: () => Promise<void>;
  loading?: boolean;
}

export default function LoginWebView({
  visible,
  onLoginSuccess,
  onLoginCancel,
  onRefreshData,
  loading: externalLoading
}: LoginWebViewProps) {
  const tintColor = useThemeColor({}, 'tint');
  const cardBackgroundColor = useThemeColor({ light: '#F5F5F5', dark: '#1C1C1E' }, 'background');
  const borderColor = useThemeColor({ light: '#CCCCCC', dark: '#333333' }, 'text');
  const loadingOverlayColor = useThemeColor({ light: 'rgba(255, 255, 255, 0.8)', dark: 'rgba(28, 28, 30, 0.8)' }, 'background');

  const [internalLoading, setInternalLoading] = useState(false);
  const webViewRef = useRef<WebView>(null);
  const processedUrlsRef = useRef<Set<string>>(new Set());
  const lastLoggedUrlRef = useRef<{ url: string; timestamp: number }>({ url: '', timestamp: 0 });

  // Use external loading prop if provided, otherwise use internal state
  const loading = externalLoading !== undefined ? externalLoading : internalLoading;

  // Cleanup refs when modal closes to prevent stale state
  useEffect(() => {
    if (!visible) {
      processedUrlsRef.current.clear();
      lastLoggedUrlRef.current = { url: '', timestamp: 0 };
    }
  }, [visible]);

  // Handle close button
  const handleClose = useCallback(() => {
    processedUrlsRef.current.clear();
    Alert.alert('Login Cancelled', 'The login process was cancelled.');
    onLoginCancel();
  }, [onLoginCancel]);

  // Handle WebView navigation state changes (simplified - no JS injection here)
  const handleWebViewNavigationStateChange = useCallback((navState: WebViewNavigation) => {
    // Prevent duplicate logs for same URL within 500ms (React Strict Mode causes double calls)
    const now = Date.now();
    const isDuplicate = navState.url === lastLoggedUrlRef.current.url &&
                       (now - lastLoggedUrlRef.current.timestamp) < 500;

    if (!navState.loading && !isDuplicate) {
      console.log('Flying Saucer WebView finished loading:', navState.url);
      lastLoggedUrlRef.current = { url: navState.url, timestamp: now };
    }
  }, []);

  // Handle WebView load end - inject JavaScript once per page load
  const handleWebViewLoadEnd = useCallback(() => {
    if (!webViewRef.current) {
      return;
    }

    setInternalLoading(false);

    // Get the current URL with error handling
    webViewRef.current.injectJavaScript(`
      (function() {
        try {
          if (!window.ReactNativeWebView || !window.ReactNativeWebView.postMessage) {
            console.error('ReactNativeWebView bridge not available');
            return false;
          }

          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'URL_CHECK',
            url: window.location.href
          }));
        } catch (error) {
          console.error('URL_CHECK injection error:', error);
        }
        return true;
      })();
    `);
  }, []);

  // Handle specific page JavaScript injection
  const injectPageSpecificJavaScript = useCallback((url: string) => {
    // Create a unique key for this URL
    const urlKey = url;

    // If we've already processed this URL, skip it
    if (processedUrlsRef.current.has(urlKey)) {
      return;
    }

    // If we're on the member dashboard page
    if (url.includes('member-dash.php')) {
      // Mark as processed
      processedUrlsRef.current.add(urlKey);

      // Inject simplified JavaScript using regex on outerHTML
      if (webViewRef.current) {
        webViewRef.current.injectJavaScript(`
          (function() {
            try {
              if (!window.ReactNativeWebView || !window.ReactNativeWebView.postMessage) {
                console.error('ReactNativeWebView bridge not available');
                return false;
              }

              // Get the page HTML for regex matching
              const html = document.documentElement.outerHTML;

              // Extract URLs using regex directly on HTML
              const memberJsonMatch = html.match(/https:\\/\\/[^"'\\s]+bk-member-json\\.php\\?uid=\\d+/i);
              const storeJsonMatch = html.match(/https:\\/\\/[^"'\\s]+bk-store-json\\.php\\?sid=\\d+/i);

              const userJsonUrl = memberJsonMatch ? memberJsonMatch[0] : null;
              const storeJsonUrl = storeJsonMatch ? storeJsonMatch[0] : null;

              // Parse cookies from document.cookie
              const cookies = {};
              if (document.cookie) {
                document.cookie.split(';').forEach(cookie => {
                  const parts = cookie.split('=');
                  if (parts.length >= 2) {
                    const name = parts[0].trim();
                    const value = parts.slice(1).join('=').trim();
                    if (name && value) {
                      cookies[name] = decodeURIComponent(value);
                    }
                  }
                });
              }

              // Send the results back to React Native
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'URLs',
                userJsonUrl,
                storeJsonUrl,
                cookies: cookies
              }));
            } catch (error) {
              // Send error back to React Native for logging
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'JS_INJECTION_ERROR',
                error: error.toString(),
                location: 'member-dash'
              }));
            }

            return true;
          })();
        `);
      }
    }
    // Check if user selected visitor mode
    else if (url.includes('visitor.php')) {
      // Mark as processed
      processedUrlsRef.current.add(urlKey);

      console.log('Visitor mode detected in WebView at URL:', url);

      // Extract cookies and store information for visitor mode
      if (webViewRef.current) {
        webViewRef.current.injectJavaScript(`
          (function() {
            try {
              if (!window.ReactNativeWebView || !window.ReactNativeWebView.postMessage) {
                console.error('ReactNativeWebView bridge not available');
                return false;
              }

              const cookies = {};
              if (document.cookie) {
                document.cookie.split(';').forEach(cookie => {
                  const parts = cookie.trim().split('=');
                  if (parts.length >= 2) {
                    const name = parts[0];
                    const value = parts.slice(1).join('=');
                    if (name && value) {
                      cookies[name] = value;
                    }
                  }
                });
              }

              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'VISITOR_LOGIN',
                cookies: cookies,
                url: window.location.href,
                rawCookies: document.cookie
              }));
            } catch (error) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'VISITOR_LOGIN_ERROR',
                error: error.toString(),
                location: 'visitor'
              }));
            }

            return true;
          })();
        `);
      }
    }
  }, []);

  // Handle messages from WebView
  const handleWebViewMessage = useCallback(async (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      // Handle JavaScript injection errors
      if (data.type === 'JS_INJECTION_ERROR') {
        console.error('JavaScript injection failed:', data.error, 'at', data.location);
        Alert.alert(
          'Login Error',
          'There was an error processing the login page. Please try again.',
          [{ text: 'OK', onPress: handleClose }]
        );
        return;
      }

      // Handle URL check from onLoadEnd
      if (data.type === 'URL_CHECK') {
        // Verify the URL hasn't changed before injecting page-specific JS
        if (webViewRef.current) {
          webViewRef.current.injectJavaScript(`
            (function() {
              try {
                if (window.location.href === ${JSON.stringify(data.url)}) {
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'URL_VERIFIED',
                    url: window.location.href
                  }));
                } else {
                  console.warn('URL changed during load, skipping injection');
                }
              } catch (error) {
                console.error('URL verification error:', error);
              }
              return true;
            })();
          `);
        }
        return;
      }

      if (data.type === 'URL_VERIFIED') {
        injectPageSpecificJavaScript(data.url);
        return;
      }

      if (data.type === 'URLs') {
        const { userJsonUrl, storeJsonUrl, cookies } = data;

        console.log('Received member login data from WebView');
        console.log('Cookies received:', Object.keys(cookies || {}).join(', '));

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

          // Extract and save session data to SecureStore for API requests
          const sessionData = extractSessionDataFromResponse(new Headers(), cookies);
          console.log('Extracted session data:', sessionData);

          // Validate session data before saving
          if (isSessionData(sessionData)) {
            await saveSessionData(sessionData);
            console.log('Member session data saved to SecureStore successfully');
          } else {
            console.warn('Incomplete session data from member login cookies - missing required fields');
            console.warn('Required: memberId, sessionId, storeId, storeName');
            console.warn('Got:', {
              hasMemberId: !!(sessionData && sessionData.memberId),
              hasSessionId: !!(sessionData && sessionData.sessionId),
              hasStoreId: !!(sessionData && sessionData.storeId),
              hasStoreName: !!(sessionData && sessionData.storeName)
            });
          }

          // Clear processed URLs for next login session
          processedUrlsRef.current.clear();

          // Call onLoginSuccess which will handle refresh and navigation
          onLoginSuccess();
        }
      }
      else if (data.type === 'VISITOR_LOGIN_ERROR') {
        console.error('Error extracting visitor login data in WebView:', data.error);
        Alert.alert(
          'Visitor Login Failed',
          'Could not extract the store information needed for visitor mode. Please try again.',
          [{ text: 'OK' }]
        );
        onLoginCancel();
      }
      else if (data.type === 'VISITOR_LOGIN') {
        const { cookies, rawCookies, url } = data;
        console.log('Received visitor login data', cookies);
        console.log('Raw cookies from WebView:', rawCookies);
        console.log('URL at login time:', url);

        // Verify we have a store ID in the cookies
        const storeId = cookies.store__id || cookies.store;
        if (!storeId) {
          console.error('No store ID found in visitor cookies. Cookies received:', JSON.stringify(cookies));
          Alert.alert(
            'Visitor Login Failed',
            'Could not find store ID in cookies. Please try again or contact support.',
            [{ text: 'OK' }]
          );
          onLoginCancel();
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
            const storeJsonUrl = `https://fsbs.beerknurd.com/bk-store-json.php?sid=${storeId}`;
            console.log('Setting all_beers_api_url to:', storeJsonUrl);
            await setPreference('all_beers_api_url', storeJsonUrl, 'API endpoint for fetching all beers');

            // For visitor mode, use empty data placeholder instead of dummy URL to prevent network errors
            await setPreference('my_beers_api_url', 'none://visitor_mode', 'Placeholder URL for visitor mode (not a real endpoint)');

            // Clear processed URLs for next login session
            processedUrlsRef.current.clear();

            // Call onLoginSuccess which will handle refresh and navigation
            onLoginSuccess();
          } else {
            // Show error message
            Alert.alert(
              'Visitor Login Failed',
              loginResult.error || 'Could not log in as visitor. Please try again.',
              [{ text: 'OK' }]
            );
            onLoginCancel();
          }
        } catch (error) {
          console.error('Error during visitor login:', error);
          Alert.alert(
            'Error',
            'An error occurred during visitor login. Please try again.',
            [{ text: 'OK' }]
          );
          onLoginCancel();
        }
      }
    } catch (error) {
      console.error('Error handling WebView message:', error);
      onLoginCancel();
    }
  }, [injectPageSpecificJavaScript, onRefreshData, onLoginSuccess, onLoginCancel, handleClose]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={handleClose}
      accessibilityLabel="Flying Saucer login modal"
      accessibilityViewIsModal={true}
      testID="login-webview-modal"
    >
      <SafeAreaView style={{ flex: 1 }}>
        <View style={[styles.webViewHeader, { backgroundColor: cardBackgroundColor, borderBottomColor: borderColor }]}>
          <TouchableOpacity
            onPress={handleClose}
            style={styles.closeButton}
            testID="close-webview-button"
          >
            <IconSymbol name="xmark" size={22} color={tintColor} />
          </TouchableOpacity>
          <ThemedText style={styles.webViewTitle}>Flying Saucer Login</ThemedText>
        </View>

        <WebView
          ref={webViewRef}
          source={{ uri: config.api.getFullUrl('kiosk') }}
          onNavigationStateChange={handleWebViewNavigationStateChange}
          onMessage={handleWebViewMessage}
          onLoadStart={() => setInternalLoading(true)}
          onLoadEnd={handleWebViewLoadEnd}
          accessible={true}
          accessibilityLabel="Flying Saucer login page"
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
          thirdPartyCookiesEnabled={true}
          originWhitelist={['https://*.beerknurd.com']}
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
          applicationNameForUserAgent="BeerSelector/1.0"
          incognito={false}
          scalesPageToFit={true}
          scrollEnabled={true}
          bounces={false}
          allowsBackForwardNavigationGestures={false}
          androidLayerType="hardware"
          cacheEnabled={true}
          cacheMode="LOAD_CACHE_ELSE_NETWORK"
          startInLoadingState={true}
          renderLoading={() => (
            <View style={[styles.webViewLoadingContainer, { backgroundColor: loadingOverlayColor }]}>
              <ActivityIndicator size="large" color={tintColor} />
              <ThemedText style={styles.webViewLoadingText}>Loading Flying Saucer...</ThemedText>
            </View>
          )}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  webViewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderBottomWidth: 1,
    // backgroundColor and borderBottomColor applied inline with theme colors
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
  webViewLoadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    // backgroundColor applied inline with theme colors
  },
  webViewLoadingText: {
    marginTop: 10,
    fontSize: 16,
  },
});
