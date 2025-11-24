import { SQLiteDatabase } from 'expo-sqlite';
import { backfillGlassTypes, MigrationProgressCallback } from '../utils/glassTypeCalculator';
import { recordMigration } from '../schemaVersion';
import { databaseLockManager } from '../DatabaseLockManager';

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
