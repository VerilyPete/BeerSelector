import * as SQLite from 'expo-sqlite';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';

// Database connection instance
let db: SQLite.SQLiteDatabase | null = null;

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

// Initialize database
export const initDatabase = async (): Promise<SQLite.SQLiteDatabase> => {
  if (db) return db;
  
  try {
    db = await SQLite.openDatabaseAsync('beers.db');
    return db;
  } catch (error) {
    console.error('Failed to open database:', error);
    throw error;
  }
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
      await database.execAsync(`
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
      `);

      // Create the table for My Beers (tasted beers)
      await database.execAsync(`
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
      `);
      
      // Create preferences table to store API endpoints and other preferences
      await database.execAsync(`
        CREATE TABLE IF NOT EXISTS preferences (
          key TEXT PRIMARY KEY,
          value TEXT,
          description TEXT
        )
      `);
      
      // Initialize preferences with API endpoints if they don't exist
      await initializePreferences(database);
      
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

// Initialize preferences with default values
const initializePreferences = async (database: SQLite.SQLiteDatabase): Promise<void> => {
  try {
    // Check if preferences already exist
    const count = await database.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM preferences');
    
    // Only add default preferences if the table is empty
    if (!count || count.count === 0) {
      const preferences = [
        {
          key: 'all_beers_api_url',
          value: '',
          description: 'API endpoint for fetching all beers'
        },
        {
          key: 'my_beers_api_url',
          value: '',
          description: 'API endpoint for fetching my beers'
        },
        {
          key: 'first_launch',
          value: 'true',
          description: 'Flag indicating if this is the first app launch'
        }
      ];
      
      // Insert default preferences
      for (const pref of preferences) {
        await database.runAsync(
          'INSERT OR IGNORE INTO preferences (key, value, description) VALUES (?, ?, ?)',
          [pref.key, pref.value, pref.description]
        );
      }
      
      console.log('Default preferences initialized');
    }
  } catch (error) {
    console.error('Error initializing preferences:', error);
    throw error;
  }
};

// Helper functions to get and set preferences
export const getPreference = async (key: string): Promise<string | null> => {
  const database = await initDatabase();
  
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

export const setPreference = async (key: string, value: string, description?: string): Promise<void> => {
  const database = await initDatabase();
  
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

// Get all preferences from the database
export const getAllPreferences = async (): Promise<Array<{ key: string, value: string, description: string }>> => {
  const database = await initDatabase();
  
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

// Helper function to retry fetch operations
const fetchWithRetry = async (url: string, retries = 3, delay = 1000): Promise<any> => {
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    if (retries <= 1) {
      throw error;
    }
    
    console.log(`Fetch failed, retrying in ${delay}ms... (${retries-1} retries left)`);
    await new Promise(resolve => setTimeout(resolve, delay));
    return fetchWithRetry(url, retries - 1, delay * 1.5);
  }
};

// Fetch beers from API
export const fetchBeersFromAPI = async (): Promise<any[]> => {
  try {
    // Get the API endpoint from preferences
    const apiUrl = await getPreference('all_beers_api_url');
    
    if (!apiUrl) {
      console.log('All beers API URL not found in preferences');
      return []; // Return empty array instead of throwing an error
    }
    
    const data = await fetchWithRetry(apiUrl);
    
    // Extract the brewInStock array from the response
    // The API returns an array where the second element contains the brewInStock array
    if (data && Array.isArray(data) && data.length >= 2 && data[1] && data[1].brewInStock) {
      return data[1].brewInStock;
    }
    
    throw new Error('Invalid response format from API');
  } catch (error) {
    console.error('Error fetching beers from API:', error);
    throw error;
  }
};

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

// Insert beers into database WITHOUT using transactions
export const populateBeersTable = async (beers: any[]): Promise<void> => {
  if (!await acquireLock('populateBeersTable')) {
    throw new Error('Failed to acquire database lock for populating beers table');
  }

  const database = await initDatabase();
  
  try {
    // Check if table is already populated
    const count = await database.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM allbeers');
    
    if (count && count.count > 0) {
      console.log(`Database already contains ${count.count} beers. Skipping import.`);
      return;
    }
    
    console.log(`Starting import of ${beers.length} beers...`);
    
    // Process in small batches without using transactions
    const batchSize = 5;
    for (let i = 0; i < beers.length; i += batchSize) {
      const batch = beers.slice(i, i + batchSize);
      
      // Insert each beer individually without a transaction
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
      
      // Small delay between batches to avoid locking issues
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    console.log('Beer import complete!');
  } catch (error) {
    console.error('Error populating beer database:', error);
    throw error;
  } finally {
    releaseLock('populateBeersTable');
  }
};

// Initialize the database on app startup
export const initializeBeerDatabase = async (): Promise<void> => {
  // Skip if already initialized
  if (databaseInitialized) {
    console.log('Database already initialized, skipping');
    return;
  }

  try {
    // Only run setupDatabase if it hasn't been completed
    if (!databaseSetupComplete) {
      await setupDatabase();
      databaseSetupComplete = true;
    } else {
      console.log('Database setup already completed, skipping');
    }
    
    // Check if API URLs are set
    const allBeersApiUrl = await getPreference('all_beers_api_url');
    const myBeersApiUrl = await getPreference('my_beers_api_url');
    
    // Only try to populate data if we have API URLs
    if (allBeersApiUrl) {
      try {
        // Populate allbeers table
        const beers = await fetchBeersFromAPI();
        if (beers.length > 0) {
          await populateBeersTable(beers);
        }
      } catch (error) {
        console.error('Error initializing beer list:', error);
        // Continue anyway to allow partial functionality
      }
    } else {
      console.log('Skipping beer list initialization - API URL not set');
    }
    
    // Run this after a short delay only if we have the My Beers API URL
    if (myBeersApiUrl && !myBeersImportScheduled) {
      myBeersImportScheduled = true;
      setTimeout(async () => {
        try {
          await fetchAndPopulateMyBeers();
        } catch (error) {
          console.error('Error loading My Beers data:', error);
          // Continue anyway
        }
      }, 1000);
    } else {
      console.log('Skipping My Beers initialization - API URL not set or import already scheduled');
    }
    
    // Mark database as initialized
    databaseInitialized = true;
  } catch (error) {
    console.error('Error initializing beer database:', error);
    throw error;
  }
};

// Fetch My Beers from API
export const fetchMyBeersFromAPI = async (): Promise<any[]> => {
  try {
    // Get the API endpoint from preferences
    const apiUrl = await getPreference('my_beers_api_url');
    
    if (!apiUrl) {
      console.log('My beers API URL not found in preferences');
      return []; // Return empty array instead of throwing an error
    }
    
    const data = await fetchWithRetry(apiUrl);
    
    // Extract the tasted_brew_current_round array from the response
    if (data && Array.isArray(data) && data.length >= 2 && data[1] && data[1].tasted_brew_current_round) {
      return data[1].tasted_brew_current_round;
    }
    
    throw new Error('Invalid response format from My Beers API');
  } catch (error) {
    console.error('Error fetching My Beers from API:', error);
    throw error;
  }
};

// Insert My Beers into database WITHOUT using transactions
export const populateMyBeersTable = async (beers: any[]): Promise<void> => {
  if (!await acquireLock('populateMyBeersTable')) {
    throw new Error('Failed to acquire database lock for populating my beers table');
  }

  const database = await initDatabase();
  
  try {
    // Clear the existing table data first
    await database.runAsync('DELETE FROM tasted_brew_current_round');
    
    console.log(`Starting import of ${beers.length} My Beers...`);
    
    // Process in very small batches without using transactions
    const batchSize = 3;
    for (let i = 0; i < beers.length; i += batchSize) {
      const batch = beers.slice(i, i + batchSize);
      
      // Insert each beer individually without a transaction
      for (const beer of batch) {
        if (!beer.id) continue; // Skip entries without an ID
        
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
      
      // Small delay between batches to avoid locking issues
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    console.log('My Beers import complete!');
  } catch (error) {
    console.error('Error populating My Beers database:', error);
    throw error;
  } finally {
    releaseLock('populateMyBeersTable');
  }
};

// Fetch and populate My Beers
export const fetchAndPopulateMyBeers = async (): Promise<void> => {
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
const _refreshBeersFromAPIInternal = async (): Promise<any[]> => {
  const database = await initDatabase();
  
  try {
    console.log('Clearing beer database...');
    // Delete all records from the table
    await database.runAsync('DELETE FROM allbeers');
    
    // Fetch fresh data from API
    const beers = await fetchBeersFromAPI();
    console.log(`Fetched ${beers.length} beers from API. Refreshing database...`);
    
    // Process in small batches without using transactions
    const batchSize = 5;
    for (let i = 0; i < beers.length; i += batchSize) {
      const batch = beers.slice(i, i + batchSize);
      
      // Insert each beer individually without a transaction
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
      
      // Small delay between batches to avoid locking issues
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    console.log('Database refresh complete!');
    
    // Return the refreshed beers
    return await getAllBeers();
  } catch (error) {
    console.error('Error refreshing beer database:', error);
    throw error;
  }
};

// Public version that handles locking
export const refreshBeersFromAPI = async (): Promise<any[]> => {
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
const _refreshMyBeersFromAPIInternal = async (): Promise<any[]> => {
  try {
    const myBeers = await fetchMyBeersFromAPI();
    
    const database = await initDatabase();
    
    // Clear existing data
    await database.runAsync('DELETE FROM tasted_brew_current_round');
    
    console.log(`Starting import of ${myBeers.length} My Beers...`);
    
    // Process in very small batches
    const batchSize = 3;
    for (let i = 0; i < myBeers.length; i += batchSize) {
      const batch = myBeers.slice(i, i + batchSize);
      
      for (const beer of batch) {
        if (!beer.id) continue; // Skip entries without an ID
        
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
      
      // Small delay between batches to avoid locking issues
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    console.log('My Beers import complete!');
    return myBeers;
  } catch (error) {
    console.error('Error refreshing My Beers:', error);
    throw error;
  }
};

// Get all beers from the database
export const getAllBeers = async (): Promise<any[]> => {
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
export const getBeerById = async (id: string): Promise<any> => {
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
export const searchBeers = async (query: string): Promise<any[]> => {
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
export const getBeersByStyle = async (style: string): Promise<any[]> => {
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
export const getBeersByBrewer = async (brewer: string): Promise<any[]> => {
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

// Get all tasted beers (my beers)
export const getMyBeers = async (): Promise<any[]> => {
  const database = await initDatabase();
  
  try {
    const beers = await database.getAllAsync<any>(
      'SELECT * FROM tasted_brew_current_round ORDER BY id'
    );
    return beers;
  } catch (error) {
    console.error('Error getting my beers:', error);
    throw error;
  }
};

// Get all available beers that are not in My Beers
export const getBeersNotInMyBeers = async (): Promise<any[]> => {
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

// Refresh all data from APIs (both all beers and my beers)
export const refreshAllDataFromAPI = async (): Promise<{ allBeers: any[], myBeers: any[] }> => {
  // Reset database state to allow full refresh
  resetDatabaseState();
  
  if (!await acquireLock('refreshAllDataFromAPI')) {
    throw new Error('Failed to acquire database lock for refreshing all data');
  }
  
  try {
    let allBeers: any[] = [];
    let myBeers: any[] = [];
    
    // Check if API URLs are set
    const allBeersApiUrl = await getPreference('all_beers_api_url');
    const myBeersApiUrl = await getPreference('my_beers_api_url');
    
    console.log('Starting full data refresh...');
    
    // Only fetch if API URLs are available
    if (allBeersApiUrl) {
      console.log('Refreshing all beers...');
      try {
        allBeers = await _refreshBeersFromAPIInternal();
      } catch (error) {
        console.error('Error refreshing all beers:', error);
        throw error;
      }
    } else {
      console.log('Cannot refresh all beers - API URL not set');
    }
    
    // Only fetch if API URL is available
    if (myBeersApiUrl) {
      console.log('Refreshing my beers...');
      try {
        myBeers = await _refreshMyBeersFromAPIInternal();
      } catch (error) {
        console.error('Error refreshing my beers:', error);
        throw error;
      }
    } else {
      console.log('Cannot refresh my beers - API URL not set');
    }
    
    // If both API URLs are missing, throw an error
    if (!allBeersApiUrl && !myBeersApiUrl) {
      throw new Error('API URLs not configured. Please log in first.');
    }
    
    console.log('Full data refresh complete!');
    
    return {
      allBeers,
      myBeers: myBeers.filter(beer => beer.brew_name && beer.brew_name.trim() !== '')
    };
  } catch (error) {
    console.error('Error in refreshAllDataFromAPI:', error);
    throw error;
  } finally {
    releaseLock('refreshAllDataFromAPI');
  }
};

// Check if API URLs are configured
export const areApiUrlsConfigured = async (): Promise<boolean> => {
  try {
    const allBeersApiUrl = await getPreference('all_beers_api_url');
    const myBeersApiUrl = await getPreference('my_beers_api_url');
    
    return !!allBeersApiUrl && !!myBeersApiUrl;
  } catch (error) {
    console.error('Error checking API URLs:', error);
    return false;
  }
}; 