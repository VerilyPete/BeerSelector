/**
 * OptimisticUpdateRepository - Database operations for optimistic updates
 *
 * This repository manages persistence of optimistic UI updates to SQLite.
 * Optimistic updates are stored in the database so they survive app restarts.
 *
 * Features:
 * - CRUD operations for optimistic updates
 * - Query by status, type, or operation ID
 * - Automatic cleanup of old completed updates
 * - Transaction support for atomic operations
 */

import { getDatabase } from '../connection';
import {
  OptimisticUpdate,
  OptimisticUpdateRow,
  OptimisticUpdateStatus,
  OptimisticUpdateType,
  RollbackData,
  isOptimisticUpdate,
} from '@/src/types/optimisticUpdate';

/**
 * OptimisticUpdateRepository class - Manages optimistic update database operations
 */
class OptimisticUpdateRepository {
  private tableName = 'optimistic_updates';

  /**
   * Initialize the optimistic_updates table
   */
  async initialize(): Promise<void> {
    try {
      const db = await getDatabase();

      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS ${this.tableName} (
          id TEXT PRIMARY KEY NOT NULL,
          type TEXT NOT NULL,
          status TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          rollback_data TEXT NOT NULL,
          error_message TEXT,
          operation_id TEXT,
          created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
        );
      `);

      // Create indexes for common queries
      await db.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_optimistic_updates_status
        ON ${this.tableName}(status);
      `);

      await db.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_optimistic_updates_operation_id
        ON ${this.tableName}(operation_id);
      `);

      console.log('[OptimisticUpdateRepository] Table initialized');
    } catch (error) {
      console.error('[OptimisticUpdateRepository] Error initializing table:', error);
      throw error;
    }
  }

  /**
   * Convert database row to OptimisticUpdate object
   */
  private rowToUpdate(row: OptimisticUpdateRow): OptimisticUpdate {
    return {
      id: row.id,
      type: row.type as OptimisticUpdateType,
      status: row.status as OptimisticUpdateStatus,
      timestamp: row.timestamp,
      rollbackData: JSON.parse(row.rollback_data) as RollbackData,
      errorMessage: row.error_message,
      operationId: row.operation_id,
    };
  }

  /**
   * Convert OptimisticUpdate to database row
   */
  private updateToRow(update: OptimisticUpdate): OptimisticUpdateRow {
    return {
      id: update.id,
      type: update.type,
      status: update.status,
      timestamp: update.timestamp,
      rollback_data: JSON.stringify(update.rollbackData),
      error_message: update.errorMessage,
      operation_id: update.operationId,
    };
  }

  /**
   * Add a new optimistic update
   */
  async add(update: OptimisticUpdate): Promise<void> {
    try {
      const db = await getDatabase();
      const row = this.updateToRow(update);

      await db.runAsync(
        `INSERT INTO ${this.tableName}
         (id, type, status, timestamp, rollback_data, error_message, operation_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.type,
          row.status,
          row.timestamp,
          row.rollback_data,
          row.error_message ?? null,
          row.operation_id ?? null,
        ]
      );

      console.log(`[OptimisticUpdateRepository] Added update ${update.id}`);
    } catch (error) {
      console.error('[OptimisticUpdateRepository] Error adding update:', error);
      throw error;
    }
  }

  /**
   * Get all optimistic updates
   */
  async getAll(): Promise<OptimisticUpdate[]> {
    try {
      const db = await getDatabase();

      const rows = await db.getAllAsync<OptimisticUpdateRow>(
        `SELECT * FROM ${this.tableName} ORDER BY timestamp DESC`
      );

      return rows.map(this.rowToUpdate);
    } catch (error) {
      console.error('[OptimisticUpdateRepository] Error getting all updates:', error);
      throw error;
    }
  }

  /**
   * Get optimistic update by ID
   */
  async getById(id: string): Promise<OptimisticUpdate | null> {
    try {
      const db = await getDatabase();

      const row = await db.getFirstAsync<OptimisticUpdateRow>(
        `SELECT * FROM ${this.tableName} WHERE id = ?`,
        [id]
      );

      return row ? this.rowToUpdate(row) : null;
    } catch (error) {
      console.error('[OptimisticUpdateRepository] Error getting update by ID:', error);
      throw error;
    }
  }

  /**
   * Get updates by status
   */
  async getByStatus(status: OptimisticUpdateStatus): Promise<OptimisticUpdate[]> {
    try {
      const db = await getDatabase();

      const rows = await db.getAllAsync<OptimisticUpdateRow>(
        `SELECT * FROM ${this.tableName} WHERE status = ? ORDER BY timestamp DESC`,
        [status]
      );

      return rows.map(this.rowToUpdate);
    } catch (error) {
      console.error('[OptimisticUpdateRepository] Error getting updates by status:', error);
      throw error;
    }
  }

  /**
   * Get pending updates (PENDING or SYNCING)
   */
  async getPendingUpdates(): Promise<OptimisticUpdate[]> {
    try {
      const db = await getDatabase();

      const rows = await db.getAllAsync<OptimisticUpdateRow>(
        `SELECT * FROM ${this.tableName}
         WHERE status IN (?, ?)
         ORDER BY timestamp ASC`,
        [OptimisticUpdateStatus.PENDING, OptimisticUpdateStatus.SYNCING]
      );

      return rows.map(this.rowToUpdate);
    } catch (error) {
      console.error('[OptimisticUpdateRepository] Error getting pending updates:', error);
      throw error;
    }
  }

  /**
   * Get update by operation ID
   */
  async getByOperationId(operationId: string): Promise<OptimisticUpdate | null> {
    try {
      const db = await getDatabase();

      const row = await db.getFirstAsync<OptimisticUpdateRow>(
        `SELECT * FROM ${this.tableName} WHERE operation_id = ?`,
        [operationId]
      );

      return row ? this.rowToUpdate(row) : null;
    } catch (error) {
      console.error('[OptimisticUpdateRepository] Error getting update by operation ID:', error);
      throw error;
    }
  }

  /**
   * Update status of an optimistic update
   */
  async updateStatus(
    id: string,
    status: OptimisticUpdateStatus,
    errorMessage?: string
  ): Promise<void> {
    try {
      const db = await getDatabase();

      await db.runAsync(
        `UPDATE ${this.tableName}
         SET status = ?, error_message = ?
         WHERE id = ?`,
        [status, errorMessage ?? null, id]
      );

      console.log(`[OptimisticUpdateRepository] Updated status for ${id} to ${status}`);
    } catch (error) {
      console.error('[OptimisticUpdateRepository] Error updating status:', error);
      throw error;
    }
  }

  /**
   * Link an update to an operation ID
   */
  async linkOperation(updateId: string, operationId: string): Promise<void> {
    try {
      const db = await getDatabase();

      await db.runAsync(
        `UPDATE ${this.tableName} SET operation_id = ? WHERE id = ?`,
        [operationId, updateId]
      );

      console.log(`[OptimisticUpdateRepository] Linked update ${updateId} to operation ${operationId}`);
    } catch (error) {
      console.error('[OptimisticUpdateRepository] Error linking operation:', error);
      throw error;
    }
  }

  /**
   * Delete an optimistic update
   */
  async delete(id: string): Promise<void> {
    try {
      const db = await getDatabase();

      await db.runAsync(`DELETE FROM ${this.tableName} WHERE id = ?`, [id]);

      console.log(`[OptimisticUpdateRepository] Deleted update ${id}`);
    } catch (error) {
      console.error('[OptimisticUpdateRepository] Error deleting update:', error);
      throw error;
    }
  }

  /**
   * Clear all optimistic updates
   */
  async clearAll(): Promise<void> {
    try {
      const db = await getDatabase();

      await db.runAsync(`DELETE FROM ${this.tableName}`);

      console.log('[OptimisticUpdateRepository] Cleared all updates');
    } catch (error) {
      console.error('[OptimisticUpdateRepository] Error clearing all updates:', error);
      throw error;
    }
  }

  /**
   * Clear completed updates older than specified age
   */
  async clearOldCompleted(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<void> {
    try {
      const db = await getDatabase();
      const cutoffTimestamp = Date.now() - maxAgeMs;

      const result = await db.runAsync(
        `DELETE FROM ${this.tableName}
         WHERE status IN (?, ?) AND timestamp < ?`,
        [OptimisticUpdateStatus.SUCCESS, OptimisticUpdateStatus.FAILED, cutoffTimestamp]
      );

      console.log(`[OptimisticUpdateRepository] Cleared ${result.changes} old completed updates`);
    } catch (error) {
      console.error('[OptimisticUpdateRepository] Error clearing old updates:', error);
      throw error;
    }
  }

  /**
   * Count updates by status
   */
  async countByStatus(status: OptimisticUpdateStatus): Promise<number> {
    try {
      const db = await getDatabase();

      const result = await db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM ${this.tableName} WHERE status = ?`,
        [status]
      );

      return result?.count ?? 0;
    } catch (error) {
      console.error('[OptimisticUpdateRepository] Error counting updates:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const optimisticUpdateRepository = new OptimisticUpdateRepository();
