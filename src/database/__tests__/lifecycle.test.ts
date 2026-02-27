/**
 * Tests for database lifecycle management
 *
 * Tests database connection opening, closing, WAL mode enablement,
 * and connection reuse patterns for proper lifecycle management.
 */

import * as SQLite from 'expo-sqlite';
import { getDatabase, closeDatabaseConnection, resetDatabaseConnection } from '../connection';
import { databaseLockManager } from '../DatabaseLockManager';

// Mock expo-sqlite
jest.mock('expo-sqlite');

type MockDatabase = {
  closeAsync: jest.Mock;
  execAsync: jest.Mock;
  getFirstAsync: jest.Mock;
};

function createMockDatabase(): MockDatabase {
  return {
    closeAsync: jest.fn().mockResolvedValue(undefined),
    execAsync: jest.fn().mockResolvedValue(undefined),
    getFirstAsync: jest.fn().mockResolvedValue({ journal_mode: 'wal' }),
  };
}

describe('Database Lifecycle Management', () => {
  beforeEach(() => {
    (SQLite.openDatabaseAsync as jest.Mock).mockClear();
    resetDatabaseConnection();
  });

  afterEach(() => {
    resetDatabaseConnection();
  });

  describe('Database Opening', () => {
    it('should open database successfully', async () => {
      const mockDb = createMockDatabase();
      (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mockDb);

      const db = await getDatabase();

      expect(db).toBeDefined();
      expect(SQLite.openDatabaseAsync).toHaveBeenCalledWith('beers.db');
      expect(SQLite.openDatabaseAsync).toHaveBeenCalledTimes(1);
    });

    it('should reuse existing database connection', async () => {
      const mockDb = createMockDatabase();
      (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mockDb);

      const db1 = await getDatabase();
      const db2 = await getDatabase();

      expect(db1).toBe(db2);
      expect(SQLite.openDatabaseAsync).toHaveBeenCalledTimes(1);
    });

    it('should throw error if database open fails', async () => {
      const error = new Error('Failed to open database');
      (SQLite.openDatabaseAsync as jest.Mock).mockRejectedValue(error);

      await expect(getDatabase()).rejects.toThrow('Failed to open database');
    });
  });

  describe('WAL Mode Enablement', () => {
    it('should enable WAL mode when opening database', async () => {
      const mockDb = createMockDatabase();
      (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mockDb);

      await getDatabase();

      expect(mockDb.getFirstAsync).toHaveBeenCalledWith('PRAGMA journal_mode = WAL');
    });

    it('should set PRAGMA synchronous to NORMAL', async () => {
      const mockDb = createMockDatabase();
      (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mockDb);

      await getDatabase();

      expect(mockDb.execAsync).toHaveBeenCalledWith('PRAGMA synchronous = NORMAL');
    });

    it('should warn if WAL mode enablement fails', async () => {
      const mockDb = createMockDatabase();
      mockDb.getFirstAsync.mockResolvedValueOnce({ journal_mode: 'delete' });
      (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mockDb);
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      await getDatabase();

      expect(consoleWarnSpy).toHaveBeenCalledWith('Failed to enable WAL mode, using delete instead');
      consoleWarnSpy.mockRestore();
    });

    it('should handle missing journal_mode in response gracefully', async () => {
      const mockDb = createMockDatabase();
      mockDb.getFirstAsync.mockResolvedValueOnce(null);
      (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mockDb);
      jest.spyOn(console, 'log').mockImplementation();
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      await getDatabase();

      expect(consoleWarnSpy).toHaveBeenCalledWith('Failed to enable WAL mode, using unknown instead');

      consoleWarnSpy.mockRestore();
    });

    it('should not re-execute PRAGMA on connection reuse', async () => {
      const mockDb = createMockDatabase();
      (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mockDb);

      await getDatabase();
      mockDb.getFirstAsync.mockClear();
      mockDb.execAsync.mockClear();

      await getDatabase();

      expect(mockDb.getFirstAsync).not.toHaveBeenCalled();
      expect(mockDb.execAsync).not.toHaveBeenCalled();
    });

    it('should handle PRAGMA execution errors gracefully', async () => {
      const mockDb = createMockDatabase();
      const error = new Error('PRAGMA failed');
      mockDb.getFirstAsync.mockRejectedValueOnce(error);
      (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mockDb);

      await expect(getDatabase()).rejects.toThrow('PRAGMA failed');
    });
  });

  describe('Database Closing', () => {
    it('should close database connection successfully', async () => {
      const mockDb = createMockDatabase();
      (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mockDb);

      await getDatabase();
      await closeDatabaseConnection();

      expect(mockDb.closeAsync).toHaveBeenCalledTimes(1);
    });

    it('should nullify database reference after close', async () => {
      const mockDb = createMockDatabase();
      (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mockDb);

      await getDatabase();
      await closeDatabaseConnection();

      // Next getDatabase call should open a new connection
      mockDb.closeAsync.mockClear();
      (SQLite.openDatabaseAsync as jest.Mock).mockClear();

      await getDatabase();

      expect(SQLite.openDatabaseAsync).toHaveBeenCalledTimes(1);
    });

    it('should handle close when database is not open', async () => {
      const mockDb = createMockDatabase();
      (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mockDb);

      // Don't open database, just try to close
      await expect(closeDatabaseConnection()).resolves.not.toThrow();
      expect(mockDb.closeAsync).not.toHaveBeenCalled();
    });

    it('should handle close errors gracefully', async () => {
      const mockDb = createMockDatabase();
      (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mockDb);

      await getDatabase();

      const error = new Error('Close failed');
      mockDb.closeAsync.mockRejectedValue(error);

      await expect(closeDatabaseConnection()).rejects.toThrow('Close failed');
    });

    it('should throw when close errors occur', async () => {
      const mockDb = createMockDatabase();
      (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mockDb);
      jest.spyOn(console, 'error').mockImplementation();

      await getDatabase();

      const error = new Error('Close failed');
      mockDb.closeAsync.mockRejectedValue(error);

      await expect(closeDatabaseConnection()).rejects.toThrow('Close failed');
    });
  });

  describe('Connection Reuse After Close/Reopen Cycle', () => {
    it('should open new connection after close', async () => {
      const mockDb = createMockDatabase();
      (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mockDb);

      const db1 = await getDatabase();
      await closeDatabaseConnection();

      const db2 = await getDatabase();

      expect(SQLite.openDatabaseAsync).toHaveBeenCalledTimes(2);
      expect(db1).toBe(db2); // Same mock object, but opened twice
    });

    it('should re-enable WAL mode after reopen', async () => {
      const mockDb = createMockDatabase();
      (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mockDb);

      await getDatabase();
      mockDb.getFirstAsync.mockClear();
      mockDb.execAsync.mockClear();

      await closeDatabaseConnection();
      await getDatabase();

      expect(mockDb.getFirstAsync).toHaveBeenCalledWith('PRAGMA journal_mode = WAL');
      expect(mockDb.execAsync).toHaveBeenCalledWith('PRAGMA synchronous = NORMAL');
    });

    it('should handle multiple close/open cycles', async () => {
      const mockDb = createMockDatabase();
      (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mockDb);

      for (let i = 0; i < 3; i++) {
        await getDatabase();
        await closeDatabaseConnection();
      }

      expect(SQLite.openDatabaseAsync).toHaveBeenCalledTimes(3);
      expect(mockDb.closeAsync).toHaveBeenCalledTimes(3);
    });
  });

  describe('Forced Close Option', () => {
    it('should support force close without waiting', async () => {
      const mockDb = createMockDatabase();
      (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mockDb);

      await getDatabase();
      await closeDatabaseConnection(true);

      expect(mockDb.closeAsync).toHaveBeenCalledTimes(1);
    });

  });

  describe('Database State Validation', () => {
    it('should verify database is closed after closeDatabaseConnection', async () => {
      const mockDb = createMockDatabase();
      (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mockDb);

      await getDatabase();
      await closeDatabaseConnection();

      // Attempt to use closed connection should require reopening
      mockDb.closeAsync.mockClear();
      (SQLite.openDatabaseAsync as jest.Mock).mockClear();

      await getDatabase();

      expect(SQLite.openDatabaseAsync).toHaveBeenCalledTimes(1);
    });

    it('should handle rapid open/close sequences', async () => {
      const mockDb = createMockDatabase();
      (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mockDb);

      const promises = [];

      for (let i = 0; i < 5; i++) {
        promises.push(
          getDatabase().then(() => closeDatabaseConnection())
        );
      }

      await Promise.all(promises);

      // Should have attempted opens and closes
      expect(SQLite.openDatabaseAsync).toHaveBeenCalled();
      expect(mockDb.closeAsync).toHaveBeenCalled();
    });
  });

  describe('Error Recovery', () => {
    it('should recover from failed close by allowing reopen', async () => {
      const mockDb = createMockDatabase();
      (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mockDb);

      await getDatabase();

      mockDb.closeAsync.mockRejectedValueOnce(new Error('Close failed'));

      try {
        await closeDatabaseConnection();
      } catch (error) {
        // Expected to fail
      }

      // Should still be able to open database again
      mockDb.closeAsync.mockResolvedValue(undefined);
      (SQLite.openDatabaseAsync as jest.Mock).mockClear();

      await getDatabase();

      expect(SQLite.openDatabaseAsync).toHaveBeenCalledTimes(1);
    });

    it('should handle WAL mode failure on reopen', async () => {
      const mockDb = createMockDatabase();
      (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mockDb);

      await getDatabase();
      await closeDatabaseConnection();

      mockDb.getFirstAsync.mockRejectedValueOnce(new Error('WAL mode failed'));

      await expect(getDatabase()).rejects.toThrow('WAL mode failed');
    });
  });

  describe('Database Lock Manager Integration (CI-HP6-1)', () => {
    it('should allow lock acquisition after database reopens following shutdown', async () => {
      const mockDb = createMockDatabase();
      (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mockDb);

      const database = await getDatabase();
      expect(database).toBeDefined();

      // Close the database (triggers prepareForShutdown which sets isShuttingDown = true)
      await closeDatabaseConnection();

      // Reopen database (should reset isShuttingDown flag)
      const reopenedDb = await getDatabase();
      expect(reopenedDb).toBeDefined();

      // Should be able to acquire lock again (this would fail without resetShutdownState)
      const acquired = await databaseLockManager.acquireLock('post-reopen-operation');
      expect(acquired).toBe(true);

      // Clean up
      databaseLockManager.releaseLock('post-reopen-operation');
    });

    it('should reset shutdown state when getDatabase is called after close', async () => {
      const mockDb = createMockDatabase();
      (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mockDb);

      await getDatabase();
      await closeDatabaseConnection();
      jest.spyOn(console, 'log').mockImplementation();

      await getDatabase();

      // Verify shutdown state was reset by being able to acquire a lock
      const acquired = await databaseLockManager.acquireLock('post-reopen-lock-check');
      expect(acquired).toBe(true);
      databaseLockManager.releaseLock('post-reopen-lock-check');
    });

    it('should handle multiple background/foreground cycles without lock issues', async () => {
      const mockDb = createMockDatabase();
      (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mockDb);

      // Simulate app lifecycle: open -> background -> foreground -> background -> foreground
      for (let i = 0; i < 3; i++) {
        const db = await getDatabase();
        expect(db).toBeDefined();

        // Acquire a lock to simulate an operation
        const acquired = await databaseLockManager.acquireLock(`cycle-${i}-operation`);
        expect(acquired).toBe(true);

        // Release the lock
        databaseLockManager.releaseLock(`cycle-${i}-operation`);

        // Close database (background)
        await closeDatabaseConnection();

        // Next iteration will reopen (foreground)
      }

      // Final verification - should still be able to acquire lock
      await getDatabase();
      const finalAcquired = await databaseLockManager.acquireLock('final-operation');
      expect(finalAcquired).toBe(true);
      databaseLockManager.releaseLock('final-operation');
    });
  });
});
