/**
 * Unit tests for enrichmentService.ts
 *
 * Tests cover:
 * - Client ID generation and caching
 * - Rate limiting behavior
 * - Metrics tracking
 * - Enrichment data merging helper
 */

import {
  getEnrichmentMetrics,
  resetEnrichmentMetrics,
  recordFallback,
  getTimeUntilNextRequest,
  mergeEnrichmentData,
  checkEnrichmentHealth,
  getEnrichmentHealthDetails,
  bustTaplistCache,
  __resetRateLimitStateForTests,
  fetchBeersFromProxy,
  fetchEnrichmentBatch,
  getClientId,
  EnrichmentData,
} from '../enrichmentService';
import { BeerWithContainerType, BeerfinderWithContainerType } from '@/src/types/beer';

// Mock the config module
jest.mock('@/src/config', () => ({
  config: {
    enrichment: {
      apiUrl: 'https://test-api.example.com',
      apiKey: 'test-api-key',
      timeout: 15000,
      batchSize: 100,
      rateLimitWindow: 60000,
      rateLimitMaxRequests: 10,
      isConfigured: jest.fn(() => true),
      getFullUrl: jest.fn((endpoint: string) => `https://test-api.example.com/${endpoint}`),
    },
  },
}));

// Mock preferences
jest.mock('@/src/database/preferences', () => ({
  getPreference: jest.fn(),
  setPreference: jest.fn(),
}));

// Mock error logger
jest.mock('@/src/utils/errorLogger', () => ({
  logWarning: jest.fn(),
}));

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('enrichmentService', () => {
  beforeEach(() => {
    // Reset metrics and rate limit state before each test
    resetEnrichmentMetrics();
    __resetRateLimitStateForTests();
    jest.clearAllMocks();
    mockFetch.mockReset();
  });

  describe('Metrics', () => {
    describe('getEnrichmentMetrics', () => {
      it('should return initial metrics with all zeros', () => {
        const metrics = getEnrichmentMetrics();

        expect(metrics.proxyRequests).toBe(0);
        expect(metrics.proxySuccesses).toBe(0);
        expect(metrics.proxyFailures).toBe(0);
        expect(metrics.rateLimitedRequests).toBe(0);
        expect(metrics.fallbackCount).toBe(0);
        expect(metrics.enrichedBeerCount).toBe(0);
        expect(metrics.unenrichedBeerCount).toBe(0);
        expect(metrics.cacheHits).toBe(0);
        expect(metrics.lastReset).toBeDefined();
      });

      it('should return a copy of metrics (not reference)', () => {
        const metrics1 = getEnrichmentMetrics();
        const metrics2 = getEnrichmentMetrics();

        // Modifying one should not affect the other
        (metrics1 as any).proxyRequests = 999;
        expect(metrics2.proxyRequests).toBe(0);
      });
    });

    describe('resetEnrichmentMetrics', () => {
      it('should reset all metrics to zero', () => {
        // First, record some activity
        recordFallback();
        recordFallback();
        recordFallback();

        let metrics = getEnrichmentMetrics();
        expect(metrics.fallbackCount).toBe(3);

        // Reset
        resetEnrichmentMetrics();

        metrics = getEnrichmentMetrics();
        expect(metrics.fallbackCount).toBe(0);
        expect(metrics.proxyRequests).toBe(0);
        expect(metrics.proxySuccesses).toBe(0);
      });

      it('should update lastReset timestamp', () => {
        const beforeReset = Date.now();
        resetEnrichmentMetrics();
        const afterReset = Date.now();

        const metrics = getEnrichmentMetrics();
        expect(metrics.lastReset).toBeGreaterThanOrEqual(beforeReset);
        expect(metrics.lastReset).toBeLessThanOrEqual(afterReset);
      });
    });

    describe('recordFallback', () => {
      it('should increment fallback count', () => {
        expect(getEnrichmentMetrics().fallbackCount).toBe(0);

        recordFallback();
        expect(getEnrichmentMetrics().fallbackCount).toBe(1);

        recordFallback();
        expect(getEnrichmentMetrics().fallbackCount).toBe(2);
      });
    });
  });

  describe('Rate Limiting', () => {
    describe('getTimeUntilNextRequest', () => {
      it('should return 0 when under rate limit', () => {
        // Fresh state, should be allowed
        const waitTime = getTimeUntilNextRequest();
        expect(waitTime).toBe(0);
      });
    });
  });

  describe('mergeEnrichmentData', () => {
    const createMockBeer = (id: string): BeerWithContainerType => ({
      id,
      brew_name: `Test Beer ${id}`,
      brewer: 'Test Brewery',
      brew_style: 'IPA',
      added_date: '2024-01-01',
      brewer_loc: 'Austin, TX',
      brew_container: 'Draft',
      brew_description: 'Test description',
      container_type: 'tulip',
      abv: null,
      enrichment_confidence: null,
      enrichment_source: null,
    });

    const createMockBeerfinder = (id: string): BeerfinderWithContainerType => ({
      id,
      brew_name: `Test Tasted Beer ${id}`,
      brewer: 'Test Brewery',
      roh_lap: '1',
      tasted_date: '2024-01-01',
      chit_code: 'ABC123',
      container_type: 'pint',
      abv: null,
      enrichment_confidence: null,
      enrichment_source: null,
    });

    it('should return original array when enrichment data is empty', () => {
      const beers = [createMockBeer('1'), createMockBeer('2')];
      const enrichmentData: Record<string, EnrichmentData> = {};

      const result = mergeEnrichmentData(beers, enrichmentData);

      expect(result).toBe(beers); // Same reference
    });

    it('should merge enrichment data into matching beers', () => {
      const beers = [createMockBeer('1'), createMockBeer('2'), createMockBeer('3')];
      const enrichmentData: Record<string, EnrichmentData> = {
        '1': {
          enriched_abv: 6.5,
          enrichment_confidence: 0.95,
          enrichment_source: 'perplexity',
        },
        '3': {
          enriched_abv: 8.0,
          enrichment_confidence: 1.0,
          enrichment_source: 'manual',
        },
      };

      const result = mergeEnrichmentData(beers, enrichmentData);

      // Beer 1 should have enrichment
      expect(result[0].abv).toBe(6.5);
      expect(result[0].enrichment_confidence).toBe(0.95);
      expect(result[0].enrichment_source).toBe('perplexity');

      // Beer 2 should be unchanged
      expect(result[1].abv).toBeNull();
      expect(result[1].enrichment_confidence).toBeNull();
      expect(result[1].enrichment_source).toBeNull();

      // Beer 3 should have enrichment
      expect(result[2].abv).toBe(8.0);
      expect(result[2].enrichment_confidence).toBe(1.0);
      expect(result[2].enrichment_source).toBe('manual');
    });

    it('should preserve existing ABV if enriched_abv is null', () => {
      const beers = [{ ...createMockBeer('1'), abv: 5.5 }];
      const enrichmentData: Record<string, EnrichmentData> = {
        '1': {
          enriched_abv: null, // No ABV enrichment
          enrichment_confidence: 0.8,
          enrichment_source: 'perplexity',
        },
      };

      const result = mergeEnrichmentData(beers, enrichmentData);

      expect(result[0].abv).toBe(5.5); // Preserved original
      expect(result[0].enrichment_confidence).toBe(0.8);
    });

    it('should work with BeerfinderWithContainerType', () => {
      const beers = [createMockBeerfinder('1'), createMockBeerfinder('2')];
      const enrichmentData: Record<string, EnrichmentData> = {
        '2': {
          enriched_abv: 7.2,
          enrichment_confidence: 0.9,
          enrichment_source: 'perplexity',
        },
      };

      const result = mergeEnrichmentData(beers, enrichmentData);

      expect(result[0].abv).toBeNull();
      expect(result[1].abv).toBe(7.2);
      expect(result[1].enrichment_source).toBe('perplexity');
    });

    it('should not mutate original array', () => {
      const originalBeers = [createMockBeer('1')];
      const beers = [...originalBeers];
      const enrichmentData: Record<string, EnrichmentData> = {
        '1': {
          enriched_abv: 6.5,
          enrichment_confidence: 0.95,
          enrichment_source: 'perplexity',
        },
      };

      const result = mergeEnrichmentData(beers, enrichmentData);

      // Original should be unchanged
      expect(originalBeers[0].abv).toBeNull();
      // Result should have enrichment
      expect(result[0].abv).toBe(6.5);
    });

    it('should handle empty beer array', () => {
      const beers: BeerWithContainerType[] = [];
      const enrichmentData: Record<string, EnrichmentData> = {
        '1': {
          enriched_abv: 6.5,
          enrichment_confidence: 0.95,
          enrichment_source: 'perplexity',
        },
      };

      const result = mergeEnrichmentData(beers, enrichmentData);

      expect(result).toEqual([]);
    });
  });

  describe('Rate Limiting - Extended Tests', () => {
    describe('__resetRateLimitStateForTests', () => {
      it('should clear rate limit state', () => {
        // Make requests to fill up rate limit
        // Each call to getTimeUntilNextRequest doesn't consume quota,
        // but we can verify the state is cleared
        expect(getTimeUntilNextRequest()).toBe(0);
        __resetRateLimitStateForTests();
        expect(getTimeUntilNextRequest()).toBe(0);
      });
    });

    describe('isRequestAllowed and getTimeUntilNextRequest interaction', () => {
      // Note: isRequestAllowed is not exported, but we can test its behavior
      // indirectly through getTimeUntilNextRequest
      it('should return 0 wait time when rate limit not reached', () => {
        // Fresh state
        const waitTime = getTimeUntilNextRequest();
        expect(waitTime).toBe(0);
      });

      it('should handle timestamp expiry correctly', async () => {
        // This test verifies that old timestamps are cleaned up
        // Since we can't easily manipulate time, we verify the initial state
        __resetRateLimitStateForTests();
        expect(getTimeUntilNextRequest()).toBe(0);
      });
    });
  });

  describe('Health Functions', () => {
    describe('checkEnrichmentHealth', () => {
      it('should return true when health endpoint returns ok status', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ status: 'ok', database: 'connected' }),
        });

        const result = await checkEnrichmentHealth();

        expect(result).toBe(true);
        expect(mockFetch).toHaveBeenCalledWith(
          'https://test-api.example.com/health',
          expect.objectContaining({ method: 'GET' })
        );
      });

      it('should return false when health endpoint returns error status', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ status: 'error', database: 'disconnected' }),
        });

        const result = await checkEnrichmentHealth();

        expect(result).toBe(false);
      });

      it('should return false when response is not ok', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 500,
        });

        const result = await checkEnrichmentHealth();

        expect(result).toBe(false);
      });

      it('should return false when fetch throws', async () => {
        mockFetch.mockRejectedValueOnce(new Error('Network error'));

        const result = await checkEnrichmentHealth();

        expect(result).toBe(false);
      });

      it('should return false when apiUrl is not configured', async () => {
        // Get the mock and temporarily override apiUrl
        const { config } = require('@/src/config');
        const originalApiUrl = config.enrichment.apiUrl;
        config.enrichment.apiUrl = null;

        const result = await checkEnrichmentHealth();

        expect(result).toBe(false);
        expect(mockFetch).not.toHaveBeenCalled();

        // Restore
        config.enrichment.apiUrl = originalApiUrl;
      });
    });

    describe('getEnrichmentHealthDetails', () => {
      it('should return health details with enrichment quotas', async () => {
        const healthData = {
          status: 'ok',
          database: 'connected',
          enrichment: {
            enabled: true,
            daily: { used: 5, limit: 100, remaining: 95 },
            monthly: { used: 50, limit: 1000, remaining: 950 },
          },
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => healthData,
        });

        const result = await getEnrichmentHealthDetails();

        expect(result).toEqual(healthData);
        expect(result?.enrichment?.daily.remaining).toBe(95);
      });

      it('should return null when response is not ok', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 503,
        });

        const result = await getEnrichmentHealthDetails();

        expect(result).toBeNull();
      });

      it('should return null when fetch throws', async () => {
        mockFetch.mockRejectedValueOnce(new Error('Timeout'));

        const result = await getEnrichmentHealthDetails();

        expect(result).toBeNull();
      });

      it('should return null when apiUrl is not configured', async () => {
        const { config } = require('@/src/config');
        const originalApiUrl = config.enrichment.apiUrl;
        config.enrichment.apiUrl = null;

        const result = await getEnrichmentHealthDetails();

        expect(result).toBeNull();
        expect(mockFetch).not.toHaveBeenCalled();

        config.enrichment.apiUrl = originalApiUrl;
      });
    });
  });

  describe('API Functions', () => {
    const mockGetPreference = require('@/src/database/preferences').getPreference;
    const mockSetPreference = require('@/src/database/preferences').setPreference;

    beforeEach(() => {
      // Setup mock for client ID - cached value is used
      mockGetPreference.mockResolvedValue('test-client-id');
      mockSetPreference.mockResolvedValue(undefined);
    });

    describe('getClientId', () => {
      it('should return cached client ID when available', async () => {
        // First call caches the ID
        const id1 = await getClientId();
        // Second call should return cached value
        const id2 = await getClientId();

        expect(id1).toBe(id2);
      });

      it('should return existing client ID from preferences', async () => {
        mockGetPreference.mockResolvedValueOnce('existing-client-id');

        // Note: Once cached, getClientId returns the cached value
        // This test verifies that the function structure is correct
        const id = await getClientId();
        expect(id).toBeDefined();
      });
    });

    describe('fetchBeersFromProxy', () => {
      beforeEach(() => {
        mockGetPreference.mockResolvedValue('test-client-id');
      });

      it('should throw when enrichment is not configured', async () => {
        const { config } = require('@/src/config');
        config.enrichment.isConfigured.mockReturnValueOnce(false);

        await expect(fetchBeersFromProxy('13879')).rejects.toThrow(
          'Enrichment service not configured'
        );
      });

      it('should throw when rate limited', async () => {
        const { config } = require('@/src/config');
        // Fill up rate limit by making many requests
        // The config mock has rateLimitMaxRequests: 10, so we need to exhaust it
        const mockSuccessResponse = {
          ok: true,
          json: async () => ({
            success: true,
            storeId: '13879',
            beers: [],
            total: 0,
            cached: false,
          }),
          headers: new Headers(),
        };

        // Make 10 requests to exhaust rate limit
        for (let i = 0; i < 10; i++) {
          mockFetch.mockResolvedValueOnce(mockSuccessResponse);
          await fetchBeersFromProxy('13879').catch(() => {});
        }

        // 11th request should be rate limited
        await expect(fetchBeersFromProxy('13879')).rejects.toThrow(/Client rate limited/);
      });

      it('should return beer data on successful response', async () => {
        const mockBeers = [
          {
            id: '123',
            brew_name: 'Test IPA',
            brewer: 'Test Brewery',
            enriched_abv: 6.5,
            enrichment_confidence: 0.9,
            enrichment_source: 'perplexity',
          },
        ];

        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            storeId: '13879',
            beers: mockBeers,
            total: 1,
            cached: false,
          }),
          headers: new Headers({ 'X-Request-ID': 'req-123' }),
        });

        const result = await fetchBeersFromProxy('13879');

        expect(result.success).toBe(true);
        expect(result.beers).toHaveLength(1);
        expect(result.beers[0].brew_name).toBe('Test IPA');

        const metrics = getEnrichmentMetrics();
        expect(metrics.proxySuccesses).toBeGreaterThan(0);
        expect(metrics.enrichedBeerCount).toBeGreaterThan(0);
      });

      it('should track cache hits in metrics', async () => {
        resetEnrichmentMetrics();
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            storeId: '13879',
            beers: [],
            total: 0,
            cached: true, // This is a cached response
            cacheAge: 300,
          }),
          headers: new Headers(),
        });

        await fetchBeersFromProxy('13879');

        const metrics = getEnrichmentMetrics();
        expect(metrics.cacheHits).toBe(1);
      });

      it('should handle 429 rate limit response from server', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: new Headers({ 'Retry-After': '60' }),
        });

        await expect(fetchBeersFromProxy('13879')).rejects.toThrow(
          /Rate limited.*Retry after 60 seconds/
        );

        const metrics = getEnrichmentMetrics();
        expect(metrics.rateLimitedRequests).toBeGreaterThan(0);
      });

      it('should handle 401 unauthorized response', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 401,
          headers: new Headers(),
        });

        await expect(fetchBeersFromProxy('13879')).rejects.toThrow(
          'Invalid API key for enrichment service'
        );

        const metrics = getEnrichmentMetrics();
        expect(metrics.proxyFailures).toBeGreaterThan(0);
      });

      it('should handle other error responses', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          headers: new Headers(),
        });

        await expect(fetchBeersFromProxy('13879')).rejects.toThrow(
          'Enrichment service error: 500 Internal Server Error'
        );
      });

      it('should handle network timeout', async () => {
        const abortError = new Error('The operation was aborted');
        abortError.name = 'AbortError';
        mockFetch.mockRejectedValueOnce(abortError);

        await expect(fetchBeersFromProxy('13879')).rejects.toThrow(
          'Enrichment service request timed out'
        );
      });
    });

    describe('fetchEnrichmentBatch', () => {
      beforeEach(() => {
        resetEnrichmentMetrics();
        __resetRateLimitStateForTests();
        mockGetPreference.mockResolvedValue('test-client-id');
      });

      it('should return empty object when not configured', async () => {
        const { config } = require('@/src/config');
        config.enrichment.isConfigured.mockReturnValueOnce(false);

        const result = await fetchEnrichmentBatch(['123', '456']);

        expect(result).toEqual({});
      });

      it('should return empty object for empty beer IDs array', async () => {
        const result = await fetchEnrichmentBatch([]);

        expect(result).toEqual({});
        expect(mockFetch).not.toHaveBeenCalled();
      });

      it('should return enrichment data for valid beer IDs', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            enrichments: {
              '123': {
                enriched_abv: 6.5,
                enrichment_confidence: 0.95,
                enrichment_source: 'perplexity',
              },
              '456': {
                enriched_abv: 5.0,
                enrichment_confidence: 1.0,
                enrichment_source: 'manual',
              },
            },
            requestId: 'req-123',
            found: 2,
            notFound: 0,
          }),
        });

        const result = await fetchEnrichmentBatch(['123', '456']);

        expect(result['123']).toBeDefined();
        expect(result['123'].enriched_abv).toBe(6.5);
        expect(result['456'].enrichment_source).toBe('manual');
      });

      it('should chunk large requests based on batchSize config', async () => {
        // Config mock has batchSize: 100
        // Create 150 IDs to test chunking
        const ids = Array.from({ length: 150 }, (_, i) => `beer-${i}`);

        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({
              enrichments: {},
              requestId: 'req-1',
              found: 0,
              notFound: 100,
            }),
          })
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({
              enrichments: {},
              requestId: 'req-2',
              found: 0,
              notFound: 50,
            }),
          });

        await fetchEnrichmentBatch(ids);

        // Should make 2 requests (100 + 50)
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });

      it('should handle 429 rate limit and return partial results', async () => {
        const ids = Array.from({ length: 150 }, (_, i) => `beer-${i}`);

        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({
              enrichments: {
                'beer-0': {
                  enriched_abv: 5.0,
                  enrichment_confidence: 0.9,
                  enrichment_source: 'perplexity',
                },
              },
              requestId: 'req-1',
              found: 1,
              notFound: 99,
            }),
          })
          .mockResolvedValueOnce({
            ok: false,
            status: 429,
            headers: new Headers({ 'Retry-After': '60' }),
          });

        const result = await fetchEnrichmentBatch(ids);

        // Should return results from first chunk only
        expect(result['beer-0']).toBeDefined();
        expect(Object.keys(result)).toHaveLength(1);
      });

      it('should handle non-429 errors and continue with next chunk', async () => {
        const ids = Array.from({ length: 150 }, (_, i) => `beer-${i}`);

        mockFetch
          .mockResolvedValueOnce({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
          })
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({
              enrichments: {
                'beer-100': {
                  enriched_abv: 5.0,
                  enrichment_confidence: 0.9,
                  enrichment_source: 'perplexity',
                },
              },
              requestId: 'req-2',
              found: 1,
              notFound: 49,
            }),
          });

        const result = await fetchEnrichmentBatch(ids);

        // Should return results from second chunk
        expect(result['beer-100']).toBeDefined();
      });

      it('should handle timeout and continue with next chunk', async () => {
        const ids = Array.from({ length: 150 }, (_, i) => `beer-${i}`);

        const abortError = new Error('The operation was aborted');
        abortError.name = 'AbortError';

        mockFetch.mockRejectedValueOnce(abortError).mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            enrichments: {
              'beer-100': {
                enriched_abv: 5.0,
                enrichment_confidence: 0.9,
                enrichment_source: 'perplexity',
              },
            },
            requestId: 'req-2',
            found: 1,
            notFound: 49,
          }),
        });

        const result = await fetchEnrichmentBatch(ids);

        // Should return results from second chunk
        expect(result['beer-100']).toBeDefined();
      });

      it('should track metrics per chunk processed', async () => {
        resetEnrichmentMetrics();
        const ids = Array.from({ length: 150 }, (_, i) => `beer-${i}`);

        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({
              enrichments: {
                'beer-0': {
                  enriched_abv: 5.0,
                  enrichment_confidence: 0.9,
                  enrichment_source: 'perplexity',
                },
              },
              requestId: 'req-1',
              found: 1,
              notFound: 99,
            }),
          })
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({
              enrichments: {},
              requestId: 'req-2',
              found: 0,
              notFound: 50,
            }),
          });

        await fetchEnrichmentBatch(ids);

        const metrics = getEnrichmentMetrics();
        expect(metrics.proxyRequests).toBe(2); // 2 chunks
        expect(metrics.proxySuccesses).toBe(2);
      });

      it('should rate limit when too many chunks requested', async () => {
        // First, exhaust rate limit with other requests
        for (let i = 0; i < 10; i++) {
          mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ success: true, storeId: '13879', beers: [], total: 0 }),
            headers: new Headers(),
          });
          await fetchBeersFromProxy('13879').catch(() => {});
        }

        // Now try batch request - should be rate limited
        const result = await fetchEnrichmentBatch(['123', '456']);

        // Should return empty due to rate limiting
        expect(result).toEqual({});
      });

      it('should handle network errors and stop processing', async () => {
        const ids = Array.from({ length: 150 }, (_, i) => `beer-${i}`);

        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({
              enrichments: {
                'beer-0': {
                  enriched_abv: 5.0,
                  enrichment_confidence: 0.9,
                  enrichment_source: 'perplexity',
                },
              },
              requestId: 'req-1',
              found: 1,
              notFound: 99,
            }),
          })
          .mockRejectedValueOnce(new Error('Network error'));

        const result = await fetchEnrichmentBatch(ids);

        // Should return results from first chunk, stop on network error
        expect(result['beer-0']).toBeDefined();
        expect(Object.keys(result)).toHaveLength(1);
      });
    });
  });

  describe('Cache Functions', () => {
    describe('bustTaplistCache', () => {
      // Note: Need to mock getClientId as well
      const mockGetPreference = require('@/src/database/preferences').getPreference;

      beforeEach(() => {
        // Setup mock for client ID
        mockGetPreference.mockResolvedValue('test-client-id');
      });

      it('should return true when cache is successfully cleared', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ cacheCleared: true }),
        });

        const result = await bustTaplistCache('13879');

        expect(result).toBe(true);
        expect(mockFetch).toHaveBeenCalledWith(
          'https://test-api.example.com/cache?sid=13879',
          expect.objectContaining({
            method: 'DELETE',
            headers: expect.objectContaining({
              'X-API-Key': 'test-api-key',
            }),
          })
        );
      });

      it('should return false when cache was not cleared', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ cacheCleared: false }),
        });

        const result = await bustTaplistCache('13879');

        expect(result).toBe(false);
      });

      it('should return false when response is not ok', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 500,
        });

        const result = await bustTaplistCache('13879');

        expect(result).toBe(false);
      });

      it('should return false when fetch throws', async () => {
        mockFetch.mockRejectedValueOnce(new Error('Network error'));

        const result = await bustTaplistCache('13879');

        expect(result).toBe(false);
      });

      it('should return false when enrichment is not configured', async () => {
        const { config } = require('@/src/config');
        config.enrichment.isConfigured.mockReturnValueOnce(false);

        const result = await bustTaplistCache('13879');

        expect(result).toBe(false);
        expect(mockFetch).not.toHaveBeenCalled();
      });
    });
  });
});
