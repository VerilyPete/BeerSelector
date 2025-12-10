import { SQLiteDatabase } from 'expo-sqlite';
import { getContainerType } from '../../utils/beerGlassType';
import { recordMigration } from '../schemaVersion';
import { databaseLockManager } from '../DatabaseLockManager';

/**
 * Progress callback for migration
 */
export type MigrationProgressCallback = (current: number, total: number) => void;

/**
 * Migration to version 5: Add flight container type detection
 *
 * Changes:
 * - Recalculate container types to detect flights
 * - Flights are identified by "flight" in brew_name or brew_style = "Flight"
 *
 * Note: This migration only updates beers where container_type is currently NULL
 * and the beer matches flight detection criteria.
 */
export async function migrateToVersion5(
  database: SQLiteDatabase,
  onProgress?: MigrationProgressCallback
): Promise<void> {
  console.log('Starting migration to schema version 5...');

  // Acquire master lock to prevent concurrent data operations
  const lockId = 'schema-migration-v5';
  await databaseLockManager.acquireLock(lockId);

  try {
    await database.withTransactionAsync(async () => {
      console.log('Recalculating container types for flight beers...');

      // Recalculate container types for flight beers
      await recalculateFlightContainerTypes(database, 'allbeers', onProgress);
      await recalculateFlightContainerTypes(database, 'tasted_brew_current_round', onProgress);

      // Record migration
      await recordMigration(database, 5);

      console.log('Migration to version 5 complete');
    });
  } finally {
    databaseLockManager.releaseLock(lockId);
  }
}

/**
 * Recalculate container types for flight beers in a table
 * Only updates rows where:
 * - brew_name contains "flight" (case insensitive) OR brew_style = "flight"
 * - AND container_type is currently NULL
 */
async function recalculateFlightContainerTypes(
  database: SQLiteDatabase,
  tableName: string,
  onProgress?: MigrationProgressCallback
): Promise<void> {
  // Get all beers that might be flights and have null container_type
  const beers = await database.getAllAsync<{
    id: string;
    brew_name: string | null;
    brew_container: string | null;
    brew_description: string | null;
    brew_style: string | null;
    container_type: string | null;
  }>(
    `SELECT id, brew_name, brew_container, brew_description, brew_style, container_type
     FROM ${tableName}
     WHERE (brew_name LIKE '%flight%' OR LOWER(brew_style) = 'flight')
       AND container_type IS NULL`
  );

  const total = beers.length;
  console.log(`Found ${total} potential flight beers in ${tableName}`);

  if (total === 0) return;

  // Calculate container types in memory using updated getContainerType with brew_name
  const updates = beers
    .map(beer => ({
      id: beer.id,
      containerType: getContainerType(
        beer.brew_container ?? undefined,
        beer.brew_description ?? undefined,
        beer.brew_style ?? undefined,
        beer.brew_name ?? undefined
      ),
    }))
    .filter(u => u.containerType === 'flight'); // Only update if detected as flight

  console.log(`Updating ${updates.length} beers in ${tableName} with flight container type`);

  if (updates.length === 0) return;

  // Use SQL CASE statement for bulk update (faster than individual UPDATEs)
  const batchSize = 100;
  let processed = 0;

  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, i + batchSize);

    // Build CASE statement
    const caseStatements = batch.map(() => `WHEN id = ? THEN ?`).join(' ');

    // Flatten parameters: [id1, containerType1, id2, containerType2, ...]
    const params: (string | null)[] = [];
    batch.forEach(u => {
      params.push(u.id, u.containerType);
    });

    // Add IDs for WHERE clause
    const ids = batch.map(u => u.id);
    params.push(...ids);

    // Execute bulk update
    await database.runAsync(
      `UPDATE ${tableName}
       SET container_type = CASE
         ${caseStatements}
         ELSE container_type
       END
       WHERE id IN (${ids.map(() => '?').join(',')})`,
      params
    );

    processed += batch.length;
    console.log(`Updated ${processed}/${updates.length} flight beers in ${tableName}`);

    if (onProgress) {
      onProgress(processed, updates.length);
    }
  }

  console.log(`Finished updating flight container types in ${tableName}`);
}
