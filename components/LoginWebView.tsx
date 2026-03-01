import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, WebViewNavigation, WebViewMessageEvent } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/Colors';
import { setPreference } from '@/src/database/preferences';
import { handleVisitorLogin } from '@/src/api/authService';
import { saveSessionData, extractSessionDataFromResponse } from '@/src/api/sessionManager';
import { isSessionData } from '@/src/types/api';
import { config } from '@/src/config';

type LoginWebViewProps = {
  visible: boolean;
  onLoginSuccess: () => void;
  onLoginCancel: () => void;
  onRefreshData: () => Promise<void>;
  loading?: boolean;
};

export default function LoginWebView({
  visible,
  onLoginSuccess,
  onLoginCancel,
  onRefreshData,
  loading: _externalLoading,
}: LoginWebViewProps) {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme() ?? 'dark';
  const colors = Colors[colorScheme];

  const [_internalLoading, setInternalLoading] = useState(false);
  const webViewRef = useRef<WebView>(null);
  const processedUrlsRef = useRef<Set<string>>(new Set());
  const lastLoggedUrlRef = useRef<{ url: string; timestamp: number }>({ url: '', timestamp: 0 });

  useEffect(() => {
    if (!visible) {
      processedUrlsRef.current.clear();
      lastLoggedUrlRef.current = { url: '', timestamp: 0 };
    }
  }, [visible]);

  const handleClose = useCallback(() => {
    processedUrlsRef.current.clear();
    Alert.alert('Login Cancelled', 'The login process was cancelled.');
    onLoginCancel();
  }, [onLoginCancel]);

  const handleWebViewNavigationStateChange = useCallback((navState: WebViewNavigation) => {
    const now = Date.now();
    const isDuplicate =
      navState.url === lastLoggedUrlRef.current.url &&
      now - lastLoggedUrlRef.current.timestamp < 500;

    if (!navState.loading && !isDuplicate) {
      console.log('Flying Saucer WebView finished loading:', navState.url);
      lastLoggedUrlRef.current = { url: navState.url, timestamp: now };
    }
  }, []);

  const handleWebViewLoadEnd = useCallback(() => {
    if (!webViewRef.current) {
      return;
    }

    setInternalLoading(false);

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

  const injectPageSpecificJavaScript = useCallback((url: string) => {
    const urlKey = url;

    if (processedUrlsRef.current.has(urlKey)) {
      return;
    }

    if (url.includes('member-dash.php')) {
      processedUrlsRef.current.add(urlKey);

      if (webViewRef.current) {
        webViewRef.current.injectJavaScript(`
          (function() {
            try {
              if (!window.ReactNativeWebView || !window.ReactNativeWebView.postMessage) {
                console.error('ReactNativeWebView bridge not available');
                return false;
              }

              const html = document.documentElement.outerHTML;

              const memberJsonMatch = html.match(/https:\\/\\/[^"'\\s]+bk-member-json\\.php\\?uid=\\d+/i);
              const storeJsonMatch = html.match(/https:\\/\\/[^"'\\s]+bk-store-json\\.php\\?sid=\\d+/i);

              const userJsonUrl = memberJsonMatch ? memberJsonMatch[0] : null;
              const storeJsonUrl = storeJsonMatch ? storeJsonMatch[0] : null;

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

              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'URLs',
                userJsonUrl,
                storeJsonUrl,
                cookies: cookies
              }));
            } catch (error) {
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
    else if (url.includes('visitor.php')) {
      processedUrlsRef.current.add(urlKey);

      console.log('Visitor mode detected in WebView at URL:', url);

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

  const handleWebViewMessage = useCallback(
    async (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);

        if (data.type === 'JS_INJECTION_ERROR') {
          console.error('JavaScript injection failed:', data.error, 'at', data.location);
          Alert.alert(
            'Login Error',
            'There was an error processing the login page. Please try again.',
            [{ text: 'OK', onPress: handleClose }]
          );
          return;
        }

        if (data.type === 'URL_CHECK') {
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
            await setPreference(
              'is_visitor_mode',
              'false',
              'Flag indicating whether the user is in visitor mode'
            );

            setPreference('user_json_url', userJsonUrl, 'API endpoint for user data');
            setPreference('store_json_url', storeJsonUrl, 'API endpoint for store data');

            setPreference(
              'my_beers_api_url',
              userJsonUrl,
              'API endpoint for fetching Beerfinder beers'
            );
            setPreference('all_beers_api_url', storeJsonUrl, 'API endpoint for fetching all beers');

            setPreference(
              'last_login_timestamp',
              new Date().toISOString(),
              'Last successful login timestamp'
            );

            setPreference('auth_cookies', JSON.stringify(cookies), 'Authentication cookies');

            const sessionData = extractSessionDataFromResponse(new Headers(), cookies);
            console.log('Extracted session data:', sessionData);

            if (isSessionData(sessionData)) {
              await saveSessionData(sessionData);
              console.log('Member session data saved to SecureStore successfully');
            } else {
              console.warn(
                'Incomplete session data from member login cookies - missing required fields'
              );
              console.warn('Required: memberId, sessionId, storeId, storeName');
              console.warn('Got:', {
                hasMemberId: !!(sessionData && sessionData.memberId),
                hasSessionId: !!(sessionData && sessionData.sessionId),
                hasStoreId: !!(sessionData && sessionData.storeId),
                hasStoreName: !!(sessionData && sessionData.storeName),
              });
            }

            processedUrlsRef.current.clear();

            onLoginSuccess();
          }
        } else if (data.type === 'VISITOR_LOGIN_ERROR') {
          console.error('Error extracting visitor login data in WebView:', data.error);
          Alert.alert(
            'Visitor Login Failed',
            'Could not extract the store information needed for visitor mode. Please try again.',
            [{ text: 'OK' }]
          );
          onLoginCancel();
        } else if (data.type === 'VISITOR_LOGIN') {
          const { cookies, rawCookies, url } = data;
          console.log('Received visitor login data', cookies);
          console.log('Raw cookies from WebView:', rawCookies);
          console.log('URL at login time:', url);

          const storeId = cookies.store__id || cookies.store;
          if (!storeId) {
            console.error(
              'No store ID found in visitor cookies. Cookies received:',
              JSON.stringify(cookies)
            );
            Alert.alert(
              'Visitor Login Failed',
              'Could not find store ID in cookies. Please try again or contact support.',
              [{ text: 'OK' }]
            );
            onLoginCancel();
            return;
          }

          try {
            const loginResult = await handleVisitorLogin(cookies);
            console.log('Visitor login result:', loginResult);

            if (loginResult.success) {
              await setPreference(
                'is_visitor_mode',
                'true',
                'Flag indicating whether the user is in visitor mode'
              );

              const storeJsonUrl = `https://fsbs.beerknurd.com/bk-store-json.php?sid=${storeId}`;
              console.log('Setting all_beers_api_url to:', storeJsonUrl);
              await setPreference(
                'all_beers_api_url',
                storeJsonUrl,
                'API endpoint for fetching all beers'
              );

              await setPreference(
                'my_beers_api_url',
                'none://visitor_mode',
                'Placeholder URL for visitor mode (not a real endpoint)'
              );

              processedUrlsRef.current.clear();

              onLoginSuccess();
            } else {
              Alert.alert(
                'Visitor Login Failed',
                loginResult.error || 'Could not log in as visitor. Please try again.',
                [{ text: 'OK' }]
              );
              onLoginCancel();
            }
          } catch (error) {
            console.error('Error during visitor login:', error);
            Alert.alert('Error', 'An error occurred during visitor login. Please try again.', [
              { text: 'OK' },
            ]);
            onLoginCancel();
          }
        }
      } catch (error) {
        console.error('Error handling WebView message:', error);
        onLoginCancel();
      }
    },
    [injectPageSpecificJavaScript, onRefreshData, onLoginSuccess, onLoginCancel, handleClose]
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={handleClose}
      accessibilityLabel="Flying Saucer login modal"
      accessibilityViewIsModal={true}
    >
      <View style={{ flex: 1, backgroundColor: colors.background }} testID="login-webview-modal">
        <View
          style={[
            styles.webViewHeader,
            {
              backgroundColor: colors.backgroundElevated,
              borderBottomColor: colors.border,
              paddingTop: insets.top + 12,
            },
          ]}
        >
          <TouchableOpacity
            onPress={handleClose}
            style={[styles.closeButton, { backgroundColor: colors.backgroundActive }]}
            testID="close-webview-button"
          >
            <Ionicons name="close" size={16} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.webViewTitle, { color: colors.text }]}>Flying Saucer Login</Text>
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
          onError={syntheticEvent => {
            const { nativeEvent } = syntheticEvent;
            console.error('WebView error:', nativeEvent);
          }}
          onHttpError={syntheticEvent => {
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
            <View
              style={[styles.webViewLoadingContainer, { backgroundColor: colors.background }]}
            >
              <ActivityIndicator size="large" color={colors.tint} />
              <Text style={[styles.webViewLoadingText, { color: colors.textSecondary }]}>Loading Flying Saucer...</Text>
            </View>
          )}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  webViewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderBottomWidth: 1,
  },
  closeButton: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  webViewTitle: {
    flex: 1,
    fontFamily: 'Inter',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginRight: 40,
  },
  webViewLoadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  webViewLoadingText: {
    fontFamily: 'Space Mono',
    fontSize: 11,
    marginTop: 10,
  },
});
