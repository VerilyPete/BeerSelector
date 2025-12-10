/**
 * Database Orchestration
 *
 * This file contains database initialization and orchestration (initializeBeerDatabase).
 *
 * For data access operations, use repositories directly:
 * - beerRepository (src/database/repositories/BeerRepository.ts)
 * - myBeersRepository (src/database/repositories/MyBeersRepository.ts)
 * - rewardsRepository (src/database/repositories/RewardsRepository.ts)
 * - preferences module (src/database/preferences.ts)
 */

import * as SQLite from 'expo-sqlite';
import { getDatabase } from './connection';
import { getPreference, areApiUrlsConfigured } from './preferences';
import { setupTables } from './schema';
import { databaseInitializer } from './initializationState';
import { fetchBeersFromAPI, fetchMyBeersFromAPI, fetchRewardsFromAPI } from '../api/beerApi';
import { beerRepository } from './repositories/BeerRepository';
import { myBeersRepository } from './repositories/MyBeersRepository';
import { rewardsRepository } from './repositories/RewardsRepository';
import { calculateContainerTypes } from './utils/glassTypeCalculator';

// ============================================================================
// DATABASE INITIALIZATION CONFIGURATION
// ============================================================================

/**
 * Maximum time to wait for database schema setup to complete.
 * Set to 30 seconds to account for slow devices or complex migrations.
 * If setup exceeds this timeout, the app will fail to initialize properly.
 */
const DATABASE_INITIALIZATION_TIMEOUT_MS = 30000;

/**
 * Delay before starting background import of user's tasted beers.
 * Set to 100ms to allow the critical all-beers fetch to complete first,
 * ensuring UI is responsive before background operations begin.
 */
const MY_BEERS_IMPORT_DELAY_MS = 100;

/**
 * Delay before starting background import of user rewards.
 * Set to 200ms (after My Beers) to stagger background operations
 * and prevent concurrent API calls from overwhelming the server or network.
 */
const REWARDS_IMPORT_DELAY_MS = 200;

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
 * Initialize the beer database on app startup
 * Orchestrates the complete database setup and initial data loading
 *
 * Flow:
 * 1. Setup database schema (tables, indexes)
 * 2. Check if API URLs are configured
 * 3. Fetch and populate all beers (blocking - needed immediately)
 * 4. Schedule My Beers import (non-blocking, skipped in visitor mode)
 * 5. Schedule Rewards import (non-blocking, skipped in visitor mode)
 */
export const initializeBeerDatabase = async (): Promise<void> => {
  console.log('Initializing beer database...');

  try {
    // First, make sure the database schema is set up
    await setupDatabase();

    // Check if API URLs are configured
    const apiUrlsConfigured = await areApiUrlsConfigured();
    if (!apiUrlsConfigured) {
      console.log('API URLs not configured, database initialization will be limited');
      return;
    }

    // Check for visitor mode to handle differently
    const isVisitorMode = (await getPreference('is_visitor_mode')) === 'true';

    // Schedule My Beers import in background (non-blocking)
    if (!isVisitorMode) {
      setTimeout(async () => {
        try {
          const myBeers = await fetchMyBeersFromAPI();
          const myBeersWithContainerTypes = calculateContainerTypes(myBeers);
          await myBeersRepository.insertMany(myBeersWithContainerTypes);
        } catch (error) {
          console.error('Error in scheduled My Beers import:', error);
        }
      }, MY_BEERS_IMPORT_DELAY_MS);
    } else {
      console.log('In visitor mode - skipping scheduled My Beers import');
    }

    // Schedule rewards import (non-blocking)
    if (!isVisitorMode) {
      setTimeout(async () => {
        try {
          const rewards = await fetchRewardsFromAPI();
          await rewardsRepository.insertMany(rewards);
        } catch (error) {
          console.error('Error in scheduled Rewards import:', error);
        }
      }, REWARDS_IMPORT_DELAY_MS);
    } else {
      console.log('In visitor mode - skipping scheduled Rewards import');
    }

    // Fetch all beers (blocking - we need this immediately for the UI)
    try {
      const beers = await fetchBeersFromAPI();
      // Calculate container types before insertion
      const beersWithContainerTypes = calculateContainerTypes(beers);
      await beerRepository.insertMany(beersWithContainerTypes);
    } catch (error) {
      console.error('Error fetching and populating all beers:', error);
    }

    console.log('Beer database initialization completed');
  } catch (error) {
    console.error('Error initializing beer database:', error);
    throw error;
  }
};

/**
 * Reset database initialization state
 * Used for manual refresh or testing scenarios
 */
export const resetDatabaseState = (): void => {
  databaseInitializer.reset();
  console.log('Database state reset');
};
