import { SQLiteDatabase } from 'expo-sqlite';
import { CURRENT_SCHEMA_VERSION, getCurrentSchemaVersion } from './schemaVersion';
import { migrateToVersion3 } from './migrations/migrateToV3';

/**
 * What the startup version check concluded.
 *
 * Four outcomes rather than a boolean, because the caller has to be able to
 * distinguish "checked, nothing to do" from "could not check". Collapsing those
 * two is the defect this module exists to prevent — it is the same conflation
 * `getCurrentSchemaVersion` used to make when it returned 0 for a failed read.
 */
export type StartupMigrationOutcome =
  | { readonly status: 'up-to-date'; readonly version: number }
  | { readonly status: 'migrated'; readonly from: number }
  | { readonly status: 'version-unreadable'; readonly error: unknown }
  | { readonly status: 'migration-failed'; readonly error: unknown };

/** Receives 0-100 during a migration, then `null` when it finishes or fails. */
export type StartupMigrationProgress = (progress: number | null) => void;

/** What to show the user, or `null` to say nothing. */
export type StartupMigrationAlert = { readonly title: string; readonly message: string };

/**
 * What a person should be told about a startup migration outcome.
 *
 * A pure function, and in this module rather than in the component, because
 * mutation testing found the alternative unguarded: deleting the entire
 * `Alert.alert('Database Update Failed', …)` block from `app/_layout.tsx`
 * changed no test result anywhere in the suite. `runStartupMigrationCheck`
 * reported `migration-failed` faithfully and nothing checked that the caller
 * did anything with it — the extraction had moved the logic somewhere testable
 * and left the DECISION behind, in the one place this repo cannot test.
 *
 * So the decision moves too, and `_layout.tsx` is reduced to rendering whatever
 * this returns. Deleting an arm here fails a test.
 *
 * `version-unreadable` returning null is a deliberate answer, not an omission.
 * Not aborting startup is the whole point of containing that error, and an
 * alert about a transient database read the user can do nothing about — on a
 * launch that is otherwise about to succeed — would be noise. Previously no
 * caller consumed that status at all, so the same silence was in force but
 * nobody had decided on it.
 */
export function startupMigrationAlert(
  outcome: StartupMigrationOutcome
): StartupMigrationAlert | null {
  return outcome.status === 'migration-failed'
    ? {
        title: 'Database Update Failed',
        message: 'The app may not function correctly. Please restart the app.',
      }
    : null;
}

/**
 * The post-setup schema check that used to live inline in `app/_layout.tsx`.
 *
 * WHY IT IS A MODULE. It was inside a React component, where this repo cannot
 * test it — see TESTING.md; component tests hang under Jest. The neighbouring
 * `databaseLifecycle.test.tsx` copes by testing a hand-written mirror of the
 * implementation, which by construction cannot catch a change to the real code.
 * A defect found here by review was untestable where it lived, so it moved.
 *
 * WHY IT CANNOT THROW. This runs AFTER `setupDatabase()` has succeeded and
 * `_layout.tsx` has set `dbInitialized = true`. The outer catch there branches
 * on that flag: with it set, it does not retry and does not alert — it logs and
 * routes to `(tabs)`. So anything thrown from here silently skips the whole
 * remainder of initialisation: the migration, the `areApiUrlsConfigured` /
 * `first_launch` routing that sends a new user to Settings, and the Live
 * Activity sync. A transient `SQLITE_BUSY` would land a first-launch user in
 * the tab UI with no configuration and no explanation.
 *
 * That became reachable when 9.11 made `getCurrentSchemaVersion` propagate
 * unrecognised read failures. 9.11 is right — but its reasoning was done
 * entirely against the `setupTables` call site, where a throw happens BEFORE
 * `dbInitialized` is set and therefore does trigger the retry. This second call
 * site inverted the intent: a loud wrong answer became a silent one.
 *
 * Containment here rather than a narrower `getCurrentSchemaVersion` because the
 * two call sites genuinely want opposite things. Inside `setupTables` a failed
 * read must abort — proceeding would replay migrations against a live database.
 * Here it must not, because there is nothing left to protect and everything left
 * to do.
 */
export async function runStartupMigrationCheck(
  database: SQLiteDatabase,
  onProgress: StartupMigrationProgress
): Promise<StartupMigrationOutcome> {
  let currentVersion: number;
  try {
    currentVersion = await getCurrentSchemaVersion(database);
  } catch (error) {
    // Reported, not swallowed. The caller decides what a startup that could not
    // read its own schema version is worth telling the user; this only
    // guarantees it is not told by aborting everything after it.
    console.error('[startup] could not read schema version; skipping migration check:', error);
    return { status: 'version-unreadable', error };
  }

  if (currentVersion >= CURRENT_SCHEMA_VERSION) {
    return { status: 'up-to-date', version: currentVersion };
  }

  // ONLY `migrateToVersion3`, deliberately preserved rather than corrected.
  //
  // A device at version 4-7 arriving here gets one migration, not the chain
  // `runMigrations` would give it. That is what the inline block in
  // `_layout.tsx` did, and this extraction is a containment fix; silently
  // upgrading it to a full chain would be a behaviour change smuggled in under
  // a bug fix.
  //
  // In practice this whole branch is vestigial: it runs only after
  // `setupDatabase()` has succeeded, and `setupTables` has by then already run
  // the full chain and brought the database to `CURRENT_SCHEMA_VERSION` — so
  // `currentVersion < CURRENT_SCHEMA_VERSION` should be unreachable. The one
  // thing it still offers that `runMigrations` does not is the progress
  // callback driving the migration UI.
  //
  // Flagged by review rather than resolved here: whether this block should call
  // `runMigrations`, or be deleted outright, is a decision for whoever owns the
  // migration story, not for a fix closing an unrelated finding.
  console.log(`Migration needed from version ${currentVersion} to ${CURRENT_SCHEMA_VERSION}...`);
  onProgress(0);

  try {
    await migrateToVersion3(database, (current, total) => onProgress((current / total) * 100));
    return { status: 'migrated', from: currentVersion };
  } catch (error) {
    console.error('Migration failed:', error);
    return { status: 'migration-failed', error };
  } finally {
    // `finally`, not duplicated in both arms: the original cleared progress in
    // its catch too, under the comment "Reset UI even on error". A progress bar
    // left on screen after a failed migration never goes away.
    onProgress(null);
  }
}
