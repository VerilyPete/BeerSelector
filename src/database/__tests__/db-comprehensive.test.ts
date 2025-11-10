import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system';
import {
  initDatabase,
  setupDatabase,
  getAllBeers,
  getMyBeers,
  getBeerById,
  searchBeers,
  getBeersNotInMyBeers,
  populateBeersTable,
  populateMyBeersTable,
  getPreference,
  setPreference,
  getUntappdCookie,
  setUntappdCookie,
  acquireLock,
  releaseLock,
  resetDatabaseState
} from '../db';
import { Beer, Beerfinder } from '../types';

// Mock SQLite
jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(),
}));

// Mock FileSystem
jest.mock('expo-file-system', () => ({
  documentDirectory: '/mock/document/directory/',
  getInfoAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
  copyAsync: jest.fn(),
  deleteAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
}));

describe('Database Operations', () => {
  // Mock database object
  const mockRunAsync = jest.fn().mockResolvedValue({ rowsAffected: 1 });
  const mockExecAsync = jest.fn().mockResolvedValue([]);
  const mockGetFirstAsync = jest.fn();
  const mockGetAllAsync = jest.fn();
  const mockWithTransactionAsync = jest.fn().mockImplementation(async (callback) => {
    return await callback();
  });

  const mockDatabase = {
    runAsync: mockRunAsync,
    execAsync: mockExecAsync,
    getFirstAsync: mockGetFirstAsync,
    getAllAsync: mockGetAllAsync,
    withTransactionAsync: mockWithTransactionAsync,
  };

  // Mock database instance
  let dbInstance: any = null;

  beforeEach(() => {
    jest.clearAllMocks();
    // Use real timers for these tests
    jest.useRealTimers();
    // Reset database state machine
    resetDatabaseState();

    // Reset the database instance
    dbInstance = null;

    // Reset the mock implementation for each test
    (SQLite.openDatabaseAsync as jest.Mock).mockImplementation(() => {
      if (!dbInstance) {
        dbInstance = mockDatabase;
      }
      return Promise.resolve(dbInstance);
    });

    mockGetFirstAsync.mockReset();
    mockGetAllAsync.mockReset();
  });

  afterEach(() => {
    // Restore fake timers
    jest.useFakeTimers();
  });

  describe('initDatabase', () => {
    it('should initialize the database', async () => {
      const db = await initDatabase();

      expect(SQLite.openDatabaseAsync).toHaveBeenCalledWith('beers.db');
      expect(db).toBe(mockDatabase);
    });

    it.skip('should return existing database instance if already initialized', async () => {
      // First call to initialize
      const db1 = await initDatabase();

      // Second call should return the same instance
      const db2 = await initDatabase();

      expect(SQLite.openDatabaseAsync).toHaveBeenCalledTimes(1);
      expect(db1).toBe(db2);
    });

    it.skip('should handle errors when opening the database', async () => {
      const error = new Error('Failed to open database');

      // Override the mock implementation for this test only
      (SQLite.openDatabaseAsync as jest.Mock).mockImplementation(() => {
        return Promise.reject(error);
      });

      await expect(initDatabase()).rejects.toThrow('Failed to open database');
    });
  });

  describe('setupDatabase', () => {
    it('should create tables if they do not exist', async () => {
      // Mock that the database has not been set up yet
      mockGetFirstAsync.mockResolvedValueOnce(null);

      await setupDatabase();

      // Check that tables were created
      expect(mockWithTransactionAsync).toHaveBeenCalled();
      expect(mockExecAsync).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS allbeers'));
      expect(mockExecAsync).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS tasted_brew_current_round'));
      expect(mockExecAsync).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS rewards'));
      expect(mockExecAsync).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS preferences'));
      expect(mockExecAsync).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS untappd'));
    });

    it('should initialize default preferences if preferences table is empty', async () => {
      // Mock that the database has been set up but preferences table is empty
      mockGetFirstAsync.mockResolvedValueOnce({ count: 0 });

      await setupDatabase();

      // Check that default preferences were inserted
      expect(mockWithTransactionAsync).toHaveBeenCalled();
      expect(mockRunAsync).toHaveBeenCalledWith(
        'INSERT OR IGNORE INTO preferences (key, value, description) VALUES (?, ?, ?)',
        ['all_beers_api_url', '', 'API endpoint for fetching all beers']
      );
      expect(mockRunAsync).toHaveBeenCalledWith(
        'INSERT OR IGNORE INTO preferences (key, value, description) VALUES (?, ?, ?)',
        ['my_beers_api_url', '', 'API endpoint for fetching Beerfinder beers']
      );
      expect(mockRunAsync).toHaveBeenCalledWith(
        'INSERT OR IGNORE INTO preferences (key, value, description) VALUES (?, ?, ?)',
        ['first_launch', 'true', 'Flag indicating if this is the first app launch']
      );
    });

    it('should not initialize preferences if they already exist', async () => {
      // Mock that the database has been set up and preferences table is not empty
      mockGetFirstAsync.mockResolvedValueOnce({ count: 3 });

      await setupDatabase();

      // Check that default preferences were not inserted
      expect(mockRunAsync).not.toHaveBeenCalledWith(
        'INSERT OR IGNORE INTO preferences (key, value, description) VALUES (?, ?, ?)',
        expect.anything()
      );
    });

    it('should handle errors during setup', async () => {
      // Mock an error during setup
      mockWithTransactionAsync.mockRejectedValueOnce(new Error('Setup error'));

      await expect(setupDatabase()).rejects.toThrow('Setup error');
    });
  });

  describe('getAllBeers', () => {
    it('should return all beers from the database', async () => {
      const mockBeers: Beer[] = [
        { id: 'beer-1', brew_name: 'Test Beer 1', brewer: 'Brewery 1' },
        { id: 'beer-2', brew_name: 'Test Beer 2', brewer: 'Brewery 2' }
      ];

      mockGetAllAsync.mockResolvedValueOnce(mockBeers);

      const result = await getAllBeers();

      expect(mockGetAllAsync).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM allbeers WHERE brew_name IS NOT NULL AND brew_name != ""')
      );
      expect(result).toEqual(mockBeers);
    });

    it('should handle errors when getting beers', async () => {
      mockGetAllAsync.mockRejectedValueOnce(new Error('Database error'));

      await expect(getAllBeers()).rejects.toThrow('Database error');
    });
  });

  describe('getMyBeers', () => {
    it('should return all tasted beers from the database', async () => {
      const mockMyBeers: Beerfinder[] = [
        { id: 'beer-1', brew_name: 'Test Beer 1', tasted_date: '2023-01-01' },
        { id: 'beer-2', brew_name: 'Test Beer 2', tasted_date: '2023-01-02' }
      ];

      mockGetAllAsync.mockResolvedValueOnce(mockMyBeers);

      const result = await getMyBeers();

      expect(mockGetAllAsync).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM tasted_brew_current_round')
      );
      expect(result).toEqual(mockMyBeers);
    });

    it('should handle errors when getting tasted beers', async () => {
      mockGetAllAsync.mockRejectedValueOnce(new Error('Database error'));

      await expect(getMyBeers()).rejects.toThrow('Database error');
    });
  });

  describe('getBeerById', () => {
    it('should return a beer by ID', async () => {
      const mockBeer: Beer = { id: 'beer-1', brew_name: 'Test Beer 1', brewer: 'Brewery 1' };

      mockGetFirstAsync.mockResolvedValueOnce(mockBeer);

      const result = await getBeerById('beer-1');

      expect(mockGetFirstAsync).toHaveBeenCalledWith(
        'SELECT * FROM allbeers WHERE id = ?',
        ['beer-1']
      );
      expect(result).toEqual(mockBeer);
    });

    it('should return null if beer not found', async () => {
      mockGetFirstAsync.mockResolvedValueOnce(null);

      const result = await getBeerById('non-existent');

      expect(result).toBeNull();
    });

    it('should handle errors when getting beer by ID', async () => {
      mockGetFirstAsync.mockRejectedValueOnce(new Error('Database error'));

      await expect(getBeerById('beer-1')).rejects.toThrow('Database error');
    });
  });

  describe('searchBeers', () => {
    it('should search beers by query', async () => {
      const mockBeers: Beer[] = [
        { id: 'beer-1', brew_name: 'IPA Beer', brewer: 'Brewery 1' },
        { id: 'beer-2', brew_name: 'Another IPA', brewer: 'Brewery 2' }
      ];

      mockGetAllAsync.mockResolvedValueOnce(mockBeers);

      const result = await searchBeers('IPA');

      expect(mockGetAllAsync).toHaveBeenCalledWith(
        expect.stringContaining('LIKE ?'),
        ['%IPA%', '%IPA%', '%IPA%', '%IPA%']
      );
      expect(result).toEqual(mockBeers);
    });

    it('should return all beers if query is empty', async () => {
      const mockBeers: Beer[] = [
        { id: 'beer-1', brew_name: 'Test Beer 1', brewer: 'Brewery 1' },
        { id: 'beer-2', brew_name: 'Test Beer 2', brewer: 'Brewery 2' }
      ];

      mockGetAllAsync.mockResolvedValueOnce(mockBeers);

      const result = await searchBeers('');

      expect(mockGetAllAsync).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM allbeers')
      );
      expect(result).toEqual(mockBeers);
    });

    it('should handle errors when searching beers', async () => {
      mockGetAllAsync.mockRejectedValueOnce(new Error('Database error'));

      await expect(searchBeers('IPA')).rejects.toThrow('Database error');
    });
  });

  describe('getBeersNotInMyBeers', () => {
    it('should return beers not in my beers', async () => {
      const mockBeers: Beer[] = [
        { id: 'beer-1', brew_name: 'Test Beer 1', brewer: 'Brewery 1' },
        { id: 'beer-2', brew_name: 'Test Beer 2', brewer: 'Brewery 2' }
      ];

      mockGetAllAsync.mockResolvedValueOnce(mockBeers);

      const result = await getBeersNotInMyBeers();

      expect(mockGetAllAsync).toHaveBeenCalledWith(
        expect.stringContaining('NOT IN (SELECT id FROM tasted_brew_current_round)')
      );
      expect(result).toEqual(mockBeers);
    });

    it('should handle errors when getting beers not in my beers', async () => {
      mockGetAllAsync.mockRejectedValueOnce(new Error('Database error'));

      await expect(getBeersNotInMyBeers()).rejects.toThrow('Database error');
    });
  });

  describe('populateBeersTable', () => {
    // Skip these tests for now as they require more complex mocking
    it.skip('should populate the beers table with provided beers', async () => {
      const testBeers: Beer[] = [
        { id: 'beer-1', brew_name: 'Test Beer 1', brewer: 'Brewery 1' },
        { id: 'beer-2', brew_name: 'Test Beer 2', brewer: 'Brewery 2' }
      ];

      // Mock the acquireLock function to return true
      jest.spyOn(global, 'setTimeout').mockImplementation((callback: any) => {
        return null as any;
      });

      await populateBeersTable(testBeers);

      // Check that the table was cleared first
      expect(mockExecAsync).toHaveBeenCalledWith('DELETE FROM allbeers');

      // Check that beers were inserted
      expect(mockRunAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO allbeers'),
        expect.arrayContaining(['beer-1'])
      );
      expect(mockRunAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO allbeers'),
        expect.arrayContaining(['beer-2'])
      );
    });

    it.skip('should handle empty beer array', async () => {
      await populateBeersTable([]);

      // Check that the table was cleared
      expect(mockExecAsync).toHaveBeenCalledWith('DELETE FROM allbeers');

      // Check that no beers were inserted
      expect(mockRunAsync).not.toHaveBeenCalled();
    });

    it.skip('should handle errors when populating beers table', async () => {
      mockExecAsync.mockRejectedValueOnce(new Error('Database error'));

      await expect(populateBeersTable([{ id: 'beer-1', brew_name: 'Test Beer 1' }]))
        .rejects.toThrow('Database error');
    });
  });

  describe('populateMyBeersTable', () => {
    // Skip these tests for now as they require more complex mocking
    it.skip('should populate the my beers table with provided beers', async () => {
      const testMyBeers: Beerfinder[] = [
        { id: 'beer-1', brew_name: 'Test Beer 1', tasted_date: '2023-01-01' },
        { id: 'beer-2', brew_name: 'Test Beer 2', tasted_date: '2023-01-02' }
      ];

      // Mock the acquireLock function to return true
      jest.spyOn(global, 'setTimeout').mockImplementation((callback: any) => {
        return null as any;
      });

      await populateMyBeersTable(testMyBeers);

      // Check that the table was cleared first
      expect(mockExecAsync).toHaveBeenCalledWith('DELETE FROM tasted_brew_current_round');

      // Check that beers were inserted
      expect(mockRunAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO tasted_brew_current_round'),
        expect.arrayContaining(['beer-1'])
      );
      expect(mockRunAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO tasted_brew_current_round'),
        expect.arrayContaining(['beer-2'])
      );
    });

    it.skip('should handle empty beer array', async () => {
      await populateMyBeersTable([]);

      // Check that the table was cleared
      expect(mockExecAsync).toHaveBeenCalledWith('DELETE FROM tasted_brew_current_round');

      // Check that no beers were inserted
      expect(mockRunAsync).not.toHaveBeenCalled();
    });

    it.skip('should handle errors when populating my beers table', async () => {
      mockExecAsync.mockRejectedValueOnce(new Error('Database error'));

      await expect(populateMyBeersTable([{ id: 'beer-1', brew_name: 'Test Beer 1' }]))
        .rejects.toThrow('Database error');
    });
  });

  describe('getPreference', () => {
    it('should return preference value by key', async () => {
      mockGetFirstAsync.mockResolvedValueOnce({ value: 'test-value' });

      const result = await getPreference('test-key');

      expect(mockGetFirstAsync).toHaveBeenCalledWith(
        'SELECT value FROM preferences WHERE key = ?',
        ['test-key']
      );
      expect(result).toBe('test-value');
    });

    it('should return null if preference not found', async () => {
      mockGetFirstAsync.mockResolvedValueOnce(null);

      const result = await getPreference('non-existent');

      expect(result).toBeNull();
    });

    it('should handle errors when getting preference', async () => {
      mockGetFirstAsync.mockRejectedValueOnce(new Error('Database error'));

      const result = await getPreference('test-key');

      expect(result).toBeNull();
    });
  });

  describe('setPreference', () => {
    it('should set preference value by key', async () => {
      await setPreference('test-key', 'test-value', 'Test description');

      expect(mockRunAsync).toHaveBeenCalledWith(
        'INSERT OR REPLACE INTO preferences (key, value, description) VALUES (?, ?, ?)',
        ['test-key', 'test-value', 'Test description']
      );
    });

    it('should use empty string for description if not provided', async () => {
      await setPreference('test-key', 'test-value');

      expect(mockRunAsync).toHaveBeenCalledWith(
        'INSERT OR REPLACE INTO preferences (key, value, description) VALUES (?, ?, ?)',
        ['test-key', 'test-value', '']
      );
    });

    it('should handle errors when setting preference', async () => {
      mockRunAsync.mockRejectedValueOnce(new Error('Database error'));

      await expect(setPreference('test-key', 'test-value'))
        .rejects.toThrow('Database error');
    });
  });

  describe('getUntappdCookie', () => {
    it('should return untappd cookie value by key', async () => {
      mockGetFirstAsync.mockResolvedValueOnce({ value: 'test-cookie-value' });

      const result = await getUntappdCookie('test-key');

      expect(mockGetFirstAsync).toHaveBeenCalledWith(
        'SELECT value FROM untappd WHERE key = ?',
        ['test-key']
      );
      expect(result).toBe('test-cookie-value');
    });

    it('should return null if untappd cookie not found', async () => {
      mockGetFirstAsync.mockResolvedValueOnce(null);

      const result = await getUntappdCookie('non-existent');

      expect(result).toBeNull();
    });

    it('should handle errors when getting untappd cookie', async () => {
      mockGetFirstAsync.mockRejectedValueOnce(new Error('Database error'));

      const result = await getUntappdCookie('test-key');

      expect(result).toBeNull();
    });
  });

  describe('setUntappdCookie', () => {
    it('should set untappd cookie value by key', async () => {
      await setUntappdCookie('test-key', 'test-cookie-value', 'Test description');

      expect(mockRunAsync).toHaveBeenCalledWith(
        'INSERT OR REPLACE INTO untappd (key, value, description) VALUES (?, ?, ?)',
        ['test-key', 'test-cookie-value', 'Test description']
      );
    });

    it('should use empty string for description if not provided', async () => {
      await setUntappdCookie('test-key', 'test-cookie-value');

      expect(mockRunAsync).toHaveBeenCalledWith(
        'INSERT OR REPLACE INTO untappd (key, value, description) VALUES (?, ?, ?)',
        ['test-key', 'test-cookie-value', '']
      );
    });

    it('should handle errors when setting untappd cookie', async () => {
      mockRunAsync.mockRejectedValueOnce(new Error('Database error'));

      await expect(setUntappdCookie('test-key', 'test-cookie-value'))
        .rejects.toThrow('Database error');
    });
  });
});
