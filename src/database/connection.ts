/**
 * Database connection management for the BeerSelector app
 * Provides a single database instance to avoid circular dependencies
 */

import * as SQLite from 'expo-sqlite';
import { databaseLockManager } from './DatabaseLockManager';

// Database connection instance
let db: SQLite.SQLiteDatabase | null = null;

/**
 * Initialize and return the database connection
 * Enables WAL mode and sets PRAGMA synchronous to NORMAL for optimal performance
 * @returns Promise resolving to the SQLite database instance
 */
export const getDatabase = async (): Promise<SQLite.SQLiteDatabase> => {
  if (db) return db;

  try {
    db = await SQLite.openDatabaseAsync('beers.db');

    // Enable WAL (Write-Ahead Logging) mode for better concurrency
    const walResult = await db.getFirstAsync<{ journal_mode: string }>(
      'PRAGMA journal_mode = WAL'
    );
    console.log(`Database journal mode: ${walResult?.journal_mode ?? 'unknown'}`);

    if (walResult?.journal_mode?.toLowerCase() !== 'wal') {
      console.warn(`Failed to enable WAL mode, using ${walResult?.journal_mode ?? 'unknown'} instead`);
    }

    // Set synchronous mode to NORMAL for optimal performance
    await db.execAsync('PRAGMA synchronous = NORMAL');

    console.log('Database opened successfully with optimized settings');

    // Reset shutdown state when database reopens (fixes CI-HP6-1)
    databaseLockManager.resetShutdownState();

    return db;
  } catch (error) {
    db = null;
    console.error('Failed to open database:', error);
    throw error;
  }
};

/**
 * Close the database connection gracefully
 *
 * @param forceClose - If true, closes immediately without waiting for pending operations
 * @returns Promise that resolves when the database is closed
 * @throws Error if close operation fails
 */
export const closeDatabaseConnection = async (forceClose: boolean = false): Promise<void> => {
  if (!db) {
    console.log('Database connection is already closed or was never opened');
    return;
  }

  try {
    if (forceClose) {
      console.warn('Force closing database connection without waiting for operations to complete');
    } else {
      // Wait for pending operations to complete (5 second timeout)
      const shutdownSuccess = await databaseLockManager.prepareForShutdown(5000);
      if (!shutdownSuccess) {
        console.warn('Graceful shutdown timeout - forcing database close');
      }
    }

    console.log('Closing database connection...');
    await db.closeAsync();
    db = null;
    console.log('Database connection closed successfully');
  } catch (error) {
    console.error('Failed to close database:', error);
    // Nullify the reference even if close fails to allow reconnection
    db = null;
    throw error;
  }
};

/**
 * Reset the database connection reference without closing (TESTING ONLY)
 *
 * WARNING: This function does NOT call closeAsync() and should ONLY be used
 * in test cleanup. Using this in production code will leak file handles.
 *
 * For production use, call closeDatabaseConnection() instead.
 *
 * @internal
 */
export const resetDatabaseConnection = (): void => {
  db = null;
};
