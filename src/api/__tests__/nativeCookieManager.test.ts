import { beforeEach, describe, expect, it, vi } from 'vitest';
import CookieManager from '@preeternal/react-native-cookie-manager';
import { clearNativeCookies } from '../nativeCookieManager';

describe('native cookie cleanup', () => {
  beforeEach(() => vi.clearAllMocks());

  it('clears both networking and WebView cookie stores', async () => {
    await clearNativeCookies();

    expect(CookieManager.clearAllStores).toHaveBeenCalledTimes(1);
  });
});
