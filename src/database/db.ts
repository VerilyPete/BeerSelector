import * as SQLite from 'expo-sqlite';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';

// Database connection instance
let db: SQLite.SQLiteDatabase | null = null;

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
    console.log('Database setup complete');
  } catch (error) {
    console.error('Error setting up database:', error);
    throw error;
  }
};

// Fetch beers from API
export const fetchBeersFromAPI = async (): Promise<any[]> => {
  try {
    const response = await fetch('https://fsbs.beerknurd.com/bk-store-json.php?sid=13879');
    const data = await response.json();
    
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

// Insert beers into database
export const populateBeersTable = async (beers: any[]): Promise<void> => {
  const database = await initDatabase();
  
  try {
    // Check if table is already populated
    const count = await database.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM allbeers');
    
    if (count && count.count > 0) {
      console.log(`Database already contains ${count.count} beers. Skipping import.`);
      return;
    }
    
    console.log(`Starting import of ${beers.length} beers...`);
    
    // Start a transaction for better performance
    await database.withTransactionAsync(async () => {
      // Insert each beer into the database
      for (const beer of beers) {
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
    
    console.log('Beer import complete!');
  } catch (error) {
    console.error('Error populating beer database:', error);
    throw error;
  }
};

// Initialize the database on app startup
export const initializeBeerDatabase = async (): Promise<void> => {
  try {
    await setupDatabase();
    const beers = await fetchBeersFromAPI();
    await populateBeersTable(beers);
  } catch (error) {
    console.error('Error initializing beer database:', error);
    throw error;
  }
};

// Clear database and refresh from API
export const refreshBeersFromAPI = async (): Promise<any[]> => {
  const database = await initDatabase();
  
  try {
    console.log('Clearing beer database...');
    // Delete all records from the table
    await database.runAsync('DELETE FROM allbeers');
    
    // Fetch fresh data from API
    const beers = await fetchBeersFromAPI();
    console.log(`Fetched ${beers.length} beers from API. Refreshing database...`);
    
    // Start a transaction for better performance
    await database.withTransactionAsync(async () => {
      // Insert each beer into the database
      for (const beer of beers) {
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
    
    console.log('Database refresh complete!');
    
    // Return the refreshed beers
    return await getAllBeers();
  } catch (error) {
    console.error('Error refreshing beer database:', error);
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