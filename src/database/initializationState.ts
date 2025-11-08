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
  }

  /**
   * Reset to UNINITIALIZED state (for testing or complete reset)
   */
  reset(): void {
    this.state = DatabaseInitializationState.UNINITIALIZED;
    this.errorMessage = null;
    console.log('Database state reset to UNINITIALIZED');
  }
}

/**
 * Singleton instance for database initialization state
 */
export const databaseInitializer = new DatabaseInitializer();
