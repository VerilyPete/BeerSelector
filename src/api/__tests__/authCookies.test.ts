import * as SecureStore from 'expo-secure-store';
import { saveAuthCookies, getAuthCookies, clearAuthCookies } from '../sessionManager';

// Mock SecureStore
jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const originalConsoleError = console.error;

describe('authCookies', () => {
  const cookiesJson = JSON.stringify({ PHPSESSID: 'abc123', store__id: '13879' });

  beforeEach(() => {
    jest.clearAllMocks();
    console.error = jest.fn();
  });

  afterEach(() => {
    console.error = originalConsoleError;
  });

  describe('saveAuthCookies', () => {
    it('should save cookies under the dedicated secure storage key', async () => {
      await saveAuthCookies(cookiesJson);

      expect(SecureStore.setItemAsync).toHaveBeenCalledWith('beerknurd_auth_cookies', cookiesJson);
    });

    it('should throw when secure storage write fails', async () => {
      (SecureStore.setItemAsync as jest.Mock).mockRejectedValueOnce(new Error('storage locked'));

      await expect(saveAuthCookies(cookiesJson)).rejects.toThrow('storage locked');
    });
  });

  describe('getAuthCookies', () => {
    it('should return the stored cookie JSON', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(cookiesJson);

      await expect(getAuthCookies()).resolves.toBe(cookiesJson);
    });

    it('should return null when nothing is stored', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(null);

      await expect(getAuthCookies()).resolves.toBeNull();
    });

    it('should return null (not throw) when secure storage read fails', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(new Error('storage locked'));

      await expect(getAuthCookies()).resolves.toBeNull();
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('clearAuthCookies', () => {
    it('should delete the dedicated secure storage key', async () => {
      await clearAuthCookies();

      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('beerknurd_auth_cookies');
    });

    it('should throw when secure storage delete fails', async () => {
      (SecureStore.deleteItemAsync as jest.Mock).mockRejectedValueOnce(new Error('storage locked'));

      await expect(clearAuthCookies()).rejects.toThrow('storage locked');
    });
  });
});
