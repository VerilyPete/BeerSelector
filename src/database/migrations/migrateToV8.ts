import { SQLiteDatabase } from 'expo-sqlite';
import { recordMigration } from '../schemaVersion';
import { databaseLockManager } from '../DatabaseLockManager';

/**
 * Migration to version 8: Purge the `auth_cookies` preference
 *
 * CANONICAL STATEMENT of why this migration exists. `LoginWebView.tsx` and
 * `LoginWebView.test.tsx` point here rather than restating it. They used to
 * restate it, and all three copies carried the same false sentence — see the
 * history note below. That is what the duplication cost.
 *
 * `LoginWebView` used to write the member login's whole cookie jar — bearer
 * session cookies such as `PHPSESSID` included — into the ordinary
 * `preferences` table as a JSON string. That table is plain SQLite: readable
 * from an unencrypted device backup, from a filesystem extraction, and from
 * anything that can open `beers.db`. The same session is also stored in
 * SecureStore by `saveSessionData`, so at the point the write was removed
 * nothing in the tree needed the row. That is the whole justification, and it
 * is a claim about the tree as it stands, not about its history.
 *
 * HISTORY, corrected. The removal commit (`a3254636`) and the three comments it
 * touched all asserted "there has never been a `getPreference('auth_cookies')`
 * call site". That is false, and it was arrived at by grepping the current tree
 * and then stating the result as a fact about all history:
 *
 *   - `authService.autoLogin` read it directly — `const authCookiesStr = await
 *     getPreference('auth_cookies')` — and passed the parsed jar to
 *     `handleTapThatAppLogin`. It was the ONLY input to auto-login. Added in
 *     `6dabf2b9`, removed in `e727cf0c`.
 *   - `app/settings.tsx` rendered the value on screen in a debug panel, via
 *     `getAllPreferences`, until `dc7a02f9` removed that panel.
 *
 * The inference was also unsound where its premise held: `getPreference` is not
 * the only way to read a preference. `getAllPreferences` returns every row, and
 * that is exactly the path the settings panel used. "No `getPreference` call
 * site" therefore never established "no reader", then or now.
 *
 * `a3254636`'s message is pushed and cannot be rewritten; this note is the
 * correction of record. The migration itself was never in question — both
 * readers predate the removal by a year, and neither exists today.
 *
 * WHAT THIS DELETE DOES AND DOES NOT GUARANTEE. It unlinks the row: no query
 * returns the credential afterwards, which is what closes off every reader
 * reachable through the app. It does not erase the bytes. `PRAGMA
 * secure_delete` is not set anywhere in this codebase, so SQLite frees the page
 * space without overwriting it; `connection.ts:25` enables WAL, so the
 * pre-delete page image can also persist in `beers.db-wal` until a checkpoint;
 * and nothing runs `VACUUM`. Until those pages are reused, a reader of the RAW
 * FILE can still recover the value — and a raw-file reader is precisely the
 * threat model named above. So this narrows the exposure from "any SQL query"
 * to "forensic recovery of freed pages, until reuse", and the honest word for
 * the credential afterwards is unlinked, not gone. Closing the remainder would
 * mean `secure_delete` plus a `VACUUM`, which is a behaviour change with its
 * own cost and is deliberately not done here.
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
