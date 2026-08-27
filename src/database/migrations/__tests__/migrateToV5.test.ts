import { describe, it, expect, vi, type Mock } from 'vitest';
import { migrateToVersion5 } from '../migrateToV5';
import { databaseLockManager } from '../../DatabaseLockManager';
import { recordMigration } from '../../schemaVersion';

// The lock manager is deliberately NOT mocked. With the database mocked but
// the real manager, isLocked() asserts genuine lock state, which is what
// catches a dropped release — a mock asserting a mock cannot.

vi.mock('../../schemaVersion', () => ({
  recordMigration: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/src/utils/beerGlassType', () => ({
  getContainerType: vi.fn().mockReturnValue('flight'),
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

function createFlightBeerRows(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `beer-${i + 1}`,
    brew_name: `Flight ${i + 1}`,
    brew_container: 'flight',
    brew_description: `Description ${i + 1}`,
    brew_style: 'Flight',
    container_type: null,
  }));
}

describe('migrateToVersion5', () => {
  describe('happy path: flight beers with null container_type exist', () => {
    it('acquires and releases the migration lock', async () => {
      const db = createMockMigrationDb();
      const lockSpy = vi.spyOn(databaseLockManager, 'withDatabaseLock');

      await migrateToVersion5(db as never);

      expect(lockSpy).toHaveBeenCalledWith('schema-migration-v5', expect.any(Function));
      expect(databaseLockManager.isLocked()).toBe(false);
    });

    it('records migration version 5', async () => {
      const db = createMockMigrationDb();

      await migrateToVersion5(db as never);

      expect(recordMigration).toHaveBeenCalledWith(db, 5);
    });

    it('runs the migration inside a transaction', async () => {
      const db = createMockMigrationDb();

      await migrateToVersion5(db as never);

      expect(db.withTransactionAsync).toHaveBeenCalledTimes(1);
    });

    it('queries allbeers for rows that may be flights with null container_type', async () => {
      const db = createMockMigrationDb();

      await migrateToVersion5(db as never);

      const getAllCalls = (db.getAllAsync as Mock).mock.calls.map((c: string[]) => c[0]);
      expect(
        getAllCalls.some(
          (sql: string) =>
            sql.includes('allbeers') &&
            sql.includes('container_type IS NULL') &&
            sql.includes('flight')
        )
      ).toBe(true);
    });

    it('queries tasted_brew_current_round for rows that may be flights with null container_type', async () => {
      const db = createMockMigrationDb();

      await migrateToVersion5(db as never);

      const getAllCalls = (db.getAllAsync as Mock).mock.calls.map((c: string[]) => c[0]);
      expect(
        getAllCalls.some(
          (sql: string) =>
            sql.includes('tasted_brew_current_round') &&
            sql.includes('container_type IS NULL') &&
            sql.includes('flight')
        )
      ).toBe(true);
    });

    it('runs bulk update for flight beers', async () => {
      const db = createMockMigrationDb();
      const beerRows = createFlightBeerRows(3);
      db.getAllAsync.mockResolvedValue(beerRows);

      await migrateToVersion5(db as never);

      expect(db.runAsync).toHaveBeenCalled();
      const runCall = (db.runAsync as Mock).mock.calls[0][0] as string;
      expect(runCall).toContain('UPDATE');
    });

    it('calls onProgress for each batch processed', async () => {
      const db = createMockMigrationDb();
      const beerRows = createFlightBeerRows(5);
      db.getAllAsync.mockResolvedValueOnce(beerRows).mockResolvedValueOnce(beerRows);
      const onProgress = vi.fn();

      await migrateToVersion5(db as never, onProgress);

      expect(onProgress).toHaveBeenCalled();
    });

    it('processes large batches in chunks of 100', async () => {
      const db = createMockMigrationDb();
      const beerRows = createFlightBeerRows(150);
      db.getAllAsync.mockResolvedValueOnce(beerRows).mockResolvedValueOnce(beerRows);

      await migrateToVersion5(db as never);

      // 2 batches per table (100 + 50), 2 tables = 4 runAsync calls
      expect(db.runAsync).toHaveBeenCalledTimes(4);
    });
  });

  describe('idempotency: no flight beers with null container_type', () => {
    it('completes successfully when no flight beers need updating', async () => {
      const db = createMockMigrationDb();
      db.getAllAsync.mockResolvedValue([]);

      await migrateToVersion5(db as never);

      expect(recordMigration).toHaveBeenCalledWith(db, 5);
    });

    it('skips bulk update when no rows match the flight criteria', async () => {
      const db = createMockMigrationDb();
      db.getAllAsync.mockResolvedValue([]);

      await migrateToVersion5(db as never);

      expect(db.runAsync).not.toHaveBeenCalled();
    });

    it('still records migration version even when nothing to update', async () => {
      const db = createMockMigrationDb();
      db.getAllAsync.mockResolvedValue([]);

      await migrateToVersion5(db as never);

      expect(recordMigration).toHaveBeenCalledWith(db, 5);
    });
  });

  describe('error handling: lock is always released', () => {
    it('releases the lock when the transaction throws', async () => {
      const db = createMockMigrationDb();
      db.withTransactionAsync.mockRejectedValue(new Error('Transaction failed'));

      await expect(migrateToVersion5(db as never)).rejects.toThrow('Transaction failed');

      expect(databaseLockManager.isLocked()).toBe(false);
    });

    it('releases the lock when getAllAsync throws inside the transaction', async () => {
      const db = createMockMigrationDb();
      db.withTransactionAsync.mockImplementation(async (callback: () => Promise<void>) => {
        db.getAllAsync.mockRejectedValueOnce(new Error('Query failed'));
        await callback();
      });

      await expect(migrateToVersion5(db as never)).rejects.toThrow('Query failed');

      expect(databaseLockManager.isLocked()).toBe(false);
    });

    it('propagates error when lock acquisition fails', async () => {
      const db = createMockMigrationDb();
      vi.spyOn(databaseLockManager, 'withDatabaseLock').mockRejectedValue(
        new Error('Cannot acquire lock: database is shutting down')
      );

      await expect(migrateToVersion5(db as never)).rejects.toThrow('Cannot acquire lock');
    });
  });
});
