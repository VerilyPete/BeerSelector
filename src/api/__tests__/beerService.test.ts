import { checkInBeer } from '../beerService';
import { getSessionData } from '../sessionManager';
import { autoLogin } from '../authService';

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
      sessionId: 'test-session-id',
    });

    (autoLogin as jest.Mock).mockResolvedValue({
      success: true,
      sessionData: {
        memberId: 'test-member-id',
        storeId: 'test-store-id',
        storeName: 'Test Store',
        sessionId: 'test-session-id',
      },
    });
  });

  describe('checkInBeer', () => {
    it('should attempt auto-login if session data is missing', async () => {
      // Mock missing session data
      (getSessionData as jest.Mock).mockResolvedValue(null);

      mockApiClient.post.mockResolvedValue({
        success: true,
        data: { message: 'Check-in successful' },
        statusCode: 200,
      });

      const beer = {
        id: 'beer-123',
        brew_name: 'Test Beer',
      };

      await checkInBeer(beer);

      expect(autoLogin).toHaveBeenCalled();
    });
  });
});
