import { fetchAndUpdateAllBeers, fetchAndUpdateMyBeers } from '../dataUpdateService';
import { Beer, Beerfinder } from '../../types/beer';

// Mock database preferences
jest.mock('../../database/preferences', () => ({
  getPreference: jest.fn(),
  setPreference: jest.fn(),
}));

// Mock repositories
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

// Import mocked functions after setting up mocks
import { getPreference, setPreference } from '../../database/preferences';
import { beerRepository } from '../../database/repositories/BeerRepository';
import { myBeersRepository } from '../../database/repositories/MyBeersRepository';

// Mock fetch
global.fetch = jest.fn();

// Mock console methods
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

describe('dataUpdateService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock console methods to prevent noise in tests
    console.log = jest.fn();
    console.error = jest.fn();
    
    // Default mock for fetch
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue([]),
    });
  });
  
  afterEach(() => {
    // Restore console methods
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  });
  
  describe('fetchAndUpdateAllBeers', () => {
    it('should return failure result if API URL is not set', async () => {
      // Mock getPreference to return null (no API URL set)
      (getPreference as jest.Mock).mockResolvedValueOnce(null);

      const result = await fetchAndUpdateAllBeers();

      expect(result.success).toBe(false);
      expect(result.dataUpdated).toBe(false);
      expect(result.error).toBeDefined();
      expect(getPreference).toHaveBeenCalledWith('all_beers_api_url');
      expect(console.error).toHaveBeenCalledWith('All beers API URL not set');
    });
    
    it('should return failure result if fetch fails', async () => {
      // Mock getPreference to return an API URL
      (getPreference as jest.Mock).mockResolvedValueOnce('https://example.com/api/all-beers');

      // Mock fetch to fail
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const result = await fetchAndUpdateAllBeers();

      expect(result.success).toBe(false);
      expect(result.dataUpdated).toBe(false);
      expect(result.error).toBeDefined();
      expect(getPreference).toHaveBeenCalledWith('all_beers_api_url');
      expect(global.fetch).toHaveBeenCalledWith('https://example.com/api/all-beers', expect.objectContaining({ signal: expect.any(Object) }));
      expect(console.error).toHaveBeenCalledWith('Failed to fetch all beers data: 500 Internal Server Error');
    });
    
    it('should return failure result if response is not an array', async () => {
      // Mock getPreference to return an API URL
      (getPreference as jest.Mock).mockResolvedValueOnce('https://example.com/api/all-beers');

      // Mock fetch to return a non-array response
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce({ error: 'Invalid data' }),
      });

      const result = await fetchAndUpdateAllBeers();

      expect(result.success).toBe(false);
      expect(result.dataUpdated).toBe(false);
      expect(result.error).toBeDefined();
      expect(console.error).toHaveBeenCalledWith('Invalid all beers data format: missing brewInStock');
    });
    
    it('should return failure result if response does not contain brewInStock', async () => {
      // Mock getPreference to return an API URL
      (getPreference as jest.Mock).mockResolvedValueOnce('https://example.com/api/all-beers');

      // Mock fetch to return an array without brewInStock
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce([
          { something: 'else' },
          { notBrewInStock: [] }
        ]),
      });

      const result = await fetchAndUpdateAllBeers();

      expect(result.success).toBe(false);
      expect(result.dataUpdated).toBe(false);
      expect(result.error).toBeDefined();
      expect(console.error).toHaveBeenCalledWith('Invalid all beers data format: missing brewInStock');
    });
    
    it('should successfully update all beers', async () => {
      // Mock getPreference to return an API URL
      (getPreference as jest.Mock).mockResolvedValueOnce('https://example.com/api/all-beers');

      // Mock beers data
      const mockBeers: Beer[] = [
        { id: 'beer-1', brew_name: 'Test Beer 1', brewer: 'Brewery 1' },
        { id: 'beer-2', brew_name: 'Test Beer 2', brewer: 'Brewery 2' }
      ];

      // Mock fetch to return valid data
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce([
          { something: 'else' },
          { brewInStock: mockBeers }
        ]),
      });

      // Mock beerRepository.insertMany to succeed
      (beerRepository.insertMany as jest.Mock).mockResolvedValueOnce(undefined);

      // Mock setPreference to succeed
      (setPreference as jest.Mock).mockResolvedValue(undefined);

      const result = await fetchAndUpdateAllBeers();

      expect(result.success).toBe(true);
      expect(result.dataUpdated).toBe(true);
      expect(result.itemCount).toBe(mockBeers.length);
      expect(beerRepository.insertMany).toHaveBeenCalledWith(mockBeers);
      expect(setPreference).toHaveBeenCalledWith('all_beers_last_update', expect.any(String));
      expect(setPreference).toHaveBeenCalledWith('all_beers_last_check', expect.any(String));
      expect(console.log).toHaveBeenCalledWith(`Updated all beers data with ${mockBeers.length} beers`);
    });
    
    it('should handle errors during update', async () => {
      // Mock getPreference to return an API URL
      (getPreference as jest.Mock).mockResolvedValueOnce('https://example.com/api/all-beers');

      // Mock fetch to throw an error
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      const result = await fetchAndUpdateAllBeers();

      expect(result.success).toBe(false);
      expect(result.dataUpdated).toBe(false);
      expect(result.error).toBeDefined();
      expect(console.error).toHaveBeenCalledWith('Network error fetching all beers data:', expect.any(Error));
    });
  });
  
  describe('fetchAndUpdateMyBeers', () => {
    it('should return failure result if API URL is not set', async () => {
      // Mock getPreference to return null for visitor mode check, then null for API URL
      (getPreference as jest.Mock)
        .mockResolvedValueOnce('false') // is_visitor_mode
        .mockResolvedValueOnce(null);   // my_beers_api_url

      const result = await fetchAndUpdateMyBeers();

      expect(result.success).toBe(false);
      expect(result.dataUpdated).toBe(false);
      expect(result.error).toBeDefined();
      expect(getPreference).toHaveBeenCalledWith('my_beers_api_url');
      expect(console.error).toHaveBeenCalledWith('My beers API URL not set');
    });
    
    it('should return failure result if fetch fails', async () => {
      // Mock getPreference for visitor mode check and API URL
      (getPreference as jest.Mock)
        .mockResolvedValueOnce('false') // is_visitor_mode
        .mockResolvedValueOnce('https://example.com/api/my-beers'); // my_beers_api_url

      // Mock fetch to fail
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const result = await fetchAndUpdateMyBeers();

      expect(result.success).toBe(false);
      expect(result.dataUpdated).toBe(false);
      expect(result.error).toBeDefined();
      expect(getPreference).toHaveBeenCalledWith('my_beers_api_url');
      expect(global.fetch).toHaveBeenCalledWith('https://example.com/api/my-beers', expect.objectContaining({ signal: expect.any(Object) }));
      expect(console.error).toHaveBeenCalledWith('Failed to fetch my beers data: 500 Internal Server Error');
    });
    
    it('should return failure result if response is not an array', async () => {
      // Mock getPreference for visitor mode check and API URL
      (getPreference as jest.Mock)
        .mockResolvedValueOnce('false') // is_visitor_mode
        .mockResolvedValueOnce('https://example.com/api/my-beers'); // my_beers_api_url

      // Mock fetch to return a non-array response
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce({ error: 'Invalid data' }),
      });

      const result = await fetchAndUpdateMyBeers();

      expect(result.success).toBe(false);
      expect(result.dataUpdated).toBe(false);
      expect(result.error).toBeDefined();
      expect(console.error).toHaveBeenCalledWith('Invalid my beers data format: missing tasted_brew_current_round');
    });
    
    it('should return failure result if response does not contain tasted_brew_current_round', async () => {
      // Mock getPreference for visitor mode check and API URL
      (getPreference as jest.Mock)
        .mockResolvedValueOnce('false') // is_visitor_mode
        .mockResolvedValueOnce('https://example.com/api/my-beers'); // my_beers_api_url

      // Mock fetch to return an array without tasted_brew_current_round
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce([
          { something: 'else' },
          { notTastedBrewCurrentRound: [] }
        ]),
      });

      const result = await fetchAndUpdateMyBeers();

      expect(result.success).toBe(false);
      expect(result.dataUpdated).toBe(false);
      expect(result.error).toBeDefined();
      expect(console.error).toHaveBeenCalledWith('Invalid my beers data format: missing tasted_brew_current_round');
    });
    
    it('should return success with 0 items if no valid beers with IDs are found', async () => {
      // Mock getPreference for visitor mode check and API URL
      (getPreference as jest.Mock)
        .mockResolvedValueOnce('false') // is_visitor_mode
        .mockResolvedValueOnce('https://example.com/api/my-beers'); // my_beers_api_url

      // Mock beers data without IDs
      const mockBeers: Partial<Beerfinder>[] = [
        { brew_name: 'Test Beer 1', brewer: 'Brewery 1' },
        { brew_name: 'Test Beer 2', brewer: 'Brewery 2' }
      ];

      // Mock fetch to return data with invalid beers
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce([
          { something: 'else' },
          { tasted_brew_current_round: mockBeers }
        ]),
      });

      // Mock myBeersRepository.insertMany and setPreference to succeed
      (myBeersRepository.insertMany as jest.Mock).mockResolvedValueOnce(undefined);
      (setPreference as jest.Mock).mockResolvedValue(undefined);

      const result = await fetchAndUpdateMyBeers();

      expect(result.success).toBe(true);
      expect(result.dataUpdated).toBe(true);
      expect(result.itemCount).toBe(0);
      expect(console.log).toHaveBeenCalledWith('No valid beers with IDs found, but API returned data - clearing database');
    });
    
    it('should successfully update my beers', async () => {
      // Mock getPreference for visitor mode check and API URL
      (getPreference as jest.Mock)
        .mockResolvedValueOnce('false') // is_visitor_mode
        .mockResolvedValueOnce('https://example.com/api/my-beers'); // my_beers_api_url

      // Mock beers data with IDs
      const mockBeers: Beerfinder[] = [
        { id: 'beer-1', brew_name: 'Test Beer 1', tasted_date: '2023-01-01' },
        { id: 'beer-2', brew_name: 'Test Beer 2', tasted_date: '2023-01-02' }
      ];

      // Mock fetch to return valid data
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce([
          { something: 'else' },
          { tasted_brew_current_round: mockBeers }
        ]),
      });

      // Mock myBeersRepository.insertMany to succeed
      (myBeersRepository.insertMany as jest.Mock).mockResolvedValueOnce(undefined);

      // Mock setPreference to succeed
      (setPreference as jest.Mock).mockResolvedValue(undefined);

      const result = await fetchAndUpdateMyBeers();

      expect(result.success).toBe(true);
      expect(result.dataUpdated).toBe(true);
      expect(result.itemCount).toBe(mockBeers.length);
      expect(myBeersRepository.insertMany).toHaveBeenCalledWith(mockBeers);
      expect(setPreference).toHaveBeenCalledWith('my_beers_last_update', expect.any(String));
      expect(setPreference).toHaveBeenCalledWith('my_beers_last_check', expect.any(String));
      expect(console.log).toHaveBeenCalledWith(`Updated my beers data with ${mockBeers.length} valid beers`);
    });
    
    it('should handle errors during update', async () => {
      // Mock getPreference for visitor mode check and API URL
      (getPreference as jest.Mock)
        .mockResolvedValueOnce('false') // is_visitor_mode
        .mockResolvedValueOnce('https://example.com/api/my-beers'); // my_beers_api_url

      // Mock fetch to throw an error
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      const result = await fetchAndUpdateMyBeers();

      expect(result.success).toBe(false);
      expect(result.dataUpdated).toBe(false);
      expect(result.error).toBeDefined();
      expect(console.error).toHaveBeenCalledWith('Network error fetching my beers data:', expect.any(Error));
    });
  });
});
