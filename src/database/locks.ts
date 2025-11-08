/**
 * Database locking mechanism to prevent concurrent operations
 *
 * This module provides a simple lock manager to prevent race conditions
 * when multiple async operations try to access the database simultaneously.
 *
 * Features:
 * - Queued lock acquisition with configurable wait time
 * - Automatic lock release after 60-second timeout
 * - Operation name tracking for debugging
 */

/**
 * DatabaseLockManager class to handle database operation locks
 *
 * Uses a simple boolean flag with polling to implement locking.
 * Operations that fail to acquire the lock after 15 retry attempts (4.5 seconds)
 * will return false from acquireLock().
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
  private timeoutId: NodeJS.Timeout | null = null;
  private readonly MAX_RETRY_ATTEMPTS = 15;
  private readonly RETRY_DELAY_MS = 300;
  private readonly LOCK_TIMEOUT_MS = 60000; // 60 seconds

  /**
   * Attempt to acquire the database lock
   *
   * If the lock is already held, this method will wait up to 4.5 seconds
   * (15 attempts * 300ms) for the lock to become available.
   *
   * When the lock is successfully acquired, a 60-second timeout is set
   * to automatically release the lock in case of errors or hung operations.
   *
   * @param operationName - Name of the operation requesting the lock (for logging)
   * @returns Promise<boolean> - true if lock acquired, false if timeout
   */
  async acquireLock(operationName: string): Promise<boolean> {
    if (this.lockHeld) {
      console.log(`Database operation already in progress, waiting for lock (${operationName})...`);

      // Wait for lock to be released
      let attempts = 0;
      while (this.lockHeld && attempts < this.MAX_RETRY_ATTEMPTS) {
        await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY_MS));
        attempts++;
      }

      if (this.lockHeld) {
        console.error(`Failed to acquire database lock after waiting (${operationName})`);
        return false;
      }
    }

    console.log(`Lock acquired for: ${operationName}`);
    this.lockHeld = true;

    // Clear any existing timeout
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }

    // Set safety timeout to auto-release lock after 60 seconds
    this.timeoutId = setTimeout(() => {
      console.warn('Database lock forcibly released after timeout');
      this.lockHeld = false;
    }, this.LOCK_TIMEOUT_MS);

    return true;
  }

  /**
   * Release the database lock
   *
   * This method should be called in a finally block to ensure the lock
   * is released even if an error occurs during the operation.
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
  }

  /**
   * Check if the lock is currently held
   *
   * @returns boolean - true if lock is held, false otherwise
   */
  isLocked(): boolean {
    return this.lockHeld;
  }
}

/**
 * Singleton instance of DatabaseLockManager for backwards compatibility
 *
 * Existing code can import and use this instance directly:
 * ```typescript
 * import { databaseLockManager } from './locks';
 *
 * if (!await databaseLockManager.acquireLock('operation')) {
 *   throw new Error('Could not acquire lock');
 * }
 * ```
 */
export const databaseLockManager = new DatabaseLockManager();
