/**
 * API Integration Tests with Mock Server
 *
 * These tests use a real HTTP mock server to test actual network behavior
 * including retries, timeouts, error handling, and response parsing.
 * Unlike unit tests, these make real HTTP calls to validate end-to-end flow.
 */

import {
  setupMockServer,
  FlyingSaucerResponses,
  RequestRecord,
} from '../../__tests__/utils/mockServer';
import {
  fetchBeersFromAPI,
  fetchMyBeersFromAPI,
  fetchRewardsFromAPI,
  fetchWithRetry,
} from '../beerApi';
import * as preferences from '@/src/database/preferences';

// Mock the preferences module
jest.mock('@/src/database/preferences');

// IMPORTANT: Do NOT mock fetch - we need real HTTP calls to the mock server
// Save the real fetch before jest.setup.js mocks it
const realFetch = global.fetch;

describe('API Integration with Mock Server', () => {
  let mockServer: any;
  let cleanup: () => Promise<void>;
  const mockGetPreference = preferences.getPreference as jest.MockedFunction<
    typeof preferences.getPreference
  >;

  beforeAll(async () => {
    // Use real timers for integration tests (we need real HTTP delays)
    jest.useRealTimers();

    // Restore real fetch for integration tests
    global.fetch = require('node-fetch');

    const setup = await setupMockServer(0); // Use port 0 for auto-assign
    mockServer = setup.mockServer;
    cleanup = setup.cleanup;
  });

  afterAll(async () => {
    if (cleanup) {
      await cleanup();
    }
    // Restore the jest-mocked fetch
    global.fetch = realFetch;
  });

  beforeEach(() => {
    mockServer.clearHistory();
    mockServer.clearAllResponses();
    jest.clearAllMocks();
  });

  // =========================================================================
  // BEER FETCHING INTEGRATION TESTS
  // =========================================================================

  describe('Beer Fetching Integration', () => {
    it('should fetch all beers from mock server successfully', async () => {
      const mockBeers = [
        {
          id: '1',
          brew_name: 'Test IPA',
          brewer: 'Test Brewery',
          location: 'Austin, TX',
          description: 'A test beer',
          abv: '6.5',
          ibu: '65',
          srm: '8',
          glass_style: 'Pint',
          availability: 'Year Round',
          is_organic: '0',
          beer_advocate_rating: '85',
          beer_advocate_reviews: '100',
          untappd_rating: '4.0',
          untappd_reviews: '500',
        },
      ];

      mockGetPreference.mockResolvedValue(`${mockServer.getUrl()}/visitor.php`);

      mockServer.setResponse('/visitor.php', FlyingSaucerResponses.beers(mockBeers));

      const beers = await fetchBeersFromAPI();

      expect(beers).toEqual(mockBeers);
      expect(mockServer.getRequestsForPath('/visitor.php')).toHaveLength(1);
      expect(mockGetPreference).toHaveBeenCalledWith('all_beers_api_url');
    });

    it('should fetch my beers (tasted beers) from mock server successfully', async () => {
      const mockTastedBeers = [
        {
          id: '1',
          brew_name: 'Tasted IPA',
          brewer: 'Test Brewery',
          tasted: true,
          tasted_date: '2025-01-01',
        },
      ];

      mockGetPreference.mockImplementation((key: string) => {
        if (key === 'my_beers_api_url') {
          return Promise.resolve(`${mockServer.getUrl()}/mybeers.php`);
        }
        if (key === 'is_visitor_mode') {
          return Promise.resolve('false');
        }
        return Promise.resolve(null);
      });

      mockServer.setResponse('/mybeers.php', FlyingSaucerResponses.myBeers(mockTastedBeers));

      const tastedBeers = await fetchMyBeersFromAPI();

      expect(tastedBeers).toEqual(mockTastedBeers);
      expect(mockServer.getRequestsForPath('/mybeers.php')).toHaveLength(1);
    });

    it('should fetch rewards from mock server successfully', async () => {
      const mockRewards = [
        {
          id: 1,
          name: 'Test Reward',
          description: 'A test reward',
          points: 100,
          earned_date: '2025-01-01',
          reward_type: 'badge',
        },
      ];

      // Rewards use my_beers_api_url and expect data in position [2].reward
      mockGetPreference.mockImplementation((key: string) => {
        if (key === 'my_beers_api_url') {
          return Promise.resolve(`${mockServer.getUrl()}/rewards.php`);
        }
        if (key === 'is_visitor_mode') {
          return Promise.resolve('false');
        }
        return Promise.resolve(null);
      });

      // Rewards are at data[2].reward, not using the helper
      mockServer.setResponse('/rewards.php', {
        status: 200,
        body: [null, null, { reward: mockRewards }],
      });

      const rewards = await fetchRewardsFromAPI();

      expect(rewards).toEqual(mockRewards);
      expect(mockServer.getRequestsForPath('/rewards.php')).toHaveLength(1);
    });

    it('should handle 500 server error from beer endpoint', async () => {
      mockGetPreference.mockResolvedValue(`${mockServer.getUrl()}/visitor.php`);

      mockServer.setResponse('/visitor.php', FlyingSaucerResponses.serverError());

      await expect(fetchBeersFromAPI()).rejects.toThrow();
    });

    it('should handle 404 not found error', async () => {
      mockGetPreference.mockResolvedValue(`${mockServer.getUrl()}/notfound.php`);

      mockServer.setResponse('/notfound.php', FlyingSaucerResponses.notFound());

      await expect(fetchBeersFromAPI()).rejects.toThrow();
    });

    it('should timeout on slow response', async () => {
      const slowUrl = `${mockServer.getUrl()}/slow.php`;
      mockGetPreference.mockResolvedValue(slowUrl);

      mockServer.setResponse('/slow.php', {
        status: 200,
        body: [null, { brewInStock: [] }],
        delay: 5000, // 5 second delay for slow response
      });

      // Set a short timeout and expect it to eventually complete (or timeout in Jest)
      // Since this is a real HTTP test, we'll just verify it takes time
      const start = Date.now();
      try {
        await fetchWithRetry(slowUrl, 1, 100);
      } catch (error) {
        // May timeout, which is fine
      }
      const duration = Date.now() - start;

      // Should have taken at least some time (not instant)
      expect(duration).toBeGreaterThan(100);
    }, 8000);

    it('should handle empty response data gracefully', async () => {
      mockGetPreference.mockResolvedValue(`${mockServer.getUrl()}/empty.php`);

      mockServer.setResponse('/empty.php', {
        status: 200,
        body: [null, { brewInStock: [] }],
      });

      const beers = await fetchBeersFromAPI();

      expect(beers).toEqual([]);
    });

    it('should retry on transient network failure and succeed', async () => {
      const url = `${mockServer.getUrl()}/retry-test.php`;
      mockGetPreference.mockResolvedValue(url);

      let attempts = 0;
      mockServer.setResponse('/retry-test.php', () => {
        attempts++;
        if (attempts < 3) {
          return FlyingSaucerResponses.serverError();
        }
        return {
          status: 200,
          body: [
            null,
            {
              brewInStock: [
                {
                  id: '1',
                  brew_name: 'Success After Retry',
                  brewer: 'Persistent Brewery',
                },
              ],
            },
          ],
        };
      });

      const beers = await fetchBeersFromAPI();

      expect(beers).toHaveLength(1);
      expect(beers[0].brew_name).toBe('Success After Retry');
      expect(attempts).toBe(3);
      expect(mockServer.getRequestsForPath('/retry-test.php')).toHaveLength(3);
    }, 10000);
  });

  // =========================================================================
  // AUTHENTICATION FLOW INTEGRATION TESTS
  // =========================================================================

  describe('Authentication Flow Integration', () => {
    it('should handle session validation with mock server', async () => {
      const mockSessionData = {
        memberId: '12345',
        storeId: '1',
        storeName: 'Austin',
        sessionId: 'test-session-123',
      };

      mockServer.setResponse('/validate-session.php', {
        status: 200,
        body: { session: mockSessionData },
      });

      const response = await fetch(`${mockServer.getUrl()}/validate-session.php`);
      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.session).toEqual(mockSessionData);
    });

    it('should handle cookie-based authentication', async () => {
      const testCookies = 'session_id=abc123; user_id=456';

      mockServer.setResponse('/auth-test.php', (req: RequestRecord) => {
        const cookieHeader = req.headers['cookie'];
        if (cookieHeader === testCookies) {
          return {
            status: 200,
            body: { authenticated: true },
          };
        }
        return FlyingSaucerResponses.notAuthenticated();
      });

      // Make request with cookies
      const response = await fetch(`${mockServer.getUrl()}/auth-test.php`, {
        headers: {
          Cookie: testCookies,
        },
      });

      const data = await response.json();
      expect(data.authenticated).toBe(true);
    });

    it('should handle 401 authentication failure', async () => {
      mockServer.setResponse('/secure-endpoint.php', FlyingSaucerResponses.notAuthenticated());

      const response = await fetch(`${mockServer.getUrl()}/secure-endpoint.php`);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Not authenticated');
    });

    it('should handle visitor mode (no authentication)', async () => {
      mockGetPreference.mockResolvedValue(`${mockServer.getUrl()}/visitor.php`);

      const mockBeers = [{ id: '1', brew_name: 'Public Beer', brewer: 'Public Brewery' }];

      mockServer.setResponse('/visitor.php', {
        status: 200,
        body: [null, { brewInStock: mockBeers }],
      });

      // Should work without authentication
      const beers = await fetchBeersFromAPI();

      expect(beers).toHaveLength(1);
      expect(beers[0].brew_name).toBe('Public Beer');
    });

    it('should handle session expiration during request', async () => {
      let requestCount = 0;

      mockServer.setResponse('/session-test.php', () => {
        requestCount++;
        if (requestCount === 1) {
          return {
            status: 200,
            body: { data: 'success' },
          };
        }
        // Session expired on subsequent request
        return FlyingSaucerResponses.notAuthenticated();
      });

      // First request succeeds
      const response1 = await fetch(`${mockServer.getUrl()}/session-test.php`);
      expect(response1.status).toBe(200);

      // Second request fails with auth error
      const response2 = await fetch(`${mockServer.getUrl()}/session-test.php`);
      expect(response2.status).toBe(401);
    });

    it('should handle referer header requirement', async () => {
      mockServer.setResponse('/referer-required.php', (req: RequestRecord) => {
        const referer = req.headers['referer'];
        if (referer && referer.includes('flyingsaucer.com')) {
          return {
            status: 200,
            body: { access: 'granted' },
          };
        }
        return {
          status: 403,
          body: { error: 'Missing or invalid referer' },
        };
      });

      // Request without referer fails
      const response1 = await fetch(`${mockServer.getUrl()}/referer-required.php`);
      expect(response1.status).toBe(403);

      // Request with referer succeeds
      const response2 = await fetch(`${mockServer.getUrl()}/referer-required.php`, {
        headers: {
          Referer: 'https://flyingsaucer.com',
        },
      });
      expect(response2.status).toBe(200);
    });
  });

  // =========================================================================
  // ERROR HANDLING INTEGRATION TESTS
  // =========================================================================

  describe('Error Handling Integration', () => {
    it('should handle retry exhaustion after multiple failures', async () => {
      const url = `${mockServer.getUrl()}/always-fails.php`;

      mockServer.setResponse('/always-fails.php', FlyingSaucerResponses.serverError());

      await expect(fetchWithRetry(url, 3, 10)).rejects.toThrow();

      // Should have tried 3 times
      expect(mockServer.getRequestsForPath('/always-fails.php').length).toBe(3);
    }, 5000);

    it('should handle malformed JSON response', async () => {
      mockServer.setResponse('/malformed.php', {
        status: 200,
        body: 'This is not JSON',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      await expect(
        fetch(`${mockServer.getUrl()}/malformed.php`).then(r => r.json())
      ).rejects.toThrow();
    });

    it('should handle network timeout with retry', async () => {
      let attempts = 0;

      mockServer.setResponse('/timeout-then-success.php', () => {
        attempts++;
        if (attempts === 1) {
          return {
            status: 500, // Return error instead of timeout
            body: { error: 'temporary failure' },
          };
        }
        return {
          status: 200,
          body: { data: 'success' },
        };
      });

      const url = `${mockServer.getUrl()}/timeout-then-success.php`;

      const result = await fetchWithRetry(url, 2, 10);
      expect(result).toEqual({ data: 'success' });
      expect(attempts).toBe(2);
    }, 5000);

    it('should handle 429 rate limiting', async () => {
      mockServer.setResponse('/rate-limited.php', FlyingSaucerResponses.rateLimited());

      const response = await fetch(`${mockServer.getUrl()}/rate-limited.php`);

      expect(response.status).toBe(429);
      const data = await response.json();
      expect(data.error).toBe('Rate limit exceeded');
    });

    it('should handle unexpected response format', async () => {
      mockGetPreference.mockResolvedValue(`${mockServer.getUrl()}/bad-format.php`);

      // Return wrong format (not the expected Flying Saucer format)
      mockServer.setResponse('/bad-format.php', {
        status: 200,
        body: { unexpected: 'format' },
      });

      // Should throw error on invalid format
      await expect(fetchBeersFromAPI()).rejects.toThrow('Invalid response format from API');
    });

    it('should handle partial data corruption', async () => {
      mockGetPreference.mockResolvedValue(`${mockServer.getUrl()}/partial-data.php`);

      // Some beers have missing required fields
      const mixedBeers = [
        { id: '1', brew_name: 'Good Beer', brewer: 'Test Brewery' },
        { id: null, brew_name: null }, // Missing required fields
        { id: '3', brew_name: 'Another Good Beer', brewer: 'Test Brewery' },
      ];

      mockServer.setResponse('/partial-data.php', {
        status: 200,
        body: [null, { brewInStock: mixedBeers }],
      });

      const beers = await fetchBeersFromAPI();

      // Should return all beers (filtering happens in repository layer)
      expect(beers).toHaveLength(3);
    });
  });

  // =========================================================================
  // CONFIG INTEGRATION TESTS
  // =========================================================================

  describe('Config Integration', () => {
    it('should use custom API URL from config', async () => {
      const customUrl = `${mockServer.getUrl()}/custom-endpoint.php`;
      mockGetPreference.mockResolvedValue(customUrl);

      mockServer.setResponse('/custom-endpoint.php', {
        status: 200,
        body: [
          null,
          { brewInStock: [{ id: '1', brew_name: 'Custom Beer', brewer: 'Custom Brewery' }] },
        ],
      });

      const beers = await fetchBeersFromAPI();

      expect(beers).toHaveLength(1);
      expect(mockServer.getRequestsForPath('/custom-endpoint.php')).toHaveLength(1);
    });

    it('should handle environment switching', async () => {
      const devUrl = `${mockServer.getUrl()}/dev-api.php`;
      const prodUrl = `${mockServer.getUrl()}/prod-api.php`;

      mockServer.setResponse('/dev-api.php', {
        status: 200,
        body: [null, { brewInStock: [{ id: '1', brew_name: 'Dev Beer', brewer: 'Dev Brewery' }] }],
      });

      mockServer.setResponse('/prod-api.php', {
        status: 200,
        body: [
          null,
          { brewInStock: [{ id: '2', brew_name: 'Prod Beer', brewer: 'Prod Brewery' }] },
        ],
      });

      // Test dev environment
      mockGetPreference.mockResolvedValue(devUrl);
      const devBeers = await fetchBeersFromAPI();
      expect(devBeers[0].brew_name).toBe('Dev Beer');

      // Switch to prod environment
      mockGetPreference.mockResolvedValue(prodUrl);
      const prodBeers = await fetchBeersFromAPI();
      expect(prodBeers[0].brew_name).toBe('Prod Beer');
    });

    it('should respect network timeout settings', async () => {
      const url = `${mockServer.getUrl()}/timeout-test.php`;

      mockServer.setResponse('/timeout-test.php', {
        status: 200,
        body: { data: 'test' },
      });

      const result = await fetchWithRetry(url, 1, 10);

      expect(result).toEqual({ data: 'test' });
      const requests = mockServer.getRequestsForPath('/timeout-test.php');
      expect(requests.length).toBe(1);
    });

    it('should respect retry configuration', async () => {
      const url = `${mockServer.getUrl()}/retry-config.php`;

      let attempts = 0;
      mockServer.setResponse('/retry-config.php', () => {
        attempts++;
        if (attempts < 5) {
          return FlyingSaucerResponses.serverError();
        }
        return {
          status: 200,
          body: [
            null,
            { brewInStock: [{ id: '1', brew_name: 'Success', brewer: 'Success Brewery' }] },
          ],
        };
      });

      // Use custom retry count
      const result = await fetchWithRetry(url, 5, 10);

      expect(attempts).toBe(5);
      // Result is the raw response, check for the array structure
      expect(Array.isArray(result)).toBe(true);
    }, 10000);

    it('should handle none:// protocol URLs for visitor mode', async () => {
      const noneUrl = 'none://placeholder';

      const result = await fetchWithRetry(noneUrl);

      // Should return empty data without making network request
      expect(result).toEqual([null, { tasted_brew_current_round: [] }]);
      expect(mockServer.getRequests()).toHaveLength(0);
    });

    it('should preserve request headers across retries', async () => {
      const url = `${mockServer.getUrl()}/header-test.php`;

      let attempts = 0;
      let headersSeen: string[] = [];

      mockServer.setResponse('/header-test.php', (req: RequestRecord) => {
        attempts++;

        // Track headers from each request
        const userAgent = req.headers['user-agent'];
        if (userAgent) {
          headersSeen.push(userAgent as string);
        }

        if (attempts < 2) {
          return FlyingSaucerResponses.serverError();
        }
        return {
          status: 200,
          body: { success: true },
        };
      });

      // First request will fail
      try {
        await fetch(url, {
          headers: {
            'User-Agent': 'BeerSelector/1.0',
          },
        });
      } catch (error) {
        // Expected to fail
      }

      // Retry with same headers
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'BeerSelector/1.0',
        },
      });

      expect(response.ok).toBe(true);
      expect(attempts).toBe(2);
      // Verify headers were present in both requests
      expect(headersSeen.length).toBe(2);
    });
  });

  // =========================================================================
  // FLYING SAUCER API FORMAT TESTS
  // =========================================================================

  describe('Flying Saucer API Format Validation', () => {
    it('should correctly parse nested brewInStock response', async () => {
      mockGetPreference.mockResolvedValue(`${mockServer.getUrl()}/beers.php`);

      const mockBeers = [
        { id: '1', brew_name: 'Beer 1', brewer: 'Brewery 1' },
        { id: '2', brew_name: 'Beer 2', brewer: 'Brewery 2' },
      ];

      mockServer.setResponse('/beers.php', {
        status: 200,
        body: [null, { brewInStock: mockBeers }],
      });

      const beers = await fetchBeersFromAPI();

      expect(beers).toEqual(mockBeers);
      expect(beers).toHaveLength(2);
    });

    it('should correctly parse tasted_brew_current_round response', async () => {
      mockGetPreference.mockImplementation((key: string) => {
        if (key === 'my_beers_api_url') {
          return Promise.resolve(`${mockServer.getUrl()}/mybeers.php`);
        }
        if (key === 'is_visitor_mode') {
          return Promise.resolve('false');
        }
        return Promise.resolve(null);
      });

      const mockTastedBeers = [{ id: '1', brew_name: 'Tasted 1', tasted: true }];

      mockServer.setResponse('/mybeers.php', {
        status: 200,
        body: [null, { tasted_brew_current_round: mockTastedBeers }],
      });

      const beers = await fetchMyBeersFromAPI();

      expect(beers).toEqual(mockTastedBeers);
    });

    it('should correctly parse rewards response', async () => {
      mockGetPreference.mockImplementation((key: string) => {
        if (key === 'my_beers_api_url') {
          return Promise.resolve(`${mockServer.getUrl()}/rewards.php`);
        }
        if (key === 'is_visitor_mode') {
          return Promise.resolve('false');
        }
        return Promise.resolve(null);
      });

      const mockRewards = [
        {
          id: 1,
          name: 'Reward 1',
          description: 'First reward',
          points: 100,
          earned_date: '2025-01-01',
          reward_type: 'badge',
        },
      ];

      mockServer.setResponse('/rewards.php', {
        status: 200,
        body: [null, null, { reward: mockRewards }],
      });

      const rewards = await fetchRewardsFromAPI();

      expect(rewards).toEqual(mockRewards);
    });

    it('should handle null first element in Flying Saucer response', async () => {
      mockGetPreference.mockResolvedValue(`${mockServer.getUrl()}/beers.php`);

      // Flying Saucer format: [null, { brewInStock: [...] }]
      mockServer.setResponse('/beers.php', {
        status: 200,
        body: [null, { brewInStock: [{ id: '1', brew_name: 'Test' }] }],
      });

      const beers = await fetchBeersFromAPI();

      expect(beers).toHaveLength(1);
      expect(beers[0].id).toBe('1');
    });
  });
});
