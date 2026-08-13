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

  it('should tell the user when reloading local data fails', async () => {
    // This failure reached nobody. The API refresh succeeds, the local re-read
    // throws, and the catch wrote a `error` state that no consumer of this hook
    // destructures — all three screens take `{ refreshing, handleRefresh }`.
    // So a pull-to-refresh that silently failed to update the list looked
    // exactly like one that had nothing new to show: the spinner retracted, the
    // stale rows stayed, and nothing was said.
    const onDataReloaded = jest.fn().mockRejectedValue(new Error('database locked'));

    await pressRefresh(onDataReloaded);

    expect(Alert.alert).toHaveBeenCalled();
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
    // Early return, not the finally — this is the path that leaves the spinner
    // up if the flag is lowered in the wrong place.
    expect(getByTestId('refreshing').props.children).toBe('false');
  });
});
