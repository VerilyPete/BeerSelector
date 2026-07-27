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

export type ContentionRetryOptions = {
  readonly attempts?: number;
  readonly initialDelayMs?: number;
  readonly maxDelayMs?: number;
  /** Injectable so tests need neither fake timers nor real waiting. */
  readonly sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Retry a write that lost a race for the database write lock.
 *
 * **Why this exists rather than a wider lock.** The taplist import runs in an
 * exclusive transaction on a second native connection, and SQLite's write lock
 * is per database FILE — so for the duration of that import, every writer that
 * does not hold the app's master lock aborts immediately. The obvious fix,
 * extending the master lock to cover them, is not available: `dataUpdateService`
 * calls `setPreference` at eight sites *while already holding* that lock, so
 * each would queue behind itself and self-deadlock until the hold timeout fired.
 *
 * **What this does and does not buy.** Contention here is expected by design,
 * not exceptional, so a bounded retry is proportionate rather than a way of
 * papering over a race. It covers brief overlap. It does **not** cover a full
 * multi-second import: the budget below is deliberately short, because these
 * callers are background writes (refresh timestamps, queued-operation rows)
 * where a delayed failure is worse than a quick one. When the budget is
 * exhausted the original `DatabaseContentionError` is rethrown, so the caller
 * can still tell a transient abort from a hard failure.
 *
 * Only `DatabaseContentionError` is retried. Retrying anything else just delays
 * the report.
 *
 * ⚠️ **Testing trap.** `jest.setup.js:141` enables fake timers for every suite,
 * so the default sleep never fires under test and an awaited retry hangs to the
 * 30s timeout. Any test that drives a contention path must either inject
 * `sleep` or switch to real timers for that block.
 *
 * @param operation - Human-readable name, used only in the exhaustion log
 * @param task - The write to run
 */
export async function retryOnContention<T>(
  operation: string,
  task: () => Promise<T>,
  options: ContentionRetryOptions = {}
): Promise<T> {
  const attempts = options.attempts ?? 4;
  const initialDelayMs = options.initialDelayMs ?? 100;
  const maxDelayMs = options.maxDelayMs ?? 800;
  const sleep = options.sleep ?? defaultSleep;

  let delay = initialDelayMs;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      if (!(error instanceof DatabaseContentionError) || attempt === attempts) {
        if (error instanceof DatabaseContentionError) {
          console.warn(
            `[retryOnContention] ${operation} still contended after ${attempts} attempts`
          );
        }
        throw error;
      }

      await sleep(delay);
      delay = Math.min(delay * 2, maxDelayMs);
    }
  }

  // Unreachable: the loop either returns or throws on its final attempt.
  throw new Error(`retryOnContention: exhausted without result for ${operation}`);
}
