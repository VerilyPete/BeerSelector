import * as SecureStore from 'expo-secure-store';
import { SessionData, isSessionData } from '../types/api';

// Session storage key
const SESSION_STORAGE_KEY = 'beerknurd_session';

// Auth cookies storage keys (SecureStore — never plaintext SQLite).
// expo-secure-store caps a single value at 2048 bytes, so the cookie JSON is
// base64-encoded (byte-safe splitting, no multibyte corruption) and written
// as numbered chunks. The meta key holds the chunk count and is written last,
// acting as the commit marker: an interrupted save is never readable.
const AUTH_COOKIES_STORAGE_KEY = 'beerknurd_auth_cookies';
const AUTH_COOKIES_META_KEY = 'beerknurd_auth_cookies_meta';
const AUTH_COOKIES_CHUNK_CHARS = 1500;

// UTF-8-safe base64 (encodeURIComponent→binary→btoa). Avoids TextEncoder,
// which is not available in every JS environment this code runs in.
const toBase64 = (value: string): string => btoa(unescape(encodeURIComponent(value)));

const fromBase64 = (encoded: string): string =>
  decodeURIComponent(escape(atob(encoded)));

const chunkString = (value: string, size: number): string[] => {
  const chunks: string[] = [];
  for (let i = 0; i < value.length; i += size) {
    chunks.push(value.substring(i, i + size));
  }
  return chunks;
};

/**
 * Saves captured authentication cookies to secure storage.
 * Large payloads are base64-encoded and chunked to stay under
 * SecureStore's 2048-byte per-value limit.
 * @param cookiesJson JSON string of cookie name-value pairs
 */
export const saveAuthCookies = async (cookiesJson: string): Promise<void> => {
  try {
    const chunks = chunkString(toBase64(cookiesJson), AUTH_COOKIES_CHUNK_CHARS);
    for (let i = 0; i < chunks.length; i++) {
      await SecureStore.setItemAsync(`${AUTH_COOKIES_STORAGE_KEY}:${i}`, chunks[i]);
    }
    await SecureStore.setItemAsync(AUTH_COOKIES_META_KEY, String(chunks.length));
  } catch (error) {
    console.error('Error saving auth cookies:', error);
    throw error;
  }
};

/**
 * Gets captured authentication cookies from secure storage
 * @returns The JSON string of cookie name-value pairs if it exists, otherwise null
 */
export const getAuthCookies = async (): Promise<string | null> => {
  try {
    const meta = await SecureStore.getItemAsync(AUTH_COOKIES_META_KEY);
    if (!meta) {
      return null;
    }
    const chunkCount = parseInt(meta, 10);
    if (!Number.isFinite(chunkCount) || chunkCount < 1) {
      return null;
    }
    const chunks: string[] = [];
    for (let i = 0; i < chunkCount; i++) {
      const chunk = await SecureStore.getItemAsync(`${AUTH_COOKIES_STORAGE_KEY}:${i}`);
      if (!chunk) {
        // Partial write — treat as absent rather than returning corrupt data.
        return null;
      }
      chunks.push(chunk);
    }
    return fromBase64(chunks.join(''));
  } catch (error) {
    console.error('Error getting auth cookies:', error);
    return null;
  }
};

/**
 * Clears captured authentication cookies from secure storage
 */
export const clearAuthCookies = async (): Promise<void> => {
  try {
    const meta = await SecureStore.getItemAsync(AUTH_COOKIES_META_KEY);
    const chunkCount = meta ? parseInt(meta, 10) || 0 : 0;
    for (let i = 0; i < chunkCount; i++) {
      await SecureStore.deleteItemAsync(`${AUTH_COOKIES_STORAGE_KEY}:${i}`);
    }
    await SecureStore.deleteItemAsync(AUTH_COOKIES_META_KEY);
    // Also remove the single-value format used by the first draft of this store.
    await SecureStore.deleteItemAsync(AUTH_COOKIES_STORAGE_KEY);
  } catch (error) {
    console.error('Error clearing auth cookies:', error);
    throw error;
  }
};

/**
 * Saves session data to secure storage
 * @param sessionData The session data to save
 */
export const saveSessionData = async (sessionData: SessionData): Promise<void> => {
  try {
    await SecureStore.setItemAsync(SESSION_STORAGE_KEY, JSON.stringify(sessionData));
    console.log('Session data saved successfully');
  } catch (error) {
    console.error('Error saving session data:', error);
    throw error;
  }
};

/**
 * Gets session data from secure storage
 * @returns The session data if it exists, otherwise null
 */
export const getSessionData = async (): Promise<SessionData | null> => {
  try {
    const sessionDataStr = await SecureStore.getItemAsync(SESSION_STORAGE_KEY);
    if (!sessionDataStr) {
      return null;
    }

    const parsedData = JSON.parse(sessionDataStr);

    // Validate the session data using the type guard
    if (isSessionData(parsedData)) {
      return parsedData;
    } else {
      console.warn('Invalid session data format in storage');
      return null;
    }
  } catch (error) {
    console.error('Error getting session data:', error);
    return null;
  }
};

/**
 * Clears session data from secure storage
 */
export const clearSessionData = async (): Promise<void> => {
  try {
    await SecureStore.deleteItemAsync(SESSION_STORAGE_KEY);
    console.log('Session data cleared successfully');
  } catch (error) {
    console.error('Error clearing session data:', error);
    throw error;
  }
};

/**
 * Checks if a session exists
 * @returns True if a session exists, otherwise false
 */
export const hasSession = async (): Promise<boolean> => {
  try {
    const sessionData = await getSessionData();
    return !!sessionData;
  } catch (error) {
    console.error('Error checking session:', error);
    return false;
  }
};

/**
 * Parses cookies from set-cookie header
 * @param setCookieHeader The set-cookie header to parse
 * @returns An object with cookie name-value pairs
 */
export const parseCookies = (setCookieHeader: string): Record<string, string> => {
  const cookies: Record<string, string> = {};

  try {
    if (!setCookieHeader) {
      return cookies;
    }

    const cookieList = setCookieHeader.split(';');
    const mainCookie = cookieList[0];

    if (mainCookie) {
      const equalsIndex = mainCookie.indexOf('=');
      if (equalsIndex > 0) {
        const name = mainCookie.substring(0, equalsIndex).trim();
        const value = mainCookie.substring(equalsIndex + 1).trim();
        if (name && value) {
          cookies[name] = value;
        }
      }
    }

    // Also parse additional cookies in the header
    for (let i = 1; i < cookieList.length; i++) {
      const cookie = cookieList[i];
      const equalsIndex = cookie.indexOf('=');
      if (equalsIndex > 0) {
        const name = cookie.substring(0, equalsIndex).trim();
        const value = cookie.substring(equalsIndex + 1).trim();
        if (name && value) {
          cookies[name] = value;
        }
      }
    }
  } catch (error) {
    console.error('Error parsing cookies:', error);
  }

  return cookies;
};

/**
 * Extracts session data from response headers and cookies
 * @param headers The response headers
 * @param cookies The cookies from the response
 * @returns The extracted session data
 */
export const extractSessionDataFromResponse = (
  headers: Headers,
  cookies: Record<string, string>
): Partial<SessionData> => {
  const sessionData: Partial<SessionData> = {};

  try {
    // Extract PHPSESSID
    if (cookies.PHPSESSID) {
      sessionData.sessionId = cookies.PHPSESSID;
    }

    // Extract other cookie values if they exist
    if (cookies.store__id) sessionData.storeId = cookies.store__id;

    // Safely decode URI components with error handling
    if (cookies.store_name) {
      try {
        sessionData.storeName = decodeURIComponent(cookies.store_name);
      } catch (e) {
        sessionData.storeName = cookies.store_name;
        console.warn('Failed to decode store_name cookie:', e);
      }
    }

    if (cookies.member_id) sessionData.memberId = cookies.member_id;

    if (cookies.username) {
      try {
        sessionData.username = decodeURIComponent(cookies.username);
      } catch (e) {
        sessionData.username = cookies.username;
        console.warn('Failed to decode username cookie:', e);
      }
    }

    if (cookies.first_name) {
      try {
        sessionData.firstName = decodeURIComponent(cookies.first_name);
      } catch (e) {
        sessionData.firstName = cookies.first_name;
        console.warn('Failed to decode first_name cookie:', e);
      }
    }

    if (cookies.last_name) {
      try {
        sessionData.lastName = decodeURIComponent(cookies.last_name);
      } catch (e) {
        sessionData.lastName = cookies.last_name;
        console.warn('Failed to decode last_name cookie:', e);
      }
    }

    if (cookies.email) {
      try {
        sessionData.email = decodeURIComponent(cookies.email);
      } catch (e) {
        sessionData.email = cookies.email;
        console.warn('Failed to decode email cookie:', e);
      }
    }

    if (cookies.cardNum) sessionData.cardNum = cookies.cardNum;
  } catch (error) {
    console.error('Error extracting session data from cookies:', error);
  }

  return sessionData;
};