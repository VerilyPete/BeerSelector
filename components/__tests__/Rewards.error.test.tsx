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

    const { getByText, queryByText } = renderRewards();

    await waitFor(() => {
      expect(getByText('Failed to load rewards from database')).toBeDefined();
    });

    expect(queryByText('No Rewards Yet')).toBeNull();
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

    expect(Alert.alert).toHaveBeenCalled();
  });
});
