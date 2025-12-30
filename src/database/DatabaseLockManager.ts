/**
 * DatabaseLockManager - Queue-based lock manager for database operations
 *
 * Replaces module-level boolean flags with proper async lock/unlock mechanism.
 * Implements FIFO queue to prevent race conditions during concurrent database operations.
 *
 * Features:
 * - FIFO queue for lock requests
 * - Automatic timeout (15 seconds for mobile UX)
 * - Operation name tracking for debugging
 * - Prevents deadlocks with timeout protection
 */

/**
 * Lock request in the queue
 */
interface LockRequest {
  operationName: string;
  resolve: (acquired: boolean) => void;
  reject: (error: Error) => void;
  timestamp: number;
  acquisitionTimeoutId?: ReturnType<typeof setTimeout>;
}

/**
 * DatabaseLockManager class to handle database operation locks with queue mechanism
 *
 * Uses a queue-based approach instead of polling to implement proper FIFO locking.
 * Operations wait in queue until lock is available.
 *
 * @example
 * ```typescript
 * const lockManager = new DatabaseLockManager();
 *
 * async function databaseOperation() {
 *   if (!await lockManager.acquireLock('myOperation')) {
 *     throw new Error('Could not acquire lock');
 *   }
 *
 *   try {
 *     // ... database operations here
 *   } finally {
 *     lockManager.releaseLock('myOperation');
 *   }
 * }
 * ```
 */
export class DatabaseLockManager {
  private lockHeld: boolean = false;
  private queue: LockRequest[] = [];
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private readonly LOCK_TIMEOUT_MS = 15000; // 15 seconds for mobile UX (hold timeout)
  private readonly ACQUISITION_TIMEOUT_MS = 30000; // 30 seconds for acquisition timeout
  private currentOperation: string | null = null;
  private debugLogging: boolean = false;
  private recentWaitTimes: number[] = []; // Track recent queue wait times
  private readonly MAX_WAIT_TIME_HISTORY = 10; // Keep last 10 wait times
  private readonly QUEUE_WARNING_THRESHOLD = 5; // Warn if queue exceeds this length
  private isShuttingDown: boolean = false; // Flag to indicate shutdown state

  /**
   * Attempt to acquire the database lock
   *
   * If the lock is already held, the request is queued and will be granted
   * when the current lock holder releases the lock (FIFO order).
   *
   * When the lock is successfully acquired, a 15-second timeout is set
   * to automatically release the lock in case of errors or hung operations.
   *
   * Acquisition timeout: If lock cannot be acquired within timeoutMs (default 30s),
   * the promise will be rejected with a timeout error.
   *
   * @param operationName - Name of the operation requesting the lock (for logging)
   * @param timeoutMs - Optional acquisition timeout in milliseconds (default: 30000)
   * @returns Promise<boolean> - true if lock acquired, rejects on acquisition timeout
   */
  async acquireLock(operationName: string, timeoutMs?: number): Promise<boolean> {
    return new Promise((resolve, reject) => {
      // Check if shutting down
      if (this.isShuttingDown) {
        reject(new Error('Cannot acquire lock: database is shutting down'));
        return;
      }

      // If lock is not held, acquire immediately
      if (!this.lockHeld) {
        this._grantLock(operationName, resolve);
        return;
      }

      // Lock is held, add to queue with acquisition timeout
      console.log(`Database operation already in progress, waiting for lock (${operationName})...`);

      const timeout = timeoutMs !== undefined ? timeoutMs : this.ACQUISITION_TIMEOUT_MS;

      // Set acquisition timeout
      const acquisitionTimeoutId = setTimeout(() => {
        this._timeoutAcquisition(operationName, timeout);
      }, timeout);

      this.queue.push({
        operationName,
        resolve,
        reject,
        timestamp: Date.now(),
        acquisitionTimeoutId,
      });

      // Warn if queue is getting long (after adding to queue)
      if (this.queue.length >= this.QUEUE_WARNING_THRESHOLD) {
        console.warn(
          `[LockManager] Queue length is ${this.queue.length}, exceeding threshold of ${this.QUEUE_WARNING_THRESHOLD}`
        );
      }
    });
  }

  /**
   * Internal method to grant lock to a requester
   *
   * @param operationName - Name of the operation
   * @param resolve - Promise resolve function
   * @param acquisitionTimeoutId - Optional acquisition timeout to clear
   * @param requestTimestamp - Optional timestamp when request was queued (for wait time tracking)
   */
  private _grantLock(
    operationName: string,
    resolve: (acquired: boolean) => void,
    acquisitionTimeoutId?: ReturnType<typeof setTimeout>,
    requestTimestamp?: number
  ): void {
    // Track wait time if this was a queued request
    if (requestTimestamp !== undefined) {
      const waitTime = Date.now() - requestTimestamp;
      this._recordWaitTime(waitTime);

      if (this.debugLogging) {
        console.log(`[LockManager] Lock acquired for: ${operationName} (waited ${waitTime}ms)`);
      }
    } else if (this.debugLogging) {
      console.log(`[LockManager] Lock acquired immediately for: ${operationName}`);
    }

    // Always log lock acquisition (not just in debug mode)
    console.log(`Lock acquired for: ${operationName}`);

    this.lockHeld = true;
    this.currentOperation = operationName;

    // Clear acquisition timeout if it exists
    if (acquisitionTimeoutId) {
      clearTimeout(acquisitionTimeoutId);
    }

    // Clear any existing hold timeout
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }

    // Set safety timeout to auto-release lock after 15 seconds (hold timeout)
    this.timeoutId = setTimeout(() => {
      console.warn(`Database lock forcibly released after timeout (${this.currentOperation})`);
      this._forceRelease();
    }, this.LOCK_TIMEOUT_MS);

    resolve(true);
  }

  /**
   * Handle acquisition timeout for a queued operation
   *
   * Removes the operation from the queue and rejects its promise.
   *
   * @param operationName - Name of the operation that timed out
   * @param timeoutMs - Timeout duration that expired
   */
  private _timeoutAcquisition(operationName: string, timeoutMs: number): void {
    // Find the request in the queue
    const index = this.queue.findIndex(req => req.operationName === operationName);

    if (index !== -1) {
      const request = this.queue[index];

      // Remove from queue
      this.queue.splice(index, 1);

      // Log warning
      console.warn(`Lock acquisition timeout for ${operationName} after ${timeoutMs}ms`);

      // Reject the promise
      request.reject(
        new Error(`Lock acquisition timeout for ${operationName} after ${timeoutMs}ms`)
      );
    }
  }

  /**
   * Force release the lock (called by timeout)
   */
  private _forceRelease(): void {
    this.lockHeld = false;
    this.currentOperation = null;
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    // Process next in queue
    this._processQueue();
  }

  /**
   * Release the database lock
   *
   * This method should be called in a finally block to ensure the lock
   * is released even if an error occurs during the operation.
   *
   * After releasing, the next operation in the queue (if any) is granted the lock.
   *
   * @param operationName - Name of the operation releasing the lock (for logging)
   */
  releaseLock(operationName: string): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    console.log(`Lock released for: ${operationName}`);
    this.lockHeld = false;
    this.currentOperation = null;

    // Process next request in queue
    this._processQueue();
  }

  /**
   * Process the next lock request in the queue (FIFO)
   */
  private _processQueue(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) {
        this._grantLock(
          next.operationName,
          next.resolve,
          next.acquisitionTimeoutId,
          next.timestamp
        );
      }
    }
  }

  /**
   * Check if the lock is currently held
   *
   * @returns boolean - true if lock is held, false otherwise
   */
  isLocked(): boolean {
    return this.lockHeld;
  }

  /**
   * Get the number of operations waiting in queue
   *
   * @returns number - queue length
   */
  getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * Get the current operation holding the lock
   *
   * @returns string | null - operation name or null if no lock held
   */
  getCurrentOperation(): string | null {
    return this.currentOperation;
  }

  /**
   * Record a queue wait time
   *
   * @param waitTime - Wait time in milliseconds
   */
  private _recordWaitTime(waitTime: number): void {
    this.recentWaitTimes.push(waitTime);

    // Keep only the most recent wait times
    if (this.recentWaitTimes.length > this.MAX_WAIT_TIME_HISTORY) {
      this.recentWaitTimes.shift();
    }
  }

  /**
   * Enable or disable debug logging
   *
   * When enabled, detailed lock acquisition logs will be written to console.
   *
   * @param enabled - true to enable debug logging, false to disable
   */
  setDebugLogging(enabled: boolean): void {
    this.debugLogging = enabled;
    if (enabled) {
      console.log('[LockManager] Debug logging enabled');
    }
  }

  /**
   * Get lock metrics for monitoring and troubleshooting
   *
   * Returns an object containing:
   * - currentOperation: Name of the operation currently holding the lock (or null)
   * - queueLength: Number of operations waiting for the lock
   * - queueWaitTimes: Array of recent queue wait times in milliseconds
   *
   * @returns LockMetrics object
   */
  getLockMetrics(): {
    currentOperation: string | null;
    queueLength: number;
    queueWaitTimes: number[];
  } {
    return {
      currentOperation: this.currentOperation,
      queueLength: this.queue.length,
      queueWaitTimes: [...this.recentWaitTimes], // Return a copy
    };
  }

  /**
   * Prepare the database lock manager for shutdown
   *
   * This method waits for any active operations to complete before allowing
   * the database to be closed safely. It polls the lock status every 100ms
   * and returns true if all operations complete within the timeout period.
   *
   * After calling this method, new lock acquisitions will be rejected.
   *
   * @param timeoutMs - Maximum time to wait for operations to complete (default: 5000ms)
   * @returns Promise<boolean> - true if shutdown is safe, false if timeout occurred
   */
  async prepareForShutdown(timeoutMs: number = 5000): Promise<boolean> {
    console.log('Preparing database lock manager for shutdown...');

    // Already shutting down, return success immediately
    if (this.isShuttingDown && !this.lockHeld) {
      return true;
    }

    // Set shutdown flag to prevent new lock acquisitions
    this.isShuttingDown = true;

    const startTime = Date.now();
    const pollInterval = 100; // Poll every 100ms

    // Wait for lock to be released
    while (this.lockHeld) {
      const elapsed = Date.now() - startTime;

      if (elapsed >= timeoutMs) {
        console.warn(
          `Shutdown timeout: lock is still held by '${this.currentOperation}' after ${timeoutMs}ms`
        );

        // Warn if queue is not empty
        if (this.queue.length > 0) {
          console.warn(
            `Shutdown warning: queue is not empty (${this.queue.length} operations pending)`
          );
        }

        return false;
      }

      // Wait for poll interval
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    // Warn if queue is not empty even though lock is free
    if (this.queue.length > 0) {
      console.warn(
        `Shutdown warning: queue is not empty (${this.queue.length} operations pending)`
      );
    }

    console.log('Database lock manager prepared for shutdown successfully');
    return true;
  }

  /**
   * Reset the shutdown state to allow new operations
   *
   * Called when the database is reopened after being closed (e.g., app foreground)
   * to allow new lock acquisitions.
   *
   * @internal Only called by connection.ts during database reopen
   */
  resetShutdownState(): void {
    console.log('Database lock manager: Resetting shutdown state');
    this.isShuttingDown = false;
  }
}

/**
 * Singleton instance of DatabaseLockManager
 *
 * Existing code can import and use this instance directly:
 * ```typescript
 * import { databaseLockManager } from './DatabaseLockManager';
 *
 * if (!await databaseLockManager.acquireLock('operation')) {
 *   throw new Error('Could not acquire lock');
 * }
 * ```
 */
export const databaseLockManager = new DatabaseLockManager();
