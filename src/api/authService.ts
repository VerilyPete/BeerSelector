import { saveSessionData, clearSessionData } from './sessionManager';
import { getApiClient } from './apiClientInstance';
import { getPreference, setPreference } from '../database/preferences';
import { refreshAllDataFromAPI } from '../services/dataUpdateService';
import { SessionData, ApiError, LoginResult, LogoutResult } from '../types/api';

// Using LoginResult interface from ../types/api

/**
 * Attempts to automatically login using stored cookies
 * @returns The result of the login process
 */
export async function autoLogin(): Promise<LoginResult> {
  try {
    const apiClient = getApiClient();
    const response = await apiClient.post<{ session: SessionData }>('/auto-login.php', {});

    if (!response.success) {
      return {
        success: false,
        error: response.error || 'Auto-login failed',
        statusCode: response.statusCode || 401,
      };
    }

    if (!response.data?.session) {
      return {
        success: false,
        error: 'Auto-login failed: no session data',
        statusCode: response.statusCode || 401,
      };
    }

    // Save the session data
    await saveSessionData(response.data.session);

    // Check if user is in visitor mode
    const isVisitor = await getPreference('is_visitor_mode');
    const isVisitorMode = isVisitor === 'true';

    // Refresh all data if autologin was successful
    if (!isVisitorMode) {
      try {
        await refreshAllDataFromAPI();
        console.log('Successfully refreshed all data after auto-login');
      } catch (refreshError) {
        console.error('Error refreshing data after auto-login:', refreshError);
      }
    }

    return {
      success: true,
      message: 'Auto-login successful',
      data: response.data,
      sessionData: response.data.session,
      statusCode: response.statusCode,
      isVisitorMode: isVisitorMode,
    };
  } catch (error) {
    console.error('Error during auto-login:', error);

    if (error instanceof ApiError) {
      return {
        success: false,
        error: error.message,
        statusCode: error.statusCode,
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      statusCode: 500,
    };
  }
}

/**
 * Handles a visitor login process to Flying Saucer
 * @param cookies The cookies received from the visitor login process
 * @returns The result of the login process
 */
export const handleVisitorLogin = async (
  cookies: string | Record<string, string>
): Promise<LoginResult> => {
  try {
    // Parse cookies if they're in string format
    const parsedCookies = typeof cookies === 'string' ? parseCookiesString(cookies) : cookies;

    console.log('Visitor login - parsing cookies:', JSON.stringify(parsedCookies));

    // For visitor mode, we ONLY need the store ID from cookies
    const storeId = parsedCookies.store__id || parsedCookies.store || '';

    // Validate that we have a store ID (the only required field)
    if (!storeId) {
      console.error('Missing store ID in cookies for visitor mode');
      return {
        success: false,
        error: 'Missing store ID required for visitor mode',
        statusCode: 401,
      };
    }

    // Decode store name with fallback
    let storeName = 'Flying Saucer';
    try {
      if (parsedCookies.store_name) {
        storeName = decodeURIComponent(parsedCookies.store_name);
      }
    } catch (e) {
      console.warn('Failed to decode store_name cookie:', e);
    }

    // Build complete session data for visitor mode
    const sessionData: SessionData = {
      sessionId: parsedCookies.PHPSESSID || 'visitor_session',
      storeId: storeId,
      memberId: 'visitor',
      storeName: storeName,
    };

    // Store information about visitor mode
    await setPreference(
      'is_visitor_mode',
      'true',
      'Flag indicating whether the user is in visitor mode'
    );

    // Store additional information if available
    if (parsedCookies.store_code) {
      await setPreference('store_code', parsedCookies.store_code, 'Store code for visitor');
    }

    if (parsedCookies.store__state) {
      await setPreference('store_state', parsedCookies.store__state, 'Store state for visitor');
    }

    // Save the session data
    console.log('Saving visitor session data:', JSON.stringify(sessionData));
    await saveSessionData(sessionData);

    return {
      success: true,
      message: 'Visitor login successful',
      sessionData: sessionData,
      statusCode: 200,
      isVisitorMode: true,
    };
  } catch (error) {
    console.error('Error handling visitor login:', error);

    if (error instanceof ApiError) {
      return {
        success: false,
        error: error.message,
        statusCode: error.statusCode,
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during visitor login',
      statusCode: 500,
    };
  }
};

/**
 * Handles the login process to Flying Saucer
 * @param cookies The cookies received from the login process
 * @param headers The headers received from the login process
 * @returns The result of the login process
 */
export const handleTapThatAppLogin = async (
  cookies: string | Record<string, string>,
  _headers?: Headers
): Promise<LoginResult> => {
  try {
    // Parse cookies if they're in string format
    const parsedCookies = typeof cookies === 'string' ? parseCookiesString(cookies) : cookies;

    // Extract required fields
    const sessionId = parsedCookies.PHPSESSID || '';
    const storeId = parsedCookies.store__id || parsedCookies.store || '';
    const memberId = parsedCookies.member_id || '';

    // Validate that we have the minimum required data
    if (!sessionId || !memberId || !storeId) {
      return {
        success: false,
        error: 'Missing required login data',
        statusCode: 401,
      };
    }

    // Safely decode store name with fallback
    let storeName = 'Flying Saucer';
    try {
      if (parsedCookies.store_name) {
        storeName = decodeURIComponent(parsedCookies.store_name);
      }
    } catch (e) {
      storeName = parsedCookies.store_name || 'Flying Saucer';
      console.warn('Failed to decode store_name cookie:', e);
    }

    // Build complete session data with required fields
    const sessionData: SessionData = {
      sessionId,
      storeId,
      memberId,
      storeName,
    };

    // Safely decode optional URI components
    const decodeOptional = (value: string | undefined, field: string): string | undefined => {
      if (!value) return undefined;
      try {
        return decodeURIComponent(value);
      } catch (e) {
        console.warn(`Failed to decode ${field} cookie:`, e);
        return value;
      }
    };

    sessionData.username = decodeOptional(parsedCookies.username, 'username');
    sessionData.firstName = decodeOptional(parsedCookies.first_name, 'first_name');
    sessionData.lastName = decodeOptional(parsedCookies.last_name, 'last_name');
    sessionData.email = decodeOptional(parsedCookies.email, 'email');
    if (parsedCookies.cardNum) {
      sessionData.cardNum = parsedCookies.cardNum;
    }

    // This is a regular login, not a visitor login
    await setPreference(
      'is_visitor_mode',
      'false',
      'Flag indicating whether the user is in visitor mode'
    );

    // Save the session data
    await saveSessionData(sessionData);

    return {
      success: true,
      message: 'Login successful',
      sessionData: sessionData,
      statusCode: 200,
      isVisitorMode: false,
    };
  } catch (error) {
    console.error('Error handling login:', error);

    if (error instanceof ApiError) {
      return {
        success: false,
        error: error.message,
        statusCode: error.statusCode,
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during login',
      statusCode: 500,
    };
  }
};

/**
 * Logs out the user by clearing the session data
 * @returns A login result indicating success or failure
 */
export async function logout(): Promise<LogoutResult> {
  try {
    const apiClient = getApiClient();
    await apiClient.post('/logout.php', {});
    await clearSessionData();

    // Clear visitor mode flag on logout
    await setPreference(
      'is_visitor_mode',
      'false',
      'Flag indicating whether the user is in visitor mode'
    );

    return {
      success: true,
      message: 'Logout successful',
      statusCode: 200,
    };
  } catch (error) {
    console.error('Error during logout:', error);

    if (error instanceof ApiError) {
      return {
        success: false,
        error: error.message,
        statusCode: error.statusCode,
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during logout',
      statusCode: 500,
    };
  }
}

/**
 * Parses cookies from a cookie string
 * @param cookiesString The cookie string to parse
 * @returns An object with cookie name-value pairs
 */
const parseCookiesString = (cookiesString: string): Record<string, string> => {
  const cookies: Record<string, string> = {};

  try {
    if (!cookiesString) {
      return cookies;
    }

    // Split the cookies string by semicolons and process each cookie
    const cookieParts = cookiesString.split(';');

    cookieParts.forEach(cookiePart => {
      const trimmedPart = cookiePart.trim();
      if (!trimmedPart) return;

      const equalsIndex = trimmedPart.indexOf('=');
      if (equalsIndex > 0) {
        const name = trimmedPart.substring(0, equalsIndex).trim();
        const value = trimmedPart.substring(equalsIndex + 1).trim();
        if (name) {
          cookies[name] = value;
        }
      }
    });
  } catch (error) {
    console.error('Error parsing cookies string:', error);
  }

  return cookies;
};

/**
 * Logs in a user with username and password
 * @param username The username to login with
 * @param password The password to login with
 * @returns A login result indicating success or failure
 */
export async function login(username: string, password: string): Promise<LoginResult> {
  try {
    // Validate input
    if (!username || !password) {
      return {
        success: false,
        error: 'Username and password are required',
        statusCode: 400,
      };
    }

    const apiClient = getApiClient();
    const response = await apiClient.post<{ session: SessionData }>('/login.php', {
      username,
      password,
    });

    if (!response.success) {
      return {
        success: false,
        error: response.error || 'Login failed',
        statusCode: response.statusCode || 401,
      };
    }

    if (!response.data?.session) {
      return {
        success: false,
        error: 'Login failed: no session data',
        statusCode: response.statusCode || 401,
      };
    }

    // Save the session data
    await saveSessionData(response.data.session);

    // Clear visitor mode flag on regular login
    await setPreference(
      'is_visitor_mode',
      'false',
      'Flag indicating whether the user is in visitor mode'
    );

    // Refresh all data from the API, including rewards
    try {
      await refreshAllDataFromAPI();
      console.log('Successfully refreshed all data after login');
    } catch (refreshError) {
      console.error('Error refreshing data after login:', refreshError);
    }

    return {
      success: true,
      message: 'Login successful',
      data: response.data,
      sessionData: response.data.session,
      statusCode: response.statusCode,
      isVisitorMode: false,
    };
  } catch (error) {
    console.error('Error during login:', error);

    if (error instanceof ApiError) {
      return {
        success: false,
        error: error.message,
        statusCode: error.statusCode,
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      statusCode: 500,
    };
  }
}

// Cache for visitor mode to reduce database access
let visitorModeCache: { value: boolean | null; timestamp: number } = {
  value: null,
  timestamp: 0,
};

/**
 * Checks if the user is currently in visitor mode
 * @param forceRefresh If true, ignores the cache and fetches fresh data
 * @returns Promise<boolean> indicating if visitor mode is active
 */
export async function isVisitorMode(forceRefresh = false): Promise<boolean> {
  const now = Date.now();
  const cacheExpiryMs = 1000; // Cache expires after 1 second (reduced from 5 seconds)

  // Use cached value if available and not expired, unless forceRefresh is true
  if (
    !forceRefresh &&
    visitorModeCache.value !== null &&
    now - visitorModeCache.timestamp < cacheExpiryMs
  ) {
    return visitorModeCache.value;
  }

  try {
    const mode = await getPreference('is_visitor_mode');
    const isVisitor = mode === 'true';

    // Update cache
    visitorModeCache = {
      value: isVisitor,
      timestamp: now,
    };

    return isVisitor;
  } catch (error) {
    console.error('Error checking visitor mode:', error);
    return false;
  }
}
