import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as SecureStore from 'expo-secure-store';
import { invalidateSessionCache } from '../sessionCacheEpoch';
import {
  captureStoredAuthCredentials,
  clearAuthCookies,
  clearSessionData,
  getAuthCookies,
  getSessionData,
  restoreStoredAuthCredentials,
  saveAuthCredentials,
  saveAuthCookies,
  saveSessionData,
} from '../sessionManager';

const { mockStore, mockState, assertSecureStoreKey } = vi.hoisted(() => {
  const store = new Map<string, string>();
  const state = {
    chunkWrites: 0,
    failChunkWriteAt: 0,
    failDeleteKey: '',
    failGetKey: '',
    failSetKey: '',
  };
  const assertKey = (key: string): void => {
    if (!/^[A-Za-z0-9._-]+$/.test(key)) {
      throw new Error(`Invalid SecureStore key: ${key}`);
    }
  };
  return { mockStore: store, mockState: state, assertSecureStoreKey: assertKey };
});

vi.mock('expo-secure-store', () => ({
  setItemAsync: vi.fn(async (key: string, value: string) => {
    assertSecureStoreKey(key);
    if (value.length > 2048) throw new Error(`SecureStore value too large: ${value.length}`);
    if (key === mockState.failSetKey) throw new Error('SecureStore marker write failed');
    if (/^beerknurd_auth_cookies_.+_\d+$/.test(key)) {
      mockState.chunkWrites += 1;
      if (mockState.chunkWrites === mockState.failChunkWriteAt) {
        throw new Error('interrupted chunk write');
      }
    }
    mockStore.set(key, value);
  }),
  getItemAsync: vi.fn(async (key: string) => {
    assertSecureStoreKey(key);
    if (key === mockState.failGetKey) throw new Error('registry read failed');
    return mockStore.get(key) ?? null;
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    assertSecureStoreKey(key);
    if (key === mockState.failDeleteKey) throw new Error('chunk delete failed');
    mockStore.delete(key);
  }),
}));

vi.mock('../sessionCacheEpoch', () => ({
  invalidateSessionCache: vi.fn(() => 1),
}));

const META_KEY = 'beerknurd_auth_cookies_meta';
const REGISTRY_KEY = 'beerknurd_auth_cookies_generations';
const chunkKeys = (): string[] =>
  [...mockStore.keys()].filter(key => /^beerknurd_auth_cookies_.+_\d+$/.test(key));

describe('auth cookie SecureStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.clear();
    mockState.chunkWrites = 0;
    mockState.failChunkWriteAt = 0;
    mockState.failDeleteKey = '';
    mockState.failGetKey = '';
    mockState.failSetKey = '';
  });

  it('invalidates the API session cache whenever persisted session state changes', async () => {
    await saveAuthCookies('{"PHPSESSID":"cookies-only"}');
    expect(invalidateSessionCache).not.toHaveBeenCalled();

    await saveAuthCredentials('{"PHPSESSID":"member"}', {
      sessionId: 'member-session',
      memberId: 'member',
      storeId: 'store',
      storeName: 'Store',
    });
    expect(invalidateSessionCache).toHaveBeenCalledTimes(1);

    await saveSessionData({
      sessionId: 'refreshed-session',
      memberId: 'member',
      storeId: 'store',
      storeName: 'Store',
    });
    expect(invalidateSessionCache).toHaveBeenCalledTimes(2);

    await clearSessionData();
    await clearAuthCookies();
    expect(invalidateSessionCache).toHaveBeenCalledTimes(4);
  });

  it('round-trips an empty value instead of treating its chunk as missing', async () => {
    await saveAuthCookies('');

    await expect(getAuthCookies()).resolves.toBe('');
  });

  it('round-trips UTF-8 data in valid, size-bounded generation keys', async () => {
    const cookies = JSON.stringify({ PHPSESSID: '🍺'.repeat(1200), store_name: 'München' });

    await saveAuthCookies(cookies);

    await expect(getAuthCookies()).resolves.toBe(cookies);
    expect(chunkKeys().length).toBeGreaterThan(1);
    for (const [key, value] of mockStore) {
      expect(key).toMatch(/^[A-Za-z0-9._-]+$/);
      expect(value.length).toBeLessThanOrEqual(2048);
    }
    const writes = vi.mocked(SecureStore.setItemAsync).mock.calls;
    const markerWrite = writes.findIndex(([key]) => key === META_KEY);
    const lastChunkWrite = writes.reduce(
      (last, [key], index) => (/^beerknurd_auth_cookies_.+_\d+$/.test(key) ? index : last),
      -1
    );
    expect(markerWrite).toBeGreaterThan(lastChunkWrite);
  });

  it('keeps the prior generation readable after an interrupted overwrite', async () => {
    const oldCookies = JSON.stringify({ PHPSESSID: `old-${'a'.repeat(2400)}` });
    const newCookies = JSON.stringify({ PHPSESSID: `new-${'b'.repeat(2400)}` });
    await saveAuthCookies(oldCookies);

    mockState.chunkWrites = 0;
    mockState.failChunkWriteAt = 2;
    await expect(saveAuthCookies(newCookies)).rejects.toThrow('interrupted chunk write');

    await expect(getAuthCookies()).resolves.toBe(oldCookies);
  });

  it('captures and restores the cookie and session as one credential pair', async () => {
    const oldCookies = JSON.stringify({ PHPSESSID: 'old' });
    const oldSessionData = {
      sessionId: 'old',
      memberId: 'member-old',
      storeId: 'store-old',
      storeName: 'Old Store',
    };
    const oldSession = JSON.stringify(oldSessionData);
    await saveAuthCookies(oldCookies);
    mockStore.set('beerknurd_session', oldSession);
    const snapshot = await captureStoredAuthCredentials();

    await saveAuthCookies(JSON.stringify({ PHPSESSID: 'new' }));
    mockStore.set('beerknurd_session', JSON.stringify({ sessionId: 'new' }));
    await restoreStoredAuthCredentials(snapshot);

    await expect(getAuthCookies()).resolves.toBe(oldCookies);
    await expect(getSessionData()).resolves.toEqual(oldSessionData);
  });

  it('does not expose either half of a member credential pair before its marker commits', async () => {
    const oldCookies = JSON.stringify({ PHPSESSID: 'old' });
    const oldSession = {
      sessionId: 'old',
      memberId: 'member-old',
      storeId: 'store-old',
      storeName: 'Old Store',
    };
    const newCookies = JSON.stringify({ PHPSESSID: 'new' });
    const newSession = {
      sessionId: 'new',
      memberId: 'member-new',
      storeId: 'store-new',
      storeName: 'New Store',
    };
    await saveAuthCredentials(oldCookies, oldSession);
    mockState.failSetKey = META_KEY;

    await expect(saveAuthCredentials(newCookies, newSession)).rejects.toThrow(
      'SecureStore marker write failed'
    );

    await expect(getAuthCookies()).resolves.toBe(oldCookies);
    await expect(getSessionData()).resolves.toEqual(oldSession);
  });

  it('writes the generated session before publishing the credential marker', async () => {
    await saveAuthCredentials(JSON.stringify({ PHPSESSID: 'member' }), {
      sessionId: 'session',
      memberId: 'member',
      storeId: 'store',
      storeName: 'Store',
    });

    const writes = vi.mocked(SecureStore.setItemAsync).mock.calls;
    const sessionWrite = writes.findIndex(([key]) => key.endsWith('_session'));
    const markerWrite = writes.findIndex(([key]) => key === META_KEY);
    expect(sessionWrite).toBeGreaterThan(-1);
    expect(markerWrite).toBeGreaterThan(sessionWrite);
  });

  it('updates and clears a session through the active credential generation', async () => {
    const cookies = JSON.stringify({ PHPSESSID: 'member' });
    await saveAuthCredentials(cookies, {
      sessionId: 'old',
      memberId: 'member',
      storeId: 'store',
      storeName: 'Store',
    });
    const refreshed = {
      sessionId: 'refreshed',
      memberId: 'member',
      storeId: 'store',
      storeName: 'Store',
    };

    await saveSessionData(refreshed);
    await expect(getSessionData()).resolves.toEqual(refreshed);
    await expect(getAuthCookies()).resolves.toBe(cookies);

    await clearSessionData();
    await expect(getSessionData()).resolves.toBeNull();
  });

  it('keeps the prior generation readable when the commit marker write fails', async () => {
    const oldCookies = JSON.stringify({ PHPSESSID: 'old' });
    await saveAuthCookies(oldCookies);
    mockState.failSetKey = META_KEY;

    await expect(saveAuthCookies(JSON.stringify({ PHPSESSID: 'new' }))).rejects.toThrow(
      'SecureStore marker write failed'
    );

    await expect(getAuthCookies()).resolves.toBe(oldCookies);
    mockState.failSetKey = '';
    await clearAuthCookies();
    expect(mockStore.size).toBe(0);
  });

  it('removes old chunks after shrinking and leaves nothing after clear', async () => {
    await saveAuthCookies(JSON.stringify({ PHPSESSID: 'a'.repeat(2400) }));
    expect(chunkKeys().length).toBeGreaterThan(1);

    await saveAuthCookies(JSON.stringify({ PHPSESSID: 'short' }));
    expect(chunkKeys()).toHaveLength(1);

    await clearAuthCookies();
    expect(mockStore.size).toBe(0);
  });

  it('tracks an interrupted generation so clear removes its orphaned chunks', async () => {
    await saveAuthCookies(JSON.stringify({ PHPSESSID: 'old' }));
    mockState.chunkWrites = 0;
    mockState.failChunkWriteAt = 2;

    await expect(
      saveAuthCookies(JSON.stringify({ PHPSESSID: 'new'.repeat(900) }))
    ).rejects.toThrow();
    expect(chunkKeys().length).toBeGreaterThan(1);

    mockState.failChunkWriteAt = 0;
    await clearAuthCookies();
    expect(mockStore.size).toBe(0);
  });

  it('attempts every deletion and retains failed generations for retry', async () => {
    await saveAuthCookies(JSON.stringify({ PHPSESSID: 'a'.repeat(2400) }));
    const [failedKey, otherKey] = chunkKeys();
    mockState.failDeleteKey = failedKey;

    await expect(clearAuthCookies()).rejects.toThrow('chunk delete failed');

    expect(mockStore.has(META_KEY)).toBe(false);
    expect(mockStore.has(otherKey)).toBe(false);
    expect(mockStore.has(failedKey)).toBe(true);
    expect(mockStore.has(REGISTRY_KEY)).toBe(true);

    mockState.failDeleteKey = '';
    await clearAuthCookies();
    expect(mockStore.size).toBe(0);
  });

  it('does not erase an unreadable registry during clear', async () => {
    await saveAuthCookies(JSON.stringify({ PHPSESSID: 'old' }));
    const registry = mockStore.get(REGISTRY_KEY);
    mockState.failGetKey = REGISTRY_KEY;

    await expect(clearAuthCookies()).rejects.toThrow('registry read failed');

    expect(mockStore.get(REGISTRY_KEY)).toBe(registry);
  });

  it('refuses to overwrite a malformed registry or orphan its chunks', async () => {
    mockStore.set(REGISTRY_KEY, '[{"generation":"known","count":1},{"bad":true}]');
    mockStore.set('beerknurd_auth_cookies_known_0', 'YQ==');
    const before = new Map(mockStore);

    await expect(saveAuthCookies('{"PHPSESSID":"new"}')).rejects.toThrow('registry is malformed');

    expect(mockStore).toEqual(before);
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
  });

  it('revokes the active generation and resets a malformed registry so login can recover', async () => {
    mockStore.set(REGISTRY_KEY, '{bad json');
    mockStore.set(META_KEY, JSON.stringify({ generation: 'known', count: 1 }));
    mockStore.set('beerknurd_auth_cookies_known_0', 'YQ==');
    await expect(clearAuthCookies()).rejects.toThrow('registry was malformed and has been reset');

    expect(mockStore.has(REGISTRY_KEY)).toBe(false);
    expect(mockStore.has(META_KEY)).toBe(false);
    expect(mockStore.has('beerknurd_auth_cookies_known_0')).toBe(false);
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();

    await expect(saveAuthCookies('{"PHPSESSID":"replacement"}')).resolves.toBeUndefined();
    await expect(getAuthCookies()).resolves.toBe('{"PHPSESSID":"replacement"}');
  });

  it('keeps a committed generation usable when stale cleanup fails', async () => {
    await saveAuthCookies(JSON.stringify({ PHPSESSID: 'old' }));
    const [oldChunk] = chunkKeys();
    const oldGeneration = JSON.parse(mockStore.get(META_KEY) ?? '{}').generation as string;
    mockState.failDeleteKey = oldChunk;
    const newCookies = JSON.stringify({ PHPSESSID: 'new' });

    await expect(saveAuthCookies(newCookies)).resolves.toBeUndefined();
    await expect(getAuthCookies()).resolves.toBe(newCookies);
    expect(mockStore.has(oldChunk)).toBe(true);
    expect(mockStore.get(REGISTRY_KEY)).toContain(oldGeneration);
  });

  it('rejects payloads that would create an unreadable marker', async () => {
    const oversized = 'a'.repeat(1_500_001);

    await expect(saveAuthCookies(oversized)).rejects.toThrow(
      'exceeds the supported SecureStore chunk count'
    );
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it('does not write untracked chunks when the generation registry is full', async () => {
    const generations: { generation: string; count: number }[] = [];
    while (JSON.stringify(generations).length <= 1500) {
      generations.push({ generation: `interrupted_${generations.length}`, count: 1 });
    }
    const registry = JSON.stringify(generations);
    expect(registry.length).toBeLessThanOrEqual(2048);
    mockStore.set(REGISTRY_KEY, registry);

    await expect(saveAuthCookies('{"PHPSESSID":"new"}')).rejects.toThrow('registry is full');

    expect(mockStore.get(REGISTRY_KEY)).toBe(registry);
    expect(chunkKeys()).toEqual([]);
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it('returns null for malformed markers, missing chunks, and invalid base64', async () => {
    mockStore.set(META_KEY, '{bad json');
    await expect(getAuthCookies()).resolves.toBeNull();

    mockStore.set(META_KEY, JSON.stringify({ generation: 'valid', count: 2 }));
    mockStore.set('beerknurd_auth_cookies_valid_0', 'YQ==');
    await expect(getAuthCookies()).resolves.toBeNull();

    mockStore.set(META_KEY, JSON.stringify({ generation: 'valid', count: 1 }));
    mockStore.set('beerknurd_auth_cookies_valid_0', '%%%');
    await expect(getAuthCookies()).resolves.toBeNull();
  });
});
