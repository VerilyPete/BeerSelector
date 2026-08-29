import { vi, type Mock, describe, it, expect, beforeEach } from 'vitest';
import { autoLogin, login, logout, handleTapThatAppLogin } from '../authService';
import { saveSessionData, clearSessionData, clearAuthCookies } from '../sessionManager';
import { clearApiClientSessionCache, getApiClient } from '../apiClientInstance';
import { ApiError, SessionData } from '../../types/api';
import { getPreference, setPreference } from '../../database/preferences';
import { refreshAllDataFromAPI } from '../../services/dataUpdateService';
import { clearNativeCookies } from '../nativeCookieManager';
import { Platform } from 'react-native';

// Mock dependencies
vi.mock('../sessionManager', () => ({
  saveSessionData: vi.fn().mockResolvedValue(undefined),
  clearSessionData: vi.fn().mockResolvedValue(undefined),
  clearAuthCookies: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../apiClientInstance', () => ({
  getApiClient: vi.fn(),
  clearApiClientSessionCache: vi.fn(),
}));

vi.mock('../nativeCookieManager', () => ({
  clearNativeCookies: vi.fn().mockResolvedValue(undefined),
}));

// Mock database functions
vi.mock('../../database/preferences', () => ({
  getPreference: vi.fn().mockResolvedValue(null),

  setPreference: vi.fn().mockResolvedValue(undefined),
  areApiUrlsConfigured: vi.fn().mockResolvedValue(true),
}));

// Mock dataUpdateService functions
vi.mock('../../services/dataUpdateService', () => ({
  refreshAllDataFromAPI: vi.fn().mockResolvedValue({ allBeers: [], myBeers: [], rewards: [] }),
}));

describe('authService', () => {
  const mockApiClient = {
    post: vi.fn(),
  };

  const mockSessionData: SessionData = {
    memberId: 'test-member-id',
    storeId: 'test-store-id',
    storeName: 'Test Store',
    sessionId: 'test-session-id',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (Platform as { OS: string }).OS = 'ios';
    (getApiClient as Mock).mockReturnValue(mockApiClient);
    // Reset database mocks to default values
    (getPreference as Mock).mockResolvedValue(null);
    (setPreference as Mock).mockResolvedValue(undefined);
    (refreshAllDataFromAPI as Mock).mockResolvedValue(undefined);
    (clearSessionData as Mock).mockResolvedValue(undefined);
    (clearAuthCookies as Mock).mockResolvedValue(undefined);
    (clearNativeCookies as Mock).mockResolvedValue(undefined);
    (clearApiClientSessionCache as Mock).mockReturnValue(undefined);
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
        isVisitorMode: false,
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
        isVisitorMode: false,
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
      expect(clearAuthCookies).toHaveBeenCalled();
      expect(clearNativeCookies).toHaveBeenCalled();
      expect(clearApiClientSessionCache).toHaveBeenCalledTimes(1);

      // Check that the result is correct
      expect(result).toEqual({
        success: true,
        message: 'Logout successful',
        statusCode: 200,
      });
    });

    it('uses successful remote logout as the browser cookie revocation mechanism', async () => {
      (Platform as { OS: string }).OS = 'web';
      mockApiClient.post.mockResolvedValueOnce({ success: true, statusCode: 200 });

      await expect(logout()).resolves.toMatchObject({ success: true });

      expect(clearNativeCookies).not.toHaveBeenCalled();
      expect(clearSessionData).toHaveBeenCalled();
      expect(clearAuthCookies).toHaveBeenCalled();
    });

    it('reports that browser cookies cannot be locally revoked after remote failure', async () => {
      (Platform as { OS: string }).OS = 'web';
      mockApiClient.post.mockResolvedValueOnce({
        success: false,
        error: 'Remote logout failed',
        statusCode: 503,
      });
      (clearNativeCookies as Mock).mockRejectedValueOnce(
        new Error('Browser authentication cookies require a successful server-side logout')
      );

      await expect(logout()).resolves.toMatchObject({
        success: false,
        error: expect.stringContaining('Browser authentication cookies require'),
      });

      expect(clearNativeCookies).toHaveBeenCalledTimes(1);
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
      expect(clearSessionData).toHaveBeenCalled();
      expect(clearAuthCookies).toHaveBeenCalled();
      expect(clearNativeCookies).toHaveBeenCalled();
      expect(setPreference).toHaveBeenCalledWith(
        'is_visitor_mode',
        'false',
        'Flag indicating whether the user is in visitor mode'
      );
    });

    it('attempts every local cleanup when one deletion fails', async () => {
      mockApiClient.post.mockResolvedValueOnce({ success: true, statusCode: 200 });
      (clearSessionData as Mock).mockRejectedValueOnce(new Error('session delete failed'));

      const result = await logout();

      expect(clearSessionData).toHaveBeenCalled();
      expect(clearAuthCookies).toHaveBeenCalled();
      expect(setPreference).toHaveBeenCalledWith(
        'is_visitor_mode',
        'false',
        'Flag indicating whether the user is in visitor mode'
      );
      expect(result).toEqual({
        success: false,
        error: 'Local logout cleanup failed: session delete failed',
        statusCode: 500,
      });
    });

    it('reports a local cleanup failure even when remote logout also fails', async () => {
      mockApiClient.post.mockRejectedValueOnce(new ApiError('Network error', 0, true, false));
      (clearAuthCookies as Mock).mockRejectedValueOnce(new Error('keychain locked'));

      const result = await logout();

      expect(clearSessionData).toHaveBeenCalled();
      expect(clearAuthCookies).toHaveBeenCalled();
      expect(setPreference).toHaveBeenCalled();
      expect(result).toEqual({
        success: false,
        error:
          'Local logout cleanup failed: keychain locked; remote logout also failed: Network error',
        statusCode: 500,
      });
    });

    it('cleans local credentials when the server returns an unsuccessful result', async () => {
      mockApiClient.post.mockResolvedValueOnce({
        success: false,
        error: 'Offline',
        statusCode: 503,
      });

      const result = await logout();

      expect(clearSessionData).toHaveBeenCalled();
      expect(clearAuthCookies).toHaveBeenCalled();
      expect(setPreference).toHaveBeenCalledWith(
        'is_visitor_mode',
        'false',
        'Flag indicating whether the user is in visitor mode'
      );
      expect(result).toEqual({ success: false, error: 'Offline', statusCode: 503 });
    });

    it('preserves status zero from a resolved network failure', async () => {
      mockApiClient.post.mockResolvedValueOnce({
        success: false,
        error: 'Network error',
        statusCode: 0,
      });

      await expect(logout()).resolves.toEqual({
        success: false,
        error: 'Network error',
        statusCode: 0,
      });
    });

    it.each([
      ['native cookie cleanup', clearNativeCookies as Mock],
      ['auth cookie cleanup', clearAuthCookies as Mock],
      ['visitor-mode cleanup', setPreference as Mock],
    ])('continues cleanup when %s fails', async (_label, failingCleanup) => {
      mockApiClient.post.mockResolvedValueOnce({ success: true, statusCode: 200 });
      failingCleanup.mockRejectedValueOnce(new Error('local failure'));

      const result = await logout();

      expect(clearSessionData).toHaveBeenCalled();
      expect(clearAuthCookies).toHaveBeenCalled();
      expect(setPreference).toHaveBeenCalled();
      expect(result).toEqual({
        success: false,
        error: 'Local logout cleanup failed: local failure',
        statusCode: 500,
      });
    });
  });

  describe('handleTapThatAppLogin', () => {
    it('should parse cookies string and save session data', async () => {
      const cookiesString =
        'PHPSESSID=test-session-id; member_id=test-member-id; store__id=test-store-id; store_name=Test%20Store';

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
        isVisitorMode: false,
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
        isVisitorMode: false,
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
      const cookiesString =
        'PHPSESSID=test-session-id; member_id=test-member-id; store__id=test-store-id; store_name=%invalid';

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
        isVisitorMode: false,
      });
    });
  });
});
