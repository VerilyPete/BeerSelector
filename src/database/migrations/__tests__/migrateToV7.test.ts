import { migrateToVersion7 } from '../migrateToV7';
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
    getAllAsync: jest.fn(),
    execAsync: jest.fn().mockResolvedValue(undefined),
    runAsync: jest.fn().mockResolvedValue(undefined),
    withTransactionAsync: jest.fn(async (callback: () => Promise<void>) => await callback()),
  };
}

function columnsWithoutEnrichment(): { name: string }[] {
  return [
    { name: 'id' },
    { name: 'brew_name' },
    { name: 'brewer' },
    { name: 'abv' },
  ];
}

function columnsWithEnrichment(): { name: string }[] {
  return [
    { name: 'id' },
    { name: 'brew_name' },
    { name: 'brewer' },
    { name: 'abv' },
    { name: 'enrichment_confidence' },
    { name: 'enrichment_source' },
  ];
}

describe('migrateToVersion7', () => {
  describe('happy path: columns do not exist', () => {
    it('acquires and releases the migration lock', async () => {
      const db = createMockMigrationDb();
      db.getAllAsync.mockResolvedValue(columnsWithoutEnrichment());

      await migrateToVersion7(db as never);

      expect(databaseLockManager.acquireLock).toHaveBeenCalledWith('schema-migration-v7');
      expect(databaseLockManager.releaseLock).toHaveBeenCalledWith('schema-migration-v7');
    });

    it('adds enrichment_confidence and enrichment_source columns to allbeers', async () => {
      const db = createMockMigrationDb();
      db.getAllAsync.mockResolvedValue(columnsWithoutEnrichment());

      await migrateToVersion7(db as never);

      const execCalls = (db.execAsync as jest.Mock).mock.calls.map((c: string[]) => c[0]);
      expect(execCalls.some((sql: string) => sql.includes('enrichment_confidence') && sql.includes('allbeers'))).toBe(true);
      expect(execCalls.some((sql: string) => sql.includes('enrichment_source') && sql.includes('allbeers'))).toBe(true);
    });

    it('adds enrichment_confidence and enrichment_source columns to tasted_brew_current_round', async () => {
      const db = createMockMigrationDb();
      db.getAllAsync.mockResolvedValue(columnsWithoutEnrichment());

      await migrateToVersion7(db as never);

      const execCalls = (db.execAsync as jest.Mock).mock.calls.map((c: string[]) => c[0]);
      expect(execCalls.some((sql: string) => sql.includes('enrichment_confidence') && sql.includes('tasted_brew_current_round'))).toBe(true);
      expect(execCalls.some((sql: string) => sql.includes('enrichment_source') && sql.includes('tasted_brew_current_round'))).toBe(true);
    });

    it('records migration version 7', async () => {
      const db = createMockMigrationDb();
      db.getAllAsync.mockResolvedValue(columnsWithoutEnrichment());

      await migrateToVersion7(db as never);

      expect(recordMigration).toHaveBeenCalledWith(db, 7);
    });

    it('calls onProgress callback when provided', async () => {
      const db = createMockMigrationDb();
      db.getAllAsync.mockResolvedValue(columnsWithoutEnrichment());
      const onProgress = jest.fn();

      await migrateToVersion7(db as never, onProgress);

      expect(onProgress).toHaveBeenCalledWith(1, 1);
    });

    it('runs the migration inside a transaction', async () => {
      const db = createMockMigrationDb();
      db.getAllAsync.mockResolvedValue(columnsWithoutEnrichment());

      await migrateToVersion7(db as never);

      expect(db.withTransactionAsync).toHaveBeenCalledTimes(1);
    });

    it('checks allbeers and tasted_brew_current_round columns before migrating', async () => {
      const db = createMockMigrationDb();
      db.getAllAsync.mockResolvedValue(columnsWithoutEnrichment());

      await migrateToVersion7(db as never);

      const pragmaCalls = (db.getAllAsync as jest.Mock).mock.calls.map((c: string[]) => c[0]);
      expect(pragmaCalls.some((sql: string) => sql.includes('allbeers'))).toBe(true);
      expect(pragmaCalls.some((sql: string) => sql.includes('tasted_brew_current_round'))).toBe(true);
    });
  });

  describe('idempotency: columns already exist', () => {
    it('skips adding enrichment columns to allbeers when they already exist', async () => {
      const db = createMockMigrationDb();
      db.getAllAsync.mockResolvedValue(columnsWithEnrichment());

      await migrateToVersion7(db as never);

      const execCalls = (db.execAsync as jest.Mock).mock.calls.map((c: string[]) => c[0]);
      const allbeersAlterCalls = execCalls.filter(
        (sql: string) => sql.includes('ALTER TABLE allbeers') && (sql.includes('enrichment_confidence') || sql.includes('enrichment_source'))
      );
      expect(allbeersAlterCalls).toHaveLength(0);
    });

    it('skips adding enrichment columns to tasted_brew_current_round when they already exist', async () => {
      const db = createMockMigrationDb();
      db.getAllAsync.mockResolvedValue(columnsWithEnrichment());

      await migrateToVersion7(db as never);

      const execCalls = (db.execAsync as jest.Mock).mock.calls.map((c: string[]) => c[0]);
      const tastedAlterCalls = execCalls.filter(
        (sql: string) => sql.includes('ALTER TABLE tasted_brew_current_round') && (sql.includes('enrichment_confidence') || sql.includes('enrichment_source'))
      );
      expect(tastedAlterCalls).toHaveLength(0);
    });

    it('still records migration even when columns already exist', async () => {
      const db = createMockMigrationDb();
      db.getAllAsync.mockResolvedValue(columnsWithEnrichment());

      await migrateToVersion7(db as never);

      expect(recordMigration).toHaveBeenCalledWith(db, 7);
    });
  });

  describe('error handling: lock is always released', () => {
    it('releases the lock when the transaction throws', async () => {
      const db = createMockMigrationDb();
      db.getAllAsync.mockResolvedValue(columnsWithoutEnrichment());
      db.withTransactionAsync.mockRejectedValue(new Error('Transaction failed'));

      await expect(migrateToVersion7(db as never)).rejects.toThrow('Transaction failed');

      expect(databaseLockManager.releaseLock).toHaveBeenCalledWith('schema-migration-v7');
    });

    it('releases the lock when PRAGMA query throws', async () => {
      const db = createMockMigrationDb();
      db.getAllAsync.mockRejectedValue(new Error('PRAGMA failed'));

      await expect(migrateToVersion7(db as never)).rejects.toThrow('PRAGMA failed');

      expect(databaseLockManager.releaseLock).toHaveBeenCalledWith('schema-migration-v7');
    });
  });
});
