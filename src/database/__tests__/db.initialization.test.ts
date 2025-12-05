/**
 * Unit tests for initializeBeerDatabase function
 *
 * These tests cover:
 * - Happy path: successful initialization with all imports
 * - API configuration: behavior when API URLs not configured
 * - Visitor mode: skipping authenticated-only imports
 * - Error handling: graceful degradation on failures
 * - Background timing: correct delays for My Beers and Rewards
 */

import { initializeBeerDatabase } from '../db';
import { setupDatabase } from '../db';
import { areApiUrlsConfigured, getPreference } from '../preferences';
import { fetchBeersFromAPI, fetchMyBeersFromAPI, fetchRewardsFromAPI } from '../../api/beerApi';
import { beerRepository } from '../repositories/BeerRepository';
import { myBeersRepository } from '../repositories/MyBeersRepository';
import { rewardsRepository } from '../repositories/RewardsRepository';

// Mock all dependencies
jest.mock('../connection', () => ({
  getDatabase: jest.fn().mockResolvedValue({
    getAllAsync: jest.fn().mockResolvedValue([]),
    getFirstAsync: jest.fn().mockResolvedValue(null),
    runAsync: jest.fn().mockResolvedValue({ rowsAffected: 1 }),
    execAsync: jest.fn().mockResolvedValue(undefined),
    withTransactionAsync: jest.fn().mockImplementation(async callback => {
      return await callback();
    }),
  }),
}));

jest.mock('../preferences', () => ({
  getPreference: jest.fn(),
  setPreference: jest.fn(),
  areApiUrlsConfigured: jest.fn(),
}));

jest.mock('../schema', () => ({
  setupTables: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../initializationState', () => ({
  databaseInitializer: {
    isReady: jest.fn().mockReturnValue(false),
    isError: jest.fn().mockReturnValue(false),
    isInitializing: jest.fn().mockReturnValue(false),
    setInitializing: jest.fn(),
    setReady: jest.fn(),
    setError: jest.fn(),
    reset: jest.fn(),
    waitUntilReady: jest.fn().mockResolvedValue(undefined),
    getErrorMessage: jest.fn().mockReturnValue(''),
  },
}));

jest.mock('../repositories/BeerRepository', () => ({
  beerRepository: {
    insertMany: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../repositories/MyBeersRepository', () => ({
  myBeersRepository: {
    insertMany: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../repositories/RewardsRepository', () => ({
  rewardsRepository: {
    insertMany: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../../api/beerApi', () => ({
  fetchBeersFromAPI: jest.fn(),
  fetchMyBeersFromAPI: jest.fn(),
  fetchRewardsFromAPI: jest.fn(),
}));

// Mock console methods to reduce test noise
const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

describe('initializeBeerDatabase', () => {
  // Mock data (include glass_type as it's added by calculateGlassTypes)
  const mockBeers = [
    { id: 'beer-1', brew_name: 'Test Beer 1', brewer: 'Test Brewery', glass_type: null },
    { id: 'beer-2', brew_name: 'Test Beer 2', brewer: 'Test Brewery', glass_type: null },
  ];

  const mockMyBeers = [
    {
      id: 'beer-1',
      brew_name: 'Test Beer 1',
      brewer: 'Test Brewery',
      tasted_date: '2023-01-01',
      glass_type: null,
    },
  ];

  const mockRewards = [{ id: 'reward-1', name: 'Test Reward', points: 100 }];

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    jest.useRealTimers();

    // Default mock implementations
    (areApiUrlsConfigured as jest.Mock).mockResolvedValue(true);
    (getPreference as jest.Mock).mockResolvedValue('false'); // Not in visitor mode by default
    (fetchBeersFromAPI as jest.Mock).mockResolvedValue(mockBeers);
    (fetchMyBeersFromAPI as jest.Mock).mockResolvedValue(mockMyBeers);
    (fetchRewardsFromAPI as jest.Mock).mockResolvedValue(mockRewards);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  afterAll(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  // ============================================================================
  // HAPPY PATH TESTS
  // ============================================================================

  describe('Happy Path', () => {
    test('should complete initialization successfully when API URLs configured and not visitor mode', async () => {
      jest.useFakeTimers();

      await initializeBeerDatabase();

      // Verify all beers fetched and populated (synchronous)
      expect(fetchBeersFromAPI).toHaveBeenCalled();
      expect(beerRepository.insertMany).toHaveBeenCalledWith(mockBeers);

      // Advance timers to trigger background imports
      await jest.advanceTimersByTimeAsync(100);
      expect(fetchMyBeersFromAPI).toHaveBeenCalled();
      expect(myBeersRepository.insertMany).toHaveBeenCalledWith(mockMyBeers);

      await jest.advanceTimersByTimeAsync(100);
      expect(fetchRewardsFromAPI).toHaveBeenCalled();
      expect(rewardsRepository.insertMany).toHaveBeenCalledWith(mockRewards);

      jest.useRealTimers();
    });

    test('should fetch and populate all beers synchronously', async () => {
      await initializeBeerDatabase();

      // Verify that all beers fetch is not in a setTimeout (blocks)
      expect(fetchBeersFromAPI).toHaveBeenCalled();
      expect(beerRepository.insertMany).toHaveBeenCalledWith(mockBeers);

      // Should complete without advancing timers
      expect(beerRepository.insertMany).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================================
  // API CONFIGURATION TESTS
  // ============================================================================

  describe('API Configuration', () => {
    test('should exit early when API URLs not configured', async () => {
      (areApiUrlsConfigured as jest.Mock).mockResolvedValue(false);

      await initializeBeerDatabase();

      // Verify it logs message and returns early
      expect(consoleLogSpy).toHaveBeenCalledWith(
        'API URLs not configured, database initialization will be limited'
      );

      // Verify no API calls made
      expect(fetchBeersFromAPI).not.toHaveBeenCalled();
      expect(fetchMyBeersFromAPI).not.toHaveBeenCalled();
      expect(fetchRewardsFromAPI).not.toHaveBeenCalled();

      // Verify no repository calls made
      expect(beerRepository.insertMany).not.toHaveBeenCalled();
      expect(myBeersRepository.insertMany).not.toHaveBeenCalled();
      expect(rewardsRepository.insertMany).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // VISITOR MODE TESTS
  // ============================================================================

  describe('Visitor Mode', () => {
    test('should skip My Beers import when in visitor mode', async () => {
      jest.useFakeTimers();
      (getPreference as jest.Mock).mockResolvedValue('true'); // Visitor mode

      await initializeBeerDatabase();

      // Verify all beers still fetched (visitor mode gets beer list)
      expect(fetchBeersFromAPI).toHaveBeenCalled();
      expect(beerRepository.insertMany).toHaveBeenCalledWith(mockBeers);

      // Advance timers - My Beers should NOT be called
      await jest.advanceTimersByTimeAsync(100);
      expect(fetchMyBeersFromAPI).not.toHaveBeenCalled();
      expect(myBeersRepository.insertMany).not.toHaveBeenCalled();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        'In visitor mode - skipping scheduled My Beers import'
      );

      jest.useRealTimers();
    });

    test('should skip Rewards import when in visitor mode', async () => {
      jest.useFakeTimers();
      (getPreference as jest.Mock).mockResolvedValue('true'); // Visitor mode

      await initializeBeerDatabase();

      // Advance timers - Rewards should NOT be called
      await jest.advanceTimersByTimeAsync(200);
      expect(fetchRewardsFromAPI).not.toHaveBeenCalled();
      expect(rewardsRepository.insertMany).not.toHaveBeenCalled();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        'In visitor mode - skipping scheduled Rewards import'
      );

      jest.useRealTimers();
    });

    test('should still fetch all beers in visitor mode', async () => {
      (getPreference as jest.Mock).mockResolvedValue('true'); // Visitor mode

      await initializeBeerDatabase();

      // All beers should still be fetched in visitor mode
      expect(fetchBeersFromAPI).toHaveBeenCalled();
      expect(beerRepository.insertMany).toHaveBeenCalledWith(mockBeers);
    });
  });

  // ============================================================================
  // ERROR HANDLING TESTS
  // ============================================================================

  describe('Error Handling', () => {
    test('should handle setupDatabase errors and propagate them', async () => {
      const mockError = new Error('Database setup failed');
      const { setupTables } = require('../schema');

      // Mock setupTables to throw an error
      setupTables.mockRejectedValueOnce(mockError);

      await expect(initializeBeerDatabase()).rejects.toThrow('Database setup failed');

      // Verify error is logged
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error initializing beer database:', mockError);
    });

    test('should continue when My Beers background import fails', async () => {
      jest.useFakeTimers();
      const mockError = new Error('My Beers API error');
      (fetchMyBeersFromAPI as jest.Mock).mockRejectedValue(mockError);

      await initializeBeerDatabase();

      // All beers should still load successfully
      expect(fetchBeersFromAPI).toHaveBeenCalled();
      expect(beerRepository.insertMany).toHaveBeenCalledWith(mockBeers);

      // Advance timers to trigger My Beers import
      await jest.advanceTimersByTimeAsync(100);

      // Verify error logged but doesn't crash
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error in scheduled My Beers import:',
        mockError
      );

      // My Beers repository should not have been called
      expect(myBeersRepository.insertMany).not.toHaveBeenCalled();

      jest.useRealTimers();
    });

    test('should continue when Rewards background import fails', async () => {
      jest.useFakeTimers();
      const mockError = new Error('Rewards API error');
      (fetchRewardsFromAPI as jest.Mock).mockRejectedValue(mockError);

      await initializeBeerDatabase();

      // All beers should still load successfully
      expect(fetchBeersFromAPI).toHaveBeenCalled();
      expect(beerRepository.insertMany).toHaveBeenCalledWith(mockBeers);

      // Advance timers to trigger Rewards import
      await jest.advanceTimersByTimeAsync(200);

      // Verify error logged but doesn't crash
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error in scheduled Rewards import:', mockError);

      // Rewards repository should not have been called
      expect(rewardsRepository.insertMany).not.toHaveBeenCalled();

      jest.useRealTimers();
    });

    test('should log error but continue when all beers fetch fails', async () => {
      const mockError = new Error('All beers API error');
      (fetchBeersFromAPI as jest.Mock).mockRejectedValue(mockError);

      // Should not throw - function should complete
      await expect(initializeBeerDatabase()).resolves.toBeUndefined();

      // Verify error logged
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error fetching and populating all beers:',
        mockError
      );

      // Verify function completes (doesn't crash app)
      expect(consoleLogSpy).toHaveBeenCalledWith('Beer database initialization completed');
    });

    test('should handle multiple simultaneous failures gracefully', async () => {
      jest.useFakeTimers();
      (fetchBeersFromAPI as jest.Mock).mockRejectedValue(new Error('All beers error'));
      (fetchMyBeersFromAPI as jest.Mock).mockRejectedValue(new Error('My beers error'));
      (fetchRewardsFromAPI as jest.Mock).mockRejectedValue(new Error('Rewards error'));

      await initializeBeerDatabase();

      // Advance timers to trigger all background imports
      await jest.advanceTimersByTimeAsync(300);

      // All errors should be logged
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error fetching and populating all beers:',
        expect.any(Error)
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error in scheduled My Beers import:',
        expect.any(Error)
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error in scheduled Rewards import:',
        expect.any(Error)
      );

      // Function should complete successfully
      expect(consoleLogSpy).toHaveBeenCalledWith('Beer database initialization completed');

      jest.useRealTimers();
    });
  });

  // ============================================================================
  // BACKGROUND IMPORT TIMING TESTS
  // ============================================================================

  describe('Background Import Timing', () => {
    test('should schedule My Beers import with 100ms delay', async () => {
      jest.useFakeTimers();

      await initializeBeerDatabase();

      // Advance timers by 50ms - verify My Beers NOT called yet
      await jest.advanceTimersByTimeAsync(50);
      expect(fetchMyBeersFromAPI).not.toHaveBeenCalled();
      expect(myBeersRepository.insertMany).not.toHaveBeenCalled();

      // Advance timers to 100ms - verify My Beers IS called
      await jest.advanceTimersByTimeAsync(50);
      expect(fetchMyBeersFromAPI).toHaveBeenCalled();
      expect(myBeersRepository.insertMany).toHaveBeenCalledWith(mockMyBeers);

      jest.useRealTimers();
    });

    test('should schedule Rewards import with 200ms delay', async () => {
      jest.useFakeTimers();

      await initializeBeerDatabase();

      // Advance timers by 150ms - verify Rewards NOT called yet
      await jest.advanceTimersByTimeAsync(150);
      expect(fetchRewardsFromAPI).not.toHaveBeenCalled();
      expect(rewardsRepository.insertMany).not.toHaveBeenCalled();

      // Advance timers to 200ms - verify Rewards IS called
      await jest.advanceTimersByTimeAsync(50);
      expect(fetchRewardsFromAPI).toHaveBeenCalled();
      expect(rewardsRepository.insertMany).toHaveBeenCalledWith(mockRewards);

      jest.useRealTimers();
    });

    test('should schedule My Beers before Rewards (staggered timing)', async () => {
      jest.useFakeTimers();

      await initializeBeerDatabase();

      // At 100ms, My Beers should be called but not Rewards
      await jest.advanceTimersByTimeAsync(100);
      expect(fetchMyBeersFromAPI).toHaveBeenCalled();
      expect(fetchRewardsFromAPI).not.toHaveBeenCalled();

      // At 200ms, both should be called
      await jest.advanceTimersByTimeAsync(100);
      expect(fetchMyBeersFromAPI).toHaveBeenCalled();
      expect(fetchRewardsFromAPI).toHaveBeenCalled();

      jest.useRealTimers();
    });

    test('should execute all beers fetch before any background imports', async () => {
      jest.useFakeTimers();

      // Track call order
      const callOrder: string[] = [];
      (fetchBeersFromAPI as jest.Mock).mockImplementation(async () => {
        callOrder.push('allBeers');
        return mockBeers;
      });
      (fetchMyBeersFromAPI as jest.Mock).mockImplementation(async () => {
        callOrder.push('myBeers');
        return mockMyBeers;
      });
      (fetchRewardsFromAPI as jest.Mock).mockImplementation(async () => {
        callOrder.push('rewards');
        return mockRewards;
      });

      await initializeBeerDatabase();

      // All beers should be first
      expect(callOrder[0]).toBe('allBeers');

      // Advance timers to trigger background imports
      await jest.advanceTimersByTimeAsync(100);
      expect(callOrder[1]).toBe('myBeers');

      await jest.advanceTimersByTimeAsync(100);
      expect(callOrder[2]).toBe('rewards');

      jest.useRealTimers();
    });
  });

  // ============================================================================
  // INTEGRATION TESTS
  // ============================================================================

  describe('Integration', () => {
    test('should complete full initialization flow with all components', async () => {
      jest.useFakeTimers();

      await initializeBeerDatabase();

      // Verify database setup was called
      const { databaseInitializer } = require('../initializationState');
      // setupDatabase is called, which checks and potentially waits for initialization

      // Verify API configuration check
      expect(areApiUrlsConfigured).toHaveBeenCalled();

      // Verify visitor mode check
      expect(getPreference).toHaveBeenCalledWith('is_visitor_mode');

      // Verify all beers flow
      expect(fetchBeersFromAPI).toHaveBeenCalled();
      expect(beerRepository.insertMany).toHaveBeenCalledWith(mockBeers);

      // Verify My Beers background flow
      await jest.advanceTimersByTimeAsync(100);
      expect(fetchMyBeersFromAPI).toHaveBeenCalled();
      expect(myBeersRepository.insertMany).toHaveBeenCalledWith(mockMyBeers);

      // Verify Rewards background flow
      await jest.advanceTimersByTimeAsync(100);
      expect(fetchRewardsFromAPI).toHaveBeenCalled();
      expect(rewardsRepository.insertMany).toHaveBeenCalledWith(mockRewards);

      // Verify completion log
      expect(consoleLogSpy).toHaveBeenCalledWith('Beer database initialization completed');

      jest.useRealTimers();
    });
  });
});
