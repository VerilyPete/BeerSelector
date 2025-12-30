import * as SecureStore from 'expo-secure-store';
import { SessionData, isSessionData } from '../types/api';

// Session storage key
const SESSION_STORAGE_KEY = 'beerknurd_session';

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
    // Handle locked device case gracefully - this is expected when app launches
    // from lock screen (e.g., via Live Activity tap) before device is unlocked
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('User interaction is not allowed')) {
      console.log('[SessionManager] Device locked, cannot access secure storage');
      return null;
    }
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
  _headers: Headers,
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
