/**
 * Tests for database locking mechanism
 */

import { DatabaseLockManager, databaseLockManager } from '../locks';

function createLockManager(): DatabaseLockManager {
  return new DatabaseLockManager();
}

describe('DatabaseLockManager', () => {
  describe('module exports (HP-2 Step 6a)', () => {
    it('should export DatabaseLockManager class from locks.ts', () => {
      expect(DatabaseLockManager).toBeDefined();
      expect(typeof DatabaseLockManager).toBe('function');
    });

    it('should export singleton databaseLockManager instance from locks.ts', () => {
      expect(databaseLockManager).toBeDefined();
      expect(databaseLockManager).toBeInstanceOf(DatabaseLockManager);
    });

    it('should allow creating new instances of DatabaseLockManager', () => {
      const instance1 = new DatabaseLockManager();
      const instance2 = new DatabaseLockManager();

      expect(instance1).toBeInstanceOf(DatabaseLockManager);
      expect(instance2).toBeInstanceOf(DatabaseLockManager);
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('acquireLock', () => {
    it('should successfully acquire lock when available', async () => {
      const lockManager = createLockManager();
      const result = await lockManager.acquireLock('test-operation');

      expect(result).toBe(true);
      expect(lockManager.isLocked()).toBe(true);
    });

    it('should log lock acquisition', async () => {
      const lockManager = createLockManager();
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      await lockManager.acquireLock('test-operation');

      expect(consoleLogSpy).toHaveBeenCalledWith('Lock acquired for: test-operation');

      consoleLogSpy.mockRestore();
    });
  });

  describe('releaseLock', () => {
    it('should release the lock', async () => {
      const lockManager = createLockManager();
      await lockManager.acquireLock('operation1');
      expect(lockManager.isLocked()).toBe(true);

      lockManager.releaseLock('operation1');
      expect(lockManager.isLocked()).toBe(false);

      // Should be able to acquire lock immediately
      const result = await lockManager.acquireLock('operation2');
      expect(result).toBe(true);
    });

    it('should log lock release', () => {
      const lockManager = createLockManager();
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      lockManager.releaseLock('test-operation');

      expect(consoleLogSpy).toHaveBeenCalledWith('Lock released for: test-operation');

      consoleLogSpy.mockRestore();
    });

    it('should handle releasing lock when not held', () => {
      const lockManager = createLockManager();
      // Should not throw error
      expect(() => lockManager.releaseLock('non-existent-operation')).not.toThrow();
    });
  });

  describe('concurrent operations', () => {
    it('should handle rapid acquire/release cycles', async () => {
      const lockManager = createLockManager();
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
      const lockManager = createLockManager();
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
      const lockManager = createLockManager();
      expect(lockManager.isLocked()).toBe(false);
    });

    it('should return true when lock is held', async () => {
      const lockManager = createLockManager();
      await lockManager.acquireLock('test-operation');

      expect(lockManager.isLocked()).toBe(true);
    });

    it('should return false after lock is released', async () => {
      const lockManager = createLockManager();
      await lockManager.acquireLock('test-operation');
      lockManager.releaseLock('test-operation');

      expect(lockManager.isLocked()).toBe(false);
    });
  });

  describe('getQueueLength (HP-2 Step 6a edge cases)', () => {
    it('should return 0 when queue is empty', () => {
      const lockManager = createLockManager();
      expect(lockManager.getQueueLength()).toBe(0);
    });

    it('should return correct queue length when operations are waiting', async () => {
      const lockManager = createLockManager();
      // First operation acquires lock
      await lockManager.acquireLock('operation1');

      // Second operation waits in queue
      const promise2 = lockManager.acquireLock('operation2');
      expect(lockManager.getQueueLength()).toBe(1);

      // Third operation waits in queue
      const promise3 = lockManager.acquireLock('operation3');
      expect(lockManager.getQueueLength()).toBe(2);

      // Release first lock - second should acquire
      lockManager.releaseLock('operation1');
      await promise2;
      expect(lockManager.getQueueLength()).toBe(1);

      // Release second lock - third should acquire
      lockManager.releaseLock('operation2');
      await promise3;
      expect(lockManager.getQueueLength()).toBe(0);

      lockManager.releaseLock('operation3');
    });
  });

  describe('getCurrentOperation (HP-2 Step 6a edge cases)', () => {
    it('should return null when no lock is held', () => {
      const lockManager = createLockManager();
      expect(lockManager.getCurrentOperation()).toBeNull();
    });

    it('should return current operation name', async () => {
      const lockManager = createLockManager();
      await lockManager.acquireLock('my-operation');

      expect(lockManager.getCurrentOperation()).toBe('my-operation');

      lockManager.releaseLock('my-operation');
    });

    it('should return null after lock is released', async () => {
      const lockManager = createLockManager();
      await lockManager.acquireLock('operation');
      lockManager.releaseLock('operation');

      expect(lockManager.getCurrentOperation()).toBeNull();
    });
  });

  describe('concurrent access patterns (HP-2 Step 6a)', () => {
    it('should handle 10 concurrent lock requests sequentially', async () => {
      const lockManager = createLockManager();
      const operations: Promise<boolean>[] = [];
      const executionOrder: number[] = [];

      // Start 10 operations concurrently
      for (let i = 0; i < 10; i++) {
        operations.push(
          lockManager.acquireLock(`operation${i}`).then(() => {
            executionOrder.push(i);
            lockManager.releaseLock(`operation${i}`);
            return true;
          })
        );
      }

      await Promise.all(operations);

      // All should have executed in order (FIFO)
      expect(executionOrder).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });

    it('should maintain correct state with rapid queue/dequeue', async () => {
      const lockManager = createLockManager();
      // Acquire initial lock
      await lockManager.acquireLock('operation1');

      // Queue multiple operations
      const promises = [
        lockManager.acquireLock('operation2'),
        lockManager.acquireLock('operation3'),
        lockManager.acquireLock('operation4')
      ];

      expect(lockManager.getQueueLength()).toBe(3);
      expect(lockManager.isLocked()).toBe(true);
      expect(lockManager.getCurrentOperation()).toBe('operation1');

      // Release and let them process
      lockManager.releaseLock('operation1');
      await promises[0];

      expect(lockManager.getQueueLength()).toBe(2);
      expect(lockManager.getCurrentOperation()).toBe('operation2');

      lockManager.releaseLock('operation2');
      await promises[1];

      expect(lockManager.getQueueLength()).toBe(1);
      expect(lockManager.getCurrentOperation()).toBe('operation3');

      lockManager.releaseLock('operation3');
      await promises[2];

      expect(lockManager.getQueueLength()).toBe(0);
      expect(lockManager.getCurrentOperation()).toBe('operation4');

      lockManager.releaseLock('operation4');

      expect(lockManager.isLocked()).toBe(false);
      expect(lockManager.getCurrentOperation()).toBeNull();
    });
  });

  describe('singleton instance (HP-2 Step 6a)', () => {
    it('should use same singleton instance across imports', () => {
      const instance1 = databaseLockManager;
      const instance2 = databaseLockManager;

      expect(instance1).toBe(instance2);
    });

    it('should maintain state in singleton instance', async () => {
      await databaseLockManager.acquireLock('singleton-test');

      expect(databaseLockManager.isLocked()).toBe(true);
      expect(databaseLockManager.getCurrentOperation()).toBe('singleton-test');

      databaseLockManager.releaseLock('singleton-test');

      expect(databaseLockManager.isLocked()).toBe(false);
    });
  });

  describe('lock metrics (HP-2 Step 8)', () => {
    it('should return correct metrics when no lock held', () => {
      const lockManager = createLockManager();
      const metrics = lockManager.getLockMetrics();

      expect(metrics.currentOperation).toBeNull();
      expect(metrics.queueLength).toBe(0);
      expect(metrics.queueWaitTimes).toEqual([]);
    });

    it('should return current operation in metrics', async () => {
      const lockManager = createLockManager();
      await lockManager.acquireLock('test-operation');

      const metrics = lockManager.getLockMetrics();

      expect(metrics.currentOperation).toBe('test-operation');
      expect(metrics.queueLength).toBe(0);

      lockManager.releaseLock('test-operation');
    });

    it('should return queue length in metrics', async () => {
      const lockManager = createLockManager();
      await lockManager.acquireLock('operation1');

      // Queue additional operations
      const promise2 = lockManager.acquireLock('operation2');
      const promise3 = lockManager.acquireLock('operation3');

      const metrics = lockManager.getLockMetrics();

      expect(metrics.currentOperation).toBe('operation1');
      expect(metrics.queueLength).toBe(2);

      // Cleanup
      lockManager.releaseLock('operation1');
      await promise2;
      lockManager.releaseLock('operation2');
      await promise3;
      lockManager.releaseLock('operation3');
    });

    it('should track queue wait times', async () => {
      const lockManager = createLockManager();
      await lockManager.acquireLock('operation1');

      // Queue another operation
      const promise2 = lockManager.acquireLock('operation2');

      // Release first lock so second can acquire
      lockManager.releaseLock('operation1');
      await promise2;

      const metrics = lockManager.getLockMetrics();

      // Should have recorded wait time for operation2
      expect(metrics.queueWaitTimes.length).toBe(1);
      expect(metrics.queueWaitTimes[0]).toBeGreaterThanOrEqual(0);

      lockManager.releaseLock('operation2');
    });

    it('should limit wait time history to 10 entries', async () => {
      const lockManager = createLockManager();
      // Perform 15 lock operations to exceed the MAX_WAIT_TIME_HISTORY of 10
      for (let i = 0; i < 15; i++) {
        await lockManager.acquireLock(`operation-${i}-holder`);

        const waitingPromise = lockManager.acquireLock(`operation-${i}-waiter`);

        lockManager.releaseLock(`operation-${i}-holder`);
        await waitingPromise;
        lockManager.releaseLock(`operation-${i}-waiter`);
      }

      const metrics = lockManager.getLockMetrics();

      // Should only keep last 10 wait times
      expect(metrics.queueWaitTimes.length).toBeLessThanOrEqual(10);
    });

    it('should return a copy of wait times array', () => {
      const lockManager = createLockManager();
      const metrics1 = lockManager.getLockMetrics();
      const metrics2 = lockManager.getLockMetrics();

      // Should be different array instances (deep equality)
      expect(metrics1.queueWaitTimes).not.toBe(metrics2.queueWaitTimes);
      expect(metrics1.queueWaitTimes).toEqual(metrics2.queueWaitTimes);
    });
  });

  describe('debug logging (HP-2 Step 8)', () => {
    it('should enable debug logging', () => {
      const lockManager = createLockManager();
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      lockManager.setDebugLogging(true);

      expect(consoleLogSpy).toHaveBeenCalledWith('[LockManager] Debug logging enabled');

      consoleLogSpy.mockRestore();
    });

    it('should log detailed lock acquisition when debug enabled', async () => {
      const lockManager = createLockManager();
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      lockManager.setDebugLogging(true);

      await lockManager.acquireLock('debug-test');

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('[LockManager] Lock acquired immediately for: debug-test'));

      lockManager.releaseLock('debug-test');
      lockManager.setDebugLogging(false);
      consoleLogSpy.mockRestore();
    });

    it('should log wait time when debug enabled for queued operations', async () => {
      const lockManager = createLockManager();
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      lockManager.setDebugLogging(true);

      await lockManager.acquireLock('operation1');
      const promise2 = lockManager.acquireLock('operation2');

      lockManager.releaseLock('operation1');
      await promise2;

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringMatching(/\[LockManager\] Lock acquired for: operation2 \(waited \d+ms\)/));

      lockManager.releaseLock('operation2');
      lockManager.setDebugLogging(false);
      consoleLogSpy.mockRestore();
    });
  });

  describe('queue warning (HP-2 Step 8)', () => {
    it('should warn when queue length exceeds threshold', async () => {
      const lockManager = createLockManager();
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      await lockManager.acquireLock('operation1');

      // Queue 5 operations to hit the threshold
      const promises = [];
      for (let i = 2; i <= 6; i++) {
        promises.push(lockManager.acquireLock(`operation${i}`));
      }

      // Should have warned on the 5th queued operation
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Queue length is 5, exceeding threshold of 5'));

      // Cleanup
      lockManager.releaseLock('operation1');
      for (const promise of promises) {
        await promise;
        lockManager.releaseLock(lockManager.getCurrentOperation()!);
      }

      consoleWarnSpy.mockRestore();
    });
  });
});
