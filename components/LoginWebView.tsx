import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, WebViewNavigation, WebViewMessageEvent } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/Colors';
import { config } from '@/src/config';
import { handleLoginMessage } from '@/src/api/loginMessageHandler';

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
  // Accepted and ignored, deliberately. `app/settings.tsx` passes this prop AND
  // passes the same callback to `useLoginFlow`, which is what actually invokes
  // it (useLoginFlow.ts:241, from `handleLoginSuccess` — the `onLoginSuccess`
  // prop below). So the refresh does happen; this copy has never been wired to
  // anything. Underscore-prefixed to match `loading` on the next line rather
  // than dropped from the props type, which would be an API change for every
  // caller. Removing it from `LoginWebViewProps` is the real cleanup.
  onRefreshData: _onRefreshData,
  loading: _externalLoading,
}: LoginWebViewProps) {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme() ?? 'dark';
  const colors = Colors[colorScheme];

  const [, setInternalLoading] = useState(false);
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

  // The WebView asks the page to confirm it is still on `url` before anything
  // is injected into it. Kept here rather than in the handler module: it is
  // the one branch whose entire effect is a ref call.
  const injectUrlVerification = useCallback((url: string) => {
    if (!webViewRef.current) {
      return;
    }
    webViewRef.current.injectJavaScript(`
            (function() {
              try {
                if (window.location.href === ${JSON.stringify(url)}) {
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
  }, []);

  // Everything this used to do inline now lives in `handleLoginMessage`, which
  // runs on vitest. What stays is the wiring: the four things that genuinely
  // need this component's refs and modal, passed in as seams.
  const handleWebViewMessage = useCallback(
    async (event: WebViewMessageEvent) => {
      await handleLoginMessage(event.nativeEvent.data, {
        onLoginSuccess,
        onLoginCancel,
        clearProcessedUrls: () => processedUrlsRef.current.clear(),
        injectUrlVerification,
        injectPageSpecificJavaScript,
        onInjectionError: handleClose,
      });
    },
    [
      injectPageSpecificJavaScript,
      injectUrlVerification,
      onLoginSuccess,
      onLoginCancel,
      handleClose,
    ]
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
