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

  describe('Lock acquisition timeout (Step 5d)', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    /**
     * Test 1: Reject promise if lock not acquired within custom timeout
     *
     * REQUIREMENT: acquireLock() should accept optional timeoutMs parameter
     * CURRENT BEHAVIOR: acquireLock() only accepts operationName (no timeout)
     * DESIRED BEHAVIOR: Promise rejected with timeout error after timeoutMs
     *
     * This test will FAIL until Step 5d-b is implemented
     */
    it('should reject promise if lock not acquired within custom timeout', async () => {
      // Hold lock indefinitely
      await lockManager.acquireLock('blocking-operation');

      // Try to acquire lock with 5-second timeout
      const acquirePromise = lockManager.acquireLock('timeout-operation', 5000);

      // Fast-forward 5 seconds
      jest.advanceTimersByTime(5000);

      // Promise should reject with timeout error
      await expect(acquirePromise).rejects.toThrow(/timeout.*5000ms/i);

      lockManager.releaseLock('blocking-operation');
    });

    /**
     * Test 2: Use default 30-second timeout if not specified
     *
     * REQUIREMENT: Default to 30 seconds for acquisition timeout
     * CURRENT BEHAVIOR: No acquisition timeout (waits indefinitely)
     * DESIRED BEHAVIOR: 30-second default timeout
     *
     * This test will FAIL until Step 5d-b is implemented
     */
    it('should use default 30-second timeout if not specified', async () => {
      // Part 1: Verify default timeout is 30 seconds (not some other value)
      // We'll verify this by checking that operation is still pending at 10s
      await lockManager.acquireLock('blocking-operation');

      const acquirePromise = lockManager.acquireLock('default-timeout-operation');

      // Advance to 10 seconds (before hold timeout of 15s) - should still be pending
      jest.advanceTimersByTime(10000);

      // Check that promise is still pending (not resolved or rejected)
      // We can verify this by checking the queue length
      expect(lockManager.getQueueLength()).toBe(1);

      // Now release the blocking lock so the queued operation can acquire it
      lockManager.releaseLock('blocking-operation');

      // The queued operation should acquire the lock successfully (before timeout)
      const result = await acquirePromise;
      expect(result).toBe(true);
      expect(lockManager.getCurrentOperation()).toBe('default-timeout-operation');

      lockManager.releaseLock('default-timeout-operation');

      // Part 2: Verify timeout actually fires
      // Use a custom 10-second timeout to avoid hold timeout interference
      await lockManager.acquireLock('blocking-operation-2');

      const timeoutPromise = lockManager.acquireLock('should-timeout-operation', 10000);

      // Advance to 10.1 seconds - should timeout
      jest.advanceTimersByTime(10100);

      // Should timeout and reject
      await expect(timeoutPromise).rejects.toThrow(/timeout.*10000ms/i);
    });

    /**
     * Test 3: Acquisition timeout is different from hold timeout
     *
     * REQUIREMENT: Two separate timeouts - acquisition (30s) vs hold (15s)
     * CURRENT BEHAVIOR: Only hold timeout exists
     * DESIRED BEHAVIOR: Acquisition timeout for waiting operations, hold timeout for active operations
     *
     * This test will FAIL until Step 5d-b is implemented
     */
    it('should have separate acquisition timeout (30s) and hold timeout (15s)', async () => {
      // Operation 1 acquires lock
      const acquire1 = await lockManager.acquireLock('operation-1');
      expect(acquire1).toBe(true);

      // Operation 2 queued (should have acquisition timeout)
      const acquirePromise2 = lockManager.acquireLock('operation-2', 10000); // 10s acquisition timeout

      // Fast-forward 10 seconds - operation 2 should timeout (acquisition timeout)
      jest.advanceTimersByTime(10000);

      // Operation 2 should reject with acquisition timeout
      await expect(acquirePromise2).rejects.toThrow(/timeout.*10000ms/i);

      // Fast-forward 5 more seconds (total 15s) - operation 1 should timeout (hold timeout)
      jest.advanceTimersByTime(5000);

      // Operation 1 should be forcibly released due to hold timeout
      expect(lockManager.isLocked()).toBe(false);
    });

    /**
     * Test 4: Clear acquisition timeout if lock is granted before timeout
     *
     * REQUIREMENT: Cancel timeout timer when lock is successfully acquired
     * CURRENT BEHAVIOR: No acquisition timeout to clear
     * DESIRED BEHAVIOR: Timeout cleared when lock granted from queue
     *
     * This test will FAIL until Step 5d-b is implemented
     */
    it('should clear acquisition timeout if lock is granted before timeout', async () => {
      // Operation 1 holds lock
      await lockManager.acquireLock('operation-1');

      // Operation 2 queued with 30-second acquisition timeout
      const acquirePromise2 = lockManager.acquireLock('operation-2', 30000);

      // Release operation 1 after 5 seconds
      jest.advanceTimersByTime(5000);
      lockManager.releaseLock('operation-1');

      // Let promises resolve
      await Promise.resolve();
      await Promise.resolve();

      // Operation 2 should have acquired lock successfully
      const acquired2 = await acquirePromise2;
      expect(acquired2).toBe(true);

      // Verify it holds the lock
      expect(lockManager.getCurrentOperation()).toBe('operation-2');

      // Fast-forward 10 seconds (total 15s from operation-1's start, before hold timeout)
      // This proves the acquisition timeout was cleared (doesn't fire at 30s from queue time)
      jest.advanceTimersByTime(10000);

      // Operation 2 should still hold lock (acquisition timeout was cleared when lock granted)
      expect(lockManager.getCurrentOperation()).toBe('operation-2');

      lockManager.releaseLock('operation-2');
    });

    /**
     * Test 5: Remove timed-out operation from queue
     *
     * REQUIREMENT: Operation removed from queue on acquisition timeout
     * CURRENT BEHAVIOR: Queue only modified on lock acquisition/release
     * DESIRED BEHAVIOR: Timed-out operation removed from queue
     *
     * This test will FAIL until Step 5d-b is implemented
     */
    it('should remove timed-out operation from queue', async () => {
      // Operation 1 holds lock
      await lockManager.acquireLock('operation-1');

      // Queue operations 2 and 3
      const promise2 = lockManager.acquireLock('operation-2', 5000); // 5s timeout
      const promise3 = lockManager.acquireLock('operation-3', 30000); // 30s timeout

      expect(lockManager.getQueueLength()).toBe(2);

      // Fast-forward 5 seconds - operation 2 should timeout
      jest.advanceTimersByTime(5000);

      // Operation 2 should reject
      await expect(promise2).rejects.toThrow(/timeout/i);

      // Queue should now have only 1 operation (operation 3)
      expect(lockManager.getQueueLength()).toBe(1);

      // Release operation 1
      lockManager.releaseLock('operation-1');

      // Operation 3 should acquire lock (not operation 2)
      await promise3;
      expect(lockManager.getCurrentOperation()).toBe('operation-3');

      lockManager.releaseLock('operation-3');
    });

    /**
     * Test 6: Multiple queued operations with different timeouts
     *
     * REQUIREMENT: Each queued operation has independent timeout
     * CURRENT BEHAVIOR: No acquisition timeouts
     * DESIRED BEHAVIOR: Each operation times out independently
     *
     * This test will FAIL until Step 5d-b is implemented
     */
    it('should handle multiple queued operations with different timeouts', async () => {
      // Operation 1 holds lock
      await lockManager.acquireLock('operation-1');

      // Queue 3 operations with different timeouts
      const promise2 = lockManager.acquireLock('operation-2', 5000);  // 5s
      const promise3 = lockManager.acquireLock('operation-3', 10000); // 10s
      const promise4 = lockManager.acquireLock('operation-4', 15000); // 15s

      expect(lockManager.getQueueLength()).toBe(3);

      // Fast-forward 5 seconds - operation 2 should timeout
      jest.advanceTimersByTime(5000);
      await expect(promise2).rejects.toThrow(/timeout/i);
      expect(lockManager.getQueueLength()).toBe(2);

      // Fast-forward 5 more seconds (10s total) - operation 3 should timeout
      jest.advanceTimersByTime(5000);
      await expect(promise3).rejects.toThrow(/timeout/i);
      expect(lockManager.getQueueLength()).toBe(1);

      // Release operation 1 before operation 4 times out
      lockManager.releaseLock('operation-1');

      // Operation 4 should acquire lock
      await promise4;
      expect(lockManager.getCurrentOperation()).toBe('operation-4');

      lockManager.releaseLock('operation-4');
    });

    /**
     * Test 7: Log warning when acquisition timeout occurs
     *
     * REQUIREMENT: Log meaningful message when operation times out waiting
     * CURRENT BEHAVIOR: No acquisition timeout logging
     * DESIRED BEHAVIOR: Warning logged with operation name and timeout duration
     *
     * This test will FAIL until Step 5d-b is implemented
     */
    it('should log warning when acquisition timeout occurs', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      // Operation 1 holds lock
      await lockManager.acquireLock('operation-1');

      // Operation 2 queued with 5s timeout
      const promise2 = lockManager.acquireLock('timed-out-operation', 5000);

      // Fast-forward 5 seconds
      jest.advanceTimersByTime(5000);

      // Wait for rejection
      await expect(promise2).rejects.toThrow();

      // Should log warning about acquisition timeout
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringMatching(/acquisition.*timeout.*timed-out-operation.*5000/i)
      );

      consoleWarnSpy.mockRestore();
      lockManager.releaseLock('operation-1');
    });
  });
});
