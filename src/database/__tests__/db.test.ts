import * as SQLite from 'expo-sqlite';
import {
  initDatabase,
  populateBeersTable,
  populateMyBeersTable,
  getAllBeers,
  getMyBeers,
  getBeerById,
  searchBeers
} from '../db';
import { Beer, Beerfinder } from '../../types/beer';

// Mock SQLite
jest.mock('expo-sqlite');

describe('Database Operations', () => {
  let mockDatabase: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create a mock database with transaction support
    mockDatabase = {
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
      getFirstAsync: jest.fn().mockResolvedValue(null),
      getAllAsync: jest.fn().mockResolvedValue([]),
      withTransactionAsync: jest.fn().mockImplementation(async (callback) => {
        return await callback();
      }),
    };

    (SQLite.openDatabase as jest.Mock).mockReturnValue(mockDatabase);
  });

  describe('initDatabase', () => {
    it('should initialize the database', async () => {
      const db = await initDatabase();

      expect(SQLite.openDatabase).toHaveBeenCalledWith('beerselector.db');
      expect(db).toBe(mockDatabase);
      expect(mockDatabase.execAsync).toHaveBeenCalled();
    });
  });

  describe('populateBeersTable', () => {
    it('should populate the beers table using transactions', async () => {
      const testBeers: Beer[] = [
        { id: 'beer-1', brew_name: 'Test Beer 1', brewer: 'Brewery 1' },
        { id: 'beer-2', brew_name: 'Test Beer 2', brewer: 'Brewery 2' }
      ];

      await populateBeersTable(testBeers);

      expect(mockDatabase.withTransactionAsync).toHaveBeenCalled();
      expect(mockDatabase.execAsync).toHaveBeenCalledWith('DELETE FROM allbeers');
    });

    it('should handle empty beer array', async () => {
      jest.setTimeout(10000); // Increase timeout for this test
      await populateBeersTable([]);

      expect(mockDatabase.withTransactionAsync).toHaveBeenCalled();
      expect(mockDatabase.execAsync).toHaveBeenCalledWith('DELETE FROM allbeers');
    });
  });

  describe('populateMyBeersTable', () => {
    it('should populate the my beers table using transactions', async () => {
      jest.setTimeout(10000); // Increase timeout for this test
      const testMyBeers: Beerfinder[] = [
        { id: 'beer-1', brew_name: 'Test Beer 1', tasted_date: '2023-01-01' },
        { id: 'beer-2', brew_name: 'Test Beer 2', tasted_date: '2023-01-02' }
      ];

      await populateMyBeersTable(testMyBeers);

      expect(mockDatabase.withTransactionAsync).toHaveBeenCalled();
      expect(mockDatabase.execAsync).toHaveBeenCalledWith('DELETE FROM mybeers');
    });
  });

  describe('getAllBeers', () => {
    it('should return all beers from the database', async () => {
      const mockBeers = [
        { id: 'beer-1', brew_name: 'Test Beer 1' },
        { id: 'beer-2', brew_name: 'Test Beer 2' }
      ];

      mockDatabase.getAllAsync.mockResolvedValue(mockBeers);

      const result = await getAllBeers();

      expect(mockDatabase.getAllAsync).toHaveBeenCalledWith('SELECT * FROM allbeers ORDER BY brew_name');
      expect(result).toEqual(mockBeers);
    });
  });

  describe('getBeerById', () => {
    it('should return a beer by ID', async () => {
      const mockBeer = { id: 'beer-1', brew_name: 'Test Beer 1' };

      mockDatabase.getFirstAsync.mockResolvedValue(mockBeer);

      const result = await getBeerById('beer-1');

      expect(mockDatabase.getFirstAsync).toHaveBeenCalledWith(
        'SELECT * FROM allbeers WHERE id = ?',
        ['beer-1']
      );
      expect(result).toEqual(mockBeer);
    });

    it('should return null if beer not found', async () => {
      mockDatabase.getFirstAsync.mockResolvedValue(null);

      const result = await getBeerById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('searchBeers', () => {
    it('should search beers by query', async () => {
      const mockBeers = [
        { id: 'beer-1', brew_name: 'IPA Beer' },
        { id: 'beer-2', brew_name: 'Another IPA' }
      ];

      mockDatabase.getAllAsync.mockResolvedValue(mockBeers);

      const result = await searchBeers('IPA');

      expect(mockDatabase.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining('LIKE ?'),
        expect.arrayContaining(['%IPA%'])
      );
      expect(result).toEqual(mockBeers);
    });
  });

  describe('getMyBeers', () => {
    it('should return all tasted beers', async () => {
      const mockMyBeers = [
        { id: 'beer-1', brew_name: 'Test Beer 1', tasted_date: '2023-01-01' },
        { id: 'beer-2', brew_name: 'Test Beer 2', tasted_date: '2023-01-02' }
      ];

      mockDatabase.getAllAsync.mockResolvedValue(mockMyBeers);

      const result = await getMyBeers();

      expect(mockDatabase.getAllAsync).toHaveBeenCalledWith('SELECT * FROM mybeers ORDER BY tasted_date DESC');
      expect(result).toEqual(mockMyBeers);
    });
  });
});
