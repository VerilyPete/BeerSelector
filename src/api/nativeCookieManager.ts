import { Platform } from 'react-native';

/** Remove cookies from every native store used by fetch and react-native-webview. */
export async function clearNativeCookies(): Promise<void> {
  if (Platform.OS === 'web') {
    // The native module has no web implementation. Clear cookies reachable by
    // the current origin without evaluating a TurboModule in the browser.
    if (typeof document !== 'undefined') {
      for (const cookie of document.cookie.split(';')) {
        const name = cookie.split('=', 1)[0]?.trim();
        if (name) document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
      }
    }
    return;
  }

  const { default: CookieManager } = await import(
    '@preeternal/react-native-cookie-manager'
  );
  await CookieManager.clearAllStores();
}
