/**
 * Database schema definitions and table creation logic
 *
 * This module contains all SQL table definitions for the BeerSelector app.
 * Tables are created using expo-sqlite 15.1.4 async API.
 */

import { SQLiteDatabase } from 'expo-sqlite';
import { Preference } from '../types/database';

/**
 * SQL statement to create the allbeers table
 * Stores the complete beer catalog from the Flying Saucer API
 */
export const CREATE_ALLBEERS_TABLE = `
  CREATE TABLE IF NOT EXISTS allbeers (
    id TEXT PRIMARY KEY,
    added_date TEXT,
    brew_name TEXT,
    brewer TEXT,
    brewer_loc TEXT,
    brew_style TEXT,
    brew_container TEXT,
    review_count TEXT,
    review_rating TEXT,
    brew_description TEXT
  )
`;

/**
 * SQL statement to create the tasted_brew_current_round table
 * Stores the user's tasted beers for the current UFO Club plate
 */
export const CREATE_TASTED_BREW_TABLE = `
  CREATE TABLE IF NOT EXISTS tasted_brew_current_round (
    id TEXT PRIMARY KEY,
    roh_lap TEXT,
    tasted_date TEXT,
    brew_name TEXT,
    brewer TEXT,
    brewer_loc TEXT,
    brew_style TEXT,
    brew_container TEXT,
    review_count TEXT,
    review_ratings TEXT,
    brew_description TEXT,
    chit_code TEXT
  )
`;

/**
 * SQL statement to create the rewards table
 * Stores UFO Club rewards and achievements
 */
export const CREATE_REWARDS_TABLE = `
  CREATE TABLE IF NOT EXISTS rewards (
    reward_id TEXT PRIMARY KEY,
    redeemed TEXT,
    reward_type TEXT
  )
`;

/**
 * SQL statement to create the preferences table
 * Stores app configuration including API URLs and user settings
 */
export const CREATE_PREFERENCES_TABLE = `
  CREATE TABLE IF NOT EXISTS preferences (
    key TEXT PRIMARY KEY,
    value TEXT,
    description TEXT
  )
`;

/**
 * SQL statement to create the untappd table
 * Stores Untappd authentication tokens and cookies
 */
export const CREATE_UNTAPPD_TABLE = `
  CREATE TABLE IF NOT EXISTS untappd (
    key TEXT PRIMARY KEY,
    value TEXT,
    description TEXT
  )
`;

/**
 * Default preferences to initialize on first app launch
 */
export const DEFAULT_PREFERENCES: Preference[] = [
  {
    key: 'all_beers_api_url',
    value: '',
    description: 'API endpoint for fetching all beers'
  },
  {
    key: 'my_beers_api_url',
    value: '',
    description: 'API endpoint for fetching Beerfinder beers'
  },
  {
    key: 'first_launch',
    value: 'true',
    description: 'Flag indicating if this is the first app launch'
  }
];

/**
 * Creates all database tables and initializes default preferences
 *
 * This function should be called during app initialization to ensure
 * all required tables exist before any data operations.
 *
 * @param database - The SQLite database instance
 * @throws Error if table creation fails
 *
 * @example
 * ```typescript
 * import { getDatabase } from './connection';
 * import { setupTables } from './schema';
 *
 * const db = await getDatabase();
 * await setupTables(db);
 * ```
 */
export const setupTables = async (database: SQLiteDatabase): Promise<void> => {
  try {
    // Use a transaction for creating all tables
    await database.withTransactionAsync(async () => {
      // Create all tables
      await database.execAsync(CREATE_ALLBEERS_TABLE);
      await database.execAsync(CREATE_TASTED_BREW_TABLE);
      await database.execAsync(CREATE_REWARDS_TABLE);
      await database.execAsync(CREATE_PREFERENCES_TABLE);
      await database.execAsync(CREATE_UNTAPPD_TABLE);
    });

    // Initialize preferences with default values if table is empty
    await initializeDefaultPreferences(database);

    console.log('Database tables created successfully');
  } catch (error) {
    console.error('Error creating database tables:', error);
    throw error;
  }
};

/**
 * Initializes default preferences if the preferences table is empty
 *
 * This ensures that critical preferences like API URLs and first_launch
 * flag are present on fresh installations.
 *
 * @param database - The SQLite database instance
 * @throws Error if preference initialization fails
 */
const initializeDefaultPreferences = async (database: SQLiteDatabase): Promise<void> => {
  try {
    // Check if preferences already exist
    const count = await database.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM preferences');

    // Only add default preferences if the table is empty
    if (!count || count.count === 0) {
      // Use a transaction for inserting all preferences
      await database.withTransactionAsync(async () => {
        // Insert default preferences
        for (const pref of DEFAULT_PREFERENCES) {
          await database.runAsync(
            'INSERT OR IGNORE INTO preferences (key, value, description) VALUES (?, ?, ?)',
            [pref.key, pref.value, pref.description]
          );
        }
      });

      console.log('Default preferences initialized');
    }
  } catch (error) {
    console.error('Error initializing default preferences:', error);
    throw error;
  }
};
