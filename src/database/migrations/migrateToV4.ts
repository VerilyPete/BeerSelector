import { SQLiteDatabase } from 'expo-sqlite';
import { getContainerType } from '../../utils/beerGlassType';
import { recordMigration } from '../schemaVersion';
import { databaseLockManager } from '../DatabaseLockManager';

/**
 * Progress callback for migration
 */
export type MigrationProgressCallback = (current: number, total: number) => void;

/**
 * Migration to version 4: Rename glass_type to container_type
 *
 * Changes:
 * - Rename glass_type column to container_type in allbeers table
 * - Rename glass_type column to container_type in tasted_brew_current_round table
 * - Recalculate container types to include can/bottle detection
 *
 * Note: SQLite 3.25+ required for ALTER TABLE RENAME COLUMN
 * expo-sqlite 16.0.x includes SQLite 3.45+
 */
export async function migrateToVersion4(
  database: SQLiteDatabase,
  onProgress?: MigrationProgressCallback
): Promise<void> {
  console.log('Starting migration to schema version 4...');

  // Acquire master lock to prevent concurrent data operations
  const lockId = 'schema-migration-v4';
  await databaseLockManager.acquireLock(lockId);

  try {
    await database.withTransactionAsync(async () => {
      // Rename glass_type column to container_type in allbeers table
      console.log('Renaming glass_type to container_type in allbeers...');
      await database.execAsync(`
        ALTER TABLE allbeers RENAME COLUMN glass_type TO container_type;
      `);

      // Rename glass_type column to container_type in tasted_brew_current_round table
      console.log('Renaming glass_type to container_type in tasted_brew_current_round...');
      await database.execAsync(`
        ALTER TABLE tasted_brew_current_round RENAME COLUMN glass_type TO container_type;
      `);

      console.log('Recalculating container types for can/bottle beers...');

      // Recalculate container types for all beers
      // This is needed to detect can/bottle containers that were previously null
      await recalculateContainerTypes(database, 'allbeers', onProgress);
      await recalculateContainerTypes(database, 'tasted_brew_current_round', onProgress);

      // Record migration
      await recordMigration(database, 4);

      console.log('Migration to version 4 complete');
    });
  } finally {
    databaseLockManager.releaseLock(lockId);
  }
}

/**
 * Recalculate container types for a table
 * Only updates rows where container_type is null but should have can/bottle
 */
async function recalculateContainerTypes(
  database: SQLiteDatabase,
  tableName: string,
  onProgress?: MigrationProgressCallback
): Promise<void> {
  // Get all beers where container_type might need updating
  // (beers with can/bottle in brew_container that currently have null container_type)
  const beers = await database.getAllAsync<{
    id: string;
    brew_container: string | null;
    brew_description: string | null;
    brew_style: string | null;
    container_type: string | null;
  }>(
    `SELECT id, brew_container, brew_description, brew_style, container_type
     FROM ${tableName}
     WHERE (brew_container LIKE '%can%' OR brew_container LIKE '%bottle%')
       AND container_type IS NULL`
  );

  const total = beers.length;
  console.log(`Found ${total} beers in ${tableName} that may need can/bottle container type`);

  if (total === 0) return;

  // Calculate container types in memory
  const updates = beers
    .map(beer => ({
      id: beer.id,
      containerType: getContainerType(
        beer.brew_container ?? undefined,
        beer.brew_description ?? undefined,
        beer.brew_style ?? undefined
      ),
    }))
    .filter(u => u.containerType !== null); // Only update if we have a value

  console.log(`Updating ${updates.length} beers in ${tableName} with container type`);

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
    console.log(`Updated ${processed}/${updates.length} beers in ${tableName}`);

    if (onProgress) {
      onProgress(processed, updates.length);
    }
  }

  console.log(`Finished updating container types in ${tableName}`);
}
