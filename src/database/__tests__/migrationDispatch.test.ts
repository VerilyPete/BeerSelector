import { vi, type Mock } from 'vitest';
/**
 * Migrations must actually be invoked.
 *
 * Every migration in this codebase has tests proving the migration FUNCTION
 * works. Nothing proved any of them is ever CALLED. `CURRENT_SCHEMA_VERSION` and
 * `runMigrations` had zero test references, so two one-line mutations passed the
 * entire 93-suite run with output identical to baseline:
 *
 *   - reverting `CURRENT_SCHEMA_VERSION` to 7
 *   - deleting the `if (fromVersion < 8)` dispatch arm from `runMigrations`
 *
 * Either one means the v8 `auth_cookies` purge never runs on any device: a
 * security fix that silently does nothing, behind five green migration tests.
 * That gap was found by mutation testing and confirmed by grep — it was not
 * caught by any test, and on this branch it was caught only by driving a real
 * simulator by hand.
 *
 * These tests exist to make the *wiring* fail loudly, which is the half that
 * every migration's own suite leaves uncovered.
 */

import { setupDatabase, resetDatabaseState } from '../db';
import * as connection from '../connection';
import { migrateToVersion8 } from '../migrations/migrateToV8';
import { migrateToVersion7 } from '../migrations/migrateToV7';
import { migrateToVersion6 } from '../migrations/migrateToV6';
import { migrateToVersion5 } from '../migrations/migrateToV5';
import { migrateToVersion4 } from '../migrations/migrateToV4';
import { migrateToVersion3 } from '../migrations/migrateToV3';
import { CURRENT_SCHEMA_VERSION } from '../schemaVersion';

vi.mock('../connection');
vi.mock('../migrations/migrateToV8', () => ({
  migrateToVersion8: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../migrations/migrateToV7', () => ({
  migrateToVersion7: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../migrations/migrateToV6', () => ({
  migrateToVersion6: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../migrations/migrateToV5', () => ({
  migrateToVersion5: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../migrations/migrateToV4', () => ({
  migrateToVersion4: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../migrations/migrateToV3', () => ({
  migrateToVersion3: vi.fn().mockResolvedValue(undefined),
}));

describe('migration dispatch', () => {
  const mockGetFirstAsync = vi.fn();
  const mockDatabase = {
    execAsync: vi.fn().mockResolvedValue(undefined),
    runAsync: vi.fn().mockResolvedValue({ changes: 0, lastInsertRowId: 0 }),
    getFirstAsync: mockGetFirstAsync,
    getAllAsync: vi.fn().mockResolvedValue([]),
    withTransactionAsync: vi.fn(async (cb: () => Promise<void>) => cb()),
    closeAsync: vi.fn().mockResolvedValue(undefined),
  };

  /** Make `getCurrentSchemaVersion` report a stored version. */
  const storedVersionIs = (version: number): void => {
    mockGetFirstAsync.mockResolvedValue({ version });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    resetDatabaseState();
    (connection.getDatabase as Mock).mockResolvedValue(mockDatabase);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // `mockReset`, not just `clearAllMocks`/`restoreAllMocks`. Neither of those
    // removes an implementation installed on a bare `jest.fn()`:
    // `clearAllMocks` clears calls only, `restoreAllMocks` restores `spyOn`
    // spies only, and this project sets neither `resetMocks` nor `restoreMocks`
    // in its Jest config. `versionReadFailsWith` installs a THROWING
    // implementation, which would otherwise persist into every test that runs
    // after it in this file.
    //
    // Harmless today purely by position — those tests are last, and the ones
    // above override with `mockResolvedValue`. That is luck, and the next test
    // appended here would inherit a database that throws on every
    // `schema_version` read. Found by review, not by a failure.
    mockGetFirstAsync.mockReset();
  });

  it('runs the v8 migration on a database at version 7', async () => {
    // The stored version is the LITERAL 7, deliberately not
    // `CURRENT_SCHEMA_VERSION - 1`. The relative form is vacuous against the
    // mutation that matters: reverting the constant to 7 moves the input along
    // with it, so `6 < 7` still dispatches v8 and the test passes while the
    // purge never runs on a real v7 device. Verified — the relative version of
    // this test survived that mutant; this one kills it.
    //
    // The cost is that bumping CURRENT_SCHEMA_VERSION requires editing this
    // file. That is the intent: adding a migration should force you to state
    // that it is wired up.
    storedVersionIs(7);

    await setupDatabase();

    expect(migrateToVersion8).toHaveBeenCalledWith(mockDatabase);
  });

  it('declares a schema version that has a migration to reach it', async () => {
    // Pins the constant itself. Without this, lowering CURRENT_SCHEMA_VERSION
    // is only caught indirectly, and a future bump with no corresponding
    // dispatch arm would ship a migration nothing calls — the exact defect this
    // file exists for.
    expect(CURRENT_SCHEMA_VERSION).toBe(8);
  });

  it('runs no migration on a database already at the current version', async () => {
    // The other half of the gate. Without this, a mutation that drops the
    // version comparison entirely — running every migration on every launch —
    // would still pass the test above.
    storedVersionIs(CURRENT_SCHEMA_VERSION);

    await setupDatabase();

    expect(migrateToVersion8).not.toHaveBeenCalled();
    expect(migrateToVersion7).not.toHaveBeenCalled();
  });

  it('runs every intervening migration when several versions behind', async () => {
    // A device that skipped releases must not skip migrations. This is the arm
    // that catches a dispatch block deleted from the middle of the chain rather
    // than the end.
    storedVersionIs(6);

    await setupDatabase();

    expect(migrateToVersion7).toHaveBeenCalledWith(mockDatabase);
    expect(migrateToVersion8).toHaveBeenCalledWith(mockDatabase);
  });

  /**
   * Every dispatch arm, both directions, at every stored version.
   *
   * The tests above prove the v7 and v8 arms are wired. They cannot say
   * anything about v3-v6: `storedVersionIs(6)` is the lowest input any of them
   * uses, and from 6 the only arms left to take are 7 and 8. So four of the six
   * guards had no coverage at all, and `if (fromVersion < 3)` or
   * `if (fromVersion < 6)` could be deleted with all 680 database tests green.
   *
   * That is not a hypothetical. Dropping the `< 7` guard makes a v7 device —
   * everyone upgrading from the current release — re-run migration 7, whose
   * `recordMigration(database, 7)` INSERTs a duplicate into an INTEGER PRIMARY
   * KEY. It throws, `setupTables` rethrows, and `app/_layout.tsx` retries once
   * against identical on-disk state, fails identically, and routes into the app
   * anyway. The app looks fine. `schema_version` is pinned at 7 forever, the v8
   * arm is never reached, and the plaintext `auth_cookies` jar the v8 migration
   * exists to delete survives on every device that ever completed a member
   * login. Reproduced end to end against a real SQLite engine (errcode 1555).
   *
   * A per-version table is used rather than one case per arm so that adding a
   * migration without extending this list is itself a failure.
   */
  const DISPATCH_ARMS: readonly (readonly [number, Mock])[] = [
    [3, migrateToVersion3 as Mock],
    [4, migrateToVersion4 as Mock],
    [5, migrateToVersion5 as Mock],
    [6, migrateToVersion6 as Mock],
    [7, migrateToVersion7 as Mock],
    [8, migrateToVersion8 as Mock],
  ];

  it('covers every dispatch arm in runMigrations', () => {
    // Guards the table above against a new migration being added to
    // `runMigrations` without a case here — which would silently shrink this
    // file's coverage back to the gap it was written to close.
    expect(DISPATCH_ARMS.map(([version]) => version)).toEqual([3, 4, 5, 6, 7, 8]);
    expect(DISPATCH_ARMS[DISPATCH_ARMS.length - 1][0]).toBe(CURRENT_SCHEMA_VERSION);
  });

  // Derived, not a literal. `DISPATCH_ARMS` has a drift guard — the meta-test
  // above fails if a new migration is added without extending it — but a bare
  // `[2, 3, 4, 5, 6, 7]` had none. Whoever bumps CURRENT_SCHEMA_VERSION to 9
  // would be forced to extend the table and NOT told to extend this list, so
  // arm 8 would sit untested exactly as arms 3-6 did: the same gap, moved along
  // by one version.
  const STORED_VERSIONS = Array.from({ length: CURRENT_SCHEMA_VERSION - 2 }, (_, i) => i + 2);

  it.each(STORED_VERSIONS)(
    'runs every later migration and no earlier one from stored version %i',
    async stored => {
      storedVersionIs(stored);

      await setupDatabase();

      for (const [version, migrate] of DISPATCH_ARMS) {
        if (version <= stored) {
          // Already applied. Re-running it is the defect: `recordMigration`
          // would insert a duplicate primary key and abort the whole chain.
          expect(migrate).not.toHaveBeenCalled();
        } else {
          expect(migrate).toHaveBeenCalledWith(mockDatabase);
        }
      }
    }
  );

  it('runs no migration on a database from the future', async () => {
    // A rollback to an older build leaves a stored version ABOVE this build's
    // constant. Nothing should run — and nothing should throw. Codex checked
    // this by reading the `<` comparison; this asserts it.
    storedVersionIs(CURRENT_SCHEMA_VERSION + 1);

    await expect(setupDatabase()).resolves.not.toThrow();

    expect(migrateToVersion8).not.toHaveBeenCalled();
    expect(migrateToVersion7).not.toHaveBeenCalled();
  });

  /**
   * The version read is the input every assertion above trusts.
   *
   * `getCurrentSchemaVersion` caught EVERYTHING and returned 0, under a comment
   * reading "Table doesn't exist yet" — which is one reason the read can fail,
   * offered as though it were the only one. A locked or corrupt database
   * answers the same way, and 0 is the one value that means "fresh install, run
   * everything": a transient fault replays all six migrations against a fully
   * migrated database.
   *
   * That is not a slow launch, it is a throw — but by a route this comment
   * originally described wrongly in every particular. The corrected account:
   * `setupTables` enters the pre-versioned branch and calls
   * `runMigrations(database, 2)`, which starts at `migrateToVersion3`. On an
   * already-migrated database `ALTER TABLE allbeers ADD COLUMN glass_type`
   * SUCCEEDS, because `migrateToVersion4` renamed that column to
   * `container_type` and left the name free. It then throws at
   * `recordMigration(database, 3)` — version 3, not 7 — on the
   * `INTEGER PRIMARY KEY`. That sits inside `withTransactionAsync`, so it rolls
   * back and the stray column does not persist.
   *
   * The retry in `_layout.tsx` DOES run, and the earlier claim that it "never
   * touches the database" was simply false: this throw happens inside
   * `setupDatabase()`, so `dbInitialized` is still false and the retry calls
   * `resetDatabaseState()` and `setupDatabase()` again. What it cannot do is
   * HELP — it clears in-process state only, so the second attempt meets
   * identical on-disk state and fails identically.
   *
   * Corrected after review caught the original account borrowing 9.2's
   * migration-7 mechanism and applying it to a path that starts at 3.
   *
   * These two tests are the pair: the swallow must survive for the reason its
   * comment gives, and must not survive for any other.
   */
  /** Fail the `schema_version` read specifically, leaving other queries alone. */
  const versionReadFailsWith = (error: Error): void => {
    mockGetFirstAsync.mockImplementation(async (sql: string) => {
      if (sql.includes('schema_version')) throw error;
      return { count: 0 };
    });
  };

  /**
   * Version zero as production actually produces it.
   *
   * These two tests originally drove a THROWING read, on the assumption that a
   * missing `schema_version` table is how a fresh install reports itself. It is
   * not, and review caught it: `setupTables` runs
   * `CREATE TABLE IF NOT EXISTS schema_version` immediately before the read, so
   * the table is never absent at that point. A fresh install gets zero because
   * `SELECT MAX(version)` is an aggregate with no `GROUP BY` — it returns one
   * row, `{ version: null }`, over an empty table — and `?? 0` turns that into
   * 0. The catch is not involved at all.
   *
   * Driving them through the reachable input means they now describe a state
   * the app can genuinely be in. The `getAllAsync` result is what separates the
   * two cases, exactly as it does in `schema.ts`.
   */
  const versionTableIsEmpty = (): void => {
    mockGetFirstAsync.mockImplementation(async (sql: string) =>
      sql.includes('schema_version') ? { version: null } : { count: 0 }
    );
  };

  it('treats an empty schema_version table with no tables as a fresh install', async () => {
    // No `allbeers` in `sqlite_master` — the default `getAllAsync` mock returns
    // none — so this is the fresh-install branch, which creates tables AT the
    // current version and deliberately runs no migration.
    versionTableIsEmpty();

    await setupDatabase();

    expect(migrateToVersion3).not.toHaveBeenCalled();
    expect(mockDatabase.runAsync).toHaveBeenCalledWith(expect.stringContaining('schema_version'), [
      CURRENT_SCHEMA_VERSION,
      expect.any(String),
    ]);
  });

  it('migrates a pre-versioned database whose tables exist but version does not', async () => {
    // The TestFlight-upgrader path: tables present, no version recorded. Review
    // confirmed this test is the ONLY cover for it anywhere in the suite —
    // `schema.test.ts` hard-sets `getAllAsync` to `[]` in its `beforeEach` and
    // never takes this branch — and it is what pins the `runMigrations(database,
    // 2)` entry point, whose boundary dies to a `2` → `3` mutant.
    versionTableIsEmpty();
    mockDatabase.getAllAsync.mockResolvedValueOnce([{ name: 'allbeers' }]);

    await setupDatabase();

    expect(migrateToVersion3).toHaveBeenCalledWith(mockDatabase);
    expect(migrateToVersion8).toHaveBeenCalledWith(mockDatabase);
  });

  it('does not replay migrations when the version read fails for any other reason', async () => {
    // A locked database is the realistic case, and the one the old catch could
    // not tell apart from an absent table.
    versionReadFailsWith(new Error('database is locked'));

    await expect(setupDatabase()).rejects.toThrow(/database is locked/);

    expect(migrateToVersion3).not.toHaveBeenCalled();
    expect(migrateToVersion7).not.toHaveBeenCalled();
    expect(migrateToVersion8).not.toHaveBeenCalled();
  });
});
