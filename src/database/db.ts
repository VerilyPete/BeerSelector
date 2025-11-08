import * as SQLite from 'expo-sqlite';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';
import { Beer, Beerfinder, isBeer, isBeerfinder } from './types';
import { Preference, Reward, UntappdCookie, isPreference, isReward, isUntappdCookie } from './types';
import { SQLiteDatabase } from 'expo-sqlite';
import { getDatabase } from './connection';
import { getPreference, setPreference, getAllPreferences } from './preferences';
import { setupTables } from './schema';
// Import API fetch functions (will re-export for backwards compatibility)
import {
  fetchBeersFromAPI as _fetchBeersFromAPI,
  fetchMyBeersFromAPI as _fetchMyBeersFromAPI,
  fetchRewardsFromAPI as _fetchRewardsFromAPI,
  fetchWithRetry
} from '../api/beerApi';

// Database operation lock to prevent concurrent operations
let dbOperationInProgress = false;

// Simple database lock to prevent concurrent operations
let lockTimeoutId: NodeJS.Timeout | null = null;

// Track if database has been initialized
let databaseInitialized = false;

// Track if database setup has been completed
let databaseSetupComplete = false;

// Track if My Beers import has been scheduled
let myBeersImportScheduled = false;

// Track if My Beers fetch/import is in progress or complete
let myBeersImportInProgress = false;
let myBeersImportComplete = false;

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

// Simple database lock to prevent concurrent operations
const acquireLock = async (operationName: string): Promise<boolean> => {
  if (dbOperationInProgress) {
    console.log(`Database operation already in progress, waiting for lock (${operationName})...`);
    // Wait for operation to complete
    let attempts = 0;
    while (dbOperationInProgress && attempts < 15) {
      await new Promise(resolve => setTimeout(resolve, 300));
      attempts++;
    }

    if (dbOperationInProgress) {
      console.error(`Failed to acquire database lock after waiting (${operationName})`);
      return false;
    }
  }

  console.log(`Lock acquired for: ${operationName}`);
  dbOperationInProgress = true;

  // Safety timeout to release lock after 60 seconds in case of any issues
  if (lockTimeoutId) {
    clearTimeout(lockTimeoutId);
  }

  lockTimeoutId = setTimeout(() => {
    console.warn('Database lock forcibly released after timeout');
    dbOperationInProgress = false;
  }, 60000); // 60 second safety timeout

  return true;
};

const releaseLock = (operationName: string): void => {
  if (lockTimeoutId) {
    clearTimeout(lockTimeoutId);
    lockTimeoutId = null;
  }
  console.log(`Lock released for: ${operationName}`);
  dbOperationInProgress = false;
};

// Insert beers into database using transactions
export const populateBeersTable = async (beers: Beer[]): Promise<void> => {
  if (!await acquireLock('populateBeersTable')) {
    throw new Error('Failed to acquire database lock for populating beers table');
  }

  const database = await initDatabase();

  try {
    // Always refresh the allbeers table with the latest data
    // Clear existing data first, then insert fresh records in batches
    await database.withTransactionAsync(async () => {
      const before = await database.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM allbeers');
      await database.runAsync('DELETE FROM allbeers');
      console.log(`Cleared allbeers table (removed ${before?.count ?? 0} rows)`);
    });

    console.log(`Starting import of ${beers.length} beers...`);

    // Process in larger batches using transactions
    const batchSize = 50;

    for (let i = 0; i < beers.length; i += batchSize) {
      const batch = beers.slice(i, i + batchSize);

      // Use withTransactionAsync for each batch
      await database.withTransactionAsync(async () => {
        for (const beer of batch) {
          if (!beer.id) continue; // Skip entries without an ID

          await database.runAsync(
            `INSERT OR REPLACE INTO allbeers (
              id, added_date, brew_name, brewer, brewer_loc,
              brew_style, brew_container, review_count, review_rating, brew_description
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              beer.id,
              beer.added_date || '',
              beer.brew_name || '',
              beer.brewer || '',
              beer.brewer_loc || '',
              beer.brew_style || '',
              beer.brew_container || '',
              beer.review_count || '',
              beer.review_rating || '',
              beer.brew_description || ''
            ]
          );
        }
      });

      // Log progress for larger batches
      if ((i + batchSize) % 200 === 0 || i + batchSize >= beers.length) {
        console.log(`Imported ${Math.min(i + batchSize, beers.length)} of ${beers.length} beers...`);
      }
    }

    // Verify final row count
    try {
      const after = await database.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM allbeers');
      console.log(`Beer import complete! allbeers now has ${after?.count ?? 0} rows`);
    } catch (e) {
      console.log('Beer import complete! (row count query failed)');
    }
  } catch (error) {
    console.error('Error populating beer database:', error);
    throw error;
  } finally {
    releaseLock('populateBeersTable');
  }
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
    
    // If we haven't already scheduled My Beers import and not in visitor mode, do it now
    if (!myBeersImportScheduled && !isVisitorMode) {
      myBeersImportScheduled = true;

      // Use setTimeout to make My Beers import non-blocking
      setTimeout(async () => {
        try {
          await fetchAndPopulateMyBeers();
          myBeersImportComplete = true;
        } catch (error) {
          console.error('Error in scheduled My Beers import:', error);
        } finally {
          myBeersImportInProgress = false;
        }
      }, 100);
    } else if (isVisitorMode) {
      console.log('In visitor mode - skipping scheduled My Beers import');
      myBeersImportComplete = true;
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
export const populateMyBeersTable = async (beers: Beerfinder[]): Promise<void> => {
  console.log(`DB: Populating My Beers table with ${beers.length} beers`);

  // Handle empty array as valid (clear the table for new user or round rollover)
  if (!beers || beers.length === 0) {
    console.log('DB: Empty beers array - clearing tasted_brew_current_round table (new user or round rollover at 200 beers)');
    
    if (!await acquireLock('populateMyBeersTable')) {
      console.log('DB: Could not acquire lock for populateMyBeersTable, another operation is in progress');
      return;
    }

    try {
      const database = await initDatabase();
      const before = await database.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM tasted_brew_current_round');
      await database.withTransactionAsync(async () => {
        await database.runAsync('DELETE FROM tasted_brew_current_round');
      });
      const after = await database.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM tasted_brew_current_round');
      console.log(`DB: Successfully cleared tasted_brew_current_round table (removed ${before?.count ?? 0} rows, now ${after?.count ?? 0})`);
    } finally {
      releaseLock('populateMyBeersTable');
    }
    return;
  }

  // Count beers with valid IDs
  const validBeers = beers.filter(beer => beer && beer.id);
  console.log(`DB: Found ${validBeers.length} valid beers with IDs out of ${beers.length} total beers`);

  if (validBeers.length === 0) {
    console.log('DB: No valid beers with IDs found, clearing table instead of throwing error');
    
    if (!await acquireLock('populateMyBeersTable')) {
      console.log('DB: Could not acquire lock for populateMyBeersTable, another operation is in progress');
      return;
    }

    try {
      const database = await initDatabase();
      await database.withTransactionAsync(async () => {
        await database.runAsync('DELETE FROM tasted_brew_current_round');
      });
      console.log('DB: Successfully cleared tasted_brew_current_round table (all beers invalid)');
    } finally {
      releaseLock('populateMyBeersTable');
    }
    return;
  }

  if (!await acquireLock('populateMyBeersTable')) {
    console.error('DB: Failed to acquire database lock for populating Beerfinder beers table');
    throw new Error('Failed to acquire database lock for populating Beerfinder beers table');
  }

  const database = await initDatabase();
  console.log('DB: Database initialized for populating My Beers table');

  try {
    // Use a transaction for clearing and inserting data
    console.log('DB: Starting transaction for populating My Beers table');
    await database.withTransactionAsync(async () => {
      // Only clear the table if we have valid beers to insert
      console.log('DB: Clearing existing data from tasted_brew_current_round table');
      await database.runAsync('DELETE FROM tasted_brew_current_round');

      console.log(`DB: Starting import of ${validBeers.length} valid My Beers...`);

      // Process in larger batches using transactions
      const batchSize = 20;
      console.log(`DB: Processing My Beers in batches of ${batchSize}`);

      for (let i = 0; i < validBeers.length; i += batchSize) {
        const batch = validBeers.slice(i, i + batchSize);
        console.log(`DB: Processing batch ${Math.floor(i/batchSize) + 1} of ${Math.ceil(validBeers.length/batchSize)} (${batch.length} beers)`);

        // Insert each beer within the transaction
        for (const beer of batch) {
          // Double-check that the beer has an ID (should always be true due to our filtering)
          if (!beer.id) {
            console.log('DB: Skipping beer without ID');
            continue; // Skip entries without an ID
          }

          try {
            await database.runAsync(
              `INSERT OR REPLACE INTO tasted_brew_current_round (
                id, roh_lap, tasted_date, brew_name, brewer, brewer_loc,
                brew_style, brew_container, review_count, review_ratings,
                brew_description, chit_code
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                beer.id,
                beer.roh_lap || '',
                beer.tasted_date || '',
                beer.brew_name || '',
                beer.brewer || '',
                beer.brewer_loc || '',
                beer.brew_style || '',
                beer.brew_container || '',
                beer.review_count || '',
                beer.review_ratings || '',
                beer.brew_description || '',
                beer.chit_code || ''
              ]
            );
          } catch (err) {
            console.error('DB: Error inserting beer into tasted_brew_current_round:', err);
          }
        }
      }
    });

    // Verify final row count
    try {
      const after = await database.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM tasted_brew_current_round');
      console.log(`DB: My Beers import complete! tasted_brew_current_round now has ${after?.count ?? 0} rows`);
    } catch (e) {
      console.log('DB: My Beers import complete! (row count query failed)');
    }
  } catch (error) {
    console.error('Error populating My Beers database:', error);
    throw error;
  } finally {
    releaseLock('populateMyBeersTable');
  }
};

// Fetch and populate My Beers
export const fetchAndPopulateMyBeers = async (): Promise<void> => {
  // Check for visitor mode first and exit early without acquiring lock
  const isVisitorMode = await getPreference('is_visitor_mode') === 'true';
  if (isVisitorMode) {
    console.log('In visitor mode - skipping fetchAndPopulateMyBeers');
    myBeersImportComplete = true;
    return;
  }

  // Skip if we're already doing this operation or it's already complete
  if (myBeersImportInProgress) {
    console.log('My Beers import already in progress, skipping duplicate request');
    return;
  }

  if (myBeersImportComplete) {
    console.log('My Beers import already completed, skipping duplicate request');
    return;
  }

  if (!await acquireLock('fetchAndPopulateMyBeers')) {
    throw new Error('Failed to acquire database lock for fetching and populating My Beers');
  }

  myBeersImportInProgress = true;

  try {
    await _refreshMyBeersFromAPIInternal();
    myBeersImportComplete = true;
  } finally {
    myBeersImportInProgress = false;
    releaseLock('fetchAndPopulateMyBeers');
  }
};

// Internal version of refreshBeersFromAPI that doesn't handle its own locking
const _refreshBeersFromAPIInternal = async (): Promise<Beer[]> => {
  const database = await initDatabase();

  try {
    // Use a transaction for the entire refresh operation
    await database.withTransactionAsync(async () => {
      console.log('Clearing beer database...');
      // Delete all records from the table
      await database.runAsync('DELETE FROM allbeers');

      // Fetch fresh data from API
      const beers = await fetchBeersFromAPI();
      console.log(`Fetched ${beers.length} beers from API. Refreshing database...`);

      // Process in larger batches using transactions
      const batchSize = 50;
      for (let i = 0; i < beers.length; i += batchSize) {
        const batch = beers.slice(i, i + batchSize);

        // Insert each beer within the transaction
        for (const beer of batch) {
          if (!beer.id) continue; // Skip entries without an ID

          await database.runAsync(
            `INSERT OR REPLACE INTO allbeers (
              id, added_date, brew_name, brewer, brewer_loc,
              brew_style, brew_container, review_count, review_rating, brew_description
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              beer.id,
              beer.added_date || '',
              beer.brew_name || '',
              beer.brewer || '',
              beer.brewer_loc || '',
              beer.brew_style || '',
              beer.brew_container || '',
              beer.review_count || '',
              beer.review_rating || '',
              beer.brew_description || ''
            ]
          );
        }

        // Log progress for larger batches
        if ((i + batchSize) % 200 === 0 || i + batchSize >= beers.length) {
          console.log(`Refreshed ${Math.min(i + batchSize, beers.length)} of ${beers.length} beers...`);
        }
      }
    });

    console.log('Database refresh complete!');

    // Return the refreshed beers
    return await getAllBeers();
  } catch (error) {
    console.error('Error refreshing beer database:', error);
    throw error;
  }
};

// Public version that handles locking
export const refreshBeersFromAPI = async (): Promise<Beer[]> => {
  if (!await acquireLock('refreshBeersFromAPI')) {
    throw new Error('Failed to acquire database lock for refreshing beers');
  }

  try {
    return await _refreshBeersFromAPIInternal();
  } finally {
    releaseLock('refreshBeersFromAPI');
  }
};

// Internal version of fetchAndPopulateMyBeers that doesn't handle its own locking
const _refreshMyBeersFromAPIInternal = async (): Promise<Beerfinder[]> => {
  try {
    // Check for visitor mode first
    const isVisitorMode = await getPreference('is_visitor_mode') === 'true';
    if (isVisitorMode) {
      console.log('DB: In visitor mode - _refreshMyBeersFromAPIInternal returning empty array');
      return [];
    }
    
    const myBeers = await fetchMyBeersFromAPI();
    console.log(`DB: _refreshMyBeersFromAPIInternal received ${myBeers.length} beers from API`);

    // Handle empty array as a valid state (user has no tasted beers or round has rolled over)
    if (myBeers.length === 0) {
      console.log('DB: Empty tasted beers array - user has no tasted beers in current round (new user or round rollover at 200 beers), clearing database');
      
      const database = await initDatabase();
      await database.withTransactionAsync(async () => {
        // Clear existing data since there are no beers
        await database.runAsync('DELETE FROM tasted_brew_current_round');
      });
      
      console.log('DB: My Beers cleared (empty state)!');
      return [];
    }

    // Validate beers have IDs
    const validBeers = myBeers.filter((beer: any) => beer && beer.id);
    console.log(`DB: Found ${validBeers.length} valid beers with IDs out of ${myBeers.length} total beers`);

    if (validBeers.length === 0) {
      console.log('DB: No valid beers with IDs found, clearing database instead of throwing error');
      
      const database = await initDatabase();
      await database.withTransactionAsync(async () => {
        // Clear existing data since all beers are invalid
        await database.runAsync('DELETE FROM tasted_brew_current_round');
      });
      
      console.log('DB: My Beers cleared (all invalid)!');
      return [];
    }

    const database = await initDatabase();

    // Use a transaction for the entire refresh operation
    await database.withTransactionAsync(async () => {
      // Clear existing data
      await database.runAsync('DELETE FROM tasted_brew_current_round');

      console.log(`DB: Starting import of ${validBeers.length} valid My Beers...`);

      // Process in larger batches
      const batchSize = 20;
      for (let i = 0; i < validBeers.length; i += batchSize) {
        const batch = validBeers.slice(i, i + batchSize);
        console.log(`DB: Processing batch ${Math.floor(i/batchSize) + 1} of ${Math.ceil(validBeers.length/batchSize)} (${batch.length} beers)`);

        for (const beer of batch) {
          // Double-check that beer has an ID (should always be true due to our filtering)
          if (!beer.id) {
            console.log('DB: Skipping beer without ID');
            continue; // Skip entries without an ID
          }

          await database.runAsync(
            `INSERT OR REPLACE INTO tasted_brew_current_round (
              id, roh_lap, tasted_date, brew_name, brewer, brewer_loc,
              brew_style, brew_container, review_count, review_ratings,
              brew_description, chit_code
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              beer.id,
              beer.roh_lap || '',
              beer.tasted_date || '',
              beer.brew_name || '',
              beer.brewer || '',
              beer.brewer_loc || '',
              beer.brew_style || '',
              beer.brew_container || '',
              beer.review_count || '',
              beer.review_ratings || '',
              beer.brew_description || '',
              beer.chit_code || ''
            ]
          );
        }

        // Log progress for larger batches
        if ((i + batchSize) % 100 === 0 || i + batchSize >= validBeers.length) {
          console.log(`DB: Imported ${Math.min(i + batchSize, validBeers.length)} of ${validBeers.length} valid My Beers...`);
        }
      }
    });

    console.log('DB: My Beers import complete!');
    return validBeers;
  } catch (error) {
    console.error('Error refreshing My Beers:', error);
    throw error;
  }
};

// Get all beers from the database
export const getAllBeers = async (): Promise<Beer[]> => {
  const database = await initDatabase();

  try {
    return await database.getAllAsync(
      'SELECT * FROM allbeers WHERE brew_name IS NOT NULL AND brew_name != "" ORDER BY added_date DESC'
    );
  } catch (error) {
    console.error('Error getting beers from database:', error);
    throw error;
  }
};

// Get beer by ID
export const getBeerById = async (id: string): Promise<Beer | null> => {
  const database = await initDatabase();

  try {
    return await database.getFirstAsync(
      'SELECT * FROM allbeers WHERE id = ?',
      [id]
    );
  } catch (error) {
    console.error('Error getting beer by ID:', error);
    throw error;
  }
};

// Search beers by name, brewer, style, or description
export const searchBeers = async (query: string): Promise<Beer[]> => {
  if (!query.trim()) {
    return getAllBeers();
  }

  const database = await initDatabase();
  const searchTerm = `%${query.trim()}%`;

  try {
    return await database.getAllAsync(
      `SELECT * FROM allbeers
       WHERE brew_name IS NOT NULL AND brew_name != "" AND
       (brew_name LIKE ?
       OR brewer LIKE ?
       OR brew_style LIKE ?
       OR brew_description LIKE ?)
       ORDER BY added_date DESC`,
      [searchTerm, searchTerm, searchTerm, searchTerm]
    );
  } catch (error) {
    console.error('Error searching beers:', error);
    throw error;
  }
};

// Get beers by style
export const getBeersByStyle = async (style: string): Promise<Beer[]> => {
  const database = await initDatabase();

  try {
    return await database.getAllAsync(
      'SELECT * FROM allbeers WHERE brew_name IS NOT NULL AND brew_name != "" AND brew_style = ? ORDER BY added_date DESC',
      [style]
    );
  } catch (error) {
    console.error('Error getting beers by style:', error);
    throw error;
  }
};

// Get beers by brewer
export const getBeersByBrewer = async (brewer: string): Promise<Beer[]> => {
  const database = await initDatabase();

  try {
    return await database.getAllAsync(
      'SELECT * FROM allbeers WHERE brew_name IS NOT NULL AND brew_name != "" AND brewer = ? ORDER BY added_date DESC',
      [brewer]
    );
  } catch (error) {
    console.error('Error getting beers by brewer:', error);
    throw error;
  }
};

// Get all tasted beers (Beerfinder beers)
export const getMyBeers = async (): Promise<Beerfinder[]> => {
  const database = await initDatabase();

  try {
    console.log('DB: Executing query to get tasted beers from tasted_brew_current_round table');
    const beers = await database.getAllAsync<any>(
      'SELECT * FROM tasted_brew_current_round ORDER BY id'
    );
    console.log(`DB: Retrieved ${beers.length} tasted beers from database`);

    // Check if we have any beers
    if (beers.length === 0) {
      console.log('DB: No tasted beers found in the database. Checking table existence...');

      // Check if the table exists and has the expected structure
      const tableInfo = await database.getAllAsync<any>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='tasted_brew_current_round'"
      );

      if (tableInfo.length === 0) {
        console.log('DB: Table tasted_brew_current_round does not exist!');
      } else {
        console.log('DB: Table tasted_brew_current_round exists. Checking column structure...');
        const columnInfo = await database.getAllAsync<any>(
          "PRAGMA table_info(tasted_brew_current_round)"
        );
        console.log('DB: Table structure:', JSON.stringify(columnInfo));
      }
    }

    return beers;
  } catch (error) {
    console.error('Error getting Beerfinder beers:', error);
    throw error;
  }
};

// Get all available beers that are not in My Beers
export const getBeersNotInMyBeers = async (): Promise<Beer[]> => {
  const database = await initDatabase();

  try {
    return await database.getAllAsync(`
      SELECT * FROM allbeers
      WHERE brew_name IS NOT NULL
      AND brew_name != ""
      AND id NOT IN (SELECT id FROM tasted_brew_current_round)
      ORDER BY added_date DESC
    `);
  } catch (error) {
    console.error('Error getting beers not in My Beers:', error);
    throw error;
  }
};

// Reset database initialization state (for manual refresh)
export const resetDatabaseState = (): void => {
  databaseInitialized = false;
  databaseSetupComplete = false;
  myBeersImportScheduled = false;
  myBeersImportInProgress = false;
  myBeersImportComplete = false;
  setupDatabaseInProgress = false;
  console.log('Database state flags reset');
};

// Refresh all data from APIs (both all beers and Beerfinder beers)
export const refreshAllDataFromAPI = async (): Promise<{ allBeers: Beer[], myBeers: Beerfinder[], rewards: Reward[] }> => {
  console.log('Refreshing all data from API...');

  // Check if API URLs are configured
  const apiUrlsConfigured = await areApiUrlsConfigured();
  if (!apiUrlsConfigured) {
    console.log('API URLs not configured, cannot refresh data');
    throw new Error('API URLs not configured. Please log in to set up API URLs.');
  }

  try {
    // Get preferences to check API URLs
    const allBeersApiUrl = await getPreference('all_beers_api_url');
    const myBeersApiUrl = await getPreference('my_beers_api_url');

    if (!allBeersApiUrl || !myBeersApiUrl) {
      console.log('API URLs not found in preferences');
      throw new Error('API URLs not found. Please log in to set up API URLs.');
    }

    // Refresh all data sources in parallel
    const [allBeers, myBeers, rewards] = await Promise.all([
      _refreshBeersFromAPIInternal(),
      _refreshMyBeersFromAPIInternal(),
      fetchRewardsFromAPI().then(data => {
        populateRewardsTable(data);
        return data;
      })
    ]);

    console.log(`Successfully refreshed all data: ${allBeers.length} beers, ${myBeers.length} tasted beers, ${rewards.length} rewards`);

    return { allBeers, myBeers, rewards };
  } catch (error) {
    console.error('Error refreshing all data from API:', error);
    throw error;
  }
};

// Check if API URLs are configured
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

// Fetch rewards from API
// Re-export Rewards API fetch function for backwards compatibility
export const fetchRewardsFromAPI = _fetchRewardsFromAPI;

// Populate the rewards table
export const populateRewardsTable = async (rewards: Reward[]): Promise<void> => {
  if (!rewards || rewards.length === 0) {
    console.log('No rewards to populate');
    return;
  }

  try {
    const database = await initDatabase();
    const acquired = await acquireLock('populate_rewards_table');

    if (!acquired) {
      console.log('Could not acquire lock for rewards table population');
      return;
    }

    try {
      // Use a transaction for the entire operation
      await database.withTransactionAsync(async () => {
        // Clear existing rewards
        await database.runAsync('DELETE FROM rewards');
        console.log('Cleared existing rewards from the table');

        // Batch insert new rewards
        const batchSize = 100;
        for (let i = 0; i < rewards.length; i += batchSize) {
          const batch = rewards.slice(i, i + batchSize);

          const placeholders = batch.map(() => '(?, ?, ?)').join(',');
          const values: any[] = [];

          batch.forEach(reward => {
            values.push(
              reward.reward_id || '',
              reward.redeemed || '0',
              reward.reward_type || ''
            );
          });

          await database.runAsync(
            `INSERT OR REPLACE INTO rewards (
              reward_id,
              redeemed,
              reward_type
            ) VALUES ${placeholders}`,
            values
          );
        }
      });

      console.log(`Successfully populated rewards table with ${rewards.length} rewards`);
    } finally {
      releaseLock('populate_rewards_table');
    }
  } catch (error) {
    console.error('Error populating rewards table:', error);
    throw error;
  }
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

    // Populate rewards table
    await populateRewardsTable(rewards);

    console.log('Rewards fetch and populate completed successfully');
  } catch (error) {
    console.error('Error fetching and populating rewards:', error);
    throw error;
  }
};

// Get all rewards
export const getAllRewards = async (): Promise<any[]> => {
  const database = await initDatabase();
  try {
    return await database.getAllAsync(
      'SELECT * FROM rewards ORDER BY reward_id'
    );
  } catch (error) {
    console.error('Error getting rewards:', error);
    return [];
  }
};

export async function clearUntappdCookies(): Promise<void> {
  try {
    const db = await initDatabase();
    await db.execAsync('DELETE FROM untappd');
  } catch (error) {
    console.error('Error clearing Untappd cookies:', error);
    throw error;
  }
}