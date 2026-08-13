/**
 * Error-state tests for the Rewards screen.
 *
 * This screen had no tests, and until now its error branch was unreachable:
 * `errors.rewardError` was read here and written by nothing in the app, because
 * `setRewardError` had no caller. Making a failing rewards read reach the user
 * turns that dead branch into a live screen, so what it renders — and whether
 * its recovery control works — needs to be pinned before it ships.
 *
 * Renders against a real AppProvider. A hand-stubbed context value would let the
 * screen and the provider drift, and it is the provider that decides what
 * `rewardError` and `beers.rewards` hold at the same moment, which is exactly
 * what these tests are about.
 */

import React from 'react';
import { Alert, Pressable, Text } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { Rewards } from '../Rewards';
import { AppProvider, useAppContext } from '@/context/AppContext';
import { beerRepository } from '@/src/database/repositories/BeerRepository';
import { myBeersRepository } from '@/src/database/repositories/MyBeersRepository';
import { rewardsRepository } from '@/src/database/repositories/RewardsRepository';
import { fetchRewardsFromAPI } from '@/src/api/beerApi';
import { getSessionData } from '@/src/api/sessionManager';
import { isVisitorMode } from '@/src/api/authService';

jest.mock('@/src/database/repositories/BeerRepository');
jest.mock('@/src/database/repositories/MyBeersRepository');
jest.mock('@/src/database/repositories/RewardsRepository');
jest.mock('@/src/api/beerApi');
jest.mock('@/src/api/sessionManager');
jest.mock('@/src/api/authService');
jest.mock('@/hooks/useColorScheme', () => ({
  useColorScheme: jest.fn(() => 'light'),
}));

describe('Rewards error state', () => {
  const mockRewards = [{ reward_id: 'r1', redeemed: '0', reward_type: 'Free Plate' }];

  const mockTasted = [
    {
      id: '1',
      brew_name: 'Tasted IPA',
      brewer: 'Test Brewery',
      brew_style: 'IPA',
      brew_container: 'Draft',
      brew_description: 'Already checked in',
      added_date: '1699564800',
      brewer_loc: 'Austin, TX',
      abv: '6.5',
      ibu: '60',
      tasted_date: '11/01/2025',
      container_type: 'tulip' as const,
    },
  ];

  /**
   * Rewards has no control that reloads the context from outside its own error
   * branch, so the harness supplies one. This is how a test drives the state
   * the screen is in after a refresh elsewhere in the app fails — pull-to-
   * refresh on FINDER, the settings login flow — without going through the
   * button under test.
   */
  const Harness = () => {
    const { refreshBeerData } = useAppContext();

    return (
      <>
        <Pressable
          testID="context-refresh"
          onPress={() => {
            void refreshBeerData();
          }}
        >
          <Text>reload context</Text>
        </Pressable>
        <Rewards />
      </>
    );
  };

  const renderRewards = () => render(<Harness />, { wrapper: AppProvider });

  beforeEach(() => {
    jest.clearAllMocks();

    (getSessionData as jest.Mock).mockResolvedValue(null);
    (isVisitorMode as jest.Mock).mockResolvedValue(false);
    (beerRepository.getAll as jest.Mock).mockResolvedValue([]);
    (myBeersRepository.getAll as jest.Mock).mockResolvedValue(mockTasted);
    (rewardsRepository.getAll as jest.Mock).mockResolvedValue(mockRewards);
    (rewardsRepository.insertMany as jest.Mock).mockResolvedValue(undefined);

    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation();
  });

  it('should keep the progress and the rewards it already has when a later read fails', async () => {
    // The failure is in the rewards table. The tasted count is not, and neither
    // are the rewards already in context — the provider deliberately preserves
    // them rather than writing [] over them. A full-screen error branch throws
    // all of that away: the 200 Beer Challenge progress ring and milestone bar
    // are computed from `tastedBeers` and have nothing to do with rewards.
    const { getByTestId, getByText } = renderRewards();

    await waitFor(() => {
      expect(getByText('Free Plate')).toBeDefined();
    });

    (rewardsRepository.getAll as jest.Mock).mockRejectedValue(new Error('rewards table gone'));

    await act(async () => {
      fireEvent.press(getByTestId('context-refresh'));
    });

    expect(getByText('Failed to load rewards from database')).toBeDefined();
    expect(getByText('Free Plate')).toBeDefined();
    expect(getByText('YOUR JOURNEY')).toBeDefined();
    expect(getByText('1 of 200 beers tasted')).toBeDefined();
  });

  it('should not claim the user has earned nothing when the read failed', async () => {
    // "No Rewards Yet" is the lie this whole change exists to stop telling. It
    // must not appear as the empty state underneath a load failure either.
    (rewardsRepository.getAll as jest.Mock).mockRejectedValue(new Error('rewards table gone'));

    const { getByText, getByTestId, queryByText } = renderRewards();

    await waitFor(() => {
      expect(getByText('Failed to load rewards from database')).toBeDefined();
    });

    expect(queryByText('No Rewards Yet')).toBeNull();
    // The list still exists — this is suppression of the empty state, not the
    // old full-screen takeover, which also hid "No Rewards Yet" and would
    // otherwise satisfy the assertion above.
    expect(getByTestId('rewards-list')).toBeDefined();
  });

  it('should re-read the database, not the network, when try again is pressed', async () => {
    // The same fix the other three screens got. The failure this button appears
    // under is a local read failure, so a network round-trip is not what needs
    // retrying — and on this screen the network path additionally throws away
    // its own failure, which is the next test.
    let dbHealthy = false;
    (rewardsRepository.getAll as jest.Mock).mockImplementation(() =>
      dbHealthy ? Promise.resolve(mockRewards) : Promise.reject(new Error('rewards table gone'))
    );

    const { getByText, queryByText } = renderRewards();

    await waitFor(() => {
      expect(getByText('Failed to load rewards from database')).toBeDefined();
    });

    dbHealthy = true;
    const callsBeforePress = (rewardsRepository.getAll as jest.Mock).mock.calls.length;

    fireEvent.press(getByText('TRY AGAIN'));

    expect((rewardsRepository.getAll as jest.Mock).mock.calls.length).toBe(callsBeforePress + 1);
    expect(fetchRewardsFromAPI).not.toHaveBeenCalled();

    await act(async () => {});

    expect(queryByText('Failed to load rewards from database')).toBeNull();
    expect(getByText('Free Plate')).toBeDefined();
  });

  it('should tell the user when a pull-to-refresh fails', async () => {
    // `handleRefresh` caught its own failure into a console line and changed no
    // state at all: the spinner retracted, the screen was identical, and a
    // member whose rewards never arrived had no way to know the attempt failed.
    (fetchRewardsFromAPI as jest.Mock).mockResolvedValue({
      status: 'unavailable',
      reason: { code: 'NETWORK_ERROR', detail: 'offline' },
    });

    const { getByTestId } = renderRewards();

    await waitFor(() => {
      expect(getByTestId('rewards-list')).toBeDefined();
    });

    await act(async () => {
      getByTestId('rewards-list').props.refreshControl.props.onRefresh();
    });

    // The message pair, not merely "an alert fired" — a mutant that swapped
    // this for Alert.alert('Rewards Updated', 'Your rewards are up to date.')
    // kept the suite green, in the test named for a failure.
    expect(Alert.alert).toHaveBeenCalledWith(
      'Rewards Refresh Failed',
      'Could not refresh your rewards. Please try again.'
    );
  });

  it('should not report a failure the user did not ask for after a queued reward', async () => {
    // `queueReward` reuses the pull-to-refresh handler as a post-write sync.
    // Once that handler learned to alert, a reward the server accepted (HTTP
    // 200, "added to your queue!") could be followed by a second modal on top
    // saying the refresh failed — inviting the user to retry an operation that
    // already went through. One user action, two alerts, the worse one last:
    // exactly the shape this PR removed from useDataRefresh.
    // Driven through the real path — tap the reward, confirm the dialog — so
    // the test cannot pass by way of a seam production does not have.
    (getSessionData as jest.Mock).mockResolvedValue({
      memberId: 'm1',
      storeId: 's1',
      storeName: 'Test Saucer',
      sessionId: 'sess',
      username: 'tester',
      firstName: 'Test',
      lastName: 'User',
      email: 'test@example.com',
      cardNum: '1',
    });
    // The queue itself succeeds: HTTP 200 with an empty body is the branch the
    // server actually takes.
    global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => '' }) as jest.Mock;
    // ...and the sync that follows it fails.
    (fetchRewardsFromAPI as jest.Mock).mockResolvedValue({
      status: 'unavailable',
      reason: { code: 'NETWORK_ERROR', detail: 'offline' },
    });

    const { getByText } = renderRewards();

    await waitFor(() => {
      expect(getByText('Free Plate')).toBeDefined();
    });

    await act(async () => {
      fireEvent.press(getByText('Free Plate'));
    });

    // Confirm the "Queue Reward" dialog by invoking the button the component
    // handed to Alert.alert.
    const confirm = (Alert.alert as jest.Mock).mock.calls
      .flatMap(([, , buttons]) => buttons ?? [])
      .find((button: { text?: string }) => button?.text === 'Queue It!');
    expect(confirm).toBeDefined();

    await act(async () => {
      await confirm.onPress();
    });

    expect(Alert.alert).toHaveBeenCalledWith('Success', expect.stringContaining('queue'));
    expect(Alert.alert).not.toHaveBeenCalledWith('Rewards Refresh Failed', expect.anything());
  });

  it('should tell the user when the fetch worked but the local sync did not', async () => {
    // `refreshBeerData` swallows its own read failures into `beerError`, and
    // this screen renders only `rewardError` — so a pull-to-refresh whose
    // database sync failed printed "Rewards refreshed and AppContext synced",
    // retracted the spinner, changed nothing on screen and said nothing. The
    // fetch succeeding is not the same as the refresh succeeding.
    (fetchRewardsFromAPI as jest.Mock).mockResolvedValue({
      status: 'fetched',
      data: { kind: 'data', items: mockRewards },
    });

    const { getByTestId } = renderRewards();

    await waitFor(() => {
      expect(getByTestId('rewards-list')).toBeDefined();
    });

    // The write lands, the re-read does not.
    (rewardsRepository.getAll as jest.Mock).mockRejectedValue(new Error('db gone'));
    (beerRepository.getAll as jest.Mock).mockRejectedValue(new Error('db gone'));

    await act(async () => {
      getByTestId('rewards-list').props.refreshControl.props.onRefresh();
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      'Rewards Refresh Failed',
      'Could not refresh your rewards. Please try again.'
    );
  });

  it('should ignore a second refresh while one is already running', async () => {
    // There is no in-flight guard on this screen, unlike `useDataRefresh`.
    // Two overlapping refreshes each fetch, each write the whole rewards table
    // with `insertMany` (which clears it first), and the SLOWER fetch wins —
    // so a stale server snapshot can be published last, with no error. The
    // shared `refreshing` flag also lies: whichever finishes first retracts the
    // spinner while the other is still running.
    let releaseFirstFetch: ((value: unknown) => void) | undefined;
    (fetchRewardsFromAPI as jest.Mock).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          releaseFirstFetch = resolve;
        })
    );

    const { getByTestId } = renderRewards();

    await waitFor(() => {
      expect(getByTestId('rewards-list')).toBeDefined();
    });

    await act(async () => {
      getByTestId('rewards-list').props.refreshControl.props.onRefresh();
    });

    expect(releaseFirstFetch).toBeDefined();
    expect(fetchRewardsFromAPI).toHaveBeenCalledTimes(1);

    // Second pull while the first is still in flight.
    await act(async () => {
      getByTestId('rewards-list').props.refreshControl.props.onRefresh();
    });

    expect(fetchRewardsFromAPI).toHaveBeenCalledTimes(1);

    await act(async () => {
      releaseFirstFetch?.({ status: 'fetched', data: { kind: 'data', items: mockRewards } });
    });
  });

  it('should still report to a user whose pull joined a silent refresh', async () => {
    // The in-flight guard dedupes by call, and the two callers have opposite
    // reporting policies. A user pulling to refresh while a post-queue sync is
    // running was dropped silently: the RefreshControl was already spinning
    // from the sync they never started, so the pull looked like it worked, and
    // when the sync then failed offline nothing was said. That is the exact
    // silence this PR exists to remove, reintroduced by the fix for a
    // different one. The dropped call goes away; its intent must not.
    let releaseSilentFetch: ((value: unknown) => void) | undefined;
    (fetchRewardsFromAPI as jest.Mock).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          releaseSilentFetch = resolve;
        })
    );

    const { getByTestId, getByText } = renderRewards();

    await waitFor(() => {
      expect(getByText('Free Plate')).toBeDefined();
    });

    // A silent post-queue sync starts and parks on its fetch. Reached the only
    // way production reaches it: queue a reward.
    (getSessionData as jest.Mock).mockResolvedValue({
      memberId: 'm1',
      storeId: 's1',
      storeName: 'Test Saucer',
      sessionId: 'sess',
      username: 'tester',
      firstName: 'Test',
      lastName: 'User',
      email: 'test@example.com',
      cardNum: '1',
    });
    global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => '' }) as jest.Mock;

    await act(async () => {
      fireEvent.press(getByText('Free Plate'));
    });
    const confirm = (Alert.alert as jest.Mock).mock.calls
      .flatMap(([, , buttons]) => buttons ?? [])
      .find((button: { text?: string }) => button?.text === 'Queue It!');
    await act(async () => {
      await confirm.onPress();
    });

    expect(releaseSilentFetch).toBeDefined();

    // The user pulls to refresh while it is still running.
    await act(async () => {
      getByTestId('rewards-list').props.refreshControl.props.onRefresh();
    });

    // The in-flight sync then fails.
    await act(async () => {
      releaseSilentFetch?.({ status: 'unavailable', reason: { code: 'NET', detail: 'offline' } });
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      'Rewards Refresh Failed',
      'Could not refresh your rewards. Please try again.'
    );
  });

  it('should still say the queue failed when the haptics buzz also fails', async () => {
    // `queueReward`'s catch opens with `await Haptics.notificationAsync(...)`.
    // A rejection there — haptics is unavailable on web, and simulators are
    // inconsistent — jumps past the `Alert.alert` beneath it, so the failure is
    // reported to nobody and the rejection escapes an `onPress`. The user gets
    // a card that quietly unlocks and no message at all. Feedback about a
    // failure must not depend on the vibration motor.
    (getSessionData as jest.Mock).mockResolvedValue({
      memberId: 'm1',
      storeId: 's1',
      storeName: 'Test Saucer',
      sessionId: 'sess',
      username: 'tester',
      firstName: 'Test',
      lastName: 'User',
      email: 'test@example.com',
      cardNum: '1',
    });
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as jest.Mock;
    (Haptics.notificationAsync as jest.Mock).mockRejectedValue(new Error('no haptics'));

    const { getByText } = renderRewards();

    await waitFor(() => {
      expect(getByText('Free Plate')).toBeDefined();
    });

    await act(async () => {
      fireEvent.press(getByText('Free Plate'));
    });
    const confirm = (Alert.alert as jest.Mock).mock.calls
      .flatMap(([, , buttons]) => buttons ?? [])
      .find((button: { text?: string }) => button?.text === 'Queue It!');

    await act(async () => {
      await confirm.onPress();
    });

    expect(Alert.alert).toHaveBeenCalledWith('Error', expect.stringContaining('Failed to queue'));
  });

  it('should re-run once when a refresh is requested during another', async () => {
    // Dropping the second caller silently is wrong in this direction too. If a
    // pull-to-refresh is in flight when the user queues a reward, the post-queue
    // sync is dropped — and the in-flight fetch STARTED BEFORE the queue, so it
    // publishes a pre-queue snapshot and the correction that would have fixed
    // it never runs. The reward stays "AVAILABLE" with no error anywhere, which
    // is the same staleness the guard was added to prevent, reached from the
    // other ordering.
    let releaseFirstFetch: ((value: unknown) => void) | undefined;
    (fetchRewardsFromAPI as jest.Mock).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          releaseFirstFetch = resolve;
        })
    );

    const { getByTestId } = renderRewards();

    await waitFor(() => {
      expect(getByTestId('rewards-list')).toBeDefined();
    });

    await act(async () => {
      getByTestId('rewards-list').props.refreshControl.props.onRefresh();
    });
    expect(releaseFirstFetch).toBeDefined();

    // A second request arrives while the first is parked.
    await act(async () => {
      getByTestId('rewards-list').props.refreshControl.props.onRefresh();
    });
    expect(fetchRewardsFromAPI).toHaveBeenCalledTimes(1);

    // When the first finishes, the request it absorbed is honoured rather than
    // discarded.
    await act(async () => {
      releaseFirstFetch?.({ status: 'fetched', data: { kind: 'data', items: mockRewards } });
    });

    expect(fetchRewardsFromAPI).toHaveBeenCalledTimes(2);
  });

  it('should not report a re-run that only the silent sync asked for', async () => {
    // The mirror of the "joined a silent refresh" test, and the hole coalescing
    // opens: intent has to travel with the PASS, not with the loop. A user
    // pulls to refresh (wants to be told), a queue joins mid-flight (wants
    // silence), the user's pass succeeds — and the extra pass that exists only
    // for the queue then fails. Alerting there tells a user whose refresh
    // worked that it did not.
    let releaseUserFetch: ((value: unknown) => void) | undefined;
    (fetchRewardsFromAPI as jest.Mock).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          releaseUserFetch = resolve;
        })
    );

    const { getByTestId, getByText } = renderRewards();

    await waitFor(() => {
      expect(getByText('Free Plate')).toBeDefined();
    });

    // The user pulls to refresh; it parks on its fetch.
    await act(async () => {
      getByTestId('rewards-list').props.refreshControl.props.onRefresh();
    });
    expect(releaseUserFetch).toBeDefined();

    // A reward is queued while that is in flight, so its silent sync joins.
    (getSessionData as jest.Mock).mockResolvedValue({
      memberId: 'm1',
      storeId: 's1',
      storeName: 'Test Saucer',
      sessionId: 'sess',
      username: 'tester',
      firstName: 'Test',
      lastName: 'User',
      email: 'test@example.com',
      cardNum: '1',
    });
    global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => '' }) as jest.Mock;

    await act(async () => {
      fireEvent.press(getByText('Free Plate'));
    });
    const confirm = (Alert.alert as jest.Mock).mock.calls
      .flatMap(([, , buttons]) => buttons ?? [])
      .find((button: { text?: string }) => button?.text === 'Queue It!');
    await act(async () => {
      await confirm.onPress();
    });

    // The user's pass succeeds; the queue's re-run then fails.
    (fetchRewardsFromAPI as jest.Mock).mockResolvedValue({
      status: 'unavailable',
      reason: { code: 'NET', detail: 'offline' },
    });

    await act(async () => {
      releaseUserFetch?.({ status: 'fetched', data: { kind: 'data', items: mockRewards } });
    });

    expect(Alert.alert).not.toHaveBeenCalledWith('Rewards Refresh Failed', expect.anything());
  });

  it('should not show the failure banner when nothing has failed', async () => {
    // The banner lives in the list header now, so "render it unconditionally"
    // is a live mutant: an empty bordered error box with a working TRY AGAIN
    // button, permanently mounted above every healthy member's reward log.
    const { getByText, queryByTestId } = renderRewards();

    await waitFor(() => {
      expect(getByText('Free Plate')).toBeDefined();
    });

    expect(queryByTestId('reward-error-banner')).toBeNull();
  });
});
