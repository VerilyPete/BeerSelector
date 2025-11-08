import { fetchBeersFromAPI, fetchMyBeersFromAPI, fetchRewardsFromAPI } from '../beerApi';
import * as preferences from '../../database/preferences';

// Mock the preferences module
jest.mock('../../database/preferences');

// Mock global fetch
global.fetch = jest.fn();

describe('Beer API Fetch Functions', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();

    // Spy on console methods
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    // Reset fetch mock
    (global.fetch as jest.Mock).mockReset();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('fetchBeersFromAPI', () => {
    it('should fetch beers from API with standard brewInStock format', async () => {
      const mockBeers = [
        { id: '1', brew_name: 'Test IPA', brewer: 'Test Brewery', brew_style: 'IPA' },
        { id: '2', brew_name: 'Test Lager', brewer: 'Test Brewery 2', brew_style: 'Lager' }
      ];
      const mockResponse = [{}, { brewInStock: mockBeers }];

      (preferences.getPreference as jest.Mock).mockResolvedValue('https://api.example.com/beers');
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockResponse)
      });

      const result = await fetchBeersFromAPI();

      expect(preferences.getPreference).toHaveBeenCalledWith('all_beers_api_url');
      expect(global.fetch).toHaveBeenCalledWith('https://api.example.com/beers');
      expect(result).toEqual(mockBeers);
      expect(result.length).toBe(2);
    });

    it('should return empty array when API URL is not configured', async () => {
      (preferences.getPreference as jest.Mock).mockResolvedValue(null);

      const result = await fetchBeersFromAPI();

      expect(result).toEqual([]);
      expect(global.fetch).not.toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith('All beers API URL not found in preferences');
    });

    it('should find beers array in nested response structure', async () => {
      const mockBeers = [
        { id: '1', brew_name: 'Nested Beer 1', brewer: 'Nested Brewery' }
      ];
      const mockResponse = {
        data: {
          beers: mockBeers
        }
      };

      (preferences.getPreference as jest.Mock).mockResolvedValue('https://api.example.com/beers');
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockResponse)
      });

      const result = await fetchBeersFromAPI();

      expect(result).toEqual(mockBeers);
    });

    it('should find beers by detecting beer-like objects in array', async () => {
      const mockBeers = [
        { id: '1', brew_name: 'Direct Beer', brewer: 'Direct Brewery' },
        { id: '2', brew_name: 'Another Beer', brewer: 'Another Brewery' }
      ];

      (preferences.getPreference as jest.Mock).mockResolvedValue('https://api.example.com/beers');
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue([{}, mockBeers])
      });

      const result = await fetchBeersFromAPI();

      expect(result).toEqual(mockBeers);
    });

    it('should throw error when response format is invalid', async () => {
      const mockResponse = { invalid: 'format' };

      (preferences.getPreference as jest.Mock).mockResolvedValue('https://api.example.com/beers');
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockResponse)
      });

      await expect(fetchBeersFromAPI()).rejects.toThrow('Invalid response format from API');
      expect(consoleErrorSpy).toHaveBeenCalledWith('Could not find beer data in API response');
    });

    it('should retry on network failure and succeed on retry', async () => {
      const mockBeers = [{ id: '1', brew_name: 'Retry Beer', brewer: 'Retry Brewery' }];
      const mockResponse = [{}, { brewInStock: mockBeers }];

      (preferences.getPreference as jest.Mock).mockResolvedValue('https://api.example.com/beers');

      // First call fails, second succeeds
      (global.fetch as jest.Mock)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue(mockResponse)
        });

      const result = await fetchBeersFromAPI();

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual(mockBeers);
    });

    it('should throw error after all retry attempts fail', async () => {
      (preferences.getPreference as jest.Mock).mockResolvedValue('https://api.example.com/beers');
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      await expect(fetchBeersFromAPI()).rejects.toThrow('Network error');
      expect(global.fetch).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should handle HTTP error status codes', async () => {
      (preferences.getPreference as jest.Mock).mockResolvedValue('https://api.example.com/beers');
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      await expect(fetchBeersFromAPI()).rejects.toThrow('Failed to fetch: 500 Internal Server Error');
      expect(global.fetch).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should handle malformed JSON response', async () => {
      (preferences.getPreference as jest.Mock).mockResolvedValue('https://api.example.com/beers');
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockRejectedValue(new Error('Invalid JSON'))
      });

      await expect(fetchBeersFromAPI()).rejects.toThrow('Invalid JSON');
    });
  });

  describe('fetchMyBeersFromAPI', () => {
    it('should fetch my beers from API in standard format', async () => {
      const mockMyBeers = [
        {
          id: '1',
          brew_name: 'Tasted IPA',
          brewer: 'Test Brewery',
          tasted_date: '01/15/2025',
          chit_code: '123-456-789'
        },
        {
          id: '2',
          brew_name: 'Tasted Lager',
          brewer: 'Test Brewery 2',
          tasted_date: '01/16/2025',
          chit_code: '123-456-790'
        }
      ];
      const mockResponse = [{}, { tasted_brew_current_round: mockMyBeers }, {}];

      (preferences.getPreference as jest.Mock)
        .mockResolvedValueOnce('false') // is_visitor_mode
        .mockResolvedValueOnce('https://api.example.com/mybeers'); // my_beers_api_url

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockResponse)
      });

      const result = await fetchMyBeersFromAPI();

      expect(result).toEqual(mockMyBeers);
      expect(result.length).toBe(2);
    });

    it('should return empty array in visitor mode without making API call', async () => {
      (preferences.getPreference as jest.Mock).mockResolvedValue('true'); // is_visitor_mode

      const result = await fetchMyBeersFromAPI();

      expect(result).toEqual([]);
      expect(global.fetch).not.toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(
        'DB: In visitor mode - fetchMyBeersFromAPI returning empty array without making network request'
      );
    });

    it('should return empty array when API URL is not configured', async () => {
      (preferences.getPreference as jest.Mock)
        .mockResolvedValueOnce('false') // is_visitor_mode
        .mockResolvedValueOnce(null); // my_beers_api_url

      const result = await fetchMyBeersFromAPI();

      expect(result).toEqual([]);
      expect(global.fetch).not.toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith('DB: My beers API URL not found in preferences');
    });

    it('should return empty array for none:// protocol URL', async () => {
      (preferences.getPreference as jest.Mock)
        .mockResolvedValueOnce('false') // is_visitor_mode
        .mockResolvedValueOnce('none://placeholder'); // my_beers_api_url

      const result = await fetchMyBeersFromAPI();

      expect(result).toEqual([]);
      expect(global.fetch).not.toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(
        'DB: Detected none:// protocol in my_beers_api_url, returning empty array'
      );
    });

    it('should return empty array when tasted_brew_current_round is empty (new user)', async () => {
      const mockResponse = [{}, { tasted_brew_current_round: [] }, {}];

      (preferences.getPreference as jest.Mock)
        .mockResolvedValueOnce('false')
        .mockResolvedValueOnce('https://api.example.com/mybeers');

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockResponse)
      });

      const result = await fetchMyBeersFromAPI();

      expect(result).toEqual([]);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        'DB: Empty tasted beers array - user has no tasted beers in current round (new user or round rollover at 200 beers)'
      );
    });

    it('should filter out beers without IDs and return valid beers', async () => {
      const mockMyBeers = [
        { id: '1', brew_name: 'Valid Beer 1', brewer: 'Brewery 1' },
        { brew_name: 'Invalid Beer - No ID', brewer: 'Brewery 2' }, // Missing ID
        { id: '2', brew_name: 'Valid Beer 2', brewer: 'Brewery 3' },
        null, // Invalid beer
      ];
      const mockResponse = [{}, { tasted_brew_current_round: mockMyBeers }, {}];

      (preferences.getPreference as jest.Mock)
        .mockResolvedValueOnce('false')
        .mockResolvedValueOnce('https://api.example.com/mybeers');

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockResponse)
      });

      const result = await fetchMyBeersFromAPI();

      expect(result.length).toBe(2);
      expect(result[0].id).toBe('1');
      expect(result[1].id).toBe('2');
      expect(consoleLogSpy).toHaveBeenCalledWith(
        'DB: Found 2 valid beers with IDs and 2 invalid beers without IDs'
      );
    });

    it('should return empty array when all beers are invalid (no IDs)', async () => {
      const mockMyBeers = [
        { brew_name: 'No ID 1', brewer: 'Brewery 1' },
        { brew_name: 'No ID 2', brewer: 'Brewery 2' },
      ];
      const mockResponse = [{}, { tasted_brew_current_round: mockMyBeers }, {}];

      (preferences.getPreference as jest.Mock)
        .mockResolvedValueOnce('false')
        .mockResolvedValueOnce('https://api.example.com/mybeers');

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockResponse)
      });

      const result = await fetchMyBeersFromAPI();

      expect(result).toEqual([]);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        'DB: No valid beers with IDs found in response, but returning empty array instead of error'
      );
    });

    it('should throw error for invalid response format', async () => {
      const mockResponse = { invalid: 'format' };

      (preferences.getPreference as jest.Mock)
        .mockResolvedValueOnce('false')
        .mockResolvedValueOnce('https://api.example.com/mybeers');

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockResponse)
      });

      await expect(fetchMyBeersFromAPI()).rejects.toThrow('Invalid response format from My Beers API');
      expect(consoleErrorSpy).toHaveBeenCalledWith('DB: Invalid response format from My Beers API');
    });

    it('should retry on network failure', async () => {
      const mockMyBeers = [{ id: '1', brew_name: 'Retry Beer', brewer: 'Retry Brewery' }];
      const mockResponse = [{}, { tasted_brew_current_round: mockMyBeers }, {}];

      (preferences.getPreference as jest.Mock)
        .mockResolvedValue('false')
        .mockResolvedValue('https://api.example.com/mybeers');

      (global.fetch as jest.Mock)
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue(mockResponse)
        });

      const result = await fetchMyBeersFromAPI();

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual(mockMyBeers);
    });
  });

  describe('fetchRewardsFromAPI', () => {
    it('should fetch rewards from API in standard format', async () => {
      const mockRewards = [
        { reward_id: '1', redeemed: '0', reward_type: '$5 Credit' },
        { reward_id: '2', redeemed: '1', reward_type: 'Plate Party' },
      ];
      const mockResponse = [{}, {}, { reward: mockRewards }];

      (preferences.getPreference as jest.Mock)
        .mockResolvedValueOnce('false') // is_visitor_mode
        .mockResolvedValueOnce('https://api.example.com/mybeers'); // my_beers_api_url

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockResponse)
      });

      const result = await fetchRewardsFromAPI();

      expect(result).toEqual(mockRewards);
      expect(result.length).toBe(2);
    });

    it('should return empty array in visitor mode', async () => {
      (preferences.getPreference as jest.Mock).mockResolvedValue('true'); // is_visitor_mode

      const result = await fetchRewardsFromAPI();

      expect(result).toEqual([]);
      expect(global.fetch).not.toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(
        'In visitor mode - rewards not available, returning empty array'
      );
    });

    it('should return empty array when API URL is not configured', async () => {
      (preferences.getPreference as jest.Mock)
        .mockResolvedValueOnce('false') // is_visitor_mode
        .mockResolvedValueOnce(null); // my_beers_api_url

      const result = await fetchRewardsFromAPI();

      expect(result).toEqual([]);
      expect(global.fetch).not.toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith('My beers API URL not found in preferences');
    });

    it('should throw error for invalid response format', async () => {
      const mockResponse = { invalid: 'format' };

      (preferences.getPreference as jest.Mock)
        .mockResolvedValueOnce('false')
        .mockResolvedValueOnce('https://api.example.com/mybeers');

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockResponse)
      });

      await expect(fetchRewardsFromAPI()).rejects.toThrow('Invalid response format from Rewards API');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error fetching Rewards from API:',
        expect.any(Error)
      );
    });

    it('should throw error when reward array is missing', async () => {
      const mockResponse = [{}, {}, {}];

      (preferences.getPreference as jest.Mock)
        .mockResolvedValueOnce('false')
        .mockResolvedValueOnce('https://api.example.com/mybeers');

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockResponse)
      });

      await expect(fetchRewardsFromAPI()).rejects.toThrow('Invalid response format from Rewards API');
    });

    it('should retry on network failure', async () => {
      const mockRewards = [{ reward_id: '1', redeemed: '0', reward_type: 'Test Reward' }];
      const mockResponse = [{}, {}, { reward: mockRewards }];

      (preferences.getPreference as jest.Mock)
        .mockResolvedValue('false')
        .mockResolvedValue('https://api.example.com/mybeers');

      (global.fetch as jest.Mock)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue(mockResponse)
        });

      const result = await fetchRewardsFromAPI();

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual(mockRewards);
    });

    it('should handle HTTP error responses', async () => {
      (preferences.getPreference as jest.Mock)
        .mockResolvedValueOnce('false')
        .mockResolvedValueOnce('https://api.example.com/mybeers');

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });

      await expect(fetchRewardsFromAPI()).rejects.toThrow('Failed to fetch: 404 Not Found');
      expect(global.fetch).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });
  });

  describe('fetchWithRetry helper (integration tests)', () => {
    it('should handle none:// protocol URL for my beers', async () => {
      (preferences.getPreference as jest.Mock)
        .mockResolvedValueOnce('false')
        .mockResolvedValueOnce('none://placeholder');

      const result = await fetchMyBeersFromAPI();

      expect(result).toEqual([]);
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });
});
