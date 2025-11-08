/**
 * Comprehensive tests for beerApi module
 */

import { fetchWithRetry, fetchBeersFromAPI, fetchMyBeersFromAPI, fetchRewardsFromAPI } from '../beerApi';
import * as preferences from '../../database/preferences';

// Mock the preferences module
jest.mock('../../database/preferences');

// Mock global fetch
global.fetch = jest.fn();

describe('Beer API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
        json: async () => mockData
      });

      const resultPromise = fetchWithRetry('https://example.com/api');
      const result = await resultPromise;

      expect(global.fetch).toHaveBeenCalledWith('https://example.com/api');
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
          json: async () => mockData
        });

      const resultPromise = fetchWithRetry('https://example.com/api', 2, 10);

      // Fast-forward time to trigger retry
      await jest.advanceTimersByTimeAsync(15);

      const result = await resultPromise;

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual(mockData);
    });

    it('should throw error after exhausting retries', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const resultPromise = fetchWithRetry('https://example.com/api', 1, 10);

      await expect(resultPromise).rejects.toThrow('Network error');
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should throw error on non-ok HTTP status', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });

      const resultPromise = fetchWithRetry('https://example.com/api', 1, 10);

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
        { id: '2', brew_name: 'Test Beer 2', brewer: 'Test Brewery' }
      ];
      const mockResponse = [
        {},
        { brewInStock: mockBeers }
      ];

      (preferences.getPreference as jest.Mock).mockResolvedValue('https://example.com/api');
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const result = await fetchBeersFromAPI();

      expect(result).toEqual(mockBeers);
      expect(preferences.getPreference).toHaveBeenCalledWith('all_beers_api_url');
    });

    it('should find beers in nested object structure', async () => {
      const mockBeers = [
        { id: '1', brew_name: 'Test Beer', brewer: 'Test Brewery' }
      ];
      const mockResponse = {
        data: {
          beers: mockBeers
        }
      };

      (preferences.getPreference as jest.Mock).mockResolvedValue('https://example.com/api');
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const result = await fetchBeersFromAPI();

      expect(result).toEqual(mockBeers);
    });

    it('should throw error when no beer data found in response', async () => {
      const mockResponse = { someOtherData: 'value' };

      (preferences.getPreference as jest.Mock).mockResolvedValue('https://example.com/api');
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      await expect(fetchBeersFromAPI()).rejects.toThrow('Invalid response format from API');
    });

    it('should propagate fetch errors', async () => {
      (preferences.getPreference as jest.Mock).mockResolvedValue('https://example.com/api');
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

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
        { id: '2', brew_name: 'Tasted Beer 2', brewer: 'Test Brewery' }
      ];
      const mockResponse = [
        {},
        { tasted_brew_current_round: mockBeers },
        {}
      ];

      (preferences.getPreference as jest.Mock).mockImplementation((key: string) => {
        if (key === 'is_visitor_mode') return Promise.resolve('false');
        if (key === 'my_beers_api_url') return Promise.resolve('https://example.com/mybeers');
        return Promise.resolve(null);
      });
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const result = await fetchMyBeersFromAPI();

      expect(result).toEqual(mockBeers);
      expect(preferences.getPreference).toHaveBeenCalledWith('my_beers_api_url');
    });

    it('should handle empty tasted beers array as valid state', async () => {
      const mockResponse = [
        {},
        { tasted_brew_current_round: [] },
        {}
      ];

      (preferences.getPreference as jest.Mock).mockImplementation((key: string) => {
        if (key === 'is_visitor_mode') return Promise.resolve('false');
        if (key === 'my_beers_api_url') return Promise.resolve('https://example.com/mybeers');
        return Promise.resolve(null);
      });
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const result = await fetchMyBeersFromAPI();

      expect(result).toEqual([]);
    });

    it('should filter out beers without IDs', async () => {
      const mockBeers = [
        { id: '1', brew_name: 'Valid Beer' },
        { brew_name: 'Invalid Beer No ID' },
        { id: '2', brew_name: 'Another Valid Beer' }
      ];
      const mockResponse = [
        {},
        { tasted_brew_current_round: mockBeers },
        {}
      ];

      (preferences.getPreference as jest.Mock).mockImplementation((key: string) => {
        if (key === 'is_visitor_mode') return Promise.resolve('false');
        if (key === 'my_beers_api_url') return Promise.resolve('https://example.com/mybeers');
        return Promise.resolve(null);
      });
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
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
        if (key === 'my_beers_api_url') return Promise.resolve('https://example.com/mybeers');
        return Promise.resolve(null);
      });
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      await expect(fetchMyBeersFromAPI()).rejects.toThrow('Invalid response format from My Beers API');
    });

    it('should propagate fetch errors', async () => {
      (preferences.getPreference as jest.Mock).mockImplementation((key: string) => {
        if (key === 'is_visitor_mode') return Promise.resolve('false');
        if (key === 'my_beers_api_url') return Promise.resolve('https://example.com/mybeers');
        return Promise.resolve(null);
      });
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

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
        { reward_id: '2', redeemed: 'true', reward_type: 'shirt' }
      ];
      const mockResponse = [
        {},
        { tasted_brew_current_round: [] },
        { reward: mockRewards }
      ];

      (preferences.getPreference as jest.Mock).mockImplementation((key: string) => {
        if (key === 'is_visitor_mode') return Promise.resolve('false');
        if (key === 'my_beers_api_url') return Promise.resolve('https://example.com/mybeers');
        return Promise.resolve(null);
      });
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const result = await fetchRewardsFromAPI();

      expect(result).toEqual(mockRewards);
      expect(preferences.getPreference).toHaveBeenCalledWith('my_beers_api_url');
    });

    it('should throw error on invalid response format', async () => {
      const mockResponse = { someOtherData: 'value' };

      (preferences.getPreference as jest.Mock).mockImplementation((key: string) => {
        if (key === 'is_visitor_mode') return Promise.resolve('false');
        if (key === 'my_beers_api_url') return Promise.resolve('https://example.com/mybeers');
        return Promise.resolve(null);
      });
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      await expect(fetchRewardsFromAPI()).rejects.toThrow('Invalid response format from Rewards API');
    });

    it('should propagate fetch errors', async () => {
      (preferences.getPreference as jest.Mock).mockImplementation((key: string) => {
        if (key === 'is_visitor_mode') return Promise.resolve('false');
        if (key === 'my_beers_api_url') return Promise.resolve('https://example.com/mybeers');
        return Promise.resolve(null);
      });
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      await expect(fetchRewardsFromAPI()).rejects.toThrow('Network error');
    });
  });
});
