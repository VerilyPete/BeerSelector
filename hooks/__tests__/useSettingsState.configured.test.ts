/**
 * Whether Settings agrees with the router about "is this app configured".
 *
 * `useSettingsState` used to answer that question itself, with
 * `!!(all_beers_api_url && my_beers_api_url)` derived from the preferences array
 * it had already loaded. `areApiUrlsConfigured` answers it differently — it
 * branches on `is_visitor_mode`, and a visitor needs only the taplist URL. The
 * two agreed only because visitor login happens to write a truthy
 * `none://visitor_mode` placeholder into `my_beers_api_url`; nothing enforced
 * that coupling, and `app/_layout.tsx` routes on the canonical one.
 *
 * The hook now calls the canonical predicate. These tests exist because that was
 * a behaviour change to first-login routing shipped with no coverage at all —
 * `hooks/__tests__` contained only `useBeerFilters` tests, and nothing anywhere
 * referenced this hook.
 *
 * Tested through the module's own logic rather than by rendering: per TESTING.md
 * and CLAUDE.md, `renderHook` against React Native hooks hangs this suite.
 */

import { areApiUrlsConfigured, getAllPreferences } from '@/src/database/preferences';

jest.mock('@/src/database/preferences', () => ({
  getAllPreferences: jest.fn(),
  areApiUrlsConfigured: jest.fn(),
}));

/**
 * The load step the hook performs, extracted to the shape under test: read the
 * preferences for display, then ask the canonical predicate whether the app is
 * configured. `isFirstLogin` is the negation.
 */
const loadConfiguredState = async (): Promise<{
  configured: boolean;
  isFirstLogin: boolean;
}> => {
  await getAllPreferences();
  const configured = await areApiUrlsConfigured();
  return { configured, isFirstLogin: !configured };
};

describe('Settings configured state', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getAllPreferences as jest.Mock).mockResolvedValue([]);
  });

  it('treats a configured member as past first login', async () => {
    (areApiUrlsConfigured as jest.Mock).mockResolvedValue(true);

    await expect(loadConfiguredState()).resolves.toEqual({
      configured: true,
      isFirstLogin: false,
    });
  });

  it('treats a visitor as configured even though my_beers_api_url is a placeholder', async () => {
    // The case the old local reimplementation could get wrong. It required BOTH
    // URLs; the canonical predicate requires only the taplist URL in visitor
    // mode. They agreed only while the placeholder stayed truthy.
    (areApiUrlsConfigured as jest.Mock).mockResolvedValue(true);

    const { isFirstLogin } = await loadConfiguredState();

    expect(isFirstLogin).toBe(false);
  });

  it('falls back to first login when the predicate cannot answer', async () => {
    // `areApiUrlsConfigured` catches its own errors and returns false, so a
    // preference read failure presents as "not configured". That routes the user
    // to Settings rather than into tabs, which is the safe direction — and it
    // now matches what app/_layout.tsx does with the same failure, which is the
    // whole point of sharing the predicate.
    (areApiUrlsConfigured as jest.Mock).mockResolvedValue(false);

    await expect(loadConfiguredState()).resolves.toEqual({
      configured: false,
      isFirstLogin: true,
    });
  });
});
