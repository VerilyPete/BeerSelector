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
import { runStartupMigrationCheck } from '../startupMigrationCheck';
import { getCurrentSchemaVersion, CURRENT_SCHEMA_VERSION } from '../schemaVersion';
import { migrateToVersion3 } from '../migrations/migrateToV3';

jest.mock('../schemaVersion', () => ({
  ...jest.requireActual('../schemaVersion'),
  getCurrentSchemaVersion: jest.fn(),
}));
jest.mock('../migrations/migrateToV3', () => ({
  migrateToVersion3: jest.fn().mockResolvedValue(undefined),
}));

const database = {} as SQLiteDatabase;

describe('runStartupMigrationCheck', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (migrateToVersion3 as jest.Mock).mockResolvedValue(undefined);
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => jest.restoreAllMocks());

  it('reports migration-needed and runs the migration when behind', async () => {
    (getCurrentSchemaVersion as jest.Mock).mockResolvedValue(CURRENT_SCHEMA_VERSION - 1);

    const outcome = await runStartupMigrationCheck(database, () => {});

    expect(migrateToVersion3).toHaveBeenCalled();
    expect(outcome.status).toBe('migrated');
  });

  it('does nothing when the database is already at the current version', async () => {
    (getCurrentSchemaVersion as jest.Mock).mockResolvedValue(CURRENT_SCHEMA_VERSION);

    const outcome = await runStartupMigrationCheck(database, () => {});

    expect(migrateToVersion3).not.toHaveBeenCalled();
    expect(outcome.status).toBe('up-to-date');
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
    (getCurrentSchemaVersion as jest.Mock).mockRejectedValue(cause);

    const outcome = await runStartupMigrationCheck(database, () => {});

    expect(outcome.status).toBe('version-unreadable');
    expect(outcome.status === 'version-unreadable' && outcome.error).toBe(cause);
    expect(migrateToVersion3).not.toHaveBeenCalled();
  });

  it('does not throw when the migration itself fails', async () => {
    // Pre-existing containment, pinned so the extraction cannot lose it: the
    // original block caught migration failure locally and alerted. The alert is
    // the caller's job now, so the outcome has to carry the fact.
    (getCurrentSchemaVersion as jest.Mock).mockResolvedValue(CURRENT_SCHEMA_VERSION - 1);
    (migrateToVersion3 as jest.Mock).mockRejectedValue(new Error('migration exploded'));

    const outcome = await runStartupMigrationCheck(database, () => {});

    expect(outcome.status).toBe('migration-failed');
  });

  it('clears progress after a failed migration, not only after a successful one', async () => {
    // The original block reset the progress UI in its catch as well as its
    // success path, with the comment "Reset UI even on error". A regression here
    // strands a progress bar on screen forever.
    (getCurrentSchemaVersion as jest.Mock).mockResolvedValue(CURRENT_SCHEMA_VERSION - 1);
    (migrateToVersion3 as jest.Mock).mockRejectedValue(new Error('migration exploded'));
    const progress: (number | null)[] = [];

    await runStartupMigrationCheck(database, p => progress.push(p));

    expect(progress[progress.length - 1]).toBeNull();
  });
});
