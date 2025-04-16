import { autoLogin, login, logout, handleTapThatAppLogin } from '../authService';
import { saveSessionData, clearSessionData } from '../sessionManager';
import { getApiClient } from '../apiClientInstance';
import { ApiError, SessionData } from '../../types/api';

// Mock dependencies
jest.mock('../sessionManager', () => ({
  saveSessionData: jest.fn().mockResolvedValue(undefined),
  clearSessionData: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../apiClientInstance', () => ({
  getApiClient: jest.fn(),
}));

describe('authService', () => {
  const mockApiClient = {
    post: jest.fn(),
  };

  const mockSessionData: SessionData = {
    memberId: 'test-member-id',
    storeId: 'test-store-id',
    storeName: 'Test Store',
    sessionId: 'test-session-id',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getApiClient as jest.Mock).mockReturnValue(mockApiClient);
  });

  describe('autoLogin', () => {
    it('should return success when auto-login is successful', async () => {
      // Mock successful API response
      mockApiClient.post.mockResolvedValueOnce({
        success: true,
        data: { session: mockSessionData },
        statusCode: 200,
      });

      const result = await autoLogin();

      // Check that the API client was called correctly
      expect(mockApiClient.post).toHaveBeenCalledWith('/auto-login.php', {});
      
      // Check that session data was saved
      expect(saveSessionData).toHaveBeenCalledWith(mockSessionData);
      
      // Check that the result is correct
      expect(result).toEqual({
        success: true,
        message: 'Auto-login successful',
        data: { session: mockSessionData },
        sessionData: mockSessionData,
        statusCode: 200,
      });
    });

    it('should return failure when auto-login fails', async () => {
      // Mock failed API response
      mockApiClient.post.mockResolvedValueOnce({
        success: false,
        error: 'Invalid credentials',
        statusCode: 401,
      });

      const result = await autoLogin();

      // Check that the API client was called correctly
      expect(mockApiClient.post).toHaveBeenCalledWith('/auto-login.php', {});
      
      // Check that session data was not saved
      expect(saveSessionData).not.toHaveBeenCalled();
      
      // Check that the result is correct
      expect(result).toEqual({
        success: false,
        error: 'Invalid credentials',
        statusCode: 401,
      });
    });

    it('should handle API errors', async () => {
      // Mock API error
      const apiError = new ApiError('Network error', 0, true, false);
      mockApiClient.post.mockRejectedValueOnce(apiError);

      const result = await autoLogin();

      // Check that the result contains the error
      expect(result).toEqual({
        success: false,
        error: 'Network error',
        statusCode: 0,
      });
    });

    it('should handle unknown errors', async () => {
      // Mock unknown error
      mockApiClient.post.mockRejectedValueOnce(new Error('Unknown error'));

      const result = await autoLogin();

      // Check that the result contains a generic error message
      expect(result).toEqual({
        success: false,
        error: 'Unknown error',
        statusCode: 500,
      });
    });
  });

  describe('login', () => {
    it('should return success when login is successful', async () => {
      // Mock successful API response
      mockApiClient.post.mockResolvedValueOnce({
        success: true,
        data: { session: mockSessionData },
        statusCode: 200,
      });

      const result = await login('testuser', 'password123');

      // Check that the API client was called correctly
      expect(mockApiClient.post).toHaveBeenCalledWith('/login.php', {
        username: 'testuser',
        password: 'password123',
      });
      
      // Check that session data was saved
      expect(saveSessionData).toHaveBeenCalledWith(mockSessionData);
      
      // Check that the result is correct
      expect(result).toEqual({
        success: true,
        message: 'Login successful',
        data: { session: mockSessionData },
        sessionData: mockSessionData,
        statusCode: 200,
      });
    });

    it('should return failure when login fails', async () => {
      // Mock failed API response
      mockApiClient.post.mockResolvedValueOnce({
        success: false,
        error: 'Invalid credentials',
        statusCode: 401,
      });

      const result = await login('testuser', 'wrongpassword');

      // Check that the API client was called correctly
      expect(mockApiClient.post).toHaveBeenCalledWith('/login.php', {
        username: 'testuser',
        password: 'wrongpassword',
      });
      
      // Check that session data was not saved
      expect(saveSessionData).not.toHaveBeenCalled();
      
      // Check that the result is correct
      expect(result).toEqual({
        success: false,
        error: 'Invalid credentials',
        statusCode: 401,
      });
    });

    it('should validate input parameters', async () => {
      // Test with empty username
      let result = await login('', 'password123');
      
      // Check that the API client was not called
      expect(mockApiClient.post).not.toHaveBeenCalled();
      
      // Check that the result is correct
      expect(result).toEqual({
        success: false,
        error: 'Username and password are required',
        statusCode: 400,
      });

      // Test with empty password
      result = await login('testuser', '');
      
      // Check that the API client was not called
      expect(mockApiClient.post).not.toHaveBeenCalled();
      
      // Check that the result is correct
      expect(result).toEqual({
        success: false,
        error: 'Username and password are required',
        statusCode: 400,
      });
    });
  });

  describe('logout', () => {
    it('should return success when logout is successful', async () => {
      // Mock successful API response
      mockApiClient.post.mockResolvedValueOnce({
        success: true,
        statusCode: 200,
      });

      const result = await logout();

      // Check that the API client was called correctly
      expect(mockApiClient.post).toHaveBeenCalledWith('/logout.php', {});
      
      // Check that session data was cleared
      expect(clearSessionData).toHaveBeenCalled();
      
      // Check that the result is correct
      expect(result).toEqual({
        success: true,
        message: 'Logout successful',
        statusCode: 200,
      });
    });

    it('should handle API errors during logout', async () => {
      // Mock API error
      const apiError = new ApiError('Network error', 0, true, false);
      mockApiClient.post.mockRejectedValueOnce(apiError);

      const result = await logout();

      // Check that the result contains the error
      expect(result).toEqual({
        success: false,
        error: 'Network error',
        statusCode: 0,
      });
    });
  });

  describe('handleTapThatAppLogin', () => {
    it('should parse cookies string and save session data', async () => {
      const cookiesString = 'PHPSESSID=test-session-id; member_id=test-member-id; store__id=test-store-id; store_name=Test%20Store';
      
      const result = await handleTapThatAppLogin(cookiesString);
      
      // Check that session data was saved with the correct values
      expect(saveSessionData).toHaveBeenCalledWith({
        sessionId: 'test-session-id',
        memberId: 'test-member-id',
        storeId: 'test-store-id',
        storeName: 'Test Store',
      });
      
      // Check that the result is correct
      expect(result).toEqual({
        success: true,
        message: 'Login successful',
        sessionData: {
          sessionId: 'test-session-id',
          memberId: 'test-member-id',
          storeId: 'test-store-id',
          storeName: 'Test Store',
        },
        statusCode: 200,
      });
    });

    it('should handle cookies object', async () => {
      const cookiesObject = {
        PHPSESSID: 'test-session-id',
        member_id: 'test-member-id',
        store__id: 'test-store-id',
        store_name: 'Test%20Store',
      };
      
      const result = await handleTapThatAppLogin(cookiesObject);
      
      // Check that session data was saved with the correct values
      expect(saveSessionData).toHaveBeenCalledWith({
        sessionId: 'test-session-id',
        memberId: 'test-member-id',
        storeId: 'test-store-id',
        storeName: 'Test Store',
      });
      
      // Check that the result is correct
      expect(result).toEqual({
        success: true,
        message: 'Login successful',
        sessionData: {
          sessionId: 'test-session-id',
          memberId: 'test-member-id',
          storeId: 'test-store-id',
          storeName: 'Test Store',
        },
        statusCode: 200,
      });
    });

    it('should return failure when required cookies are missing', async () => {
      // Missing sessionId
      let result = await handleTapThatAppLogin({
        member_id: 'test-member-id',
        store__id: 'test-store-id',
      });
      
      // Check that session data was not saved
      expect(saveSessionData).not.toHaveBeenCalled();
      
      // Check that the result is correct
      expect(result).toEqual({
        success: false,
        error: 'Missing required login data',
        statusCode: 401,
      });

      // Missing memberId
      result = await handleTapThatAppLogin({
        PHPSESSID: 'test-session-id',
        store__id: 'test-store-id',
      });
      
      // Check that the result is correct
      expect(result).toEqual({
        success: false,
        error: 'Missing required login data',
        statusCode: 401,
      });

      // Missing storeId
      result = await handleTapThatAppLogin({
        PHPSESSID: 'test-session-id',
        member_id: 'test-member-id',
      });
      
      // Check that the result is correct
      expect(result).toEqual({
        success: false,
        error: 'Missing required login data',
        statusCode: 401,
      });
    });

    it('should handle malformed cookie values gracefully', async () => {
      // Malformed store_name (invalid URI component)
      const cookiesString = 'PHPSESSID=test-session-id; member_id=test-member-id; store__id=test-store-id; store_name=%invalid';
      
      const result = await handleTapThatAppLogin(cookiesString);
      
      // Check that session data was saved with the correct values (store_name should be raw value)
      expect(saveSessionData).toHaveBeenCalledWith({
        sessionId: 'test-session-id',
        memberId: 'test-member-id',
        storeId: 'test-store-id',
        storeName: '%invalid',
      });
      
      // Check that the result is correct
      expect(result).toEqual({
        success: true,
        message: 'Login successful',
        sessionData: {
          sessionId: 'test-session-id',
          memberId: 'test-member-id',
          storeId: 'test-store-id',
          storeName: '%invalid',
        },
        statusCode: 200,
      });
    });
  });
});
