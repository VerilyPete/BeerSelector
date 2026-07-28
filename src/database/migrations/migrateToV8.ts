import { SQLiteDatabase } from 'expo-sqlite';
import { recordMigration } from '../schemaVersion';
import { databaseLockManager } from '../DatabaseLockManager';

/**
 * Migration to version 8: Purge the `auth_cookies` preference
 *
 * `LoginWebView` used to write the member login's whole cookie jar — bearer
 * session cookies such as `PHPSESSID` included — into the ordinary
 * `preferences` table as a JSON string. That table is plain SQLite: readable
 * from an unencrypted device backup, from a filesystem extraction, and from
 * anything that can open `beers.db`. The same session was already being stored
 * in SecureStore by `saveSessionData`, and no `getPreference('auth_cookies')`
 * call site ever existed, so the row was exposure with no compensating reader.
 *
 * Removing the write stops new rows appearing. It does nothing about devices
 * that already hold one — those rows survive app upgrade, and a stale session
 * cookie is still a credential. This migration is what actually deletes them.
 *
 * Idempotent: a DELETE that matches nothing is a success. Do not add a
 * row-count check that throws — a device that never completed a member login
 * has no such row, and failing there would strand its schema below 8 and
 * re-run this on every launch.
 */
export async function migrateToVersion8(database: SQLiteDatabase): Promise<void> {
  console.log('[Migration v8] Starting migration to schema version 8...');

  await databaseLockManager.withDatabaseLock('schema-migration-v8', async () => {
    await database.withTransactionAsync(async () => {
      // Parameterised rather than inlined, in keeping with every other write in
      // this codebase — the key is a literal here, but the habit is what stops
      // the next one being interpolated.
      await database.runAsync('DELETE FROM preferences WHERE key = ?', ['auth_cookies']);

      // Deliberately not logged with a row count. The count would say whether
      // this device had a session cookie exposed, which is not a fact worth
      // writing to a log that outlives the row.
      console.log('[Migration v8] Purged auth_cookies preference if present');

      await recordMigration(database, 8);
    });
  });

  console.log('[Migration v8] Migration to version 8 complete');
}
