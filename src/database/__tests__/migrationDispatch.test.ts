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
import { CURRENT_SCHEMA_VERSION } from '../schemaVersion';

jest.mock('../connection');
jest.mock('../migrations/migrateToV8', () => ({
  migrateToVersion8: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../migrations/migrateToV7', () => ({
  migrateToVersion7: jest.fn().mockResolvedValue(undefined),
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
