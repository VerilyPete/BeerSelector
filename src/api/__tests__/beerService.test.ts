import { checkInBeer, getBeerDetails, searchBeers } from '../beerService';
import { getSessionData } from '../sessionManager';
import { autoLogin } from '../authService';
import { ApiError } from '../../types/api';

// Mock dependencies
jest.mock('../sessionManager');
jest.mock('../authService');

// Create a mock API client
const mockApiClient = {
  get: jest.fn(),
  post: jest.fn(),
};

// Mock the apiClientInstance module
jest.mock('../apiClientInstance', () => ({
  getApiClient: jest.fn().mockReturnValue(mockApiClient),
  apiClient: mockApiClient,
}));

describe('beerService', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Setup default mocks
    (getSessionData as jest.Mock).mockResolvedValue({
      memberId: 'test-member-id',
      storeId: 'test-store-id',
      storeName: 'Test Store',
      sessionId: 'test-session-id'
    });

    (autoLogin as jest.Mock).mockResolvedValue({
      success: true,
      sessionData: {
        memberId: 'test-member-id',
        storeId: 'test-store-id',
        storeName: 'Test Store',
        sessionId: 'test-session-id'
      }
    });
  });

  describe('checkInBeer', () => {
    it.skip('should successfully check in a beer', async () => {
      // Mock the ApiClient post method
      mockApiClient.post.mockResolvedValue({
        success: true,
        data: { message: 'Check-in successful' },
        statusCode: 200
      });

      const beer = {
        id: 'beer-123',
        brew_name: 'Test Beer',
        brewer: 'Test Brewery'
      };

      const result = await checkInBeer(beer);

      expect(result).toEqual({
        success: true,
        message: 'Check-in processed successfully (empty response)'
      });

      expect(mockApiClient.post).toHaveBeenCalledWith(
        '/addToQueue.php',
        expect.objectContaining({
          chitCode: 'beer-123-test-store-id-test-member-id',
          chitBrewId: 'beer-123',
          chitBrewName: 'Test Beer',
          chitStoreName: 'Test Store'
        })
      );
    });

    it('should attempt auto-login if session data is missing', async () => {
      // Mock missing session data
      (getSessionData as jest.Mock).mockResolvedValue(null);

      mockApiClient.post.mockResolvedValue({
        success: true,
        data: { message: 'Check-in successful' },
        statusCode: 200
      });

      const beer = {
        id: 'beer-123',
        brew_name: 'Test Beer'
      };

      await checkInBeer(beer);

      expect(autoLogin).toHaveBeenCalled();
    });

    it.skip('should handle API errors gracefully', async () => {
      // Mock a failed API response
      mockApiClient.post.mockResolvedValue({
        success: false,
        error: 'API error',
        statusCode: 500
      });

      const beer = {
        id: 'beer-123',
        brew_name: 'Test Beer'
      };

      const result = await checkInBeer(beer);

      expect(result).toEqual({
        success: false,
        error: 'API error',
        message: 'Check-in failed due to API error'
      });
    });
  });

  describe('getBeerDetails', () => {
    it.skip('should return beer details for a valid ID', async () => {
      mockApiClient.get.mockResolvedValue({
        success: true,
        data: {
          id: 'beer-123',
          brew_name: 'Test Beer',
          brewer: 'Test Brewery'
        },
        statusCode: 200
      });

      const result = await getBeerDetails('beer-123');

      expect(result.success).toBe(true);
      // The data property should contain the data from the API response
      expect(result.data).toEqual({
        id: 'beer-123',
        brew_name: 'Test Beer',
        brewer: 'Test Brewery'
      });

      expect(mockApiClient.get).toHaveBeenCalledWith('/beer-details.php?id=beer-123');
    });

    it('should handle empty beer ID', async () => {
      const result = await getBeerDetails('');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Beer ID is required');
    });
  });

  describe('searchBeers', () => {
    it.skip('should search beers with a valid query', async () => {
      mockApiClient.get.mockResolvedValue({
        success: true,
        data: [
          { id: 'beer-123', brew_name: 'Test Beer 1' },
          { id: 'beer-456', brew_name: 'Test Beer 2' }
        ],
        statusCode: 200
      });

      const result = await searchBeers('test');

      expect(result.success).toBe(true);
      // The data property should be an array with 2 items
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBe(2);
      expect(mockApiClient.get).toHaveBeenCalledWith('/search-beers.php?q=test');
    });

    it('should handle empty search query', async () => {
      const result = await searchBeers('');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Search query is required');
    });
  });
});
