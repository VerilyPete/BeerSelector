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

jest.mock('../connection');
jest.mock('../migrations/migrateToV8', () => ({
  migrateToVersion8: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../migrations/migrateToV7', () => ({
  migrateToVersion7: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../migrations/migrateToV6', () => ({
  migrateToVersion6: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../migrations/migrateToV5', () => ({
  migrateToVersion5: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../migrations/migrateToV4', () => ({
  migrateToVersion4: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../migrations/migrateToV3', () => ({
  migrateToVersion3: jest.fn().mockResolvedValue(undefined),
}));

describe('migration dispatch', () => {
  const mockGetFirstAsync = jest.fn();
  const mockDatabase = {
    execAsync: jest.fn().mockResolvedValue(undefined),
    runAsync: jest.fn().mockResolvedValue({ changes: 0, lastInsertRowId: 0 }),
    getFirstAsync: mockGetFirstAsync,
    getAllAsync: jest.fn().mockResolvedValue([]),
    withTransactionAsync: jest.fn(async (cb: () => Promise<void>) => cb()),
    closeAsync: jest.fn().mockResolvedValue(undefined),
  };

  /** Make `getCurrentSchemaVersion` report a stored version. */
  const storedVersionIs = (version: number): void => {
    mockGetFirstAsync.mockResolvedValue({ version });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    resetDatabaseState();
    (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
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
  const DISPATCH_ARMS: readonly (readonly [number, jest.Mock])[] = [
    [3, migrateToVersion3 as jest.Mock],
    [4, migrateToVersion4 as jest.Mock],
    [5, migrateToVersion5 as jest.Mock],
    [6, migrateToVersion6 as jest.Mock],
    [7, migrateToVersion7 as jest.Mock],
    [8, migrateToVersion8 as jest.Mock],
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
});
