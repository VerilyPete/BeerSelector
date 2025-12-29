/**
 * Comprehensive tests for beerApi module
 *
 * This test suite validates the beerApi functions for fetching beers,
 * tasted beers, and rewards from the Flying Saucer API.
 */

// Speed up retry tests by setting shorter delay BEFORE config is loaded
import {
  fetchWithRetry,
  fetchBeersFromAPI,
  fetchMyBeersFromAPI,
  fetchRewardsFromAPI,
} from '../beerApi';
import * as preferences from '../../database/preferences';
import { config } from '@/src/config';

process.env.EXPO_PUBLIC_API_RETRY_DELAY = '10';

// Mock the preferences module
jest.mock('../../database/preferences');

// Mock global fetch
global.fetch = jest.fn();

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

      expect(global.fetch).toHaveBeenCalledWith(config.api.baseUrl);
      expect(result).toEqual(mockData);
    });

    it('should handle none:// protocol URLs by returning empty data', async () => {
      const resultPromise = fetchWithRetry('none://placeholder');
      const result = await resultPromise;

      expect(global.fetch).not.toHaveBeenCalled();
      expect(result).toEqual([null, { tasted_brew_current_round: [] }]);
    });

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

      await expect(resultPromise).rejects.toThrow('Failed to fetch: 404 Not Found');
    });
  });

  describe('fetchBeersFromAPI', () => {
    it('should return empty array when API URL is not configured', async () => {
      (preferences.getPreference as jest.Mock).mockResolvedValue(null);

      const result = await fetchBeersFromAPI();

      expect(result).toEqual([]);
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

      expect(result).toEqual(mockBeers);
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

      expect(result).toEqual(mockBeers);
    });

    it('should throw error when no beer data found in response', async () => {
      const mockResponse = { someOtherData: 'value' };

      (preferences.getPreference as jest.Mock).mockResolvedValue(config.api.baseUrl);
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      await expect(fetchBeersFromAPI()).rejects.toThrow('Invalid response format from API');
    });

    it('should propagate fetch errors', async () => {
      (preferences.getPreference as jest.Mock).mockResolvedValue(config.api.baseUrl);
      // Mock fetch to always reject
      (global.fetch as jest.Mock).mockImplementation(() =>
        Promise.reject(new Error('Network error'))
      );

      await expect(fetchBeersFromAPI()).rejects.toThrow('Network error');
    });
  });

  describe('fetchMyBeersFromAPI', () => {
    it('should return empty array in visitor mode', async () => {
      (preferences.getPreference as jest.Mock).mockImplementation((key: string) => {
        if (key === 'is_visitor_mode') return Promise.resolve('true');
        return Promise.resolve(null);
      });

      const result = await fetchMyBeersFromAPI();

      expect(result).toEqual([]);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should return empty array when API URL is not configured', async () => {
      (preferences.getPreference as jest.Mock).mockImplementation((key: string) => {
        if (key === 'is_visitor_mode') return Promise.resolve('false');
        if (key === 'my_beers_api_url') return Promise.resolve(null);
        return Promise.resolve(null);
      });

      const result = await fetchMyBeersFromAPI();

      expect(result).toEqual([]);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should return empty array for none:// protocol URLs', async () => {
      (preferences.getPreference as jest.Mock).mockImplementation((key: string) => {
        if (key === 'is_visitor_mode') return Promise.resolve('false');
        if (key === 'my_beers_api_url') return Promise.resolve('none://placeholder');
        return Promise.resolve(null);
      });

      const result = await fetchMyBeersFromAPI();

      expect(result).toEqual([]);
      expect(global.fetch).not.toHaveBeenCalled();
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

      expect(result).toEqual(mockBeers);
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

      expect(result).toEqual([]);
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

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('1');
      expect(result[1].id).toBe('2');
    });

    it('should throw error on invalid response format', async () => {
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

      await expect(fetchMyBeersFromAPI()).rejects.toThrow(
        'Invalid response format from My Beers API'
      );
    });

    it('should propagate fetch errors', async () => {
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

      await expect(fetchMyBeersFromAPI()).rejects.toThrow('Network error');
    });
  });

  describe('fetchRewardsFromAPI', () => {
    it('should return empty array in visitor mode', async () => {
      (preferences.getPreference as jest.Mock).mockImplementation((key: string) => {
        if (key === 'is_visitor_mode') return Promise.resolve('true');
        return Promise.resolve(null);
      });

      const result = await fetchRewardsFromAPI();

      expect(result).toEqual([]);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should return empty array when API URL is not configured', async () => {
      (preferences.getPreference as jest.Mock).mockImplementation((key: string) => {
        if (key === 'is_visitor_mode') return Promise.resolve('false');
        if (key === 'my_beers_api_url') return Promise.resolve(null);
        return Promise.resolve(null);
      });

      const result = await fetchRewardsFromAPI();

      expect(result).toEqual([]);
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

      expect(result).toEqual(mockRewards);
      expect(preferences.getPreference).toHaveBeenCalledWith('my_beers_api_url');
    });

    it('should throw error on invalid response format', async () => {
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

      await expect(fetchRewardsFromAPI()).rejects.toThrow(
        'Invalid response format from Rewards API'
      );
    });

    it('should propagate fetch errors', async () => {
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

      await expect(fetchRewardsFromAPI()).rejects.toThrow('Network error');
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
        expect(global.fetch).toHaveBeenCalledWith(config.api.baseUrl);
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
        expect(global.fetch).toHaveBeenCalledWith(config.api.getFullUrl('memberDashboard'));
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
