import { vi, type Mock, describe, it, expect, beforeEach } from 'vitest';
import { checkInBeer } from '../beerService';
import { getSessionData } from '../sessionManager';
import { autoLogin } from '../authService';

// Mock dependencies
vi.mock('../sessionManager');
vi.mock('../authService');

// Create a mock API client.
//
// `vi.hoisted` because the `vi.mock` factory below is hoisted above every
// top-level statement; a plain `const` here would still be in its temporal dead
// zone when the factory runs. This was a plain const under jest, whose
// `jest.mock` factory ran lazily on first import instead.
const mockApiClient = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

// Mock the apiClientInstance module
vi.mock('../apiClientInstance', () => ({
  getApiClient: vi.fn().mockReturnValue(mockApiClient),
  apiClient: mockApiClient,
}));

describe('beerService', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mocks
    (getSessionData as Mock).mockResolvedValue({
      memberId: 'test-member-id',
      storeId: 'test-store-id',
      storeName: 'Test Store',
      sessionId: 'test-session-id',
    });

    (autoLogin as Mock).mockResolvedValue({
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
      (getSessionData as Mock).mockResolvedValue(null);

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
