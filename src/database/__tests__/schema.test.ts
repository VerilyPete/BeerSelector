/**
 * Tests for database schema and table creation
 */

import { setupDatabase, initDatabase, resetDatabaseState } from '../db';
import * as connection from '../connection';

// Mock the connection module
jest.mock('../connection');

describe('Database Schema', () => {
  const mockExecAsync = jest.fn().mockResolvedValue(undefined);
  const mockRunAsync = jest.fn().mockResolvedValue({ changes: 0, lastInsertRowId: 0 });
  const mockGetFirstAsync = jest.fn();
  const mockGetAllAsync = jest.fn().mockResolvedValue([]);
  const mockWithTransactionAsync = jest.fn(async (callback) => {
    await callback();
  });

  const mockDatabase = {
    execAsync: mockExecAsync,
    runAsync: mockRunAsync,
    getFirstAsync: mockGetFirstAsync,
    getAllAsync: mockGetAllAsync,
    withTransactionAsync: mockWithTransactionAsync,
    closeAsync: jest.fn().mockResolvedValue(undefined),
  };

  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();

    // Use real timers for these tests
    jest.useRealTimers();

    // Reset database state machine
    resetDatabaseState();

    // Mock getDatabase to return our mock database
    (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);

    // Spy on console methods
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    // Reset mocks
    mockExecAsync.mockClear().mockResolvedValue(undefined);
    mockRunAsync.mockClear().mockResolvedValue({ changes: 0, lastInsertRowId: 0 });
    mockGetFirstAsync.mockClear();
    mockGetAllAsync.mockClear().mockResolvedValue([]);
    mockWithTransactionAsync.mockClear().mockImplementation(async (callback) => {
      await callback();
    });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    // Restore fake timers
    jest.useFakeTimers();
  });

  describe('setupDatabase', () => {
    it('should create all required tables', async () => {
      await setupDatabase();

      // Verify that withTransactionAsync was called
      expect(mockWithTransactionAsync).toHaveBeenCalled();

      // Verify that execAsync was called for each table
      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS allbeers')
      );
      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS tasted_brew_current_round')
      );
      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS rewards')
      );
      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS preferences')
      );
      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS untappd')
      );
    });

    it('should create allbeers table with correct columns', async () => {
      await setupDatabase();

      // Find the call that creates the allbeers table
      const allbeersCall = (mockExecAsync as jest.Mock).mock.calls.find(
        call => call[0].includes('CREATE TABLE IF NOT EXISTS allbeers')
      );

      expect(allbeersCall).toBeDefined();
      const sql = allbeersCall[0];

      // Verify all required columns exist
      expect(sql).toContain('id TEXT PRIMARY KEY');
      expect(sql).toContain('added_date TEXT');
      expect(sql).toContain('brew_name TEXT');
      expect(sql).toContain('brewer TEXT');
      expect(sql).toContain('brewer_loc TEXT');
      expect(sql).toContain('brew_style TEXT');
      expect(sql).toContain('brew_container TEXT');
      expect(sql).toContain('review_count TEXT');
      expect(sql).toContain('review_rating TEXT');
      expect(sql).toContain('brew_description TEXT');
    });

    it('should create tasted_brew_current_round table with correct columns', async () => {
      await setupDatabase();

      const tastedBrewCall = (mockExecAsync as jest.Mock).mock.calls.find(
        call => call[0].includes('CREATE TABLE IF NOT EXISTS tasted_brew_current_round')
      );

      expect(tastedBrewCall).toBeDefined();
      const sql = tastedBrewCall[0];

      // Verify all required columns
      expect(sql).toContain('id TEXT PRIMARY KEY');
      expect(sql).toContain('roh_lap TEXT');
      expect(sql).toContain('tasted_date TEXT');
      expect(sql).toContain('brew_name TEXT');
      expect(sql).toContain('brewer TEXT');
      expect(sql).toContain('brewer_loc TEXT');
      expect(sql).toContain('brew_style TEXT');
      expect(sql).toContain('brew_container TEXT');
      expect(sql).toContain('review_count TEXT');
      expect(sql).toContain('review_ratings TEXT');
      expect(sql).toContain('brew_description TEXT');
      expect(sql).toContain('chit_code TEXT');
    });

    it('should create rewards table with correct columns', async () => {
      await setupDatabase();

      const rewardsCall = (mockExecAsync as jest.Mock).mock.calls.find(
        call => call[0].includes('CREATE TABLE IF NOT EXISTS rewards')
      );

      expect(rewardsCall).toBeDefined();
      const sql = rewardsCall[0];

      expect(sql).toContain('reward_id TEXT PRIMARY KEY');
      expect(sql).toContain('redeemed TEXT');
      expect(sql).toContain('reward_type TEXT');
    });

    it('should create preferences table with correct columns', async () => {
      await setupDatabase();

      const preferencesCall = (mockExecAsync as jest.Mock).mock.calls.find(
        call => call[0].includes('CREATE TABLE IF NOT EXISTS preferences')
      );

      expect(preferencesCall).toBeDefined();
      const sql = preferencesCall[0];

      expect(sql).toContain('key TEXT PRIMARY KEY');
      expect(sql).toContain('value TEXT');
      expect(sql).toContain('description TEXT');
    });

    it('should create untappd table with correct columns', async () => {
      await setupDatabase();

      const untappdCall = (mockExecAsync as jest.Mock).mock.calls.find(
        call => call[0].includes('CREATE TABLE IF NOT EXISTS untappd')
      );

      expect(untappdCall).toBeDefined();
      const sql = untappdCall[0];

      expect(sql).toContain('key TEXT PRIMARY KEY');
      expect(sql).toContain('value TEXT');
      expect(sql).toContain('description TEXT');
    });

    it('should initialize default preferences if table is empty', async () => {
      // Mock getFirstAsync to return 0 count (empty table)
      mockGetFirstAsync.mockResolvedValue({ count: 0 });

      await setupDatabase();

      // Verify default preferences were inserted
      const runAsyncCalls = (mockRunAsync as jest.Mock).mock.calls;

      // Should have inserted preferences for:
      // - all_beers_api_url
      // - my_beers_api_url
      // - first_launch
      const preferenceInserts = runAsyncCalls.filter(
        call => call[0] && call[0].includes('INSERT OR IGNORE INTO preferences')
      );

      expect(preferenceInserts.length).toBeGreaterThanOrEqual(3);

      // Verify specific preferences were inserted
      const insertedKeys = preferenceInserts.map(call => call[1][0]);
      expect(insertedKeys).toContain('all_beers_api_url');
      expect(insertedKeys).toContain('my_beers_api_url');
      expect(insertedKeys).toContain('first_launch');
    });

    it('should not reinitialize preferences if table already has data', async () => {
      // Mock getFirstAsync to return non-zero count (table has data)
      mockGetFirstAsync.mockResolvedValue({ count: 5 });

      await setupDatabase();

      // Verify no preference inserts occurred
      const runAsyncCalls = (mockRunAsync as jest.Mock).mock.calls;
      const preferenceInserts = runAsyncCalls.filter(
        call => call[0] && call[0].includes('INSERT OR IGNORE INTO preferences')
      );

      expect(preferenceInserts.length).toBe(0);
    });

    it('should handle errors gracefully', async () => {
      // Mock execAsync to throw an error
      const testError = new Error('Database creation failed');
      mockExecAsync.mockRejectedValue(testError);

      // Should throw the error
      await expect(setupDatabase()).rejects.toThrow('Database creation failed');

      // Verify error was logged
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error setting up database:',
        testError
      );
    });

    it('should use a transaction for table creation', async () => {
      await setupDatabase();

      // Verify transaction was used
      expect(mockWithTransactionAsync).toHaveBeenCalled();

      // Verify all table creation happened within the transaction callback
      const transactionCallback = mockWithTransactionAsync.mock.calls[0][0];
      expect(typeof transactionCallback).toBe('function');
    });

    it('should log setup completion', async () => {
      mockGetFirstAsync.mockResolvedValue({ count: 0 });

      await setupDatabase();

      expect(consoleLogSpy).toHaveBeenCalledWith('Database setup complete');
    });
  });

  describe('initDatabase', () => {
    it('should call getDatabase from connection module', async () => {
      const result = await initDatabase();

      expect(connection.getDatabase).toHaveBeenCalled();
      expect(result).toBe(mockDatabase);
    });

    it('should return the same database instance', async () => {
      const db1 = await initDatabase();
      const db2 = await initDatabase();

      // Should call getDatabase twice
      expect(connection.getDatabase).toHaveBeenCalledTimes(2);

      // But both should return the same mock database
      expect(db1).toBe(db2);
      expect(db1).toBe(mockDatabase);
    });
  });

  describe('Table Schema Verification', () => {
    it('should have 5 tables total', async () => {
      await setupDatabase();

      // Count the number of CREATE TABLE calls
      const createTableCalls = (mockExecAsync as jest.Mock).mock.calls.filter(
        call => call[0].includes('CREATE TABLE IF NOT EXISTS')
      );

      expect(createTableCalls.length).toBe(5);
    });

    it('should use TEXT type for all columns', async () => {
      await setupDatabase();

      const createTableCalls = (mockExecAsync as jest.Mock).mock.calls.filter(
        call => call[0].includes('CREATE TABLE IF NOT EXISTS')
      );

      // Verify all tables use TEXT columns (no INTEGER, REAL, etc.)
      createTableCalls.forEach(call => {
        const sql = call[0];
        expect(sql).toMatch(/TEXT/);
      });
    });

    it('should use PRIMARY KEY for id columns', async () => {
      await setupDatabase();

      const createTableCalls = (mockExecAsync as jest.Mock).mock.calls.filter(
        call => call[0].includes('CREATE TABLE IF NOT EXISTS')
      );

      // Verify each table has a PRIMARY KEY
      createTableCalls.forEach(call => {
        const sql = call[0];
        expect(sql).toMatch(/PRIMARY KEY/);
      });
    });

    it('should use IF NOT EXISTS for all tables', async () => {
      await setupDatabase();

      const createTableCalls = (mockExecAsync as jest.Mock).mock.calls.filter(
        call => call[0].includes('CREATE TABLE')
      );

      // Verify all use IF NOT EXISTS
      createTableCalls.forEach(call => {
        const sql = call[0];
        expect(sql).toContain('IF NOT EXISTS');
      });
    });
  });
});
