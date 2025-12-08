import { SQLiteDatabase } from 'expo-sqlite';
import { extractABV } from '../../utils/beerGlassType';
import { recordMigration } from '../schemaVersion';
import { databaseLockManager } from '../DatabaseLockManager';

/**
 * Progress callback for migration
 */
export type MigrationProgressCallback = (current: number, total: number) => void;

/**
 * Migration to version 6: Add ABV column to beer tables
 *
 * Changes:
 * - Add abv REAL column to allbeers table
 * - Add abv REAL column to tasted_brew_current_round table
 * - Extract ABV from existing brew_description fields
 * - Update all rows with extracted ABV values
 */
export async function migrateToVersion6(
  database: SQLiteDatabase,
  onProgress?: MigrationProgressCallback
): Promise<void> {
  console.log('Starting migration to schema version 6...');

  // Acquire master lock to prevent concurrent data operations
  const lockId = 'schema-migration-v6';
  await databaseLockManager.acquireLock(lockId);

  try {
    await database.withTransactionAsync(async () => {
      console.log('Adding abv column to allbeers and tasted_brew_current_round tables...');

      // Add abv column to allbeers table
      await database.execAsync('ALTER TABLE allbeers ADD COLUMN abv REAL');
      console.log('Added abv column to allbeers table');

      // Add abv column to tasted_brew_current_round table
      await database.execAsync('ALTER TABLE tasted_brew_current_round ADD COLUMN abv REAL');
      console.log('Added abv column to tasted_brew_current_round table');

      // Extract and update ABV values for both tables
      await extractAndUpdateABV(database, 'allbeers', onProgress);
      await extractAndUpdateABV(database, 'tasted_brew_current_round', onProgress);

      // Record migration
      await recordMigration(database, 6);

      console.log('Migration to version 6 complete');
    });
  } finally {
    databaseLockManager.releaseLock(lockId);
  }
}

/**
 * Extract ABV from brew_description and update abv column for all rows in a table
 */
async function extractAndUpdateABV(
  database: SQLiteDatabase,
  tableName: string,
  onProgress?: MigrationProgressCallback
): Promise<void> {
  // Get all beers with id and brew_description
  const beers = await database.getAllAsync<{
    id: string;
    brew_description: string | null;
  }>(`SELECT id, brew_description FROM ${tableName}`);

  const total = beers.length;
  console.log(`Extracting ABV for ${total} beers in ${tableName}`);

  if (total === 0) return;

  // Calculate ABV values in memory using extractABV utility
  const updates = beers.map(beer => ({
    id: beer.id,
    abv: extractABV(beer.brew_description ?? undefined),
  }));

  console.log(`Updating ${total} beers in ${tableName} with extracted ABV values`);

  // Use SQL CASE statement for bulk update (faster than individual UPDATEs)
  const batchSize = 100;
  let processed = 0;

  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, i + batchSize);

    // Build CASE statement
    const caseStatements = batch.map(() => `WHEN id = ? THEN ?`).join(' ');

    // Flatten parameters: [id1, abv1, id2, abv2, ...]
    const params: (string | number | null)[] = [];
    batch.forEach(u => {
      params.push(u.id, u.abv);
    });

    // Add IDs for WHERE clause
    const ids = batch.map(u => u.id);
    params.push(...ids);

    // Execute bulk update
    await database.runAsync(
      `UPDATE ${tableName}
       SET abv = CASE
         ${caseStatements}
         ELSE abv
       END
       WHERE id IN (${ids.map(() => '?').join(',')})`,
      params
    );

    processed += batch.length;
    console.log(`Updated ${processed}/${total} beers in ${tableName}`);

    if (onProgress) {
      onProgress(processed, total);
    }
  }

  console.log(`Finished updating ABV values in ${tableName}`);
}
