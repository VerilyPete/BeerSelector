import { migrateToVersion6 } from '../migrateToV6';
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
  extractABV: jest.fn().mockReturnValue(5.5),
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
    brew_description: `A delicious beer with 5.5% ABV content ${i + 1}`,
  }));
}

describe('migrateToVersion6', () => {
  describe('happy path: abv column does not exist', () => {
    it('acquires and releases the migration lock', async () => {
      const db = createMockMigrationDb();

      await migrateToVersion6(db as never);

      expect(databaseLockManager.acquireLock).toHaveBeenCalledWith('schema-migration-v6');
      expect(databaseLockManager.releaseLock).toHaveBeenCalledWith('schema-migration-v6');
    });

    it('adds abv column to allbeers table', async () => {
      const db = createMockMigrationDb();

      await migrateToVersion6(db as never);

      const execCalls = (db.execAsync as jest.Mock).mock.calls.map((c: string[]) => c[0]);
      expect(execCalls.some((sql: string) =>
        sql.includes('ALTER TABLE allbeers') && sql.includes('abv')
      )).toBe(true);
    });

    it('adds abv column to tasted_brew_current_round table', async () => {
      const db = createMockMigrationDb();

      await migrateToVersion6(db as never);

      const execCalls = (db.execAsync as jest.Mock).mock.calls.map((c: string[]) => c[0]);
      expect(execCalls.some((sql: string) =>
        sql.includes('ALTER TABLE tasted_brew_current_round') && sql.includes('abv')
      )).toBe(true);
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

      const getAllCalls = (db.getAllAsync as jest.Mock).mock.calls.map((c: string[]) => c[0]);
      expect(getAllCalls.some((sql: string) => sql.includes('allbeers'))).toBe(true);
      expect(getAllCalls.some((sql: string) => sql.includes('tasted_brew_current_round'))).toBe(true);
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
      const runCall = (db.runAsync as jest.Mock).mock.calls[0][0] as string;
      expect(runCall).toContain('UPDATE');
      expect(runCall).toContain('abv');
    });

    it('calls onProgress for each batch processed', async () => {
      const db = createMockMigrationDb();
      const beerRows = createBeerRows(5);
      db.getAllAsync
        .mockResolvedValueOnce(beerRows)
        .mockResolvedValueOnce(beerRows);
      const onProgress = jest.fn();

      await migrateToVersion6(db as never, onProgress);

      expect(onProgress).toHaveBeenCalled();
    });

    it('processes large batches in chunks of 100', async () => {
      const db = createMockMigrationDb();
      const beerRows = createBeerRows(150);
      db.getAllAsync
        .mockResolvedValueOnce(beerRows)
        .mockResolvedValueOnce(beerRows);

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

      expect(databaseLockManager.releaseLock).toHaveBeenCalledWith('schema-migration-v6');
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

      expect(databaseLockManager.releaseLock).toHaveBeenCalledWith('schema-migration-v6');
    });

    it('releases the lock when execAsync throws inside the transaction', async () => {
      const db = createMockMigrationDb();
      db.withTransactionAsync.mockImplementation(async (callback: () => Promise<void>) => {
        db.execAsync.mockRejectedValueOnce(new Error('ALTER TABLE failed'));
        await callback();
      });

      await expect(migrateToVersion6(db as never)).rejects.toThrow('ALTER TABLE failed');

      expect(databaseLockManager.releaseLock).toHaveBeenCalledWith('schema-migration-v6');
    });

    it('propagates error when lock acquisition fails', async () => {
      const db = createMockMigrationDb();
      (databaseLockManager.acquireLock as jest.Mock).mockRejectedValue(
        new Error('Cannot acquire lock: database is shutting down')
      );

      await expect(migrateToVersion6(db as never)).rejects.toThrow('Cannot acquire lock');
    });
  });
});
