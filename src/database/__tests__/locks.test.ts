/**
 * Tests for database locking mechanism
 */

import { DatabaseLockManager } from '../locks';

describe('DatabaseLockManager', () => {
  let lockManager: DatabaseLockManager;

  beforeEach(() => {
    lockManager = new DatabaseLockManager();
    jest.clearAllMocks();
  });

  describe('acquireLock', () => {
    it('should successfully acquire lock when available', async () => {
      const result = await lockManager.acquireLock('test-operation');

      expect(result).toBe(true);
      expect(lockManager.isLocked()).toBe(true);
    });

    it('should log lock acquisition', async () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      await lockManager.acquireLock('test-operation');

      expect(consoleLogSpy).toHaveBeenCalledWith('Lock acquired for: test-operation');

      consoleLogSpy.mockRestore();
    });
  });

  describe('releaseLock', () => {
    it('should release the lock', async () => {
      await lockManager.acquireLock('operation1');
      expect(lockManager.isLocked()).toBe(true);

      lockManager.releaseLock('operation1');
      expect(lockManager.isLocked()).toBe(false);

      // Should be able to acquire lock immediately
      const result = await lockManager.acquireLock('operation2');
      expect(result).toBe(true);
    });

    it('should log lock release', () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      lockManager.releaseLock('test-operation');

      expect(consoleLogSpy).toHaveBeenCalledWith('Lock released for: test-operation');

      consoleLogSpy.mockRestore();
    });

    it('should handle releasing lock when not held', () => {
      // Should not throw error
      expect(() => lockManager.releaseLock('non-existent-operation')).not.toThrow();
    });
  });

  describe('concurrent operations', () => {
    it('should handle rapid acquire/release cycles', async () => {
      const results: boolean[] = [];

      for (let i = 0; i < 5; i++) {
        const operationName = `operation${i}`;
        const acquired = await lockManager.acquireLock(operationName);
        results.push(acquired);
        if (acquired) {
          lockManager.releaseLock(operationName);
        }
      }

      // All operations should successfully acquire lock
      expect(results).toEqual([true, true, true, true, true]);
    });
  });

  describe('error scenarios', () => {
    it('should handle errors without leaving lock in bad state', async () => {
      await lockManager.acquireLock('operation1');

      try {
        // Simulate an error happening during locked operation
        throw new Error('Operation failed');
      } catch (error) {
        // Release lock in finally block (typical pattern)
        lockManager.releaseLock('operation1');
      }

      // Should be able to acquire lock after error
      const result = await lockManager.acquireLock('operation2');
      expect(result).toBe(true);
    });
  });

  describe('isLocked', () => {
    it('should return false when no lock is held', () => {
      expect(lockManager.isLocked()).toBe(false);
    });

    it('should return true when lock is held', async () => {
      await lockManager.acquireLock('test-operation');

      expect(lockManager.isLocked()).toBe(true);
    });

    it('should return false after lock is released', async () => {
      await lockManager.acquireLock('test-operation');
      lockManager.releaseLock('test-operation');

      expect(lockManager.isLocked()).toBe(false);
    });
  });
});
