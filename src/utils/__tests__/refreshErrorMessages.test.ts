/**
 * The refresh error alert must describe every source that failed.
 *
 * Plan 05, review remediation.
 *
 * `hasErrors` is computed from all THREE sources (dataUpdateService.ts), but
 * both hooks built the alert body from all-beers and my-beers only. Rewards
 * could set `hasErrors` and contribute no text, producing
 * `Alert.alert('Data Refresh Error', 'There were problems refreshing beer data:\n\n')`
 * — an error dialog with an empty body.
 *
 * Before plan 05 Phase 5.1 that state was unreachable: rewards always returned
 * `success: true`. Making rewards able to fail is what exposed it, so the fix
 * ships with it.
 *
 * Extracted to a pure function rather than fixed in place because TESTING.md
 * forbids Jest tests that drive React Native hooks — they hang. The same reason
 * `beerListViewState` and `focusRefreshOutcome` are pure modules.
 */

import { buildRefreshErrorMessages } from '../refreshErrorMessages';
import { ApiErrorType } from '../notificationUtils';
import type { ManualRefreshResult } from '../../services/dataUpdateService';

const ok = () => ({ success: true, dataUpdated: true });

const failure = (type: ApiErrorType, message: string) => ({
  success: false,
  dataUpdated: false,
  error: { type, message },
});

const result = (overrides: Partial<ManualRefreshResult> = {}): ManualRefreshResult => ({
  allBeersResult: ok(),
  myBeersResult: ok(),
  rewardsResult: ok(),
  hasErrors: false,
  allNetworkErrors: false,
  ...overrides,
});

describe('buildRefreshErrorMessages', () => {
  it('describes a rewards-only failure instead of returning nothing', () => {
    const messages = buildRefreshErrorMessages(
      result({
        rewardsResult: failure(ApiErrorType.VALIDATION_ERROR, 'Rewards unavailable'),
        hasErrors: true,
      })
    );

    // The regression this exists for: one entry, naming rewards.
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('Rewards');
  });

  it('describes every source that failed', () => {
    const messages = buildRefreshErrorMessages(
      result({
        allBeersResult: failure(ApiErrorType.SERVER_ERROR, 'beers down'),
        myBeersResult: failure(ApiErrorType.SERVER_ERROR, 'tasted down'),
        rewardsResult: failure(ApiErrorType.SERVER_ERROR, 'rewards down'),
        hasErrors: true,
      })
    );

    expect(messages).toHaveLength(3);
  });

  it('omits sources that succeeded', () => {
    const messages = buildRefreshErrorMessages(
      result({
        myBeersResult: failure(ApiErrorType.SERVER_ERROR, 'tasted down'),
        hasErrors: true,
      })
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('Beerfinder');
  });

  it('never yields an empty list while hasErrors is set', () => {
    // Structural guarantee, not a rewards-specific patch. A source can report
    // `success: false` with no `error` populated, and the old per-source guards
    // (`!success && result.X.error`) silently contributed nothing for it. The
    // alert body is built from this list, so an empty list IS the blank dialog.
    const messages = buildRefreshErrorMessages(
      result({
        allBeersResult: { success: false, dataUpdated: false },
        hasErrors: true,
      })
    );

    expect(messages.length).toBeGreaterThan(0);
  });

  it('yields nothing when no source failed', () => {
    expect(buildRefreshErrorMessages(result())).toEqual([]);
  });
});
