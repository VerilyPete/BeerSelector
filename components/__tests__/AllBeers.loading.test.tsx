/**
 * Integration tests for AllBeers loading states.
 *
 * AllBeers reads its beer data, loading flag and error message from AppContext
 * (MP-4 Step 2), so these render against a real AppProvider rather than a stub:
 * the assertions below are about what the user sees for a given context state,
 * and a hand-rolled context value would let the component and the provider drift
 * apart again without any test noticing.
 *
 * Both the provider and AllBeers itself load from beerRepository.getAll() on
 * mount, so that single mock drives the whole tree.
 *
 * Loading State Requirements:
 * - Show SkeletonLoader during initial data fetch
 * - Show BeerList when data loads successfully
 * - Show RefreshControl spinner (not skeleton) during pull-to-refresh
 * - Show error message when data fetch fails
 * - Transition smoothly between loading states
 */

import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { RefreshControl } from 'react-native';
import { AllBeers } from '../AllBeers';
import { BeerList } from '../beer/BeerList';
import { UntappdWebView } from '../UntappdWebView';
import { AppProvider } from '@/context/AppContext';
import { beerRepository } from '@/src/database/repositories/BeerRepository';
import { myBeersRepository } from '@/src/database/repositories/MyBeersRepository';
import { rewardsRepository } from '@/src/database/repositories/RewardsRepository';
import { getSessionData } from '@/src/api/sessionManager';
import { isVisitorMode } from '@/src/api/authService';
import { useBeerFilters } from '@/hooks/useBeerFilters';
import { useDataRefresh } from '@/hooks/useDataRefresh';

// Mock dependencies
jest.mock('@/src/database/repositories/BeerRepository');
jest.mock('@/src/database/repositories/MyBeersRepository');
jest.mock('@/src/database/repositories/RewardsRepository');
jest.mock('@/src/api/sessionManager');
jest.mock('@/src/api/authService');
jest.mock('@/hooks/useBeerFilters');
jest.mock('@/hooks/useDataRefresh');
jest.mock('@/hooks/useDebounce', () => ({
  useDebounce: (value: any) => value,
}));
jest.mock('@/hooks/useColorScheme', () => ({
  useColorScheme: jest.fn(() => 'light'),
}));

// Stub SkeletonLoader so the skeleton is addressable by testID
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

describe('AllBeers Loading States (MP-3 Step 3a)', () => {
  const mockBeers = [
    {
      id: '1',
      brew_name: 'Test IPA',
      brewer: 'Test Brewery',
      brew_style: 'IPA',
      brew_container: 'Draft',
      brew_description: 'A delicious test beer',
      added_date: '1699564800',
      brewer_loc: 'Austin, TX',
      abv: '6.5',
      ibu: '60',
      container_type: 'tulip' as const, // Pre-computed glass type for IPA
    },
    {
      id: '2',
      brew_name: 'Test Stout',
      brewer: 'Another Brewery',
      brew_style: 'Stout',
      brew_container: 'Bottle',
      brew_description: 'Another test beer',
      added_date: '1699651200',
      brewer_loc: 'Denver, CO',
      abv: '8.0',
      ibu: '45',
      container_type: 'pint' as const, // Pre-computed glass type for Stout
    },
  ];

  // AllBeers reads context state, so every render needs a real provider around it.
  const renderAllBeers = () => render(<AllBeers />, { wrapper: AppProvider });

  /**
   * Pass-through filter hook with a chosen row expanded. The returned shape must
   * track the real useBeerFilters' return value — `containerFilter` in
   * particular is `'all' | 'draft' | 'cans'` and initialises to `'all'`; a
   * `null` here silently drives FilterBar down a branch production never takes.
   * Row actions (UNTAPPD) render only for the expanded id.
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
   * `expandBeer` above is a pass-through: it builds fresh `jest.fn()`s on every
   * render, so nothing can be asserted about what the component called, and its
   * `filteredBeers` is always the full input — which makes any count assertion
   * pass whether the component reads `filteredBeers` or `beers.allBeers`. Both
   * of those gaps hid live mutants. Use this where the point of the test is
   * what the component does WITH the hook.
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

    // AppProvider loads session and all three repositories on mount. Only
    // beerRepository.getAll() is driven per-test; the rest just need to settle.
    (getSessionData as jest.Mock).mockResolvedValue(null);
    (isVisitorMode as jest.Mock).mockResolvedValue(false);
    (myBeersRepository.getAll as jest.Mock).mockResolvedValue([]);
    (rewardsRepository.getAll as jest.Mock).mockResolvedValue([]);

    expandBeer(null);

    // Mock useDataRefresh hook
    (useDataRefresh as jest.Mock).mockReturnValue({
      refreshing: false,
      handleRefresh: jest.fn(),
    });
  });

  describe('Initial Load - Skeleton Display', () => {
    it('should show skeleton loader during initial data fetch', async () => {
      // Mock slow loading (simulate network delay)
      (beerRepository.getAll as jest.Mock).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(mockBeers), 1000))
      );

      const { getByTestId, queryByTestId } = renderAllBeers();

      // Should show skeleton immediately during loading
      expect(getByTestId('skeleton-loader')).toBeDefined();

      // Should NOT show beer list yet
      expect(queryByTestId('beer-list')).toBeNull();
    });

    it('should NOT show error message during initial loading', async () => {
      (beerRepository.getAll as jest.Mock).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(mockBeers), 500))
      );

      const { queryByTestId } = renderAllBeers();

      // Should not show error during loading
      expect(queryByTestId('error-container')).toBeNull();
    });

    it('should show skeleton with appropriate count of items', async () => {
      (beerRepository.getAll as jest.Mock).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(mockBeers), 500))
      );

      const { getByText } = renderAllBeers();

      // The stubbed SkeletonLoader renders its `count` prop, so this asserts the
      // component asks for a full screen of placeholders rather than just one.
      expect(getByText('Loading 20 skeletons...')).toBeDefined();
    });

    it('should show search bar even during loading', async () => {
      (beerRepository.getAll as jest.Mock).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(mockBeers), 500))
      );

      const { getByTestId } = renderAllBeers();

      // Skeleton should be shown
      expect(getByTestId('skeleton-loader')).toBeDefined();

      // Search bar stays mounted alongside it so the user can start typing
      // while data loads.
      expect(getByTestId('search-bar')).toBeDefined();
    });
  });

  describe('Data Loaded - Show BeerList', () => {
    it('should hide skeleton and show beer list when data loads', async () => {
      (beerRepository.getAll as jest.Mock).mockResolvedValue(mockBeers);

      const { queryByTestId, getByTestId } = renderAllBeers();

      // Initially shows skeleton
      expect(queryByTestId('skeleton-loader')).not.toBeNull();

      // Wait for data to load
      await waitFor(() => {
        expect(getByTestId('beer-list')).toBeDefined();
      });

      // Skeleton should be hidden
      expect(queryByTestId('skeleton-loader')).toBeNull();
    });

    it('should show beer count when data loads', async () => {
      (beerRepository.getAll as jest.Mock).mockResolvedValue(mockBeers);

      const { getByText } = renderAllBeers();

      await waitFor(() => {
        expect(getByText(`${mockBeers.length} beers on tap`)).toBeDefined();
      });
    });

    it('should show filters when data loads', async () => {
      (beerRepository.getAll as jest.Mock).mockResolvedValue(mockBeers);

      const { getByTestId } = renderAllBeers();

      await waitFor(() => {
        // Filter UI should be visible
        expect(getByTestId('filter-bar')).toBeDefined();
      });
    });

    it('should show the UNTAPPD action on the expanded beer only', async () => {
      // BeerItem renders renderItemActions only for the expanded row, so with
      // every row collapsed the whole renderBeerActions branch of AllBeers is
      // never invoked — it could be deleted with the rest of the suite green.
      expandBeer('1');
      (beerRepository.getAll as jest.Mock).mockResolvedValue(mockBeers);

      const { getAllByText, getByTestId } = renderAllBeers();

      await waitFor(() => {
        expect(getByTestId('beer-list')).toBeDefined();
      });

      expect(getAllByText('UNTAPPD')).toHaveLength(1);
    });

    it('should transition smoothly from skeleton to beer list', async () => {
      (beerRepository.getAll as jest.Mock).mockResolvedValue(mockBeers);

      const { queryByTestId, getByTestId } = renderAllBeers();

      // Skeleton visible initially
      expect(queryByTestId('skeleton-loader')).not.toBeNull();

      // Data loads
      await waitFor(() => {
        expect(getByTestId('beer-list')).toBeDefined();
      });

      // Skeleton removed
      expect(queryByTestId('skeleton-loader')).toBeNull();

      // No intermediate state - clean transition
      expect(queryByTestId('error-container')).toBeNull();
    });
  });

  describe('Empty State', () => {
    it('should show empty message when no beers found (not skeleton)', async () => {
      (beerRepository.getAll as jest.Mock).mockResolvedValue([]);

      const { queryByTestId, getByText } = renderAllBeers();

      await waitFor(() => {
        // Should show beer list with the empty-state copy
        expect(getByText('No beers found')).toBeDefined();
      });

      // Should not show skeleton after load
      expect(queryByTestId('skeleton-loader')).toBeNull();
    });

    it('should not show skeleton for empty state', async () => {
      (beerRepository.getAll as jest.Mock).mockResolvedValue([]);

      const { queryByTestId } = renderAllBeers();

      await waitFor(() => {
        // Empty state, not loading state
        expect(queryByTestId('skeleton-loader')).toBeNull();
      });
    });
  });

  describe('Error State', () => {
    it('should hide skeleton and show error message on load failure', async () => {
      (beerRepository.getAll as jest.Mock).mockRejectedValue(
        new Error('Database connection failed')
      );

      const { queryByTestId, getByTestId } = renderAllBeers();

      // Wait for error
      await waitFor(() => {
        expect(queryByTestId('skeleton-loader')).toBeNull();
        expect(getByTestId('error-container')).toBeDefined();
      });
    });

    it('should show error message text', async () => {
      (beerRepository.getAll as jest.Mock).mockRejectedValue(new Error('Network error'));

      const { getByTestId } = renderAllBeers();

      await waitFor(() => {
        const errorMessage = getByTestId('error-message');
        expect(errorMessage).toBeDefined();
        expect(errorMessage.props.children).toContain('Failed to load beers');
      });
    });

    it('should show try again button on error', async () => {
      (beerRepository.getAll as jest.Mock).mockRejectedValue(new Error('Database error'));

      const { getByTestId } = renderAllBeers();

      await waitFor(() => {
        expect(getByTestId('try-again-button')).toBeDefined();
      });
    });

    it('should reload every context source when try again is pressed', async () => {
      // Try Again goes through the context's loader, not AllBeers' own
      // `loadBeers`, which reads `beerRepository` alone.
      //
      // Nothing on this screen renders the tasted list, so the difference is
      // invisible here and visible one tab over: recovering the catalog while
      // leaving `tastedBeers` at whatever it was means Beerfinder computes
      // `allBeers − tastedBeers` from a stale subtrahend and offers beers the
      // user has already checked in. That is the 200 Beer Challenge rule in
      // CLAUDE.md, broken by a button on a different screen.
      //
      // Asserted on the repositories rather than on rendered state for that
      // reason — this component has no view of the state that goes stale.
      let dbHealthy = false;
      (beerRepository.getAll as jest.Mock).mockImplementation(() =>
        dbHealthy ? Promise.resolve(mockBeers) : Promise.reject(new Error('Database error'))
      );

      const { getByTestId, queryByTestId } = renderAllBeers();

      await waitFor(() => {
        expect(getByTestId('try-again-button')).toBeDefined();
      });

      dbHealthy = true;
      const tastedCallsBefore = (myBeersRepository.getAll as jest.Mock).mock.calls.length;
      const rewardCallsBefore = (rewardsRepository.getAll as jest.Mock).mock.calls.length;

      fireEvent.press(getByTestId('try-again-button'));

      // Synchronous: the provider's retry chain also reads all three, but it
      // only fires on a timer and nothing advances the clock here.
      expect((myBeersRepository.getAll as jest.Mock).mock.calls.length).toBe(tastedCallsBefore + 1);
      expect((rewardsRepository.getAll as jest.Mock).mock.calls.length).toBe(rewardCallsBefore + 1);

      await act(async () => {});

      expect(queryByTestId('error-container')).toBeNull();
      expect(getByTestId('beer-list')).toBeDefined();
    });

    it('should not show beer list on error', async () => {
      (beerRepository.getAll as jest.Mock).mockRejectedValue(new Error('Failed'));

      const { getByTestId, queryByTestId } = renderAllBeers();

      // Wait for the error state FIRST. Asserting `beer-list` is null inside the
      // waitFor instead resolves on its very first evaluation — under fake
      // timers waitFor checks once before advancing anything, and at mount the
      // skeleton is up so `beer-list` is already null. The error state is then
      // never observed at all: rendering a <View testID="beer-list" /> inside
      // error-container left this test green.
      await waitFor(() => {
        expect(getByTestId('error-container')).toBeDefined();
      });

      expect(queryByTestId('beer-list')).toBeNull();
    });
  });

  describe('Refresh State (Pull-to-Refresh)', () => {
    it('should NOT show skeleton during refresh', async () => {
      (beerRepository.getAll as jest.Mock).mockResolvedValue(mockBeers);

      // Mock refreshing state
      (useDataRefresh as jest.Mock).mockReturnValue({
        refreshing: true, // Simulating refresh
        handleRefresh: jest.fn(),
      });

      const { queryByTestId, getByTestId } = renderAllBeers();

      await waitFor(() => {
        expect(getByTestId('beer-list')).toBeDefined();
      });

      // Should NOT show skeleton during refresh
      expect(queryByTestId('skeleton-loader')).toBeNull();

      // Beer list should remain visible
      expect(getByTestId('beer-list')).toBeDefined();
    });

    it('should pass the refreshing state through to the RefreshControl', async () => {
      (beerRepository.getAll as jest.Mock).mockResolvedValue(mockBeers);

      (useDataRefresh as jest.Mock).mockReturnValue({
        refreshing: true,
        handleRefresh: jest.fn(),
      });

      const { getByTestId, UNSAFE_getByType } = renderAllBeers();

      await waitFor(() => {
        expect(getByTestId('beer-list')).toBeDefined();
      });

      // Assert the control itself, not merely that a list exists — the list
      // renders identically whether or not refreshing is wired up.
      expect(UNSAFE_getByType(RefreshControl).props.refreshing).toBe(true);
    });

    it('should trigger the refresh handler when the list is pulled', async () => {
      (beerRepository.getAll as jest.Mock).mockResolvedValue(mockBeers);

      const handleRefresh = jest.fn();
      (useDataRefresh as jest.Mock).mockReturnValue({
        refreshing: false,
        handleRefresh,
      });

      const { getByTestId, UNSAFE_getByType } = renderAllBeers();

      await waitFor(() => {
        expect(getByTestId('beer-list')).toBeDefined();
      });

      UNSAFE_getByType(RefreshControl).props.onRefresh();

      expect(handleRefresh).toHaveBeenCalled();
    });

    it('should reload beer data into context when a refresh completes', async () => {
      (beerRepository.getAll as jest.Mock).mockResolvedValue(mockBeers);

      const { getByTestId } = renderAllBeers();

      await waitFor(() => {
        expect(getByTestId('beer-list')).toBeDefined();
      });

      // useDataRefresh is mocked, so the onDataReloaded callback the component
      // hands it is never invoked by the hook. Capture and call it directly —
      // otherwise its whole body is dead code as far as these tests are
      // concerned, and could be emptied with the suite still green.
      const { onDataReloaded } = (useDataRefresh as jest.Mock).mock.calls[0][0];

      const refreshedBeers = [...mockBeers, { ...mockBeers[0], id: '3', brew_name: 'Fresh Ale' }];
      (beerRepository.getAll as jest.Mock).mockResolvedValue(refreshedBeers);

      await act(async () => {
        await onDataReloaded();
      });

      expect(getByTestId('beer-count').props.children).toEqual([
        refreshedBeers.length,
        ' beers on tap',
      ]);
    });
  });

  describe('Loading State Transitions', () => {
    it('should transition: loading → loaded → refreshing → loaded', async () => {
      const mockGetAll = beerRepository.getAll as jest.Mock;

      // Initial load
      mockGetAll.mockResolvedValue(mockBeers);

      const { queryByTestId, getByTestId, rerender } = renderAllBeers();

      // State 1: Loading (skeleton)
      expect(queryByTestId('skeleton-loader')).not.toBeNull();

      // State 2: Loaded (beer list)
      await waitFor(() => {
        expect(getByTestId('beer-list')).toBeDefined();
        expect(queryByTestId('skeleton-loader')).toBeNull();
      });

      // State 3: Refreshing (beer list + RefreshControl, no skeleton)
      (useDataRefresh as jest.Mock).mockReturnValue({
        refreshing: true,
        handleRefresh: jest.fn(),
      });

      rerender(<AllBeers />);

      expect(getByTestId('beer-list')).toBeDefined();
      expect(queryByTestId('skeleton-loader')).toBeNull();

      // State 4: Loaded again (beer list)
      (useDataRefresh as jest.Mock).mockReturnValue({
        refreshing: false,
        handleRefresh: jest.fn(),
      });

      rerender(<AllBeers />);

      expect(getByTestId('beer-list')).toBeDefined();
      expect(queryByTestId('skeleton-loader')).toBeNull();
    });

    it('should transition: loading → error → retry → loading → loaded', async () => {
      const mockGetAll = beerRepository.getAll as jest.Mock;

      // Initial load fails. Rejects for every call, not just the first: the
      // provider and AllBeers each load on mount, so a `...Once` rejection would
      // be absorbed by one of them and the other would quietly succeed.
      mockGetAll.mockRejectedValue(new Error('Network error'));

      const { queryByTestId, getByTestId } = renderAllBeers();

      // State 1: Loading (skeleton)
      expect(queryByTestId('skeleton-loader')).not.toBeNull();

      // State 2: Error
      await waitFor(() => {
        expect(getByTestId('error-container')).toBeDefined();
        expect(queryByTestId('skeleton-loader')).toBeNull();
      });

      // State 3: Retry — the database recovers, user taps Try Again.
      //
      // The press must be shown to cause the refetch *itself*. The provider
      // also retries this load in the background (3x at 1s/2s/4s), and waitFor
      // pumps the fake clock, so "the list eventually appears" happens whether
      // or not the button is wired to anything — a Try Again bound to a no-op
      // passed this test until the assertion below was added.
      mockGetAll.mockResolvedValue(mockBeers);
      const callsBeforePress = mockGetAll.mock.calls.length;

      fireEvent.press(getByTestId('try-again-button'));

      // Synchronous, before any timer advance: only the press can explain this.
      expect(mockGetAll.mock.calls.length).toBe(callsBeforePress + 1);

      // State 4: Loaded — and the recovery must be the PRESS's doing.
      //
      // `waitFor` pumps the fake clock, which lets AppProvider's own background
      // retries (1s/2s/4s) fire and clear the error by themselves. Asserting
      // through a waitFor here therefore proves nothing about the button:
      // while Try Again was wired to `loadBeers`, deleting that path's
      // `setBeerError(null)` passed this test.
      //
      // Flushing microtasks without advancing the clock keeps the provider's
      // timers unfired, so the only thing that can have cleared the error is
      // the press — now `refreshBeerData`, and its success path's
      // `setBeerError(null)` is what this holds down.
      await act(async () => {});

      expect(queryByTestId('error-container')).toBeNull();
      expect(getByTestId('beer-list')).toBeDefined();
      expect(queryByTestId('skeleton-loader')).toBeNull();
    });

    it('should keep the loaded list on screen on first mount over loaded data', async () => {
      // Guards the `&& beers.allBeers.length === 0` clause at AllBeers.tsx:133.
      //
      // `loadBeers` (AllBeers.tsx:58-70) calls the context's
      // `setLoadingBeers(true)` unconditionally, and the mount effect at :82-84
      // runs it with no guard on whether context already holds data. So the
      // component only needs to mount while `allBeers` is already populated.
      //
      // That is the ORDINARY path, and it needs no remount: AppProvider's own
      // effect populates `beers.allBeers` at app start, tabs are lazy and
      // `index` is the initial route, so AllBeers is not mounted until BEERS is
      // first focused — by which time the provider has already filled context.
      // Its mount effect then raises the flag over a non-empty list.
      //
      // NOT via leaving and re-entering the tab: app/(tabs)/_layout.tsx:177
      // sets `freezeOnBlur: true`, which suspends the subtree rather than
      // unmounting it, and bottom-tabs v7 has no `unmountOnBlur`. Tab re-entry
      // never re-runs the mount effect. An earlier version of this comment said
      // it did; that was wrong, and it mattered because it described a
      // lifecycle the navigator never produces.
      //
      // The second live route needs no mount at all: `isLoadingBeers` is
      // provider-global, so `refreshBeerData` from settings, Rewards,
      // TastedBrewList or Beerfinder raises it while AllBeers sits frozen.
      //
      // The provider must therefore mount BEFORE AllBeers and outlive it, which
      // is why this builds its own harness rather than using renderAllBeers().
      const Harness = ({ showList }: { showList: boolean }) => (
        <AppProvider>{showList ? <AllBeers /> : null}</AppProvider>
      );

      (beerRepository.getAll as jest.Mock).mockResolvedValue(mockBeers);

      const { rerender, getByTestId, queryByTestId, UNSAFE_getByType } = render(
        <Harness showList={true} />
      );

      await waitFor(() => {
        expect(getByTestId('beer-list')).toBeDefined();
      });

      // Unmount AllBeers, keeping the provider and its beers. This models the
      // provider-populated-first ordering above, not a tab switch.
      await act(async () => {
        rerender(<Harness showList={false} />);
      });

      // Hold the next mount's load open so the in-flight state is observable.
      let releaseReload: (value: unknown) => void = () => {};
      (beerRepository.getAll as jest.Mock).mockImplementation(
        () => new Promise(resolve => (releaseReload = resolve))
      );

      // Re-enter the tab: loadBeers sets isLoadingBeers=true immediately.
      await act(async () => {
        rerender(<Harness showList={true} />);
      });

      // Pin the precondition before asserting on it. Without this the test
      // rests on an unasserted assumption: delete `setLoadingBeers(true)` from
      // AllBeers.tsx:60 and loading never goes true, so the skeleton is absent
      // for the wrong reason, every assertion below is trivially satisfied —
      // and the guard mutant this test exists to kill survives too. Both
      // survived 29/29 until this line existed. Same defect the Beerfinder
      // refresh test was fixed for; it needed mirroring here.
      expect(UNSAFE_getByType(BeerList).props.loading).toBe(true);

      // Mid-load, with beers already in context: show the stale list, not a
      // screen of skeletons.
      expect(queryByTestId('skeleton-loader')).toBeNull();
      expect(getByTestId('beer-list')).toBeDefined();

      await act(async () => {
        releaseReload(mockBeers);
      });

      expect(queryByTestId('skeleton-loader')).toBeNull();
      expect(getByTestId('beer-list')).toBeDefined();

      // Restore a resolving implementation: clearAllMocks() resets calls, not
      // implementations, so leaving the never-resolving one installed makes it
      // the base behaviour for whichever test runs next.
      (beerRepository.getAll as jest.Mock).mockResolvedValue(mockBeers);
    });
  });

  /**
   * These press the controls rather than asserting that their labels render.
   *
   * Every mutant below survived the suite before these tests existed: the row
   * UNTAPPD action bound to a no-op, the search box wired to nothing, and the
   * header count reading the unfiltered total. Nothing else covers them now
   * that the E2E workflows are gone.
   */
  describe('Row Actions and Filter Wiring', () => {
    it('should open the Untappd lookup for the pressed beer', async () => {
      (beerRepository.getAll as jest.Mock).mockResolvedValue(mockBeers);
      mockFilters({ expandedId: '1' });

      const { getByText, getByTestId, UNSAFE_getByType } = renderAllBeers();

      await waitFor(() => {
        expect(getByTestId('beer-list')).toBeDefined();
      });

      // Closed before the press, so the assertion after it cannot be satisfied
      // by a modal that was already open.
      expect(UNSAFE_getByType(UntappdWebView).props.visible).toBe(false);

      fireEvent.press(getByText('UNTAPPD'));

      // The beer name matters as much as the visibility: passing the wrong
      // item would open a lookup for a beer the user did not tap.
      expect(UNSAFE_getByType(UntappdWebView).props.visible).toBe(true);
      expect(UNSAFE_getByType(UntappdWebView).props.beerName).toBe('Test IPA');
    });

    it('should feed typed search text to the filter hook', async () => {
      (beerRepository.getAll as jest.Mock).mockResolvedValue(mockBeers);
      const spies = mockFilters();

      const { getByTestId } = renderAllBeers();

      await waitFor(() => {
        expect(getByTestId('beer-list')).toBeDefined();
      });

      fireEvent.changeText(getByTestId('search-input'), 'IPA');

      // useDebounce is mocked to identity, so the debounced value is the typed
      // one. Replacing the effect's argument with '' at AllBeers.tsx:52 — the
      // search box types but filters nothing — passed until this assertion.
      await waitFor(() => {
        expect(spies.setSearchText).toHaveBeenCalledWith('IPA');
      });
    });

    it('should count the filtered beers, not the whole taplist', async () => {
      (beerRepository.getAll as jest.Mock).mockResolvedValue(mockBeers);

      // The filtered list must differ from allBeers or the assertion cannot
      // tell the two apart — which is exactly why the pass-through mock let
      // `filteredBeers.length` degrade to `beers.allBeers.length` unnoticed.
      mockFilters({ filteredBeers: [mockBeers[0]] });

      const { getByTestId } = renderAllBeers();

      await waitFor(() => {
        expect(getByTestId('beer-list')).toBeDefined();
      });

      expect(getByTestId('beer-count').props.children).toEqual([1, ' beers on tap']);
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid data fetches gracefully', async () => {
      (beerRepository.getAll as jest.Mock)
        .mockResolvedValueOnce(mockBeers)
        .mockResolvedValueOnce([...mockBeers, { ...mockBeers[0], id: '3' }]);

      const { getByTestId, queryByTestId } = renderAllBeers();

      await waitFor(() => {
        expect(getByTestId('beer-list')).toBeDefined();
      });

      // No skeleton after initial load
      expect(queryByTestId('skeleton-loader')).toBeNull();
    });

    it('should handle beers with empty names during loading', async () => {
      const beersWithEmpty = [
        ...mockBeers,
        { ...mockBeers[0], id: '3', brew_name: '' },
        { ...mockBeers[0], id: '4', brew_name: '   ' },
      ];

      (beerRepository.getAll as jest.Mock).mockResolvedValue(beersWithEmpty);

      const { getByTestId, getByText } = renderAllBeers();

      await waitFor(() => {
        expect(getByTestId('beer-list')).toBeDefined();
      });

      // useBeerFilters is mocked as a pass-through here, so this pins only that
      // blank names render without crashing — NOT that they are filtered out.
      // The filtering itself belongs to useBeerFilters' own tests.
      expect(getByText(`${beersWithEmpty.length} beers on tap`)).toBeDefined();
    });
  });

  describe('Visual Consistency', () => {
    it('should show filters container during loading with skeleton', async () => {
      (beerRepository.getAll as jest.Mock).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(mockBeers), 500))
      );

      const { getByTestId } = renderAllBeers();

      // Skeleton should be in consistent layout with filters
      expect(getByTestId('skeleton-loader')).toBeDefined();
      expect(getByTestId('all-beers-container')).toBeDefined();
    });

    it('should maintain layout structure between loading and loaded states', async () => {
      (beerRepository.getAll as jest.Mock).mockResolvedValue(mockBeers);

      const { getByTestId, queryByTestId } = renderAllBeers();

      // Both states should use same container
      expect(queryByTestId('all-beers-container')).not.toBeNull();

      await waitFor(() => {
        expect(getByTestId('beer-list')).toBeDefined();
      });

      const containerAfterLoad = getByTestId('all-beers-container');
      expect(containerAfterLoad).toBeDefined();
    });
  });
});
