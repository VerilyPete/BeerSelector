/**
 * Behaviour tests for AppContext, driven through a probe consumer.
 *
 * Deliberately NOT `renderHook`: TESTING.md bans it for React Native hooks, and
 * `AppProvider` imports `Alert` from react-native, which is exactly the class
 * of component that rule exists for. A probe that renders
 * state into `<Text testID>` and exposes actions via `<Pressable>` asserts the
 * same things through the public surface a real consumer uses.
 *
 * Where a test can drive its state through `refreshBeerData`, it does — that
 * path sets and clears its error synchronously with the load, so no timers are
 * involved. The mount effect is different: it swallows a failure into 3 retries
 * at 1s/2s/4s before surfacing anything, so the two tests that need the
 * mount-flavoured error pump fake timers to get there.
 *
 * Pumping means advance-then-flush in a loop, not one large advance. Each retry
 * is only scheduled once the previous rejection settles in a microtask, so a
 * single `advanceTimersByTime` fires the first timer and stops — which makes a
 * race silently un-reproducible and the test pass for the wrong reason.
 */

import React from 'react';
import { Alert, Pressable, Text } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AppProvider, useAppContext } from '../AppContext';
import { beerRepository } from '@/src/database/repositories/BeerRepository';
import { myBeersRepository } from '@/src/database/repositories/MyBeersRepository';
import { rewardsRepository } from '@/src/database/repositories/RewardsRepository';
import { getSessionData } from '@/src/api/sessionManager';
import { isVisitorMode } from '@/src/api/authService';

jest.mock('@/src/database/repositories/BeerRepository');
jest.mock('@/src/database/repositories/MyBeersRepository');
jest.mock('@/src/database/repositories/RewardsRepository');
jest.mock('@/src/api/sessionManager');
jest.mock('@/src/api/authService');

describe('AppContext', () => {
  const mockBeers = [
    {
      id: '1',
      brew_name: 'Test IPA',
      brewer: 'Test Brewery',
      brew_style: 'IPA',
      brew_container: 'Draft',
      brew_description: 'A test beer',
      added_date: '1699564800',
      brewer_loc: 'Austin, TX',
      abv: '6.5',
      ibu: '60',
      container_type: 'tulip' as const,
    },
  ];

  /**
   * Renders the three pieces of state this file cares about and exposes the
   * one action that drives them. `beerError` is rendered as the literal string
   * 'none' when null so the assertion distinguishes "cleared" from "component
   * rendered nothing at all".
   */
  const Probe = () => {
    const { beers, errors, loading, refreshBeerData } = useAppContext();

    return (
      <>
        <Text testID="beer-error">{errors.beerError ?? 'none'}</Text>
        <Text testID="beer-count">{String(beers.allBeers.length)}</Text>
        <Text testID="beer-loading">{String(loading.isLoadingBeers)}</Text>
        <Text testID="reward-error">{errors.rewardError ?? 'none'}</Text>
        <Text testID="reward-count">{String(beers.rewards.length)}</Text>
        <Pressable
          testID="refresh"
          onPress={() => {
            void refreshBeerData();
          }}
        >
          <Text>refresh</Text>
        </Pressable>
      </>
    );
  };

  const renderProbe = () => render(<Probe />, { wrapper: AppProvider });

  beforeEach(() => {
    jest.clearAllMocks();

    (getSessionData as jest.Mock).mockResolvedValue(null);
    (isVisitorMode as jest.Mock).mockResolvedValue(false);
    (beerRepository.getAll as jest.Mock).mockResolvedValue(mockBeers);
    (myBeersRepository.getAll as jest.Mock).mockResolvedValue([]);
    (rewardsRepository.getAll as jest.Mock).mockResolvedValue([]);

    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  describe('refreshBeerData', () => {
    it('should clear a previous error once a refresh succeeds', async () => {
      // The error state has no working exit without this. `refreshBeerData` set
      // beerError in its catch and never cleared it on success, so Beerfinder's
      // Try Again — which routes handleRefresh -> onDataReloaded ->
      // refreshBeerData — refetched successfully and left the user staring at
      // the error screen. The only escape was visiting the All Beer tab, whose
      // loadBeers clears the flag as a side effect.
      const { getByTestId } = renderProbe();

      await waitFor(() => {
        expect(getByTestId('beer-count').props.children).toBe('1');
      });

      // Put the context into the error state through refreshBeerData's own
      // catch. No retries on this path, so no timers are needed.
      (beerRepository.getAll as jest.Mock).mockRejectedValue(new Error('db gone'));

      await act(async () => {
        fireEvent.press(getByTestId('refresh'));
      });

      expect(getByTestId('beer-error').props.children).toBe(
        'Failed to refresh beer data from database'
      );

      // The database recovers and the user presses Try Again.
      //
      // The recovered list is deliberately a DIFFERENT length from the one the
      // mount loaded. Recovering to the same 1-element fixture makes the row
      // count '1' at every point in this test — before the failure, during it
      // (the throw happens inside Promise.all, before setBeers) and after — so
      // the assertion would hold whether or not anything was actually
      // reloaded. An implementation that cleared the error and skipped the
      // reload passed with the identical fixture.
      (beerRepository.getAll as jest.Mock).mockResolvedValue([
        ...mockBeers,
        { ...mockBeers[0], id: '2', brew_name: 'Recovered Stout' },
      ]);

      await act(async () => {
        fireEvent.press(getByTestId('refresh'));
      });

      // Both assertions matter, and the second only earns its place because
      // the recovered list differs: it fails on an implementation that clears
      // the error without committing fresh rows.
      expect(getByTestId('beer-error').props.children).toBe('none');
      expect(getByTestId('beer-count').props.children).toBe('2');
    });

    it('should clear the error the mount retries raised, not just its own', async () => {
      // THE motivating scenario, and the one the other tests miss. They both
      // seed the error through refreshBeerData's own catch, which says
      // "Failed to REFRESH beer data from database". The bug users actually
      // hit starts from the message the mount effect raises after its 3 retries
      // — "Failed to LOAD beer data from database" — alongside a "restart the
      // app" alert. An implementation that only cleared the error
      // it set itself would pass every other test here while leaving the
      // headline bug completely unfixed.
      let dbHealthy = false;
      (beerRepository.getAll as jest.Mock).mockImplementation(() =>
        dbHealthy ? Promise.resolve(mockBeers) : Promise.reject(new Error('db down'))
      );

      const { getByTestId } = renderProbe();

      // Let the mount effect exhaust its 1s/2s/4s chain. Pumped, because each
      // retry is only scheduled once the previous rejection settles.
      for (let i = 0; i < 6; i++) {
        await act(async () => {
          jest.advanceTimersByTime(5000);
        });
      }

      expect(getByTestId('beer-error').props.children).toBe(
        'Failed to load beer data from database'
      );

      // A genuine unrecoverable launch failure must still tell the user. This
      // pairs with the `not.toHaveBeenCalled()` in the race test below: that
      // one alone would be satisfied by an implementation that never alerts at
      // all, so the two together pin both edges of the alert.
      expect(Alert.alert).toHaveBeenCalled();

      // The database comes back and the user presses Try Again.
      dbHealthy = true;
      await act(async () => {
        fireEvent.press(getByTestId('refresh'));
      });

      expect(getByTestId('beer-error').props.children).toBe('none');
      expect(getByTestId('beer-count').props.children).toBe('1');
    });

    it('should stop showing the loading flag once a refresh settles', async () => {
      // `refreshBeerData`'s `finally` is the only thing that lowers
      // isLoadingBeers. Emptying it left every consumer's skeleton up forever
      // and the whole suite green — the set half is pinned by Beerfinder's
      // refresh test, the clear half was naked.
      const { getByTestId } = renderProbe();

      await waitFor(() => {
        expect(getByTestId('beer-count').props.children).toBe('1');
      });

      await act(async () => {
        fireEvent.press(getByTestId('refresh'));
      });

      expect(getByTestId('beer-loading').props.children).toBe('false');

      // And after a failing refresh, which takes the catch instead.
      (beerRepository.getAll as jest.Mock).mockRejectedValue(new Error('db down'));

      await act(async () => {
        fireEvent.press(getByTestId('refresh'));
      });

      expect(getByTestId('beer-loading').props.children).toBe('false');
    });

    it('should not re-raise the error after a later load has already succeeded', async () => {
      // The mount effect retries a failed load 3x at 1s/2s/4s and then sets
      // beerError unconditionally, knowing nothing about loads that happened
      // meanwhile. A transient failure (SQLITE_BUSY under DatabaseLockManager
      // contention at launch is exactly this) therefore ends with the retry
      // chain painting a full-screen error and a "restart the app" alert over
      // a complete, freshly-loaded list.
      let dbHealthy = false;
      (beerRepository.getAll as jest.Mock).mockImplementation(() =>
        dbHealthy ? Promise.resolve(mockBeers) : Promise.reject(new Error('SQLITE_BUSY'))
      );

      const { getByTestId } = renderProbe();

      // First mount attempt fails and schedules a retry.
      await act(async () => {});

      // Inside the retry window the database answers and the user refreshes.
      dbHealthy = true;
      await act(async () => {
        fireEvent.press(getByTestId('refresh'));
      });

      expect(getByTestId('beer-error').props.children).toBe('none');
      expect(getByTestId('beer-count').props.children).toBe('1');

      // The transient fault returns, and the background retries exhaust
      // against it. They must not overwrite the good state already on screen.
      dbHealthy = false;
      // Each retry is only *scheduled* once the previous rejection settles in a
      // microtask, so one large advance fires only the first timer. Pump
      // advance-then-flush repeatedly to walk the whole 1s/2s/4s chain.
      for (let i = 0; i < 6; i++) {
        await act(async () => {
          jest.advanceTimersByTime(5000);
        });
      }

      expect(getByTestId('beer-count').props.children).toBe('1');
      expect(getByTestId('beer-error').props.children).toBe('none');

      // The alert is guarded too, not just the error state. Suppressing the
      // error string while still firing "check your connection and restart the
      // app" over a complete list is the same harm in a modal, and it survived
      // until this assertion existed.
      expect(Alert.alert).not.toHaveBeenCalled();
    });

    it('should surface an error when the refresh itself fails', async () => {
      // Guards the other half of the branch: clearing on success must not be
      // implemented by never setting the error in the first place.
      const { getByTestId } = renderProbe();

      await waitFor(() => {
        expect(getByTestId('beer-count').props.children).toBe('1');
      });

      (beerRepository.getAll as jest.Mock).mockRejectedValue(new Error('db gone'));

      await act(async () => {
        fireEvent.press(getByTestId('refresh'));
      });

      expect(getByTestId('beer-error').props.children).toBe(
        'Failed to refresh beer data from database'
      );

      // The rows the user already had must survive a failed refresh. Adding a
      // `setBeers({ allBeers: [] })` beside the catch's setBeerError left the
      // whole suite green: pull-to-refresh with the database down emptied the
      // list behind the error screen, and nothing noticed.
      expect(getByTestId('beer-count').props.children).toBe('1');
    });
  });

  describe('a failing rewards read', () => {
    const mockRewards = [{ reward_id: 'r1', redeemed: '0', reward_type: 'plate' }];

    it('should not take the beer list down with it', async () => {
      // All three repositories shared one Promise.all, so an unreadable rewards
      // table failed the whole load: the catalog and the tasted list went with
      // it, the user got a full-screen "Failed to load beer data from
      // database" naming the wrong subsystem, and the mount effect spent 7s
      // retrying a read that was never going to succeed.
      //
      // Rewards are the least load-bearing of the three — the 200 Beer
      // Challenge does not depend on them — so they must not be able to blank
      // the two that are.
      (rewardsRepository.getAll as jest.Mock).mockRejectedValue(new Error('rewards table gone'));

      const { getByTestId } = renderProbe();

      await waitFor(() => {
        expect(getByTestId('beer-count').props.children).toBe('1');
      });

      expect(getByTestId('beer-error').props.children).toBe('none');
    });

    it('should tell the user the rewards failed', async () => {
      // `setRewardError` existed and had no caller anywhere in the app, so
      // `errors.rewardError` was read by Rewards.tsx's error branch and written
      // by nothing: a rewards failure could not reach the user by any path.
      // Before this, the repository swallowed the error and returned [], and
      // the screen said "no rewards" to a member who had earned them.
      (rewardsRepository.getAll as jest.Mock).mockRejectedValue(new Error('rewards table gone'));

      const { getByTestId } = renderProbe();

      await waitFor(() => {
        expect(getByTestId('reward-error').props.children).toBe(
          'Failed to load rewards from database'
        );
      });
    });

    it('should keep the rewards it already had', async () => {
      // Same rule the beer list gets from the refresh-failure test below it:
      // a failed re-read must not empty what is already on screen. Writing []
      // beside the error puts "No Rewards Yet" under the failure banner on
      // Rewards.tsx — the same lie the swallowed repository error used to tell.
      //
      // An earlier version of this comment claimed that outcome while the
      // screen could not produce it: `rewardError` took the whole screen over,
      // so neither the rewards nor the empty state rendered at all, and this
      // preservation was unobservable. Rewards.tsx now reports the failure in
      // place, which is what makes the rows worth keeping.
      (rewardsRepository.getAll as jest.Mock).mockResolvedValue(mockRewards);

      const { getByTestId } = renderProbe();

      await waitFor(() => {
        expect(getByTestId('reward-count').props.children).toBe('1');
      });

      (rewardsRepository.getAll as jest.Mock).mockRejectedValue(new Error('rewards table gone'));

      await act(async () => {
        fireEvent.press(getByTestId('refresh'));
      });

      expect(getByTestId('reward-error').props.children).toBe(
        'Failed to load rewards from database'
      );
      expect(getByTestId('reward-count').props.children).toBe('1');
    });

    it('should not let a stale load raise an error over a newer good one', async () => {
      // Found independently by three reviewers, which is why it is fixed here
      // rather than deferred.
      //
      // Load A starts at mount; its rewards query blocks on a lock. The user
      // refreshes, and load B completes entirely — good rewards, no error. Then
      // A's rewards query finally rejects, and A commits ITS outcome over the
      // top of B's: a full-screen rewards error raised seconds later over data
      // that is fine and is still sitting in context.
      //
      // `hasLoadedBeerData` does not cover this. That latch guards `beerError`
      // raised by the mount retry chain; `rewardError` had no equivalent, and
      // the last writer won unconditionally.
      let releaseStaleRewards: (() => void) | undefined;
      (rewardsRepository.getAll as jest.Mock).mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            releaseStaleRewards = () => reject(new Error('rewards read timed out'));
          })
      );

      const { getByTestId } = renderProbe();

      // Load A is now in flight with its rewards read parked. Load B runs to
      // completion against a healthy database.
      (rewardsRepository.getAll as jest.Mock).mockResolvedValue(mockRewards);

      await act(async () => {
        fireEvent.press(getByTestId('refresh'));
      });

      expect(getByTestId('reward-count').props.children).toBe('1');
      expect(getByTestId('reward-error').props.children).toBe('none');

      // A's rewards read fails, long after B settled everything.
      await act(async () => {
        releaseStaleRewards?.();
      });

      expect(getByTestId('reward-error').props.children).toBe('none');
      expect(getByTestId('reward-count').props.children).toBe('1');
    });

    it('should not let a stale load overwrite newer rows', async () => {
      // The other half of the same guard. The rewards error is what made this
      // race newly visible, but a late load also carries a stale catalog and
      // tasted list, and committing those moves the whole screen backwards —
      // on FINDER, to a tasted list that no longer matches what was checked in.
      let releaseStaleBeers: ((rows: typeof mockBeers) => void) | undefined;
      (beerRepository.getAll as jest.Mock).mockImplementationOnce(
        () =>
          new Promise(resolve => {
            releaseStaleBeers = resolve;
          })
      );

      const { getByTestId } = renderProbe();

      (beerRepository.getAll as jest.Mock).mockResolvedValue([
        ...mockBeers,
        { ...mockBeers[0], id: '2', brew_name: 'Newer Stout' },
      ]);

      await act(async () => {
        fireEvent.press(getByTestId('refresh'));
      });

      expect(getByTestId('beer-count').props.children).toBe('2');

      // The parked mount read finally answers with the one row it saw.
      await act(async () => {
        releaseStaleBeers?.(mockBeers);
      });

      expect(getByTestId('beer-count').props.children).toBe('2');
    });

    it('should clear the rewards error once a later read succeeds', async () => {
      // The exit. This is the bug #17 fixed for `beerError` — set on failure,
      // never cleared on success, so the error screen outlived the failure —
      // and there is no reason for `rewardError` to repeat it.
      (rewardsRepository.getAll as jest.Mock).mockRejectedValue(new Error('rewards table gone'));

      const { getByTestId } = renderProbe();

      await waitFor(() => {
        expect(getByTestId('reward-error').props.children).toBe(
          'Failed to load rewards from database'
        );
      });

      (rewardsRepository.getAll as jest.Mock).mockResolvedValue(mockRewards);

      await act(async () => {
        fireEvent.press(getByTestId('refresh'));
      });

      expect(getByTestId('reward-error').props.children).toBe('none');
      expect(getByTestId('reward-count').props.children).toBe('1');
    });
  });
});
