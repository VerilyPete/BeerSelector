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
  timestamp: number;
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
  private timeoutId: NodeJS.Timeout | null = null;
  private readonly LOCK_TIMEOUT_MS = 15000; // 15 seconds for mobile UX (was 60s)
  private currentOperation: string | null = null;

  /**
   * Attempt to acquire the database lock
   *
   * If the lock is already held, the request is queued and will be granted
   * when the current lock holder releases the lock (FIFO order).
   *
   * When the lock is successfully acquired, a 15-second timeout is set
   * to automatically release the lock in case of errors or hung operations.
   *
   * @param operationName - Name of the operation requesting the lock (for logging)
   * @returns Promise<boolean> - true if lock acquired, false on error
   */
  async acquireLock(operationName: string): Promise<boolean> {
    return new Promise((resolve) => {
      // If lock is not held, acquire immediately
      if (!this.lockHeld) {
        this._grantLock(operationName, resolve);
        return;
      }

      // Lock is held, add to queue
      console.log(`Database operation already in progress, waiting for lock (${operationName})...`);
      this.queue.push({
        operationName,
        resolve,
        timestamp: Date.now()
      });
    });
  }

  /**
   * Internal method to grant lock to a requester
   *
   * @param operationName - Name of the operation
   * @param resolve - Promise resolve function
   */
  private _grantLock(operationName: string, resolve: (acquired: boolean) => void): void {
    console.log(`Lock acquired for: ${operationName}`);
    this.lockHeld = true;
    this.currentOperation = operationName;

    // Clear any existing timeout
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }

    // Set safety timeout to auto-release lock after 15 seconds
    this.timeoutId = setTimeout(() => {
      console.warn(`Database lock forcibly released after timeout (${this.currentOperation})`);
      this._forceRelease();
    }, this.LOCK_TIMEOUT_MS);

    resolve(true);
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
        this._grantLock(next.operationName, next.resolve);
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
