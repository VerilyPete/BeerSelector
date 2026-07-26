/**
 * Typed database errors
 *
 * Exists so that error classification above the repository layer can switch on
 * a type rather than on a message substring. The raw SQLite message is tested
 * in exactly one place — `isDatabaseLockedError` below — and nowhere else in
 * the codebase should need to know the string.
 */

/**
 * A write aborted because another connection held the write lock.
 *
 * Raised when an operation collides with an exclusive transaction. expo-sqlite
 * opens exclusive transactions on a separate native connection with no
 * `busy_timeout` set, so SQLite returns SQLITE_BUSY immediately rather than
 * blocking — the abort is deterministic and instantaneous, never a hang.
 *
 * The condition is transient: the same write attempted a moment later
 * succeeds. `retryable` records that so callers are not forced to re-derive it.
 */
export class DatabaseContentionError extends Error {
  readonly retryable = true;
  readonly originalError: unknown;

  constructor(message: string, originalError?: unknown) {
    super(message);
    this.name = 'DatabaseContentionError';
    this.originalError = originalError;
    // Required for `instanceof` to survive transpilation of Error subclasses.
    Object.setPrototypeOf(this, DatabaseContentionError.prototype);
  }
}

/**
 * The single place in the codebase that tests for SQLite's lock message.
 *
 * Safe to rely on: the message is fixed by expo-sqlite, and this sits at the
 * boundary where the raw error is produced rather than several layers away.
 */
export function isDatabaseLockedError(error: unknown): boolean {
  return error instanceof Error && error.message.toLowerCase().includes('database is locked');
}

/**
 * Convert a lock abort into a typed error, passing anything else through.
 *
 * For use at an existing `catch (error) { … throw error; }` boundary in a
 * repository write. Unrelated failures propagate untouched — this narrows one
 * specific condition rather than blanketing the write in a new error type.
 *
 * @param operation - Human-readable name of the write, used in the message
 * @param error - The caught error
 * @returns The typed error to throw, or the original error unchanged
 */
export function toContentionError(operation: string, error: unknown): unknown {
  if (!isDatabaseLockedError(error)) {
    return error;
  }

  return new DatabaseContentionError(
    `${operation} aborted: database is locked by another writer`,
    error
  );
}

/**
 * Run a database write, converting a lock abort into a typed error.
 *
 * @param operation - Human-readable name of the write, used in the message
 * @param task - The write to run
 */
export async function withContentionMapping<T>(
  operation: string,
  task: () => Promise<T>
): Promise<T> {
  try {
    return await task();
  } catch (error) {
    throw toContentionError(operation, error);
  }
}
