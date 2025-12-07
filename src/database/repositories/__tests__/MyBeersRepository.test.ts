/**
 * Comprehensive tests for MyBeersRepository
 * Tests CRUD operations for tasted beers (Beerfinder) entity using TDD approach
 */

import { MyBeersRepository } from '../MyBeersRepository';
import { BeerfinderWithContainerType } from '../../../types/beer';
import * as connection from '../../connection';

// Mock the database connection module
jest.mock('../../connection');

describe('MyBeersRepository', () => {
  let repository: MyBeersRepository;
  let mockDatabase: any;

  beforeEach(() => {
    // Create a fresh repository instance for each test
    repository = new MyBeersRepository();

    // Setup mock database with all required async methods
    mockDatabase = {
      withTransactionAsync: jest.fn(async (callback: any) => await callback()),
      runAsync: jest.fn(),
      getAllAsync: jest.fn(),
      getFirstAsync: jest.fn(),
    };

    // Mock getDatabase to return our mock database
    (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);

    jest.clearAllMocks();
  });

  describe('insertMany', () => {
    it('should insert multiple tasted beers in batches', async () => {
      const beers: BeerfinderWithContainerType[] = [
        {
          id: '1',
          brew_name: 'Tasted IPA',
          brewer: 'Test Brewery',
          roh_lap: '1',
          tasted_date: '2024-01-01',
          chit_code: 'CHT123',
          container_type: 'pint',
        },
        {
          id: '2',
          brew_name: 'Tasted Stout',
          brewer: 'Another Brewery',
          roh_lap: '2',
          tasted_date: '2024-01-02',
          chit_code: 'CHT456',
          container_type: 'tulip',
        },
      ];

      mockDatabase.getFirstAsync.mockResolvedValue({ count: 0 });

      await repository.insertMany(beers);

      // Should call getDatabase
      expect(connection.getDatabase).toHaveBeenCalled();

      // Should clear existing tasted beers first
      expect(mockDatabase.runAsync).toHaveBeenCalledWith('DELETE FROM tasted_brew_current_round');

      // Should insert all beers
      expect(mockDatabase.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO tasted_brew_current_round'),
        expect.arrayContaining(['1', '1', '2024-01-01', 'Tasted IPA', 'Test Brewery'])
      );
    });

    it('should handle empty array by clearing the table', async () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      mockDatabase.getFirstAsync.mockResolvedValue({ count: 5 });

      await repository.insertMany([]);

      // Should log clearing for new user or round rollover
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('clearing tasted_brew_current_round table')
      );

      // Should clear the table
      expect(mockDatabase.runAsync).toHaveBeenCalledWith('DELETE FROM tasted_brew_current_round');

      // Should not insert any beers
      const insertCalls = mockDatabase.runAsync.mock.calls.filter((call: any) =>
        call[0].includes('INSERT OR REPLACE')
      );
      expect(insertCalls).toHaveLength(0);

      consoleLogSpy.mockRestore();
    });

    it('should filter out beers without IDs', async () => {
      const beers: BeerfinderWithContainerType[] = [
        {
          id: '1',
          brew_name: 'Valid Beer',
          brewer: 'Test Brewery',
          roh_lap: '1',
          container_type: 'pint',
        },
        {
          id: '',
          brew_name: 'Invalid Beer - No ID',
          brewer: 'Test Brewery',
          roh_lap: '2',
          container_type: 'pint',
        } as BeerfinderWithContainerType,
        {
          id: '2',
          brew_name: 'Another Valid Beer',
          brewer: 'Test Brewery',
          roh_lap: '3',
          container_type: 'tulip',
        },
      ];

      mockDatabase.getFirstAsync.mockResolvedValue({ count: 0 });

      await repository.insertMany(beers);

      // Should only insert the valid beers (2 beers)
      const insertCalls = mockDatabase.runAsync.mock.calls.filter((call: any) =>
        call[0].includes('INSERT OR REPLACE')
      );

      expect(insertCalls).toHaveLength(2);
      expect(insertCalls[0][1]).toContain('1');
      expect(insertCalls[1][1]).toContain('2');
    });

    it('should clear table when all beers are invalid', async () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      const beers: BeerfinderWithContainerType[] = [
        {
          id: '',
          brew_name: 'Invalid Beer 1',
          brewer: 'Test Brewery',
          container_type: 'pint',
        } as BeerfinderWithContainerType,
        {
          id: '',
          brew_name: 'Invalid Beer 2',
          brewer: 'Test Brewery',
          container_type: 'pint',
        } as BeerfinderWithContainerType,
      ];

      mockDatabase.getFirstAsync.mockResolvedValue({ count: 0 });

      await repository.insertMany(beers);

      // Should log clearing table due to all invalid beers
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('No valid beers with IDs found')
      );

      // Should clear the table
      expect(mockDatabase.runAsync).toHaveBeenCalledWith('DELETE FROM tasted_brew_current_round');

      // Should not insert any beers
      const insertCalls = mockDatabase.runAsync.mock.calls.filter((call: any) =>
        call[0].includes('INSERT OR REPLACE')
      );
      expect(insertCalls).toHaveLength(0);

      consoleLogSpy.mockRestore();
    });

    it('should process beers in batches of 20', async () => {
      const beers: BeerfinderWithContainerType[] = Array.from({ length: 50 }, (_, i) => ({
        id: `beer-${i}`,
        brew_name: `Beer ${i}`,
        brewer: 'Test Brewery',
        roh_lap: `${i}`,
        container_type: i % 2 === 0 ? ('pint' as const) : ('tulip' as const),
      }));

      mockDatabase.getFirstAsync.mockResolvedValue({ count: 0 });

      await repository.insertMany(beers);

      // Should use transactions for batching
      expect(mockDatabase.withTransactionAsync).toHaveBeenCalled();

      // Should insert all 50 beers
      const insertCalls = mockDatabase.runAsync.mock.calls.filter((call: any) =>
        call[0].includes('INSERT OR REPLACE')
      );
      expect(insertCalls).toHaveLength(50);
    });

    it('should handle beers with optional fields missing', async () => {
      const beers: BeerfinderWithContainerType[] = [
        {
          id: '1',
          brew_name: 'Minimal Tasted Beer',
          container_type: 'pint',
          // All optional Beerfinder fields missing
        },
      ];

      mockDatabase.getFirstAsync.mockResolvedValue({ count: 0 });

      await repository.insertMany(beers);

      // Should insert beer with empty strings for missing fields
      expect(mockDatabase.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO tasted_brew_current_round'),
        expect.arrayContaining(['1', '', '', 'Minimal Tasted Beer', '', '', '', '', '', '', '', ''])
      );
    });

    it('should throw error on database failure during insert', async () => {
      const beers: BeerfinderWithContainerType[] = [
        { id: '1', brew_name: 'Test Beer', brewer: 'Test Brewery', container_type: 'pint' },
      ];

      mockDatabase.runAsync.mockRejectedValueOnce(new Error('Database error'));

      await expect(repository.insertMany(beers)).rejects.toThrow('Database error');
    });

    it('should log progress during import', async () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      const beers: BeerfinderWithContainerType[] = Array.from({ length: 10 }, (_, i) => ({
        id: `beer-${i}`,
        brew_name: `Beer ${i}`,
        brewer: 'Test Brewery',
        roh_lap: `${i}`,
        container_type: 'pint' as const,
      }));

      mockDatabase.getFirstAsync.mockResolvedValue({ count: 0 });

      await repository.insertMany(beers);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Populating My Beers table with 10 beers')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('My Beers import complete')
      );

      consoleLogSpy.mockRestore();
    });

    it('should include all Beerfinder-specific fields in insert', async () => {
      const beers: BeerfinderWithContainerType[] = [
        {
          id: '1',
          brew_name: 'Complete Beer',
          brewer: 'Test Brewery',
          roh_lap: '5',
          tasted_date: '2024-01-15',
          review_ratings: '4.5',
          chit_code: 'CHT789',
          container_type: 'tulip',
        },
      ];

      mockDatabase.getFirstAsync.mockResolvedValue({ count: 0 });

      await repository.insertMany(beers);

      // Should include roh_lap, tasted_date, review_ratings, chit_code
      expect(mockDatabase.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('roh_lap, tasted_date'),
        expect.arrayContaining(['1', '5', '2024-01-15', 'Complete Beer', 'Test Brewery'])
      );
      expect(mockDatabase.runAsync).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['CHT789'])
      );
    });
  });

  describe('getAll', () => {
    it('should return all tasted beers ordered by id', async () => {
      const mockBeers: BeerfinderWithContainerType[] = [
        {
          id: '1',
          brew_name: 'Tasted Beer 1',
          brewer: 'Brewery 1',
          roh_lap: '1',
          tasted_date: '2024-01-01',
          container_type: 'pint',
        },
        {
          id: '2',
          brew_name: 'Tasted Beer 2',
          brewer: 'Brewery 2',
          roh_lap: '2',
          tasted_date: '2024-01-02',
          container_type: 'tulip',
        },
      ];

      mockDatabase.getAllAsync.mockResolvedValue(mockBeers);

      const result = await repository.getAll();

      expect(result).toEqual(mockBeers);
      expect(mockDatabase.getAllAsync).toHaveBeenCalledWith(
        'SELECT * FROM tasted_brew_current_round ORDER BY id'
      );
    });

    it('should return empty array when no tasted beers exist', async () => {
      mockDatabase.getAllAsync.mockResolvedValue([]);

      const result = await repository.getAll();

      expect(result).toEqual([]);
    });

    it('should throw error on database failure', async () => {
      mockDatabase.getAllAsync.mockRejectedValueOnce(new Error('Database error'));

      await expect(repository.getAll()).rejects.toThrow('Database error');
    });

    it('should log retrieval of tasted beers', async () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      mockDatabase.getAllAsync.mockResolvedValue([]);

      await repository.getAll();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Executing query to get tasted beers')
      );

      consoleLogSpy.mockRestore();
    });

    it('should log when no tasted beers found and check table structure', async () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      // First call for getAll returns empty array
      mockDatabase.getAllAsync.mockResolvedValueOnce([]);

      // Second call for table check returns table exists
      mockDatabase.getAllAsync.mockResolvedValueOnce([{ name: 'tasted_brew_current_round' }]);

      // Third call for column info
      mockDatabase.getAllAsync.mockResolvedValueOnce([
        { name: 'id', type: 'TEXT' },
        { name: 'brew_name', type: 'TEXT' },
      ]);

      await repository.getAll();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('No tasted beers found in the database')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Table tasted_brew_current_round exists')
      );

      consoleLogSpy.mockRestore();
    });
  });

  describe('getById', () => {
    it('should return tasted beer when found', async () => {
      const mockBeer: BeerfinderWithContainerType = {
        id: '123',
        brew_name: 'Tasted IPA',
        brewer: 'Test Brewery',
        roh_lap: '5',
        tasted_date: '2024-01-15',
        container_type: 'pint',
      };

      mockDatabase.getFirstAsync.mockResolvedValue(mockBeer);

      const result = await repository.getById('123');

      expect(result).toEqual(mockBeer);
      expect(mockDatabase.getFirstAsync).toHaveBeenCalledWith(
        'SELECT * FROM tasted_brew_current_round WHERE id = ?',
        ['123']
      );
    });

    it('should return null when beer not found', async () => {
      mockDatabase.getFirstAsync.mockResolvedValue(null);

      const result = await repository.getById('nonexistent');

      expect(result).toBeNull();
    });

    it('should handle empty ID string', async () => {
      mockDatabase.getFirstAsync.mockResolvedValue(null);

      const result = await repository.getById('');

      expect(result).toBeNull();
      expect(mockDatabase.getFirstAsync).toHaveBeenCalledWith(
        'SELECT * FROM tasted_brew_current_round WHERE id = ?',
        ['']
      );
    });

    it('should throw error on database failure', async () => {
      mockDatabase.getFirstAsync.mockRejectedValueOnce(new Error('Database error'));

      await expect(repository.getById('123')).rejects.toThrow('Database error');
    });
  });

  describe('clear', () => {
    it('should clear all tasted beers from the table', async () => {
      mockDatabase.getFirstAsync
        .mockResolvedValueOnce({ count: 10 })
        .mockResolvedValueOnce({ count: 0 });

      await repository.clear();

      expect(mockDatabase.runAsync).toHaveBeenCalledWith('DELETE FROM tasted_brew_current_round');
      expect(mockDatabase.withTransactionAsync).toHaveBeenCalled();
    });

    it('should log the number of rows removed', async () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      mockDatabase.getFirstAsync
        .mockResolvedValueOnce({ count: 15 })
        .mockResolvedValueOnce({ count: 0 });

      await repository.clear();

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('removed 15 rows'));

      consoleLogSpy.mockRestore();
    });

    it('should handle clearing empty table', async () => {
      mockDatabase.getFirstAsync
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 });

      await repository.clear();

      expect(mockDatabase.runAsync).toHaveBeenCalledWith('DELETE FROM tasted_brew_current_round');
    });

    it('should throw error on database failure', async () => {
      mockDatabase.runAsync.mockRejectedValueOnce(new Error('Database error'));

      await expect(repository.clear()).rejects.toThrow('Database error');
    });
  });

  describe('getCount', () => {
    it('should return count of tasted beers', async () => {
      mockDatabase.getFirstAsync.mockResolvedValue({ count: 42 });

      const result = await repository.getCount();

      expect(result).toBe(42);
      expect(mockDatabase.getFirstAsync).toHaveBeenCalledWith(
        'SELECT COUNT(*) as count FROM tasted_brew_current_round'
      );
    });

    it('should return 0 when no beers exist', async () => {
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
    it('should handle individual beer insert errors gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const beers: BeerfinderWithContainerType[] = [
        { id: '1', brew_name: 'Beer 1', brewer: 'Brewery 1', container_type: 'pint' },
        { id: '2', brew_name: 'Beer 2', brewer: 'Brewery 2', container_type: 'tulip' },
      ];

      mockDatabase.getFirstAsync.mockResolvedValue({ count: 0 });

      // First insert fails, second succeeds
      mockDatabase.runAsync
        .mockResolvedValueOnce(undefined) // DELETE succeeds
        .mockRejectedValueOnce(new Error('Insert failed for beer 1')) // First beer fails
        .mockResolvedValueOnce(undefined); // Second beer succeeds

      await repository.insertMany(beers);

      // Should log error for failed beer but continue
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error inserting beer'),
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });

    it('should throw error on transaction failure', async () => {
      const beers: BeerfinderWithContainerType[] = [
        { id: '1', brew_name: 'Test Beer', brewer: 'Test Brewery', container_type: 'pint' },
      ];

      mockDatabase.withTransactionAsync.mockRejectedValueOnce(new Error('Transaction failed'));

      await expect(repository.insertMany(beers)).rejects.toThrow('Transaction failed');
    });
  });

  describe('insertManyUnsafe', () => {
    it('should insert beers without acquiring lock', async () => {
      const beers: BeerfinderWithContainerType[] = [
        {
          id: '1',
          brew_name: 'Test Beer 1',
          brewer: 'Test Brewery',
          roh_lap: '1',
          container_type: 'pint',
        },
        {
          id: '2',
          brew_name: 'Test Beer 2',
          brewer: 'Test Brewery',
          roh_lap: '2',
          container_type: 'tulip',
        },
      ];

      mockDatabase.getFirstAsync.mockResolvedValue({ count: 0 });

      await repository.insertManyUnsafe(beers);

      expect(mockDatabase.withTransactionAsync).toHaveBeenCalled();
      const insertCalls = mockDatabase.runAsync.mock.calls.filter((call: any) =>
        call[0].includes('INSERT OR REPLACE')
      );
      expect(insertCalls).toHaveLength(2);
    });

    it('should handle empty array by clearing table', async () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      mockDatabase.getFirstAsync.mockResolvedValue({ count: 5 });

      await repository.insertManyUnsafe([]);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Empty beers array'));
      expect(mockDatabase.runAsync).toHaveBeenCalledWith('DELETE FROM tasted_brew_current_round');
      consoleLogSpy.mockRestore();
    });

    it('should clear table when all beers invalid', async () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      const beers: BeerfinderWithContainerType[] = [
        {
          id: '',
          brew_name: 'Invalid Beer',
          brewer: 'Test',
          container_type: 'pint',
        } as BeerfinderWithContainerType,
      ];

      mockDatabase.getFirstAsync.mockResolvedValue({ count: 0 });

      await repository.insertManyUnsafe(beers);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('No valid beers with IDs found')
      );
      expect(mockDatabase.runAsync).toHaveBeenCalledWith('DELETE FROM tasted_brew_current_round');
      consoleLogSpy.mockRestore();
    });

    it('should process beers in batches of 20', async () => {
      const beers: BeerfinderWithContainerType[] = Array.from({ length: 50 }, (_, i) => ({
        id: `beer-${i}`,
        brew_name: `Beer ${i}`,
        brewer: 'Test Brewery',
        roh_lap: `${i}`,
        container_type: i % 2 === 0 ? ('pint' as const) : ('tulip' as const),
      }));

      mockDatabase.getFirstAsync.mockResolvedValue({ count: 0 });

      await repository.insertManyUnsafe(beers);

      const insertCalls = mockDatabase.runAsync.mock.calls.filter((call: any) =>
        call[0].includes('INSERT OR REPLACE')
      );
      expect(insertCalls).toHaveLength(50);
    });

    it('should skip beers without IDs during insert', async () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      const beers: BeerfinderWithContainerType[] = [
        { id: '1', brew_name: 'Valid', brewer: 'Test', container_type: 'pint' },
        {
          id: '',
          brew_name: 'Invalid',
          brewer: 'Test',
          container_type: 'pint',
        } as BeerfinderWithContainerType,
        { id: '2', brew_name: 'Valid 2', brewer: 'Test', container_type: 'tulip' },
      ];

      mockDatabase.getFirstAsync.mockResolvedValue({ count: 0 });

      await repository.insertManyUnsafe(beers);

      const insertCalls = mockDatabase.runAsync.mock.calls.filter((call: any) =>
        call[0].includes('INSERT OR REPLACE')
      );
      expect(insertCalls).toHaveLength(2); // Only valid beers inserted
      consoleLogSpy.mockRestore();
    });

    it('should handle insert errors gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const beers: BeerfinderWithContainerType[] = [
        { id: '1', brew_name: 'Beer 1', brewer: 'Test', container_type: 'pint' },
      ];

      mockDatabase.getFirstAsync.mockResolvedValue({ count: 0 });
      mockDatabase.runAsync
        .mockResolvedValueOnce(undefined) // DELETE succeeds
        .mockRejectedValueOnce(new Error('Insert failed')); // INSERT fails

      await repository.insertManyUnsafe(beers);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error inserting beer'),
        expect.any(Error)
      );
      consoleErrorSpy.mockRestore();
    });

    it('should log final row count', async () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      const beers: BeerfinderWithContainerType[] = [
        { id: '1', brew_name: 'Test Beer', brewer: 'Test', container_type: 'pint' },
      ];

      mockDatabase.getFirstAsync.mockResolvedValueOnce({ count: 1 }); // Final count after insert

      await repository.insertManyUnsafe(beers);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('My Beers import complete')
      );
      consoleLogSpy.mockRestore();
    });

    it('should throw error on transaction failure', async () => {
      const beers: BeerfinderWithContainerType[] = [
        { id: '1', brew_name: 'Test Beer', brewer: 'Test', container_type: 'pint' },
      ];

      mockDatabase.withTransactionAsync.mockRejectedValueOnce(new Error('Transaction failed'));

      await expect(repository.insertManyUnsafe(beers)).rejects.toThrow('Transaction failed');
    });
  });
});
