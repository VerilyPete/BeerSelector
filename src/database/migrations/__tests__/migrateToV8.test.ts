import { migrateToVersion8 } from '../migrateToV8';
import { databaseLockManager } from '../../DatabaseLockManager';
import { recordMigration } from '../../schemaVersion';

// The lock manager is deliberately NOT mocked, for the same reason as v7: with
// the database mocked but the real manager, isLocked() asserts genuine lock
// state, which is what catches a dropped release.

jest.mock('../../schemaVersion', () => ({
  recordMigration: jest.fn().mockResolvedValue(undefined),
}));

type MockDb = {
  getAllAsync: jest.Mock;
  execAsync: jest.Mock;
  runAsync: jest.Mock;
  withTransactionAsync: jest.Mock;
};

function createMockMigrationDb(): MockDb {
  databaseLockManager.resetForTesting();
  jest.restoreAllMocks();
  (recordMigration as jest.Mock).mockClear();
  return {
    getAllAsync: jest.fn().mockResolvedValue([]),
    execAsync: jest.fn().mockResolvedValue(undefined),
    runAsync: jest.fn().mockResolvedValue(undefined),
    withTransactionAsync: jest.fn(async (callback: () => Promise<void>) => await callback()),
  };
}

/** Every `runAsync` call as a [sql, params] pair. */
function writes(db: MockDb): [string, unknown[]][] {
  return (db.runAsync as jest.Mock).mock.calls as [string, unknown[]][];
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
    const lockSpy = jest.spyOn(databaseLockManager, 'withDatabaseLock');

    await migrateToVersion8(db as never);

    expect(lockSpy).toHaveBeenCalledWith('schema-migration-v8', expect.any(Function));
    expect(databaseLockManager.isLocked()).toBe(false);
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
