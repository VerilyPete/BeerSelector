/**
 * BeerRepository - Handles CRUD operations for Beer entity
 *
 * Extracted from db.ts as part of HP-1 refactoring.
 * Manages all database operations related to the allbeers table.
 */

import { Platform } from 'react-native';
import { getDatabase } from '../connection';
import { BeerWithContainerType } from '../../types/beer';
import type { NonEmptyArray } from '../../api/fetchOutcome';
import { databaseLockManager } from '../locks';
import { toContentionError, withContentionMapping } from '../errors';
import { withAtomicWrite } from '../transactions';
import { isAllBeersRow, allBeersRowToBeerWithContainerType, AllBeersRow } from '../schemaTypes';
import { EnrichmentUpdate } from '../../types/enrichment';
import { logError } from '../../utils/errorLogger';

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
   * Clears existing data and inserts fresh records in ONE exclusive
   * transaction — the batch loop paces progress logging only, and is no longer
   * a durability boundary. Skips beers without valid IDs.
   * Uses database lock to prevent concurrent operations.
   *
   * @param beers - Array of BeerWithContainerType objects to insert
   */
  async insertMany(beers: NonEmptyArray<BeerWithContainerType>): Promise<void> {
    await databaseLockManager.withDatabaseLock('BeerRepository.insertMany', () =>
      withContentionMapping('allbeers import', () => this._insertManyInternal(beers))
    );
  }

  /**
   * Insert multiple beers without acquiring a lock
   *
   * UNSAFE: This method does NOT acquire a database lock.
   * Only use when already holding a master lock (e.g., in sequential refresh).
   *
   * @param beers - Array of BeerWithContainerType objects to insert
   */
  async insertManyUnsafe(beers: NonEmptyArray<BeerWithContainerType>): Promise<void> {
    await withContentionMapping('allbeers import', () => this._insertManyInternal(beers));
  }

  /**
   * Internal implementation of beer insertion (shared by locked and unlocked variants)
   *
   * @param beers - Array of BeerWithContainerType objects to insert
   */
  private async _insertManyInternal(beers: NonEmptyArray<BeerWithContainerType>): Promise<void> {
    // Belt and braces with the NonEmptyArray signature. The type stops this at
    // compile time, but this is the destructive path — a caller that casts past
    // the type would otherwise run the DELETE and insert nothing, wiping the
    // taplist. Unlike the tasted table there is no legitimate empty state here,
    // so there is no replaceAllWithEmpty to redirect to.
    if (beers.length === 0) {
      throw new Error('Refusing to replace the taplist with an empty beer list');
    }

    const database = await getDatabase();

    console.log(`Starting import of ${beers.length} beers...`);

    // Paces progress logging ONLY. This is deliberately not a durability
    // boundary any more: the delete and every insert publish at a single
    // commit below, so no reader can observe a cleared or half-built table.
    const batchSize = 50;

    // Every query in this body must go through `txn`. Reads that escape onto
    // the `database` handle do not throw — they silently return the
    // pre-transaction snapshot — so the body is kept write-only, which makes a
    // misrouted call fail loudly instead of quietly.
    await withAtomicWrite(database, Platform.OS === 'web' ? 'web' : 'native', async txn => {
      const cleared = await txn.runAsync('DELETE FROM allbeers');
      console.log(`Cleared allbeers table (removed ${cleared.changes} rows)`);

      // Compiled ONCE and reused for every row. The whole import runs inside a
      // single exclusive transaction whose entire span is covered by the 15s
      // lock hold timeout, and blowing that timeout abandons the grant and
      // blocks every other writer until this import finishes. Recompiling the
      // same INSERT ~1200 times is the avoidable part of that budget.
      const insert = await txn.prepareAsync(
        `INSERT OR REPLACE INTO allbeers (
          id, added_date, brew_name, brewer, brewer_loc,
          brew_style, brew_container, review_count, review_rating,
          brew_description, container_type, abv,
          enrichment_confidence, enrichment_source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );

      try {
        for (let i = 0; i < beers.length; i += batchSize) {
          const batch = beers.slice(i, i + batchSize);

          for (const beer of batch) {
            if (!beer.id) continue; // Skip entries without an ID

            await insert.executeAsync([
              beer.id,
              beer.added_date || '',
              beer.brew_name || '',
              beer.brewer || '',
              beer.brewer_loc || '',
              beer.brew_style || '',
              beer.brew_container || '',
              beer.review_count || '',
              beer.review_rating || '',
              beer.brew_description || '',
              beer.container_type,
              beer.abv ?? null,
              beer.enrichment_confidence ?? null,
              beer.enrichment_source ?? null,
            ]);
          }

          // Log progress for larger batches
          if ((i + batchSize) % 200 === 0 || i + batchSize >= beers.length) {
            console.log(
              `Imported ${Math.min(i + batchSize, beers.length)} of ${beers.length} beers...`
            );
          }
        }
      } finally {
        // Runs on the failure path too: a statement left unfinalized inside a
        // rolled-back transaction leaks a native handle.
        //
        // Its own failure must never propagate. If the body threw A and this
        // threw B, JS discards A and B wins — so a `database is locked` abort
        // would reach withContentionMapping as a finalize error instead,
        // fail the `database is locked` substring test, and be reported to the
        // user as a hard UNKNOWN_ERROR. That is exactly the misclassification
        // the typed contention error exists to prevent.
        try {
          await insert.finalizeAsync();
        } catch (finalizeError) {
          console.error('[BeerRepository] failed to finalize the insert statement', finalizeError);
        }
      }
    });

    // Verify final row count — deliberately outside the transaction, on the
    // database handle, so it reports what was actually committed.
    try {
      const after = await database.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) as count FROM allbeers'
      );
      console.log(`Beer import complete! allbeers now has ${after?.count ?? 0} rows`);
    } catch {
      console.log('Beer import complete! (row count query failed)');
    }
  }

  /**
   * How many beers the table currently holds.
   *
   * Exists for the conditional-request backstop: a 304 asserts the client
   * already has the data, and against an empty table that assertion is false.
   * Counting is the cheap way to check without materialising every row.
   *
   * `null` means "cannot tell", which is deliberately NOT the same as zero. An
   * earlier version returned 0 on failure and called that "wasteful, never
   * wrong" — it was neither. The caller responds to a zero by DISCARDING the
   * stored ETag and reporting a failure, so an unreadable count against a full
   * table threw away a valid validator and raised an error blaming the server.
   * Callers must trust a 304 when the count is unknown; only a known zero
   * contradicts it.
   *
   * @returns The row count, or null if it cannot be read
   */
  async count(): Promise<number | null> {
    const database = await getDatabase();

    try {
      const row = await database.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) as count FROM allbeers'
      );
      return row?.count ?? null;
    } catch (error) {
      logError(error, { operation: 'count', component: 'BeerRepository' });
      return null;
    }
  }

  /**
   * Get all beers from the database
   *
   * Filters out beers with null or empty brew_name.
   * Orders by added_date DESC.
   * Validates all rows with type guards and filters out invalid data.
   *
   * @returns Array of BeerWithContainerType objects
   */
  async getAll(): Promise<BeerWithContainerType[]> {
    const database = await getDatabase();

    try {
      const rows = await database.getAllAsync<AllBeersRow>(
        'SELECT * FROM allbeers WHERE brew_name IS NOT NULL AND brew_name != "" ORDER BY added_date DESC'
      );

      // Validate and convert each row
      return rows
        .filter(row => isAllBeersRow(row))
        .map(row => allBeersRowToBeerWithContainerType(row));
    } catch (error) {
      console.error('Error getting beers from database:', error);
      throw error;
    }
  }

  /**
   * Get a beer by its ID
   *
   * Validates the result with type guards before returning.
   *
   * @param id - The beer ID to search for
   * @returns BeerWithContainerType object if found and valid, null otherwise
   */
  async getById(id: string): Promise<BeerWithContainerType | null> {
    const database = await getDatabase();

    try {
      const row = await database.getFirstAsync<AllBeersRow>('SELECT * FROM allbeers WHERE id = ?', [
        id,
      ]);

      // Validate and convert the row
      if (row && isAllBeersRow(row)) {
        return allBeersRowToBeerWithContainerType(row);
      }

      return null;
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
   * Validates all rows with type guards and filters out invalid data.
   *
   * @param query - Search query string
   * @returns Array of matching BeerWithContainerType objects
   */
  async search(query: string): Promise<BeerWithContainerType[]> {
    if (!query.trim()) {
      return this.getAll();
    }

    const database = await getDatabase();
    const searchTerm = `%${query.trim()}%`;

    try {
      const rows = await database.getAllAsync<AllBeersRow>(
        `SELECT * FROM allbeers
         WHERE brew_name IS NOT NULL AND brew_name != "" AND
         (brew_name LIKE ?
         OR brewer LIKE ?
         OR brew_style LIKE ?
         OR brew_description LIKE ?)
         ORDER BY added_date DESC`,
        [searchTerm, searchTerm, searchTerm, searchTerm]
      );

      // Validate and convert each row
      return rows
        .filter(row => isAllBeersRow(row))
        .map(row => allBeersRowToBeerWithContainerType(row));
    } catch (error) {
      console.error('Error searching beers:', error);
      throw error;
    }
  }

  /**
   * Get beers by style
   *
   * Validates all rows with type guards and filters out invalid data.
   *
   * @param style - Beer style to filter by
   * @returns Array of BeerWithContainerType objects matching the style
   */
  async getByStyle(style: string): Promise<BeerWithContainerType[]> {
    const database = await getDatabase();

    try {
      const rows = await database.getAllAsync<AllBeersRow>(
        'SELECT * FROM allbeers WHERE brew_name IS NOT NULL AND brew_name != "" AND brew_style = ? ORDER BY added_date DESC',
        [style]
      );

      // Validate and convert each row
      return rows
        .filter(row => isAllBeersRow(row))
        .map(row => allBeersRowToBeerWithContainerType(row));
    } catch (error) {
      console.error('Error getting beers by style:', error);
      throw error;
    }
  }

  /**
   * Get beers by brewer
   *
   * Validates all rows with type guards and filters out invalid data.
   *
   * @param brewer - Brewer name to filter by
   * @returns Array of BeerWithContainerType objects from the specified brewer
   */
  async getByBrewer(brewer: string): Promise<BeerWithContainerType[]> {
    const database = await getDatabase();

    try {
      const rows = await database.getAllAsync<AllBeersRow>(
        'SELECT * FROM allbeers WHERE brew_name IS NOT NULL AND brew_name != "" AND brewer = ? ORDER BY added_date DESC',
        [brewer]
      );

      // Validate and convert each row
      return rows
        .filter(row => isAllBeersRow(row))
        .map(row => allBeersRowToBeerWithContainerType(row));
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
   * Validates all rows with type guards and filters out invalid data.
   *
   * @returns Array of untasted BeerWithContainerType objects
   */
  async getUntasted(): Promise<BeerWithContainerType[]> {
    const database = await getDatabase();

    try {
      const rows = await database.getAllAsync<AllBeersRow>(`
        SELECT * FROM allbeers
        WHERE brew_name IS NOT NULL
        AND brew_name != ""
        AND id NOT IN (SELECT id FROM tasted_brew_current_round)
        ORDER BY added_date DESC
      `);

      // Validate and convert each row
      return rows
        .filter(row => isAllBeersRow(row))
        .map(row => allBeersRowToBeerWithContainerType(row));
    } catch (error) {
      console.error('Error getting beers not in My Beers:', error);
      throw error;
    }
  }

  /**
   * Update enrichment data for existing beers without deleting/re-inserting.
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

    return databaseLockManager.withDatabaseLock('BeerRepository.updateEnrichmentData', async () => {
      try {
        const database = await getDatabase();
        let updatedCount = 0;

        await database.withTransactionAsync(async () => {
          const stmt = await database.prepareAsync(
            `UPDATE allbeers SET
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

        console.log(`[BeerRepository] Updated enrichment for ${updatedCount} beers`);
        return updatedCount;
      } catch (error) {
        throw toContentionError('allbeers enrichment update', error);
      }
    });
  }

  /**
   * Clear all beers from the table
   *
   * Used for testing or resetting the app to first-run state.
   */
  async clear(): Promise<void> {
    const database = await getDatabase();

    try {
      await database.withTransactionAsync(async () => {
        const before = await database.getFirstAsync<{ count: number }>(
          'SELECT COUNT(*) as count FROM allbeers'
        );
        await database.runAsync('DELETE FROM allbeers');
        const after = await database.getFirstAsync<{ count: number }>(
          'SELECT COUNT(*) as count FROM allbeers'
        );
        console.log(
          `DB: Successfully cleared allbeers table (removed ${before?.count ?? 0} rows, now ${after?.count ?? 0})`
        );
      });
    } catch (error) {
      console.error('Error clearing all beers:', error);
      throw toContentionError('allbeers clear', error);
    }
  }
}

/**
 * Singleton instance for backwards compatibility
 * Existing code can import and use this instance directly
 */
export const beerRepository = new BeerRepository();
