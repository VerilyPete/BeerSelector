/**
 * Database initialization state machine
 *
 * Replaces multiple boolean flags with a proper state machine:
 * - databaseInitialized
 * - databaseSetupComplete
 * - setupDatabaseInProgress
 *
 * Valid state transitions:
 * UNINITIALIZED -> INITIALIZING -> READY
 * UNINITIALIZED -> ERROR
 * INITIALIZING -> ERROR
 * ERROR -> INITIALIZING (retry)
 */

export enum DatabaseInitializationState {
  UNINITIALIZED = 'UNINITIALIZED',
  INITIALIZING = 'INITIALIZING',
  READY = 'READY',
  ERROR = 'ERROR'
}

export class DatabaseInitializer {
  private state: DatabaseInitializationState = DatabaseInitializationState.UNINITIALIZED;
  private errorMessage: string | null = null;
  private waiters: Array<(value: void) => void> = [];
  private errorWaiters: Array<(error: Error) => void> = [];

  /**
   * Get the current initialization state
   */
  getState(): DatabaseInitializationState {
    return this.state;
  }

  /**
   * Check if database is ready for operations
   */
  isReady(): boolean {
    return this.state === DatabaseInitializationState.READY;
  }

  /**
   * Check if database is currently initializing
   */
  isInitializing(): boolean {
    return this.state === DatabaseInitializationState.INITIALIZING;
  }

  /**
   * Check if database is in error state
   */
  isError(): boolean {
    return this.state === DatabaseInitializationState.ERROR;
  }

  /**
   * Get error message (if in ERROR state)
   */
  getErrorMessage(): string | null {
    return this.errorMessage;
  }

  /**
   * Transition to INITIALIZING state
   *
   * Valid from: UNINITIALIZED, ERROR
   * Invalid from: INITIALIZING, READY
   */
  setInitializing(): void {
    if (this.state === DatabaseInitializationState.READY) {
      throw new Error(`Cannot transition to INITIALIZING from ${this.state}`);
    }

    if (this.state === DatabaseInitializationState.INITIALIZING) {
      throw new Error(`Cannot transition to INITIALIZING from ${this.state} (already initializing)`);
    }

    const previousState = this.state;
    this.state = DatabaseInitializationState.INITIALIZING;
    this.errorMessage = null;

    console.log(`Database state: ${previousState} -> INITIALIZING`);
  }

  /**
   * Transition to READY state
   *
   * Valid from: INITIALIZING
   * Invalid from: UNINITIALIZED, READY, ERROR
   */
  setReady(): void {
    if (this.state !== DatabaseInitializationState.INITIALIZING) {
      throw new Error(`Cannot transition to READY from ${this.state}`);
    }

    const previousState = this.state;
    this.state = DatabaseInitializationState.READY;
    this.errorMessage = null;

    console.log(`Database state: ${previousState} -> READY`);

    // Notify all waiters that initialization is complete
    this.notifyWaiters();
  }

  /**
   * Transition to ERROR state
   *
   * Valid from: UNINITIALIZED, INITIALIZING
   * Invalid from: READY (database cannot become unready)
   */
  setError(message: string): void {
    if (this.state === DatabaseInitializationState.READY) {
      throw new Error(`Cannot transition to ERROR from ${this.state}`);
    }

    const previousState = this.state;
    this.state = DatabaseInitializationState.ERROR;
    this.errorMessage = message;

    console.error(`Database initialization error: ${message}`);
    console.log(`Database state: ${previousState} -> ERROR`);

    // Notify all error waiters that initialization failed
    this.notifyErrorWaiters(new Error(message));
  }

  /**
   * Reset to UNINITIALIZED state (for testing or complete reset)
   */
  reset(): void {
    this.state = DatabaseInitializationState.UNINITIALIZED;
    this.errorMessage = null;
    this.waiters = [];
    this.errorWaiters = [];
    console.log('Database state reset to UNINITIALIZED');
  }

  /**
   * Returns a promise that resolves when database initialization is complete.
   * If already ready, resolves immediately.
   * If in error state, rejects immediately.
   * If initializing, waits for completion without polling.
   *
   * @param timeoutMs Optional timeout in milliseconds (default: 30000)
   * @throws Error if initialization fails or times out
   */
  async waitUntilReady(timeoutMs: number = 30000): Promise<void> {
    // If already ready, resolve immediately
    if (this.isReady()) {
      return Promise.resolve();
    }

    // If in error state, reject immediately
    if (this.state === DatabaseInitializationState.ERROR) {
      throw new Error(`Database initialization failed: ${this.errorMessage}`);
    }

    // Wait for initialization to complete using event-based approach
    return new Promise<void>((resolve, reject) => {
      // Wrapper functions to clear timeout on completion
      const wrappedResolve = () => {
        clearTimeout(timeoutId);
        resolve();
      };

      const wrappedReject = (error: Error) => {
        clearTimeout(timeoutId);
        reject(error);
      };

      // Set up timeout that removes the wrapped callbacks
      const timeoutId = setTimeout(() => {
        // Remove from waiters on timeout
        const resolveIndex = this.waiters.indexOf(wrappedResolve);
        if (resolveIndex > -1) {
          this.waiters.splice(resolveIndex, 1);
        }
        const rejectIndex = this.errorWaiters.indexOf(wrappedReject);
        if (rejectIndex > -1) {
          this.errorWaiters.splice(rejectIndex, 1);
        }
        reject(new Error('Database initialization timeout'));
      }, timeoutMs);

      // Add to waiters
      this.waiters.push(wrappedResolve);
      this.errorWaiters.push(wrappedReject);
    });
  }

  /**
   * Notify all waiters that initialization is complete
   * @private
   */
  private notifyWaiters(): void {
    const waitersToNotify = [...this.waiters];
    this.waiters = [];
    this.errorWaiters = [];
    waitersToNotify.forEach(resolve => resolve());
  }

  /**
   * Notify all error waiters that initialization failed
   * @private
   */
  private notifyErrorWaiters(error: Error): void {
    const errorWaitersToNotify = [...this.errorWaiters];
    this.waiters = [];
    this.errorWaiters = [];
    errorWaitersToNotify.forEach(reject => reject(error));
  }
}

/**
 * Singleton instance for database initialization state
 */
export const databaseInitializer = new DatabaseInitializer();
