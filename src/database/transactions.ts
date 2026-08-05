/**
 * Database Transaction Helpers
 *
 * Provides utilities for wrapping database operations in transactions
 * to ensure atomicity and automatic rollback on errors.
 *
 * @example
 * import { withDatabaseTransaction } from './transactions';
 * import { getDatabase } from './connection';
 *
 * const result = await withDatabaseTransaction(getDatabase(), async (db) => {
 *   await db.runAsync('DELETE FROM allbeers');
 *   await db.runAsync('INSERT INTO allbeers...');
 *   return { success: true, recordsAffected: 100 };
 * });
 */

import { SQLiteDatabase } from 'expo-sqlite';
import { logError, logInfo } from '../utils/errorLogger';

/**
 * Result of a database operation
 */
export type DatabaseOperationResult<T = unknown> = {
  success: boolean;
  recordsAffected?: number;
  data?: T;
  validRecords?: T[];
  invalidRecords?: unknown[];
  summary?: {
    valid: number;
    invalid: number;
  };
};

/**
 * Type for database operation callbacks
 */
export type DatabaseOperation<T = DatabaseOperationResult> = (db: SQLiteDatabase) => Promise<T>;

/**
 * The subset of the transaction handle that write bodies actually use.
 *
 * Narrow on purpose: it lets the web branch of `withAtomicWrite` pass the
 * database itself without a type assertion.
 */
export type TransactionLike = Pick<SQLiteDatabase, 'runAsync' | 'getFirstAsync' | 'prepareAsync'>;

/**
 * Run a write inside an exclusive transaction where the platform supports one.
 *
 * `withTransactionAsync` is documented as non-exclusive and interruptible by
 * other async queries, which means a concurrent write can be absorbed into the
 * transaction and rolled back with it. `withExclusiveTransactionAsync` opens on
 * a separate native connection instead, so a competing writer aborts with
 * `database is locked` rather than corrupting the write — see
 * `src/database/errors.ts` for how that surfaces.
 *
 * ⚠️ Every query inside `task` must go through the `txn` argument. A call on the
 * enclosing `database` handle executes outside the transaction: a write aborts
 * loudly, but a **read succeeds and silently returns the pre-transaction
 * snapshot**. Prefer removing a read from a transaction body over carrying it
 * correctly.
 *
 * The platform is a parameter rather than a `Platform.OS` read so both branches
 * are unit-testable. The web branch is load-bearing, not a nicety:
 * `withExclusiveTransactionAsync` hard-throws on web as its first statement, so
 * calling it unguarded there would break every import.
 *
 * ⚠️ **Web is not equivalent to the pre-exclusive behaviour, and is in one
 * respect worse.** Before this helper existed the import ran ~25 short
 * transactions (the delete, then one per 50-row batch). Web now runs ONE
 * non-exclusive transaction spanning the delete and every insert — which is
 * exactly the shape review round 1 rejected for native, because a concurrent
 * write gets absorbed into the transaction and rolled back with it while its
 * caller has already been told it succeeded. Exclusivity closes that on native;
 * web gets the widened window without the fix. Judged acceptable only because
 * web is Expo scaffolding rather than a shipped target (CLAUDE.md pins iOS
 * 17.6+), and stated here rather than papered over as "today's semantics".
 *
 * @param database - The SQLite database instance
 * @param platform - `'web'` for the non-exclusive fallback, `'native'` otherwise
 * @param task - The write to run, using the supplied transaction handle
 */
export async function withAtomicWrite(
  database: SQLiteDatabase,
  platform: 'web' | 'native',
  task: (txn: TransactionLike) => Promise<void>
): Promise<void> {
  if (platform === 'web') {
    await database.withTransactionAsync(async () => {
      await task(database);
    });
    return;
  }

  await database.withExclusiveTransactionAsync(async txn => {
    await task(txn);
  });
}

/**
 * Wraps a database operation in a transaction with automatic rollback on error.
 *
 * Uses expo-sqlite's withTransactionAsync() which automatically:
 * - Starts a transaction before executing the callback
 * - Commits the transaction if the callback succeeds
 * - Rolls back the transaction if the callback throws an error
 *
 * @param database - The SQLite database instance
 * @param operation - The operation to execute within the transaction
 * @returns The result of the operation
 * @throws Error if the operation fails (transaction will be rolled back)
 *
 * @example
 * // Atomic beer data refresh
 * const result = await withDatabaseTransaction(db, async (db) => {
 *   // Step 1: Clear old data
 *   await db.runAsync('DELETE FROM allbeers');
 *
 *   // Step 2: Insert new data
 *   for (const beer of newBeers) {
 *     await db.runAsync(
 *       'INSERT INTO allbeers (id, brew_name, ...) VALUES (?, ?, ...)',
 *       [beer.id, beer.brew_name, ...]
 *     );
 *   }
 *
 *   // Step 3: Update timestamp
 *   await db.runAsync(
 *     'UPDATE preferences SET value = ? WHERE key = ?',
 *     [Date.now().toString(), 'last_update']
 *   );
 *
 *   return { success: true, recordsAffected: newBeers.length };
 * });
 *
 * // If any step fails, all changes are rolled back automatically
 */
export async function withDatabaseTransaction<T = DatabaseOperationResult>(
  database: SQLiteDatabase,
  operation: DatabaseOperation<T>
): Promise<T> {
  try {
    logInfo('Starting database transaction', {
      operation: 'withDatabaseTransaction',
    });

    let result: T;
    await database.withTransactionAsync(async () => {
      result = await operation(database);
    });

    logInfo('Database transaction committed successfully', {
      operation: 'withDatabaseTransaction',
    });

    return result!;
  } catch (error) {
    // Transaction automatically rolls back on error
    logError(error, {
      operation: 'withDatabaseTransaction',
      component: 'database/transactions',
      additionalData: {
        message: 'Transaction failed and was rolled back',
      },
    });

    // Re-throw the error for the caller to handle
    throw error;
  }
}
