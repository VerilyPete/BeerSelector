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

import { logError, ErrorContext } from '../utils/errorLogger';

/**
 * Proof that the bearer currently holds the lock.
 *
 * Stamped at GRANT time. `release` compares the serial against the live grant,
 * so a release arriving from a holder whose grant was abandoned is ignored
 * rather than freeing whoever holds the lock now.
 */
export type LockToken = {
  readonly operationName: string;
  readonly serial: number;
};

/**
 * Identity of a request while it is waiting in the queue.
 *
 * Stamped at ENQUEUE time, and deliberately distinct from LockToken: a queued
 * request has no grant, so `_timeoutAcquisition` cannot match on a grant serial.
 * Operation names are not unique — several call sites share one — so matching on
 * the name rejects whichever waiter happens to be found first.
 */
type RequestId = {
  readonly operationName: string;
  readonly requestSerial: number;
};

/**
 * Minimal logging surface, injectable so tests can assert without console spies.
 */
export type LockLogger = {
  log: (message: string) => void;
  warn: (message: string) => void;
};

/**
 * Reports a condition that needs attention rather than a log line.
 *
 * Matches `logError` from `src/utils/errorLogger`, which is the default.
 */
export type LockErrorReporter = (error: unknown, context: ErrorContext) => void;

/**
 * Construction options. Timeouts are options rather than constants so tests can
 * drive small budgets deterministically with fake timers.
 */
export type DatabaseLockManagerOptions = {
  readonly holdTimeoutMs?: number;
  readonly acquisitionTimeoutMs?: number;
  readonly logger?: LockLogger;
  readonly reportError?: LockErrorReporter;
};

/**
 * Lock request in the queue
 */
type LockRequest = {
  operationName: string;
  requestSerial: number;
  resolve: (token: LockToken) => void;
  reject: (error: Error) => void;
  timestamp: number;
  acquisitionTimeoutId?: ReturnType<typeof setTimeout>;
};

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
 *   return lockManager.withDatabaseLock('myOperation', async () => {
 *     // ... database operations here
 *   });
 * }
 * ```
 */
export class DatabaseLockManager {
  private lockHeld: boolean = false;
  private queue: LockRequest[] = [];
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private readonly LOCK_TIMEOUT_MS: number; // hold timeout
  private readonly ACQUISITION_TIMEOUT_MS: number; // acquisition timeout
  private readonly logger: LockLogger;
  private readonly reportError: LockErrorReporter;
  /** When the live grant was made, used to report how long an abandoned hold ran. */
  private grantedAt: number = 0;
  /** Monotonic, stamped into every LockToken at grant time. */
  private grantSerial: number = 0;
  /** Monotonic, stamped into every queued request at enqueue time. */
  private requestSerial: number = 0;
  private currentOperation: string | null = null;
  private debugLogging: boolean = false;
  private recentWaitTimes: number[] = []; // Track recent queue wait times
  private readonly MAX_WAIT_TIME_HISTORY = 10; // Keep last 10 wait times
  private readonly QUEUE_WARNING_THRESHOLD = 5; // Warn if queue exceeds this length
  private isShuttingDown: boolean = false; // Flag to indicate shutdown state
  /**
   * Serial of a grant that was forcibly released while its holder may still be
   * writing, or null when no hold is abandoned.
   *
   * `lockHeld` alone cannot express this state: the abandoned holder does not
   * hold a valid grant any more, but it is not safe to give the lock to anyone
   * else until it comes back. Cleared when the abandoned holder's own release
   * finally arrives, which is the only reliable evidence it has stopped
   * writing.
   */
  private abandonedGrantSerial: number | null = null;
  private abandonedOperation: string | null = null;

  constructor(options: DatabaseLockManagerOptions = {}) {
    this.LOCK_TIMEOUT_MS = options.holdTimeoutMs ?? 15000; // 15s for mobile UX
    this.ACQUISITION_TIMEOUT_MS = options.acquisitionTimeoutMs ?? 30000;
    this.logger = options.logger ?? console;
    this.reportError = options.reportError ?? logError;
  }

  /**
   * Acquire the database lock, resolving with proof of ownership.
   *
   * Prefer `withDatabaseLock` unless you genuinely need to hold the lock across
   * a boundary a callback cannot span. The returned token is what lets
   * `release` tell a live owner from one whose grant was already abandoned.
   *
   * @param operationName - Name of the operation requesting the lock
   * @param timeoutMs - Optional acquisition timeout (default: 30000)
   * @returns Promise<LockToken> - rejects on acquisition timeout
   */
  async acquire(operationName: string, timeoutMs?: number): Promise<LockToken> {
    return new Promise((resolve, reject) => {
      if (this.isShuttingDown) {
        reject(new Error('Cannot acquire lock: database is shutting down'));
        return;
      }

      // An abandoned hold blocks the fast path as firmly as a live one. Without
      // this check, skipping _processQueue() in _forceRelease would protect
      // only the callers already queued: a caller arriving afterwards would be
      // granted the lock straight away, alongside a writer still in flight.
      if (!this.lockHeld && this.abandonedGrantSerial === null) {
        this._grantLock(operationName, resolve);
        return;
      }

      this.logger.log(
        this.abandonedGrantSerial !== null
          ? `Waiting for an abandoned hold (${this.abandonedOperation}) to return before granting ${operationName}...`
          : `Database operation already in progress, waiting for lock (${operationName})...`
      );

      const timeout = timeoutMs !== undefined ? timeoutMs : this.ACQUISITION_TIMEOUT_MS;
      this.requestSerial += 1;
      const requestId: RequestId = { operationName, requestSerial: this.requestSerial };

      const acquisitionTimeoutId = setTimeout(() => {
        this._timeoutAcquisition(requestId, timeout);
      }, timeout);

      this.queue.push({
        operationName,
        requestSerial: requestId.requestSerial,
        resolve,
        reject,
        timestamp: Date.now(),
        acquisitionTimeoutId,
      });

      if (this.queue.length >= this.QUEUE_WARNING_THRESHOLD) {
        this.logger.warn(
          `[LockManager] Queue length is ${this.queue.length}, exceeding threshold of ${this.QUEUE_WARNING_THRESHOLD}`
        );
      }
    });
  }

  /**
   * Run a task while holding the database lock, releasing it however it exits.
   *
   * The only supported way to take the lock. Hand-written acquire/try/finally
   * pairs are what let a `finally` go missing, and a dropped release wedges the
   * app at splash until the hold timeout fires.
   *
   * @param operationName - Name of the operation, used in lock logs
   * @param task - The work to run while holding the lock
   * @param timeoutMs - Optional acquisition timeout (default: 30000)
   * @returns Whatever `task` returns
   */
  async withDatabaseLock<T>(
    operationName: string,
    task: () => Promise<T>,
    timeoutMs?: number
  ): Promise<T> {
    const token = await this.acquire(operationName, timeoutMs);

    try {
      return await task();
    } finally {
      this.release(token);
    }
  }

  /**
   * Release a lock using the token returned by `acquire`.
   *
   * A token whose serial no longer matches the live grant is stale — its grant
   * was forcibly released, or already handed on — and never frees whoever holds
   * the lock now. Releasing unconditionally would free a lock the caller no
   * longer owns.
   *
   * One stale token is special: the one belonging to a hold this manager
   * abandoned. Its arrival is the only reliable evidence that the writer has
   * actually stopped, so it lifts the block rather than being discarded.
   *
   * @param token - The token returned when the lock was granted
   */
  release(token: LockToken): void {
    if (
      this.abandonedGrantSerial !== null &&
      token.serial === this.abandonedGrantSerial &&
      token.operationName === this.abandonedOperation
    ) {
      this.logger.warn(
        `[LockManager] Abandoned hold for ${token.operationName} returned; lock is grantable again`
      );
      this.abandonedGrantSerial = null;
      this.abandonedOperation = null;
      this._processQueue();
      return;
    }

    // `!this.lockHeld` is not redundant with the serial check. _forceRelease
    // bumps grantSerial without minting a token, so while a hold is abandoned
    // the live serial belongs to no holder at all — matching it should still
    // not free anything. Checking both keeps the invariant an assertion rather
    // than a consequence of the arithmetic skipping a value.
    if (!this.lockHeld || token.serial !== this.grantSerial) {
      this.logger.warn(
        `[LockManager] Ignoring stale release for ${token.operationName} (grant already abandoned)`
      );
      return;
    }

    this._releaseInternal(token.operationName);
  }

  /**
   * Whether a forcibly-released hold has yet to return.
   *
   * `isLocked()` is false in that state — nobody holds a valid grant — so this
   * is what distinguishes an abandoned hold from an idle lock in logs and
   * metrics. Without it the two are indistinguishable to a human.
   */
  hasAbandonedHolder(): boolean {
    return this.abandonedGrantSerial !== null;
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
    resolve: (token: LockToken) => void,
    acquisitionTimeoutId?: ReturnType<typeof setTimeout>,
    requestTimestamp?: number
  ): void {
    // Track wait time if this was a queued request
    if (requestTimestamp !== undefined) {
      const waitTime = Date.now() - requestTimestamp;
      this._recordWaitTime(waitTime);

      if (this.debugLogging) {
        this.logger.log(`[LockManager] Lock acquired for: ${operationName} (waited ${waitTime}ms)`);
      }
    } else if (this.debugLogging) {
      this.logger.log(`[LockManager] Lock acquired immediately for: ${operationName}`);
    }

    // Always log lock acquisition (not just in debug mode)
    this.logger.log(`Lock acquired for: ${operationName}`);

    this.lockHeld = true;
    this.currentOperation = operationName;
    // Bumped on EVERY grant, not only on forced release. If it only moved in
    // _forceRelease, the normal release -> _processQueue -> _grantLock path
    // would re-stamp the same serial and a double release would free the next
    // holder's grant.
    this.grantSerial += 1;

    // Clear acquisition timeout if it exists
    if (acquisitionTimeoutId) {
      clearTimeout(acquisitionTimeoutId);
    }

    // Clear any existing hold timeout
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }

    // Set safety timeout to auto-release lock after the hold timeout
    this.grantedAt = Date.now();
    this.timeoutId = setTimeout(() => {
      const heldOperation = this.currentOperation;
      const heldForMs = Date.now() - this.grantedAt;

      // Reported as an error, not a log line. A forced release abandons a grant
      // and blocks every writer until the holder returns — a console.warn is
      // indistinguishable from routine chatter, and this is an incident.
      this.reportError(
        new Error(
          `Database lock forcibly released after ${heldForMs}ms (${heldOperation}) — the holder never returned`
        ),
        {
          operation: 'DatabaseLockManager.forceRelease',
          component: 'database/DatabaseLockManager',
          additionalData: {
            heldOperation,
            heldForMs,
            holdTimeoutMs: this.LOCK_TIMEOUT_MS,
            // Says whether this stalled anything, which is the difference
            // between a curiosity and an incident.
            queueLength: this.queue.length,
          },
        }
      );
      this._forceRelease();
    }, this.LOCK_TIMEOUT_MS);

    resolve({ operationName, serial: this.grantSerial });
  }

  /**
   * Handle acquisition timeout for a queued operation
   *
   * Removes the operation from the queue and rejects its promise.
   *
   * @param operationName - Name of the operation that timed out
   * @param timeoutMs - Timeout duration that expired
   */
  private _timeoutAcquisition(requestId: RequestId, timeoutMs: number): void {
    const { operationName } = requestId;
    // Matched on the enqueue-time serial, not the operation name: names are not
    // unique (BeerRepository and MyBeersRepository each use one name at two call
    // sites), so a name match rejects whichever waiter is found first rather
    // than the one whose timer actually fired.
    const index = this.queue.findIndex(req => req.requestSerial === requestId.requestSerial);

    if (index !== -1) {
      const request = this.queue[index];

      // Remove from queue
      this.queue.splice(index, 1);

      // Log warning
      this.logger.warn(`Lock acquisition timeout for ${operationName} after ${timeoutMs}ms`);

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
    // Records WHICH grant is being abandoned, so the holder's eventual release
    // can be recognised and lift the block. Until then no one is granted the
    // lock — not the queue, and not a new arrival either.
    this.abandonedGrantSerial = this.grantSerial;
    this.abandonedOperation = this.currentOperation;
    this.lockHeld = false;
    this.currentOperation = null;
    // Abandons the grant, so a late release from the timed-out holder is
    // recognised as stale rather than freeing whoever holds the lock next.
    this.grantSerial += 1;
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    // Deliberately does NOT call _processQueue(). The timed-out holder has not
    // returned and may still be mid-write; handing the lock to another writer
    // now is silent data loss. Blocking the fast path in `acquire` is the other
    // half of that — skipping the queue alone would only protect callers who
    // were already waiting. Under an exclusive transaction the second writer
    // would hit `database is locked` anyway.
    //
    // Liveness has two exits: the abandoned holder's own release lifts the
    // block immediately, and failing that every waiter is rejected by its
    // acquisition timeout with a real message rather than hanging forever.
    //
    // Removing this hold timeout altogether is the right end state — see
    // plan 01 Phase 6 — but it cannot land until Phase 4 splits the network
    // fetch out of the write burst.
  }

  /**
   * Shared release path, reached only via `release(token)` or the
   * `withDatabaseLock` helper — both of which check ownership first.
   *
   * @param operationName - Name of the operation releasing the lock (for logging)
   */
  private _releaseInternal(operationName: string): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    this.logger.log(`Lock released for: ${operationName}`);
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
    abandonedHolder: string | null;
  } {
    return {
      currentOperation: this.currentOperation,
      queueLength: this.queue.length,
      queueWaitTimes: [...this.recentWaitTimes], // Return a copy
      // Non-null means a hold timed out and has not returned. The lock reads as
      // idle in every other field, so this is the only way to tell the two
      // apart.
      abandonedHolder: this.abandonedOperation,
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
    if (this.isShuttingDown && !this.lockHeld && this.abandonedGrantSerial === null) {
      return true;
    }

    // Set shutdown flag to prevent new lock acquisitions
    this.isShuttingDown = true;

    const startTime = Date.now();
    const pollInterval = 100; // Poll every 100ms

    // Waits on an abandoned hold as well as a live one. A forcibly-released
    // hold clears lockHeld while its writer may still be running, so checking
    // lockHeld alone would report "safe to close" and let connection.ts close
    // the database underneath it.
    while (this.lockHeld || this.abandonedGrantSerial !== null) {
      const elapsed = Date.now() - startTime;

      if (elapsed >= timeoutMs) {
        const holder = this.lockHeld
          ? `'${this.currentOperation}'`
          : `'${this.abandonedOperation}' (abandoned, never returned)`;
        console.warn(`Shutdown timeout: lock is still held by ${holder} after ${timeoutMs}ms`);

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

  /**
   * Reset all internal state for testing purposes
   *
   * Clears held locks, empties the queue, cancels any pending timeouts,
   * and resets tracking state. Should only be called in test setup/teardown.
   *
   * @internal Only for use in tests
   */
  resetForTesting(): void {
    this.lockHeld = false;
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    // Settles queued waiters rather than dropping them. Clearing the array
    // without rejecting leaves their promises pending forever, so a leaked
    // waiter in one test surfaces as a silent hang in the next rather than a
    // failure — and eight suites now reset the shared singleton in setup.
    const stranded = this.queue;
    this.queue = [];
    stranded.forEach(req => {
      if (req.acquisitionTimeoutId) {
        clearTimeout(req.acquisitionTimeoutId);
      }
      req.reject(new Error(`Lock manager reset while ${req.operationName} was queued`));
    });
    this.currentOperation = null;
    this.abandonedGrantSerial = null;
    this.abandonedOperation = null;
    this.isShuttingDown = false;
    this.recentWaitTimes = [];
  }
}

/**
 * Singleton instance of DatabaseLockManager
 *
 * Existing code can import and use this instance directly:
 * ```typescript
 * import { databaseLockManager } from './DatabaseLockManager';
 *
 * await databaseLockManager.withDatabaseLock('operation', async () => {
 *   // ... database operations here
 * });
 * ```
 */
export const databaseLockManager = new DatabaseLockManager();
