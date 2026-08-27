import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
/**
 * The startup migration check must not be able to abort app initialisation.
 *
 * Found by an adversarial review of the 9.11 fix, against that fix's own author.
 *
 * 9.11 narrowed `getCurrentSchemaVersion` so that only "no such table" means
 * version zero and every other read failure propagates. That reasoning was
 * carried out entirely against the `schema.ts` call site, where it is right: a
 * throw there happens before `dbInitialized` is set, so `_layout.tsx` retries.
 *
 * There is a SECOND call site. `_layout.tsx` calls `getCurrentSchemaVersion`
 * again after `setupDatabase()` has already succeeded and `dbInitialized = true`
 * has been set. A throw there lands in the outer catch, takes the
 * `dbInitialized === true` branch, and that branch does not retry and does not
 * alert — it logs and routes to `(tabs)`.
 *
 * So the throw 9.11 introduced silently skips everything after the version read:
 * the migration check itself, the `areApiUrlsConfigured` / `first_launch`
 * routing that sends a new user to Settings, and the Live Activity sync. Before
 * 9.11 that same transient error became `0`, which was also wrong but noisy and
 * self-limiting. 9.11 traded a loud wrong answer for a silent one at this site —
 * the exact inversion of what it was trying to achieve.
 *
 * These tests exist because that block cannot be tested where it lived. It was
 * inside a React component, and this repo cannot test components under Jest
 * (see TESTING.md; `useThemeColor`/`useColorScheme` hang). The neighbouring
 * `databaseLifecycle.test.tsx` works around that by testing a hand-copied mirror
 * of the implementation, which cannot catch a change to the real thing. Moving
 * the logic into a module is what makes a real test possible.
 */

import type { SQLiteDatabase } from 'expo-sqlite';
import { runStartupMigrationCheck, startupMigrationAlert } from '../startupMigrationCheck';
import { getCurrentSchemaVersion, CURRENT_SCHEMA_VERSION } from '../schemaVersion';
import { migrateToVersion3 } from '../migrations/migrateToV3';

vi.mock('../schemaVersion', async () => ({
  ...(await vi.importActual<typeof import('../schemaVersion')>('../schemaVersion')),
  getCurrentSchemaVersion: vi.fn(),
}));
vi.mock('../migrations/migrateToV3', async () => ({
  migrateToVersion3: vi.fn().mockResolvedValue(undefined),
}));

const database = {} as SQLiteDatabase;

describe('runStartupMigrationCheck', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (migrateToVersion3 as Mock).mockResolvedValue(undefined);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => vi.restoreAllMocks());

  it('runs the migration when behind, and drives progress from 0 to cleared', async () => {
    (getCurrentSchemaVersion as Mock).mockResolvedValue(CURRENT_SCHEMA_VERSION - 1);
    // The mock must INVOKE its callback. With a bare `mockResolvedValue` the
    // percentage arithmetic is dead under test, so `(current / total) * 100`
    // could drop the `* 100` — or the callback could be dropped from the call
    // entirely — and every test stayed green.
    (migrateToVersion3 as Mock).mockImplementation(async (_db, onProgress) => {
      onProgress(1, 4);
    });
    const progress: (number | null)[] = [];

    const outcome = await runStartupMigrationCheck(database, p => progress.push(p));

    // Passed the real database, not merely called: `toHaveBeenCalled()` with no
    // arguments would survive the migration being handed `null`.
    expect(migrateToVersion3).toHaveBeenCalledWith(database, expect.any(Function));
    expect(outcome).toEqual({ status: 'migrated', from: CURRENT_SCHEMA_VERSION - 1 });
    // The whole sequence, not just its last element. 0 on entry proves the
    // overlay appears, 25 proves the percentage is a percentage, null proves it
    // is cleared on the SUCCESS path — which is the case the failure test below
    // names a contrast against but cannot itself check.
    expect(progress).toEqual([0, 25, null]);
  });

  it('does nothing when the database is already at the current version', async () => {
    (getCurrentSchemaVersion as Mock).mockResolvedValue(CURRENT_SCHEMA_VERSION);
    const progress: (number | null)[] = [];

    const outcome = await runStartupMigrationCheck(database, p => progress.push(p));

    expect(migrateToVersion3).not.toHaveBeenCalled();
    expect(outcome).toEqual({ status: 'up-to-date', version: CURRENT_SCHEMA_VERSION });
    // Nothing at all, not even a 0: a progress overlay that flashes on every
    // launch of an up-to-date device is a regression this would otherwise miss.
    expect(progress).toEqual([]);
  });

  it('contains an unreadable version instead of throwing, and says which error', async () => {
    // THE REGRESSION THIS FILE EXISTS FOR. A propagating read is correct inside
    // `setupTables` and wrong here, because here it aborts the rest of startup
    // rather than triggering a retry.
    //
    // One test rather than the two this started as. The first only asserted
    // that the promise resolved with `version-unreadable`, which is a strict
    // subset of what this asserts; review pointed out it was entirely subsumed.
    // Contained is not the same as ignored, so the identity of the error and
    // the fact that no migration ran are part of the same claim: the caller must
    // be able to tell "checked, nothing to do" from "could not check", which is
    // exactly the distinction the pre-9.11 `return 0` destroyed.
    const cause = new Error('database is locked');
    (getCurrentSchemaVersion as Mock).mockRejectedValue(cause);

    const outcome = await runStartupMigrationCheck(database, () => {});

    expect(outcome.status).toBe('version-unreadable');
    expect(outcome.status === 'version-unreadable' && outcome.error).toBe(cause);
    expect(migrateToVersion3).not.toHaveBeenCalled();
  });

  it('does not throw when the migration itself fails', async () => {
    // Pre-existing containment, pinned so the extraction cannot lose it: the
    // original block caught migration failure locally and alerted. The alert is
    // the caller's job now, so the outcome has to carry the fact.
    (getCurrentSchemaVersion as Mock).mockResolvedValue(CURRENT_SCHEMA_VERSION - 1);
    (migrateToVersion3 as Mock).mockRejectedValue(new Error('migration exploded'));

    const outcome = await runStartupMigrationCheck(database, () => {});

    expect(outcome.status).toBe('migration-failed');
  });

  it('clears progress after a failed migration, not only after a successful one', async () => {
    // The original block reset the progress UI in its catch as well as its
    // success path, with the comment "Reset UI even on error". A regression here
    // strands a progress bar on screen forever.
    //
    // This test's NAME asserts a contrast it cannot check on its own, which is
    // how it originally passed while the success path went unguarded: moving
    // `onProgress(null)` out of the `finally` and into the `catch` kept this
    // green and stranded the bar after every successful migration — the exact
    // defect the `finally` exists to prevent. The success half of the contrast
    // now lives in the migration test above; both are needed for either to mean
    // anything.
    (getCurrentSchemaVersion as Mock).mockResolvedValue(CURRENT_SCHEMA_VERSION - 1);
    (migrateToVersion3 as Mock).mockRejectedValue(new Error('migration exploded'));
    const progress: (number | null)[] = [];

    await runStartupMigrationCheck(database, p => progress.push(p));

    expect(progress[progress.length - 1]).toBeNull();
  });
});

/**
 * The half of the fix that was still unwired.
 *
 * Mutation testing found that deleting the entire `Alert.alert('Database Update
 * Failed', …)` block from `app/_layout.tsx` changed no test result. The module
 * reported `migration-failed` correctly and nothing verified the caller acted on
 * it — the extraction moved the logic somewhere testable and left the decision
 * about what a user is told behind, one layer up, in the component this repo
 * cannot test under Jest.
 *
 * So the decision moves too. `startupMigrationAlert` is the whole
 * outcome-to-user-message mapping as a pure function; `_layout.tsx` is reduced
 * to rendering whatever it returns. Deleting an arm from it now fails here.
 *
 * It answers for `version-unreadable` as well, which previously no caller
 * consumed at all. Staying silent there is a deliberate choice — not aborting
 * startup is the entire point of the containment — but it is now a choice
 * written down and pinned, rather than one made by omission.
 */
describe('startupMigrationAlert', () => {
  it('tells the user when a migration actually failed', () => {
    const alert = startupMigrationAlert({ status: 'migration-failed', error: new Error('boom') });

    expect(alert).toEqual({
      title: 'Database Update Failed',
      message: 'The app may not function correctly. Please restart the app.',
    });
  });

  it('says nothing when the migration succeeded', () => {
    expect(startupMigrationAlert({ status: 'migrated', from: 7 })).toBeNull();
  });

  it('says nothing when there was nothing to do', () => {
    expect(startupMigrationAlert({ status: 'up-to-date', version: 8 })).toBeNull();
  });

  it('stays silent when the version could not be read, deliberately', () => {
    // The startup continues on stale-but-serviceable state; an alert here would
    // tell a user about a transient database read they can do nothing about,
    // on a launch that is otherwise about to work.
    expect(
      startupMigrationAlert({ status: 'version-unreadable', error: new Error('locked') })
    ).toBeNull();
  });
});
