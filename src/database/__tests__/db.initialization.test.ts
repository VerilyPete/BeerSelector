/**
 * Unit tests for initializeBeerDatabase function
 *
 * These tests cover:
 * - Happy path: successful initialization with all imports
 * - API configuration: behavior when API URLs not configured
 * - Visitor mode: skipping authenticated-only imports
 * - Error handling: graceful degradation on failures
 * - Import sequencing: correct order of operations
 *
 * Note: The new implementation uses immediate (blocking) fetches for all data,
 * with only enrichment running in the background (fire-and-forget).
 */

import { initializeBeerDatabase } from '../db';
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
    updateEnrichmentData: jest.fn().mockResolvedValue(0),
  },
}));

jest.mock('../repositories/MyBeersRepository', () => ({
  myBeersRepository: {
    insertMany: jest.fn().mockResolvedValue(undefined),
    updateEnrichmentData: jest.fn().mockResolvedValue(0),
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

// Mock enrichment service - enrichment runs in background (fire-and-forget)
jest.mock('../../services/enrichmentService', () => ({
  fetchEnrichmentBatchWithMissing: jest.fn().mockResolvedValue({ enrichments: {}, missing: [] }),
  syncBeersToWorker: jest.fn().mockResolvedValue({ synced: 0, failed: 0 }),
}));

// Mock config
jest.mock('../../config', () => ({
  config: {
    enrichment: {
      isConfigured: jest.fn().mockReturnValue(false), // Disable enrichment by default in tests
    },
  },
}));

// Mock console methods to reduce test noise
const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

describe('initializeBeerDatabase', () => {
  // Mock data (include glass_type as it's added by calculateGlassTypes)
  const mockBeers = [
    {
      id: 'beer-1',
      brew_name: 'Test Beer 1',
      brewer: 'Test Brewery',
      glass_type: null,
      container_type: null,
      abv: null,
      enrichment_confidence: null,
      enrichment_source: null,
    },
    {
      id: 'beer-2',
      brew_name: 'Test Beer 2',
      brewer: 'Test Brewery',
      glass_type: null,
      container_type: null,
      abv: null,
      enrichment_confidence: null,
      enrichment_source: null,
    },
  ];

  const mockMyBeers = [
    {
      id: 'beer-1',
      brew_name: 'Test Beer 1',
      brewer: 'Test Brewery',
      tasted_date: '2023-01-01',
      glass_type: null,
      container_type: null,
      abv: null,
      enrichment_confidence: null,
      enrichment_source: null,
    },
  ];

  const mockRewards = [{ id: 'reward-1', name: 'Test Reward', points: 100 }];

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Default mock implementations
    (areApiUrlsConfigured as jest.Mock).mockResolvedValue(true);
    (getPreference as jest.Mock).mockResolvedValue('false'); // Not in visitor mode by default
    (fetchBeersFromAPI as jest.Mock).mockResolvedValue(mockBeers);
    (fetchMyBeersFromAPI as jest.Mock).mockResolvedValue(mockMyBeers);
    (fetchRewardsFromAPI as jest.Mock).mockResolvedValue(mockRewards);
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
      await initializeBeerDatabase();

      // Verify all beers fetched and populated
      expect(fetchBeersFromAPI).toHaveBeenCalled();
      expect(beerRepository.insertMany).toHaveBeenCalledWith(mockBeers);

      // Verify My Beers fetched and populated (immediate, not scheduled)
      expect(fetchMyBeersFromAPI).toHaveBeenCalled();
      expect(myBeersRepository.insertMany).toHaveBeenCalledWith(mockMyBeers);

      // Verify Rewards fetched and populated (immediate, not scheduled)
      expect(fetchRewardsFromAPI).toHaveBeenCalled();
      expect(rewardsRepository.insertMany).toHaveBeenCalledWith(mockRewards);
    });

    test('should fetch and populate all beers synchronously', async () => {
      await initializeBeerDatabase();

      // Verify that all beers fetch is blocking
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
      (getPreference as jest.Mock).mockResolvedValue('true'); // Visitor mode

      await initializeBeerDatabase();

      // Verify all beers still fetched (visitor mode gets beer list)
      expect(fetchBeersFromAPI).toHaveBeenCalled();
      expect(beerRepository.insertMany).toHaveBeenCalledWith(mockBeers);

      // My Beers should NOT be called in visitor mode
      expect(fetchMyBeersFromAPI).not.toHaveBeenCalled();
      expect(myBeersRepository.insertMany).not.toHaveBeenCalled();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[db] Visitor mode - skipping My Beers and Rewards import'
      );
    });

    test('should skip Rewards import when in visitor mode', async () => {
      (getPreference as jest.Mock).mockResolvedValue('true'); // Visitor mode

      await initializeBeerDatabase();

      // Rewards should NOT be called in visitor mode
      expect(fetchRewardsFromAPI).not.toHaveBeenCalled();
      expect(rewardsRepository.insertMany).not.toHaveBeenCalled();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[db] Visitor mode - skipping My Beers and Rewards import'
      );
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
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[db] Error initializing beer database:',
        mockError
      );
    });

    test('should continue when My Beers import fails', async () => {
      const mockError = new Error('My Beers API error');
      (fetchMyBeersFromAPI as jest.Mock).mockRejectedValue(mockError);

      await initializeBeerDatabase();

      // All beers should still load successfully
      expect(fetchBeersFromAPI).toHaveBeenCalled();
      expect(beerRepository.insertMany).toHaveBeenCalledWith(mockBeers);

      // Verify error logged but doesn't crash
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[db] Error fetching and populating my beers:',
        mockError
      );

      // My Beers repository should not have been called
      expect(myBeersRepository.insertMany).not.toHaveBeenCalled();

      // Rewards should still be fetched
      expect(fetchRewardsFromAPI).toHaveBeenCalled();
      expect(rewardsRepository.insertMany).toHaveBeenCalledWith(mockRewards);
    });

    test('should continue when Rewards import fails', async () => {
      const mockError = new Error('Rewards API error');
      (fetchRewardsFromAPI as jest.Mock).mockRejectedValue(mockError);

      await initializeBeerDatabase();

      // All beers should still load successfully
      expect(fetchBeersFromAPI).toHaveBeenCalled();
      expect(beerRepository.insertMany).toHaveBeenCalledWith(mockBeers);

      // Verify error logged but doesn't crash
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[db] Error fetching and populating rewards:',
        mockError
      );

      // Rewards repository should not have been called
      expect(rewardsRepository.insertMany).not.toHaveBeenCalled();

      // Function should complete successfully
      expect(consoleLogSpy).toHaveBeenCalledWith('[db] Beer database initialization completed');
    });

    test('should log error but continue when all beers fetch fails', async () => {
      const mockError = new Error('All beers API error');
      (fetchBeersFromAPI as jest.Mock).mockRejectedValue(mockError);

      // Should not throw - function should complete
      await expect(initializeBeerDatabase()).resolves.toBeUndefined();

      // Verify error logged
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[db] Error fetching and populating all beers:',
        mockError
      );

      // Verify function completes (doesn't crash app)
      expect(consoleLogSpy).toHaveBeenCalledWith('[db] Beer database initialization completed');
    });

    test('should handle multiple simultaneous failures gracefully', async () => {
      (fetchBeersFromAPI as jest.Mock).mockRejectedValue(new Error('All beers error'));
      (fetchMyBeersFromAPI as jest.Mock).mockRejectedValue(new Error('My beers error'));
      (fetchRewardsFromAPI as jest.Mock).mockRejectedValue(new Error('Rewards error'));

      await initializeBeerDatabase();

      // All errors should be logged
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[db] Error fetching and populating all beers:',
        expect.any(Error)
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[db] Error fetching and populating my beers:',
        expect.any(Error)
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[db] Error fetching and populating rewards:',
        expect.any(Error)
      );

      // Function should complete successfully
      expect(consoleLogSpy).toHaveBeenCalledWith('[db] Beer database initialization completed');
    });
  });

  // ============================================================================
  // IMPORT SEQUENCING TESTS
  // ============================================================================

  describe('Import Sequencing', () => {
    test('should execute all beers fetch first', async () => {
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
      // My beers second
      expect(callOrder[1]).toBe('myBeers');
      // Rewards third
      expect(callOrder[2]).toBe('rewards');
    });

    test('should insert all beers before my beers', async () => {
      const insertOrder: string[] = [];
      (beerRepository.insertMany as jest.Mock).mockImplementation(async () => {
        insertOrder.push('allBeers');
      });
      (myBeersRepository.insertMany as jest.Mock).mockImplementation(async () => {
        insertOrder.push('myBeers');
      });
      (rewardsRepository.insertMany as jest.Mock).mockImplementation(async () => {
        insertOrder.push('rewards');
      });

      await initializeBeerDatabase();

      expect(insertOrder).toEqual(['allBeers', 'myBeers', 'rewards']);
    });

    test('should complete all inserts synchronously (not scheduled)', async () => {
      await initializeBeerDatabase();

      // All repositories should have been called immediately
      expect(beerRepository.insertMany).toHaveBeenCalledTimes(1);
      expect(myBeersRepository.insertMany).toHaveBeenCalledTimes(1);
      expect(rewardsRepository.insertMany).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================================
  // INTEGRATION TESTS
  // ============================================================================

  describe('Integration', () => {
    test('should complete full initialization flow with all components', async () => {
      await initializeBeerDatabase();

      // Verify API configuration check
      expect(areApiUrlsConfigured).toHaveBeenCalled();

      // Verify visitor mode check
      expect(getPreference).toHaveBeenCalledWith('is_visitor_mode');

      // Verify all beers flow
      expect(fetchBeersFromAPI).toHaveBeenCalled();
      expect(beerRepository.insertMany).toHaveBeenCalledWith(mockBeers);

      // Verify My Beers flow (now immediate, not scheduled)
      expect(fetchMyBeersFromAPI).toHaveBeenCalled();
      expect(myBeersRepository.insertMany).toHaveBeenCalledWith(mockMyBeers);

      // Verify Rewards flow (now immediate, not scheduled)
      expect(fetchRewardsFromAPI).toHaveBeenCalled();
      expect(rewardsRepository.insertMany).toHaveBeenCalledWith(mockRewards);

      // Verify completion log
      expect(consoleLogSpy).toHaveBeenCalledWith('[db] Beer database initialization completed');
    });
  });
});
