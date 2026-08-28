/**
 * Integration tests for Beerfinder loading states.
 *
 * Beerfinder has no loader of its own (MP-4 Step 2): it derives the untasted
 * list from AppContext via selectUntastedBeers(allBeers, tastedBeers, queued)
 * and reads `loading.isLoadingBeers` / `errors.beerError` straight off the
 * context. So these render against a real AppProvider and drive every state
 * through the repositories the provider loads from on mount.
 *
 * Loading State Requirements:
 * - Show SkeletonLoader while the context is loading and no beers have arrived
 * - Show BeerList of untasted beers once data loads
 * - Keep QUEUE/REWARDS actions reachable while loading and once loaded
 *   (NOT in the error state — that branch renders only the message + Try Again)
 * - Show the context error and a Try Again control when loading fails
 * - Never show the skeleton during pull-to-refresh
 */

import React from 'react';
import { Alert, RefreshControl } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Beerfinder } from '../Beerfinder';
import { BeerList } from '../beer/BeerList';
import { UntappdWebView } from '../UntappdWebView';
import { AppProvider } from '@/context/AppContext';
import { beerRepository } from '@/src/database/repositories/BeerRepository';
import { myBeersRepository } from '@/src/database/repositories/MyBeersRepository';
import { rewardsRepository } from '@/src/database/repositories/RewardsRepository';
import { getSessionData } from '@/src/api/sessionManager';
import { isVisitorMode } from '@/src/api/authService';
import { getQueuedBeers } from '@/src/api/queueService';
import { router } from 'expo-router';
import { useBeerFilters } from '@/hooks/useBeerFilters';
import { useDataRefresh } from '@/hooks/useDataRefresh';
import { useQueuedCheckIn } from '@/hooks/useQueuedCheckIn';

// Mock dependencies
jest.mock('@/src/database/repositories/BeerRepository');
jest.mock('@/src/database/repositories/MyBeersRepository');
jest.mock('@/src/database/repositories/RewardsRepository');
jest.mock('@/src/api/sessionManager');
jest.mock('@/src/api/authService');
jest.mock('@/src/api/queueService');
jest.mock('@/src/services/liveActivityService');
jest.mock('@/hooks/useBeerFilters');
jest.mock('@/hooks/useDataRefresh');
jest.mock('@/hooks/useQueuedCheckIn');
jest.mock('@/hooks/useDebounce', () => ({
  useDebounce: (value: any) => value,
}));
jest.mock('@/hooks/useColorScheme', () => ({
  useColorScheme: jest.fn(() => 'light'),
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
}));

// Mock SkeletonLoader
jest.mock('../beer/SkeletonLoader', () => ({
  SkeletonLoader: ({ count }: any) => {
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
 * The provider swallows a failed load into 3 retries at 1s/2s/4s backoff before
 * it finally sets errors.beerError, so nothing is rendered for 7s of timer time.
 * jest.setup.js installs fake timers and waitFor drives them, so that costs no
 * wall-clock — but the waitFor budget is measured on the same fake clock, and
 * the 1s default expires long before the last retry. Hence the explicit budget.
 *
 * 8000 rather than something rounder: the error surfaces at exactly 7000ms of
 * fake time, so this leaves room for waitFor's polling granularity and nothing
 * else. A larger budget would let a doubled backoff (2s/4s/8s = 14s) pass
 * unnoticed, which is the regression this constant should be catching.
 */
const ERROR_SURFACE_TIMEOUT = 8000;

describe('Beerfinder Loading States', () => {
  const mockAllBeers = [
    {
      id: '1',
      brew_name: 'Untasted IPA',
      brewer: 'Test Brewery',
      brew_style: 'IPA',
      brew_container: 'Draft',
      brew_description: 'Not yet tasted',
      added_date: '1699564800',
      brewer_loc: 'Austin, TX',
      abv: '6.5',
      ibu: '60',
      container_type: 'tulip' as const,
    },
    {
      id: '2',
      brew_name: 'Untasted Stout',
      brewer: 'Another Brewery',
      brew_style: 'Stout',
      brew_container: 'Bottle',
      brew_description: 'Another untasted beer',
      added_date: '1699651200',
      brewer_loc: 'Denver, CO',
      abv: '8.0',
      ibu: '45',
      container_type: 'pint' as const,
    },
  ];

  // Shares id '2' with mockAllBeers: Beerfinder must subtract it from the list.
  const mockTastedBeers = [
    {
      id: '2',
      brew_name: 'Untasted Stout',
      brewer: 'Another Brewery',
      tasted_date: '11/01/2025',
      container_type: 'pint' as const,
    },
  ];

  // Beerfinder reads everything off context, so it always needs a real provider.
  const renderBeerfinder = () => render(<Beerfinder />, { wrapper: AppProvider });

  /**
   * Pass-through filter hook with a chosen row expanded. The returned shape must
   * track the real useBeerFilters' return value; row actions (CHECK IN/UNTAPPD)
   * only render for the expanded id.
   */
  const expandBeer = (expandedId: string | null) => {
    (useBeerFilters as jest.Mock).mockImplementation((beers: any) => ({
      filteredBeers: beers ?? [],
      containerFilter: 'all',
      sortBy: 'date',
      sortDirection: 'desc',
      searchText: '',
      expandedId,
      setSearchText: jest.fn(),
      cycleContainerFilter: jest.fn(),
      cycleSort: jest.fn(),
      toggleSortDirection: jest.fn(),
      toggleExpand: jest.fn(),
      setExpandedId: jest.fn(),
    }));
  };

  /**
   * Filter-hook mock with STABLE spies and an overridable filtered list.
   *
   * `expandBeer` is a pass-through: fresh `jest.fn()`s on every render, so
   * nothing can be asserted about what the component called, and its
   * `filteredBeers` is always the full input — so a count assertion cannot
   * distinguish `filteredBeers.length` from the unfiltered source. Both gaps
   * hid live mutants.
   */
  const mockFilters = (overrides: Record<string, unknown> = {}) => {
    const spies = {
      setSearchText: jest.fn(),
      cycleContainerFilter: jest.fn(),
      cycleSort: jest.fn(),
      toggleSortDirection: jest.fn(),
      toggleExpand: jest.fn(),
      setExpandedId: jest.fn(),
    };
    (useBeerFilters as jest.Mock).mockImplementation((beers: any) => ({
      filteredBeers: beers ?? [],
      containerFilter: 'all',
      sortBy: 'date',
      sortDirection: 'desc',
      searchText: '',
      expandedId: null,
      ...spies,
      ...overrides,
    }));
    return spies;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // AppProvider loads session + all three repositories on mount; those loads
    // are the only way to drive Beerfinder's loading, loaded and error states.
    (getSessionData as jest.Mock).mockResolvedValue(null);
    (isVisitorMode as jest.Mock).mockResolvedValue(false);
    (beerRepository.getAll as jest.Mock).mockResolvedValue(mockAllBeers);
    (myBeersRepository.getAll as jest.Mock).mockResolvedValue([]);
    (rewardsRepository.getAll as jest.Mock).mockResolvedValue([]);

    (getQueuedBeers as jest.Mock).mockResolvedValue([]);

    (useQueuedCheckIn as jest.Mock).mockReturnValue({
      queuedCheckIn: jest.fn(),
      isLoading: false,
    });

    expandBeer(null);

    (useDataRefresh as jest.Mock).mockReturnValue({
      refreshing: false,
      handleRefresh: jest.fn(),
    });

    // The provider alerts once it exhausts its retries; keep it off the console.
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  describe('Initial Load - Skeleton Display', () => {
    it('should show skeleton loader while beer data is still loading', async () => {
      (beerRepository.getAll as jest.Mock).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(mockAllBeers), 1000))
      );

      const { getByTestId, queryByTestId } = renderBeerfinder();

      // Should show skeleton immediately
      expect(getByTestId('skeleton-loader')).toBeDefined();

      // Should NOT show beer list yet
      expect(queryByTestId('beer-list')).toBeNull();
    });

    it('should show skeleton until every context source has resolved', async () => {
      // All beers land quickly, tasted beers lag. The untasted set is not
      // knowable until both are in — AppContext only calls setBeers after
      // Promise.all — so the skeleton must stay put while the slow one runs.
      (beerRepository.getAll as jest.Mock).mockResolvedValue(mockAllBeers);
      (myBeersRepository.getAll as jest.Mock).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(mockTastedBeers), 800))
      );

      const { getByTestId, queryByTestId } = renderBeerfinder();

      // Let the fast source resolve and flush its microtasks. Asserting at mount
      // instead would pass with no lag at all, proving nothing about "until".
      await act(async () => {
        jest.advanceTimersByTime(400);
      });

      expect(getByTestId('skeleton-loader')).toBeDefined();
      expect(queryByTestId('beer-list')).toBeNull();

      // Once the slow source lands, the list appears.
      await act(async () => {
        jest.advanceTimersByTime(400);
      });

      expect(getByTestId('beer-list')).toBeDefined();
      expect(queryByTestId('skeleton-loader')).toBeNull();
    });

    it('should show action buttons (QUEUE, REWARDS) above skeleton', async () => {
      (beerRepository.getAll as jest.Mock).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(mockAllBeers), 500))
      );

      const { getByTestId, getByText } = renderBeerfinder();

      // Skeleton visible
      expect(getByTestId('skeleton-loader')).toBeDefined();

      // Action buttons stay reachable during loading so the user can navigate away
      expect(getByText('QUEUE')).toBeDefined();
      expect(getByText('REWARDS')).toBeDefined();
    });
  });

  describe('Data Loaded - Show BeerList with Actions', () => {
    it('should hide skeleton and show beer list when beer data loads', async () => {
      const { queryByTestId, getByTestId } = renderBeerfinder();

      // Initially shows skeleton
      expect(queryByTestId('skeleton-loader')).not.toBeNull();

      // Wait for data to load
      await waitFor(() => {
        expect(getByTestId('beer-list')).toBeDefined();
      });

      // Skeleton should be hidden
      expect(queryByTestId('skeleton-loader')).toBeNull();
    });

    it('should show count of beers left to discover when data loads', async () => {
      const { getByText } = renderBeerfinder();

      await waitFor(() => {
        expect(getByText('2 to discover')).toBeDefined();
      });
    });

    it('should exclude tasted beers from the count', async () => {
      // Beerfinder = All Beers - Tasted Beers. One of the two is already tasted.
      (myBeersRepository.getAll as jest.Mock).mockResolvedValue(mockTastedBeers);

      const { getByText, queryByText } = renderBeerfinder();

      await waitFor(() => {
        expect(getByText('1 to discover')).toBeDefined();
      });

      expect(getByText('Untasted IPA')).toBeDefined();
      expect(queryByText('Untasted Stout')).toBeNull();
    });

    it('should not show row actions until a beer is expanded', async () => {
      const { getByTestId, queryByText } = renderBeerfinder();

      await waitFor(() => {
        expect(getByTestId('beer-list')).toBeDefined();
      });

      // BeerItem only renders renderItemActions for the expanded row
      expect(queryByText('CHECK IN')).toBeNull();
      expect(queryByText('UNTAPPD')).toBeNull();
    });

    it('should exclude beers already queued for check-in', async () => {
      // selectUntastedBeers subtracts queuedBeerIds as well as tastedBeers —
      // that is the double check-in guard. Every other test leaves the queue
      // empty, so passing `new Set()` at Beerfinder.tsx:63 would go unnoticed.
      //
      // The name carries a " (Bottle)" suffix on purpose. The queue API returns
      // names like "Beer Name (Draft)" (see Beerfinder.tsx:139), which is why
      // the match at Beerfinder.tsx:98-101 is a two-way `includes` rather than
      // equality. An exact-match fixture let that degrade to `===` unnoticed:
      // against real data the strict version matches nothing, the queue never
      // syncs, queued beers reappear here and the user double-checks-in.
      (getQueuedBeers as jest.Mock).mockResolvedValue([{ name: 'Untasted Stout (Bottle)' }]);

      const { getByText, queryByText, getByTestId, UNSAFE_getByType } = renderBeerfinder();

      await waitFor(() => {
        expect(getByTestId('beer-list')).toBeDefined();
      });

      // Pull-to-refresh is what syncs the queue into context: Beerfinder wraps
      // useDataRefresh's handler to also call getQueuedBeers + syncQueuedBeerIds.
      await act(async () => {
        await UNSAFE_getByType(RefreshControl).props.onRefresh();
      });

      await waitFor(() => {
        expect(getByText('1 to discover')).toBeDefined();
      });

      expect(queryByText('Untasted Stout')).toBeNull();
      expect(getByText('Untasted IPA')).toBeDefined();
    });

    it('should show CHECK IN and UNTAPPD actions on the expanded beer', async () => {
      expandBeer('1');

      const { getAllByText, getByTestId } = renderBeerfinder();

      await waitFor(() => {
        expect(getByTestId('beer-list')).toBeDefined();
      });

      // Exactly one row is expanded, so exactly one pair of actions is shown
      expect(getAllByText('CHECK IN')).toHaveLength(1);
      expect(getAllByText('UNTAPPD')).toHaveLength(1);
    });

    it('should show QUEUE button when loaded', async () => {
      const { getByText, getByTestId } = renderBeerfinder();

      await waitFor(() => {
        expect(getByTestId('beer-list')).toBeDefined();
      });

      expect(getByText('QUEUE')).toBeDefined();
    });

    it('should show REWARDS button when loaded', async () => {
      const { getByText, getByTestId } = renderBeerfinder();

      await waitFor(() => {
        expect(getByTestId('beer-list')).toBeDefined();
      });

      expect(getByText('REWARDS')).toBeDefined();
    });
  });

  describe('Empty State', () => {
    it('should show empty message when there are no untasted beers', async () => {
      (beerRepository.getAll as jest.Mock).mockResolvedValue([]);

      const { queryByTestId, getByText } = renderBeerfinder();

      await waitFor(() => {
        expect(getByText('No beer found')).toBeDefined();
      });

      expect(queryByTestId('skeleton-loader')).toBeNull();
    });

    it('should show empty message when every beer has been tasted', async () => {
      // Non-empty catalog, but the set difference is empty — an empty state,
      // not a loading state.
      (myBeersRepository.getAll as jest.Mock).mockResolvedValue(
        mockAllBeers.map(beer => ({ ...beer, tasted_date: '11/01/2025' }))
      );

      const { queryByTestId, getByText } = renderBeerfinder();

      await waitFor(() => {
        expect(getByText('No beer found')).toBeDefined();
      });

      expect(queryByTestId('skeleton-loader')).toBeNull();
    });

    it('should still show action buttons in empty state', async () => {
      (beerRepository.getAll as jest.Mock).mockResolvedValue([]);

      const { getByText } = renderBeerfinder();

      await waitFor(() => {
        expect(getByText('No beer found')).toBeDefined();
      });

      expect(getByText('QUEUE')).toBeDefined();
      expect(getByText('REWARDS')).toBeDefined();
    });
  });

  describe('Error State', () => {
    it('keeps the skeleton up through a retry backoff instead of flashing an empty list', async () => {
      // Beerfinder has no loader of its own — unlike AllBeers, it depends
      // entirely on AppProvider's retry chain. That chain lowers
      // `isLoadingBeers` in each attempt's `finally` but only sets `beerError`
      // once all 4 attempts have failed, so between attempt 1 rejecting and the
      // 1s retry firing the flag is down and the error is still null. The old
      // `isLoadingBeers && length === 0` gate fell through and painted
      // "0 to discover" over a load that was still going.
      (beerRepository.getAll as jest.Mock).mockRejectedValue(
        new Error('Database connection failed')
      );

      const { queryByTestId, queryByText } = renderBeerfinder();

      // Let attempt 1 reject and its finally run. Do NOT advance the 1s timer:
      // that starts attempt 2 and re-raises the flag, hiding the window.
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(queryByTestId('skeleton-loader')).not.toBeNull();
      expect(queryByText('0 to discover')).toBeNull();
    });

    it('should hide skeleton and show error message on load failure', async () => {
      (beerRepository.getAll as jest.Mock).mockRejectedValue(new Error('Database error'));

      const { queryByTestId, getByText } = renderBeerfinder();

      await waitFor(
        () => {
          expect(getByText('Failed to load beer data from database')).toBeDefined();
        },
        { timeout: ERROR_SURFACE_TIMEOUT }
      );

      expect(queryByTestId('skeleton-loader')).toBeNull();
    });

    it('should show try again button on error', async () => {
      (beerRepository.getAll as jest.Mock).mockRejectedValue(new Error('Network error'));

      const { getByText } = renderBeerfinder();

      await waitFor(
        () => {
          expect(getByText('Try Again')).toBeDefined();
        },
        { timeout: ERROR_SURFACE_TIMEOUT }
      );
    });

    it('should not show the beer list on error', async () => {
      (beerRepository.getAll as jest.Mock).mockRejectedValue(new Error('Database error'));

      const { queryByTestId, getByText } = renderBeerfinder();

      await waitFor(
        () => {
          expect(getByText('Try Again')).toBeDefined();
        },
        { timeout: ERROR_SURFACE_TIMEOUT }
      );

      expect(queryByTestId('beer-list')).toBeNull();
    });

    it('should re-read the database and clear the error when try again is pressed', async () => {
      // The whole point of the error screen: a user stuck on it gets out.
      //
      // What this replaced asserted that the mocked `useDataRefresh` was
      // called — a statement about wiring, made entirely against a jest.fn(),
      // which could not observe whether the press recovered anything. It also
      // could not have observed the bug that shipped in #17: `refreshBeerData`
      // reloaded successfully and left `beerError` set, so this exact press
      // refetched the data and kept the error screen up.
      //
      // Try Again re-reads the DATABASE, not the network. The reported failure
      // is a local read failure, and `handleRefresh` bails at the API-URL check
      // for a visitor or logged-out user, which is precisely the state a
      // first-launch failure leaves you in.
      const handleRefresh = jest.fn().mockResolvedValue(undefined);
      (useDataRefresh as jest.Mock).mockReturnValue({
        refreshing: false,
        handleRefresh,
      });

      let dbHealthy = false;
      (beerRepository.getAll as jest.Mock).mockImplementation(() =>
        dbHealthy ? Promise.resolve(mockAllBeers) : Promise.reject(new Error('Network error'))
      );

      const { getByText, queryByText, getByTestId } = renderBeerfinder();

      await waitFor(
        () => {
          expect(getByText('Try Again')).toBeDefined();
        },
        { timeout: ERROR_SURFACE_TIMEOUT }
      );

      // The database recovers underneath the error screen.
      dbHealthy = true;
      const callsBeforePress = (beerRepository.getAll as jest.Mock).mock.calls.length;

      fireEvent.press(getByText('Try Again'));

      // Synchronous, before any timer advance. The provider's retry chain has
      // already exhausted by the time the error surfaces, so nothing else is
      // pending that could explain a refetch — but asserting it here rather
      // than after an await keeps that true even if the schedule changes.
      expect((beerRepository.getAll as jest.Mock).mock.calls.length).toBe(callsBeforePress + 1);

      // Flush the reload's microtasks without advancing the clock.
      await act(async () => {});

      expect(queryByText('Try Again')).toBeNull();
      expect(getByTestId('beer-list')).toBeDefined();

      // Not through the refresh hook. Routing Try Again back through
      // `handleRefresh` is the shape this test replaced, and it is wrong for
      // the reason in the comment above; pin it so it cannot come back.
      expect(handleRefresh).not.toHaveBeenCalled();
    });
  });

  describe('Refresh State (Pull-to-Refresh)', () => {
    it('should pass the refreshing state through to the RefreshControl', async () => {
      (useDataRefresh as jest.Mock).mockReturnValue({
        refreshing: true,
        handleRefresh: jest.fn(),
      });

      const { queryByTestId, getByTestId, UNSAFE_getByType } = renderBeerfinder();

      await waitFor(() => {
        expect(getByTestId('beer-list')).toBeDefined();
      });

      // Assert the control, not just that a list exists: `refreshing` never
      // reaches the skeleton branch, so asserting the skeleton's absence here
      // passes with refreshing:false too and proves nothing.
      expect(UNSAFE_getByType(RefreshControl).props.refreshing).toBe(true);
      expect(queryByTestId('skeleton-loader')).toBeNull();
    });

    it('should keep the loaded list on screen while a refresh reloads it', async () => {
      // The one requirement in this file's header that nothing was checking.
      //
      // Beerfinder passes refreshBeerData as onDataReloaded, and that sets
      // isLoadingBeers=true while allBeers is still populated. The skeleton
      // gate is `isLoadingBeers && allBeers.length === 0` — drop the second
      // clause and every pull-to-refresh blanks the list and paints 20
      // skeletons over it. Both suites passed with that clause deleted.
      //
      // `refreshing` from useDataRefresh cannot reach the skeleton branch at
      // all, so no amount of toggling it exercises this. Driving the context
      // through the captured callback is what reaches the state.
      const { getByTestId, queryByTestId, getByText, UNSAFE_getByType } = renderBeerfinder();

      await waitFor(() => {
        expect(getByTestId('beer-list')).toBeDefined();
      });

      const { onDataReloaded } = (useDataRefresh as jest.Mock).mock.calls[0][0];

      // Hold the reload open so the in-flight state is observable.
      let releaseReload: (value: unknown) => void = () => {};
      (beerRepository.getAll as jest.Mock).mockImplementation(
        () => new Promise(resolve => (releaseReload = resolve))
      );

      let reload: Promise<void>;
      await act(async () => {
        reload = onDataReloaded();
      });

      // Pin the precondition before asserting on it. Without this, a refactor
      // that stopped refreshBeerData setting isLoadingBeers=true would leave
      // all three assertions below trivially satisfied — loading never becomes
      // true, so of course no skeleton — and this test would go on passing
      // while silently ceasing to guard the gate it was written for. Verified:
      // removing that setLoading from AppContext.tsx:578 survived 51/51 until
      // this line existed.
      expect(UNSAFE_getByType(BeerList).props.loading).toBe(true);

      // Mid-refresh: loading is true but we already have beers to show.
      expect(queryByTestId('skeleton-loader')).toBeNull();
      expect(getByTestId('beer-list')).toBeDefined();
      expect(getByText('2 to discover')).toBeDefined();

      await act(async () => {
        releaseReload(mockAllBeers);
        await reload;
      });

      expect(queryByTestId('skeleton-loader')).toBeNull();
    });

    it('should trigger the refresh handler when the list is pulled', async () => {
      const handleRefresh = jest.fn();
      (useDataRefresh as jest.Mock).mockReturnValue({
        refreshing: false,
        handleRefresh,
      });

      const { getByTestId, UNSAFE_getByType } = renderBeerfinder();

      await waitFor(() => {
        expect(getByTestId('beer-list')).toBeDefined();
      });

      UNSAFE_getByType(RefreshControl).props.onRefresh();

      expect(handleRefresh).toHaveBeenCalled();
    });

    it('should maintain beer list visibility during refresh', async () => {
      const { getByTestId, rerender } = renderBeerfinder();

      await waitFor(() => {
        expect(getByTestId('beer-list')).toBeDefined();
      });

      (useDataRefresh as jest.Mock).mockReturnValue({
        refreshing: true,
        handleRefresh: jest.fn(),
      });

      rerender(<Beerfinder />);

      expect(getByTestId('beer-list')).toBeDefined();
      expect(getByTestId('beerfinder-container')).toBeDefined();
    });
  });

  describe('Loading State Transitions', () => {
    it('should transition from loading to loaded smoothly', async () => {
      const { queryByTestId, getByTestId } = renderBeerfinder();

      // Loading
      expect(queryByTestId('skeleton-loader')).not.toBeNull();

      // Loaded
      await waitFor(() => {
        expect(getByTestId('beer-list')).toBeDefined();
      });

      expect(queryByTestId('skeleton-loader')).toBeNull();
    });

    it('should transition from loading to error without flashing a beer list', async () => {
      (beerRepository.getAll as jest.Mock).mockRejectedValue(new Error('Network error'));

      const { queryByTestId, getByText } = renderBeerfinder();

      // Loading
      expect(queryByTestId('skeleton-loader')).not.toBeNull();

      // Error
      await waitFor(
        () => {
          expect(getByText('Failed to load beer data from database')).toBeDefined();
        },
        { timeout: ERROR_SURFACE_TIMEOUT }
      );

      expect(queryByTestId('skeleton-loader')).toBeNull();
      expect(queryByTestId('beer-list')).toBeNull();
    });
  });

  /**
   * These press the controls instead of asserting that their labels render.
   *
   * Every mutant named below survived the suite before these tests existed —
   * including CHECK IN, the app's primary action, bound to a no-op. QUEUE and
   * REWARDS exist in BOTH the loading and loaded branches, so each is pressed
   * in both: covering one branch leaves the other free to rot.
   */
  describe('Actions and Filter Wiring', () => {
    it('should check in the pressed beer', async () => {
      const queuedCheckIn = jest.fn();
      (useQueuedCheckIn as jest.Mock).mockReturnValue({ queuedCheckIn, isLoading: false });
      mockFilters({ expandedId: '1' });

      const { getByText, getByTestId } = renderBeerfinder();

      await waitFor(() => {
        expect(getByTestId('beer-list')).toBeDefined();
      });

      fireEvent.press(getByText('CHECK IN'));

      // Asserting the argument too: checking in the wrong beer is a worse bug
      // than checking in nothing, and `toHaveBeenCalled()` cannot see it.
      expect(queuedCheckIn).toHaveBeenCalledWith(
        expect.objectContaining({ id: '1', brew_name: 'Untasted IPA' })
      );
    });

    it('should open the Untappd lookup for the pressed beer', async () => {
      mockFilters({ expandedId: '1' });

      const { getByText, getByTestId, UNSAFE_getByType } = renderBeerfinder();

      await waitFor(() => {
        expect(getByTestId('beer-list')).toBeDefined();
      });

      expect(UNSAFE_getByType(UntappdWebView).props.visible).toBe(false);

      fireEvent.press(getByText('UNTAPPD'));

      expect(UNSAFE_getByType(UntappdWebView).props.visible).toBe(true);
      expect(UNSAFE_getByType(UntappdWebView).props.beerName).toBe('Untasted IPA');
    });

    it('should open the queue modal when QUEUE is pressed', async () => {
      const { getByText, queryByText, getByTestId } = renderBeerfinder();

      await waitFor(() => {
        expect(getByTestId('beer-list')).toBeDefined();
      });

      expect(queryByText('Queued Brews')).toBeNull();

      await act(async () => {
        fireEvent.press(getByText('QUEUE'));
      });

      // Both halves matter: viewQueues can fetch and still never open the
      // modal (dropping setQueueModalVisible(true) survived the suite), and it
      // can open a modal it never populated.
      expect(getQueuedBeers).toHaveBeenCalled();
      expect(getByText('Queued Brews')).toBeDefined();
    });

    it('should drop queued beers from the list when the queue is opened', async () => {
      // viewQueues carries its OWN copy of the two-way name match
      // (Beerfinder.tsx:143-146), byte-identical to the one in handleRefresh.
      // The refresh path's copy is covered by 'should exclude beers already
      // queued for check-in'; this one had nothing, so the two could silently
      // diverge. Same " (Bottle)" suffix, for the same reason: the queue API
      // returns "Beer Name (Draft)", so an exact-match implementation finds
      // nothing and the double check-in guard quietly stops working.
      (getQueuedBeers as jest.Mock).mockResolvedValue([{ name: 'Untasted Stout (Bottle)' }]);

      const { getByText, getByTestId } = renderBeerfinder();

      await waitFor(() => {
        expect(getByTestId('beer-list')).toBeDefined();
      });

      expect(getByText('2 to discover')).toBeDefined();

      await act(async () => {
        fireEvent.press(getByText('QUEUE'));
      });

      // The queued beer is now subtracted from the untasted set.
      expect(getByText('1 to discover')).toBeDefined();
    });

    it('should navigate to rewards when REWARDS is pressed', async () => {
      const { getByText, getByTestId } = renderBeerfinder();

      await waitFor(() => {
        expect(getByTestId('beer-list')).toBeDefined();
      });

      fireEvent.press(getByText('REWARDS'));

      expect(router.push).toHaveBeenCalledWith('/screens/rewards');
    });

    it('should keep QUEUE and REWARDS working while the skeleton is up', async () => {
      // The loading branch renders its own copies of both buttons. They were
      // asserted to exist and never pressed, so both could be bound to nothing.
      (beerRepository.getAll as jest.Mock).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(mockAllBeers), 1000))
      );

      const { getByText, getByTestId } = renderBeerfinder();

      expect(getByTestId('skeleton-loader')).toBeDefined();

      fireEvent.press(getByText('REWARDS'));
      expect(router.push).toHaveBeenCalledWith('/screens/rewards');

      await act(async () => {
        fireEvent.press(getByText('QUEUE'));
      });

      expect(getQueuedBeers).toHaveBeenCalled();
    });

    it('should feed typed search text to the filter hook', async () => {
      const spies = mockFilters();

      const { getByTestId } = renderBeerfinder();

      await waitFor(() => {
        expect(getByTestId('beer-list')).toBeDefined();
      });

      fireEvent.changeText(getByTestId('search-input'), 'Stout');

      await waitFor(() => {
        expect(spies.setSearchText).toHaveBeenCalledWith('Stout');
      });
    });

    it('should count the filtered beers, not every untasted beer', async () => {
      // Must differ from the untasted total (2) or the assertion cannot tell
      // `filteredBeers.length` from `untastedBeers.length`.
      mockFilters({ filteredBeers: [mockAllBeers[0]] });

      const { getByText, getByTestId } = renderBeerfinder();

      await waitFor(() => {
        expect(getByTestId('beer-list')).toBeDefined();
      });

      expect(getByText('1 to discover')).toBeDefined();
    });
  });

  describe('Visual Consistency', () => {
    it('should keep the same container across loading and loaded states', async () => {
      const { getByTestId } = renderBeerfinder();

      // Container present while the skeleton shows
      expect(getByTestId('beerfinder-container')).toBeDefined();
      expect(getByTestId('skeleton-loader')).toBeDefined();

      await waitFor(() => {
        expect(getByTestId('beer-list')).toBeDefined();
      });

      // Same container after load
      expect(getByTestId('beerfinder-container')).toBeDefined();
    });

    it('should show the search bar only once data has loaded', async () => {
      (beerRepository.getAll as jest.Mock).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(mockAllBeers), 500))
      );

      const { queryByTestId, getByTestId } = renderBeerfinder();

      // The loading branch renders actions but no search bar
      expect(queryByTestId('search-bar')).toBeNull();

      await waitFor(
        () => {
          expect(getByTestId('search-bar')).toBeDefined();
        },
        { timeout: 5000 }
      );
    });
  });
});
