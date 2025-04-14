import { ApiClient } from './apiClient';
import { saveSessionData, clearSessionData, SessionData } from './sessionManager';
import { getPreference } from '../database/db';

const apiClient = ApiClient.getInstance();

interface LoginResult {
  success: boolean;
  error?: string;
  data?: any;
  sessionData?: SessionData;
}

/**
 * Attempts to automatically login using stored cookies
 * @returns The result of the login process
 */
export async function autoLogin(): Promise<LoginResult> {
  try {
    const response = await apiClient.post('/auto-login.php', {});
    const data = await response.json();
    
    if (data.success) {
      await saveSessionData(data.session);
      return {
        success: true,
        data
      };
    } else {
      return {
        success: false,
        error: data.error || 'Auto-login failed'
      };
    }
  } catch (error) {
    console.error('Error during auto-login:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
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
    
    // Extract relevant session data
    const sessionData: SessionData = {
      sessionId: parsedCookies.PHPSESSID || '',
      storeId: parsedCookies.store__id || parsedCookies.store || '',
      storeName: parsedCookies.store_name ? decodeURIComponent(parsedCookies.store_name) : '',
      memberId: parsedCookies.member_id || '',
      username: parsedCookies.username ? decodeURIComponent(parsedCookies.username) : '',
      firstName: parsedCookies.first_name ? decodeURIComponent(parsedCookies.first_name) : '',
      lastName: parsedCookies.last_name ? decodeURIComponent(parsedCookies.last_name) : '',
      email: parsedCookies.email ? decodeURIComponent(parsedCookies.email) : '',
      cardNum: parsedCookies.cardNum || '',
    };

    // Validate that we have the minimum required data
    if (!sessionData.sessionId || !sessionData.memberId || !sessionData.storeId) {
      return {
        success: false,
        error: 'Missing required login data',
      };
    }

    // Save the session data
    await saveSessionData(sessionData);

    return {
      success: true,
      sessionData,
    };
  } catch (error: any) {
    console.error('Error handling login:', error);
    return {
      success: false,
      error: error.message || 'Unknown error during login',
    };
  }
};

/**
 * Logs out the user by clearing the session data
 * @returns True if logout was successful, false otherwise
 */
export async function logout(): Promise<boolean> {
  try {
    await apiClient.post('/logout.php', {});
    await clearSessionData();
    return true;
  } catch (error) {
    console.error('Error during logout:', error);
    return false;
  }
}

/**
 * Parses cookies from a cookie string
 * @param cookiesString The cookie string to parse
 * @returns An object with cookie name-value pairs
 */
const parseCookiesString = (cookiesString: string): Record<string, string> => {
  const cookies: Record<string, string> = {};
  
  // Split the cookies string by semicolons and process each cookie
  const cookieParts = cookiesString.split(';');
  
  cookieParts.forEach(cookiePart => {
    const [name, value] = cookiePart.trim().split('=');
    if (name && value) {
      cookies[name.trim()] = value.trim();
    }
  });
  
  return cookies;
}; 