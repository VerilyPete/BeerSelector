/**
 * Whether Settings agrees with the router about "is this app configured".
 *
 * The hook used to answer that itself, with
 * `!!(all_beers_api_url && my_beers_api_url)` derived from the preferences array
 * it had already loaded. `areApiUrlsConfigured` answers it differently — it
 * branches on `is_visitor_mode`, and a visitor needs only the taplist URL. The
 * two agreed only because visitor login happens to write a truthy
 * `none://visitor_mode` placeholder; nothing enforced that, and
 * `app/_layout.tsx` routes on the canonical one.
 *
 * **This file replaces one that tested nothing.** The previous version never
 * imported the hook: it defined a local copy of the load step and asserted
 * against the copy, so inverting `setIsFirstLogin(!configured)` in the real hook
 * left all three tests green. It also cited TESTING.md's `renderHook` hang rule
 * as the reason — that rule is scoped to hooks touching Alert, Appearance,
 * NetInfo or `useColorScheme`, and this hook touches none of them. Rendering it
 * takes well under a second.
 */

import { renderHook, waitFor } from '@testing-library/react-native';
import { useSettingsState } from '@/hooks/useSettingsState';
import { getAllPreferences, areApiUrlsConfigured } from '@/src/database/preferences';

jest.mock('@/src/database/preferences', () => ({
  getAllPreferences: jest.fn(),
  areApiUrlsConfigured: jest.fn(),
}));

jest.mock('expo-router', () => ({
  router: { canGoBack: jest.fn(() => false), back: jest.fn(), replace: jest.fn() },
}));

describe('useSettingsState — configured state', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getAllPreferences as jest.Mock).mockResolvedValue([]);
  });

  it('reports a configured app as past first login', async () => {
    (areApiUrlsConfigured as jest.Mock).mockResolvedValue(true);

    const { result } = renderHook(() => useSettingsState());

    await waitFor(() => expect(result.current.apiUrlsConfigured).toBe(true));
    expect(result.current.isFirstLogin).toBe(false);
  });

  it('reports an unconfigured app as first login', async () => {
    // The inversion mutant lives here: `setIsFirstLogin(configured)` instead of
    // `!configured` passed the entire previous test file.
    (areApiUrlsConfigured as jest.Mock).mockResolvedValue(false);

    const { result } = renderHook(() => useSettingsState());

    await waitFor(() => expect(result.current.isFirstLogin).toBe(true));
    expect(result.current.apiUrlsConfigured).toBe(false);
  });

  it('defers to the canonical predicate rather than re-deriving from the loaded preferences', async () => {
    // A visitor: only the taplist URL is meaningful, and `my_beers_api_url` is a
    // placeholder. The old local reimplementation required BOTH URLs and would
    // have called this first-login; `areApiUrlsConfigured` does not. Feeding the
    // preferences array the shape the old code read from proves the hook no
    // longer consults it.
    (getAllPreferences as jest.Mock).mockResolvedValue([
      { key: 'all_beers_api_url', value: 'https://example.com/store', description: '' },
      { key: 'is_visitor_mode', value: 'true', description: '' },
    ]);
    (areApiUrlsConfigured as jest.Mock).mockResolvedValue(true);

    const { result } = renderHook(() => useSettingsState());

    await waitFor(() => expect(result.current.apiUrlsConfigured).toBe(true));
    expect(result.current.isFirstLogin).toBe(false);
    expect(areApiUrlsConfigured).toHaveBeenCalled();
  });

  it('leaves first-login false when loading preferences throws', async () => {
    // Documenting what the hook ACTUALLY does, which the previous file got
    // backwards: the load is wrapped in try/catch, so a rejection means
    // `setIsFirstLogin` is never called and the initial `false` stands. Settings
    // therefore does NOT show the first-login state on a read failure, while
    // `areApiUrlsConfigured` returning false would route `app/_layout.tsx` to
    // Settings on the same failure. That divergence is real and undocumented;
    // this test pins today's behaviour rather than asserting the wish.
    (getAllPreferences as jest.Mock).mockRejectedValue(new Error('database unavailable'));
    (areApiUrlsConfigured as jest.Mock).mockResolvedValue(false);

    const { result } = renderHook(() => useSettingsState());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isFirstLogin).toBe(false);
  });
});
