/**
 * Behaviour tests for useDataRefresh, driven through a probe consumer.
 *
 * Deliberately NOT `renderHook`: TESTING.md bans it for React Native hooks, and
 * this hook calls `Alert.alert` from react-native, which is the class of
 * dependency that rule exists for. A probe that renders the hook's state into
 * `<Text testID>` and triggers it from a `<Pressable>` exercises the same
 * surface a real screen uses.
 *
 * The hook had no tests at all. Its three list screens each mock it out
 * wholesale, so every branch below — including the one that told the user
 * nothing — was unexecuted by the suite.
 */

import React from 'react';
import { Alert, Pressable, Text } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { useDataRefresh } from '../useDataRefresh';
import { areApiUrlsConfigured } from '@/src/database/preferences';
import { manualRefreshAllData } from '@/src/services/dataUpdateService';

jest.mock('@/src/database/preferences');
jest.mock('@/src/services/dataUpdateService');

describe('useDataRefresh', () => {
  const Probe = ({ onDataReloaded }: { onDataReloaded: () => Promise<void> }) => {
    const { refreshing, handleRefresh } = useDataRefresh({
      onDataReloaded,
      componentName: 'Probe',
    });

    return (
      <>
        <Text testID="refreshing">{String(refreshing)}</Text>
        <Pressable
          testID="refresh"
          onPress={() => {
            void handleRefresh();
          }}
        >
          <Text>refresh</Text>
        </Pressable>
      </>
    );
  };

  const pressRefresh = async (onDataReloaded: () => Promise<void>) => {
    const { getByTestId } = render(<Probe onDataReloaded={onDataReloaded} />);

    await act(async () => {
      fireEvent.press(getByTestId('refresh'));
    });

    return { getByTestId };
  };

  beforeEach(() => {
    jest.clearAllMocks();

    (areApiUrlsConfigured as jest.Mock).mockResolvedValue(true);
    (manualRefreshAllData as jest.Mock).mockResolvedValue({
      hasErrors: false,
      allNetworkErrors: false,
    });

    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation();
  });

  it('should say nothing when the refresh succeeds', async () => {
    // Pins the other edge of the two tests below: an implementation that
    // alerted unconditionally would satisfy them both and put a dialog in
    // front of every successful pull-to-refresh.
    const onDataReloaded = jest.fn().mockResolvedValue(undefined);

    const { getByTestId } = await pressRefresh(onDataReloaded);

    expect(onDataReloaded).toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(getByTestId('refreshing').props.children).toBe('false');
  });

  it('should raise one alert, not two, when the refresh and the reload both fail', async () => {
    // Two `Alert.alert` calls in the same tick do not queue or collapse: RN
    // creates a fresh UIWindow per alert at UIWindowLevelAlert + 1, so both
    // present and the LATER one sits on top. The user's first modal was
    // therefore "Refreshed, but…" — asserting a success that did not happen —
    // over the top of the API failure that explains it, in that order.
    (manualRefreshAllData as jest.Mock).mockResolvedValue({
      hasErrors: true,
      allNetworkErrors: true,
    });
    const onDataReloaded = jest.fn().mockRejectedValue(new Error('database locked'));

    await pressRefresh(onDataReloaded);

    expect(Alert.alert).toHaveBeenCalledTimes(1);

    const [, body] = (Alert.alert as jest.Mock).mock.calls[0];
    // The one alert must not claim the refresh worked...
    expect(body).not.toMatch(/^Refreshed/);
    // ...and must still carry the second fact. Asserting only the call count
    // let the merged warning be deleted outright: the user would be told the
    // connection failed with no hint that the list in front of them is stale,
    // which is the silent half restored.
    expect(body).toContain('could not be reloaded either');
  });

  it('should name each failed source when only some of them failed', async () => {
    // The partial-error branch was deletable with the entire 103-suite run
    // green. Nothing anywhere drove `hasErrors` with `allNetworkErrors: false`
    // against this hook — `refreshErrorMessages` is tested as a pure builder,
    // never as something a user is shown.
    (manualRefreshAllData as jest.Mock).mockResolvedValue({
      hasErrors: true,
      allNetworkErrors: false,
      allBeersResult: { success: false, error: { type: 'TIMEOUT_ERROR', message: 'timed out' } },
      myBeersResult: { success: true },
      rewardsResult: { success: true },
    });
    const onDataReloaded = jest.fn().mockResolvedValue(undefined);

    await pressRefresh(onDataReloaded);

    expect(Alert.alert).toHaveBeenCalledTimes(1);
    const [title, body] = (Alert.alert as jest.Mock).mock.calls[0];
    expect(title).toBe('Data Refresh Error');
    // The source that failed is named, and the ones that did not are absent —
    // an empty-bodied "There were problems" dialog is what this branch used to
    // produce when a source was left out of the builder.
    expect(body).toContain('All Beer data');
    expect(body).not.toContain('Rewards data');
  });

  it('should tell the user when reloading local data fails', async () => {
    // This failure reached nobody. The API refresh succeeds, the local re-read
    // throws, and the catch wrote a `error` state that no consumer of this hook
    // destructures — all three screens take `{ refreshing, handleRefresh }`.
    // So a pull-to-refresh that silently failed to update the list looked
    // exactly like one that had nothing new to show: the spinner retracted, the
    // stale rows stayed, and nothing was said.
    const onDataReloaded = jest.fn().mockRejectedValue(new Error('database locked'));

    await pressRefresh(onDataReloaded);

    // The message pair, not merely "an alert fired". Asserting the bare call
    // let a mutant replace this with Alert.alert('Success', 'Everything is
    // fine.') and kept the suite green — the test named for a silent failure
    // passing while the code told the user the opposite.
    expect(Alert.alert).toHaveBeenCalledWith(
      'Error',
      'Refreshed, but the updated data could not be loaded from this device. What you see may be out of date.'
    );
  });

  it('should tell the user when the refresh itself fails', async () => {
    (manualRefreshAllData as jest.Mock).mockRejectedValue(new Error('network down'));
    const onDataReloaded = jest.fn().mockResolvedValue(undefined);

    await pressRefresh(onDataReloaded);

    expect(Alert.alert).toHaveBeenCalledWith(
      'Error',
      'Failed to refresh beer data. Please try again later.'
    );
  });

  it('should lower the refreshing flag even when the refresh throws', async () => {
    // The `finally` is the only thing that lowers it, and a stuck spinner also
    // wedges the hook: `handleRefresh` returns early while `refreshing` is
    // true, so pull-to-refresh would never work again this session.
    (manualRefreshAllData as jest.Mock).mockRejectedValue(new Error('network down'));
    const onDataReloaded = jest.fn().mockResolvedValue(undefined);

    const { getByTestId } = await pressRefresh(onDataReloaded);

    expect(getByTestId('refreshing').props.children).toBe('false');
  });

  it('should not refresh at all when the API URLs are not configured', async () => {
    (areApiUrlsConfigured as jest.Mock).mockResolvedValue(false);
    const onDataReloaded = jest.fn().mockResolvedValue(undefined);

    const { getByTestId } = await pressRefresh(onDataReloaded);

    expect(manualRefreshAllData).not.toHaveBeenCalled();
    expect(onDataReloaded).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith(
      'API URLs Not Configured',
      'Please log in via the Settings screen to configure API URLs before refreshing.'
    );
    // The spinner comes down on this path too. Note this assertion cannot
    // distinguish WHERE it happens: the early return is inside the try, so the
    // finally covers it, and deleting the explicit `setRefreshing(false)` that
    // used to sit beside the alert left the suite green. Kept because a stuck
    // spinner here would wedge the hook — `handleRefresh` returns early while
    // `refreshing` is true — but it guards the outcome, not the mechanism.
    expect(getByTestId('refreshing').props.children).toBe('false');
  });
});
