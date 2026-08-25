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
  // `kind: 'data'` promises a NON-EMPTY ARRAY of rows, and the type system does
  // not enforce it: `toNonEmpty(x)!` at the rewards site manufactured
  // `items: null` in a NonEmptyArray slot from a non-array payload, and the
  // consumer then did `[...null]` under the write lock. Asserted in the shared
  // helper rather than per test, so every outcome-returning test in this file
  // enforces it instead of only the ones that remember to.
  if (source.data.kind === 'data') {
    expect(Array.isArray(source.data.items)).toBe(true);
    expect(source.data.items.length).toBeGreaterThan(0);
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
    // catch.
    //
    // The `MalformedResponseError` CLASS is now gone, but the
    // MALFORMED_RESPONSE_ERROR type is not, and an earlier version of this
    // comment ran the two together. Shape-rejection — this case — still reports
    // through that type and keeps its copy; what left is "the body could not be
    // read", which is now `UnreadableBodyError` and a different claim.
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

describe('a non-array payload is malformed, not data (plan refresh-failure-classification Phase 0)', () => {
  // Four extraction sites tested their payload for TRUTHINESS only, and `{}` is
  // truthy. Each then handed a non-array to code that assumes an array:
  //
  // - `tasted_brew_current_round` skipped the wipe branch (`.length` is
  //   undefined) and threw `TypeError: beers.filter is not a function`, which
  //   reached the user's refresh alert verbatim as
  //   "Beerfinder data: beers.filter is not a function".
  // - `brewInStock` became `confirmed-empty` — the right refusal for the wrong
  //   reason.
  // - `reward` was the worst: `{}.length === 0` is false, so it returned
  //   `{kind:'data', items: toNonEmpty({})!}` — `items: null` in a NonEmptyArray
  //   slot — and `writeRewards` spread it under the write lock. For a STRING
  //   payload it is worse still and silent: `toNonEmpty('oops')` yields four
  //   one-character rows that spread fine, `_insertManyInternal` runs
  //   `DELETE FROM rewards` first, and `reward_id || ''` collapses all four into
  //   one junk row. The member's real rewards are deleted and the refresh
  //   reports success.
  //
  // Every assertion here is on the OUTCOME. `beerApi.ts` imports no repository,
  // so a repository assertion in this file could not be mutated by any change to
  // the module under test.
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const memberPrefs = (urlKey: string) => (key: string) => {
    if (key === 'is_visitor_mode') return Promise.resolve('false');
    if (key === urlKey) return Promise.resolve('https://example.com/data.json');
    return Promise.resolve(null);
  };

  const respondWith = (body: unknown): void => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => body });
  };

  describe('fetchMyBeersFromAPI', () => {
    beforeEach(() => {
      (preferences.getPreference as jest.Mock).mockImplementation(memberPrefs('my_beers_api_url'));
    });

    // Not an uncaught throw today: the TypeError is caught by the fetcher's own
    // outer catch and returned as `failed`, which is why this reads as a
    // transport fault to every consumer downstream.
    it.each([
      ['an object', {}],
      ['a string', 'oops'],
      ['a number', 42],
    ])('reports malformed when tasted_brew_current_round is %s', async (_label, value) => {
      respondWith([{}, { tasted_brew_current_round: value }]);

      const outcome = await fetchMyBeersFromAPI();

      expect(outcome.status).toBe('fetched');
      expect(payload(outcome).kind).toBe('malformed');
    });
  });

  describe('fetchBeersFromAPI', () => {
    beforeEach(() => {
      (preferences.getPreference as jest.Mock).mockImplementation(memberPrefs('all_beers_api_url'));
    });

    it('reports malformed when brewInStock is an object, not confirmed-empty', async () => {
      // `confirmed-empty` is a claim about what the SERVER said. A payload this
      // code cannot read is not the server saying "nothing on tap".
      respondWith([{}, { brewInStock: {} }]);

      expect(payload(await fetchBeersFromAPI()).kind).toBe('malformed');
    });

    it('accepts a nested beer array that the truthiness check used to discard', async () => {
      // THE WIDENING, PINNED. Falling through to `findBeersArray` is not purely
      // a narrowing: `{brewInStock: {beers: [...]}}` currently becomes
      // `confirmed-empty` and will now become `data`. An improvement, and a
      // deliberate behaviour change, so it gets an assertion rather than only
      // prose in a plan.
      respondWith([
        {},
        { brewInStock: { beers: [{ id: '1', brew_name: 'Nested', brewer: 'X' }] } },
      ]);

      const body = payload(await fetchBeersFromAPI());
      expect(body.kind).toBe('data');
      if (body.kind === 'data') expect(body.items).toHaveLength(1);
    });
  });

  describe('fetchRewardsFromAPI', () => {
    beforeEach(() => {
      (preferences.getPreference as jest.Mock).mockImplementation(memberPrefs('my_beers_api_url'));
    });

    it('reports malformed for an object reward payload, carrying no items at all', async () => {
      respondWith([{}, {}, { reward: {} }]);

      // The WHOLE outcome, exactly. `expect(kind).toBe('malformed')` alone would
      // pass against `{kind:'data', items:null}` becoming `{kind:'malformed'}`
      // while some other arm still manufactured a null-carrying data outcome;
      // an exact-shape assertion is the closest expressible form of "no outcome
      // carries a non-array in a NonEmptyArray slot".
      await expect(fetchRewardsFromAPI()).resolves.toEqual({
        status: 'fetched',
        data: { kind: 'malformed', detail: expect.any(String) },
        etag: null,
      });
    });

    it('reports malformed for an ARRAY of rows that are not rewards', async () => {
      // The hole the `Array.isArray` guard did NOT close, found in review. The
      // guard narrows the CONTAINER only: `['oops']` is an array, so it passed,
      // `length !== 0` took the data arm, and `toNonEmpty(['oops'])!` produced
      // `{kind:'data', items:['oops']}` — the same silent wipe as the string
      // case, one level in. `_insertManyInternal` runs `DELETE FROM rewards`
      // first and then maps `reward.reward_id || ''`, so the member's rewards
      // are deleted, replaced by one junk row, and the refresh reports success.
      //
      // The comment above this guard claimed "the check is the narrowing". It
      // was not: `Array.isArray` on an `any` yields `any[]`, so the annotated
      // assignment was an unchecked widening — as unsound as the cast it
      // replaced and less visible, because neither `tsc` nor the linter says a
      // word. The elements are validated now, as the my-beers sibling already
      // validated its own.
      respondWith([{}, {}, { reward: ['oops'] }]);

      expect(payload(await fetchRewardsFromAPI()).kind).toBe('malformed');
    });

    // The expected VALUES, not just their type. This asserted
    // `typeof … === 'string'`, which any wrong default satisfies — mutation
    // showed `reward_type: '' -> 'unknown'` survives the whole API suite,
    // typechecks, and is not absorbed downstream: `reward.reward_type || ''`
    // keeps a truthy `'unknown'`, it lands in the table, and the member reads it
    // in the rewards list and in `Would you like to add "unknown" to your
    // queue?`. A test named for a behaviour must assert that behaviour.
    //
    // `redeemed`'s wrong default IS absorbed — `reward.redeemed || '0'` makes
    // `''` and `'0'` identical by the time they reach SQLite — but it is pinned
    // here anyway, because "absorbed by a caller two layers down" is not a
    // property this function should rely on.
    const DEFAULTED: readonly [string, Record<string, unknown>, string, string, boolean][] = [
      [
        'numeric redeemed zero',
        { reward_id: 'r1', redeemed: 0, reward_type: '$5 Credit' },
        '0',
        '$5 Credit',
        false,
      ],
      [
        'numeric redeemed one',
        { reward_id: 'r1', redeemed: 1, reward_type: '$5 Credit' },
        '1',
        '$5 Credit',
        true,
      ],
      [
        'boolean redeemed true',
        { reward_id: 'r1', redeemed: true, reward_type: '$5 Credit' },
        '1',
        '$5 Credit',
        true,
      ],
      [
        'a numeric reward_type',
        { reward_id: 'r1', redeemed: '0', reward_type: 5 },
        '0',
        '5',
        false,
      ],
      [
        'a missing redeemed',
        { reward_id: 'r1', reward_type: '$5 Credit' },
        '0',
        '$5 Credit',
        false,
      ],
      ['a missing reward_type', { reward_id: 'r1', redeemed: '0' }, '0', '', false],
    ];

    it.each(DEFAULTED)(
      'normalizes %s to the value persistence and consumers expect',
      async (_label, row, expectedRedeemed, expectedRewardType, expectedIsRedeemed) => {
        // THE OUTAGE TRIP-WIRE, removed. Gating on the full `isReward` — all three
        // fields, all strings — protects against nothing the wipe depends on and
        // turns a cosmetic upstream change into a permanent, total failure:
        // `malformed` on every refresh, forever, with copy telling the member the
        // server is broken, until an app update ships.
        //
        // And `redeemed`/`reward_type` are demonstrably not required. The schema
        // has `redeemed: z.string().optional()`; `_insertManyInternal` writes
        // `reward.redeemed || '0'` and `reward.reward_type || ''`, defaulting both
        // itself; and the UI only ever asks `item.redeemed === '1'`. The old code
        // wrote a numeric `redeemed` and SQLite coerced it into the TEXT column.
        //
        // So this validates what the WIPE actually depends on — a usable
        // `reward_id` — and defaults the other two exactly as the writer already
        // does. A quiet failure made loud is right; making it loud, total and
        // permanent for a condition that is cosmetic is not.
        respondWith([{}, {}, { reward: [row] }]);

        const body = payload(await fetchRewardsFromAPI());
        expect(body.kind).toBe('data');
        if (body.kind === 'data') {
          expect(body.items[0].reward_id).toBe('r1');
          // The same defaults the writer would have applied, by value.
          expect(body.items[0].redeemed).toBe(expectedRedeemed);
          expect(body.items[0].reward_type).toBe(expectedRewardType);
          // Carry the normalized value through the exact predicate used by
          // both reward-card rendering and the queue guard.
          expect(body.items[0].redeemed === '1').toBe(expectedIsRedeemed);
        }
      }
    );

    it('reports confirmed-empty for a genuinely empty reward list', async () => {
      // THE ORDERING, pinned. The empty check runs BEFORE element validation,
      // and that sequence is the only thing separating "you have no rewards"
      // from "the server sent rows this app cannot read" — the first authorises
      // clearing the table, the second must never.
      //
      // Put the length check after the filter and `[]` becomes `malformed`: the
      // rewards table then never clears when a member redeems their last
      // reward, stale rows persist indefinitely, and the refresh reports a
      // source failure. Verified that mutant survives every other suite in the
      // repo — this is the only test that dies.
      respondWith([{}, {}, { reward: [] }]);

      expect(payload(await fetchRewardsFromAPI()).kind).toBe('confirmed-empty');
    });

    it('rejects a reward row whose id is the empty string', async () => {
      // `''` is a string, so a `typeof === 'string'` check accepts it — and
      // `''` is exactly the key the wipe mechanism collapses onto:
      // `_insertManyInternal` deletes every row, then writes
      // `reward.reward_id || ''` into a TEXT PRIMARY KEY, so a payload of
      // empty-id rows replaces the member's rewards with a single junk row and
      // reports success. Checked where the rows are read, because this is a
      // question about what is worth WRITING, not about what is row-shaped.
      respondWith([{}, {}, { reward: [{ reward_id: '', redeemed: '0', reward_type: 'X' }] }]);

      expect(payload(await fetchRewardsFromAPI()).kind).toBe('malformed');
    });

    it('keeps the rows that are rewards when only some are not', async () => {
      // Mirrors the my-beers rule: drop what fails validation, report malformed
      // only when nothing survives. Without this the fix above could be "reject
      // the whole payload if any row is odd", which would throw away a good
      // list for one bad row.
      respondWith([
        {},
        {},
        {
          reward: [
            { reward_id: 'r1', redeemed: '0', reward_type: '$5 Credit' },
            'oops',
            // Object-shaped with no id at all. It catches dropping the ID
            // check while keeping the object guard — NOT the reverse, which an
            // earlier version of this comment claimed: `'oops'` and `{}` both
            // have an `undefined` `.reward_id`, so neither separates the object
            // guard from the id check. It is also not the sole killer of that
            // mutant (the empty-id test above kills it too); it is a second and
            // more legible one.
            {},
            { reward_id: 'r2', redeemed: '1', reward_type: 'Plate' },
          ],
        },
      ]);

      const body = payload(await fetchRewardsFromAPI());
      expect(body.kind).toBe('data');
      if (body.kind === 'data') expect(body.items.map(r => r.reward_id)).toEqual(['r1', 'r2']);
    });

    it('accepts the real reward rows the fixture carries', async () => {
      // GUARD on the validation itself. A predicate stricter than the server's
      // actual payload would turn every real refresh into `malformed` and wipe
      // nothing — but report a failure to every member, forever. Driven from the
      // committed fixture rather than a hand-written row.
      // The COMMITTED fixture, not the repo-root copy. The two are byte-identical
      // today, but `mybeers.json` at the root is gitignored and untracked
      // (`.gitignore:103`), so a fresh checkout does not have it — and the note
      // beside that rule records CI losing a whole suite to ENOENT for exactly
      // this reason. The re-include at `.gitignore:111` exists to make this path
      // the safe one.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fixture = require('../../services/__tests__/fixtures/mybeers.json');
      respondWith(fixture);

      const body = payload(await fetchRewardsFromAPI());
      expect(body.kind).toBe('data');
      if (body.kind === 'data') expect(body.items).toHaveLength(fixture[2].reward.length);
    });

    it('reports malformed for a string reward payload rather than four fabricated rows', async () => {
      // THE SILENT WIPE. This is the whole fence for it, deliberately with no
      // service-level companion: the service suites mock the three fetchers
      // wholesale, so they cannot be handed the raw body, and feeding them the
      // OUTCOME instead bypasses `beerApi` altogether — red today and still red
      // after this phase, whose entire GREEN is four guards in this module.
      // Closing the only producer of those rows is what this phase does; a
      // production fence against a lying `{kind:'data'}` is a different change.
      respondWith([{}, {}, { reward: 'oops' }]);

      expect(payload(await fetchRewardsFromAPI()).kind).toBe('malformed');
    });
  });
});
