import { fetchAndUpdateAllBeers, fetchAndUpdateMyBeers } from '../dataUpdateService';
import { getPreference, setPreference } from '../../database/preferences';
import { beerRepository } from '../../database/repositories/BeerRepository';
import { myBeersRepository } from '../../database/repositories/MyBeersRepository';
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

// Mock fetch
global.fetch = jest.fn();

// Mock console methods to keep test output clean
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

describe('dataUpdateService integration tests', () => {
  // Test URLs from config
  const testAllBeersUrl = `${config.api.baseUrl}/api/all-beers`;
  const testMyBeersUrl = `${config.api.baseUrl}/api/my-beers`;

  // Setup and teardown
  beforeEach(() => {
    jest.clearAllMocks();
    console.log = jest.fn();
    console.error = jest.fn();

    // Set test environment with config
    config.setCustomApiUrl('https://example.com');

    // Mock preferences for timestamps only
    (getPreference as jest.Mock).mockImplementation(async (key: string) => {
      if (key === 'all_beers_api_url') return testAllBeersUrl;
      if (key === 'my_beers_api_url') return testMyBeersUrl;
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

      // Mock fetch to return the test data
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(allBeersData),
      });

      // Call the function
      const result = await fetchAndUpdateAllBeers();

      // Verify the result
      expect(result.success).toBe(true);
      expect(result.dataUpdated).toBe(true);
      expect(result.itemCount).toBeGreaterThan(0);

      // Verify that fetch was called with the correct URL
      expect(global.fetch).toHaveBeenCalledWith(
        testAllBeersUrl,
        expect.objectContaining({ signal: expect.any(Object) })
      );

      // Verify that beerRepository.insertMany was called with the correct data
      expect(beerRepository.insertMany).toHaveBeenCalledTimes(1);

      // Verify that the data passed to beerRepository.insertMany is the brewInStock array
      const beersPassedToPopulate = (beerRepository.insertMany as jest.Mock).mock.calls[0][0];
      expect(Array.isArray(beersPassedToPopulate)).toBe(true);

      // Verify that valid beers were passed (service filters out beers without required fields)
      expect(beersPassedToPopulate.length).toBeGreaterThan(0);

      // Verify service filters invalid beers - service removes beers without id or brew_name
      // The validator only checks for id and brew_name (brewer and brew_style can be empty)
      const rawBeers = allBeersData[1].brewInStock;
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

    it('should handle missing API URL', async () => {
      // Mock getPreference to return null for the API URL
      (getPreference as jest.Mock).mockImplementation(async (key: string) => {
        if (key === 'all_beers_api_url') return null;
        return null;
      });

      // Call the function
      const result = await fetchAndUpdateAllBeers();

      // Verify the result
      expect(result.success).toBe(false);
      expect(result.dataUpdated).toBe(false);

      // Verify that fetch was not called
      expect(global.fetch).not.toHaveBeenCalled();

      // Verify that beerRepository.insertMany was not called
      expect(beerRepository.insertMany).not.toHaveBeenCalled();

      // Verify that setPreference was not called
      expect(setPreference).not.toHaveBeenCalled();

      // Verify that an error was logged
      expect(console.error).toHaveBeenCalled();
    });

    it('should handle failed fetch', async () => {
      // Mock fetch to return an error response
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      // Call the function
      const result = await fetchAndUpdateAllBeers();

      // Verify the result
      expect(result.success).toBe(false);
      expect(result.dataUpdated).toBe(false);

      // Verify that fetch was called
      expect(global.fetch).toHaveBeenCalledWith(
        testAllBeersUrl,
        expect.objectContaining({ signal: expect.any(Object) })
      );

      // Verify that beerRepository.insertMany was not called
      expect(beerRepository.insertMany).not.toHaveBeenCalled();

      // Verify that setPreference was not called
      expect(setPreference).not.toHaveBeenCalled();

      // Verify that an error was logged
      expect(console.error).toHaveBeenCalled();
    });

    it('should handle invalid data format', async () => {
      // Mock fetch to return invalid data
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ invalid: 'data' }),
      });

      // Call the function
      const result = await fetchAndUpdateAllBeers();

      // Verify the result
      expect(result.success).toBe(false);
      expect(result.dataUpdated).toBe(false);

      // Verify that fetch was called
      expect(global.fetch).toHaveBeenCalledWith(
        testAllBeersUrl,
        expect.objectContaining({ signal: expect.any(Object) })
      );

      // Verify that beerRepository.insertMany was not called
      expect(beerRepository.insertMany).not.toHaveBeenCalled();

      // Verify that setPreference was not called
      expect(setPreference).not.toHaveBeenCalled();

      // Verify that an error was logged
      expect(console.error).toHaveBeenCalled();
    });

    it('should handle fetch throwing an exception', async () => {
      // Mock fetch to throw an error
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      // Call the function
      const result = await fetchAndUpdateAllBeers();

      // Verify the result
      expect(result.success).toBe(false);
      expect(result.dataUpdated).toBe(false);

      // Verify that fetch was called
      expect(global.fetch).toHaveBeenCalledWith(
        testAllBeersUrl,
        expect.objectContaining({ signal: expect.any(Object) })
      );

      // Verify that beerRepository.insertMany was not called
      expect(beerRepository.insertMany).not.toHaveBeenCalled();

      // Verify that setPreference was not called
      expect(setPreference).not.toHaveBeenCalled();

      // Verify that an error was logged
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('fetchAndUpdateMyBeers', () => {
    it('should process valid mybeers.json data correctly', async () => {
      // Load test data from the actual file
      const myBeersData = loadTestData('mybeers.json');

      // Mock fetch to return the test data
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

      // Verify that fetch was called with the correct URL
      expect(global.fetch).toHaveBeenCalledWith(
        testMyBeersUrl,
        expect.objectContaining({ signal: expect.any(Object) })
      );

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

      // Verify that an error was logged
      expect(console.error).toHaveBeenCalled();
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
      expect(global.fetch).toHaveBeenCalledWith(
        testMyBeersUrl,
        expect.objectContaining({ signal: expect.any(Object) })
      );

      // Verify that myBeersRepository.insertMany was not called
      expect(myBeersRepository.insertMany).not.toHaveBeenCalled();

      // Verify that setPreference was not called
      expect(setPreference).not.toHaveBeenCalled();

      // Verify that an error was logged
      expect(console.error).toHaveBeenCalled();
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
      expect(global.fetch).toHaveBeenCalledWith(
        testMyBeersUrl,
        expect.objectContaining({ signal: expect.any(Object) })
      );

      // Verify that myBeersRepository.insertMany was not called
      expect(myBeersRepository.insertMany).not.toHaveBeenCalled();

      // Verify that setPreference was not called
      expect(setPreference).not.toHaveBeenCalled();

      // Verify that an error was logged
      expect(console.error).toHaveBeenCalled();
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
      expect(global.fetch).toHaveBeenCalledWith(
        testMyBeersUrl,
        expect.objectContaining({ signal: expect.any(Object) })
      );

      // Verify that myBeersRepository.insertMany was called with empty array
      expect(myBeersRepository.insertMany).toHaveBeenCalledWith([]);

      // Verify that setPreference was called to update timestamps
      expect(setPreference).toHaveBeenCalledWith('my_beers_last_update', expect.any(String));
      expect(setPreference).toHaveBeenCalledWith('my_beers_last_check', expect.any(String));

      // Verify that the correct log message was called
      expect(console.log).toHaveBeenCalledWith(
        'Empty tasted beers array - user has no tasted beers in current round (new user or round rollover at 200 beers), clearing database'
      );
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
      expect(global.fetch).toHaveBeenCalledWith(
        testMyBeersUrl,
        expect.objectContaining({ signal: expect.any(Object) })
      );

      // Verify that myBeersRepository.insertMany was called with empty array
      expect(myBeersRepository.insertMany).toHaveBeenCalledWith([]);

      // Verify that setPreference was called to update timestamps
      expect(setPreference).toHaveBeenCalledWith('my_beers_last_update', expect.any(String));
      expect(setPreference).toHaveBeenCalledWith('my_beers_last_check', expect.any(String));

      // Verify that the new log message was called
      expect(console.log).toHaveBeenCalledWith(
        'No valid beers with IDs found, but API returned data - clearing database'
      );
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
      expect(global.fetch).toHaveBeenCalledWith(
        testMyBeersUrl,
        expect.objectContaining({ signal: expect.any(Object) })
      );

      // Verify that myBeersRepository.insertMany was not called
      expect(myBeersRepository.insertMany).not.toHaveBeenCalled();

      // Verify that setPreference was not called
      expect(setPreference).not.toHaveBeenCalled();

      // Verify that an error was logged
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('Config Integration', () => {
    describe('Environment Switching', () => {
      it('should use production URL when environment is production', async () => {
        config.setEnvironment('production');
        const productionUrl = `${config.api.baseUrl}/api/all-beers`;

        (getPreference as jest.Mock).mockResolvedValueOnce(productionUrl);

        (global.fetch as jest.Mock).mockResolvedValue({
          ok: true,
          json: jest
            .fn()
            .mockResolvedValue([{}, { brewInStock: [{ id: '1', brew_name: 'Test' }] }]),
        });

        (beerRepository.insertMany as jest.Mock).mockResolvedValue(undefined);
        (setPreference as jest.Mock).mockResolvedValue(undefined);

        const result = await fetchAndUpdateAllBeers();

        expect(result.success).toBe(true);
        expect(global.fetch).toHaveBeenCalledWith(
          productionUrl,
          expect.objectContaining({ signal: expect.any(Object) })
        );
      });

      it('should use custom URL when set', async () => {
        config.setCustomApiUrl('http://localhost:3000');
        const customUrl = `${config.api.baseUrl}/api/all-beers`;

        (getPreference as jest.Mock).mockResolvedValueOnce(customUrl);

        (global.fetch as jest.Mock).mockResolvedValue({
          ok: true,
          json: jest
            .fn()
            .mockResolvedValue([{}, { brewInStock: [{ id: '1', brew_name: 'Test' }] }]),
        });

        (beerRepository.insertMany as jest.Mock).mockResolvedValue(undefined);
        (setPreference as jest.Mock).mockResolvedValue(undefined);

        const result = await fetchAndUpdateAllBeers();

        expect(result.success).toBe(true);
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('localhost:3000'),
          expect.any(Object)
        );
      });
    });

    describe('Network Configuration', () => {
      it('should respect config timeout settings', async () => {
        (getPreference as jest.Mock).mockResolvedValueOnce(testAllBeersUrl);

        // Verify config has timeout settings
        expect(config.network.timeout).toBeDefined();
        expect(config.network.timeout).toBeGreaterThan(0);

        let capturedSignal: any = null;
        (global.fetch as jest.Mock).mockImplementationOnce((url, options) => {
          capturedSignal = options.signal;
          return Promise.resolve({
            ok: true,
            json: jest
              .fn()
              .mockResolvedValue([{}, { brewInStock: [{ id: '1', brew_name: 'Test' }] }]),
          });
        });

        (beerRepository.insertMany as jest.Mock).mockResolvedValue(undefined);
        (setPreference as jest.Mock).mockResolvedValue(undefined);

        await fetchAndUpdateAllBeers();

        // Verify fetch was called with an AbortSignal
        expect(capturedSignal).toBeDefined();
        expect(capturedSignal).toHaveProperty('aborted');
      });

      it('should respect config retry settings', async () => {
        // Verify config has retry settings
        expect(config.network.retries).toBeDefined();
        expect(config.network.retryDelay).toBeDefined();
        expect(config.network.retries).toBeGreaterThanOrEqual(0);
        expect(config.network.retryDelay).toBeGreaterThan(0);
      });
    });

    describe('Multiple Concurrent Requests', () => {
      it('should handle multiple all beers fetch requests', async () => {
        (getPreference as jest.Mock).mockResolvedValue(testAllBeersUrl);

        (global.fetch as jest.Mock).mockResolvedValue({
          ok: true,
          json: jest
            .fn()
            .mockResolvedValue([{}, { brewInStock: [{ id: '1', brew_name: 'Test' }] }]),
        });

        (beerRepository.insertMany as jest.Mock).mockResolvedValue(undefined);
        (setPreference as jest.Mock).mockResolvedValue(undefined);

        // Start two concurrent updates
        const promise1 = fetchAndUpdateAllBeers();
        const promise2 = fetchAndUpdateAllBeers();

        const [result1, result2] = await Promise.all([promise1, promise2]);

        // Both should complete (concurrent prevention is handled at repository level)
        expect(result1.success).toBeDefined();
        expect(result2.success).toBeDefined();
      });

      it('should handle multiple my beers fetch requests', async () => {
        (getPreference as jest.Mock).mockImplementation(async (key: string) => {
          if (key === 'is_visitor_mode') return 'false';
          if (key === 'my_beers_api_url') return testMyBeersUrl;
          return null;
        });

        (global.fetch as jest.Mock).mockResolvedValue({
          ok: true,
          json: jest
            .fn()
            .mockResolvedValue([
              {},
              { tasted_brew_current_round: [{ id: '1', brew_name: 'Test' }] },
            ]),
        });

        (myBeersRepository.insertMany as jest.Mock).mockResolvedValue(undefined);
        (setPreference as jest.Mock).mockResolvedValue(undefined);

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

        (getPreference as jest.Mock).mockResolvedValueOnce(constructedUrl);

        (global.fetch as jest.Mock).mockResolvedValue({
          ok: true,
          json: jest
            .fn()
            .mockResolvedValue([{}, { brewInStock: [{ id: '1', brew_name: 'Test' }] }]),
        });

        (beerRepository.insertMany as jest.Mock).mockResolvedValue(undefined);
        (setPreference as jest.Mock).mockResolvedValue(undefined);

        const result = await fetchAndUpdateAllBeers();
        expect(result.success).toBe(true);
      });
    });

    describe('Config Module Compatibility', () => {
      it('should work with config.api.baseUrl value', async () => {
        // Verify config module is properly initialized
        expect(config.api.baseUrl).toBeDefined();
        expect(typeof config.api.baseUrl).toBe('string');

        const configBasedUrl = `${config.api.baseUrl}/custom/endpoint`;
        (getPreference as jest.Mock).mockResolvedValueOnce(configBasedUrl);

        (global.fetch as jest.Mock).mockResolvedValue({
          ok: true,
          json: jest
            .fn()
            .mockResolvedValue([{}, { brewInStock: [{ id: '1', brew_name: 'Test' }] }]),
        });

        (beerRepository.insertMany as jest.Mock).mockResolvedValue(undefined);
        (setPreference as jest.Mock).mockResolvedValue(undefined);

        const result = await fetchAndUpdateAllBeers();

        expect(result.success).toBe(true);
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining(config.api.baseUrl),
          expect.any(Object)
        );
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
      it('should handle timeout with config-aware error messages', async () => {
        (getPreference as jest.Mock).mockResolvedValueOnce(testAllBeersUrl);

        const abortError = new Error('Timeout');
        abortError.name = 'AbortError';
        (global.fetch as jest.Mock).mockRejectedValue(abortError);

        const result = await fetchAndUpdateAllBeers();

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(console.error).toHaveBeenCalled();
      });

      it('should handle network errors with proper error types', async () => {
        (getPreference as jest.Mock).mockResolvedValueOnce(testAllBeersUrl);

        (global.fetch as jest.Mock).mockRejectedValue(new TypeError('Network request failed'));

        const result = await fetchAndUpdateAllBeers();

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(console.error).toHaveBeenCalled();
      });
    });
  });
});
