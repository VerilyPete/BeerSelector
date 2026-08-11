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
      error: null,
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
        error: null,
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
        error: null,
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

      // State 4: Loaded — error cleared and the list replaces it
      await waitFor(() => {
        expect(getByTestId('beer-list')).toBeDefined();
      });

      expect(queryByTestId('error-container')).toBeNull();
      expect(queryByTestId('skeleton-loader')).toBeNull();
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
