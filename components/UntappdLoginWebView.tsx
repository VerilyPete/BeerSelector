import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Modal, View, TouchableOpacity, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, WebViewNavigation, WebViewMessageEvent } from 'react-native-webview';

import { ThemedText } from '@/components/ThemedText';
import { IconSymbol } from '@/components/ui/IconSymbol';
import { useThemeColor } from '@/hooks/useThemeColor';
import { setUntappdCookie } from '@/src/database/db';
import { config } from '@/src/config';

interface UntappdLoginWebViewProps {
  visible: boolean;
  onLoginSuccess: () => void;
  onLoginCancel: () => void;
  loading?: boolean;
}

export default function UntappdLoginWebView({
  visible,
  onLoginSuccess,
  onLoginCancel,
  loading: externalLoading
}: UntappdLoginWebViewProps) {
  const tintColor = useThemeColor({}, 'tint');
  const cardBackgroundColor = useThemeColor({ light: '#F5F5F5', dark: '#1C1C1E' }, 'background');
  const borderColor = useThemeColor({ light: '#CCCCCC', dark: '#333333' }, 'text');
  const loadingOverlayColor = useThemeColor({ light: 'rgba(255, 255, 255, 0.8)', dark: 'rgba(28, 28, 30, 0.8)' }, 'background');

  const [internalLoading, setInternalLoading] = useState(true);
  const untappdWebViewRef = useRef<WebView>(null);

  // Use external loading prop if provided, otherwise use internal state
  const loading = externalLoading !== undefined ? externalLoading : internalLoading;

  // Cleanup state when modal closes to prevent stale state
  useEffect(() => {
    if (!visible) {
      setInternalLoading(true); // Reset loading state for next open
    }
  }, [visible]);

  // Handle close button
  const handleClose = useCallback(() => {
    Alert.alert('Untappd Login Cancelled', 'The Untappd login process was cancelled.');
    onLoginCancel();
  }, [onLoginCancel]);

  // Handle Untappd WebView navigation state changes
  const handleUntappdWebViewNavigationStateChange = useCallback((navState: WebViewNavigation) => {
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
  }, []);

  // Handle messages from Untappd WebView
  const handleUntappdWebViewMessage = useCallback((event: WebViewMessageEvent) => {
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

          // Set a special cookie to mark that we've detected login
          setUntappdCookie('untappd_logged_in_detected', 'true', 'Login was detected by app');

          // Show success message and close WebView
          Alert.alert(
            'Untappd Login Successful',
            'You are now logged in to Untappd.',
            [
              {
                text: 'OK',
                onPress: onLoginSuccess
              }
            ]
          );
        } else {
          console.log('Login message received but not from a profile/home page, ignoring');
        }
      }
    } catch (error) {
      console.error('Error handling Untappd WebView message:', error);
      onLoginCancel();
    }
  }, [onLoginSuccess, onLoginCancel]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={handleClose}
      accessibilityLabel="Untappd login modal"
      accessibilityViewIsModal={true}
      testID="untappd-webview-modal"
    >
      <SafeAreaView style={{ flex: 1 }}>
        <View style={[styles.webViewHeader, { backgroundColor: cardBackgroundColor, borderBottomColor: borderColor }]}>
          <TouchableOpacity
            onPress={handleClose}
            style={styles.closeButton}
            testID="close-untappd-webview-button"
          >
            <IconSymbol name="xmark" size={22} color={tintColor} />
          </TouchableOpacity>
          <ThemedText style={styles.webViewTitle}>Untappd Login</ThemedText>
        </View>

        <WebView
          ref={untappdWebViewRef}
          source={{ uri: config.external.untappd.loginUrl }}
          onNavigationStateChange={handleUntappdWebViewNavigationStateChange}
          onMessage={handleUntappdWebViewMessage}
          accessible={true}
          accessibilityLabel="Untappd login page"
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
          cacheMode="LOAD_CACHE_ELSE_NETWORK"
          cacheEnabled={true}
          androidLayerType="hardware"
          onLoadStart={() => setInternalLoading(true)}
          onLoadEnd={() => {
            setInternalLoading(false);
          }}
          renderLoading={() => (
            <View style={[styles.webViewLoadingContainer, { backgroundColor: loadingOverlayColor }]}>
              <ActivityIndicator size="large" color={tintColor} />
              <ThemedText style={styles.webViewLoadingText}>Loading Untappd...</ThemedText>
            </View>
          )}
          startInLoadingState={true}
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
