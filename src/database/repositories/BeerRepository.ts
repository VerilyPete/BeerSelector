/**
 * BeerRepository - Handles CRUD operations for Beer entity
 *
 * Extracted from db.ts as part of HP-1 refactoring.
 * Manages all database operations related to the allbeers table.
 */

import { getDatabase } from '../connection';
import { Beer } from '../../types/beer';
import { databaseLockManager } from '../locks';

/**
 * Repository class for Beer entity operations
 *
 * Handles:
 * - Batch insertion of beers with transaction support
 * - Querying beers by various criteria (id, style, brewer)
 * - Searching beers across multiple fields
 * - Finding untasted beers (not in tasted_brew_current_round)
 */
export class BeerRepository {
  /**
   * Insert multiple beers into the database
   *
   * Clears existing data and inserts fresh records in batches of 50.
   * Skips beers without valid IDs.
   * Uses database lock to prevent concurrent operations.
   *
   * @param beers - Array of Beer objects to insert
   */
  async insertMany(beers: Beer[]): Promise<void> {
    // Acquire database lock to prevent concurrent operations
    if (!await databaseLockManager.acquireLock('BeerRepository.insertMany')) {
      throw new Error('Could not acquire database lock for beer insertion');
    }

    try {
      const database = await getDatabase();

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
      // Always release the lock
      databaseLockManager.releaseLock('BeerRepository.insertMany');
    }
  }

  /**
   * Get all beers from the database
   *
   * Filters out beers with null or empty brew_name.
   * Orders by added_date DESC.
   *
   * @returns Array of Beer objects
   */
  async getAll(): Promise<Beer[]> {
    const database = await getDatabase();

    try {
      return await database.getAllAsync(
        'SELECT * FROM allbeers WHERE brew_name IS NOT NULL AND brew_name != "" ORDER BY added_date DESC'
      );
    } catch (error) {
      console.error('Error getting beers from database:', error);
      throw error;
    }
  }

  /**
   * Get a beer by its ID
   *
   * @param id - The beer ID to search for
   * @returns Beer object if found, null otherwise
   */
  async getById(id: string): Promise<Beer | null> {
    const database = await getDatabase();

    try {
      return await database.getFirstAsync(
        'SELECT * FROM allbeers WHERE id = ?',
        [id]
      );
    } catch (error) {
      console.error('Error getting beer by ID:', error);
      throw error;
    }
  }

  /**
   * Search beers by name, brewer, style, or description
   *
   * If query is empty, returns all beers.
   * Uses LIKE operator for partial matching.
   *
   * @param query - Search query string
   * @returns Array of matching Beer objects
   */
  async search(query: string): Promise<Beer[]> {
    if (!query.trim()) {
      return this.getAll();
    }

    const database = await getDatabase();
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
  }

  /**
   * Get beers by style
   *
   * @param style - Beer style to filter by
   * @returns Array of Beer objects matching the style
   */
  async getByStyle(style: string): Promise<Beer[]> {
    const database = await getDatabase();

    try {
      return await database.getAllAsync(
        'SELECT * FROM allbeers WHERE brew_name IS NOT NULL AND brew_name != "" AND brew_style = ? ORDER BY added_date DESC',
        [style]
      );
    } catch (error) {
      console.error('Error getting beers by style:', error);
      throw error;
    }
  }

  /**
   * Get beers by brewer
   *
   * @param brewer - Brewer name to filter by
   * @returns Array of Beer objects from the specified brewer
   */
  async getByBrewer(brewer: string): Promise<Beer[]> {
    const database = await getDatabase();

    try {
      return await database.getAllAsync(
        'SELECT * FROM allbeers WHERE brew_name IS NOT NULL AND brew_name != "" AND brewer = ? ORDER BY added_date DESC',
        [brewer]
      );
    } catch (error) {
      console.error('Error getting beers by brewer:', error);
      throw error;
    }
  }

  /**
   * Get all beers that are not in the tasted beers list
   *
   * Returns beers from allbeers table that don't have a matching
   * ID in the tasted_brew_current_round table.
   *
   * @returns Array of untasted Beer objects
   */
  async getUntasted(): Promise<Beer[]> {
    const database = await getDatabase();

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
  }
}

/**
 * Singleton instance for backwards compatibility
 * Existing code can import and use this instance directly
 */
export const beerRepository = new BeerRepository();
