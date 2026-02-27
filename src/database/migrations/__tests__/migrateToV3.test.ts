import { migrateToVersion3 } from '../migrateToV3';
import { databaseLockManager } from '../../DatabaseLockManager';
import { recordMigration } from '../../schemaVersion';

jest.mock('../../DatabaseLockManager', () => ({
  databaseLockManager: {
    acquireLock: jest.fn().mockResolvedValue(true),
    releaseLock: jest.fn(),
  },
}));

jest.mock('../../schemaVersion', () => ({
  recordMigration: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/src/utils/beerGlassType', () => ({
  getGlassType: jest.fn().mockReturnValue('pint'),
}));

type MockDb = {
  getAllAsync: jest.Mock;
  execAsync: jest.Mock;
  runAsync: jest.Mock;
  withTransactionAsync: jest.Mock;
};

function createMockMigrationDb(): MockDb {
  (databaseLockManager.acquireLock as jest.Mock).mockClear();
  (databaseLockManager.releaseLock as jest.Mock).mockClear();
  (recordMigration as jest.Mock).mockClear();
  return {
    getAllAsync: jest.fn().mockResolvedValue([]),
    execAsync: jest.fn().mockResolvedValue(undefined),
    runAsync: jest.fn().mockResolvedValue(undefined),
    withTransactionAsync: jest.fn(async (callback: () => Promise<void>) => await callback()),
  };
}

function createBeerRows(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `beer-${i + 1}`,
    brew_container: 'pint',
    brew_description: `Description ${i + 1}`,
    brew_style: 'Ale',
    glass_type: null,
  }));
}

describe('migrateToVersion3', () => {
  describe('happy path: glass_type columns do not exist', () => {
    it('acquires and releases the migration lock', async () => {
      const db = createMockMigrationDb();

      await migrateToVersion3(db as never);

      expect(databaseLockManager.acquireLock).toHaveBeenCalledWith('schema-migration-v3');
      expect(databaseLockManager.releaseLock).toHaveBeenCalledWith('schema-migration-v3');
    });

    it('adds glass_type column to allbeers', async () => {
      const db = createMockMigrationDb();

      await migrateToVersion3(db as never);

      const execCalls = (db.execAsync as jest.Mock).mock.calls.map((c: string[]) => c[0]);
      expect(execCalls.some((sql: string) =>
        sql.includes('ALTER TABLE allbeers') && sql.includes('glass_type')
      )).toBe(true);
    });

    it('adds glass_type column to tasted_brew_current_round', async () => {
      const db = createMockMigrationDb();

      await migrateToVersion3(db as never);

      const execCalls = (db.execAsync as jest.Mock).mock.calls.map((c: string[]) => c[0]);
      expect(execCalls.some((sql: string) =>
        sql.includes('ALTER TABLE tasted_brew_current_round') && sql.includes('glass_type')
      )).toBe(true);
    });

    it('records migration version 3', async () => {
      const db = createMockMigrationDb();

      await migrateToVersion3(db as never);

      expect(recordMigration).toHaveBeenCalledWith(db, 3);
    });

    it('runs the migration inside a transaction', async () => {
      const db = createMockMigrationDb();

      await migrateToVersion3(db as never);

      expect(db.withTransactionAsync).toHaveBeenCalledTimes(1);
    });
  });

  describe('backfill: existing beers get glass_type populated', () => {
    it('queries beers without glass_type from both tables', async () => {
      const db = createMockMigrationDb();
      db.getAllAsync.mockResolvedValue([]);

      await migrateToVersion3(db as never);

      const getAllCalls = (db.getAllAsync as jest.Mock).mock.calls.map((c: string[]) => c[0]);
      expect(getAllCalls.some((sql: string) =>
        sql.includes('allbeers') && sql.includes('glass_type IS NULL')
      )).toBe(true);
      expect(getAllCalls.some((sql: string) =>
        sql.includes('tasted_brew_current_round') && sql.includes('glass_type IS NULL')
      )).toBe(true);
    });

    it('runs bulk update for beers that need glass_type backfilled', async () => {
      const db = createMockMigrationDb();
      const beerRows = createBeerRows(3);
      db.getAllAsync.mockResolvedValue(beerRows);

      await migrateToVersion3(db as never);

      expect(db.runAsync).toHaveBeenCalled();
      const runCall = (db.runAsync as jest.Mock).mock.calls[0][0] as string;
      expect(runCall).toContain('UPDATE');
    });

    it('skips bulk update when no beers need backfilling', async () => {
      const db = createMockMigrationDb();
      db.getAllAsync.mockResolvedValue([]);

      await migrateToVersion3(db as never);

      expect(db.runAsync).not.toHaveBeenCalled();
    });

    it('calls onProgress for each batch processed', async () => {
      const db = createMockMigrationDb();
      const beerRows = createBeerRows(5);
      // allbeers returns 5 rows, tasted returns 5 rows
      db.getAllAsync
        .mockResolvedValueOnce(beerRows)
        .mockResolvedValueOnce(beerRows);
      const onProgress = jest.fn();

      await migrateToVersion3(db as never, onProgress);

      expect(onProgress).toHaveBeenCalled();
    });

    it('processes large batches in chunks of 100', async () => {
      const db = createMockMigrationDb();
      // 150 beers should require 2 batch updates per table (100 + 50)
      const beerRows = createBeerRows(150);
      db.getAllAsync
        .mockResolvedValueOnce(beerRows)   // allbeers query
        .mockResolvedValueOnce(beerRows);  // tasted_brew_current_round query

      await migrateToVersion3(db as never);

      // 2 batches per table, 2 tables = 4 runAsync calls
      expect(db.runAsync).toHaveBeenCalledTimes(4);
    });
  });

  describe('error handling: lock is always released', () => {
    it('releases the lock when the transaction throws', async () => {
      const db = createMockMigrationDb();
      db.withTransactionAsync.mockRejectedValue(new Error('Transaction failed'));

      await expect(migrateToVersion3(db as never)).rejects.toThrow('Transaction failed');

      expect(databaseLockManager.releaseLock).toHaveBeenCalledWith('schema-migration-v3');
    });

    it('releases the lock when execAsync throws inside the transaction', async () => {
      const db = createMockMigrationDb();
      db.withTransactionAsync.mockImplementation(async (callback: () => Promise<void>) => {
        db.execAsync.mockRejectedValueOnce(new Error('ALTER TABLE failed'));
        await callback();
      });

      await expect(migrateToVersion3(db as never)).rejects.toThrow('ALTER TABLE failed');

      expect(databaseLockManager.releaseLock).toHaveBeenCalledWith('schema-migration-v3');
    });

    it('propagates error when lock acquisition fails', async () => {
      const db = createMockMigrationDb();
      (databaseLockManager.acquireLock as jest.Mock).mockRejectedValue(
        new Error('Cannot acquire lock: database is shutting down')
      );

      await expect(migrateToVersion3(db as never)).rejects.toThrow('Cannot acquire lock');
    });
  });
});
