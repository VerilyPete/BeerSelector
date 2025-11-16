/**
 * OperationQueueRepository - Database operations for queued operations
 *
 * This repository manages the persistence of operations that failed due to network issues
 * and need to be retried when connection is restored.
 *
 * Features:
 * - Add operations to queue
 * - Retrieve pending operations
 * - Update operation status
 * - Delete operations
 * - Clear all operations
 *
 * @example
 * ```typescript
 * import { operationQueueRepository } from '@/src/database/repositories/OperationQueueRepository';
 *
 * // Add operation to queue
 * await operationQueueRepository.addOperation({
 *   id: '123',
 *   type: OperationType.CHECK_IN_BEER,
 *   payload: { beerId: '456', ... },
 *   timestamp: Date.now(),
 *   retryCount: 0,
 *   status: OperationStatus.PENDING
 * });
 *
 * // Get all pending operations
 * const pending = await operationQueueRepository.getPendingOperations();
 * ```
 */

import { getDatabase } from '../connection';
import {
  QueuedOperation,
  QueuedOperationRow,
  OperationStatus,
  OperationType,
  OperationPayload,
  isQueuedOperation,
} from '../../types/operationQueue';

// ============================================================================
// REPOSITORY CLASS
// ============================================================================

class OperationQueueRepository {
  /**
   * Add a new operation to the queue
   *
   * @param operation - The operation to queue
   * @throws Error if operation cannot be added
   */
  async addOperation(operation: QueuedOperation): Promise<void> {
    const database = await getDatabase();

    try {
      const payloadJson = JSON.stringify(operation.payload);

      await database.runAsync(
        `INSERT INTO operation_queue (
          id, type, payload, timestamp, retry_count, status, error_message, last_retry_timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          operation.id,
          operation.type,
          payloadJson,
          operation.timestamp,
          operation.retryCount,
          operation.status,
          operation.errorMessage ?? null,
          operation.lastRetryTimestamp ?? null,
        ]
      );

      console.log(`[OperationQueueRepository] Added operation to queue: ${operation.id} (${operation.type})`);
    } catch (error) {
      console.error('[OperationQueueRepository] Error adding operation to queue:', error);
      throw error;
    }
  }

  /**
   * Get all pending operations from the queue
   *
   * @returns Array of pending operations
   */
  async getPendingOperations(): Promise<QueuedOperation[]> {
    const database = await getDatabase();

    try {
      const rows = await database.getAllAsync<QueuedOperationRow>(
        `SELECT * FROM operation_queue WHERE status = ? ORDER BY timestamp ASC`,
        [OperationStatus.PENDING]
      );

      return this.rowsToOperations(rows || []);
    } catch (error) {
      console.error('[OperationQueueRepository] Error getting pending operations:', error);
      return [];
    }
  }

  /**
   * Get all operations (any status) from the queue
   *
   * @returns Array of all operations
   */
  async getAllOperations(): Promise<QueuedOperation[]> {
    const database = await getDatabase();

    try {
      const rows = await database.getAllAsync<QueuedOperationRow>(
        `SELECT * FROM operation_queue ORDER BY timestamp DESC`
      );

      return this.rowsToOperations(rows || []);
    } catch (error) {
      console.error('[OperationQueueRepository] Error getting all operations:', error);
      return [];
    }
  }

  /**
   * Get a single operation by ID
   *
   * @param id - Operation ID
   * @returns The operation or null if not found
   */
  async getOperationById(id: string): Promise<QueuedOperation | null> {
    const database = await getDatabase();

    try {
      const row = await database.getFirstAsync<QueuedOperationRow>(
        `SELECT * FROM operation_queue WHERE id = ?`,
        [id]
      );

      if (!row) {
        return null;
      }

      return this.rowToOperation(row);
    } catch (error) {
      console.error(`[OperationQueueRepository] Error getting operation ${id}:`, error);
      return null;
    }
  }

  /**
   * Update operation status
   *
   * @param id - Operation ID
   * @param status - New status
   * @param errorMessage - Optional error message
   */
  async updateStatus(id: string, status: OperationStatus, errorMessage?: string): Promise<void> {
    const database = await getDatabase();

    try {
      await database.runAsync(
        `UPDATE operation_queue SET status = ?, error_message = ? WHERE id = ?`,
        [status, errorMessage ?? null, id]
      );

      console.log(`[OperationQueueRepository] Updated operation ${id} status to ${status}`);
    } catch (error) {
      console.error(`[OperationQueueRepository] Error updating operation ${id} status:`, error);
      throw error;
    }
  }

  /**
   * Increment retry count and update last retry timestamp
   *
   * @param id - Operation ID
   * @param errorMessage - Optional error message
   */
  async incrementRetryCount(id: string, errorMessage?: string): Promise<void> {
    const database = await getDatabase();

    try {
      const now = Date.now();

      await database.runAsync(
        `UPDATE operation_queue
         SET retry_count = retry_count + 1,
             last_retry_timestamp = ?,
             error_message = ?,
             status = ?
         WHERE id = ?`,
        [now, errorMessage ?? null, OperationStatus.PENDING, id]
      );

      console.log(`[OperationQueueRepository] Incremented retry count for operation ${id}`);
    } catch (error) {
      console.error(`[OperationQueueRepository] Error incrementing retry count for ${id}:`, error);
      throw error;
    }
  }

  /**
   * Delete a specific operation from the queue
   *
   * @param id - Operation ID
   */
  async deleteOperation(id: string): Promise<void> {
    const database = await getDatabase();

    try {
      await database.runAsync(
        `DELETE FROM operation_queue WHERE id = ?`,
        [id]
      );

      console.log(`[OperationQueueRepository] Deleted operation ${id}`);
    } catch (error) {
      console.error(`[OperationQueueRepository] Error deleting operation ${id}:`, error);
      throw error;
    }
  }

  /**
   * Delete all successful operations from the queue
   */
  async deleteSuccessfulOperations(): Promise<void> {
    const database = await getDatabase();

    try {
      await database.runAsync(
        `DELETE FROM operation_queue WHERE status = ?`,
        [OperationStatus.SUCCESS]
      );

      console.log('[OperationQueueRepository] Deleted all successful operations');
    } catch (error) {
      console.error('[OperationQueueRepository] Error deleting successful operations:', error);
      throw error;
    }
  }

  /**
   * Clear all operations from the queue
   */
  async clearAll(): Promise<void> {
    const database = await getDatabase();

    try {
      await database.runAsync(`DELETE FROM operation_queue`);
      console.log('[OperationQueueRepository] Cleared all operations from queue');
    } catch (error) {
      console.error('[OperationQueueRepository] Error clearing operation queue:', error);
      throw error;
    }
  }

  /**
   * Get count of operations by status
   *
   * @param status - Operation status to count
   * @returns Count of operations with the given status
   */
  async getCountByStatus(status: OperationStatus): Promise<number> {
    const database = await getDatabase();

    try {
      const result = await database.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM operation_queue WHERE status = ?`,
        [status]
      );

      return result?.count ?? 0;
    } catch (error) {
      console.error(`[OperationQueueRepository] Error getting count for status ${status}:`, error);
      return 0;
    }
  }

  /**
   * Get total count of all operations
   *
   * @returns Total count of operations in queue
   */
  async getTotalCount(): Promise<number> {
    const database = await getDatabase();

    try {
      const result = await database.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM operation_queue`
      );

      return result?.count ?? 0;
    } catch (error) {
      console.error('[OperationQueueRepository] Error getting total count:', error);
      return 0;
    }
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Convert database row to QueuedOperation object
   */
  private rowToOperation(row: QueuedOperationRow): QueuedOperation | null {
    try {
      const payload = JSON.parse(row.payload) as OperationPayload;

      const operation: QueuedOperation = {
        id: row.id,
        type: row.type as OperationType,
        payload,
        timestamp: row.timestamp,
        retryCount: row.retry_count,
        status: row.status as OperationStatus,
        errorMessage: row.error_message ?? undefined,
        lastRetryTimestamp: row.last_retry_timestamp ?? undefined,
      };

      // Validate the operation
      if (!isQueuedOperation(operation)) {
        console.error('[OperationQueueRepository] Invalid operation from database:', row);
        return null;
      }

      return operation;
    } catch (error) {
      console.error('[OperationQueueRepository] Error parsing operation row:', error);
      return null;
    }
  }

  /**
   * Convert array of database rows to array of QueuedOperation objects
   */
  private rowsToOperations(rows: QueuedOperationRow[]): QueuedOperation[] {
    return rows
      .map((row) => this.rowToOperation(row))
      .filter((op): op is QueuedOperation => op !== null);
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

/**
 * Singleton instance of OperationQueueRepository
 * Use this instance for all operation queue database operations
 */
export const operationQueueRepository = new OperationQueueRepository();
