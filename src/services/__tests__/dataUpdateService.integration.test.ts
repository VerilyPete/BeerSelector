import { fetchAndUpdateAllBeers, fetchAndUpdateMyBeers } from '../dataUpdateService';
import { getPreference, setPreference } from '../../database/preferences';
import { beerRepository } from '../../database/repositories/BeerRepository';
import { myBeersRepository } from '../../database/repositories/MyBeersRepository';
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
  // Setup and teardown
  beforeEach(() => {
    jest.clearAllMocks();
    console.log = jest.fn();
    console.error = jest.fn();

    // Default mock for getPreference
    (getPreference as jest.Mock).mockImplementation(async (key: string) => {
      if (key === 'all_beers_api_url') return 'https://example.com/allbeers.json';
      if (key === 'my_beers_api_url') return 'https://example.com/mybeers.json';
      return null;
    });

    // Default mock for setPreference
    (setPreference as jest.Mock).mockResolvedValue(undefined);

    // Default mock for populateBeersTable and populateMyBeersTable
    (populateBeersTable as jest.Mock).mockResolvedValue(undefined);
    (populateMyBeersTable as jest.Mock).mockResolvedValue(undefined);
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
      expect(global.fetch).toHaveBeenCalledWith('https://example.com/allbeers.json', expect.objectContaining({ signal: expect.any(Object) }));

      // Verify that populateBeersTable was called with the correct data
      expect(populateBeersTable).toHaveBeenCalledTimes(1);
      
      // Verify that the data passed to populateBeersTable is the brewInStock array
      const beersPassedToPopulate = (populateBeersTable as jest.Mock).mock.calls[0][0];
      expect(Array.isArray(beersPassedToPopulate)).toBe(true);
      
      // Verify that the data structure matches what we expect
      expect(beersPassedToPopulate).toEqual(allBeersData[1].brewInStock);
      
      // Verify that each beer has the expected properties
      const firstBeer = beersPassedToPopulate[0];
      expect(firstBeer).toHaveProperty('id');
      expect(firstBeer).toHaveProperty('brew_name');
      expect(firstBeer).toHaveProperty('brewer');
      expect(firstBeer).toHaveProperty('brew_style');
      
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

      // Verify that populateBeersTable was not called
      expect(populateBeersTable).not.toHaveBeenCalled();

      // Verify that setPreference was not called
      expect(setPreference).not.toHaveBeenCalled();

      // Verify that an error was logged
      expect(console.error).toHaveBeenCalledWith('All beers API URL not set');
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
      expect(global.fetch).toHaveBeenCalledWith('https://example.com/allbeers.json', expect.objectContaining({ signal: expect.any(Object) }));

      // Verify that populateBeersTable was not called
      expect(populateBeersTable).not.toHaveBeenCalled();

      // Verify that setPreference was not called
      expect(setPreference).not.toHaveBeenCalled();

      // Verify that an error was logged
      expect(console.error).toHaveBeenCalledWith('Failed to fetch all beers data: 404 Not Found');
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
      expect(global.fetch).toHaveBeenCalledWith('https://example.com/allbeers.json', expect.objectContaining({ signal: expect.any(Object) }));

      // Verify that populateBeersTable was not called
      expect(populateBeersTable).not.toHaveBeenCalled();

      // Verify that setPreference was not called
      expect(setPreference).not.toHaveBeenCalled();

      // Verify that an error was logged
      expect(console.error).toHaveBeenCalledWith('Invalid all beers data format: missing brewInStock');
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
      expect(global.fetch).toHaveBeenCalledWith('https://example.com/allbeers.json', expect.objectContaining({ signal: expect.any(Object) }));

      // Verify that populateBeersTable was not called
      expect(populateBeersTable).not.toHaveBeenCalled();

      // Verify that setPreference was not called
      expect(setPreference).not.toHaveBeenCalled();

      // Verify that an error was logged
      expect(console.error).toHaveBeenCalledWith('Network error fetching all beers data:', expect.any(Error));
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
      expect(global.fetch).toHaveBeenCalledWith('https://example.com/mybeers.json', expect.objectContaining({ signal: expect.any(Object) }));

      // Verify that populateMyBeersTable was called with the correct data
      expect(populateMyBeersTable).toHaveBeenCalledTimes(1);
      
      // Verify that the data passed to populateMyBeersTable is the tasted_brew_current_round array
      const beersPassedToPopulate = (populateMyBeersTable as jest.Mock).mock.calls[0][0];
      expect(Array.isArray(beersPassedToPopulate)).toBe(true);
      
      // Verify that the data structure matches what we expect
      expect(beersPassedToPopulate).toEqual(myBeersData[1].tasted_brew_current_round);
      
      // Verify that each beer has the expected properties
      const firstBeer = beersPassedToPopulate[0];
      expect(firstBeer).toHaveProperty('id');
      expect(firstBeer).toHaveProperty('brew_name');
      expect(firstBeer).toHaveProperty('brewer');
      expect(firstBeer).toHaveProperty('brew_style');
      expect(firstBeer).toHaveProperty('tasted_date');
      expect(firstBeer).toHaveProperty('chit_code');
      
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

      // Verify that populateMyBeersTable was not called
      expect(populateMyBeersTable).not.toHaveBeenCalled();

      // Verify that setPreference was not called
      expect(setPreference).not.toHaveBeenCalled();

      // Verify that an error was logged
      expect(console.error).toHaveBeenCalledWith('My beers API URL not set');
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
      expect(global.fetch).toHaveBeenCalledWith('https://example.com/mybeers.json', expect.objectContaining({ signal: expect.any(Object) }));

      // Verify that populateMyBeersTable was not called
      expect(populateMyBeersTable).not.toHaveBeenCalled();

      // Verify that setPreference was not called
      expect(setPreference).not.toHaveBeenCalled();

      // Verify that an error was logged
      expect(console.error).toHaveBeenCalledWith('Failed to fetch my beers data: 404 Not Found');
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
      expect(global.fetch).toHaveBeenCalledWith('https://example.com/mybeers.json', expect.objectContaining({ signal: expect.any(Object) }));

      // Verify that populateMyBeersTable was not called
      expect(populateMyBeersTable).not.toHaveBeenCalled();

      // Verify that setPreference was not called
      expect(setPreference).not.toHaveBeenCalled();

      // Verify that an error was logged
      expect(console.error).toHaveBeenCalledWith('Invalid my beers data format: missing tasted_brew_current_round');
    });

    it('should handle empty tasted beers array (new user or round rollover)', async () => {
      // Create data with empty tasted_brew_current_round array (happens when round rolls over at 200 beers)
      const emptyBeersData = [
        { member: { member_id: '123', name: 'Test User' } },
        { tasted_brew_current_round: [] }  // Empty array - new user or round rollover
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
      expect(global.fetch).toHaveBeenCalledWith('https://example.com/mybeers.json', expect.objectContaining({ signal: expect.any(Object) }));

      // Verify that populateMyBeersTable was called with empty array
      expect(populateMyBeersTable).toHaveBeenCalledWith([]);

      // Verify that setPreference was called to update timestamps
      expect(setPreference).toHaveBeenCalledWith('my_beers_last_update', expect.any(String));
      expect(setPreference).toHaveBeenCalledWith('my_beers_last_check', expect.any(String));

      // Verify that the correct log message was called
      expect(console.log).toHaveBeenCalledWith('Empty tasted beers array - user has no tasted beers in current round (new user or round rollover at 200 beers), clearing database');
    });

    it('should handle data with no valid beers', async () => {
      // Create a modified version of the data with invalid beers (no IDs)
      const invalidBeersData = [
        { member: { member_id: '123', name: 'Test User' } },
        { tasted_brew_current_round: [
          { brew_name: 'Beer 1', brewer: 'Brewery 1' }, // No ID
          { brew_name: 'Beer 2', brewer: 'Brewery 2' }, // No ID
          { brew_name: 'Beer 3', brewer: 'Brewery 3' }  // No ID
        ]}
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
      expect(global.fetch).toHaveBeenCalledWith('https://example.com/mybeers.json', expect.objectContaining({ signal: expect.any(Object) }));

      // Verify that populateMyBeersTable was called with empty array
      expect(populateMyBeersTable).toHaveBeenCalledWith([]);

      // Verify that setPreference was called to update timestamps
      expect(setPreference).toHaveBeenCalledWith('my_beers_last_update', expect.any(String));
      expect(setPreference).toHaveBeenCalledWith('my_beers_last_check', expect.any(String));

      // Verify that the new log message was called
      expect(console.log).toHaveBeenCalledWith('No valid beers with IDs found, but API returned data - clearing database');
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
      expect(global.fetch).toHaveBeenCalledWith('https://example.com/mybeers.json', expect.objectContaining({ signal: expect.any(Object) }));

      // Verify that populateMyBeersTable was not called
      expect(populateMyBeersTable).not.toHaveBeenCalled();

      // Verify that setPreference was not called
      expect(setPreference).not.toHaveBeenCalled();

      // Verify that an error was logged
      expect(console.error).toHaveBeenCalledWith('Network error fetching my beers data:', expect.any(Error));
    });
  });
});
