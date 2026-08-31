import { Platform } from 'react-native';

/** Remove cookies from every native store used by fetch and react-native-webview. */
export async function clearNativeCookies(): Promise<void> {
  if (Platform.OS === 'web') {
    // The native module has no web implementation. Expire what JavaScript can
    // reach, but do not report complete cleanup: HttpOnly cookies and cookies
    // owned by the authentication origin are intentionally inaccessible here.
    if (typeof document !== 'undefined') {
      for (const cookie of document.cookie.split(';')) {
        const name = cookie.split('=', 1)[0]?.trim();
        if (name) document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
      }
    }
    throw new Error('Browser authentication cookies require a successful server-side logout');
  }

  const { default: CookieManager } = await import('@preeternal/react-native-cookie-manager');
  await CookieManager.clearAllStores();
}
