/**
 * Database Orchestration
 *
 * This file contains database setup and one-time cleanup functions.
 *
 * For data access operations, use repositories directly:
 * - beerRepository (src/database/repositories/BeerRepository.ts)
 * - myBeersRepository (src/database/repositories/MyBeersRepository.ts)
 * - rewardsRepository (src/database/repositories/RewardsRepository.ts)
 * - preferences module (src/database/preferences.ts)
 */

import * as SQLite from 'expo-sqlite';
import { getDatabase } from './connection';
import { getPreference, setPreference } from './preferences';
import { setupTables } from './schema';
import { databaseInitializer } from './initializationState';

// ============================================================================
// DATABASE INITIALIZATION CONFIGURATION
// ============================================================================

/**
 * Maximum time to wait for database schema setup to complete.
 * Set to 30 seconds to account for slow devices or complex migrations.
 * If setup exceeds this timeout, the app will fail to initialize properly.
 */
const DATABASE_INITIALIZATION_TIMEOUT_MS = 30000;

// ============================================================================
// DATABASE INITIALIZATION
// ============================================================================

/**
 * Initialize database connection
 * @returns Database instance
 */
export const initDatabase = async (): Promise<SQLite.SQLiteDatabase> => {
  return await getDatabase();
};

/**
 * Create tables if they don't exist
 * Handles state management to prevent duplicate initialization
 */
export const setupDatabase = async (): Promise<void> => {
  // If already ready, return immediately
  if (databaseInitializer.isReady()) {
    console.log('Database already ready');
    return;
  }

  // If in ERROR state, throw the error immediately
  if (databaseInitializer.isError()) {
    throw new Error(`Database setup failed: ${databaseInitializer.getErrorMessage()}`);
  }

  // If initialization is in progress, wait for it to complete using event-based waiting
  if (databaseInitializer.isInitializing()) {
    console.log('Database setup already in progress, waiting...');
    try {
      await databaseInitializer.waitUntilReady(DATABASE_INITIALIZATION_TIMEOUT_MS);
      console.log('Database setup completed while waiting');
      return;
    } catch (error) {
      if (databaseInitializer.isError()) {
        throw new Error(`Database setup failed: ${databaseInitializer.getErrorMessage()}`);
      }
      throw error;
    }
  }

  // Transition to INITIALIZING state
  try {
    databaseInitializer.setInitializing();
  } catch (error) {
    // If we can't transition to INITIALIZING (e.g., already READY), return
    console.log('Cannot transition to INITIALIZING, database may already be ready');
    return;
  }

  try {
    const database = await initDatabase();

    // Use the setupTables function from schema module
    await setupTables(database);

    // Transition to READY state
    databaseInitializer.setReady();
    console.log('Database setup complete');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    databaseInitializer.setError(errorMessage);
    console.error('Error setting up database:', error);
    throw error;
  }
};

/**
 * One-time cleanup of bad ABV values from regex extraction.
 * Nulls out ABV > 30% where enrichment_source is NULL or 'description'.
 * Legitimate high-ABV products (e.g., Underberg at 44%) have
 * enrichment_source = 'perplexity' and are untouched.
 *
 * Guarded by preference 'abv_cleanup_v1_done' to run only once.
 */
export async function cleanupBadAbvData(): Promise<void> {
  const alreadyDone = await getPreference('abv_cleanup_v1_done');
  if (alreadyDone === 'true') return;

  const database = await getDatabase();

  const result1 = await database.runAsync(
    `UPDATE allbeers SET abv = NULL, enrichment_source = NULL, enrichment_confidence = NULL
     WHERE abv > 30
       AND (enrichment_source IS NULL OR enrichment_source = 'description')`
  );

  const result2 = await database.runAsync(
    `UPDATE tasted_brew_current_round SET abv = NULL, enrichment_source = NULL, enrichment_confidence = NULL
     WHERE abv > 30
       AND (enrichment_source IS NULL OR enrichment_source = 'description')`
  );

  console.log(
    `[cleanupBadAbvData] Cleaned ${result1.changes} allbeers rows, ${result2.changes} tasted_brew rows`
  );

  await setPreference('abv_cleanup_v1_done', 'true', 'One-time ABV cleanup completed');
}

/**
 * Reset database initialization state
 * Used for manual refresh or testing scenarios
 */
export const resetDatabaseState = (): void => {
  databaseInitializer.reset();
  console.log('Database state reset');
};
