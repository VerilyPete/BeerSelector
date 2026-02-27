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

