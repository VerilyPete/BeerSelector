import { SQLiteDatabase } from 'expo-sqlite';

export const CURRENT_SCHEMA_VERSION = 6;

export const CREATE_SCHEMA_VERSION_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  )
`;

/**
 * Get current schema version from database
 * Returns 0 if schema_version table doesn't exist yet
 */
export async function getCurrentSchemaVersion(db: SQLiteDatabase): Promise<number> {
  try {
    const result = await db.getFirstAsync<{ version: number }>(
      'SELECT MAX(version) as version FROM schema_version'
    );
    return result?.version ?? 0;
  } catch (error) {
    // Table doesn't exist yet
    return 0;
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
