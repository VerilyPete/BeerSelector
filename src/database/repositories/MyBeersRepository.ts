/**
 * MyBeersRepository - Handles CRUD operations for tasted beers (Beerfinder) entity
 *
 * Extracted from db.ts as part of HP-1 refactoring.
 * Manages all database operations related to the tasted_brew_current_round table.
 */

import { getDatabase } from '../connection';
import { BeerfinderWithContainerType } from '../../types/beer';
import type { NonEmptyArray } from '../../api/fetchOutcome';
import { databaseLockManager } from '../locks';
import { toContentionError, withContentionMapping, isDatabaseLockedError } from '../errors';
import {
  TastedBrewRow,
  TableInfo,
  ColumnInfo,
  isTastedBrewRow,
  tastedBrewRowToBeerfinderWithContainerType,
  isCountResult,
} from '../schemaTypes';
import { EnrichmentUpdate } from '../../types/enrichment';

/**
 * Repository class for tasted beers (Beerfinder) operations
 *
 * Handles:
 * - Batch insertion of tasted beers with validation
 * - Clearing table for new users or round rollover
 * - Querying tasted beers by various criteria
 */
/**
 * Reject a payload in which no row carries a primary key.
 *
 * This is the branch that made narrowing the type insufficient on its own: a
 * well-typed NonEmptyArray whose every row lacks an `id` passes the signature,
 * reaches the filter, and — until now — ran DELETE and returned normally. The
 * repository's own comment said it was "clearing table instead of throwing
 * error". That choice is reversed here; the caller decides what malformed data
 * means, and `FetchOutcome` gives it a `malformed` case to say so.
 */
function assertSomeRowsHaveIds(validCount: number, suppliedCount: number): void {
  if (validCount > 0) {
    return;
  }
  throw new Error(
    `Refusing to write tasted beers: all ${suppliedCount} supplied rows lack an id. ` +
      `Leaving the existing list intact — use replaceAllWithEmpty() to empty it deliberately.`
  );
}

/**
 * Records a row-level insert failure and decides whether to keep going.
 *
 * Swallowing these inside the transaction — after the DELETE has already run in
 * it — lets the transaction commit an EMPTY table while the method returns
 * normally. The caller then stamps `my_beers_last_check` and the empty tasted
 * list persists for 12 hours: the reported wrong-count symptom, reached without
 * any wipe branch being involved.
 *
 * Contention is re-thrown immediately rather than counted. A `database is
 * locked` abort says nothing about the row, and it is retryable, so collapsing
 * it into a row-count failure would lose the one distinction that matters to the
 * caller.
 */
function recordRowFailure(failures: unknown[], error: unknown): void {
  if (isDatabaseLockedError(error)) {
    throw error;
  }
  console.error('DB: Error inserting beer into tasted_brew_current_round:', error);
  failures.push(error);
}

/**
 * Throw if any row failed, naming how many of how many.
 *
 * A partial tasted list is not a useful state, so the transaction is allowed to
 * roll back and leave the previous data intact — strictly better than an empty
 * or half-populated table. The count is what makes the failure actionable: one
 * malformed row from the API reads very differently from every row failing.
 */
function assertNoRowFailures(failures: readonly unknown[], attempted: number): void {
  if (failures.length === 0) {
    return;
  }
  throw new Error(
    `Failed to insert ${failures.length} of ${attempted} tasted beers; ` +
      `rolling back rather than committing a partial list. ` +
      `First failure: ${failures[0] instanceof Error ? failures[0].message : String(failures[0])}`
  );
}

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
  async insertMany(beers: NonEmptyArray<BeerfinderWithContainerType>): Promise<void> {
    console.log(`DB: Populating My Beers table with ${beers.length} beers`);

    return databaseLockManager.withDatabaseLock('MyBeersRepository.insertMany', async () => {
      try {
        const database = await getDatabase();

        // The empty-array branch is gone: emptying the table is now
        // replaceAllWithEmpty(), asked for explicitly rather than inferred.
        const validBeers = beers.filter(beer => beer && beer.id);
        console.log(
          `DB: Found ${validBeers.length} valid beers with IDs out of ${beers.length} total beers`
        );

        assertSomeRowsHaveIds(validBeers.length, beers.length);

        console.log('DB: Database initialized for populating My Beers table');

        try {
          // Use a transaction for clearing and inserting data
          console.log('DB: Starting transaction for populating My Beers table');
          const rowFailures: unknown[] = [];
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
                    brew_description, chit_code, container_type, abv,
                    enrichment_confidence, enrichment_source
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
                      beer.abv ?? null,
                      beer.enrichment_confidence ?? null,
                      beer.enrichment_source ?? null,
                    ]
                  );
                } catch (err) {
                  recordRowFailure(rowFailures, err);
                }
              }
            }

            // Inside the transaction on purpose: throwing here rolls it back,
            // leaving the previous tasted list intact rather than committing an
            // empty or partial one.
            assertNoRowFailures(rowFailures, validBeers.length);
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
        throw toContentionError('My Beers import', error);
      }
    });
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
  /**
   * Empty the tasted table, deliberately.
   *
   * A legitimate operation — a new user, or the round rollover at 200 beers —
   * that used to be inferred from `insertMany([])`. Inferring it is what let a
   * benign empty response, a malformed one, and a genuine empty round all reach
   * the same DELETE. Now it has to be asked for.
   */
  async replaceAllWithEmpty(): Promise<void> {
    return databaseLockManager.withDatabaseLock('MyBeersRepository.replaceAllWithEmpty', () =>
      withContentionMapping('tasted beers clear', () => this._deleteAllInternal())
    );
  }

  /**
   * Unlocked twin of `replaceAllWithEmpty`, for callers already holding the
   * master lock.
   */
  async replaceAllWithEmptyUnsafe(): Promise<void> {
    return withContentionMapping('tasted beers clear', () => this._deleteAllInternal());
  }

  /**
   * Shared body for both empty variants.
   *
   * Deliberately carries NO read. The four branches this replaces each ran a
   * count-before-delete purely to make a log line more informative, and a read
   * inside a transaction is the one thing that fails silently when misrouted —
   * it returns the pre-transaction snapshot rather than throwing. `runAsync`
   * already reports `changes`, so the read buys nothing and costs a hazard.
   */
  private async _deleteAllInternal(): Promise<void> {
    const database = await getDatabase();

    await database.withTransactionAsync(async () => {
      const cleared = await database.runAsync('DELETE FROM tasted_brew_current_round');
      console.log(`Cleared tasted_brew_current_round table (removed ${cleared.changes} rows)`);
    });
  }

  async insertManyUnsafe(beers: NonEmptyArray<BeerfinderWithContainerType>): Promise<void> {
    console.log(
      `DB: Populating My Beers table with ${beers.length} beers (UNSAFE - lock assumed held)`
    );

    const database = await getDatabase();

    // Both wipe branches below sit inside withContentionMapping. They used to
    // run before the try/catch further down, so a `database is locked` abort on
    // a bare DELETE — the statement most likely to hit contention — escaped the
    // mapping entirely and reached the user as a raw UNKNOWN_ERROR. The locked
    // twin (insertMany) covers its equivalents; this one did not.
    return withContentionMapping('My Beers import', async () => {
      // The empty-array branch is gone: emptying the table is now
      // replaceAllWithEmptyUnsafe(), asked for explicitly rather than inferred.
      const validBeers = beers.filter(beer => beer && beer.id);
      console.log(
        `DB: Found ${validBeers.length} valid beers with IDs out of ${beers.length} total beers`
      );

      assertSomeRowsHaveIds(validBeers.length, beers.length);

      console.log('DB: Database initialized for populating My Beers table');

      try {
        // Use a transaction for clearing and inserting data
        console.log('DB: Starting transaction for populating My Beers table');
        const rowFailures: unknown[] = [];
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
                  brew_description, chit_code, container_type, abv,
                  enrichment_confidence, enrichment_source
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
                    beer.abv ?? null,
                    beer.enrichment_confidence ?? null,
                    beer.enrichment_source ?? null,
                  ]
                );
              } catch (err) {
                recordRowFailure(rowFailures, err);
              }
            }
          }

          // Inside the transaction on purpose: throwing here rolls it back,
          // leaving the previous tasted list intact rather than committing an
          // empty or partial one.
          assertNoRowFailures(rowFailures, validBeers.length);
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
        throw toContentionError('My Beers import', error);
      }
    });
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
      throw toContentionError('tasted beers clear', error);
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

  /**
   * Update enrichment data for existing tasted beers without deleting/re-inserting.
   *
   * This method performs partial updates to only the enrichment-related columns
   * (abv, enrichment_confidence, enrichment_source, brew_description) without
   * affecting other beer data or requiring a full table refresh.
   *
   * Uses database lock to prevent concurrent operations.
   *
   * @param enrichments - Record mapping beer IDs to their enrichment data
   * @returns Number of beers successfully updated
   */
  async updateEnrichmentData(enrichments: Record<string, EnrichmentUpdate>): Promise<number> {
    const ids = Object.keys(enrichments);
    if (ids.length === 0) return 0;

    return databaseLockManager.withDatabaseLock(
      'MyBeersRepository.updateEnrichmentData',
      async () => {
        try {
          const database = await getDatabase();
          let updatedCount = 0;

          await database.withTransactionAsync(async () => {
            const stmt = await database.prepareAsync(
              `UPDATE tasted_brew_current_round SET
            abv = COALESCE(?, abv),
            enrichment_confidence = ?,
            enrichment_source = ?,
            brew_description = COALESCE(?, brew_description)
           WHERE id = ?`
            );

            try {
              for (const [id, data] of Object.entries(enrichments)) {
                const result = await stmt.executeAsync([
                  data.enriched_abv,
                  data.enrichment_confidence ?? null,
                  data.enrichment_source ?? null,
                  data.brew_description ?? null,
                  id,
                ]);
                if (result.changes > 0) updatedCount++;
              }
            } finally {
              await stmt.finalizeAsync();
            }
          });

          console.log(`[MyBeersRepository] Updated enrichment for ${updatedCount} beers`);
          return updatedCount;
        } catch (error) {
          throw toContentionError('tasted beers enrichment update', error);
        }
      }
    );
  }
}

/**
 * Singleton instance for backwards compatibility
 * Existing code can import and use this instance directly
 */
export const myBeersRepository = new MyBeersRepository();
