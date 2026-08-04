import { SQLiteDatabase } from 'expo-sqlite';

export const CURRENT_SCHEMA_VERSION = 8;

export const CREATE_SCHEMA_VERSION_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  )
`;

/**
 * Get current schema version from database.
 *
 * Returns 0 when the `schema_version` table does not exist yet — which
 * `setupTables` reads as "decide between a fresh install and a pre-versioned
 * upgrade". Every OTHER failure propagates.
 *
 * The catch used to swallow everything under the comment "Table doesn't exist
 * yet": one reason the read can fail, written as though it were the only one. A
 * locked or corrupt database answers identically, and 0 is the single value
 * that means "this database has no migrations applied". So a transient fault
 * became a replay of all six migrations against a fully migrated database.
 *
 * Which does not merely waste time. Re-running migration 7 reaches
 * `recordMigration(database, 7)`, `version` is `INTEGER PRIMARY KEY`, and the
 * second insert fails with SQLITE_CONSTRAINT_PRIMARYKEY — so the recovery path
 * from a transient error is a throw, and one the retry in `_layout.tsx` cannot
 * clear because that retry never touches the database.
 *
 * Matched on the message because expo-sqlite surfaces no structured code here.
 * That is a weaker test than an error code and is deliberately the narrow half:
 * an unrecognised message propagates rather than being assumed benign.
 */
export async function getCurrentSchemaVersion(db: SQLiteDatabase): Promise<number> {
  try {
    const result = await db.getFirstAsync<{ version: number }>(
      'SELECT MAX(version) as version FROM schema_version'
    );
    return result?.version ?? 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/no such table/i.test(message)) {
      return 0;
    }
    throw error;
  }
}

/**
 * Record that a migration has been applied
 */
export async function recordMigration(db: SQLiteDatabase, version: number): Promise<void> {
  await db.runAsync('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)', [
    version,
    new Date().toISOString(),
  ]);
}

/**
 * Get migration history
 */
export async function getMigrationHistory(
  db: SQLiteDatabase
): Promise<{ version: number; applied_at: string }[]> {
  try {
    return await db.getAllAsync<{ version: number; applied_at: string }>(
      'SELECT version, applied_at FROM schema_version ORDER BY version ASC'
    );
  } catch {
    return [];
  }
}
