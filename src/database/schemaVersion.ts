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
 * Which does not merely waste time. `setupTables` takes the pre-versioned
 * branch and calls `runMigrations(database, 2)`, which starts at
 * `migrateToVersion3`; on an already-migrated database the `ALTER TABLE ... ADD
 * COLUMN glass_type` succeeds, because `migrateToVersion4` renamed that column
 * and freed the name. It then throws at `recordMigration(database, 3)` on the
 * `INTEGER PRIMARY KEY`, inside `withTransactionAsync`, so it rolls back
 * cleanly. The retry in `_layout.tsx` does run — this happens inside
 * `setupDatabase()`, so `dbInitialized` is still false — but it cannot help:
 * `resetDatabaseState()` clears in-process state only, so the second attempt
 * meets identical on-disk state and fails identically.
 *
 * (An earlier version of this comment said migration 7 and
 * `recordMigration(database, 7)`, and that the retry "never touches the
 * database". Both were wrong: it borrowed 9.2's mechanism, which concerns a
 * device entering at version 7, and applied it to a replay that enters at 2.
 * Corrected after review.)
 *
 * A caveat this comment owes the reader, also from review: at the `setupTables`
 * call site the catch below is very nearly unreachable, because
 * `CREATE TABLE IF NOT EXISTS schema_version` runs immediately before the read,
 * and a fresh install gets 0 from `SELECT MAX(version)` over an empty table
 * (`{version: null}` → `?? 0`) rather than from the catch. The narrowing still
 * earns its place — it is what stops a locked or corrupt database being read as
 * "no migrations applied" — but it guards a narrower door than it first appears
 * to.
 *
 * The other caller, `runStartupMigrationCheck`, deliberately contains the throw
 * rather than propagating it. See that module for why the two call sites want
 * opposite things.
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
