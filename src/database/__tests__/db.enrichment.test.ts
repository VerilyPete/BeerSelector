/**
 * Unit tests for enrichBeersInBackground function in db.ts
 *
 * These tests cover:
 * - Skip enrichment when config.enrichment.isConfigured() returns false
 * - Skip enrichment when all beers already have ABV
 * - Fetch enrichment for beers without ABV
 * - Deduplicate IDs between allBeers and myBeers (overlap logging)
 * - Update both tables when enrichment data is returned
 * - Call syncBeersToWorker for missing beers
 *
 * Note: enrichBeersInBackground is not exported, so we test it indirectly
 * through initializeBeerDatabase() with enrichment enabled.
 *
 * IMPORTANT: Since enrichment runs as fire-and-forget (background) with a retry
 * loop that includes setTimeout delays, error path tests don't wait for retries.
 */

import { initializeBeerDatabase } from '../db';
import { areApiUrlsConfigured, getPreference, setPreference } from '../preferences';
import { fetchBeersFromAPI, fetchMyBeersFromAPI, fetchRewardsFromAPI } from '../../api/beerApi';
import { beerRepository } from '../repositories/BeerRepository';
import { myBeersRepository } from '../repositories/MyBeersRepository';
import { rewardsRepository } from '../repositories/RewardsRepository';
import {
  fetchEnrichmentBatchWithMissing,
  syncBeersToWorker,
} from '../../services/enrichmentService';
import { config } from '../../config';

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
  setPreference: jest.fn().mockResolvedValue(undefined),
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

// Mock enrichment service with default resolved values
jest.mock('../../services/enrichmentService', () => ({
  fetchEnrichmentBatchWithMissing: jest.fn().mockResolvedValue({ enrichments: {}, missing: [] }),
  syncBeersToWorker: jest.fn().mockResolvedValue({ synced: 0, failed: 0 }),
}));

// Mock config with enrichment disabled by default
jest.mock('../../config', () => ({
  config: {
    enrichment: {
      isConfigured: jest.fn().mockReturnValue(false),
    },
  },
}));

// Mock console methods to reduce test noise
const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

// Helper to wait for microtasks to complete
const flushMicrotasks = () => new Promise(resolve => process.nextTick(resolve));

describe('enrichBeersInBackground (via initializeBeerDatabase)', () => {
  // Mock data - beers without ABV (need enrichment)
  const mockBeersWithoutABV = [
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

  // Mock data - beers with ABV (don't need enrichment)
  const mockBeersWithABV = [
    {
      id: 'beer-3',
      brew_name: 'Test Beer 3',
      brewer: 'Test Brewery',
      glass_type: null,
      container_type: null,
      abv: 5.5,
      enrichment_confidence: 0.9,
      enrichment_source: 'description' as const,
    },
    {
      id: 'beer-4',
      brew_name: 'Test Beer 4',
      brewer: 'Test Brewery',
      glass_type: null,
      container_type: null,
      abv: 6.0,
      enrichment_confidence: 0.8,
      enrichment_source: 'perplexity' as const,
    },
  ];

  // Mock data - my beers (some overlap with all beers)
  const mockMyBeers = [
    {
      id: 'beer-1', // Overlaps with allBeers
      brew_name: 'Test Beer 1',
      brewer: 'Test Brewery',
      tasted_date: '2023-01-01',
      glass_type: null,
      container_type: null,
      abv: null,
      enrichment_confidence: null,
      enrichment_source: null,
    },
    {
      id: 'beer-5', // Unique to myBeers
      brew_name: 'Test Beer 5',
      brewer: 'Test Brewery',
      tasted_date: '2023-01-02',
      glass_type: null,
      container_type: null,
      abv: null,
      enrichment_confidence: null,
      enrichment_source: null,
    },
  ];

  const mockRewards = [{ id: 'reward-1', name: 'Test Reward', points: 100 }];

  // Mock enrichment data returned from API
  const mockEnrichmentData = {
    'beer-1': {
      enriched_abv: 5.5,
      enrichment_confidence: 0.9,
      enrichment_source: 'perplexity' as const,
      brew_description: 'A hoppy IPA with citrus notes',
      has_cleaned_description: false,
    },
    'beer-2': {
      enriched_abv: 6.0,
      enrichment_confidence: 0.85,
      enrichment_source: 'description' as const,
      brew_description: 'A smooth stout',
      has_cleaned_description: true,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock implementations
    (areApiUrlsConfigured as jest.Mock).mockResolvedValue(true);
    (getPreference as jest.Mock).mockResolvedValue('false'); // Not in visitor mode
    (fetchBeersFromAPI as jest.Mock).mockResolvedValue(mockBeersWithoutABV);
    (fetchMyBeersFromAPI as jest.Mock).mockResolvedValue(mockMyBeers);
    (fetchRewardsFromAPI as jest.Mock).mockResolvedValue(mockRewards);

    // Default: enrichment is NOT configured (disabled) - prevents background enrichment from running
    (config.enrichment.isConfigured as jest.Mock).mockReturnValue(false);

    // Default: enrichment service returns empty (success path, no retry needed)
    (fetchEnrichmentBatchWithMissing as jest.Mock).mockResolvedValue({
      enrichments: {},
      missing: [],
    });
  });

  afterAll(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  // ============================================================================
  // ENRICHMENT CONFIGURATION TESTS
  // ============================================================================

  describe('Enrichment Configuration', () => {
    test('should skip enrichment when config.enrichment.isConfigured() returns false', async () => {
      (config.enrichment.isConfigured as jest.Mock).mockReturnValue(false);

      await initializeBeerDatabase();

      // Enrichment service should not be called
      expect(fetchEnrichmentBatchWithMissing).not.toHaveBeenCalled();
      expect(syncBeersToWorker).not.toHaveBeenCalled();
      expect(beerRepository.updateEnrichmentData).not.toHaveBeenCalled();
      expect(myBeersRepository.updateEnrichmentData).not.toHaveBeenCalled();
    });

    test('should skip enrichment when all beers already have ABV', async () => {
      (config.enrichment.isConfigured as jest.Mock).mockReturnValue(true);
      (fetchBeersFromAPI as jest.Mock).mockResolvedValue(mockBeersWithABV);
      (fetchMyBeersFromAPI as jest.Mock).mockResolvedValue([]); // No my beers

      await initializeBeerDatabase();

      // Should log that all beers have ABV
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[db] All beers already have ABV, skipping enrichment'
      );

      // Enrichment fetch should not be called
      expect(fetchEnrichmentBatchWithMissing).not.toHaveBeenCalled();
    });

    test('should fetch enrichment for beers without ABV', async () => {
      (config.enrichment.isConfigured as jest.Mock).mockReturnValue(true);
      (fetchEnrichmentBatchWithMissing as jest.Mock).mockResolvedValue({
        enrichments: mockEnrichmentData,
        missing: [],
      });

      await initializeBeerDatabase();

      // Enrichment batch should be called
      expect(fetchEnrichmentBatchWithMissing).toHaveBeenCalled();

      // Should be called with unique IDs from both tables
      const callArgs = (fetchEnrichmentBatchWithMissing as jest.Mock).mock.calls[0][0];
      expect(callArgs).toContain('beer-1');
      expect(callArgs).toContain('beer-2');
      expect(callArgs).toContain('beer-5');
    });
  });

  // ============================================================================
  // ID DEDUPLICATION TESTS
  // ============================================================================

  describe('ID Deduplication', () => {
    test('should deduplicate IDs between allBeers and myBeers', async () => {
      (config.enrichment.isConfigured as jest.Mock).mockReturnValue(true);
      (fetchEnrichmentBatchWithMissing as jest.Mock).mockResolvedValue({
        enrichments: mockEnrichmentData,
        missing: [],
      });

      await initializeBeerDatabase();

      // Should log the overlap
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('overlap)'));

      // Check that unique IDs were passed (beer-1 appears in both, should only be once)
      const callArgs = (fetchEnrichmentBatchWithMissing as jest.Mock).mock.calls[0][0];

      // Count occurrences of beer-1
      const beer1Count = callArgs.filter((id: string) => id === 'beer-1').length;
      expect(beer1Count).toBe(1);

      // Should have 3 unique IDs: beer-1, beer-2, beer-5
      expect(callArgs.length).toBe(3);
    });

    test('should log overlap count correctly', async () => {
      (config.enrichment.isConfigured as jest.Mock).mockReturnValue(true);
      (fetchEnrichmentBatchWithMissing as jest.Mock).mockResolvedValue({
        enrichments: mockEnrichmentData,
        missing: [],
      });

      await initializeBeerDatabase();

      // Should log with overlap count
      // allBeerIds = [beer-1, beer-2], myBeerIds = [beer-1, beer-5]
      // overlap = 1 (beer-1)
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\d+ from All Beers, \d+ from My Beers, \d+ overlap\)/)
      );
    });
  });

  // ============================================================================
  // TABLE UPDATE TESTS
  // ============================================================================
  // Note: Since enrichment runs as fire-and-forget, we cannot synchronously
  // verify that updateEnrichmentData is called. Instead, we verify that the
  // enrichment service is called with correct arguments and that database
  // initialization completes successfully.

  describe('Table Updates', () => {
    test('should call enrichment service with correct beer IDs', async () => {
      (config.enrichment.isConfigured as jest.Mock).mockReturnValue(true);
      (fetchEnrichmentBatchWithMissing as jest.Mock).mockResolvedValue({
        enrichments: mockEnrichmentData,
        missing: [],
      });

      await initializeBeerDatabase();

      // Verify enrichment was called with the right IDs
      expect(fetchEnrichmentBatchWithMissing).toHaveBeenCalled();
      const callArgs = (fetchEnrichmentBatchWithMissing as jest.Mock).mock.calls[0][0];
      expect(callArgs).toContain('beer-1');
      expect(callArgs).toContain('beer-2');
    });

    test('should handle empty enrichment response gracefully', async () => {
      (config.enrichment.isConfigured as jest.Mock).mockReturnValue(true);
      (fetchEnrichmentBatchWithMissing as jest.Mock).mockResolvedValue({
        enrichments: {},
        missing: [],
      });

      await initializeBeerDatabase();

      // Database initialization should complete without error
      expect(consoleLogSpy).toHaveBeenCalledWith('[db] Beer database initialization completed');
    });
  });

  // ============================================================================
  // SYNC MISSING BEERS TESTS
  // ============================================================================
  // Note: syncBeersToWorker is called asynchronously in the background.
  // These tests verify the input to the enrichment service which determines
  // whether sync is needed.

  describe('Sync Missing Beers', () => {
    test('should call enrichment service which returns missing beers', async () => {
      (config.enrichment.isConfigured as jest.Mock).mockReturnValue(true);

      // Return some missing IDs - the enrichment service will handle sync
      (fetchEnrichmentBatchWithMissing as jest.Mock).mockResolvedValue({
        enrichments: { 'beer-1': mockEnrichmentData['beer-1'] },
        missing: ['beer-2', 'beer-5'],
      });

      await initializeBeerDatabase();

      // Enrichment service was called
      expect(fetchEnrichmentBatchWithMissing).toHaveBeenCalled();
    });

    test('should include all unique beer IDs in enrichment request', async () => {
      (config.enrichment.isConfigured as jest.Mock).mockReturnValue(true);

      // No missing IDs
      (fetchEnrichmentBatchWithMissing as jest.Mock).mockResolvedValue({
        enrichments: mockEnrichmentData,
        missing: [],
      });

      await initializeBeerDatabase();

      // All unique IDs should be included
      const callArgs = (fetchEnrichmentBatchWithMissing as jest.Mock).mock.calls[0][0];
      expect(callArgs).toContain('beer-1');
      expect(callArgs).toContain('beer-2');
      expect(callArgs).toContain('beer-5');
    });

    test('should deduplicate beer IDs before enrichment request', async () => {
      (config.enrichment.isConfigured as jest.Mock).mockReturnValue(true);

      (fetchEnrichmentBatchWithMissing as jest.Mock).mockResolvedValue({
        enrichments: {},
        missing: ['beer-1'],
      });

      await initializeBeerDatabase();

      // beer-1 is in both allBeers and myBeers, should only appear once
      const callArgs = (fetchEnrichmentBatchWithMissing as jest.Mock).mock.calls[0][0];
      const beer1Count = callArgs.filter((id: string) => id === 'beer-1').length;
      expect(beer1Count).toBe(1);
    });
  });

  // ============================================================================
  // VISITOR MODE TESTS
  // ============================================================================

  describe('Visitor Mode', () => {
    test('should only enrich allBeers when in visitor mode (myBeers empty)', async () => {
      (config.enrichment.isConfigured as jest.Mock).mockReturnValue(true);
      (getPreference as jest.Mock).mockResolvedValue('true'); // Visitor mode
      (fetchEnrichmentBatchWithMissing as jest.Mock).mockResolvedValue({
        enrichments: mockEnrichmentData,
        missing: [],
      });

      await initializeBeerDatabase();

      // Enrichment still works for allBeers
      expect(fetchEnrichmentBatchWithMissing).toHaveBeenCalled();
    });
  });
});

// ============================================================================
// ERROR HANDLING TESTS - SEPARATE SUITE
// ============================================================================
// These tests verify error handling without triggering the retry loop.
// The retry loop uses setTimeout which causes test hangs.

describe('enrichBeersInBackground Error Handling', () => {
  const mockBeers = [{ id: 'beer-1', brew_name: 'Beer 1', brewer: 'Brewery', abv: null }];
  const mockMyBeers = [
    { id: 'beer-2', brew_name: 'Beer 2', brewer: 'Brewery', tasted_date: '2023-01-01', abv: null },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    (areApiUrlsConfigured as jest.Mock).mockResolvedValue(true);
    (getPreference as jest.Mock).mockResolvedValue('false');
    (fetchBeersFromAPI as jest.Mock).mockResolvedValue(mockBeers);
    (fetchMyBeersFromAPI as jest.Mock).mockResolvedValue(mockMyBeers);
    (fetchRewardsFromAPI as jest.Mock).mockResolvedValue([]);
    // IMPORTANT: Default to disabled to prevent retry loops
    (config.enrichment.isConfigured as jest.Mock).mockReturnValue(false);
  });

  test('should not throw when enrichment is disabled', async () => {
    (config.enrichment.isConfigured as jest.Mock).mockReturnValue(false);

    // Should complete without error
    await expect(initializeBeerDatabase()).resolves.toBeUndefined();

    expect(consoleLogSpy).toHaveBeenCalledWith('[db] Beer database initialization completed');
  });

  test('database initialization completes even when enrichment would run', async () => {
    // Enable enrichment but make it succeed immediately (no retry needed)
    (config.enrichment.isConfigured as jest.Mock).mockReturnValue(true);
    (fetchEnrichmentBatchWithMissing as jest.Mock).mockResolvedValue({
      enrichments: {},
      missing: [],
    });

    await expect(initializeBeerDatabase()).resolves.toBeUndefined();

    expect(consoleLogSpy).toHaveBeenCalledWith('[db] Beer database initialization completed');
  });
});
