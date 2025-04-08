import * as SecureStore from 'expo-secure-store';

export interface SessionData {
  storeId: string;
  storeName: string;
  memberId: string;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  cardNum: string;
  sessionId: string;
}

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
    return JSON.parse(sessionDataStr);
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
  
  const cookieList = setCookieHeader.split(';');
  const mainCookie = cookieList[0];
  
  if (mainCookie) {
    const [name, value] = mainCookie.split('=');
    if (name && value) {
      cookies[name.trim()] = value.trim();
    }
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
  
  // Extract PHPSESSID
  if (cookies.PHPSESSID) {
    sessionData.sessionId = cookies.PHPSESSID;
  }
  
  // Extract other cookie values if they exist
  if (cookies.store__id) sessionData.storeId = cookies.store__id;
  if (cookies.store_name) sessionData.storeName = decodeURIComponent(cookies.store_name);
  if (cookies.member_id) sessionData.memberId = cookies.member_id;
  if (cookies.username) sessionData.username = decodeURIComponent(cookies.username);
  if (cookies.first_name) sessionData.firstName = decodeURIComponent(cookies.first_name);
  if (cookies.last_name) sessionData.lastName = decodeURIComponent(cookies.last_name);
  if (cookies.email) sessionData.email = decodeURIComponent(cookies.email);
  if (cookies.cardNum) sessionData.cardNum = cookies.cardNum;
  
  return sessionData;
}; 