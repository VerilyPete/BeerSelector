import { SQLiteDatabase } from 'expo-sqlite';
import { recordMigration } from '../schemaVersion';
import { databaseLockManager } from '../DatabaseLockManager';

/**
 * Progress callback for migration (optional)
 */
export type MigrationProgressCallback = (current: number, total: number) => void;

/**
 * Migration to version 7: Add enrichment columns to beer tables
 *
 * Adds columns to store enrichment data from the Cloudflare Worker:
 * - enrichment_confidence: REAL (0.0 to 1.0, nullable)
 * - enrichment_source: TEXT ('perplexity', 'manual', or NULL)
 *
 * Note: is_enrichment_verified is NOT added - we track this via enrichment_source='manual'
 *
 * Changes to both allbeers and tasted_brew_current_round tables to store
 * enrichment data consistently across all beer records.
 */
export async function migrateToVersion7(
  database: SQLiteDatabase,
  onProgress?: MigrationProgressCallback
): Promise<void> {
  console.log('[Migration v7] Starting migration to schema version 7...');

  // Acquire master lock to prevent concurrent data operations
  const lockId = 'schema-migration-v7';
  await databaseLockManager.acquireLock(lockId);

  try {
    // =========================================================================
    // IMPORTANT: All PRAGMA queries MUST be outside the transaction
    // PRAGMA statements don't work correctly inside transactions in SQLite
    // =========================================================================

    // Check if columns already exist in allbeers (for safety/idempotency)
    const tableInfo = await database.getAllAsync<{ name: string }>('PRAGMA table_info(allbeers)');
    const existingColumns = new Set(tableInfo.map(col => col.name));
    console.log('[Migration v7] Current allbeers columns:', Array.from(existingColumns));

    // Check if columns already exist in tasted_brew_current_round
    const tastedTableInfo = await database.getAllAsync<{ name: string }>(
      'PRAGMA table_info(tasted_brew_current_round)'
    );
    const tastedColumns = new Set(tastedTableInfo.map(col => col.name));
    console.log(
      '[Migration v7] Current tasted_brew_current_round columns:',
      Array.from(tastedColumns)
    );

    // =========================================================================
    // Now run the actual migration inside a transaction
    // =========================================================================
    await database.withTransactionAsync(async () => {
      // Add enrichment_confidence column to allbeers if not exists
      if (!existingColumns.has('enrichment_confidence')) {
        console.log('[Migration v7] Adding enrichment_confidence column to allbeers...');
        await database.execAsync(
          'ALTER TABLE allbeers ADD COLUMN enrichment_confidence REAL DEFAULT NULL'
        );
        console.log('[Migration v7] Added enrichment_confidence column');
      } else {
        console.log('[Migration v7] enrichment_confidence column already exists, skipping');
      }

      // Add enrichment_source column to allbeers if not exists
      if (!existingColumns.has('enrichment_source')) {
        console.log('[Migration v7] Adding enrichment_source column to allbeers...');
        await database.execAsync(
          'ALTER TABLE allbeers ADD COLUMN enrichment_source TEXT DEFAULT NULL'
        );
        console.log('[Migration v7] Added enrichment_source column');
      } else {
        console.log('[Migration v7] enrichment_source column already exists, skipping');
      }

      // Add enrichment_confidence column to tasted_brew_current_round if not exists
      if (!tastedColumns.has('enrichment_confidence')) {
        console.log(
          '[Migration v7] Adding enrichment_confidence column to tasted_brew_current_round...'
        );
        await database.execAsync(
          'ALTER TABLE tasted_brew_current_round ADD COLUMN enrichment_confidence REAL DEFAULT NULL'
        );
      }

      // Add enrichment_source column to tasted_brew_current_round if not exists
      if (!tastedColumns.has('enrichment_source')) {
        console.log(
          '[Migration v7] Adding enrichment_source column to tasted_brew_current_round...'
        );
        await database.execAsync(
          'ALTER TABLE tasted_brew_current_round ADD COLUMN enrichment_source TEXT DEFAULT NULL'
        );
      }

      // Record migration
      await recordMigration(database, 7);

      console.log('[Migration v7] Migration to version 7 complete');
    });

    // Call progress callback if provided (for UI feedback)
    if (onProgress) {
      onProgress(1, 1);
    }
  } finally {
    databaseLockManager.releaseLock(lockId);
  }
}
