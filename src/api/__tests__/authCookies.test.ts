import * as SecureStore from 'expo-secure-store';
import { saveAuthCookies, getAuthCookies, clearAuthCookies } from '../sessionManager';

// In-memory SecureStore backing so chunked writes can be inspected.
const mockStore = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockStore.set(key, value);
  }),
  getItemAsync: jest.fn(async (key: string) => mockStore.get(key) ?? null),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockStore.delete(key);
  }),
}));

const originalConsoleError = console.error;

const AUTH_COOKIES_KEY = 'beerknurd_auth_cookies';
const AUTH_COOKIES_META_KEY = 'beerknurd_auth_cookies_meta';

// Long enough that the base64 encoding spans multiple 1500-char chunks.
const largeCookiesJson = JSON.stringify({
  PHPSESSID: 'a'.repeat(2000),
  store__id: '13879',
  username: 'testuser',
});

describe('authCookies', () => {
  const smallCookiesJson = JSON.stringify({ PHPSESSID: 'abc123', store__id: '13879' });

  beforeEach(() => {
    jest.clearAllMocks();
    mockStore.clear();
    console.error = jest.fn();
  });

  afterEach(() => {
    console.error = originalConsoleError;
  });

  describe('saveAuthCookies', () => {
    it('writes a single chunk plus meta for small payloads', async () => {
      await saveAuthCookies(smallCookiesJson);

      expect(mockStore.get(`${AUTH_COOKIES_KEY}:0`)).toBeDefined();
      expect(mockStore.get(AUTH_COOKIES_META_KEY)).toBe('1');
      // Every stored chunk stays under SecureStore's 2048-byte value limit.
      for (const [key, value] of mockStore) {
        expect(value.length).toBeLessThanOrEqual(2048);
        expect(key.startsWith(AUTH_COOKIES_KEY)).toBe(true);
      }
    });

    it('chunks large payloads and writes the meta commit marker last', async () => {
      await saveAuthCookies(largeCookiesJson);

      const meta = mockStore.get(AUTH_COOKIES_META_KEY);
      expect(meta).toBe('2');
      expect(mockStore.get(`${AUTH_COOKIES_KEY}:0`)!.length).toBeLessThanOrEqual(1500);
      expect(mockStore.get(`${AUTH_COOKIES_KEY}:1`)!.length).toBeLessThanOrEqual(1500);

      const setCalls = (SecureStore.setItemAsync as jest.Mock).mock.calls;
      expect(setCalls[setCalls.length - 1][0]).toBe(AUTH_COOKIES_META_KEY);
    });

    it('throws when secure storage write fails', async () => {
      (SecureStore.setItemAsync as jest.Mock).mockRejectedValueOnce(new Error('storage locked'));

      await expect(saveAuthCookies(smallCookiesJson)).rejects.toThrow('storage locked');
    });
  });

  describe('getAuthCookies', () => {
    it('round-trips a small payload', async () => {
      await saveAuthCookies(smallCookiesJson);

      await expect(getAuthCookies()).resolves.toBe(smallCookiesJson);
    });

    it('round-trips a multi-chunk payload', async () => {
      await saveAuthCookies(largeCookiesJson);

      await expect(getAuthCookies()).resolves.toBe(largeCookiesJson);
    });

    it('returns null when nothing was ever saved', async () => {
      await expect(getAuthCookies()).resolves.toBeNull();
    });

    it('returns null for a partial write instead of corrupt data', async () => {
      await saveAuthCookies(largeCookiesJson);
      mockStore.delete(`${AUTH_COOKIES_KEY}:1`);

      await expect(getAuthCookies()).resolves.toBeNull();
    });

    it('returns null when secure storage read fails', async () => {
      await saveAuthCookies(smallCookiesJson);
      (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(new Error('storage locked'));

      await expect(getAuthCookies()).resolves.toBeNull();
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('clearAuthCookies', () => {
    it('removes every chunk and the meta key', async () => {
      await saveAuthCookies(largeCookiesJson);

      await clearAuthCookies();

      expect(mockStore.size).toBe(0);
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(AUTH_COOKIES_META_KEY);
    });

    it('also removes the legacy single-value key', async () => {
      mockStore.set(AUTH_COOKIES_KEY, 'stale-raw-value');

      await clearAuthCookies();

      expect(mockStore.has(AUTH_COOKIES_KEY)).toBe(false);
    });

    it('throws when secure storage delete fails', async () => {
      (SecureStore.deleteItemAsync as jest.Mock).mockRejectedValueOnce(new Error('storage locked'));

      await expect(clearAuthCookies()).rejects.toThrow('storage locked');
    });
  });
});
