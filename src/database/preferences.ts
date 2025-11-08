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
