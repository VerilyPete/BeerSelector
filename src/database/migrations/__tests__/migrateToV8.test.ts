import { vi, type Mock } from 'vitest';
import { migrateToVersion8 } from '../migrateToV8';
import { databaseLockManager } from '../../DatabaseLockManager';
import { recordMigration } from '../../schemaVersion';

// The lock manager is deliberately NOT mocked, for the same reason as v7: with
// the database mocked but the real manager, isLocked() asserts genuine lock
// state, which is what catches a dropped release.

vi.mock('../../schemaVersion', () => ({
  recordMigration: vi.fn().mockResolvedValue(undefined),
}));

/** One write the migration made, and whether a transaction was open for it. */
type WriteLogEntry = { readonly write: string; readonly transactionsOpen: number };

type MockDb = {
  getAllAsync: Mock;
  execAsync: Mock;
  runAsync: Mock;
  withTransactionAsync: Mock;
  /**
   * Every write, in order, tagged with the transaction depth at the moment it
   * ran.
   *
   * `withTransactionAsync` used to be `jest.fn(callback => callback())` — a
   * passthrough, which is indistinguishable from no transaction at all. Under
   * it, deleting the transaction wrapper or moving `recordMigration` outside it
   * were both undetectable, and this file's five tests stayed green for either.
   * The mock has to model the one thing it is being asked about.
   */
  writeLog: WriteLogEntry[];
};

function createMockMigrationDb(): MockDb {
  databaseLockManager.resetForTesting();
  vi.restoreAllMocks();
  (recordMigration as Mock).mockClear();

  // A depth count rather than a boolean, so a nested transaction still reads as
  // open and cannot be mistaken for the outer one having closed.
  let transactionsOpen = 0;
  const writeLog: WriteLogEntry[] = [];

  // `recordMigration` is a module mock, so its position relative to the
  // transaction is only observable if it reports it here.
  (recordMigration as Mock).mockImplementation(async () => {
    writeLog.push({ write: 'recordMigration', transactionsOpen });
  });

  return {
    getAllAsync: vi.fn().mockResolvedValue([]),
    execAsync: vi.fn().mockResolvedValue(undefined),
    runAsync: vi.fn(async (sql: string) => {
      writeLog.push({ write: sql.trim().split(/\s+/)[0].toUpperCase(), transactionsOpen });
    }),
    withTransactionAsync: vi.fn(async (callback: () => Promise<void>) => {
      transactionsOpen += 1;
      try {
        await callback();
      } finally {
        transactionsOpen -= 1;
      }
    }),
    writeLog,
  };
}

/** Every `runAsync` call as a [sql, params] pair. */
function writes(db: MockDb): [string, unknown[]][] {
  return (db.runAsync as Mock).mock.calls as [string, unknown[]][];
}

describe('migrateToVersion8', () => {
  it('deletes the auth_cookies preference', async () => {
    // The point of the migration. Removing the write in LoginWebView stops new
    // devices storing a session cookie in plaintext, but does nothing for the
    // devices that already have one — those rows survive upgrade, backup and
    // restore until something deletes them.
    const db = createMockMigrationDb();

    await migrateToVersion8(db as never);

    const deletes = writes(db).filter(([sql]) => /DELETE\s+FROM\s+preferences/i.test(sql));
    expect(deletes).toHaveLength(1);
    expect(deletes[0][1]).toEqual(['auth_cookies']);
  });

  it('acquires and releases the migration lock', async () => {
    const db = createMockMigrationDb();
    const lockSpy = vi.spyOn(databaseLockManager, 'withDatabaseLock');

    await migrateToVersion8(db as never);

    expect(lockSpy).toHaveBeenCalledWith('schema-migration-v8', expect.any(Function));
    expect(databaseLockManager.isLocked()).toBe(false);
  });

  it('deletes the row and records the version inside one transaction', async () => {
    // The two writes have to commit together or not at all, and the order in
    // which they fail is the whole point. Delete-then-crash re-runs on the next
    // launch and deletes nothing, which is harmless. Record-then-fail-to-delete
    // leaves a session cookie on the device with the schema asserting it was
    // purged — and because the version gate has moved past 8, nothing will ever
    // look again. The transaction is what makes the second ordering impossible.
    const db = createMockMigrationDb();

    await migrateToVersion8(db as never);

    expect(db.writeLog).toEqual([
      { write: 'DELETE', transactionsOpen: 1 },
      { write: 'recordMigration', transactionsOpen: 1 },
    ]);
  });

  it('records the migration', async () => {
    const db = createMockMigrationDb();

    await migrateToVersion8(db as never);

    expect(recordMigration).toHaveBeenCalledWith(db, 8);
  });

  it('succeeds when there is no auth_cookies row to delete', async () => {
    // A device that never completed a member login has no such row. A DELETE
    // matching nothing is not an error, and the migration must not treat it as
    // one — a throw here would strand the schema below 8 and re-run forever.
    const db = createMockMigrationDb();
    db.runAsync.mockResolvedValue({ changes: 0 });

    await expect(migrateToVersion8(db as never)).resolves.toBeUndefined();
    expect(recordMigration).toHaveBeenCalledWith(db, 8);
  });

  it('releases the lock when the delete fails', async () => {
    const db = createMockMigrationDb();
    db.runAsync.mockRejectedValue(new Error('database is locked'));

    await expect(migrateToVersion8(db as never)).rejects.toThrow('database is locked');

    expect(databaseLockManager.isLocked()).toBe(false);
    expect(recordMigration).not.toHaveBeenCalled();
  });
});
