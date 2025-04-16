import { saveSessionData, clearSessionData } from './sessionManager';
import { getApiClient } from './apiClientInstance';
import { getPreference } from '../database/db';
import { SessionData, ApiError, ApiResponse, LoginResult, isSessionData } from '../types/api';

// Using LoginResult interface from ../types/api

/**
 * Attempts to automatically login using stored cookies
 * @returns The result of the login process
 */
export async function autoLogin(): Promise<LoginResult> {
  try {
    const apiClient = getApiClient();
    const response = await apiClient.post<{ session: SessionData }>('/auto-login.php', {});

    if (response.success && response.data && response.data.session) {
      // Save the session data
      await saveSessionData(response.data.session);

      return {
        success: true,
        message: 'Auto-login successful',
        data: response.data,
        sessionData: response.data.session,
        statusCode: response.statusCode
      };
    } else {
      return {
        success: false,
        error: response.error || 'Auto-login failed',
        statusCode: response.statusCode || 401
      };
    }
  } catch (error) {
    console.error('Error during auto-login:', error);

    if (error instanceof ApiError) {
      return {
        success: false,
        error: error.message,
        statusCode: error.statusCode
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      statusCode: 500
    };
  }
}

/**
 * Handles the login process to Flying Saucer
 * @param cookies The cookies received from the login process
 * @param headers The headers received from the login process
 * @returns The result of the login process
 */
export const handleTapThatAppLogin = async (
  cookies: string | Record<string, string>,
  headers?: Headers
): Promise<LoginResult> => {
  try {
    // Parse cookies if they're in string format
    const parsedCookies = typeof cookies === 'string'
      ? parseCookiesString(cookies)
      : cookies;

    // Extract relevant session data with safe decoding
    const sessionData: Partial<SessionData> = {
      sessionId: parsedCookies.PHPSESSID || '',
      storeId: parsedCookies.store__id || parsedCookies.store || '',
      memberId: parsedCookies.member_id || ''
    };

    // Safely decode URI components with error handling
    try {
      if (parsedCookies.store_name) {
        sessionData.storeName = decodeURIComponent(parsedCookies.store_name);
      }
    } catch (e) {
      sessionData.storeName = parsedCookies.store_name || '';
      console.warn('Failed to decode store_name cookie:', e);
    }

    try {
      if (parsedCookies.username) {
        sessionData.username = decodeURIComponent(parsedCookies.username);
      }
    } catch (e) {
      sessionData.username = parsedCookies.username || '';
      console.warn('Failed to decode username cookie:', e);
    }

    try {
      if (parsedCookies.first_name) {
        sessionData.firstName = decodeURIComponent(parsedCookies.first_name);
      }
    } catch (e) {
      sessionData.firstName = parsedCookies.first_name || '';
      console.warn('Failed to decode first_name cookie:', e);
    }

    try {
      if (parsedCookies.last_name) {
        sessionData.lastName = decodeURIComponent(parsedCookies.last_name);
      }
    } catch (e) {
      sessionData.lastName = parsedCookies.last_name || '';
      console.warn('Failed to decode last_name cookie:', e);
    }

    try {
      if (parsedCookies.email) {
        sessionData.email = decodeURIComponent(parsedCookies.email);
      }
    } catch (e) {
      sessionData.email = parsedCookies.email || '';
      console.warn('Failed to decode email cookie:', e);
    }

    if (parsedCookies.cardNum) {
      sessionData.cardNum = parsedCookies.cardNum;
    }

    // Validate that we have the minimum required data
    if (!sessionData.sessionId || !sessionData.memberId || !sessionData.storeId) {
      return {
        success: false,
        error: 'Missing required login data',
        statusCode: 401
      };
    }

    // Save the session data
    await saveSessionData(sessionData as SessionData);

    return {
      success: true,
      message: 'Login successful',
      sessionData: sessionData as SessionData,
      statusCode: 200
    };
  } catch (error) {
    console.error('Error handling login:', error);

    if (error instanceof ApiError) {
      return {
        success: false,
        error: error.message,
        statusCode: error.statusCode
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during login',
      statusCode: 500
    };
  }
};

/**
 * Logs out the user by clearing the session data
 * @returns A login result indicating success or failure
 */
export async function logout(): Promise<LoginResult> {
  try {
    const apiClient = getApiClient();
    const response = await apiClient.post('/logout.php', {});
    await clearSessionData();

    return {
      success: true,
      message: 'Logout successful',
      statusCode: 200
    };
  } catch (error) {
    console.error('Error during logout:', error);

    if (error instanceof ApiError) {
      return {
        success: false,
        error: error.message,
        statusCode: error.statusCode
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during logout',
      statusCode: 500
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
        statusCode: 400
      };
    }

    const apiClient = getApiClient();
    const response = await apiClient.post<{ session: SessionData }>('/login.php', {
      username,
      password
    });

    if (response.success && response.data && response.data.session) {
      // Save the session data
      await saveSessionData(response.data.session);

      return {
        success: true,
        message: 'Login successful',
        data: response.data,
        sessionData: response.data.session,
        statusCode: response.statusCode
      };
    } else {
      return {
        success: false,
        error: response.error || 'Login failed',
        statusCode: response.statusCode || 401
      };
    }
  } catch (error) {
    console.error('Error during login:', error);

    if (error instanceof ApiError) {
      return {
        success: false,
        error: error.message,
        statusCode: error.statusCode
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      statusCode: 500
    };
  }
}