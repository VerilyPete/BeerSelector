import { deletePreference, getPreference } from '../database/db';
import { saveAuthCookies } from '../api/sessionManager';

// Key used by older app versions, which stored captured login cookies as a
// plaintext row in the preferences table.
export const AUTH_COOKIES_PREF_KEY = 'auth_cookies';

/**
 * Moves auth cookies captured by older app versions out of plaintext SQLite
 * preferences into SecureStore. Safe to call repeatedly — returns true only
 * when a migration actually happened.
 */
export const migrateAuthCookiesToSecureStore = async (): Promise<boolean> => {
  try {
    const stored = await getPreference(AUTH_COOKIES_PREF_KEY);
    if (!stored) {
      return false;
    }

    await saveAuthCookies(stored);
    await deletePreference(AUTH_COOKIES_PREF_KEY);
    console.log('Migrated auth cookies from preferences to SecureStore');
    return true;
  } catch (error) {
    console.error('Failed to migrate auth cookies to SecureStore:', error);
    return false;
  }
};
