/**
 * Tests for DatabaseLockManager
 *
 * Tests the queue-based lock manager that prevents race conditions
 * during concurrent database operations.
 */

import { DatabaseLockManager } from '../DatabaseLockManager';

describe('DatabaseLockManager', () => {
  let lockManager: DatabaseLockManager;

  beforeEach(() => {
    lockManager = new DatabaseLockManager();
  });

  describe('Basic lock acquisition', () => {
    it('should acquire lock when available', async () => {
      const acquired = await lockManager.acquireLock('test-operation');
      expect(acquired).toBe(true);
      expect(lockManager.isLocked()).toBe(true);
      lockManager.releaseLock('test-operation');
    });

    it('should release lock successfully', async () => {
      await lockManager.acquireLock('test-operation');
      lockManager.releaseLock('test-operation');
      expect(lockManager.isLocked()).toBe(false);
    });

    it('should check lock status correctly', () => {
      expect(lockManager.isLocked()).toBe(false);
    });
  });

  describe('Queue mechanism (FIFO)', () => {
    it('should queue lock requests and process in FIFO order', async () => {
      const executionOrder: number[] = [];

      // Acquire first lock
      await lockManager.acquireLock('operation-1');
      executionOrder.push(1);

      // Queue second operation (won't resolve until first releases)
      const promise2 = lockManager.acquireLock('operation-2').then(acquired => {
        executionOrder.push(2);
        lockManager.releaseLock('operation-2');
        return acquired;
      });

      // Queue third operation (won't resolve until second releases)
      const promise3 = lockManager.acquireLock('operation-3').then(acquired => {
        executionOrder.push(3);
        lockManager.releaseLock('operation-3');
        return acquired;
      });

      // Release first lock - should trigger promise2
      lockManager.releaseLock('operation-1');

      // Wait for queued operations
      await Promise.all([promise2, promise3]);

      // Verify FIFO order
      expect(executionOrder).toEqual([1, 2, 3]);
    });

    it('should handle multiple simultaneous lock requests', async () => {
      const results: boolean[] = [];

      // Acquire first lock
      await lockManager.acquireLock('first');
      results.push(true);

      // Queue 5 operations
      const promises = [];
      for (let i = 2; i <= 6; i++) {
        const promise = lockManager.acquireLock(`operation-${i}`).then(acquired => {
          results.push(acquired);
          lockManager.releaseLock(`operation-${i}`);
          return acquired;
        });
        promises.push(promise);
      }

      // Release first lock
      lockManager.releaseLock('first');

      // Wait for all queued operations
      await Promise.all(promises);

      // All operations should eventually acquire lock
      expect(results).toHaveLength(6);
      expect(results.every(r => r === true)).toBe(true);
    });

    it('should propagate lock to next waiter on release', async () => {
      let op2Acquired = false;

      // First operation acquires lock
      await lockManager.acquireLock('op1');

      // Queue second operation
      const op2Promise = lockManager.acquireLock('op2').then(acquired => {
        op2Acquired = true;
        lockManager.releaseLock('op2');
        return acquired;
      });

      // Release first lock - should immediately propagate to op2
      lockManager.releaseLock('op1');

      // Wait for op2 to complete
      const op2Result = await op2Promise;

      expect(op2Result).toBe(true);
      expect(op2Acquired).toBe(true);
    });

    it('should track queue length correctly', async () => {
      expect(lockManager.getQueueLength()).toBe(0);

      // Hold lock
      await lockManager.acquireLock('holder');
      expect(lockManager.getQueueLength()).toBe(0);

      // Add to queue
      const p1 = lockManager.acquireLock('queued-1');
      expect(lockManager.getQueueLength()).toBe(1);

      const p2 = lockManager.acquireLock('queued-2');
      expect(lockManager.getQueueLength()).toBe(2);

      // Release and verify queue decreases
      lockManager.releaseLock('holder');
      await p1;
      expect(lockManager.getQueueLength()).toBe(1);

      lockManager.releaseLock('queued-1');
      await p2;
      expect(lockManager.getQueueLength()).toBe(0);

      lockManager.releaseLock('queued-2');
    });
  });

  describe('Timeout handling with fake timers', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should auto-release lock after timeout', async () => {
      const acquirePromise = lockManager.acquireLock('long-operation');

      // Let the promise resolve
      await acquirePromise;

      expect(lockManager.isLocked()).toBe(true);

      // Fast-forward to timeout (15 seconds for mobile UX)
      jest.advanceTimersByTime(15000);

      // Lock should be auto-released
      expect(lockManager.isLocked()).toBe(false);
    });

    it('should log warning when lock is forcibly released', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      await lockManager.acquireLock('timeout-test');

      // Trigger timeout
      jest.advanceTimersByTime(15000);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('forcibly released')
      );

      consoleSpy.mockRestore();
    });

    it('should clear timeout when lock is released normally', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      await lockManager.acquireLock('normal-operation');
      lockManager.releaseLock('normal-operation');

      // Advance time - should not trigger warning since timeout was cleared
      jest.advanceTimersByTime(15000);

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('Concurrent operations', () => {
    it('should prevent concurrent database operations', async () => {
      const operationLog: string[] = [];

      const operation1 = async () => {
        if (await lockManager.acquireLock('operation1')) {
          operationLog.push('op1-start');
          // Immediate execution, no setTimeout
          operationLog.push('op1-end');
          lockManager.releaseLock('operation1');
        }
      };

      const operation2 = async () => {
        if (await lockManager.acquireLock('operation2')) {
          operationLog.push('op2-start');
          // Immediate execution, no setTimeout
          operationLog.push('op2-end');
          lockManager.releaseLock('operation2');
        }
      };

      // Run both operations simultaneously
      await Promise.all([operation1(), operation2()]);

      // Operations should not overlap (FIFO order)
      expect(operationLog).toEqual(['op1-start', 'op1-end', 'op2-start', 'op2-end']);
    });

    it('should handle rapid lock requests without race conditions', async () => {
      const results: boolean[] = [];
      const operations = Array.from({ length: 10 }, (_, i) =>
        lockManager.acquireLock(`rapid-op-${i}`).then(acquired => {
          results.push(acquired);
          lockManager.releaseLock(`rapid-op-${i}`);
          return acquired;
        })
      );

      await Promise.all(operations);

      // All should successfully acquire lock
      expect(results).toHaveLength(10);
      expect(results.every(r => r === true)).toBe(true);
    });
  });

  describe('Error recovery', () => {
    it('should allow new operations after failed operation', async () => {
      await lockManager.acquireLock('failing-operation');

      // Simulate operation failure (lock released in finally)
      lockManager.releaseLock('failing-operation');

      // Next operation should succeed
      const acquired = await lockManager.acquireLock('recovery-operation');
      expect(acquired).toBe(true);
      lockManager.releaseLock('recovery-operation');
    });

    it('should handle multiple releases gracefully', async () => {
      await lockManager.acquireLock('test-operation');

      lockManager.releaseLock('test-operation');
      lockManager.releaseLock('test-operation'); // Double release

      // Should not throw error and lock should be available
      const acquired = await lockManager.acquireLock('next-operation');
      expect(acquired).toBe(true);
      lockManager.releaseLock('next-operation');
    });
  });

  describe('Operation tracking', () => {
    it('should track current operation name', async () => {
      expect(lockManager.getCurrentOperation()).toBeNull();

      await lockManager.acquireLock('tracked-operation');
      expect(lockManager.getCurrentOperation()).toBe('tracked-operation');

      lockManager.releaseLock('tracked-operation');
      expect(lockManager.getCurrentOperation()).toBeNull();
    });

    it('should update current operation as queue processes', async () => {
      await lockManager.acquireLock('op1');
      expect(lockManager.getCurrentOperation()).toBe('op1');

      const p2 = lockManager.acquireLock('op2').then(() => {
        expect(lockManager.getCurrentOperation()).toBe('op2');
        lockManager.releaseLock('op2');
      });

      lockManager.releaseLock('op1');
      await p2;
    });
  });

  describe('Logging', () => {
    it('should log lock acquisition', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await lockManager.acquireLock('logged-operation');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Lock acquired for: logged-operation')
      );

      consoleSpy.mockRestore();
      lockManager.releaseLock('logged-operation');
    });

    it('should log lock release', async () => {
      await lockManager.acquireLock('logged-operation');

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      lockManager.releaseLock('logged-operation');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Lock released for: logged-operation')
      );

      consoleSpy.mockRestore();
    });

    it('should log when waiting for lock', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      // First operation holds lock
      await lockManager.acquireLock('blocking-operation');

      // Second operation should log waiting message (immediately on queue entry)
      const secondPromise = lockManager.acquireLock('waiting-operation');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('waiting for lock')
      );

      lockManager.releaseLock('blocking-operation');
      await secondPromise;
      lockManager.releaseLock('waiting-operation');

      consoleSpy.mockRestore();
    });
  });
});
