/**
 * Database schema definitions and table creation logic
 *
 * This module contains all SQL table definitions for the BeerSelector app.
 * Tables are created using expo-sqlite 15.1.4 async API.
 */

import { SQLiteDatabase } from 'expo-sqlite';
import { Preference } from '../types/database';
import {
  CURRENT_SCHEMA_VERSION,
  CREATE_SCHEMA_VERSION_TABLE,
  getCurrentSchemaVersion,
  recordMigration,
} from './schemaVersion';

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
    brew_description TEXT,
    glass_type TEXT
  )
`;

/**
 * Alias for compatibility with existing code
 */
export const CREATE_ALL_BEERS_TABLE = CREATE_ALLBEERS_TABLE;

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
    chit_code TEXT,
    glass_type TEXT
  )
`;

/**
 * Alias for compatibility with existing code
 */
export const CREATE_MY_BEERS_TABLE = CREATE_TASTED_BREW_TABLE;

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
 * Alias for compatibility with existing code
 */
export const CREATE_UNTAPPD_COOKIES_TABLE = CREATE_UNTAPPD_TABLE;

/**
 * SQL statement to create the operation_queue table
 * Stores queued operations for retry when network connection is restored
 */
export const CREATE_OPERATION_QUEUE_TABLE = `
  CREATE TABLE IF NOT EXISTS operation_queue (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    payload TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    retry_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    error_message TEXT,
    last_retry_timestamp INTEGER
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
    console.log('Initializing database schema...');

    // Create schema_version table first
    await database.execAsync(CREATE_SCHEMA_VERSION_TABLE);

    // Check current version
    const currentVersion = await getCurrentSchemaVersion(database);
    console.log(`Current schema version: ${currentVersion}`);

    if (currentVersion === 0) {
      // First-time setup - create all tables
      await database.withTransactionAsync(async () => {
        // Create all tables
        await database.execAsync(CREATE_ALLBEERS_TABLE);
        await database.execAsync(CREATE_TASTED_BREW_TABLE);
        await database.execAsync(CREATE_REWARDS_TABLE);
        await database.execAsync(CREATE_PREFERENCES_TABLE);
        await database.execAsync(CREATE_UNTAPPD_TABLE);
        await database.execAsync(CREATE_OPERATION_QUEUE_TABLE);

        // Create indexes for operation_queue table
        // These indexes improve query performance for getPendingOperations() and other status/timestamp-based queries
        await database.execAsync(`
          CREATE INDEX IF NOT EXISTS idx_operation_queue_status
          ON operation_queue(status);
        `);

        await database.execAsync(`
          CREATE INDEX IF NOT EXISTS idx_operation_queue_timestamp
          ON operation_queue(timestamp);
        `);

        console.log('[Database] Created operation_queue indexes');

        // Record initial schema version (2 for current state before glass_type)
        await recordMigration(database, 2);
        console.log('Initial schema created at version 2');
      });

      // Initialize preferences with default values
      await initializeDefaultPreferences(database);
    }

    // Run migrations if needed
    if (currentVersion < CURRENT_SCHEMA_VERSION) {
      await runMigrations(database, currentVersion);
    }

    console.log('Database tables created successfully');
  } catch (error) {
    console.error('Error creating database tables:', error);
    throw error;
  }
};

/**
 * Run all necessary migrations from current version to target version
 *
 * Note: This function should NOT show progress UI. The migration progress
 * UI is handled in app/_layout.tsx during app startup.
 *
 * @param database - The SQLite database instance
 * @param fromVersion - Current schema version
 */
async function runMigrations(database: SQLiteDatabase, fromVersion: number): Promise<void> {
  console.log(`Running migrations from version ${fromVersion} to ${CURRENT_SCHEMA_VERSION}...`);

  // Note: Import is dynamic to avoid circular dependencies during initialization
  // The migration will be called from app/_layout.tsx with progress UI
  // This function is kept minimal for cases where migration is called from setupTables

  // Future migrations go here
  // if (fromVersion < 4) { await migrateToVersion4(database); }
}

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
