/**
 * RewardsRepository - Handles CRUD operations for Reward entity
 *
 * Extracted from db.ts as part of HP-1 refactoring.
 * Manages all database operations related to the rewards table.
 */

import { getDatabase } from '../connection';
import { Reward } from '../../types/database';
import { databaseLockManager } from '../locks';

/**
 * Repository class for Reward entity operations
 *
 * Handles:
 * - Batch insertion of rewards with transaction support
 * - Querying rewards by various criteria (id, type, redeemed status)
 */
export class RewardsRepository {
  /**
   * Insert multiple rewards into the database
   *
   * Clears existing data and inserts fresh records in batches of 100.
   * Uses batch insert with placeholders for efficiency.
   * Uses database lock to prevent concurrent operations.
   *
   * @param rewards - Array of Reward objects to insert
   */
  async insertMany(rewards: Reward[]): Promise<void> {
    if (!rewards || rewards.length === 0) {
      console.log('No rewards to populate');
      return;
    }

    // Acquire database lock to prevent concurrent operations
    if (!await databaseLockManager.acquireLock('RewardsRepository.insertMany')) {
      throw new Error('Could not acquire database lock for rewards insertion');
    }

    try {
      await this._insertManyInternal(rewards);
    } finally {
      // Always release the lock
      databaseLockManager.releaseLock('RewardsRepository.insertMany');
    }
  }

  /**
   * Insert multiple rewards without acquiring a lock
   *
   * UNSAFE: This method does NOT acquire a database lock.
   * Only use when already holding a master lock (e.g., in sequential refresh).
   *
   * @param rewards - Array of Reward objects to insert
   */
  async insertManyUnsafe(rewards: Reward[]): Promise<void> {
    if (!rewards || rewards.length === 0) {
      console.log('No rewards to populate');
      return;
    }

    await this._insertManyInternal(rewards);
  }

  /**
   * Internal implementation of rewards insertion (shared by locked and unlocked variants)
   *
   * @param rewards - Array of Reward objects to insert
   */
  private async _insertManyInternal(rewards: Reward[]): Promise<void> {
    const database = await getDatabase();

    // Use a transaction for the entire operation
    await database.withTransactionAsync(async () => {
      // Clear existing rewards
      await database.runAsync('DELETE FROM rewards');
      console.log('Cleared existing rewards from the table');

      // Batch insert new rewards
      const batchSize = 100;
      for (let i = 0; i < rewards.length; i += batchSize) {
        const batch = rewards.slice(i, i + batchSize);

        const placeholders = batch.map(() => '(?, ?, ?)').join(',');
        const values: any[] = [];

        batch.forEach(reward => {
          values.push(
            reward.reward_id || '',
            reward.redeemed || '0',
            reward.reward_type || ''
          );
        });

        await database.runAsync(
          `INSERT OR REPLACE INTO rewards (
            reward_id,
            redeemed,
            reward_type
          ) VALUES ${placeholders}`,
          values
        );
      }
    });

    console.log(`Successfully populated rewards table with ${rewards.length} rewards`);
  }

  /**
   * Get all rewards from the database
   *
   * Returns empty array on error instead of throwing.
   * Orders by reward_id.
   *
   * @returns Array of Reward objects
   */
  async getAll(): Promise<Reward[]> {
    const database = await getDatabase();
    try {
      return await database.getAllAsync(
        'SELECT * FROM rewards ORDER BY reward_id'
      );
    } catch (error) {
      console.error('Error getting rewards:', error);
      return [];
    }
  }

  /**
   * Get a reward by its ID
   *
   * @param id - The reward ID to search for
   * @returns Reward object if found, null otherwise
   */
  async getById(id: string): Promise<Reward | null> {
    const database = await getDatabase();

    try {
      return await database.getFirstAsync(
        'SELECT * FROM rewards WHERE reward_id = ?',
        [id]
      );
    } catch (error) {
      console.error('Error getting reward by ID:', error);
      throw error;
    }
  }

  /**
   * Get rewards by type
   *
   * @param type - Reward type to filter by (e.g., 'plate', 'shirt', 'glass')
   * @returns Array of Reward objects matching the type
   */
  async getByType(type: string): Promise<Reward[]> {
    const database = await getDatabase();

    try {
      return await database.getAllAsync(
        'SELECT * FROM rewards WHERE reward_type = ? ORDER BY reward_id',
        [type]
      );
    } catch (error) {
      console.error('Error getting rewards by type:', error);
      throw error;
    }
  }

  /**
   * Get all redeemed rewards
   *
   * Returns rewards where redeemed = 'true'
   *
   * @returns Array of redeemed Reward objects
   */
  async getRedeemed(): Promise<Reward[]> {
    const database = await getDatabase();

    try {
      return await database.getAllAsync(
        "SELECT * FROM rewards WHERE redeemed = 'true' ORDER BY reward_id"
      );
    } catch (error) {
      console.error('Error getting redeemed rewards:', error);
      throw error;
    }
  }

  /**
   * Get all unredeemed rewards
   *
   * Returns rewards where redeemed = 'false' or '0'
   * Handles both string representations of false.
   *
   * @returns Array of unredeemed Reward objects
   */
  async getUnredeemed(): Promise<Reward[]> {
    const database = await getDatabase();

    try {
      return await database.getAllAsync(
        "SELECT * FROM rewards WHERE redeemed = 'false' OR redeemed = '0' ORDER BY reward_id"
      );
    } catch (error) {
      console.error('Error getting unredeemed rewards:', error);
      throw error;
    }
  }

  /**
   * Clear all rewards from the table
   */
  async clear(): Promise<void> {
    const database = await getDatabase();

    try {
      await database.withTransactionAsync(async () => {
        await database.runAsync('DELETE FROM rewards');
        console.log('Cleared existing rewards from the table');
      });
    } catch (error) {
      console.error('Error clearing rewards:', error);
      throw error;
    }
  }

  /**
   * Get the count of rewards
   *
   * @returns Number of rewards in the table
   */
  async getCount(): Promise<number> {
    const database = await getDatabase();

    try {
      const result = await database.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) as count FROM rewards'
      );
      return result?.count ?? 0;
    } catch (error) {
      console.error('Error getting rewards count:', error);
      throw error;
    }
  }
}

/**
 * Singleton instance for backwards compatibility
 * Existing code can import and use this instance directly
 */
export const rewardsRepository = new RewardsRepository();
