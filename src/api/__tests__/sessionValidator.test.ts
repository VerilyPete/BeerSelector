import { validateSession, getCurrentSession } from '../sessionValidator';
import { getSessionData } from '../sessionManager';
import { ApiError, SessionData } from '../../types/api';

// Mock the sessionManager
jest.mock('../sessionManager', () => ({
  getSessionData: jest.fn(),
}));

// Mock console methods
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

describe('sessionValidator', () => {
  const mockSessionData: SessionData = {
    memberId: 'test-member-id',
    storeId: 'test-store-id',
    storeName: 'Test Store',
    sessionId: 'test-session-id',
    username: 'testuser',
    firstName: 'Test',
    lastName: 'User',
    email: 'test@example.com',
    cardNum: '12345'
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock console methods to prevent noise in tests
    console.warn = jest.fn();
    console.error = jest.fn();
  });

  afterEach(() => {
    // Restore console methods
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
  });

  describe('validateSession', () => {
    it('should return session data when valid', async () => {
      const result = await validateSession(mockSessionData);

      expect(result).toEqual(mockSessionData);
    });

    it('should return null when session data is null', async () => {
      const result = await validateSession(null);

      expect(result).toBeNull();
      expect(console.warn).toHaveBeenCalledWith('Session validation failed: No session data provided');
    });

    it('should return null when session data fails type guard validation', async () => {
      // Create a partial session data object that fails the type guard
      const invalidSessionData = {
        memberId: 'test-member-id',
        storeId: 'test-store-id',
        // Missing storeName and sessionId
      };

      const result = await validateSession(invalidSessionData as any);

      expect(result).toBeNull();
      expect(console.warn).toHaveBeenCalledWith(
        'Session validation failed: Invalid session data format'
      );
    });

    it('should return null when session data is missing required fields', async () => {
      // Create a session data object that passes the type guard but has null values
      const invalidSessionData = {
        memberId: 'test-member-id',
        storeId: 'test-store-id',
        storeName: '',
        sessionId: '',
      };

      const result = await validateSession(invalidSessionData);

      expect(result).toBeNull();
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Session validation failed: Missing required fields:')
      );
    });

    it('should return null when session data has empty required fields', async () => {
      const invalidSessionData = {
        memberId: 'test-member-id',
        storeId: 'test-store-id',
        storeName: '',
        sessionId: '',
      };

      const result = await validateSession(invalidSessionData);

      expect(result).toBeNull();
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Session validation failed: Missing required fields:')
      );
    });
  });

  describe('getCurrentSession', () => {
    it('should return validated session data', async () => {
      (getSessionData as jest.Mock).mockResolvedValueOnce(mockSessionData);

      const result = await getCurrentSession();

      expect(result).toEqual(mockSessionData);
    });

    it('should return null when no session data exists', async () => {
      (getSessionData as jest.Mock).mockResolvedValueOnce(null);

      const result = await getCurrentSession();

      expect(result).toBeNull();
    });

    it('should return null when session data is invalid', async () => {
      (getSessionData as jest.Mock).mockResolvedValueOnce({
        // Missing required fields
        username: 'testuser',
      });

      const result = await getCurrentSession();

      expect(result).toBeNull();
    });

    it('should throw ApiError when getSessionData throws an error', async () => {
      const error = new Error('Storage error');
      (getSessionData as jest.Mock).mockRejectedValueOnce(error);

      await expect(getCurrentSession()).rejects.toThrow(ApiError);
      expect(console.error).toHaveBeenCalledWith('Error getting current session:', error);
    });

    it('should rethrow ApiError when getSessionData throws an ApiError', async () => {
      const apiError = new ApiError('API error', 401, false, false);
      (getSessionData as jest.Mock).mockRejectedValueOnce(apiError);

      await expect(getCurrentSession()).rejects.toThrow(apiError);
      expect(console.error).toHaveBeenCalledWith('Error getting current session:', apiError);
    });
  });
});
