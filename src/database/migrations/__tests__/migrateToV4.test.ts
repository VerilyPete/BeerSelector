import { migrateToVersion4 } from '../migrateToV4';
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
  getContainerType: jest.fn().mockReturnValue('can'),
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

function createCanBeerRows(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `beer-${i + 1}`,
    brew_container: 'can',
    brew_description: `Description ${i + 1}`,
    brew_style: 'Lager',
    container_type: null,
  }));
}

describe('migrateToVersion4', () => {
  describe('happy path: glass_type column exists, no rows already have container_type', () => {
    it('acquires and releases the migration lock', async () => {
      const db = createMockMigrationDb();

      await migrateToVersion4(db as never);

      expect(databaseLockManager.acquireLock).toHaveBeenCalledWith('schema-migration-v4');
      expect(databaseLockManager.releaseLock).toHaveBeenCalledWith('schema-migration-v4');
    });

    it('renames glass_type to container_type in allbeers', async () => {
      const db = createMockMigrationDb();

      await migrateToVersion4(db as never);

      const execCalls = (db.execAsync as jest.Mock).mock.calls.map((c: string[]) => c[0]);
      expect(execCalls.some((sql: string) =>
        sql.includes('ALTER TABLE allbeers') &&
        sql.includes('RENAME COLUMN glass_type TO container_type')
      )).toBe(true);
    });

    it('renames glass_type to container_type in tasted_brew_current_round', async () => {
      const db = createMockMigrationDb();

      await migrateToVersion4(db as never);

      const execCalls = (db.execAsync as jest.Mock).mock.calls.map((c: string[]) => c[0]);
      expect(execCalls.some((sql: string) =>
        sql.includes('ALTER TABLE tasted_brew_current_round') &&
        sql.includes('RENAME COLUMN glass_type TO container_type')
      )).toBe(true);
    });

    it('records migration version 4', async () => {
      const db = createMockMigrationDb();

      await migrateToVersion4(db as never);

      expect(recordMigration).toHaveBeenCalledWith(db, 4);
    });

    it('runs the migration inside a transaction', async () => {
      const db = createMockMigrationDb();

      await migrateToVersion4(db as never);

      expect(db.withTransactionAsync).toHaveBeenCalledTimes(1);
    });

    it('queries both tables for rows needing container type recalculation', async () => {
      const db = createMockMigrationDb();

      await migrateToVersion4(db as never);

      const getAllCalls = (db.getAllAsync as jest.Mock).mock.calls.map((c: string[]) => c[0]);
      expect(getAllCalls.some((sql: string) =>
        sql.includes('allbeers') && sql.includes('container_type IS NULL')
      )).toBe(true);
      expect(getAllCalls.some((sql: string) =>
        sql.includes('tasted_brew_current_round') && sql.includes('container_type IS NULL')
      )).toBe(true);
    });

    it('skips bulk update when no rows need recalculation', async () => {
      const db = createMockMigrationDb();
      db.getAllAsync.mockResolvedValue([]);

      await migrateToVersion4(db as never);

      expect(db.runAsync).not.toHaveBeenCalled();
    });
  });

  describe('idempotency: no rows need container_type recalculation', () => {
    it('completes successfully when no can/bottle beers have null container_type', async () => {
      const db = createMockMigrationDb();
      db.getAllAsync.mockResolvedValue([]);

      await migrateToVersion4(db as never);

      expect(recordMigration).toHaveBeenCalledWith(db, 4);
      expect(db.runAsync).not.toHaveBeenCalled();
    });

    it('still records migration when no rows need updating', async () => {
      const db = createMockMigrationDb();
      db.getAllAsync.mockResolvedValue([]);

      await migrateToVersion4(db as never);

      expect(recordMigration).toHaveBeenCalledWith(db, 4);
    });
  });

  describe('bulk update: can/bottle rows get container_type recalculated', () => {
    it('runs bulk update for can/bottle beers that need container_type set', async () => {
      const db = createMockMigrationDb();
      const beerRows = createCanBeerRows(3);
      db.getAllAsync.mockResolvedValue(beerRows);

      await migrateToVersion4(db as never);

      expect(db.runAsync).toHaveBeenCalled();
      const runCall = (db.runAsync as jest.Mock).mock.calls[0][0] as string;
      expect(runCall).toContain('UPDATE');
    });

    it('calls onProgress for each batch processed', async () => {
      const db = createMockMigrationDb();
      const beerRows = createCanBeerRows(5);
      db.getAllAsync
        .mockResolvedValueOnce(beerRows)
        .mockResolvedValueOnce(beerRows);
      const onProgress = jest.fn();

      await migrateToVersion4(db as never, onProgress);

      expect(onProgress).toHaveBeenCalled();
    });

    it('processes large batches in chunks of 100', async () => {
      const db = createMockMigrationDb();
      const beerRows = createCanBeerRows(150);
      db.getAllAsync
        .mockResolvedValueOnce(beerRows)
        .mockResolvedValueOnce(beerRows);

      await migrateToVersion4(db as never);

      // 2 batches per table (100 + 50), 2 tables = 4 runAsync calls
      expect(db.runAsync).toHaveBeenCalledTimes(4);
    });
  });

  describe('error handling: lock is always released', () => {
    it('releases the lock when the transaction throws', async () => {
      const db = createMockMigrationDb();
      db.withTransactionAsync.mockRejectedValue(new Error('Transaction failed'));

      await expect(migrateToVersion4(db as never)).rejects.toThrow('Transaction failed');

      expect(databaseLockManager.releaseLock).toHaveBeenCalledWith('schema-migration-v4');
    });

    it('releases the lock when execAsync throws inside the transaction', async () => {
      const db = createMockMigrationDb();
      db.withTransactionAsync.mockImplementation(async (callback: () => Promise<void>) => {
        db.execAsync.mockRejectedValueOnce(new Error('RENAME COLUMN failed'));
        await callback();
      });

      await expect(migrateToVersion4(db as never)).rejects.toThrow('RENAME COLUMN failed');

      expect(databaseLockManager.releaseLock).toHaveBeenCalledWith('schema-migration-v4');
    });

    it('propagates error when lock acquisition fails', async () => {
      const db = createMockMigrationDb();
      (databaseLockManager.acquireLock as jest.Mock).mockRejectedValue(
        new Error('Cannot acquire lock: database is shutting down')
      );

      await expect(migrateToVersion4(db as never)).rejects.toThrow('Cannot acquire lock');
    });
  });
});
