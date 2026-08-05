/**
 * Comprehensive tests for beerApi module
 *
 * This test suite validates the beerApi functions for fetching beers,
 * tasted beers, and rewards from the Flying Saucer API.
 */

// NOTE: this assignment runs AFTER the hoisted imports, so config has already
// been frozen at its default. Retry tests pass an explicit delay instead; this
// line is inert and kept only because removing it is a separate change.
import {
  fetchWithRetry,
  fetchBeersFromAPI,
  fetchMyBeersFromAPI,
  fetchRewardsFromAPI,
} from '../beerApi';
import * as preferences from '../../database/preferences';
import { config } from '@/src/config';
import type { FetchOutcome, FetchedSource } from '../fetchOutcome';

process.env.EXPO_PUBLIC_API_RETRY_DELAY = '10';

// Mock the preferences module
jest.mock('../../database/preferences');

// Mock global fetch
global.fetch = jest.fn();

/**
 * Assert a request completed and return its payload outcome.
 *
 * The three fetchers return `FetchedSource<FetchOutcome<T>>`: the outer union
 * says what happened to the REQUEST, the inner what the BODY contained.
 */
function payload<T>(source: FetchedSource<FetchOutcome<T>>): FetchOutcome<T> {
  if (source.status !== 'fetched') {
    throw new Error(`expected a fetched source, got "${source.status}"`);
  }
  return source.data;
}

describe('Beer API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('fetchWithRetry', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should return data on successful fetch', async () => {
      const mockData = { brewInStock: [] };
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      });

      const resultPromise = fetchWithRetry(config.api.baseUrl);
      const result = await resultPromise;

      // The signal arrived with plan 05 Phase 5.0; the timeout behaviour it
      // carries is pinned in beerApi.timeout.test.ts. Asserted here only so this
      // test keeps describing the real call.
      expect(global.fetch).toHaveBeenCalledWith(config.api.baseUrl, {
        signal: expect.any(AbortSignal),
      });
      expect(result).toEqual(mockData);
    });

    // DELETED, not skipped: 'should handle none:// protocol URLs by returning
    // empty data'. It asserted the synthesised `[null, {
    // tasted_brew_current_round: [] }]` that plan 02 Phase 3 removed, so it
    // could never be un-skipped — its body described behaviour that no longer
    // exists, and leaving it in place invited someone to "repair" the suite by
    // restoring the fabrication.
    //
    // It was kept skipped on the grounds that deleting it would leave the
    // removal unpinned. That no longer holds: `integration.mockServer.test.ts`
    // now hands a none:// URL straight to `fetchWithRetry` and requires a
    // rejection, and mutation testing confirms it is the ONLY test in the suite
    // that dies when the synthesis is restored — 241 tests across all 14
    // `src/api/__tests__` suites stay green, this one does not.
    //
    // The replacement behaviour — callers rejecting none:// before the request
    // — stays pinned by 'reports not-applicable for a none:// URL' below.

    it('should retry on fetch failure', async () => {
      const mockData = { brewInStock: [] };

      // First call fails, second succeeds
      (global.fetch as jest.Mock)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockData,
        });

      const resultPromise = fetchWithRetry(config.api.baseUrl, 2, 10);

      // Fast-forward time to trigger retry
      await jest.advanceTimersByTimeAsync(15);

      const result = await resultPromise;

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual(mockData);
    });

    it('should retry with config network settings', async () => {
      const mockData = { brewInStock: [] };

      // First call fails, second succeeds
      (global.fetch as jest.Mock)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockData,
        });

      const resultPromise = fetchWithRetry(
        config.api.baseUrl,
        config.network.retries,
        config.network.retryDelay
      );

      // Fast-forward time to trigger retry
      await jest.advanceTimersByTimeAsync(config.network.retryDelay + 100);

      const result = await resultPromise;

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual(mockData);
    });

    it('should throw error after exhausting retries', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const resultPromise = fetchWithRetry(config.api.baseUrl, 1, 10);

      await expect(resultPromise).rejects.toThrow('Network error');
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should throw error on non-ok HTTP status', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const resultPromise = fetchWithRetry(config.api.baseUrl, 1, 10);

      // HttpError, so createErrorResponse classifies by type rather than reading
      // 'Failed to fetch' out of the message and calling it a network error.
      await expect(resultPromise).rejects.toThrow('HTTP 404 Not Found');
    });
  });

  describe('fetchBeersFromAPI', () => {
    it('should return empty array when API URL is not configured', async () => {
      (preferences.getPreference as jest.Mock).mockResolvedValue(null);

      const result = await fetchBeersFromAPI();

      // Was []. Now says WHY there is nothing, which is the whole point.
      expect(result.status).toBe('unavailable');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should fetch and return beers in standard brewInStock format', async () => {
      const mockBeers = [
        { id: '1', brew_name: 'Test Beer 1', brewer: 'Test Brewery' },
        { id: '2', brew_name: 'Test Beer 2', brewer: 'Test Brewery' },
      ];
      const mockResponse = [{}, { brewInStock: mockBeers }];

      (preferences.getPreference as jest.Mock).mockResolvedValue(config.api.baseUrl);
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await fetchBeersFromAPI();

      const body = payload(result);
      expect(body.kind).toBe('data');
      if (body.kind === 'data') expect(body.items).toEqual(mockBeers);
      expect(preferences.getPreference).toHaveBeenCalledWith('all_beers_api_url');
    });

    it('should find beers in nested object structure', async () => {
      const mockBeers = [{ id: '1', brew_name: 'Test Beer', brewer: 'Test Brewery' }];
      const mockResponse = {
        data: {
          beers: mockBeers,
        },
      };

      (preferences.getPreference as jest.Mock).mockResolvedValue(config.api.baseUrl);
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await fetchBeersFromAPI();

      const body = payload(result);
      expect(body.kind).toBe('data');
      if (body.kind === 'data') expect(body.items).toEqual(mockBeers);
    });

    it('reports confirmed-empty when brewInStock is present but empty', async () => {
      // A store that genuinely has nothing on tap answers with a well-formed
      // body and a zero-length array. That is the server reporting none, which
      // the outcome model calls `confirmed-empty` — not a fact about the body
      // being unusable. Classifying it `malformed` sent a plain Error up
      // `requireRows` and the user saw UNKNOWN_ERROR for a working server.
      const mockResponse = [{}, { brewInStock: [] }];

      (preferences.getPreference as jest.Mock).mockResolvedValue(config.api.baseUrl);
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      expect(payload(await fetchBeersFromAPI()).kind).toBe('confirmed-empty');
    });

    it('reports malformed when no beer data is found in the response', async () => {
      const mockResponse = { someOtherData: 'value' };

      (preferences.getPreference as jest.Mock).mockResolvedValue(config.api.baseUrl);
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      // INVERTED by plan 05 Phase 5.3. A body arrived and was unusable, which is
      // `fetched` + `malformed` — a fact about the body, not the request.
      expect(payload(await fetchBeersFromAPI()).kind).toBe('malformed');
    });

    it('reports failed when the fetch rejects', async () => {
      (preferences.getPreference as jest.Mock).mockResolvedValue(config.api.baseUrl);
      // Mock fetch to always reject
      (global.fetch as jest.Mock).mockImplementation(() =>
        Promise.reject(new Error('Network error'))
      );

      // INVERTED by plan 05 Phase 5.3: transport failures arrive as `failed`.
      expect((await fetchBeersFromAPI()).status).toBe('failed');
    });
  });

  describe('fetchMyBeersFromAPI', () => {
    it('should return empty array in visitor mode', async () => {
      (preferences.getPreference as jest.Mock).mockImplementation((key: string) => {
        if (key === 'is_visitor_mode') return Promise.resolve('true');
        return Promise.resolve(null);
      });

      const result = await fetchMyBeersFromAPI();

      // Was []. Each of these conditions now names itself.
      expect(result.status).toBe('unavailable');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should return empty array when API URL is not configured', async () => {
      (preferences.getPreference as jest.Mock).mockImplementation((key: string) => {
        if (key === 'is_visitor_mode') return Promise.resolve('false');
        if (key === 'my_beers_api_url') return Promise.resolve(null);
        return Promise.resolve(null);
      });

      const result = await fetchMyBeersFromAPI();

      // Was []. Each of these conditions now names itself.
      expect(result.status).toBe('unavailable');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should return empty array for none:// protocol URLs', async () => {
      (preferences.getPreference as jest.Mock).mockImplementation((key: string) => {
        if (key === 'is_visitor_mode') return Promise.resolve('false');
        if (key === 'my_beers_api_url') return Promise.resolve('none://placeholder');
        return Promise.resolve(null);
      });

      const result = await fetchMyBeersFromAPI();

      // Was []. Each of these conditions now names itself.
      expect(result.status).toBe('unavailable');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    // SUPERSEDED by plan 02 Phase 3. Phase 2 bridged this with a throw because
    // the return type had no way to say "a body arrived and was unusable".
    // `malformed` is that way, so the caller decides instead of being forced to
    // catch. The MalformedResponseError type is retired with it.
    it('reports malformed rather than [] when every row lacks an id', async () => {
      (preferences.getPreference as jest.Mock).mockImplementation((key: string) => {
        if (key === 'is_visitor_mode') return Promise.resolve('false');
        if (key === 'my_beers_api_url') return Promise.resolve('https://example.com/my.json');
        return Promise.resolve(null);
      });
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => [
          {},
          { tasted_brew_current_round: [{ brew_name: 'no id' }, { brew_name: 'nor here' }] },
        ],
      });

      // This is where the distinguishing information was destroyed. Returning
      // [] here made a malformed response indistinguishable from a genuine
      // empty round for EVERY caller downstream — so no caller-side length
      // check could tell them apart, and both callers wiped the tasted table.
      //
      // Asserts the TYPE, not just the message: an untyped Error carries the
      // same text but falls through createErrorResponse to UNKNOWN_ERROR, and
      // the developer prose then reaches the user's refresh alert verbatim.
      const outcome = await fetchMyBeersFromAPI();

      const body = payload(outcome);
      expect(body.kind).toBe('malformed');
      if (body.kind === 'malformed') expect(body.detail).toMatch(/none carried an id/i);
    });

    it('should fetch and return tasted beers', async () => {
      const mockBeers = [
        { id: '1', brew_name: 'Tasted Beer 1', brewer: 'Test Brewery' },
        { id: '2', brew_name: 'Tasted Beer 2', brewer: 'Test Brewery' },
      ];
      const mockResponse = [{}, { tasted_brew_current_round: mockBeers }, {}];

      (preferences.getPreference as jest.Mock).mockImplementation((key: string) => {
        if (key === 'is_visitor_mode') return Promise.resolve('false');
        if (key === 'my_beers_api_url')
          return Promise.resolve(config.api.getFullUrl('memberDashboard'));
        return Promise.resolve(null);
      });
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await fetchMyBeersFromAPI();

      const body = payload(result);
      expect(body.kind).toBe('data');
      if (body.kind === 'data') expect(body.items).toEqual(mockBeers);
      expect(preferences.getPreference).toHaveBeenCalledWith('my_beers_api_url');
    });

    it('should handle empty tasted beers array as valid state', async () => {
      const mockResponse = [{}, { tasted_brew_current_round: [] }, {}];

      (preferences.getPreference as jest.Mock).mockImplementation((key: string) => {
        if (key === 'is_visitor_mode') return Promise.resolve('false');
        if (key === 'my_beers_api_url')
          return Promise.resolve(config.api.getFullUrl('memberDashboard'));
        return Promise.resolve(null);
      });
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await fetchMyBeersFromAPI();

      // Was []. Each of these conditions now names itself.
      // A genuinely empty round is confirmed-empty, not unavailable: the
      // server answered, and the answer was zero. That distinction is the
      // one that decides whether clearing the local table is correct.
      expect(payload(result).kind).toBe('confirmed-empty');
    });

    it('should filter out beers without IDs', async () => {
      const mockBeers = [
        { id: '1', brew_name: 'Valid Beer' },
        { brew_name: 'Invalid Beer No ID' },
        { id: '2', brew_name: 'Another Valid Beer' },
      ];
      const mockResponse = [{}, { tasted_brew_current_round: mockBeers }, {}];

      (preferences.getPreference as jest.Mock).mockImplementation((key: string) => {
        if (key === 'is_visitor_mode') return Promise.resolve('false');
        if (key === 'my_beers_api_url')
          return Promise.resolve(config.api.getFullUrl('memberDashboard'));
        return Promise.resolve(null);
      });
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await fetchMyBeersFromAPI();

      const filtered = payload(result);
      expect(filtered.kind).toBe('data');
      if (filtered.kind !== 'data') throw new Error('expected data');
      expect(filtered.items).toHaveLength(2);
      expect(filtered.items[0].id).toBe('1');
      expect(filtered.items[1].id).toBe('2');
    });

    it('reports malformed on an invalid response format', async () => {
      const mockResponse = { someOtherData: 'value' };

      (preferences.getPreference as jest.Mock).mockImplementation((key: string) => {
        if (key === 'is_visitor_mode') return Promise.resolve('false');
        if (key === 'my_beers_api_url')
          return Promise.resolve(config.api.getFullUrl('memberDashboard'));
        return Promise.resolve(null);
      });
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      // INVERTED by plan 05 Phase 5.3.
      expect(payload(await fetchMyBeersFromAPI()).kind).toBe('malformed');
    });

    it('reports failed when the fetch rejects', async () => {
      (preferences.getPreference as jest.Mock).mockImplementation((key: string) => {
        if (key === 'is_visitor_mode') return Promise.resolve('false');
        if (key === 'my_beers_api_url')
          return Promise.resolve(config.api.getFullUrl('memberDashboard'));
        return Promise.resolve(null);
      });
      // Mock fetch to always reject
      (global.fetch as jest.Mock).mockImplementation(() =>
        Promise.reject(new Error('Network error'))
      );

      // INVERTED by plan 05 Phase 5.3.
      expect((await fetchMyBeersFromAPI()).status).toBe('failed');
    });
  });

  describe('fetchRewardsFromAPI', () => {
    it('should return empty array in visitor mode', async () => {
      (preferences.getPreference as jest.Mock).mockImplementation((key: string) => {
        if (key === 'is_visitor_mode') return Promise.resolve('true');
        return Promise.resolve(null);
      });

      const result = await fetchRewardsFromAPI();

      expect(result.status).toBe('unavailable');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should return empty array when API URL is not configured', async () => {
      (preferences.getPreference as jest.Mock).mockImplementation((key: string) => {
        if (key === 'is_visitor_mode') return Promise.resolve('false');
        if (key === 'my_beers_api_url') return Promise.resolve(null);
        return Promise.resolve(null);
      });

      const result = await fetchRewardsFromAPI();

      expect(result.status).toBe('unavailable');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should fetch and return rewards', async () => {
      const mockRewards = [
        { reward_id: '1', redeemed: 'false', reward_type: 'plate' },
        { reward_id: '2', redeemed: 'true', reward_type: 'shirt' },
      ];
      const mockResponse = [{}, { tasted_brew_current_round: [] }, { reward: mockRewards }];

      (preferences.getPreference as jest.Mock).mockImplementation((key: string) => {
        if (key === 'is_visitor_mode') return Promise.resolve('false');
        if (key === 'my_beers_api_url')
          return Promise.resolve(config.api.getFullUrl('memberRewards'));
        return Promise.resolve(null);
      });
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await fetchRewardsFromAPI();

      const rewardsBody = payload(result);
      expect(rewardsBody.kind).toBe('data');
      if (rewardsBody.kind === 'data') expect(rewardsBody.items).toEqual(mockRewards);
      expect(preferences.getPreference).toHaveBeenCalledWith('my_beers_api_url');
    });

    it('reports malformed on an invalid response format', async () => {
      const mockResponse = { someOtherData: 'value' };

      (preferences.getPreference as jest.Mock).mockImplementation((key: string) => {
        if (key === 'is_visitor_mode') return Promise.resolve('false');
        if (key === 'my_beers_api_url')
          return Promise.resolve(config.api.getFullUrl('memberRewards'));
        return Promise.resolve(null);
      });
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      // INVERTED by plan 05 Phase 5.3.
      expect(payload(await fetchRewardsFromAPI()).kind).toBe('malformed');
    });

    it('reports failed when the fetch rejects', async () => {
      (preferences.getPreference as jest.Mock).mockImplementation((key: string) => {
        if (key === 'is_visitor_mode') return Promise.resolve('false');
        if (key === 'my_beers_api_url')
          return Promise.resolve(config.api.getFullUrl('memberRewards'));
        return Promise.resolve(null);
      });
      // Mock fetch to always reject
      (global.fetch as jest.Mock).mockImplementation(() =>
        Promise.reject(new Error('Network error'))
      );

      // INVERTED by plan 05 Phase 5.3.
      expect((await fetchRewardsFromAPI()).status).toBe('failed');
    });
  });

  describe('Config Integration', () => {
    describe('URL Construction', () => {
      it('should use config base URL when available', async () => {
        const mockBeers = [{ id: '1', brew_name: 'Test Beer' }];
        const mockResponse = [{}, { brewInStock: mockBeers }];

        (preferences.getPreference as jest.Mock).mockResolvedValue(config.api.baseUrl);
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse,
        });

        await fetchBeersFromAPI();

        // Verify fetch was called with config URL
        expect(global.fetch).toHaveBeenCalledWith(config.api.baseUrl, {
          signal: expect.any(AbortSignal),
        });
      });

      it('should use config endpoint URLs for different API calls', async () => {
        const mockBeers = [{ id: '1', brew_name: 'Test Beer' }];
        const mockResponse = [{}, { tasted_brew_current_round: mockBeers }, {}];

        (preferences.getPreference as jest.Mock).mockImplementation((key: string) => {
          if (key === 'is_visitor_mode') return Promise.resolve('false');
          if (key === 'my_beers_api_url')
            return Promise.resolve(config.api.getFullUrl('memberDashboard'));
          return Promise.resolve(null);
        });
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse,
        });

        await fetchMyBeersFromAPI();

        // Verify fetch was called with config-constructed URL
        expect(global.fetch).toHaveBeenCalledWith(config.api.getFullUrl('memberDashboard'), {
          signal: expect.any(AbortSignal),
        });
      });
    });

    describe('Network Configuration', () => {
      beforeEach(() => {
        jest.useFakeTimers();
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      it('should respect config network timeout settings', async () => {
        // Network timeout is configured in config module
        const mockData = { brewInStock: [] };

        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: async () => mockData,
        });

        await fetchWithRetry(config.api.baseUrl);

        // Verify timeout configuration is available
        expect(config.network.timeout).toBeGreaterThan(0);
        expect(config.network.timeout).toBeLessThanOrEqual(60000); // Should be <= 60 seconds (can be set via env var)
      });

      it('should use config retry settings for network errors', async () => {
        const mockData = { brewInStock: [] };

        // First call fails, subsequent calls succeed
        (global.fetch as jest.Mock)
          .mockRejectedValueOnce(new Error('Network error'))
          .mockResolvedValueOnce({
            ok: true,
            json: async () => mockData,
          });

        const resultPromise = fetchWithRetry(
          config.api.baseUrl,
          config.network.retries,
          config.network.retryDelay
        );

        // Fast-forward time to trigger retry
        await jest.advanceTimersByTimeAsync(config.network.retryDelay + 100);

        const result = await resultPromise;

        // Verify config values are used (retryDelay is 10ms in tests for speed)
        expect(config.network.retries).toBe(3);
        expect(config.network.retryDelay).toBe(10);
        expect(result).toEqual(mockData);
      });
    });

    describe('Environment Switching', () => {
      beforeEach(() => {
        // Reset to default environment before each test
        config.setEnvironment('production');
      });

      afterEach(() => {
        // Reset to default environment after each test
        config.setEnvironment('production');
      });

      it('should use production URLs when environment is production', async () => {
        config.setEnvironment('production');

        // Verify production base URL
        expect(config.api.baseUrl).toBe('https://tapthatapp.beerknurd.com');
      });

      it('should use development URLs when environment is development', async () => {
        config.setEnvironment('development');

        // Verify development base URL (currently same as production)
        expect(config.api.baseUrl).toBe('https://tapthatapp.beerknurd.com');
      });

      it('should use custom URL when set', async () => {
        const customUrl = 'https://staging.example.com';
        config.setCustomApiUrl(customUrl);

        // Verify custom URL is used
        expect(config.api.baseUrl).toBe(customUrl);

        // Reset to production
        config.setEnvironment('production');
      });

      it('should validate URL format when setting custom URL', () => {
        // Invalid URLs should throw error
        expect(() => {
          config.setCustomApiUrl('not-a-valid-url');
        }).toThrow();

        // Valid URLs should work
        expect(() => {
          config.setCustomApiUrl('https://valid.example.com');
        }).not.toThrow();

        // Reset to production
        config.setEnvironment('production');
      });
    });

    describe('Config Validation', () => {
      it('should have valid config structure', () => {
        // Verify config has required properties
        expect(config).toHaveProperty('api');
        expect(config).toHaveProperty('network');
        expect(config).toHaveProperty('external');

        // Verify API config
        expect(config.api).toHaveProperty('baseUrl');
        expect(config.api).toHaveProperty('endpoints');
        expect(config.api).toHaveProperty('referers');
        expect(config.api).toHaveProperty('getFullUrl');

        // Verify network config
        expect(config.network).toHaveProperty('timeout');
        expect(config.network).toHaveProperty('retries');
        expect(config.network).toHaveProperty('retryDelay');
      });

      it('should have valid endpoint URLs', () => {
        // Verify all endpoints resolve to valid URLs
        const endpoints = [
          'memberDashboard',
          'memberRewards',
          'memberQueues',
          'deleteQueuedBrew',
          'addToQueue',
        ];

        endpoints.forEach(endpoint => {
          const url = config.api.getFullUrl(endpoint as any);
          expect(url).toMatch(/^https?:\/\//);
          expect(url).toBeTruthy();
        });
      });

      it('should have valid referer URLs', () => {
        // Verify all referers are valid URLs
        expect(config.api.referers.memberDashboard).toMatch(/^https?:\/\//);
        expect(config.api.referers.memberRewards).toMatch(/^https?:\/\//);
        expect(config.api.referers.memberQueues).toMatch(/^https?:\/\//);
      });

      it('should have valid network configuration values', () => {
        // Verify network values are positive integers
        expect(config.network.timeout).toBeGreaterThan(0);
        expect(config.network.retries).toBeGreaterThan(0);
        expect(config.network.retryDelay).toBeGreaterThan(0);

        // Verify reasonable values
        expect(config.network.timeout).toBeLessThanOrEqual(60000); // Max 60s
        expect(config.network.retries).toBeLessThanOrEqual(10); // Max 10 retries
        expect(config.network.retryDelay).toBeLessThanOrEqual(5000); // Max 5s initial delay
      });
    });
  });
});

describe('FetchOutcome semantics (plan 02 Phase 3)', () => {
  // This block is a sibling of `describe('Beer API')`, so it does NOT inherit
  // that block's cleanup — without this, `global.fetch` accumulates calls across
  // every test here. The `not.toHaveBeenCalled()` assertions are the ones that
  // care: the my-beers none:// test in this block passed only because it happened to
  // run before any test that fetches. A test that cannot fail is worth less than
  // no test, so pin the isolation rather than the ordering.
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Every assertion here is on `kind`, never on array length. Length is what
  // made six distinct conditions indistinguishable in the first place.
  const memberPrefs = (urlKey: string, url: string | null) => (key: string) => {
    if (key === 'is_visitor_mode') return Promise.resolve('false');
    if (key === urlKey) return Promise.resolve(url);
    return Promise.resolve(null);
  };

  describe('fetchMyBeersFromAPI', () => {
    it('reports unavailable/not-configured when my_beers_api_url is absent', async () => {
      (preferences.getPreference as jest.Mock).mockImplementation(
        memberPrefs('my_beers_api_url', null)
      );

      const outcome = await fetchMyBeersFromAPI();

      expect(outcome.status).toBe('unavailable');
      if (outcome.status === 'unavailable') {
        expect(outcome.reason.code).toBe('not-configured');
      }
    });

    it('reports unavailable/not-applicable in visitor mode', async () => {
      (preferences.getPreference as jest.Mock).mockImplementation((key: string) =>
        Promise.resolve(key === 'is_visitor_mode' ? 'true' : null)
      );

      const outcome = await fetchMyBeersFromAPI();

      expect(outcome.status).toBe('unavailable');
      if (outcome.status === 'unavailable') {
        expect(outcome.reason.code).toBe('not-applicable');
      }
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('reports not-applicable for a none:// URL without calling fetch', async () => {
      (preferences.getPreference as jest.Mock).mockImplementation(
        memberPrefs('my_beers_api_url', 'none://placeholder')
      );

      const outcome = await fetchMyBeersFromAPI();

      expect(outcome.status).toBe('unavailable');
      if (outcome.status === 'unavailable') {
        expect(outcome.reason.code).toBe('not-applicable');
      }
      // Pins the REPLACEMENT behaviour, not just the removal: once
      // fetchWithRetry stops synthesising a fake response for none://, the URL
      // must be rejected BEFORE the request or it falls through to fetch() and
      // burns three retries with backoff.
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('reports confirmed-empty when the server returns an empty round', async () => {
      (preferences.getPreference as jest.Mock).mockImplementation(
        memberPrefs('my_beers_api_url', 'https://example.com/my.json')
      );
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => [{}, { tasted_brew_current_round: [] }],
      });

      const outcome = await fetchMyBeersFromAPI();

      // A real state — new user, or the rollover at 200 — and the ONLY case in
      // which clearing the local table is correct.
      expect(payload(outcome).kind).toBe('confirmed-empty');
    });

    it('reports malformed when every entry lacks an id', async () => {
      (preferences.getPreference as jest.Mock).mockImplementation(
        memberPrefs('my_beers_api_url', 'https://example.com/my.json')
      );
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => [
          {},
          { tasted_brew_current_round: [{ brew_name: 'no id' }, { brew_name: 'nor here' }] },
        ],
      });

      const outcome = await fetchMyBeersFromAPI();

      // Replaces the MalformedResponseError bridge added in Phase 2 — the
      // caller decides now, instead of being forced to catch.
      expect(payload(outcome).kind).toBe('malformed');
    });

    it('reports data when the server returns beers', async () => {
      (preferences.getPreference as jest.Mock).mockImplementation(
        memberPrefs('my_beers_api_url', 'https://example.com/my.json')
      );
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => [
          {},
          { tasted_brew_current_round: [{ id: '1', brew_name: 'Tasted', brewer: 'X' }] },
        ],
      });

      const outcome = await fetchMyBeersFromAPI();

      const body = payload(outcome);
      expect(body.kind).toBe('data');
      if (body.kind === 'data') {
        expect(body.items).toHaveLength(1);
      }
    });
  });

  it('fetchBeersFromAPI reports unavailable/not-configured when all_beers_api_url is absent', async () => {
    (preferences.getPreference as jest.Mock).mockImplementation(
      memberPrefs('all_beers_api_url', null)
    );

    const outcome = await fetchBeersFromAPI();

    expect(outcome.status).toBe('unavailable');
    if (outcome.status === 'unavailable') {
      expect(outcome.reason.code).toBe('not-configured');
    }
  });

  it('fetchRewardsFromAPI reports unavailable rather than an empty list in visitor mode', async () => {
    (preferences.getPreference as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(key === 'is_visitor_mode' ? 'true' : null)
    );

    const outcome = await fetchRewardsFromAPI();

    expect(outcome.status).toBe('unavailable');
    if (outcome.status === 'unavailable') {
      expect(outcome.reason.code).toBe('not-applicable');
    }
  });

  it('fetchRewardsFromAPI reports not-applicable for a none:// URL without calling fetch', async () => {
    // Plan 05 Phase 5.2. Rewards reads the SAME preference as my-beers
    // (`my_beers_api_url`), so it inherited the same placeholder exposure and
    // none of the guard: 02 Phase 3 added the rejection at one of the two call
    // sites. Without it the placeholder reaches fetch() and burns three retries
    // at 1s / 1.5s / 2.25s — 4.75s of a refresh budget, on the weak links this
    // plan exists to fix, for a URL that was never valid.
    (preferences.getPreference as jest.Mock).mockImplementation(
      memberPrefs('my_beers_api_url', 'none://placeholder')
    );

    const outcome = await fetchRewardsFromAPI();

    expect(outcome.status).toBe('unavailable');
    if (outcome.status === 'unavailable') {
      expect(outcome.reason.code).toBe('not-applicable');
    }
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
