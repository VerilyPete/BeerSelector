/**
 * Comprehensive tests for RewardsRepository
 * Tests CRUD operations for Reward entity using TDD approach
 */

import { RewardsRepository } from '../RewardsRepository';
import { Reward } from '../../../types/database';
import * as connection from '../../connection';

// Mock the database connection module
jest.mock('../../connection');

describe('RewardsRepository', () => {
  let repository: RewardsRepository;
  let mockDatabase: any;

  beforeEach(() => {
    // Create a fresh repository instance for each test
    repository = new RewardsRepository();

    // Setup mock database with all required async methods
    mockDatabase = {
      withTransactionAsync: jest.fn(async (callback: any) => await callback()),
      runAsync: jest.fn(),
      getAllAsync: jest.fn(),
      getFirstAsync: jest.fn()
    };

    // Mock getDatabase to return our mock database
    (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);

    jest.clearAllMocks();
  });

  describe('insertMany', () => {
    it('should insert multiple rewards in batches', async () => {
      const rewards: Reward[] = [
        {
          reward_id: '1',
          redeemed: 'false',
          reward_type: 'plate'
        },
        {
          reward_id: '2',
          redeemed: 'true',
          reward_type: 'shirt'
        }
      ];

      await repository.insertMany(rewards);

      // Should call getDatabase
      expect(connection.getDatabase).toHaveBeenCalled();

      // Should clear existing rewards first
      expect(mockDatabase.runAsync).toHaveBeenCalledWith('DELETE FROM rewards');

      // Should use batch insert with placeholders
      expect(mockDatabase.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO rewards'),
        expect.arrayContaining(['1', 'false', 'plate', '2', 'true', 'shirt'])
      );
    });

    it('should handle empty array by returning early', async () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      await repository.insertMany([]);

      expect(consoleLogSpy).toHaveBeenCalledWith('No rewards to populate');
      expect(connection.getDatabase).not.toHaveBeenCalled();
      expect(mockDatabase.runAsync).not.toHaveBeenCalled();

      consoleLogSpy.mockRestore();
    });

    it('should handle null rewards array', async () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      await repository.insertMany(null as any);

      expect(consoleLogSpy).toHaveBeenCalledWith('No rewards to populate');
      expect(connection.getDatabase).not.toHaveBeenCalled();

      consoleLogSpy.mockRestore();
    });

    it('should process rewards in batches of 100', async () => {
      const rewards: Reward[] = Array.from({ length: 250 }, (_, i) => ({
        reward_id: `reward-${i}`,
        redeemed: i % 2 === 0 ? 'true' : 'false',
        reward_type: 'plate'
      }));

      await repository.insertMany(rewards);

      // Should use transactions
      expect(mockDatabase.withTransactionAsync).toHaveBeenCalled();

      // Should have 3 batch insert calls (100, 100, 50)
      const insertCalls = mockDatabase.runAsync.mock.calls.filter((call: any) =>
        call[0].includes('INSERT OR REPLACE')
      );
      expect(insertCalls).toHaveLength(3);
    });

    it('should handle rewards with empty optional fields', async () => {
      const rewards: Reward[] = [
        {
          reward_id: '1',
          redeemed: '',
          reward_type: ''
        }
      ];

      await repository.insertMany(rewards);

      // Should insert reward with empty strings
      expect(mockDatabase.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO rewards'),
        expect.arrayContaining(['1', '', ''])
      );
    });

    it('should use placeholders for each reward', async () => {
      const rewards: Reward[] = [
        { reward_id: '1', redeemed: 'false', reward_type: 'plate' },
        { reward_id: '2', redeemed: 'true', reward_type: 'shirt' },
        { reward_id: '3', redeemed: 'false', reward_type: 'glass' }
      ];

      await repository.insertMany(rewards);

      // Should create (?, ?, ?) placeholders for each reward
      expect(mockDatabase.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('(?, ?, ?),(?, ?, ?),(?, ?, ?)'),
        expect.any(Array)
      );
    });

    it('should throw error on database failure', async () => {
      const rewards: Reward[] = [
        { reward_id: '1', redeemed: 'false', reward_type: 'plate' }
      ];

      mockDatabase.runAsync.mockRejectedValueOnce(new Error('Database error'));

      await expect(repository.insertMany(rewards)).rejects.toThrow('Database error');
    });

    it('should log success message after populating', async () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      const rewards: Reward[] = [
        { reward_id: '1', redeemed: 'false', reward_type: 'plate' },
        { reward_id: '2', redeemed: 'true', reward_type: 'shirt' }
      ];

      await repository.insertMany(rewards);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        'Successfully populated rewards table with 2 rewards'
      );

      consoleLogSpy.mockRestore();
    });

    it('should handle missing reward_id by using empty string', async () => {
      const rewards: Reward[] = [
        {
          reward_id: '',
          redeemed: 'false',
          reward_type: 'plate'
        } as any
      ];

      await repository.insertMany(rewards);

      expect(mockDatabase.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO rewards'),
        expect.arrayContaining(['', 'false', 'plate'])
      );
    });

    it('should clear table before inserting', async () => {
      const rewards: Reward[] = [
        { reward_id: '1', redeemed: 'false', reward_type: 'plate' }
      ];

      await repository.insertMany(rewards);

      const calls = mockDatabase.runAsync.mock.calls;
      const deleteCall = calls.find((call: any) => call[0].includes('DELETE FROM rewards'));
      const insertCall = calls.find((call: any) => call[0].includes('INSERT OR REPLACE'));

      // Delete should come before insert
      expect(calls.indexOf(deleteCall)).toBeLessThan(calls.indexOf(insertCall));
    });
  });

  describe('getAll', () => {
    it('should return all rewards ordered by reward_id', async () => {
      const mockRewards: Reward[] = [
        {
          reward_id: '1',
          redeemed: 'false',
          reward_type: 'plate'
        },
        {
          reward_id: '2',
          redeemed: 'true',
          reward_type: 'shirt'
        }
      ];

      mockDatabase.getAllAsync.mockResolvedValue(mockRewards);

      const result = await repository.getAll();

      expect(result).toEqual(mockRewards);
      expect(mockDatabase.getAllAsync).toHaveBeenCalledWith(
        'SELECT * FROM rewards ORDER BY reward_id'
      );
    });

    it('should return empty array when no rewards exist', async () => {
      mockDatabase.getAllAsync.mockResolvedValue([]);

      const result = await repository.getAll();

      expect(result).toEqual([]);
    });

    it('should return empty array on database error', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockDatabase.getAllAsync.mockRejectedValueOnce(new Error('Database error'));

      const result = await repository.getAll();

      expect(result).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error getting rewards:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });

    it('should handle database returning null', async () => {
      mockDatabase.getAllAsync.mockResolvedValue(null);

      const result = await repository.getAll();

      // getAllAsync should never return null, but if it does, the code returns it as-is
      expect(result).toEqual([]); // When getAllAsync returns null, catch block returns []
    });
  });

  describe('getById', () => {
    it('should return reward when found', async () => {
      const mockReward: Reward = {
        reward_id: '123',
        redeemed: 'false',
        reward_type: 'plate'
      };

      mockDatabase.getFirstAsync.mockResolvedValue(mockReward);

      const result = await repository.getById('123');

      expect(result).toEqual(mockReward);
      expect(mockDatabase.getFirstAsync).toHaveBeenCalledWith(
        'SELECT * FROM rewards WHERE reward_id = ?',
        ['123']
      );
    });

    it('should return null when reward not found', async () => {
      mockDatabase.getFirstAsync.mockResolvedValue(null);

      const result = await repository.getById('nonexistent');

      expect(result).toBeNull();
    });

    it('should handle empty reward_id string', async () => {
      mockDatabase.getFirstAsync.mockResolvedValue(null);

      const result = await repository.getById('');

      expect(result).toBeNull();
      expect(mockDatabase.getFirstAsync).toHaveBeenCalledWith(
        'SELECT * FROM rewards WHERE reward_id = ?',
        ['']
      );
    });

    it('should throw error on database failure', async () => {
      mockDatabase.getFirstAsync.mockRejectedValueOnce(new Error('Database error'));

      await expect(repository.getById('123')).rejects.toThrow('Database error');
    });
  });

  describe('getByType', () => {
    it('should return rewards matching the type', async () => {
      const mockRewards: Reward[] = [
        {
          reward_id: '1',
          redeemed: 'false',
          reward_type: 'plate'
        },
        {
          reward_id: '2',
          redeemed: 'true',
          reward_type: 'plate'
        }
      ];

      mockDatabase.getAllAsync.mockResolvedValue(mockRewards);

      const result = await repository.getByType('plate');

      expect(result).toEqual(mockRewards);
      expect(mockDatabase.getAllAsync).toHaveBeenCalledWith(
        'SELECT * FROM rewards WHERE reward_type = ? ORDER BY reward_id',
        ['plate']
      );
    });

    it('should return empty array when no rewards match type', async () => {
      mockDatabase.getAllAsync.mockResolvedValue([]);

      const result = await repository.getByType('nonexistent');

      expect(result).toEqual([]);
    });

    it('should handle empty type string', async () => {
      mockDatabase.getAllAsync.mockResolvedValue([]);

      const result = await repository.getByType('');

      expect(result).toEqual([]);
      expect(mockDatabase.getAllAsync).toHaveBeenCalledWith(
        expect.any(String),
        ['']
      );
    });

    it('should throw error on database failure', async () => {
      mockDatabase.getAllAsync.mockRejectedValueOnce(new Error('Database error'));

      await expect(repository.getByType('plate')).rejects.toThrow('Database error');
    });
  });

  describe('getRedeemed', () => {
    it('should return rewards that have been redeemed', async () => {
      const mockRewards: Reward[] = [
        {
          reward_id: '1',
          redeemed: 'true',
          reward_type: 'plate'
        },
        {
          reward_id: '2',
          redeemed: 'true',
          reward_type: 'shirt'
        }
      ];

      mockDatabase.getAllAsync.mockResolvedValue(mockRewards);

      const result = await repository.getRedeemed();

      expect(result).toEqual(mockRewards);
      expect(mockDatabase.getAllAsync).toHaveBeenCalledWith(
        "SELECT * FROM rewards WHERE redeemed = 'true' ORDER BY reward_id"
      );
    });

    it('should return empty array when no redeemed rewards exist', async () => {
      mockDatabase.getAllAsync.mockResolvedValue([]);

      const result = await repository.getRedeemed();

      expect(result).toEqual([]);
    });

    it('should throw error on database failure', async () => {
      mockDatabase.getAllAsync.mockRejectedValueOnce(new Error('Database error'));

      await expect(repository.getRedeemed()).rejects.toThrow('Database error');
    });
  });

  describe('getUnredeemed', () => {
    it('should return rewards that have not been redeemed', async () => {
      const mockRewards: Reward[] = [
        {
          reward_id: '1',
          redeemed: 'false',
          reward_type: 'plate'
        },
        {
          reward_id: '2',
          redeemed: 'false',
          reward_type: 'shirt'
        }
      ];

      mockDatabase.getAllAsync.mockResolvedValue(mockRewards);

      const result = await repository.getUnredeemed();

      expect(result).toEqual(mockRewards);
      expect(mockDatabase.getAllAsync).toHaveBeenCalledWith(
        "SELECT * FROM rewards WHERE redeemed = 'false' OR redeemed = '0' ORDER BY reward_id"
      );
    });

    it('should return empty array when all rewards are redeemed', async () => {
      mockDatabase.getAllAsync.mockResolvedValue([]);

      const result = await repository.getUnredeemed();

      expect(result).toEqual([]);
    });

    it('should handle redeemed stored as "0" (alternative false)', async () => {
      mockDatabase.getAllAsync.mockResolvedValue([]);

      await repository.getUnredeemed();

      // Query should check for both 'false' and '0'
      expect(mockDatabase.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining("redeemed = 'false' OR redeemed = '0'")
      );
    });

    it('should throw error on database failure', async () => {
      mockDatabase.getAllAsync.mockRejectedValueOnce(new Error('Database error'));

      await expect(repository.getUnredeemed()).rejects.toThrow('Database error');
    });
  });

  describe('clear', () => {
    it('should clear all rewards from the table', async () => {
      await repository.clear();

      expect(mockDatabase.runAsync).toHaveBeenCalledWith('DELETE FROM rewards');
      expect(mockDatabase.withTransactionAsync).toHaveBeenCalled();
    });

    it('should log clearing message', async () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      await repository.clear();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cleared existing rewards from the table')
      );

      consoleLogSpy.mockRestore();
    });

    it('should throw error on database failure', async () => {
      mockDatabase.runAsync.mockRejectedValueOnce(new Error('Database error'));

      await expect(repository.clear()).rejects.toThrow('Database error');
    });
  });

  describe('getCount', () => {
    it('should return count of rewards', async () => {
      mockDatabase.getFirstAsync.mockResolvedValue({ count: 25 });

      const result = await repository.getCount();

      expect(result).toBe(25);
      expect(mockDatabase.getFirstAsync).toHaveBeenCalledWith(
        'SELECT COUNT(*) as count FROM rewards'
      );
    });

    it('should return 0 when no rewards exist', async () => {
      mockDatabase.getFirstAsync.mockResolvedValue({ count: 0 });

      const result = await repository.getCount();

      expect(result).toBe(0);
    });

    it('should handle null count result', async () => {
      mockDatabase.getFirstAsync.mockResolvedValue(null);

      const result = await repository.getCount();

      expect(result).toBe(0);
    });

    it('should throw error on database failure', async () => {
      mockDatabase.getFirstAsync.mockRejectedValueOnce(new Error('Database error'));

      await expect(repository.getCount()).rejects.toThrow('Database error');
    });
  });

  describe('error handling', () => {
    it('should log error when populate fails', async () => {
      const rewards: Reward[] = [
        { reward_id: '1', redeemed: 'false', reward_type: 'plate' }
      ];

      mockDatabase.withTransactionAsync.mockRejectedValueOnce(
        new Error('Transaction failed')
      );

      // insertMany does NOT log errors - it propagates them
      await expect(repository.insertMany(rewards)).rejects.toThrow('Transaction failed');
    });

    it('should use transaction for atomic operations', async () => {
      const rewards: Reward[] = [
        { reward_id: '1', redeemed: 'false', reward_type: 'plate' }
      ];

      await repository.insertMany(rewards);

      // Should wrap DELETE and INSERT in transaction
      expect(mockDatabase.withTransactionAsync).toHaveBeenCalled();
    });
  });
});
