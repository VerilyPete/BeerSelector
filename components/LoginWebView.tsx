import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, WebViewNavigation, WebViewMessageEvent } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/Colors';
import { setPreference } from '@/src/database/preferences';
import { commitTaplistWrite } from '@/src/services/taplistEtag';
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

/**
 * Write the login preferences that nothing reads.
 *
 * `user_json_url`, `store_json_url`, `last_login_timestamp` and `auth_cookies`
 * are each written at exactly one site — this one — and read nowhere in
 * production. They are worth keeping for diagnosing a login after the fact, but
 * a contention failure on a value no code consults must not abort the login:
 * the caller's catch would skip `saveSessionData`, which is the write
 * `autoLogin` actually depends on.
 */
async function recordUnreadLoginMetadata({
  userJsonUrl,
  storeJsonUrl,
  cookies,
}: {
  userJsonUrl: string;
  storeJsonUrl: string;
  cookies: unknown;
}): Promise<void> {
  try {
    await setPreference('user_json_url', userJsonUrl, 'API endpoint for user data');
    await setPreference('store_json_url', storeJsonUrl, 'API endpoint for store data');
    await setPreference(
      'last_login_timestamp',
      new Date().toISOString(),
      'Last successful login timestamp'
    );
    await setPreference('auth_cookies', JSON.stringify(cookies), 'Authentication cookies');
  } catch (error) {
    console.warn('Login metadata write failed; login continues because nothing reads it:', error);
  }
}

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
    } else if (url.includes('visitor.php')) {
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
            try {
              // The ETag is scoped to a store; the preference key is not. The
              // rows and the stored ETag still correspond to each other — what
              // changes at login is `all_beers_api_url`, so the ETag now names a
              // store the app is no longer pointed at. Cleared FIRST, before the
              // URL that orphans it, so that a throw or app death anywhere below
              // costs one extra full fetch rather than leaving the new store's
              // URL paired with the old store's validator.
              await commitTaplistWrite({ kind: 'cleared' });

              // Nothing reads these four — verified: zero `getPreference` call
              // sites for any of them. A contention failure on a value no code
              // consults must not abort the login, because aborting skips
              // `saveSessionData` below, which is the write `autoLogin` depends on.
              await recordUnreadLoginMetadata({ userJsonUrl, storeJsonUrl, cookies });

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

              // The gate flips LAST. `areApiUrlsConfigured` reads exactly
              // is_visitor_mode, all_beers_api_url and my_beers_api_url, and
              // app/_layout.tsx routes on it. Writing them before the session is
              // persisted let a failed login boot the app into full member mode
              // with nothing in SecureStore — configured, unauthenticated, and
              // with no record of the failure, since nothing reads the two keys
              // that witnessed it.
              await setPreference(
                'my_beers_api_url',
                userJsonUrl,
                'API endpoint for fetching Beerfinder beers'
              );
              await setPreference(
                'all_beers_api_url',
                storeJsonUrl,
                'API endpoint for fetching all beers'
              );
              await setPreference(
                'is_visitor_mode',
                'false',
                'Flag indicating whether the user is in visitor mode'
              );

              processedUrlsRef.current.clear();

              onLoginSuccess();
            } catch (error) {
              // The member branch used to be the only path here that said
              // nothing: the modal closed and the user was returned to Settings
              // with no indication that anything had failed. The visitor branch
              // below has alerted on its own failures all along.
              console.error('Error completing member login:', error);
              Alert.alert(
                'Login Failed',
                'Could not finish signing you in. This is usually temporary — please try again.',
                [{ text: 'OK' }]
              );
              onLoginCancel();
            }
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
              await commitTaplistWrite({ kind: 'cleared' });

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
            <View style={[styles.webViewLoadingContainer, { backgroundColor: colors.background }]}>
              <ActivityIndicator size="large" color={colors.tint} />
              <Text style={[styles.webViewLoadingText, { color: colors.textSecondary }]}>
                Loading Flying Saucer...
              </Text>
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
    fontFamily: 'SpaceGrotesk-SemiBold',
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
    fontFamily: 'SpaceMono',
    fontSize: 11,
    marginTop: 10,
  },
});
