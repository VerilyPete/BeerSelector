import { fetchAndUpdateAllBeers, fetchAndUpdateMyBeers } from '../dataUpdateService';
import { getPreference, setPreference } from '../../database/preferences';
import { beerRepository } from '../../database/repositories/BeerRepository';
import { myBeersRepository } from '../../database/repositories/MyBeersRepository';
import { fetchBeersFromAPI } from '../../api/beerApi';
import { config } from '@/src/config';
import * as fs from 'fs';
import * as path from 'path';

// Mock dependencies
jest.mock('../../database/preferences', () => ({
  getPreference: jest.fn(),
  setPreference: jest.fn(),
}));

jest.mock('../../database/repositories/BeerRepository', () => ({
  beerRepository: {
    insertMany: jest.fn(),
  },
}));

jest.mock('../../database/repositories/MyBeersRepository', () => ({
  myBeersRepository: {
    insertMany: jest.fn(),
  },
}));

// Mock beerApi to avoid fetchWithRetry setTimeout retries in tests
jest.mock('../../api/beerApi', () => ({
  fetchBeersFromAPI: jest.fn(),
  fetchMyBeersFromAPI: jest.fn(),
  fetchRewardsFromAPI: jest.fn(),
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

// Mock error logger
jest.mock('../../utils/errorLogger', () => ({
  logError: jest.fn(),
  logWarning: jest.fn(),
}));

// Mock fetch for functions that still use raw fetch (fetchAndUpdateMyBeers)
global.fetch = jest.fn();

// Mock console methods to keep test output clean
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

describe('dataUpdateService integration tests', () => {
  // Setup and teardown
  beforeEach(() => {
    jest.clearAllMocks();
    console.log = jest.fn();
    console.error = jest.fn();

    // Set test environment with config
    config.setCustomApiUrl('https://example.com');

    // Mock preferences - timestamps return null (no recent check), URLs for myBeers direct fetch
    (getPreference as jest.Mock).mockImplementation(async (key: string) => {
      if (key === 'all_beers_api_url') return `${config.api.baseUrl}/api/all-beers`;
      if (key === 'my_beers_api_url') return `${config.api.baseUrl}/api/my-beers`;
      return null;
    });

    // Default mock for setPreference
    (setPreference as jest.Mock).mockResolvedValue(undefined);

    // Default mock for repository insertMany methods
    (beerRepository.insertMany as jest.Mock).mockResolvedValue(undefined);
    (myBeersRepository.insertMany as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  });

  // Helper function to load test data from files
  const loadTestData = (filename: string) => {
    const filePath = path.resolve(process.cwd(), filename);
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(fileContent);
  };

  describe('fetchAndUpdateAllBeers', () => {
    it('should process valid allbeers.json data correctly', async () => {
      // Load test data from the actual file
      const allBeersData = loadTestData('allbeers.json');
      const rawBeers = allBeersData[1].brewInStock;

      // Mock fetchBeersFromAPI to return the raw beers (already extracted from API response)
      (fetchBeersFromAPI as jest.Mock).mockResolvedValue(rawBeers);

      // Call the function
      const result = await fetchAndUpdateAllBeers();

      // Verify the result
      expect(result.success).toBe(true);
      expect(result.dataUpdated).toBe(true);
      expect(result.itemCount).toBeGreaterThan(0);

      // Verify that fetchBeersFromAPI was called
      expect(fetchBeersFromAPI).toHaveBeenCalledTimes(1);

      // Verify that beerRepository.insertMany was called with the correct data
      expect(beerRepository.insertMany).toHaveBeenCalledTimes(1);

      // Verify that the data passed to beerRepository.insertMany is valid
      const beersPassedToPopulate = (beerRepository.insertMany as jest.Mock).mock.calls[0][0];
      expect(Array.isArray(beersPassedToPopulate)).toBe(true);

      // Verify that valid beers were passed (service filters out beers without required fields)
      expect(beersPassedToPopulate.length).toBeGreaterThan(0);

      // Verify service filters invalid beers - service removes beers without id or brew_name
      const validBeers = rawBeers.filter(
        (beer: any) =>
          beer.id &&
          beer.brew_name &&
          typeof beer.brew_name === 'string' &&
          beer.brew_name.trim() !== ''
      );

      // Verify count matches (container_type is added by calculateContainerTypes, so we can't do exact equality)
      expect(beersPassedToPopulate.length).toBe(validBeers.length);
      expect(beersPassedToPopulate.length).toBeLessThanOrEqual(rawBeers.length);

      // Verify all beers have valid IDs and brew_name (only required fields per validator)
      beersPassedToPopulate.forEach((beer: any) => {
        expect(beer.id).toBeDefined();
        expect(beer.id).toBeTruthy();
        expect(beer.brew_name).toBeDefined();
        expect(typeof beer.brew_name).toBe('string');
        expect(beer.brew_name.trim()).not.toBe(''); // Not empty after trim
      });

      // Verify that each beer has the expected properties including container_type
      const firstBeer = beersPassedToPopulate[0];
      expect(firstBeer).toHaveProperty('id');
      expect(firstBeer).toHaveProperty('brew_name');
      expect(firstBeer).toHaveProperty('brewer');
      expect(firstBeer).toHaveProperty('brew_style');
      expect(firstBeer).toHaveProperty('container_type'); // Added by calculateContainerTypes
      expect(firstBeer).toHaveProperty('abv'); // Added by calculateContainerTypes

      // Verify that setPreference was called to update the timestamps
      expect(setPreference).toHaveBeenCalledWith('all_beers_last_update', expect.any(String));
      expect(setPreference).toHaveBeenCalledWith('all_beers_last_check', expect.any(String));
    });

    it('should handle missing API URL by returning empty from fetchBeersFromAPI', async () => {
      // fetchBeersFromAPI returns [] when API URL is not configured
      (fetchBeersFromAPI as jest.Mock).mockResolvedValue([]);

      // Call the function
      const result = await fetchAndUpdateAllBeers();

      // Verify the result - empty beers means failure
      expect(result.success).toBe(false);
      expect(result.dataUpdated).toBe(false);

      // Verify that beerRepository.insertMany was not called
      expect(beerRepository.insertMany).not.toHaveBeenCalled();
    });

    it('should handle fetchBeersFromAPI throwing an error', async () => {
      // Mock fetchBeersFromAPI to throw (simulates network/server errors)
      (fetchBeersFromAPI as jest.Mock).mockRejectedValue(
        new Error('Failed to fetch: 404 Not Found')
      );

      // Call the function
      const result = await fetchAndUpdateAllBeers();

      // Verify the result
      expect(result.success).toBe(false);
      expect(result.dataUpdated).toBe(false);

      // Verify that beerRepository.insertMany was not called
      expect(beerRepository.insertMany).not.toHaveBeenCalled();

      // Verify that setPreference was not called
      expect(setPreference).not.toHaveBeenCalled();
    });

    it('should handle invalid data format from fetchBeersFromAPI', async () => {
      // fetchBeersFromAPI returns [] when response format is invalid
      (fetchBeersFromAPI as jest.Mock).mockResolvedValue([]);

      // Call the function
      const result = await fetchAndUpdateAllBeers();

      // Verify the result
      expect(result.success).toBe(false);
      expect(result.dataUpdated).toBe(false);

      // Verify that beerRepository.insertMany was not called
      expect(beerRepository.insertMany).not.toHaveBeenCalled();

      // Verify that setPreference was not called
      expect(setPreference).not.toHaveBeenCalled();
    });

    it('should handle network error from fetchBeersFromAPI', async () => {
      // Mock fetchBeersFromAPI to throw a network error
      (fetchBeersFromAPI as jest.Mock).mockRejectedValue(new Error('Network error'));

      // Call the function
      const result = await fetchAndUpdateAllBeers();

      // Verify the result
      expect(result.success).toBe(false);
      expect(result.dataUpdated).toBe(false);

      // Verify that beerRepository.insertMany was not called
      expect(beerRepository.insertMany).not.toHaveBeenCalled();

      // Verify that setPreference was not called
      expect(setPreference).not.toHaveBeenCalled();
    });
  });

  describe('fetchAndUpdateMyBeers', () => {
    it('should process valid mybeers.json data correctly', async () => {
      // Load test data from the actual file
      const myBeersData = loadTestData('mybeers.json');

      // Mock fetch to return the test data (fetchAndUpdateMyBeers still uses raw fetch)
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(myBeersData),
      });

      // Call the function
      const result = await fetchAndUpdateMyBeers();

      // Verify the result
      expect(result.success).toBe(true);
      expect(result.dataUpdated).toBe(true);
      expect(result.itemCount).toBeGreaterThan(0);

      // Verify that fetch was called with the my beers URL
      expect(global.fetch).toHaveBeenCalled();

      // Verify that myBeersRepository.insertMany was called with the correct data
      expect(myBeersRepository.insertMany).toHaveBeenCalledTimes(1);

      // Verify that the data passed to myBeersRepository.insertMany is the tasted_brew_current_round array
      const beersPassedToPopulate = (myBeersRepository.insertMany as jest.Mock).mock.calls[0][0];
      expect(Array.isArray(beersPassedToPopulate)).toBe(true);

      // Verify that the data has correct count (same as source data)
      expect(beersPassedToPopulate.length).toBe(myBeersData[1].tasted_brew_current_round.length);

      // Verify that each beer has the expected properties including container_type and abv (added by calculateContainerTypes)
      const firstBeer = beersPassedToPopulate[0];
      expect(firstBeer).toHaveProperty('id');
      expect(firstBeer).toHaveProperty('brew_name');
      expect(firstBeer).toHaveProperty('brewer');
      expect(firstBeer).toHaveProperty('brew_style');
      expect(firstBeer).toHaveProperty('tasted_date');
      expect(firstBeer).toHaveProperty('chit_code');
      expect(firstBeer).toHaveProperty('container_type'); // Added by calculateContainerTypes
      expect(firstBeer).toHaveProperty('abv'); // Added by calculateContainerTypes

      // Verify that setPreference was called to update the timestamps
      expect(setPreference).toHaveBeenCalledWith('my_beers_last_update', expect.any(String));
      expect(setPreference).toHaveBeenCalledWith('my_beers_last_check', expect.any(String));
    });

    it('should handle missing API URL', async () => {
      // Mock getPreference to return null for the API URL
      (getPreference as jest.Mock).mockImplementation(async (key: string) => {
        if (key === 'my_beers_api_url') return null;
        return null;
      });

      // Call the function
      const result = await fetchAndUpdateMyBeers();

      // Verify the result
      expect(result.success).toBe(false);
      expect(result.dataUpdated).toBe(false);

      // Verify that fetch was not called
      expect(global.fetch).not.toHaveBeenCalled();

      // Verify that myBeersRepository.insertMany was not called
      expect(myBeersRepository.insertMany).not.toHaveBeenCalled();

      // Verify that setPreference was not called
      expect(setPreference).not.toHaveBeenCalled();
    });

    it('should handle failed fetch', async () => {
      // Mock fetch to return an error response
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      // Call the function
      const result = await fetchAndUpdateMyBeers();

      // Verify the result
      expect(result.success).toBe(false);
      expect(result.dataUpdated).toBe(false);

      // Verify that fetch was called
      expect(global.fetch).toHaveBeenCalled();

      // Verify that myBeersRepository.insertMany was not called
      expect(myBeersRepository.insertMany).not.toHaveBeenCalled();

      // Verify that setPreference was not called
      expect(setPreference).not.toHaveBeenCalled();
    });

    it('should handle invalid data format', async () => {
      // Mock fetch to return invalid data
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ invalid: 'data' }),
      });

      // Call the function
      const result = await fetchAndUpdateMyBeers();

      // Verify the result
      expect(result.success).toBe(false);
      expect(result.dataUpdated).toBe(false);

      // Verify that fetch was called
      expect(global.fetch).toHaveBeenCalled();

      // Verify that myBeersRepository.insertMany was not called
      expect(myBeersRepository.insertMany).not.toHaveBeenCalled();

      // Verify that setPreference was not called
      expect(setPreference).not.toHaveBeenCalled();
    });

    it('should handle empty tasted beers array (new user or round rollover)', async () => {
      // Create data with empty tasted_brew_current_round array (happens when round rolls over at 200 beers)
      const emptyBeersData = [
        { member: { member_id: '123', name: 'Test User' } },
        { tasted_brew_current_round: [] }, // Empty array - new user or round rollover
      ];

      // Mock fetch to return the empty data
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(emptyBeersData),
      });

      // Call the function
      const result = await fetchAndUpdateMyBeers();

      // Verify the result - should succeed with 0 items
      expect(result.success).toBe(true);
      expect(result.dataUpdated).toBe(true);
      expect(result.itemCount).toBe(0);

      // Verify that fetch was called
      expect(global.fetch).toHaveBeenCalled();

      // Verify that myBeersRepository.insertMany was called with empty array
      expect(myBeersRepository.insertMany).toHaveBeenCalledWith([]);

      // Verify that setPreference was called to update timestamps
      expect(setPreference).toHaveBeenCalledWith('my_beers_last_update', expect.any(String));
      expect(setPreference).toHaveBeenCalledWith('my_beers_last_check', expect.any(String));
    });

    it('should handle data with no valid beers', async () => {
      // Create a modified version of the data with invalid beers (no IDs)
      const invalidBeersData = [
        { member: { member_id: '123', name: 'Test User' } },
        {
          tasted_brew_current_round: [
            { brew_name: 'Beer 1', brewer: 'Brewery 1' }, // No ID
            { brew_name: 'Beer 2', brewer: 'Brewery 2' }, // No ID
            { brew_name: 'Beer 3', brewer: 'Brewery 3' }, // No ID
          ],
        },
      ];

      // Mock fetch to return the invalid data
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(invalidBeersData),
      });

      // Call the function
      const result = await fetchAndUpdateMyBeers();

      // Verify the result - should now succeed with 0 items
      expect(result.success).toBe(true);
      expect(result.dataUpdated).toBe(true);
      expect(result.itemCount).toBe(0);

      // Verify that fetch was called
      expect(global.fetch).toHaveBeenCalled();

      // Verify that myBeersRepository.insertMany was called with empty array
      expect(myBeersRepository.insertMany).toHaveBeenCalledWith([]);

      // Verify that setPreference was called to update timestamps
      expect(setPreference).toHaveBeenCalledWith('my_beers_last_update', expect.any(String));
      expect(setPreference).toHaveBeenCalledWith('my_beers_last_check', expect.any(String));
    });

    it('should handle fetch throwing an exception', async () => {
      // Mock fetch to throw an error
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      // Call the function
      const result = await fetchAndUpdateMyBeers();

      // Verify the result
      expect(result.success).toBe(false);
      expect(result.dataUpdated).toBe(false);

      // Verify that fetch was called
      expect(global.fetch).toHaveBeenCalled();

      // Verify that myBeersRepository.insertMany was not called
      expect(myBeersRepository.insertMany).not.toHaveBeenCalled();

      // Verify that setPreference was not called
      expect(setPreference).not.toHaveBeenCalled();
    });
  });

  describe('Config Integration', () => {
    describe('Environment Switching', () => {
      it('should use production config when environment is production', async () => {
        config.setEnvironment('production');

        // fetchBeersFromAPI is mocked - it handles URL resolution internally
        (fetchBeersFromAPI as jest.Mock).mockResolvedValue([{ id: '1', brew_name: 'Test' }]);

        const result = await fetchAndUpdateAllBeers();

        expect(result.success).toBe(true);
        expect(fetchBeersFromAPI).toHaveBeenCalledTimes(1);
      });

      it('should use custom config when set', async () => {
        config.setCustomApiUrl('http://localhost:3000');

        (fetchBeersFromAPI as jest.Mock).mockResolvedValue([{ id: '1', brew_name: 'Test' }]);

        const result = await fetchAndUpdateAllBeers();

        expect(result.success).toBe(true);
        expect(fetchBeersFromAPI).toHaveBeenCalledTimes(1);
      });
    });

    describe('Network Configuration', () => {
      it('should have valid timeout settings in config', async () => {
        expect(config.network.timeout).toBeDefined();
        expect(config.network.timeout).toBeGreaterThan(0);
      });

      it('should respect config retry settings', async () => {
        expect(config.network.retries).toBeDefined();
        expect(config.network.retryDelay).toBeDefined();
        expect(config.network.retries).toBeGreaterThanOrEqual(0);
        expect(config.network.retryDelay).toBeGreaterThan(0);
      });
    });

    describe('Multiple Concurrent Requests', () => {
      it('should handle multiple all beers fetch requests', async () => {
        (fetchBeersFromAPI as jest.Mock).mockResolvedValue([{ id: '1', brew_name: 'Test' }]);

        // Start two concurrent updates
        const promise1 = fetchAndUpdateAllBeers();
        const promise2 = fetchAndUpdateAllBeers();

        const [result1, result2] = await Promise.all([promise1, promise2]);

        // Both should complete (concurrent prevention is handled at repository level)
        expect(result1.success).toBeDefined();
        expect(result2.success).toBeDefined();
      });

      it('should handle multiple my beers fetch requests', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
          ok: true,
          json: jest
            .fn()
            .mockResolvedValue([
              {},
              { tasted_brew_current_round: [{ id: '1', brew_name: 'Test' }] },
            ]),
        });

        // Start two concurrent updates
        const promise1 = fetchAndUpdateMyBeers();
        const promise2 = fetchAndUpdateMyBeers();

        const [result1, result2] = await Promise.all([promise1, promise2]);

        // Both should complete (concurrent prevention is handled at repository level)
        expect(result1.success).toBeDefined();
        expect(result2.success).toBeDefined();
      });
    });

    describe('URL Construction', () => {
      it('should construct valid URLs from config base URL', async () => {
        const baseUrl = config.api.baseUrl;
        expect(baseUrl).toBeDefined();
        expect(typeof baseUrl).toBe('string');

        // Test that URLs can be constructed
        const allBeersUrl = `${baseUrl}/api/all-beers`;
        const myBeersUrl = `${baseUrl}/api/my-beers`;

        expect(allBeersUrl).toContain(baseUrl);
        expect(myBeersUrl).toContain(baseUrl);
      });

      it('should handle trailing slashes in base URL', async () => {
        const urlWithSlash = 'https://example.com/';
        config.setCustomApiUrl(urlWithSlash);

        const constructedUrl = `${config.api.baseUrl}/api/beers`;

        // Should not have double slashes
        expect(constructedUrl).not.toContain('//api');

        (fetchBeersFromAPI as jest.Mock).mockResolvedValue([{ id: '1', brew_name: 'Test' }]);

        const result = await fetchAndUpdateAllBeers();
        expect(result.success).toBe(true);
      });
    });

    describe('Config Module Compatibility', () => {
      it('should work with config.api.baseUrl value', async () => {
        // Verify config module is properly initialized
        expect(config.api.baseUrl).toBeDefined();
        expect(typeof config.api.baseUrl).toBe('string');

        (fetchBeersFromAPI as jest.Mock).mockResolvedValue([{ id: '1', brew_name: 'Test' }]);

        const result = await fetchAndUpdateAllBeers();

        expect(result.success).toBe(true);
        expect(fetchBeersFromAPI).toHaveBeenCalledTimes(1);
      });

      it('should respect config network settings', async () => {
        // Verify network config is available
        expect(config.network.timeout).toBeDefined();
        expect(config.network.retries).toBeDefined();
        expect(config.network.retryDelay).toBeDefined();

        // Verify values are reasonable
        expect(config.network.timeout).toBeGreaterThan(0);
        expect(config.network.retries).toBeGreaterThanOrEqual(0);
        expect(config.network.retryDelay).toBeGreaterThan(0);
      });
    });

    describe('Error Handling with Config', () => {
      it('should handle timeout errors from fetchBeersFromAPI', async () => {
        const abortError = new Error('Timeout');
        abortError.name = 'AbortError';
        (fetchBeersFromAPI as jest.Mock).mockRejectedValue(abortError);

        const result = await fetchAndUpdateAllBeers();

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      });

      it('should handle network errors from fetchBeersFromAPI', async () => {
        (fetchBeersFromAPI as jest.Mock).mockRejectedValue(new TypeError('Network request failed'));

        const result = await fetchAndUpdateAllBeers();

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      });
    });
  });
});
