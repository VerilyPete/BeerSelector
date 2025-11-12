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

describe('Database Lifecycle Management', () => {
  let mockDb: any;
  let mockCloseAsync: jest.Mock;
  let mockExecAsync: jest.Mock;
  let mockGetFirstAsync: jest.Mock;

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
    resetDatabaseConnection();

    // Create mock database object
    mockCloseAsync = jest.fn().mockResolvedValue(undefined);
    mockExecAsync = jest.fn().mockResolvedValue(undefined);
    mockGetFirstAsync = jest.fn().mockResolvedValue({ journal_mode: 'wal' });

    mockDb = {
      closeAsync: mockCloseAsync,
      execAsync: mockExecAsync,
      getFirstAsync: mockGetFirstAsync,
    };

    // Mock openDatabaseAsync to return our mock database
    (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mockDb);
  });

  afterEach(() => {
    resetDatabaseConnection();
  });

  describe('Database Opening', () => {
    it('should open database successfully', async () => {
      const db = await getDatabase();

      expect(db).toBeDefined();
      expect(SQLite.openDatabaseAsync).toHaveBeenCalledWith('beers.db');
      expect(SQLite.openDatabaseAsync).toHaveBeenCalledTimes(1);
    });

    it('should reuse existing database connection', async () => {
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
      await getDatabase();

      expect(mockGetFirstAsync).toHaveBeenCalledWith('PRAGMA journal_mode = WAL');
    });

    it('should set PRAGMA synchronous to NORMAL', async () => {
      await getDatabase();

      expect(mockExecAsync).toHaveBeenCalledWith('PRAGMA synchronous = NORMAL');
    });

    it('should verify WAL mode was enabled successfully', async () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      await getDatabase();

      expect(consoleLogSpy).toHaveBeenCalledWith('Database journal mode: wal');
      consoleLogSpy.mockRestore();
    });

    it('should warn if WAL mode enablement fails', async () => {
      mockGetFirstAsync.mockResolvedValueOnce({ journal_mode: 'delete' });
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      await getDatabase();

      expect(consoleWarnSpy).toHaveBeenCalledWith('Failed to enable WAL mode, using delete instead');
      consoleWarnSpy.mockRestore();
    });

    it('should handle missing journal_mode in response', async () => {
      mockGetFirstAsync.mockResolvedValueOnce(null);
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      await getDatabase();

      expect(consoleLogSpy).toHaveBeenCalledWith('Database journal mode: unknown');
      expect(consoleWarnSpy).toHaveBeenCalledWith('Failed to enable WAL mode, using unknown instead');

      consoleLogSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });

    it('should not re-execute PRAGMA on connection reuse', async () => {
      await getDatabase();
      mockGetFirstAsync.mockClear();
      mockExecAsync.mockClear();

      await getDatabase();

      expect(mockGetFirstAsync).not.toHaveBeenCalled();
      expect(mockExecAsync).not.toHaveBeenCalled();
    });

    it('should handle PRAGMA execution errors gracefully', async () => {
      const error = new Error('PRAGMA failed');
      mockGetFirstAsync.mockRejectedValueOnce(error);

      await expect(getDatabase()).rejects.toThrow('PRAGMA failed');
    });
  });

  describe('Database Closing', () => {
    it('should close database connection successfully', async () => {
      await getDatabase();
      await closeDatabaseConnection();

      expect(mockCloseAsync).toHaveBeenCalledTimes(1);
    });

    it('should nullify database reference after close', async () => {
      await getDatabase();
      await closeDatabaseConnection();

      // Next getDatabase call should open a new connection
      mockCloseAsync.mockClear();
      (SQLite.openDatabaseAsync as jest.Mock).mockClear();

      await getDatabase();

      expect(SQLite.openDatabaseAsync).toHaveBeenCalledTimes(1);
    });

    it('should handle close when database is not open', async () => {
      // Don't open database, just try to close
      await expect(closeDatabaseConnection()).resolves.not.toThrow();
      expect(mockCloseAsync).not.toHaveBeenCalled();
    });

    it('should handle close errors gracefully', async () => {
      await getDatabase();

      const error = new Error('Close failed');
      mockCloseAsync.mockRejectedValue(error);

      await expect(closeDatabaseConnection()).rejects.toThrow('Close failed');
    });

    it('should log close operation', async () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      await getDatabase();
      await closeDatabaseConnection();

      expect(consoleLogSpy).toHaveBeenCalledWith('Closing database connection...');
      consoleLogSpy.mockRestore();
    });

    it('should log successful close', async () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      await getDatabase();
      await closeDatabaseConnection();

      expect(consoleLogSpy).toHaveBeenCalledWith('Database connection closed successfully');
      consoleLogSpy.mockRestore();
    });

    it('should log errors during close', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      await getDatabase();

      const error = new Error('Close failed');
      mockCloseAsync.mockRejectedValue(error);

      await expect(closeDatabaseConnection()).rejects.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to close database:', error);
      consoleErrorSpy.mockRestore();
    });
  });

  describe('Connection Reuse After Close/Reopen Cycle', () => {
    it('should open new connection after close', async () => {
      const db1 = await getDatabase();
      await closeDatabaseConnection();

      const db2 = await getDatabase();

      expect(SQLite.openDatabaseAsync).toHaveBeenCalledTimes(2);
      expect(db1).toBe(db2); // Same mock object, but opened twice
    });

    it('should re-enable WAL mode after reopen', async () => {
      await getDatabase();
      mockGetFirstAsync.mockClear();
      mockExecAsync.mockClear();

      await closeDatabaseConnection();
      await getDatabase();

      expect(mockGetFirstAsync).toHaveBeenCalledWith('PRAGMA journal_mode = WAL');
      expect(mockExecAsync).toHaveBeenCalledWith('PRAGMA synchronous = NORMAL');
    });

    it('should handle multiple close/open cycles', async () => {
      for (let i = 0; i < 3; i++) {
        await getDatabase();
        await closeDatabaseConnection();
      }

      expect(SQLite.openDatabaseAsync).toHaveBeenCalledTimes(3);
      expect(mockCloseAsync).toHaveBeenCalledTimes(3);
    });
  });

  describe('Forced Close Option', () => {
    it('should support force close without waiting', async () => {
      await getDatabase();
      await closeDatabaseConnection(true);

      expect(mockCloseAsync).toHaveBeenCalledTimes(1);
    });

    it('should log warning when force closing', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      await getDatabase();
      await closeDatabaseConnection(true);

      expect(consoleWarnSpy).toHaveBeenCalledWith('Force closing database connection without waiting for operations to complete');
      consoleWarnSpy.mockRestore();
    });
  });

  describe('Database State Validation', () => {
    it('should verify database is closed after closeDatabaseConnection', async () => {
      await getDatabase();
      await closeDatabaseConnection();

      // Attempt to use closed connection should require reopening
      mockCloseAsync.mockClear();
      (SQLite.openDatabaseAsync as jest.Mock).mockClear();

      await getDatabase();

      expect(SQLite.openDatabaseAsync).toHaveBeenCalledTimes(1);
    });

    it('should handle rapid open/close sequences', async () => {
      const promises = [];

      for (let i = 0; i < 5; i++) {
        promises.push(
          getDatabase().then(() => closeDatabaseConnection())
        );
      }

      await Promise.all(promises);

      // Should have attempted opens and closes
      expect(SQLite.openDatabaseAsync).toHaveBeenCalled();
      expect(mockCloseAsync).toHaveBeenCalled();
    });
  });

  describe('Error Recovery', () => {
    it('should recover from failed close by allowing reopen', async () => {
      await getDatabase();

      mockCloseAsync.mockRejectedValueOnce(new Error('Close failed'));

      try {
        await closeDatabaseConnection();
      } catch (error) {
        // Expected to fail
      }

      // Should still be able to open database again
      mockCloseAsync.mockResolvedValue(undefined);
      (SQLite.openDatabaseAsync as jest.Mock).mockClear();

      await getDatabase();

      expect(SQLite.openDatabaseAsync).toHaveBeenCalledTimes(1);
    });

    it('should handle WAL mode failure on reopen', async () => {
      await getDatabase();
      await closeDatabaseConnection();

      mockGetFirstAsync.mockRejectedValueOnce(new Error('WAL mode failed'));

      await expect(getDatabase()).rejects.toThrow('WAL mode failed');
    });
  });

  describe('Database Lock Manager Integration (CI-HP6-1)', () => {
    it('should allow lock acquisition after database reopens following shutdown', async () => {
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
      await getDatabase();
      await closeDatabaseConnection();

      // Mock console.log to verify resetShutdownState is called
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      await getDatabase();

      expect(consoleLogSpy).toHaveBeenCalledWith('Database lock manager: Resetting shutdown state');
      consoleLogSpy.mockRestore();
    });

    it('should handle multiple background/foreground cycles without lock issues', async () => {
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
