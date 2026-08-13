/**
 * Error-recovery tests for TastedBrewList.
 *
 * The screen had no suite at all. It reads `errors.beerError` straight off
 * AppContext and renders a Try Again control under it, and until this file
 * existed nothing anywhere asserted that the control does anything — the same
 * hole that let `refreshBeerData` ship for months leaving `beerError` set after
 * a successful reload.
 *
 * Scope is deliberately narrow: the error branch and the way out of it. The
 * skeleton, filter and list branches are covered by the AllBeers and Beerfinder
 * loading suites against the same shared components.
 *
 * Renders against a real AppProvider rather than a stubbed context value: the
 * assertions are about what the user sees for a given provider state, and a
 * hand-rolled value would let the two drift apart with the suite still green.
 */

import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { TastedBrewList } from '../TastedBrewList';
import { AppProvider } from '@/context/AppContext';
import { beerRepository } from '@/src/database/repositories/BeerRepository';
import { myBeersRepository } from '@/src/database/repositories/MyBeersRepository';
import { rewardsRepository } from '@/src/database/repositories/RewardsRepository';
import { getSessionData } from '@/src/api/sessionManager';
import { isVisitorMode } from '@/src/api/authService';
import { useBeerFilters } from '@/hooks/useBeerFilters';
import { useDataRefresh } from '@/hooks/useDataRefresh';
import { useOptimisticCheckIn } from '@/hooks/useOptimisticCheckIn';

jest.mock('@/src/database/repositories/BeerRepository');
jest.mock('@/src/database/repositories/MyBeersRepository');
jest.mock('@/src/database/repositories/RewardsRepository');
jest.mock('@/src/api/sessionManager');
jest.mock('@/src/api/authService');
jest.mock('@/hooks/useBeerFilters');
jest.mock('@/hooks/useDataRefresh');
jest.mock('@/hooks/useOptimisticCheckIn');
jest.mock('@/hooks/useDebounce', () => ({
  useDebounce: <T,>(value: T) => value,
}));
jest.mock('@/hooks/useColorScheme', () => ({
  useColorScheme: jest.fn(() => 'light'),
}));
jest.mock('../beer/SkeletonLoader', () => ({
  SkeletonLoader: ({ count }: { count: number }) => {
    const React = require('react');
    const { View, Text } = require('react-native');
    return (
      <View testID="skeleton-loader">
        <Text>Loading {count} skeletons...</Text>
      </View>
    );
  },
}));

/**
 * The provider retries a failed load 3x at 1s/2s/4s before it sets
 * `beerError`, so nothing renders for 7s of fake-clock time. waitFor's budget
 * is measured on that same fake clock and its 1s default expires long before
 * the last retry. 8000 leaves room for polling granularity and nothing else: a
 * doubled backoff (2s/4s/8s) must not slip through unnoticed.
 */
const ERROR_SURFACE_TIMEOUT = 8000;

describe('TastedBrewList error recovery', () => {
  const mockTastedBeers = [
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

  const renderList = () => render(<TastedBrewList />, { wrapper: AppProvider });

  beforeEach(() => {
    jest.clearAllMocks();

    (getSessionData as jest.Mock).mockResolvedValue(null);
    (isVisitorMode as jest.Mock).mockResolvedValue(false);
    (beerRepository.getAll as jest.Mock).mockResolvedValue([]);
    (myBeersRepository.getAll as jest.Mock).mockResolvedValue(mockTastedBeers);
    (rewardsRepository.getAll as jest.Mock).mockResolvedValue([]);

    (useBeerFilters as jest.Mock).mockImplementation((beers: unknown[] | undefined) => ({
      filteredBeers: beers ?? [],
      containerFilter: 'all',
      sortBy: 'date',
      sortDirection: 'desc',
      searchText: '',
      expandedId: null,
      setSearchText: jest.fn(),
      cycleContainerFilter: jest.fn(),
      cycleSort: jest.fn(),
      toggleSortDirection: jest.fn(),
      toggleExpand: jest.fn(),
      setExpandedId: jest.fn(),
    }));

    (useOptimisticCheckIn as jest.Mock).mockReturnValue({
      getPendingBeer: jest.fn(() => null),
      retryCheckIn: jest.fn(),
      rollbackCheckIn: jest.fn(),
    });

    (useDataRefresh as jest.Mock).mockReturnValue({
      refreshing: false,
      handleRefresh: jest.fn(),
    });

    // The provider alerts once it exhausts its retries; keep it off the console.
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  it('should show the context error and a way out when the load fails', async () => {
    (myBeersRepository.getAll as jest.Mock).mockRejectedValue(new Error('Database error'));

    const { getByText, queryByTestId } = renderList();

    await waitFor(
      () => {
        expect(getByText('Failed to load beer data from database')).toBeDefined();
      },
      { timeout: ERROR_SURFACE_TIMEOUT }
    );

    expect(getByText('Try Again')).toBeDefined();
    // The error branch replaces the list wholesale — asserted so a future
    // change that renders both cannot pass on the error text alone.
    expect(queryByTestId('beer-list')).toBeNull();
    expect(queryByTestId('skeleton-loader')).toBeNull();
  });

  it('should re-read the database and clear the error when try again is pressed', async () => {
    // Try Again re-reads the DATABASE, not the network. The failure it appears
    // under is a local read failure, and the hook behind pull-to-refresh bails
    // at its API-URL check for a visitor or logged-out user — the state a
    // first-launch failure leaves you in — so routing this button through it
    // made it a dead control for the users most likely to press it.
    const handleRefresh = jest.fn().mockResolvedValue(undefined);
    (useDataRefresh as jest.Mock).mockReturnValue({ refreshing: false, handleRefresh });

    let dbHealthy = false;
    (myBeersRepository.getAll as jest.Mock).mockImplementation(() =>
      dbHealthy ? Promise.resolve(mockTastedBeers) : Promise.reject(new Error('Database error'))
    );

    const { getByText, queryByText, getByTestId } = renderList();

    await waitFor(
      () => {
        expect(getByText('Try Again')).toBeDefined();
      },
      { timeout: ERROR_SURFACE_TIMEOUT }
    );

    dbHealthy = true;
    const callsBeforePress = (myBeersRepository.getAll as jest.Mock).mock.calls.length;

    fireEvent.press(getByText('Try Again'));

    // Synchronous, before any timer advance, so only the press can explain it.
    // Through a waitFor this would prove nothing: waitFor pumps the fake clock,
    // and a provider retry firing on its own would clear the error whether or
    // not the button is wired to anything.
    expect((myBeersRepository.getAll as jest.Mock).mock.calls.length).toBe(callsBeforePress + 1);

    await act(async () => {});

    expect(queryByText('Try Again')).toBeNull();
    expect(getByTestId('beer-list')).toBeDefined();

    // Not through the refresh hook.
    expect(handleRefresh).not.toHaveBeenCalled();
  });
});
