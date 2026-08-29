import { beforeEach, describe, expect, it, vi } from 'vitest';
import CookieManager from '@preeternal/react-native-cookie-manager';
import { Platform } from 'react-native';
import { clearNativeCookies } from '../nativeCookieManager';

describe('native cookie cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (Platform as { OS: string }).OS = 'ios';
  });

  it('clears both networking and WebView cookie stores', async () => {
    await clearNativeCookies();

    expect(CookieManager.clearAllStores).toHaveBeenCalledTimes(1);
  });

  it('does not claim browser cookies were fully cleared', async () => {
    (Platform as { OS: string }).OS = 'web';

    await expect(clearNativeCookies()).rejects.toThrow(
      'Browser authentication cookies require a successful server-side logout'
    );
    expect(CookieManager.clearAllStores).not.toHaveBeenCalled();
  });
});
