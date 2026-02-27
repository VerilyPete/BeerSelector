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

/**
 * Wraps a batch insert operation in a transaction with validation.
 *
 * Validates records before insertion and skips invalid ones.
 * All valid records are inserted atomically - if any insert fails,
 * all inserts are rolled back.
 *
 * @param database - The SQLite database instance
 * @param tableName - Name of the table to insert into
 * @param records - Array of records to insert
 * @param validator - Function to validate each record
 * @param insertFn - Function to insert a single record
 * @returns Operation result with summary
 *
 * @example
 * const result = await withBatchInsert(
 *   db,
 *   'allbeers',
 *   beers,
 *   validateBeerForInsertion,
 *   async (db, beer) => {
 *     await db.runAsync(
 *       'INSERT INTO allbeers (id, brew_name) VALUES (?, ?)',
 *       [beer.id, beer.brew_name]
 *     );
 *   }
 * );
 */
export async function withBatchInsert<T>(
  database: SQLiteDatabase,
  tableName: string,
  records: T[],
  validator: (record: T) => { isValid: boolean; errors: string[] },
  insertFn: (db: SQLiteDatabase, record: T) => Promise<void>
): Promise<DatabaseOperationResult> {
  return await withDatabaseTransaction(database, async db => {
    const validRecords: T[] = [];
    const invalidRecords: { record: T; errors: string[] }[] = [];

    // Validate all records first
    for (const record of records) {
      const validation = validator(record);
      if (validation.isValid) {
        validRecords.push(record);
      } else {
        invalidRecords.push({
          record,
          errors: validation.errors,
        });

        logError(`Skipping invalid record: ${validation.errors.join(', ')}`, {
          operation: 'withBatchInsert',
          component: 'database/transactions',
          additionalData: {
            tableName,
            record,
            errors: validation.errors,
          },
        });
      }
    }

    // Insert all valid records atomically
    let recordsInserted = 0;
    for (const record of validRecords) {
      await insertFn(db, record);
      recordsInserted++;
    }

    logInfo(`Batch insert completed for ${tableName}`, {
      operation: 'withBatchInsert',
      component: 'database/transactions',
      additionalData: {
        tableName,
        total: records.length,
        inserted: recordsInserted,
        skipped: invalidRecords.length,
      },
    });

    return {
      success: true,
      recordsAffected: recordsInserted,
      validRecords,
      invalidRecords: invalidRecords.map(({ record }) => record),
      summary: {
        valid: validRecords.length,
        invalid: invalidRecords.length,
      },
    };
  });
}

/**
 * Wraps a delete-and-insert operation in a transaction.
 *
 * Ensures atomic replacement of data - either both delete and insert succeed,
 * or both are rolled back.
 *
 * @param database - The SQLite database instance
 * @param tableName - Name of the table
 * @param deleteCondition - Optional WHERE clause for DELETE (e.g., "WHERE id > 100")
 * @param newRecords - Array of records to insert
 * @param insertFn - Function to insert a single record
 * @returns Operation result with summary
 *
 * @example
 * // Replace all beers atomically
 * const result = await withReplaceData(
 *   db,
 *   'allbeers',
 *   undefined, // Delete all records
 *   newBeers,
 *   async (db, beer) => {
 *     await db.runAsync(
 *       'INSERT INTO allbeers (id, brew_name) VALUES (?, ?)',
 *       [beer.id, beer.brew_name]
 *     );
 *   }
 * );
 */
export async function withReplaceData<T>(
  database: SQLiteDatabase,
  tableName: string,
  deleteCondition: string | undefined,
  newRecords: T[],
  insertFn: (db: SQLiteDatabase, record: T) => Promise<void>
): Promise<DatabaseOperationResult> {
  return await withDatabaseTransaction(database, async db => {
    // Step 1: Delete old data
    const deleteQuery = deleteCondition
      ? `DELETE FROM ${tableName} ${deleteCondition}`
      : `DELETE FROM ${tableName}`;

    await db.runAsync(deleteQuery);

    logInfo(`Deleted old data from ${tableName}`, {
      operation: 'withReplaceData',
      component: 'database/transactions',
      additionalData: {
        tableName,
        deleteCondition,
      },
    });

    // Step 2: Insert new data
    let recordsInserted = 0;
    for (const record of newRecords) {
      await insertFn(db, record);
      recordsInserted++;
    }

    logInfo(`Replaced data in ${tableName}`, {
      operation: 'withReplaceData',
      component: 'database/transactions',
      additionalData: {
        tableName,
        recordsInserted,
      },
    });

    return {
      success: true,
      recordsAffected: recordsInserted,
    };
  });
}
