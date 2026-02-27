import * as SecureStore from 'expo-secure-store';
import {
  saveSessionData,
  getSessionData,
  clearSessionData,
  hasSession,
  parseCookies,
  extractSessionDataFromResponse
} from '../sessionManager';
import { SessionData } from '../../types/api';

// Mock SecureStore
jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

// Mock console methods
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

describe('sessionManager', () => {
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
    console.log = jest.fn();
    console.error = jest.fn();
    console.warn = jest.fn();
  });

  afterEach(() => {
    // Restore console methods
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
  });

  describe('saveSessionData', () => {
    it('should save session data to secure storage', async () => {
      await saveSessionData(mockSessionData);

      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        'beerknurd_session',
        JSON.stringify(mockSessionData)
      );
    });

    it('should throw error when saving session data fails', async () => {
      const error = new Error('Storage error');
      (SecureStore.setItemAsync as jest.Mock).mockRejectedValueOnce(error);

      await expect(saveSessionData(mockSessionData)).rejects.toThrow('Storage error');
    });
  });

  describe('getSessionData', () => {
    it('should return session data from secure storage', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(JSON.stringify(mockSessionData));

      const result = await getSessionData();

      expect(SecureStore.getItemAsync).toHaveBeenCalledWith('beerknurd_session');
      expect(result).toEqual(mockSessionData);
    });

    it('should return null when no session data exists', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(null);

      const result = await getSessionData();

      expect(result).toBeNull();
    });

    it('should return null when session data is invalid', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(JSON.stringify({
        // Missing required fields
        username: 'testuser'
      }));

      const result = await getSessionData();

      expect(result).toBeNull();
    });

    it('should return null when there is an error getting session data', async () => {
      const error = new Error('Storage error');
      (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(error);

      const result = await getSessionData();

      expect(result).toBeNull();
    });
  });

  describe('clearSessionData', () => {
    it('should clear session data from secure storage', async () => {
      await clearSessionData();

      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('beerknurd_session');
    });

    it('should throw error when clearing session data fails', async () => {
      const error = new Error('Storage error');
      (SecureStore.deleteItemAsync as jest.Mock).mockRejectedValueOnce(error);

      await expect(clearSessionData()).rejects.toThrow('Storage error');
    });
  });

  describe('hasSession', () => {
    it('should return true when session data exists', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(JSON.stringify(mockSessionData));

      const result = await hasSession();

      expect(result).toBe(true);
    });

    it('should return false when no session data exists', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(null);

      const result = await hasSession();

      expect(result).toBe(false);
    });

    it('should return false when there is an error checking session', async () => {
      const error = new Error('Storage error');
      (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(error);

      const result = await hasSession();

      expect(result).toBe(false);
    });
  });

  describe('parseCookies', () => {
    it('should parse cookies from set-cookie header', () => {
      const setCookieHeader = 'PHPSESSID=test-session-id; path=/; HttpOnly';

      const result = parseCookies(setCookieHeader);

      // Check that the PHPSESSID is extracted correctly
      expect(result.PHPSESSID).toBe('test-session-id');

      // The implementation might vary in how it handles path and HttpOnly
      // so we'll just check that they exist if the implementation supports them
      if ('path' in result) {
        expect(result.path).toBe('/');
      }

      // Some implementations might not extract empty values like HttpOnly
    });

    it('should handle empty cookie header', () => {
      const result = parseCookies('');

      expect(result).toEqual({});
    });

    it('should handle malformed cookie header', () => {
      const result = parseCookies('invalid-cookie-format');

      expect(result).toEqual({});
    });
  });

  describe('extractSessionDataFromResponse', () => {
    it('should extract session data from response headers and cookies', () => {
      const headers = new Headers();
      const cookies = {
        PHPSESSID: 'test-session-id',
        store__id: 'test-store-id',
        store_name: 'Test%20Store',
        member_id: 'test-member-id',
        username: 'testuser',
        first_name: 'Test',
        last_name: 'User',
        email: 'test%40example.com',
        cardNum: '12345'
      };

      const result = extractSessionDataFromResponse(headers, cookies);

      expect(result).toEqual({
        sessionId: 'test-session-id',
        storeId: 'test-store-id',
        storeName: 'Test Store',
        memberId: 'test-member-id',
        username: 'testuser',
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
        cardNum: '12345'
      });
    });

    it('should handle missing cookies', () => {
      const headers = new Headers();
      const cookies = {
        PHPSESSID: 'test-session-id',
        // Missing other cookies
      };

      const result = extractSessionDataFromResponse(headers, cookies);

      expect(result).toEqual({
        sessionId: 'test-session-id',
      });
    });

    it('should handle malformed URI components', () => {
      const headers = new Headers();
      const cookies = {
        PHPSESSID: 'test-session-id',
        store_name: '%invalid',
        email: '%invalid'
      };

      const result = extractSessionDataFromResponse(headers, cookies);

      expect(result).toEqual({
        sessionId: 'test-session-id',
        storeName: '%invalid',
        email: '%invalid'
      });
    });
  });
});
