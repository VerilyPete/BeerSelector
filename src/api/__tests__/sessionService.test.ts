import { refreshSession, getValidSession } from '../sessionService';
import { getSessionData, saveSessionData } from '../sessionManager';
import { validateSession } from '../sessionValidator';
import { getApiClient } from '../apiClientInstance';
import { SessionData } from '../../types/api';

// Mock dependencies
jest.mock('../sessionManager', () => ({
  getSessionData: jest.fn(),
  saveSessionData: jest.fn(),
}));

jest.mock('../sessionValidator', () => ({
  validateSession: jest.fn(),
}));

jest.mock('../apiClientInstance', () => ({
  getApiClient: jest.fn(),
}));

// Mock console methods
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

describe('sessionService', () => {
  const mockSessionData: SessionData = {
    memberId: 'test-member-id',
    storeId: 'test-store-id',
    storeName: 'Test Store',
    sessionId: 'test-session-id',
  };

  const mockApiClient = {
    post: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock console methods to prevent noise in tests
    console.log = jest.fn();
    console.error = jest.fn();

    // Set up default mocks
    (getApiClient as jest.Mock).mockReturnValue(mockApiClient);
    (validateSession as jest.Mock).mockImplementation(data => Promise.resolve(data));
  });

  afterEach(() => {
    // Restore console methods
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  });

  describe('refreshSession', () => {
    it('should refresh session successfully', async () => {
      // Mock successful API response matching ApiResponse<T> discriminated union
      mockApiClient.post.mockResolvedValueOnce({
        success: true,
        data: {
          success: true,
          session: mockSessionData,
        },
        statusCode: 200,
      });

      const result = await refreshSession();

      // Check that the API client was called correctly
      expect(mockApiClient.post).toHaveBeenCalledWith('/auto-login.php', {});

      // Check that session data was saved
      expect(saveSessionData).toHaveBeenCalledWith(mockSessionData);

      // Check that the session was validated
      expect(validateSession).toHaveBeenCalledWith(mockSessionData);

      // Check that the result is correct
      expect(result).toEqual(mockSessionData);
    });

    it('should return null when refresh fails', async () => {
      // Mock failed API response matching ApiResponse<T> discriminated union
      mockApiClient.post.mockResolvedValueOnce({
        success: false,
        data: null,
        error: 'Invalid credentials',
        statusCode: 401,
      });

      const result = await refreshSession();

      // Check that session data was not saved
      expect(saveSessionData).not.toHaveBeenCalled();

      // Check that the result is null
      expect(result).toBeNull();
    });

    it('should handle API errors', async () => {
      // Mock API error
      mockApiClient.post.mockRejectedValueOnce(new Error('Network error'));

      const result = await refreshSession();

      // Check that the error was logged
      expect(console.error).toHaveBeenCalledWith('Error refreshing session:', expect.any(Error));

      // Check that the result is null
      expect(result).toBeNull();
    });
  });

  describe('getValidSession', () => {
    it('should return valid session when session exists', async () => {
      // Mock existing valid session
      (getSessionData as jest.Mock).mockResolvedValueOnce(mockSessionData);
      (validateSession as jest.Mock).mockResolvedValueOnce(mockSessionData);

      const result = await getValidSession();

      // Check that the session was validated
      expect(validateSession).toHaveBeenCalledWith(mockSessionData);

      // Check that the result is correct
      expect(result).toEqual(mockSessionData);
    });

    it('should attempt refresh when session is invalid', async () => {
      // Mock invalid session
      (getSessionData as jest.Mock).mockResolvedValueOnce(mockSessionData);
      (validateSession as jest.Mock)
        .mockResolvedValueOnce(null) // First call in getValidSession returns null
        .mockResolvedValueOnce(mockSessionData); // Second call in refreshSession returns data

      // Mock successful refresh matching ApiResponse<T> discriminated union
      mockApiClient.post.mockResolvedValueOnce({
        success: true,
        data: {
          success: true,
          session: mockSessionData,
        },
        statusCode: 200,
      });

      const result = await getValidSession();

      // Check that refresh was attempted
      expect(console.log).toHaveBeenCalledWith('Session invalid or missing, attempting refresh');
      expect(mockApiClient.post).toHaveBeenCalledWith('/auto-login.php', {});

      // Check that the result is from the refresh
      expect(result).toEqual(mockSessionData);
    });

    it('should return null when session is invalid and refresh fails', async () => {
      // Mock invalid session
      (getSessionData as jest.Mock).mockResolvedValueOnce(mockSessionData);
      (validateSession as jest.Mock).mockResolvedValueOnce(null);

      // Mock failed refresh matching ApiResponse<T> discriminated union
      mockApiClient.post.mockResolvedValueOnce({
        success: false,
        data: null,
        error: 'Invalid credentials',
        statusCode: 401,
      });

      const result = await getValidSession();

      // Check that the result is null
      expect(result).toBeNull();
    });

    it('should handle errors', async () => {
      // Mock error
      (getSessionData as jest.Mock).mockRejectedValueOnce(new Error('Storage error'));

      const result = await getValidSession();

      // Check that the error was logged
      expect(console.error).toHaveBeenCalledWith('Error getting valid session:', expect.any(Error));

      // Check that the result is null
      expect(result).toBeNull();
    });
  });
});
