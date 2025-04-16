import * as SQLite from 'expo-sqlite';
import {
  initDatabase,
  getAllBeers,
  getMyBeers,
  getBeerById,
  searchBeers,
  getBeersNotInMyBeers
} from '../db';
import { Beer, Beerfinder } from '../types';

// Mock SQLite
jest.mock('expo-sqlite', () => {
  const mockDatabase = {
    transaction: jest.fn().mockImplementation((callback) => {
      const mockTransaction = {
        executeSql: jest.fn().mockImplementation((query, params, successCallback) => {
          if (successCallback) {
            successCallback(mockTransaction, { rows: { _array: [], length: 0 } });
          }
          return Promise.resolve({ rows: { _array: [], length: 0 } });
        }),
      };
      callback(mockTransaction);
      return Promise.resolve();
    }),
    exec: jest.fn().mockResolvedValue([{ rows: { _array: [] } }]),
    closeAsync: jest.fn().mockResolvedValue(),
    deleteAsync: jest.fn().mockResolvedValue(),
    execAsync: jest.fn().mockResolvedValue([{ rows: { _array: [] } }]),
    getFirstAsync: jest.fn(),
    getAllAsync: jest.fn(),
    runAsync: jest.fn().mockResolvedValue({ rowsAffected: 1 }),
    withTransactionAsync: jest.fn().mockImplementation(async (callback) => {
      return await callback();
    }),
  };

  return {
    openDatabaseAsync: jest.fn().mockResolvedValue(mockDatabase),
  };
});

describe('Database Operations', () => {
  let mockDatabase: any;
  const mockBeers: Beer[] = [
    {
      id: 'beer-1',
      brew_name: 'Test Beer 1',
      brewer: 'Test Brewery 1',
      brew_style: 'IPA',
      review_rating: '4.5',
      added_date: '2023-01-01'
    },
    {
      id: 'beer-2',
      brew_name: 'Test Beer 2',
      brewer: 'Test Brewery 2',
      brew_style: 'Stout',
      review_rating: '4.2',
      added_date: '2023-01-02'
    }
  ];

  const mockMyBeers: Beerfinder[] = [
    {
      id: 'beer-1',
      brew_name: 'Test Beer 1',
      brewer: 'Test Brewery 1',
      brew_style: 'IPA',
      review_rating: '4.5',
      tasted_date: '2023-01-01'
    }
  ];

  beforeEach(async () => {
    jest.clearAllMocks();
    mockDatabase = await initDatabase();
  });

  describe('getAllBeers', () => {
    it('should return all beers from the database', async () => {
      mockDatabase.getAllAsync.mockResolvedValueOnce(mockBeers);
      
      const result = await getAllBeers();
      
      expect(mockDatabase.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM allbeers')
      );
      expect(result).toEqual(mockBeers);
    });

    it('should handle errors when getting all beers', async () => {
      mockDatabase.getAllAsync.mockRejectedValueOnce(new Error('Database error'));
      
      await expect(getAllBeers()).rejects.toThrow('Database error');
    });
  });

  describe('getMyBeers', () => {
    it('should return all tasted beers from the database', async () => {
      mockDatabase.getAllAsync.mockResolvedValueOnce(mockMyBeers);
      
      const result = await getMyBeers();
      
      expect(mockDatabase.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM tasted_brew_current_round')
      );
      expect(result).toEqual(mockMyBeers);
    });

    it('should handle errors when getting tasted beers', async () => {
      mockDatabase.getAllAsync.mockRejectedValueOnce(new Error('Database error'));
      
      await expect(getMyBeers()).rejects.toThrow('Database error');
    });
  });

  describe('getBeerById', () => {
    it('should return a beer by ID', async () => {
      mockDatabase.getFirstAsync.mockResolvedValueOnce(mockBeers[0]);
      
      const result = await getBeerById('beer-1');
      
      expect(mockDatabase.getFirstAsync).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM allbeers WHERE id = ?'),
        ['beer-1']
      );
      expect(result).toEqual(mockBeers[0]);
    });

    it('should return null if beer is not found', async () => {
      mockDatabase.getFirstAsync.mockResolvedValueOnce(null);
      
      const result = await getBeerById('non-existent-beer');
      
      expect(result).toBeNull();
    });

    it('should handle errors when getting beer by ID', async () => {
      mockDatabase.getFirstAsync.mockRejectedValueOnce(new Error('Database error'));
      
      await expect(getBeerById('beer-1')).rejects.toThrow('Database error');
    });
  });

  describe('searchBeers', () => {
    it('should search beers by query', async () => {
      mockDatabase.getAllAsync.mockResolvedValueOnce(mockBeers);
      
      const result = await searchBeers('IPA');
      
      expect(mockDatabase.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM allbeers'),
        ['%IPA%', '%IPA%', '%IPA%', '%IPA%']
      );
      expect(result).toEqual(mockBeers);
    });

    it('should return all beers if query is empty', async () => {
      mockDatabase.getAllAsync.mockResolvedValueOnce(mockBeers);
      
      const result = await searchBeers('');
      
      expect(mockDatabase.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM allbeers')
      );
      expect(result).toEqual(mockBeers);
    });

    it('should handle errors when searching beers', async () => {
      mockDatabase.getAllAsync.mockRejectedValueOnce(new Error('Database error'));
      
      await expect(searchBeers('IPA')).rejects.toThrow('Database error');
    });
  });

  describe('getBeersNotInMyBeers', () => {
    it('should return beers not in My Beers', async () => {
      mockDatabase.getAllAsync.mockResolvedValueOnce([mockBeers[1]]);
      
      const result = await getBeersNotInMyBeers();
      
      expect(mockDatabase.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM allbeers')
      );
      expect(result).toEqual([mockBeers[1]]);
    });

    it('should handle errors when getting beers not in My Beers', async () => {
      mockDatabase.getAllAsync.mockRejectedValueOnce(new Error('Database error'));
      
      await expect(getBeersNotInMyBeers()).rejects.toThrow('Database error');
    });
  });
});
