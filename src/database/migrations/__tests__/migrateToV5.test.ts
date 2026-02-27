import { migrateToVersion5 } from '../migrateToV5';
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
  getContainerType: jest.fn().mockReturnValue('flight'),
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

      await migrateToVersion5(db as never);

      expect(databaseLockManager.acquireLock).toHaveBeenCalledWith('schema-migration-v5');
      expect(databaseLockManager.releaseLock).toHaveBeenCalledWith('schema-migration-v5');
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

      const getAllCalls = (db.getAllAsync as jest.Mock).mock.calls.map((c: string[]) => c[0]);
      expect(getAllCalls.some((sql: string) =>
        sql.includes('allbeers') &&
        sql.includes('container_type IS NULL') &&
        sql.includes('flight')
      )).toBe(true);
    });

    it('queries tasted_brew_current_round for rows that may be flights with null container_type', async () => {
      const db = createMockMigrationDb();

      await migrateToVersion5(db as never);

      const getAllCalls = (db.getAllAsync as jest.Mock).mock.calls.map((c: string[]) => c[0]);
      expect(getAllCalls.some((sql: string) =>
        sql.includes('tasted_brew_current_round') &&
        sql.includes('container_type IS NULL') &&
        sql.includes('flight')
      )).toBe(true);
    });

    it('runs bulk update for flight beers', async () => {
      const db = createMockMigrationDb();
      const beerRows = createFlightBeerRows(3);
      db.getAllAsync.mockResolvedValue(beerRows);

      await migrateToVersion5(db as never);

      expect(db.runAsync).toHaveBeenCalled();
      const runCall = (db.runAsync as jest.Mock).mock.calls[0][0] as string;
      expect(runCall).toContain('UPDATE');
    });

    it('calls onProgress for each batch processed', async () => {
      const db = createMockMigrationDb();
      const beerRows = createFlightBeerRows(5);
      db.getAllAsync
        .mockResolvedValueOnce(beerRows)
        .mockResolvedValueOnce(beerRows);
      const onProgress = jest.fn();

      await migrateToVersion5(db as never, onProgress);

      expect(onProgress).toHaveBeenCalled();
    });

    it('processes large batches in chunks of 100', async () => {
      const db = createMockMigrationDb();
      const beerRows = createFlightBeerRows(150);
      db.getAllAsync
        .mockResolvedValueOnce(beerRows)
        .mockResolvedValueOnce(beerRows);

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

      expect(databaseLockManager.releaseLock).toHaveBeenCalledWith('schema-migration-v5');
    });

    it('releases the lock when getAllAsync throws inside the transaction', async () => {
      const db = createMockMigrationDb();
      db.withTransactionAsync.mockImplementation(async (callback: () => Promise<void>) => {
        db.getAllAsync.mockRejectedValueOnce(new Error('Query failed'));
        await callback();
      });

      await expect(migrateToVersion5(db as never)).rejects.toThrow('Query failed');

      expect(databaseLockManager.releaseLock).toHaveBeenCalledWith('schema-migration-v5');
    });

    it('propagates error when lock acquisition fails', async () => {
      const db = createMockMigrationDb();
      (databaseLockManager.acquireLock as jest.Mock).mockRejectedValue(
        new Error('Cannot acquire lock: database is shutting down')
      );

      await expect(migrateToVersion5(db as never)).rejects.toThrow('Cannot acquire lock');
    });
  });
});
