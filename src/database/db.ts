/**
 * Database Compatibility Layer
 *
 * This file provides backwards-compatible exports that delegate to the new repository pattern.
 * Extracted as part of HP-1 refactoring to reduce monolithic db.ts from 918 lines to ~300 lines.
 *
 * Architecture:
 * - All database operations delegated to repositories (BeerRepository, MyBeersRepository, RewardsRepository)
 * - No duplicate INSERT/UPDATE/DELETE logic (DRY principle)
 * - Thin wrapper for backwards compatibility with existing imports
 */

import * as SQLite from 'expo-sqlite';
import { Beer, Beerfinder } from './types';
import { Reward, UntappdCookie } from './types';
import { getDatabase } from './connection';
import { getPreference, setPreference, getAllPreferences, areApiUrlsConfigured as _areApiUrlsConfigured } from './preferences';
import { setupTables } from './schema';
import { databaseLockManager } from './locks';
import {
  fetchBeersFromAPI as _fetchBeersFromAPI,
  fetchMyBeersFromAPI as _fetchMyBeersFromAPI,
  fetchRewardsFromAPI as _fetchRewardsFromAPI,
} from '../api/beerApi';
import { beerRepository } from './repositories/BeerRepository';
import { myBeersRepository } from './repositories/MyBeersRepository';
import { rewardsRepository } from './repositories/RewardsRepository';

// Track if database has been initialized
let databaseInitialized = false;

// Track if database setup has been completed
let databaseSetupComplete = false;

// Track if setupDatabase is in progress
let setupDatabaseInProgress = false;

// Initialize database (wrapper for backwards compatibility)
export const initDatabase = async (): Promise<SQLite.SQLiteDatabase> => {
  return await getDatabase();
};

// Create tables if they don't exist
export const setupDatabase = async (): Promise<void> => {
  // Prevent multiple simultaneous calls
  if (setupDatabaseInProgress) {
    console.log('Database setup already in progress, waiting...');
    // Wait for the setup to complete
    let attempts = 0;
    while (setupDatabaseInProgress && attempts < 10) {
      await new Promise(resolve => setTimeout(resolve, 200));
      attempts++;
    }

    if (databaseSetupComplete) {
      console.log('Database setup completed while waiting');
      return;
    }

    if (setupDatabaseInProgress) {
      console.warn('Timed out waiting for database setup to complete');
    }
  }

  setupDatabaseInProgress = true;

  try {
    const database = await initDatabase();

    try {
      // Use the setupTables function from schema module
      await setupTables(database);

      console.log('Database setup complete');
      databaseSetupComplete = true;
    } catch (error) {
      console.error('Error setting up database:', error);
      throw error;
    }
  } finally {
    setupDatabaseInProgress = false;
  }
};

// Helper functions to get and set preferences
// These functions have been moved to src/database/preferences.ts
// Re-export them here for backwards compatibility
export { getPreference, setPreference, getAllPreferences } from './preferences';

// Helper functions for Untappd cookies
export const getUntappdCookie = async (key: string): Promise<string | null> => {
  const database = await initDatabase();

  try {
    const result = await database.getFirstAsync<{ value: string }>(
      'SELECT value FROM untappd WHERE key = ?',
      [key]
    );

    return result ? result.value : null;
  } catch (error) {
    console.error(`Error getting Untappd cookie ${key}:`, error);
    return null;
  }
};

export const setUntappdCookie = async (key: string, value: string, description?: string): Promise<void> => {
  const database = await initDatabase();

  try {
    // If description is provided, update it; otherwise just update the value
    if (description) {
      await database.runAsync(
        'INSERT OR REPLACE INTO untappd (key, value, description) VALUES (?, ?, ?)',
        [key, value, description]
      );
    } else {
      // Get the existing description if available
      const existing = await database.getFirstAsync<{ description: string }>(
        'SELECT description FROM untappd WHERE key = ?',
        [key]
      );

      await database.runAsync(
        'INSERT OR REPLACE INTO untappd (key, value, description) VALUES (?, ?, ?)',
        [key, value, existing?.description || '']
      );
    }
  } catch (error) {
    console.error(`Error setting Untappd cookie ${key}:`, error);
    throw error;
  }
};

export const getAllUntappdCookies = async (): Promise<UntappdCookie[]> => {
  const database = await initDatabase();

  try {
    const cookies = await database.getAllAsync<{ key: string, value: string, description: string }>(
      'SELECT key, value, description FROM untappd ORDER BY key'
    );

    return cookies || [];
  } catch (error) {
    console.error('Error getting all Untappd cookies:', error);
    return [];
  }
};

export const isUntappdLoggedIn = async (): Promise<boolean> => {
  const cookies = await getAllUntappdCookies();

  // First check for our custom detection flag which indicates we've detected login via UI elements
  const loginDetectedViaUI = cookies.some(cookie => cookie.key === 'login_detected_via_ui' && cookie.value === 'true');

  // Also check for our explicit login detection flag
  const loginDetectedByApp = cookies.some(cookie => cookie.key === 'untappd_logged_in_detected' && cookie.value === 'true');

  // Check if we have the necessary cookies for an active session
  // At minimum, we would need the untappd_session_t cookie, but we may not have access to it if it's HttpOnly
  const sessionCookiePresent = cookies.some(cookie =>
    (cookie.key === 'untappd_session_t' || cookie.key === 'ut_session') && cookie.value
  );

  // Consider logged in if we have either:
  // 1. Detected login via UI elements
  // 2. Explicitly detected login via navigation or page content
  // 3. Have a session cookie (which is rare since most are HttpOnly)
  return loginDetectedViaUI || loginDetectedByApp || sessionCookiePresent;
};

// Re-export API fetch functions from beerApi module for backwards compatibility
export const fetchBeersFromAPI = _fetchBeersFromAPI;

// Insert beers into database using transactions
// DELEGATES TO REPOSITORY - NO DUPLICATE INSERT LOGIC
export const populateBeersTable = async (beers: Beer[]): Promise<void> => {
  return await beerRepository.insertMany(beers);
};

// Initialize the database on app startup
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
    const isVisitorMode = await getPreference('is_visitor_mode') === 'true';

    // Schedule My Beers import in background (idempotent, uses lock manager)
    if (!isVisitorMode) {
      // Use setTimeout to make My Beers import non-blocking
      setTimeout(async () => {
        try {
          await fetchAndPopulateMyBeers();
        } catch (error) {
          console.error('Error in scheduled My Beers import:', error);
        }
      }, 100);
    } else {
      console.log('In visitor mode - skipping scheduled My Beers import');
    }

    // Schedule rewards import - only if not in visitor mode
    if (!isVisitorMode) {
      setTimeout(async () => {
        try {
          await fetchAndPopulateRewards();
        } catch (error) {
          console.error('Error in scheduled Rewards import:', error);
        }
      }, 200);
    } else {
      console.log('In visitor mode - skipping scheduled Rewards import');
    }

    // Fetch all beers (this is blocking because we need it immediately)
    try {
      const beers = await fetchBeersFromAPI();
      await populateBeersTable(beers);
    } catch (error) {
      console.error('Error fetching and populating all beers:', error);
    }

    console.log('Beer database initialization completed');
  } catch (error) {
    console.error('Error initializing beer database:', error);
    throw error;
  }
};

// Re-export My Beers API fetch function for backwards compatibility
export const fetchMyBeersFromAPI = _fetchMyBeersFromAPI;

// Insert Beerfinder beers into database using transactions
// DELEGATES TO REPOSITORY - NO DUPLICATE INSERT LOGIC
export const populateMyBeersTable = async (beers: Beerfinder[]): Promise<void> => {
  return await myBeersRepository.insertMany(beers);
};

// Fetch and populate My Beers
// NOTE: This function is idempotent - it can be called multiple times safely
// The lock manager ensures only one operation runs at a time
export const fetchAndPopulateMyBeers = async (): Promise<void> => {
  // Check for visitor mode first and exit early without acquiring lock
  const isVisitorMode = await getPreference('is_visitor_mode') === 'true';
  if (isVisitorMode) {
    console.log('In visitor mode - skipping fetchAndPopulateMyBeers');
    return;
  }

  // Acquire lock - if another call is in progress, this will queue
  if (!await databaseLockManager.acquireLock('fetchAndPopulateMyBeers')) {
    throw new Error('Failed to acquire database lock for fetching and populating My Beers');
  }

  try {
    const myBeers = await fetchMyBeersFromAPI();
    // Use UNSAFE method since we're already holding the lock
    await myBeersRepository.insertManyUnsafe(myBeers);
  } finally {
    databaseLockManager.releaseLock('fetchAndPopulateMyBeers');
  }
};

// Refresh beers from API
// DELEGATES TO REPOSITORY - NO DUPLICATE INSERT LOGIC
export const refreshBeersFromAPI = async (): Promise<Beer[]> => {
  if (!await databaseLockManager.acquireLock('refreshBeersFromAPI')) {
    throw new Error('Failed to acquire database lock for refreshing beers');
  }

  try {
    // Fetch fresh data from API
    const beers = await fetchBeersFromAPI();
    console.log(`Fetched ${beers.length} beers from API. Refreshing database...`);

    // Delegate to repository for insertion
    await beerRepository.insertMany(beers);

    console.log('Database refresh complete!');

    // Return the refreshed beers
    return await beerRepository.getAll();
  } catch (error) {
    console.error('Error refreshing beer database:', error);
    throw error;
  } finally {
    databaseLockManager.releaseLock('refreshBeersFromAPI');
  }
};

// Get all beers from the database
// DELEGATES TO REPOSITORY
export const getAllBeers = async (): Promise<Beer[]> => {
  return await beerRepository.getAll();
};

// Get beer by ID
// DELEGATES TO REPOSITORY
export const getBeerById = async (id: string): Promise<Beer | null> => {
  return await beerRepository.getById(id);
};

// Search beers by name, brewer, style, or description
// DELEGATES TO REPOSITORY
export const searchBeers = async (query: string): Promise<Beer[]> => {
  return await beerRepository.search(query);
};

// Get beers by style
// DELEGATES TO REPOSITORY
export const getBeersByStyle = async (style: string): Promise<Beer[]> => {
  return await beerRepository.getByStyle(style);
};

// Get beers by brewer
// DELEGATES TO REPOSITORY
export const getBeersByBrewer = async (brewer: string): Promise<Beer[]> => {
  return await beerRepository.getByBrewer(brewer);
};

// Get all tasted beers (Beerfinder beers)
// DELEGATES TO REPOSITORY
export const getMyBeers = async (): Promise<Beerfinder[]> => {
  return await myBeersRepository.getAll();
};

// Get all available beers that are not in My Beers
// DELEGATES TO REPOSITORY
export const getBeersNotInMyBeers = async (): Promise<Beer[]> => {
  return await beerRepository.getUntasted();
};

// Reset database initialization state (for manual refresh)
export const resetDatabaseState = (): void => {
  databaseInitialized = false;
  databaseSetupComplete = false;
  setupDatabaseInProgress = false;
  console.log('Database state flags reset');
};

// Re-export areApiUrlsConfigured from preferences for backwards compatibility
export const areApiUrlsConfigured = _areApiUrlsConfigured;

// Fetch rewards from API
// Re-export Rewards API fetch function for backwards compatibility
export const fetchRewardsFromAPI = _fetchRewardsFromAPI;

// Populate the rewards table
// DELEGATES TO REPOSITORY - NO DUPLICATE INSERT LOGIC
export const populateRewardsTable = async (rewards: Reward[]): Promise<void> => {
  return await rewardsRepository.insertMany(rewards);
};

// Fetch and populate rewards
export const fetchAndPopulateRewards = async (): Promise<void> => {
  try {
    // Check if API URL is configured
    const apiUrlsConfigured = await areApiUrlsConfigured();
    if (!apiUrlsConfigured) {
      console.log('API URLs not configured, skipping rewards fetch');
      return;
    }

    // Fetch rewards from API
    const rewards = await fetchRewardsFromAPI();

    // Delegate to repository for insertion
    await rewardsRepository.insertMany(rewards);

    console.log('Rewards fetch and populate completed successfully');
  } catch (error) {
    console.error('Error fetching and populating rewards:', error);
    throw error;
  }
};

// Get all rewards
// DELEGATES TO REPOSITORY
export const getAllRewards = async (): Promise<Reward[]> => {
  return await rewardsRepository.getAll();
};

// Clear Untappd cookies
export async function clearUntappdCookies(): Promise<void> {
  try {
    const db = await initDatabase();
    await db.execAsync('DELETE FROM untappd');
  } catch (error) {
    console.error('Error clearing Untappd cookies:', error);
    throw error;
  }
}
