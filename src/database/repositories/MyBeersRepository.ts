/**
 * MyBeersRepository - Handles CRUD operations for tasted beers (Beerfinder) entity
 *
 * Extracted from db.ts as part of HP-1 refactoring.
 * Manages all database operations related to the tasted_brew_current_round table.
 */

import { getDatabase } from '../connection';
import { BeerfinderWithContainerType } from '../../types/beer';
import { databaseLockManager } from '../locks';
import {
  TastedBrewRow,
  TableInfo,
  ColumnInfo,
  isTastedBrewRow,
  tastedBrewRowToBeerfinderWithContainerType,
  isCountResult,
} from '../schemaTypes';

/**
 * Repository class for tasted beers (Beerfinder) operations
 *
 * Handles:
 * - Batch insertion of tasted beers with validation
 * - Clearing table for new users or round rollover
 * - Querying tasted beers by various criteria
 */
export class MyBeersRepository {
  /**
   * Insert multiple tasted beers into the database
   *
   * Special handling:
   * - Empty array clears the table (new user or round rollover at 200 beers)
   * - Filters out beers without valid IDs
   * - Processes in batches of 20
   * - Uses database lock to prevent concurrent operations
   *
   * @param beers - Array of BeerfinderWithContainerType objects to insert
   */
  async insertMany(beers: BeerfinderWithContainerType[]): Promise<void> {
    console.log(`DB: Populating My Beers table with ${beers.length} beers`);

    // Acquire database lock to prevent concurrent operations
    if (!(await databaseLockManager.acquireLock('MyBeersRepository.insertMany'))) {
      throw new Error('Could not acquire database lock for my beers insertion');
    }

    try {
      const database = await getDatabase();

      // Handle empty array as valid (clear the table for new user or round rollover)
      if (!beers || beers.length === 0) {
        console.log(
          'DB: Empty beers array - clearing tasted_brew_current_round table (new user or round rollover at 200 beers)'
        );
        await database.withTransactionAsync(async () => {
          const before = await database.getFirstAsync<{ count: number }>(
            'SELECT COUNT(*) as count FROM tasted_brew_current_round'
          );
          await database.runAsync('DELETE FROM tasted_brew_current_round');
          console.log(
            `Cleared tasted_brew_current_round table (removed ${before?.count ?? 0} rows)`
          );
        });
        return;
      }

      // Count beers with valid IDs
      const validBeers = beers.filter(beer => beer && beer.id);
      console.log(
        `DB: Found ${validBeers.length} valid beers with IDs out of ${beers.length} total beers`
      );

      if (validBeers.length === 0) {
        console.log('DB: No valid beers with IDs found, clearing table instead of throwing error');
        await database.withTransactionAsync(async () => {
          const before = await database.getFirstAsync<{ count: number }>(
            'SELECT COUNT(*) as count FROM tasted_brew_current_round'
          );
          await database.runAsync('DELETE FROM tasted_brew_current_round');
          console.log(
            `Cleared tasted_brew_current_round table (removed ${before?.count ?? 0} rows)`
          );
        });
        return;
      }

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
            console.log(
              `DB: Processing batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(validBeers.length / batchSize)} (${batch.length} beers)`
            );

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
                    brew_description, chit_code, container_type
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
                    beer.chit_code || '',
                    beer.container_type ?? null,
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
          const after = await database.getFirstAsync<{ count: number }>(
            'SELECT COUNT(*) as count FROM tasted_brew_current_round'
          );
          console.log(
            `DB: My Beers import complete! tasted_brew_current_round now has ${after?.count ?? 0} rows`
          );
        } catch (e) {
          console.log('DB: My Beers import complete! (row count query failed)');
        }
      } catch (error) {
        console.error('Error populating My Beers database:', error);
        throw error;
      }
    } catch (error) {
      console.error('Error populating My Beers database:', error);
      throw error;
    } finally {
      // Always release the lock
      databaseLockManager.releaseLock('MyBeersRepository.insertMany');
    }
  }

  /**
   * Insert multiple tasted beers WITHOUT acquiring lock (unsafe)
   *
   * WARNING: This method does NOT acquire the database lock.
   * Only call this method when you've already acquired the lock externally.
   *
   * Use case: When a parent function needs to coordinate multiple operations
   * under a single lock (e.g., fetchAndPopulateMyBeers).
   *
   * @param beers - Array of BeerfinderWithContainerType objects to insert
   */
  async insertManyUnsafe(beers: BeerfinderWithContainerType[]): Promise<void> {
    console.log(
      `DB: Populating My Beers table with ${beers.length} beers (UNSAFE - lock assumed held)`
    );

    const database = await getDatabase();

    // Handle empty array as valid (clear the table for new user or round rollover)
    if (!beers || beers.length === 0) {
      console.log(
        'DB: Empty beers array - clearing tasted_brew_current_round table (new user or round rollover at 200 beers)'
      );
      await database.withTransactionAsync(async () => {
        const before = await database.getFirstAsync<{ count: number }>(
          'SELECT COUNT(*) as count FROM tasted_brew_current_round'
        );
        await database.runAsync('DELETE FROM tasted_brew_current_round');
        console.log(`Cleared tasted_brew_current_round table (removed ${before?.count ?? 0} rows)`);
      });
      return;
    }

    // Count beers with valid IDs
    const validBeers = beers.filter(beer => beer && beer.id);
    console.log(
      `DB: Found ${validBeers.length} valid beers with IDs out of ${beers.length} total beers`
    );

    if (validBeers.length === 0) {
      console.log('DB: No valid beers with IDs found, clearing table instead of throwing error');
      await database.withTransactionAsync(async () => {
        const before = await database.getFirstAsync<{ count: number }>(
          'SELECT COUNT(*) as count FROM tasted_brew_current_round'
        );
        await database.runAsync('DELETE FROM tasted_brew_current_round');
        console.log(`Cleared tasted_brew_current_round table (removed ${before?.count ?? 0} rows)`);
      });
      return;
    }

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
          console.log(
            `DB: Processing batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(validBeers.length / batchSize)} (${batch.length} beers)`
          );

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
                  brew_description, chit_code, container_type
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
                  beer.chit_code || '',
                  beer.container_type ?? null,
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
        const after = await database.getFirstAsync<{ count: number }>(
          'SELECT COUNT(*) as count FROM tasted_brew_current_round'
        );
        console.log(
          `DB: My Beers import complete! tasted_brew_current_round now has ${after?.count ?? 0} rows`
        );
      } catch (e) {
        console.log('DB: My Beers import complete! (row count query failed)');
      }
    } catch (error) {
      console.error('Error populating My Beers database:', error);
      throw error;
    }
  }

  /**
   * Get all tasted beers from the database
   *
   * Includes debugging logic to check table structure when empty.
   * Orders by id.
   * Validates all rows with type guards and filters out invalid data.
   *
   * @returns Array of BeerfinderWithContainerType objects
   */
  async getAll(): Promise<BeerfinderWithContainerType[]> {
    const database = await getDatabase();

    try {
      console.log('DB: Executing query to get tasted beers from tasted_brew_current_round table');
      const rows = await database.getAllAsync<TastedBrewRow>(
        'SELECT * FROM tasted_brew_current_round ORDER BY id'
      );
      console.log(`DB: Retrieved ${rows.length} tasted beers from database`);

      // Validate and convert each row
      const validBeers = rows
        .filter(row => isTastedBrewRow(row))
        .map(row => tastedBrewRowToBeerfinderWithContainerType(row));

      console.log(`DB: ${validBeers.length} valid tasted beers after validation`);

      // Check if we have any beers
      if (validBeers.length === 0) {
        console.log('DB: No tasted beers found in the database. Checking table existence...');

        // Check if the table exists and has the expected structure
        const tableInfo = await database.getAllAsync<TableInfo>(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='tasted_brew_current_round'"
        );

        if (tableInfo.length === 0) {
          console.log('DB: Table tasted_brew_current_round does not exist!');
        } else {
          console.log('DB: Table tasted_brew_current_round exists. Checking column structure...');
          const columnInfo = await database.getAllAsync<ColumnInfo>(
            'PRAGMA table_info(tasted_brew_current_round)'
          );
          console.log('DB: Table structure:', JSON.stringify(columnInfo));
        }
      }

      return validBeers;
    } catch (error) {
      console.error('Error getting Beerfinder beers:', error);
      throw error;
    }
  }

  /**
   * Get a tasted beer by its ID
   *
   * Validates the result with type guards before returning.
   *
   * @param id - The beer ID to search for
   * @returns BeerfinderWithContainerType object if found and valid, null otherwise
   */
  async getById(id: string): Promise<BeerfinderWithContainerType | null> {
    const database = await getDatabase();

    try {
      const row = await database.getFirstAsync<TastedBrewRow>(
        'SELECT * FROM tasted_brew_current_round WHERE id = ?',
        [id]
      );

      // Validate and convert the row
      if (row && isTastedBrewRow(row)) {
        return tastedBrewRowToBeerfinderWithContainerType(row);
      }

      return null;
    } catch (error) {
      console.error('Error getting tasted beer by ID:', error);
      throw error;
    }
  }

  /**
   * Clear all tasted beers from the table
   *
   * Used for new users or round rollover scenarios.
   */
  async clear(): Promise<void> {
    const database = await getDatabase();

    try {
      await database.withTransactionAsync(async () => {
        const before = await database.getFirstAsync<{ count: number }>(
          'SELECT COUNT(*) as count FROM tasted_brew_current_round'
        );
        await database.runAsync('DELETE FROM tasted_brew_current_round');
        const after = await database.getFirstAsync<{ count: number }>(
          'SELECT COUNT(*) as count FROM tasted_brew_current_round'
        );
        console.log(
          `DB: Successfully cleared tasted_brew_current_round table (removed ${before?.count ?? 0} rows, now ${after?.count ?? 0})`
        );
      });
    } catch (error) {
      console.error('Error clearing tasted beers:', error);
      throw error;
    }
  }

  /**
   * Get the count of tasted beers
   *
   * Validates the count result with type guards.
   *
   * @returns Number of tasted beers in the table
   */
  async getCount(): Promise<number> {
    const database = await getDatabase();

    try {
      const result = await database.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) as count FROM tasted_brew_current_round'
      );

      // Validate the count result
      if (result && isCountResult(result)) {
        return result.count;
      }

      return 0;
    } catch (error) {
      console.error('Error getting tasted beers count:', error);
      throw error;
    }
  }
}

/**
 * Singleton instance for backwards compatibility
 * Existing code can import and use this instance directly
 */
export const myBeersRepository = new MyBeersRepository();
