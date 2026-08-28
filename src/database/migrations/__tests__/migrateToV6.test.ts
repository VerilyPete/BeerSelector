import { describe, it, expect, vi, type Mock } from 'vitest';
import { migrateToVersion6 } from '../migrateToV6';
import { databaseLockManager } from '../../DatabaseLockManager';
import { recordMigration } from '../../schemaVersion';

// The lock manager is deliberately NOT mocked. With the database mocked but
// the real manager, isLocked() asserts genuine lock state, which is what
// catches a dropped release — a mock asserting a mock cannot.

vi.mock('../../schemaVersion', () => ({
  recordMigration: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/src/utils/beerGlassType', () => ({
  extractABV: vi.fn().mockReturnValue(5.5),
}));

type MockDb = {
  getAllAsync: Mock;
  execAsync: Mock;
  runAsync: Mock;
  withTransactionAsync: Mock;
};

function createMockMigrationDb(): MockDb {
  databaseLockManager.resetForTesting();
  vi.restoreAllMocks();
  (recordMigration as Mock).mockClear();
  return {
    getAllAsync: vi.fn().mockResolvedValue([]),
    execAsync: vi.fn().mockResolvedValue(undefined),
    runAsync: vi.fn().mockResolvedValue(undefined),
    withTransactionAsync: vi.fn(async (callback: () => Promise<void>) => await callback()),
  };
}

function createBeerRows(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `beer-${i + 1}`,
    brew_description: `A delicious beer with 5.5% ABV content ${i + 1}`,
  }));
}

describe('migrateToVersion6', () => {
  describe('happy path: abv column does not exist', () => {
    it('acquires and releases the migration lock', async () => {
      const db = createMockMigrationDb();
      const lockSpy = vi.spyOn(databaseLockManager, 'withDatabaseLock');

      await migrateToVersion6(db as never);

      expect(lockSpy).toHaveBeenCalledWith('schema-migration-v6', expect.any(Function));
      expect(databaseLockManager.isLocked()).toBe(false);
    });

    it('adds abv column to allbeers table', async () => {
      const db = createMockMigrationDb();

      await migrateToVersion6(db as never);

      const execCalls = (db.execAsync as Mock).mock.calls.map((c: string[]) => c[0]);
      expect(
        execCalls.some((sql: string) => sql.includes('ALTER TABLE allbeers') && sql.includes('abv'))
      ).toBe(true);
    });

    it('adds abv column to tasted_brew_current_round table', async () => {
      const db = createMockMigrationDb();

      await migrateToVersion6(db as never);

      const execCalls = (db.execAsync as Mock).mock.calls.map((c: string[]) => c[0]);
      expect(
        execCalls.some(
          (sql: string) =>
            sql.includes('ALTER TABLE tasted_brew_current_round') && sql.includes('abv')
        )
      ).toBe(true);
    });

    it('records migration version 6', async () => {
      const db = createMockMigrationDb();

      await migrateToVersion6(db as never);

      expect(recordMigration).toHaveBeenCalledWith(db, 6);
    });

    it('runs the migration inside a transaction', async () => {
      const db = createMockMigrationDb();

      await migrateToVersion6(db as never);

      expect(db.withTransactionAsync).toHaveBeenCalledTimes(1);
    });

    it('queries both tables for beers to extract ABV from', async () => {
      const db = createMockMigrationDb();

      await migrateToVersion6(db as never);

      const getAllCalls = (db.getAllAsync as Mock).mock.calls.map((c: string[]) => c[0]);
      expect(getAllCalls.some((sql: string) => sql.includes('allbeers'))).toBe(true);
      expect(getAllCalls.some((sql: string) => sql.includes('tasted_brew_current_round'))).toBe(
        true
      );
    });

    it('skips bulk update when no beers exist', async () => {
      const db = createMockMigrationDb();
      db.getAllAsync.mockResolvedValue([]);

      await migrateToVersion6(db as never);

      expect(db.runAsync).not.toHaveBeenCalled();
    });

    it('runs bulk update with extracted ABV values for beers', async () => {
      const db = createMockMigrationDb();
      const beerRows = createBeerRows(3);
      db.getAllAsync.mockResolvedValue(beerRows);

      await migrateToVersion6(db as never);

      expect(db.runAsync).toHaveBeenCalled();
      const runCall = (db.runAsync as Mock).mock.calls[0][0] as string;
      expect(runCall).toContain('UPDATE');
      expect(runCall).toContain('abv');
    });

    it('calls onProgress for each batch processed', async () => {
      const db = createMockMigrationDb();
      const beerRows = createBeerRows(5);
      db.getAllAsync.mockResolvedValueOnce(beerRows).mockResolvedValueOnce(beerRows);
      const onProgress = vi.fn();

      await migrateToVersion6(db as never, onProgress);

      expect(onProgress).toHaveBeenCalled();
    });

    it('processes large batches in chunks of 100', async () => {
      const db = createMockMigrationDb();
      const beerRows = createBeerRows(150);
      db.getAllAsync.mockResolvedValueOnce(beerRows).mockResolvedValueOnce(beerRows);

      await migrateToVersion6(db as never);

      // 2 batches per table (100 + 50), 2 tables = 4 runAsync calls
      expect(db.runAsync).toHaveBeenCalledTimes(4);
    });
  });

  describe('idempotency: abv column already exists (execAsync throws duplicate column error)', () => {
    it('releases the lock when ALTER TABLE fails because abv column already exists', async () => {
      const db = createMockMigrationDb();
      db.withTransactionAsync.mockImplementation(async (callback: () => Promise<void>) => {
        db.execAsync.mockRejectedValueOnce(new Error('duplicate column name: abv'));
        await callback();
      });

      await expect(migrateToVersion6(db as never)).rejects.toThrow('duplicate column name: abv');

      expect(databaseLockManager.isLocked()).toBe(false);
    });

    it('still completes and records migration when tables are empty after column is added', async () => {
      const db = createMockMigrationDb();
      db.getAllAsync.mockResolvedValue([]);

      await migrateToVersion6(db as never);

      expect(recordMigration).toHaveBeenCalledWith(db, 6);
      expect(db.runAsync).not.toHaveBeenCalled();
    });
  });

  describe('error handling: lock is always released', () => {
    it('releases the lock when the transaction throws', async () => {
      const db = createMockMigrationDb();
      db.withTransactionAsync.mockRejectedValue(new Error('Transaction failed'));

      await expect(migrateToVersion6(db as never)).rejects.toThrow('Transaction failed');

      expect(databaseLockManager.isLocked()).toBe(false);
    });

    it('releases the lock when execAsync throws inside the transaction', async () => {
      const db = createMockMigrationDb();
      db.withTransactionAsync.mockImplementation(async (callback: () => Promise<void>) => {
        db.execAsync.mockRejectedValueOnce(new Error('ALTER TABLE failed'));
        await callback();
      });

      await expect(migrateToVersion6(db as never)).rejects.toThrow('ALTER TABLE failed');

      expect(databaseLockManager.isLocked()).toBe(false);
    });

    it('propagates error when lock acquisition fails', async () => {
      const db = createMockMigrationDb();
      vi.spyOn(databaseLockManager, 'withDatabaseLock').mockRejectedValue(
        new Error('Cannot acquire lock: database is shutting down')
      );

      await expect(migrateToVersion6(db as never)).rejects.toThrow('Cannot acquire lock');
    });
  });
});
