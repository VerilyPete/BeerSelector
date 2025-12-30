import { SQLiteDatabase } from 'expo-sqlite';
import { getGlassType } from '@/src/utils/beerGlassType';
import { recordMigration } from '../schemaVersion';
import { databaseLockManager } from '../DatabaseLockManager';

/**
 * Progress callback for migration
 */
export type MigrationProgressCallback = (current: number, total: number) => void;

/**
 * Database row type for beer tables
 */
interface BeerRow {
  id: string;
  brew_container: string | null;
  brew_description: string | null;
  brew_style: string | null;
  glass_type?: string | null;
}

/**
 * Migration to version 3: Add glass_type column
 *
 * Changes:
 * - Add glass_type column to allbeers table
 * - Add glass_type column to tasted_brew_current_round table
 * - Backfill glass types for existing beers
 *
 * Note: SQLite 3.35+ required for ALTER TABLE ADD COLUMN
 * expo-sqlite 15.1.4 includes SQLite 3.45+ ✅
 */
export async function migrateToVersion3(
  database: SQLiteDatabase,
  onProgress?: MigrationProgressCallback
): Promise<void> {
  console.log('Starting migration to schema version 3...');

  // Acquire master lock to prevent concurrent data operations
  const lockId = 'schema-migration-v3';
  await databaseLockManager.acquireLock(lockId);

  try {
    await database.withTransactionAsync(async () => {
      // Add glass_type column to allbeers table
      console.log('Adding glass_type column to allbeers...');
      await database.execAsync(`
        ALTER TABLE allbeers ADD COLUMN glass_type TEXT;
      `);

      // Add glass_type column to tasted_brew_current_round table
      console.log('Adding glass_type column to tasted_brew_current_round...');
      await database.execAsync(`
        ALTER TABLE tasted_brew_current_round ADD COLUMN glass_type TEXT;
      `);

      console.log('✅ Added glass_type columns');

      // Backfill glass types for existing beers
      await backfillGlassTypes(database, onProgress);

      // Record migration
      await recordMigration(database, 3);

      console.log('✅ Migration to version 3 complete');
    });
  } finally {
    databaseLockManager.releaseLock(lockId);
  }
}

/**
 * Backfill glass types for existing database records
 * Called during schema migration
 * Uses optimized bulk update with SQL CASE statements
 */
async function backfillGlassTypes(
  database: SQLiteDatabase,
  onProgress?: MigrationProgressCallback
): Promise<void> {
  console.log('Backfilling glass types for existing beers...');

  // Process allbeers table
  await backfillTable(database, 'allbeers', onProgress);

  // Process tasted_brew_current_round table
  await backfillTable(database, 'tasted_brew_current_round', onProgress);

  console.log('✅ Glass type backfill complete');
}

/**
 * Backfill a specific table with optimized batch updates
 */
async function backfillTable(
  database: SQLiteDatabase,
  tableName: string,
  onProgress?: MigrationProgressCallback
): Promise<void> {
  // Get all beers without glass_type
  const beers = await database.getAllAsync<BeerRow>(
    `SELECT * FROM ${tableName} WHERE glass_type IS NULL`
  );

  const total = beers.length;
  console.log(`Found ${total} beers in ${tableName} to process`);

  if (total === 0) return;

  // Calculate glass types in memory (fast)
  const updates = beers.map(beer => {
    const glassType = getGlassType(
      beer.brew_container ?? undefined,
      beer.brew_description ?? undefined,
      beer.brew_style ?? undefined
    );
    return {
      id: beer.id,
      glassType: glassType === null ? undefined : glassType,
    };
  });

  // Use SQL CASE statement for bulk update (10-20x faster than individual UPDATEs)
  // Process in batches to avoid SQLite expression tree limits
  // Note: No transaction here - caller (migrateToV3) already has one
  const batchSize = 100;
  let processed = 0;

  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, i + batchSize);

    // Build CASE statement
    const caseStatements = batch.map(_u => `WHEN id = ? THEN ?`).join(' ');

    // Flatten parameters: [id1, glassType1, id2, glassType2, ...]
    const params: (string | null)[] = [];
    batch.forEach(u => {
      params.push(u.id, u.glassType ?? null);
    });

    // Add IDs for WHERE clause
    const ids = batch.map(u => u.id);
    params.push(...ids);

    // Execute bulk update
    await database.runAsync(
      `UPDATE ${tableName}
       SET glass_type = CASE
         ${caseStatements}
         ELSE glass_type
       END
       WHERE id IN (${ids.map(() => '?').join(',')})`,
      params
    );

    processed += batch.length;
    console.log(`Processed ${processed}/${total} beers in ${tableName}`);

    if (onProgress) {
      onProgress(processed, total);
    }
  }

  console.log(`✅ Backfilled ${total} beers in ${tableName}`);
}
