/**
 * Database connection management for the BeerSelector app
 * Provides a single database instance to avoid circular dependencies
 */

import * as SQLite from 'expo-sqlite';

// Database connection instance
let db: SQLite.SQLiteDatabase | null = null;

/**
 * Initialize and return the database connection
 * @returns Promise resolving to the SQLite database instance
 */
export const getDatabase = async (): Promise<SQLite.SQLiteDatabase> => {
  if (db) return db;

  try {
    db = await SQLite.openDatabaseAsync('beers.db');
    return db;
  } catch (error) {
    console.error('Failed to open database:', error);
    throw error;
  }
};

/**
 * Reset the database connection (primarily for testing)
 */
export const resetDatabaseConnection = (): void => {
  db = null;
};
