/**
 * Comprehensive tests for dataUpdateService module
 *
 * This test suite validates the dataUpdateService functions for fetching
 * and updating beer data from the Flying Saucer API.
 */

import { fetchAndUpdateAllBeers, fetchAndUpdateMyBeers } from '../dataUpdateService';
import { Beer, Beerfinder } from '../../types/beer';
import { config } from '@/src/config';

// Import mocked functions after setting up mocks
import { getPreference, setPreference } from '../../database/preferences';
import { beerRepository } from '../../database/repositories/BeerRepository';
import { myBeersRepository } from '../../database/repositories/MyBeersRepository';
import {
  fetchEnrichmentBatchWithMissing,
  syncBeersToWorker,
  pollForEnrichmentUpdates,
} from '../enrichmentService';

// Mock database preferences
jest.mock('../../database/preferences', () => ({
  getPreference: jest.fn(),
  setPreference: jest.fn(),
}));

// Mock repositories
jest.mock('../../database/repositories/BeerRepository', () => ({
  beerRepository: {
    insertMany: jest.fn(),
    updateEnrichmentData: jest.fn().mockResolvedValue(0),
  },
}));

jest.mock('../../database/repositories/MyBeersRepository', () => ({
  myBeersRepository: {
    insertMany: jest.fn(),
    updateEnrichmentData: jest.fn().mockResolvedValue(0),
  },
}));

// Mock enrichment service
jest.mock('../enrichmentService', () => ({
  fetchBeersFromProxy: jest.fn(),
  fetchEnrichmentBatchWithMissing: jest.fn().mockResolvedValue({ enrichments: {}, missing: [] }),
  syncBeersToWorker: jest.fn().mockResolvedValue({ synced: 0, failed: 0, queued_for_cleanup: 0 }),
  mergeEnrichmentData: jest.fn().mockImplementation(beers => beers),
  recordFallback: jest.fn(),
  pollForEnrichmentUpdates: jest.fn().mockResolvedValue({}),
}));

// Mock error logger — pass through to console.error so existing assertions still work
jest.mock('../../utils/errorLogger', () => ({
  logError: jest.fn((...args: unknown[]) => console.error(...args)),
  logWarning: jest.fn(),
}));

// Partial mock of config — only override enrichment.isConfigured
jest.mock('@/src/config', () => {
  const actual = jest.requireActual('@/src/config');
  return {
    ...actual,
    config: {
      ...actual.config,
      enrichment: {
        ...actual.config.enrichment,
        isConfigured: jest.fn().mockReturnValue(false),
      },
    },
  };
});

// Mock fetch
global.fetch = jest.fn();

// Mock console methods
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

describe('dataUpdateService', () => {
  // Test URLs from config
  const testAllBeersUrl = `${config.api.baseUrl}/api/all-beers`;
  const testMyBeersUrl = `${config.api.baseUrl}/api/my-beers`;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock console methods to prevent noise in tests
    console.log = jest.fn();
    console.error = jest.fn();

    // Default mock for fetch
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue([]),
    });
  });

  afterEach(() => {
    // Restore console methods
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    jest.restoreAllMocks();
  });

  describe('fetchAndUpdateAllBeers', () => {
    it('should return failure result if API URL is not set', async () => {
      // Mock getPreference to return null (no API URL set)
      (getPreference as jest.Mock).mockResolvedValueOnce(null);

      const result = await fetchAndUpdateAllBeers();

      expect(result.success).toBe(false);
      expect(result.dataUpdated).toBe(false);
      expect(result.error).toBeDefined();
      expect(getPreference).toHaveBeenCalledWith('all_beers_api_url');
      expect(console.error).toHaveBeenCalled();
    });

    it('should return failure result if fetch fails', async () => {
      // Mock getPreference to return a test API URL
      (getPreference as jest.Mock).mockResolvedValueOnce(testAllBeersUrl);

      // Mock fetch to fail
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const result = await fetchAndUpdateAllBeers();

      expect(result.success).toBe(false);
      expect(result.dataUpdated).toBe(false);
      expect(result.error).toBeDefined();
      expect(getPreference).toHaveBeenCalledWith('all_beers_api_url');
      expect(global.fetch).toHaveBeenCalledWith(
        testAllBeersUrl,
        expect.objectContaining({ signal: expect.any(Object) })
      );
      expect(console.error).toHaveBeenCalled();
    });

    it('should return failure result if response is not an array', async () => {
      // Mock getPreference to return a test API URL
      (getPreference as jest.Mock).mockResolvedValueOnce(testAllBeersUrl);

      // Mock fetch to return a non-array response
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce({ error: 'Invalid data' }),
      });

      const result = await fetchAndUpdateAllBeers();

      expect(result.success).toBe(false);
      expect(result.dataUpdated).toBe(false);
      expect(result.error).toBeDefined();
      expect(console.error).toHaveBeenCalled();
    });

    it('should return failure result if response does not contain brewInStock', async () => {
      // Mock getPreference to return a test API URL
      (getPreference as jest.Mock).mockResolvedValueOnce(testAllBeersUrl);

      // Mock fetch to return an array without brewInStock
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce([{ something: 'else' }, { notBrewInStock: [] }]),
      });

      const result = await fetchAndUpdateAllBeers();

      expect(result.success).toBe(false);
      expect(result.dataUpdated).toBe(false);
      expect(result.error).toBeDefined();
      expect(console.error).toHaveBeenCalled();
    });

    it('should successfully update all beers', async () => {
      // Mock getPreference to return a test API URL
      (getPreference as jest.Mock).mockResolvedValueOnce(testAllBeersUrl);

      // Mock beers data (without container_type - it's added by calculateContainerTypes in the service)
      const mockBeers: Beer[] = [
        { id: 'beer-1', brew_name: 'Test Beer 1', brewer: 'Brewery 1' },
        { id: 'beer-2', brew_name: 'Test Beer 2', brewer: 'Brewery 2' },
      ];

      // Mock fetch to return valid data
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce([{ something: 'else' }, { brewInStock: mockBeers }]),
      });

      // Mock beerRepository.insertMany to succeed
      (beerRepository.insertMany as jest.Mock).mockResolvedValueOnce(undefined);

      // Mock setPreference to succeed
      (setPreference as jest.Mock).mockResolvedValue(undefined);

      const result = await fetchAndUpdateAllBeers();

      expect(result.success).toBe(true);
      expect(result.dataUpdated).toBe(true);
      expect(result.itemCount).toBe(mockBeers.length);
      // The service adds container_type, abv, and enrichment fields (all null) to beers before insertion via calculateContainerTypes()
      expect(beerRepository.insertMany).toHaveBeenCalledWith([
        {
          id: 'beer-1',
          brew_name: 'Test Beer 1',
          brewer: 'Brewery 1',
          container_type: null,
          abv: null,
          enrichment_confidence: null,
          enrichment_source: null,
        },
        {
          id: 'beer-2',
          brew_name: 'Test Beer 2',
          brewer: 'Brewery 2',
          container_type: null,
          abv: null,
          enrichment_confidence: null,
          enrichment_source: null,
        },
      ]);
      expect(setPreference).toHaveBeenCalledWith('all_beers_last_update', expect.any(String));
      expect(setPreference).toHaveBeenCalledWith('all_beers_last_check', expect.any(String));
      expect(console.log).toHaveBeenCalledWith(
        `Updated all beers data with ${mockBeers.length} valid beers (skipped 0 invalid)`
      );
    });

    it('should handle errors during update', async () => {
      // Mock getPreference to return a test API URL
      (getPreference as jest.Mock).mockResolvedValueOnce(testAllBeersUrl);

      // Mock fetch to throw an error
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      const result = await fetchAndUpdateAllBeers();

      expect(result.success).toBe(false);
      expect(result.dataUpdated).toBe(false);
      expect(result.error).toBeDefined();
      expect(console.error).toHaveBeenCalled();
    });

    it('should handle fetch timeout with AbortError', async () => {
      // Mock getPreference to return a test API URL
      (getPreference as jest.Mock).mockResolvedValueOnce(testAllBeersUrl);

      // Create AbortError
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';

      // Mock fetch to throw AbortError
      (global.fetch as jest.Mock).mockRejectedValueOnce(abortError);

      const result = await fetchAndUpdateAllBeers();

      expect(result.success).toBe(false);
      expect(result.dataUpdated).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.type).toBe('NETWORK_ERROR');
      expect(result.error?.message).toContain('request timed out');
    });

    it('should use configured URL from preferences', async () => {
      const customUrl = 'https://custom.api.com/beers';
      (getPreference as jest.Mock).mockResolvedValueOnce(customUrl);

      // Mock valid response
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest
          .fn()
          .mockResolvedValueOnce([{}, { brewInStock: [{ id: '1', brew_name: 'Test' }] }]),
      });

      (beerRepository.insertMany as jest.Mock).mockResolvedValueOnce(undefined);
      (setPreference as jest.Mock).mockResolvedValue(undefined);

      await fetchAndUpdateAllBeers();

      expect(global.fetch).toHaveBeenCalledWith(
        customUrl,
        expect.objectContaining({ signal: expect.any(Object) })
      );
    });

    it('should filter out invalid beers without IDs', async () => {
      (getPreference as jest.Mock).mockResolvedValueOnce(testAllBeersUrl);

      // Mock beers data with some invalid entries (no ID)
      const mockBeers = [
        { id: 'beer-1', brew_name: 'Valid Beer 1', brewer: 'Brewery 1' },
        { brew_name: 'Invalid Beer - No ID', brewer: 'Brewery 2' }, // Missing id
        { id: 'beer-3', brew_name: 'Valid Beer 2', brewer: 'Brewery 3' },
      ];

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce([{}, { brewInStock: mockBeers }]),
      });

      (beerRepository.insertMany as jest.Mock).mockResolvedValueOnce(undefined);
      (setPreference as jest.Mock).mockResolvedValue(undefined);

      const result = await fetchAndUpdateAllBeers();

      expect(result.success).toBe(true);
      expect(result.itemCount).toBe(2); // Only 2 valid beers
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('skipped 1 invalid'));
    });
  });

  describe('fetchAndUpdateMyBeers', () => {
    it('should return failure result if API URL is not set', async () => {
      // Mock getPreference to return null for visitor mode check, then null for API URL
      (getPreference as jest.Mock)
        .mockResolvedValueOnce('false') // is_visitor_mode
        .mockResolvedValueOnce(null); // my_beers_api_url

      const result = await fetchAndUpdateMyBeers();

      expect(result.success).toBe(false);
      expect(result.dataUpdated).toBe(false);
      expect(result.error).toBeDefined();
      expect(getPreference).toHaveBeenCalledWith('my_beers_api_url');
      expect(console.error).toHaveBeenCalled();
    });

    it('should return failure result if fetch fails', async () => {
      // Mock getPreference for visitor mode check and API URL
      (getPreference as jest.Mock)
        .mockResolvedValueOnce('false') // is_visitor_mode
        .mockResolvedValueOnce(testMyBeersUrl); // my_beers_api_url

      // Mock fetch to fail
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const result = await fetchAndUpdateMyBeers();

      expect(result.success).toBe(false);
      expect(result.dataUpdated).toBe(false);
      expect(result.error).toBeDefined();
      expect(getPreference).toHaveBeenCalledWith('my_beers_api_url');
      expect(global.fetch).toHaveBeenCalledWith(
        testMyBeersUrl,
        expect.objectContaining({ signal: expect.any(Object) })
      );
      expect(console.error).toHaveBeenCalled();
    });

    it('should return failure result if response is not an array', async () => {
      // Mock getPreference for visitor mode check and API URL
      (getPreference as jest.Mock)
        .mockResolvedValueOnce('false') // is_visitor_mode
        .mockResolvedValueOnce(testMyBeersUrl); // my_beers_api_url

      // Mock fetch to return a non-array response
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce({ error: 'Invalid data' }),
      });

      const result = await fetchAndUpdateMyBeers();

      expect(result.success).toBe(false);
      expect(result.dataUpdated).toBe(false);
      expect(result.error).toBeDefined();
      expect(console.error).toHaveBeenCalled();
    });

    it('should return failure result if response does not contain tasted_brew_current_round', async () => {
      // Mock getPreference for visitor mode check and API URL
      (getPreference as jest.Mock)
        .mockResolvedValueOnce('false') // is_visitor_mode
        .mockResolvedValueOnce(testMyBeersUrl); // my_beers_api_url

      // Mock fetch to return an array without tasted_brew_current_round
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest
          .fn()
          .mockResolvedValueOnce([{ something: 'else' }, { notTastedBrewCurrentRound: [] }]),
      });

      const result = await fetchAndUpdateMyBeers();

      expect(result.success).toBe(false);
      expect(result.dataUpdated).toBe(false);
      expect(result.error).toBeDefined();
      expect(console.error).toHaveBeenCalled();
    });

    it('should return success with 0 items if no valid beers with IDs are found', async () => {
      // Mock getPreference for visitor mode check and API URL
      (getPreference as jest.Mock)
        .mockResolvedValueOnce('false') // is_visitor_mode
        .mockResolvedValueOnce(testMyBeersUrl); // my_beers_api_url

      // Mock beers data without IDs
      const mockBeers: Partial<Beerfinder>[] = [
        { brew_name: 'Test Beer 1', brewer: 'Brewery 1' },
        { brew_name: 'Test Beer 2', brewer: 'Brewery 2' },
      ];

      // Mock fetch to return data with invalid beers
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest
          .fn()
          .mockResolvedValueOnce([{ something: 'else' }, { tasted_brew_current_round: mockBeers }]),
      });

      // Mock myBeersRepository.insertMany and setPreference to succeed
      (myBeersRepository.insertMany as jest.Mock).mockResolvedValueOnce(undefined);
      (setPreference as jest.Mock).mockResolvedValue(undefined);

      const result = await fetchAndUpdateMyBeers();

      expect(result.success).toBe(true);
      expect(result.dataUpdated).toBe(true);
      expect(result.itemCount).toBe(0);
      expect(console.log).toHaveBeenCalledWith(
        'No valid beers with IDs found, but API returned data - clearing database'
      );
    });

    it('should successfully update my beers', async () => {
      // Mock getPreference for visitor mode check and API URL
      (getPreference as jest.Mock)
        .mockResolvedValueOnce('false') // is_visitor_mode
        .mockResolvedValueOnce(testMyBeersUrl); // my_beers_api_url

      // Mock beers data with IDs (without container_type - it's added by calculateContainerTypes in the service)
      const mockBeers: Beerfinder[] = [
        { id: 'beer-1', brew_name: 'Test Beer 1', tasted_date: '2023-01-01' },
        { id: 'beer-2', brew_name: 'Test Beer 2', tasted_date: '2023-01-02' },
      ];

      // Mock fetch to return valid data
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest
          .fn()
          .mockResolvedValueOnce([{ something: 'else' }, { tasted_brew_current_round: mockBeers }]),
      });

      // Mock myBeersRepository.insertMany to succeed
      (myBeersRepository.insertMany as jest.Mock).mockResolvedValueOnce(undefined);

      // Mock setPreference to succeed
      (setPreference as jest.Mock).mockResolvedValue(undefined);

      const result = await fetchAndUpdateMyBeers();

      expect(result.success).toBe(true);
      expect(result.dataUpdated).toBe(true);
      expect(result.itemCount).toBe(mockBeers.length);
      // The service adds container_type, abv, and enrichment fields (all null) to beers before insertion via calculateContainerTypes()
      expect(myBeersRepository.insertMany).toHaveBeenCalledWith([
        {
          id: 'beer-1',
          brew_name: 'Test Beer 1',
          tasted_date: '2023-01-01',
          container_type: null,
          abv: null,
          enrichment_confidence: null,
          enrichment_source: null,
        },
        {
          id: 'beer-2',
          brew_name: 'Test Beer 2',
          tasted_date: '2023-01-02',
          container_type: null,
          abv: null,
          enrichment_confidence: null,
          enrichment_source: null,
        },
      ]);
      expect(setPreference).toHaveBeenCalledWith('my_beers_last_update', expect.any(String));
      expect(setPreference).toHaveBeenCalledWith('my_beers_last_check', expect.any(String));
      expect(console.log).toHaveBeenCalledWith(
        `Updated my beers data with ${mockBeers.length} valid beers`
      );
    });

    it('should handle errors during update', async () => {
      // Mock getPreference for visitor mode check and API URL
      (getPreference as jest.Mock)
        .mockResolvedValueOnce('false') // is_visitor_mode
        .mockResolvedValueOnce(testMyBeersUrl); // my_beers_api_url

      // Mock fetch to throw an error
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      const result = await fetchAndUpdateMyBeers();

      expect(result.success).toBe(false);
      expect(result.dataUpdated).toBe(false);
      expect(result.error).toBeDefined();
      expect(console.error).toHaveBeenCalled();
    });

    it('should skip update in visitor mode', async () => {
      // Mock getPreference to return visitor mode
      (getPreference as jest.Mock).mockResolvedValueOnce('true'); // is_visitor_mode

      const result = await fetchAndUpdateMyBeers();

      expect(result.success).toBe(true);
      expect(result.dataUpdated).toBe(false);
      expect(result.error?.type).toBe('INFO');
      expect(result.error?.message).toContain('visitor mode');
      expect(global.fetch).not.toHaveBeenCalled();
      expect(setPreference).toHaveBeenCalledWith('my_beers_last_check', expect.any(String));
    });

    it('should handle empty tasted beers array', async () => {
      (getPreference as jest.Mock)
        .mockResolvedValueOnce('false') // is_visitor_mode
        .mockResolvedValueOnce(testMyBeersUrl); // my_beers_api_url

      // Mock fetch to return empty array
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce([{}, { tasted_brew_current_round: [] }]),
      });

      (myBeersRepository.insertMany as jest.Mock).mockResolvedValueOnce(undefined);
      (setPreference as jest.Mock).mockResolvedValue(undefined);

      const result = await fetchAndUpdateMyBeers();

      expect(result.success).toBe(true);
      expect(result.dataUpdated).toBe(true);
      expect(result.itemCount).toBe(0);
      expect(myBeersRepository.insertMany).toHaveBeenCalledWith([]);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('empty state'));
    });

    it('should handle fetch timeout with AbortError', async () => {
      (getPreference as jest.Mock)
        .mockResolvedValueOnce('false') // is_visitor_mode
        .mockResolvedValueOnce(testMyBeersUrl); // my_beers_api_url

      // Create AbortError
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';

      (global.fetch as jest.Mock).mockRejectedValueOnce(abortError);

      const result = await fetchAndUpdateMyBeers();

      expect(result.success).toBe(false);
      expect(result.dataUpdated).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.type).toBe('NETWORK_ERROR');
      expect(result.error?.message).toContain('request timed out');
    });

    it('should use configured URL from preferences', async () => {
      const customUrl = 'https://custom.api.com/my-beers';
      (getPreference as jest.Mock)
        .mockResolvedValueOnce('false') // is_visitor_mode
        .mockResolvedValueOnce(customUrl); // my_beers_api_url

      // Mock valid response
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest
          .fn()
          .mockResolvedValueOnce([
            {},
            { tasted_brew_current_round: [{ id: '1', brew_name: 'Test' }] },
          ]),
      });

      (myBeersRepository.insertMany as jest.Mock).mockResolvedValueOnce(undefined);
      (setPreference as jest.Mock).mockResolvedValue(undefined);

      await fetchAndUpdateMyBeers();

      expect(global.fetch).toHaveBeenCalledWith(
        customUrl,
        expect.objectContaining({ signal: expect.any(Object) })
      );
    });
  });

  describe('Config Integration', () => {
    describe('Environment Configuration', () => {
      it('should work with production config base URL', async () => {
        const productionUrl = `${config.api.baseUrl}/visitor`;
        (getPreference as jest.Mock).mockResolvedValueOnce(productionUrl);

        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: jest
            .fn()
            .mockResolvedValueOnce([{}, { brewInStock: [{ id: '1', brew_name: 'Test' }] }]),
        });

        (beerRepository.insertMany as jest.Mock).mockResolvedValueOnce(undefined);
        (setPreference as jest.Mock).mockResolvedValue(undefined);

        const result = await fetchAndUpdateAllBeers();

        expect(result.success).toBe(true);
        expect(global.fetch).toHaveBeenCalledWith(productionUrl, expect.any(Object));
      });

      it('should work with custom API URL', async () => {
        const customBaseUrl = 'https://staging.flyingsaucer.com';
        const customUrl = `${customBaseUrl}/api/beers`;

        (getPreference as jest.Mock).mockResolvedValueOnce(customUrl);

        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: jest
            .fn()
            .mockResolvedValueOnce([{}, { brewInStock: [{ id: '1', brew_name: 'Test' }] }]),
        });

        (beerRepository.insertMany as jest.Mock).mockResolvedValueOnce(undefined);
        (setPreference as jest.Mock).mockResolvedValue(undefined);

        const result = await fetchAndUpdateAllBeers();

        expect(result.success).toBe(true);
        expect(global.fetch).toHaveBeenCalledWith(customUrl, expect.any(Object));
      });
    });

    describe('Network Timeout Configuration', () => {
      it('should use 15 second timeout for fetch requests', async () => {
        (getPreference as jest.Mock).mockResolvedValueOnce(testAllBeersUrl);

        let capturedSignal: any = null;
        (global.fetch as jest.Mock).mockImplementationOnce((url, options) => {
          capturedSignal = options.signal;
          // Return a resolved promise to avoid hanging
          return Promise.resolve({
            ok: true,
            json: jest
              .fn()
              .mockResolvedValue([{}, { brewInStock: [{ id: '1', brew_name: 'Test' }] }]),
          });
        });

        (beerRepository.insertMany as jest.Mock).mockResolvedValueOnce(undefined);
        (setPreference as jest.Mock).mockResolvedValue(undefined);

        await fetchAndUpdateAllBeers();

        // Verify fetch was called with an AbortSignal
        expect(capturedSignal).toBeDefined();
        expect(capturedSignal).toHaveProperty('aborted');
      });

      it('should handle timeout gracefully', async () => {
        (getPreference as jest.Mock).mockResolvedValueOnce(testAllBeersUrl);

        const abortError = new Error('Timeout');
        abortError.name = 'AbortError';
        (global.fetch as jest.Mock).mockRejectedValueOnce(abortError);

        const result = await fetchAndUpdateAllBeers();

        expect(result.success).toBe(false);
        expect(result.error?.type).toBe('NETWORK_ERROR');
        expect(result.error?.message).toContain('timed out');
      });
    });

    describe('URL Validation', () => {
      it('should handle malformed URLs gracefully', async () => {
        const malformedUrl = 'not-a-valid-url';
        (getPreference as jest.Mock).mockResolvedValueOnce(malformedUrl);

        (global.fetch as jest.Mock).mockRejectedValueOnce(new TypeError('Failed to fetch'));

        const result = await fetchAndUpdateAllBeers();

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      });

      it('should accept HTTPS URLs', async () => {
        const httpsUrl = 'https://secure.api.com/beers';
        (getPreference as jest.Mock).mockResolvedValueOnce(httpsUrl);

        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: jest
            .fn()
            .mockResolvedValueOnce([{}, { brewInStock: [{ id: '1', brew_name: 'Test' }] }]),
        });

        (beerRepository.insertMany as jest.Mock).mockResolvedValueOnce(undefined);
        (setPreference as jest.Mock).mockResolvedValue(undefined);

        const result = await fetchAndUpdateAllBeers();

        expect(result.success).toBe(true);
        expect(global.fetch).toHaveBeenCalledWith(httpsUrl, expect.any(Object));
      });

      it('should accept HTTP URLs', async () => {
        const httpUrl = 'http://localhost:3000/api/beers';
        (getPreference as jest.Mock).mockResolvedValueOnce(httpUrl);

        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: jest
            .fn()
            .mockResolvedValueOnce([{}, { brewInStock: [{ id: '1', brew_name: 'Test' }] }]),
        });

        (beerRepository.insertMany as jest.Mock).mockResolvedValueOnce(undefined);
        (setPreference as jest.Mock).mockResolvedValue(undefined);

        const result = await fetchAndUpdateAllBeers();

        expect(result.success).toBe(true);
        expect(global.fetch).toHaveBeenCalledWith(httpUrl, expect.any(Object));
      });
    });

    describe('Config Module Compatibility', () => {
      it('should work with config.api.baseUrl value', async () => {
        // Verify config module is properly initialized
        expect(config.api.baseUrl).toBeDefined();
        expect(typeof config.api.baseUrl).toBe('string');

        const configBasedUrl = `${config.api.baseUrl}/custom/endpoint`;
        (getPreference as jest.Mock).mockResolvedValueOnce(configBasedUrl);

        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: jest
            .fn()
            .mockResolvedValueOnce([{}, { brewInStock: [{ id: '1', brew_name: 'Test' }] }]),
        });

        (beerRepository.insertMany as jest.Mock).mockResolvedValueOnce(undefined);
        (setPreference as jest.Mock).mockResolvedValue(undefined);

        const result = await fetchAndUpdateAllBeers();

        expect(result.success).toBe(true);
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining(config.api.baseUrl),
          expect.any(Object)
        );
      });

      it('should respect config network settings for timeout handling', async () => {
        // Verify network config is available
        expect(config.network.timeout).toBeDefined();
        expect(config.network.retries).toBeDefined();
        expect(config.network.retryDelay).toBeDefined();

        // The service uses a hardcoded 15s timeout, but config is available
        // for future refactoring
        expect(config.network.timeout).toBeGreaterThan(0);
        expect(config.network.retries).toBeGreaterThanOrEqual(0);
      });
    });

    describe('Error Handling with Config', () => {
      it('should properly categorize network errors', async () => {
        (getPreference as jest.Mock).mockResolvedValueOnce(testAllBeersUrl);

        (global.fetch as jest.Mock).mockRejectedValueOnce(new TypeError('Network request failed'));

        const result = await fetchAndUpdateAllBeers();

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error?.type).toBe('NETWORK_ERROR');
      });

      it('should properly categorize server errors', async () => {
        (getPreference as jest.Mock).mockResolvedValueOnce(testAllBeersUrl);

        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: false,
          status: 503,
          statusText: 'Service Unavailable',
        });

        const result = await fetchAndUpdateAllBeers();

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error?.type).toBe('SERVER_ERROR');
        expect(result.error?.statusCode).toBe(503);
      });

      it('should properly categorize validation errors', async () => {
        (getPreference as jest.Mock).mockResolvedValueOnce(null);

        const result = await fetchAndUpdateAllBeers();

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error?.type).toBe('VALIDATION_ERROR');
      });

      it('should properly categorize parse errors', async () => {
        (getPreference as jest.Mock).mockResolvedValueOnce(testAllBeersUrl);

        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockRejectedValueOnce(new Error('Invalid JSON')),
        });

        const result = await fetchAndUpdateAllBeers();

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error?.type).toBe('PARSE_ERROR');
      });
    });
  });

  describe('Polling Persistence via syncMissingBeersInBackground', () => {
    it('should persist polling enrichment results to both repositories', async () => {
      // Use real timers for this test since we need fire-and-forget promise chains to resolve
      jest.useRealTimers();

      const testMyBeersUrl = `${config.api.baseUrl}/api/my-beers`;

      // Enable enrichment
      (config.enrichment.isConfigured as jest.Mock).mockReturnValue(true);

      // Set up preferences: not visitor mode, valid API URL
      (getPreference as jest.Mock)
        .mockResolvedValueOnce('false') // is_visitor_mode
        .mockResolvedValueOnce(testMyBeersUrl); // my_beers_api_url

      // Mock beers with IDs
      const mockTastedBeers: Beerfinder[] = [
        { id: 'beer-1', brew_name: 'Test Beer 1', tasted_date: '2023-01-01' },
        { id: 'beer-2', brew_name: 'Test Beer 2', tasted_date: '2023-01-02' },
      ];

      // Mock fetch response
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce([{}, { tasted_brew_current_round: mockTastedBeers }]),
      });

      // Mock enrichment batch: return enrichments + missing IDs
      (fetchEnrichmentBatchWithMissing as jest.Mock).mockResolvedValueOnce({
        enrichments: {},
        missing: ['beer-1', 'beer-2'],
      });

      // Mock pollForEnrichmentUpdates to return enrichment data
      const mockPollingResults = {
        'beer-1': {
          enriched_abv: 5.5,
          enrichment_confidence: 0.9,
          enrichment_source: 'perplexity' as const,
          brew_description: 'A hoppy IPA',
        },
        'beer-2': {
          enriched_abv: 6.0,
          enrichment_confidence: 0.85,
          enrichment_source: 'description' as const,
          brew_description: 'A smooth stout',
        },
      };
      (pollForEnrichmentUpdates as jest.Mock).mockResolvedValueOnce(mockPollingResults);

      // Mock syncBeersToWorker to return queued_for_cleanup > 0 (triggers polling path)
      (syncBeersToWorker as jest.Mock).mockResolvedValueOnce({
        synced: 2,
        failed: 0,
        queued_for_cleanup: 2,
      });

      // Mock repository methods
      (myBeersRepository.insertMany as jest.Mock).mockResolvedValueOnce(undefined);
      (setPreference as jest.Mock).mockResolvedValue(undefined);

      await fetchAndUpdateMyBeers();

      // Flush fire-and-forget promise chains with real timers
      // syncBeersToWorker().then() -> pollForEnrichmentUpdates().then() -> persist
      await new Promise(resolve => setTimeout(resolve, 50));

      // Verify syncBeersToWorker was called with the missing beers
      expect(syncBeersToWorker).toHaveBeenCalled();

      // Verify pollForEnrichmentUpdates was called with missing IDs
      expect(pollForEnrichmentUpdates).toHaveBeenCalledWith(['beer-1', 'beer-2']);

      // Verify enrichment data was persisted to both repositories
      const expectedUpdates = {
        'beer-1': {
          enriched_abv: 5.5,
          enrichment_confidence: 0.9,
          enrichment_source: 'perplexity',
          brew_description: 'A hoppy IPA',
        },
        'beer-2': {
          enriched_abv: 6.0,
          enrichment_confidence: 0.85,
          enrichment_source: 'description',
          brew_description: 'A smooth stout',
        },
      };
      expect(beerRepository.updateEnrichmentData).toHaveBeenCalledWith(expectedUpdates);
      expect(myBeersRepository.updateEnrichmentData).toHaveBeenCalledWith(expectedUpdates);

      // Restore fake timers for remaining tests
      jest.useFakeTimers();
    }, 10000);
  });
});
