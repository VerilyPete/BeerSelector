/**
 * Preference management functions for the BeerSelector app
 * Handles reading and writing preferences to the SQLite database
 */

import { Preference } from './types';
import { getDatabase } from './connection';

/**
 * Get a preference value by key
 * @param key The preference key to retrieve
 * @returns The preference value, or null if not found or on error
 */
export const getPreference = async (key: string): Promise<string | null> => {
  const database = await getDatabase();

  try {
    const result = await database.getFirstAsync<{ value: string }>(
      'SELECT value FROM preferences WHERE key = ?',
      [key]
    );

    return result ? result.value : null;
  } catch (error) {
    console.error(`Error getting preference ${key}:`, error);
    return null;
  }
};

/**
 * Set a preference value
 * @param key The preference key
 * @param value The preference value
 * @param description Optional description for the preference
 * @throws Error if the database operation fails
 */
export const setPreference = async (key: string, value: string, description?: string): Promise<void> => {
  const database = await getDatabase();

  try {
    // If description is provided, update it; otherwise just update the value
    if (description) {
      await database.runAsync(
        'INSERT OR REPLACE INTO preferences (key, value, description) VALUES (?, ?, ?)',
        [key, value, description]
      );
    } else {
      // Get the existing description if available
      const existing = await database.getFirstAsync<{ description: string }>(
        'SELECT description FROM preferences WHERE key = ?',
        [key]
      );

      await database.runAsync(
        'INSERT OR REPLACE INTO preferences (key, value, description) VALUES (?, ?, ?)',
        [key, value, existing?.description || '']
      );
    }
  } catch (error) {
    console.error(`Error setting preference ${key}:`, error);
    throw error;
  }
};

/**
 * Get all preferences from the database
 * @returns Array of all preferences, ordered by key. Returns empty array on error.
 */
export const getAllPreferences = async (): Promise<Preference[]> => {
  const database = await getDatabase();

  try {
    const preferences = await database.getAllAsync<{ key: string, value: string, description: string }>(
      'SELECT key, value, description FROM preferences ORDER BY key'
    );

    return preferences || [];
  } catch (error) {
    console.error('Error getting all preferences:', error);
    return [];
  }
};

/**
 * Check if API URLs are configured based on the current mode
 *
 * In visitor mode: Only requires all_beers_api_url
 * In normal mode: Requires both all_beers_api_url and my_beers_api_url
 *
 * @returns True if required API URLs are configured, false otherwise
 */
export const areApiUrlsConfigured = async (): Promise<boolean> => {
  try {
    // Check if we're in visitor mode
    const isVisitor = await getPreference('is_visitor_mode') === 'true';

    // Get API URLs
    const allBeersApiUrl = await getPreference('all_beers_api_url');
    const myBeersApiUrl = await getPreference('my_beers_api_url');

    // In visitor mode, we only need the all_beers_api_url to be set
    if (isVisitor) {
      return !!allBeersApiUrl; // Just need the all beers URL
    }

    // For normal mode, both URLs must be set
    return !!allBeersApiUrl && !!myBeersApiUrl;
  } catch (error) {
    console.error('Error checking API URLs:', error);
    return false;
  }
};
