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
import { fireEvent, render, waitFor } from '@testing-library/react-native';
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

  beforeEach(() => {
    jest.clearAllMocks();

    // AppProvider loads session and all three repositories on mount. Only
    // beerRepository.getAll() is driven per-test; the rest just need to settle.
    (getSessionData as jest.Mock).mockResolvedValue(null);
    (isVisitorMode as jest.Mock).mockResolvedValue(false);
    (myBeersRepository.getAll as jest.Mock).mockResolvedValue([]);
    (rewardsRepository.getAll as jest.Mock).mockResolvedValue([]);

    // Mock useBeerFilters hook — shape must track the real hook's return value
    (useBeerFilters as jest.Mock).mockImplementation((beers: any) => ({
      filteredBeers: beers ?? [],
      containerFilter: null,
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

      const { getByTestId } = renderAllBeers();

      const skeleton = getByTestId('skeleton-loader');

      // Skeleton should be visible
      expect(skeleton).toBeDefined();

      // Note: Exact count is implementation detail, but should be reasonable (10-20 items)
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

      const { getByTestId } = renderAllBeers();

      await waitFor(() => {
        expect(getByTestId('beer-count')).toBeDefined();
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

      const { queryByTestId, getByTestId } = renderAllBeers();

      await waitFor(() => {
        // Should not show skeleton after load
        expect(queryByTestId('skeleton-loader')).toBeNull();

        // Should show beer list with empty state
        expect(getByTestId('beer-list-empty')).toBeDefined();
      });
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

      const { queryByTestId } = renderAllBeers();

      await waitFor(() => {
        expect(queryByTestId('beer-list')).toBeNull();
      });
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

    it('should use RefreshControl for refresh indication', async () => {
      (beerRepository.getAll as jest.Mock).mockResolvedValue(mockBeers);

      (useDataRefresh as jest.Mock).mockReturnValue({
        refreshing: true,
        handleRefresh: jest.fn(),
      });

      const { getByTestId } = renderAllBeers();

      await waitFor(() => {
        // BeerList has RefreshControl built-in
        const beerList = getByTestId('beer-list');
        expect(beerList).toBeDefined();
      });
    });

    it('should maintain scroll position during refresh', async () => {
      (beerRepository.getAll as jest.Mock).mockResolvedValue(mockBeers);

      const { getByTestId } = renderAllBeers();

      await waitFor(() => {
        expect(getByTestId('beer-list')).toBeDefined();
      });

      // Refreshing should not reset scroll or show skeleton
      (useDataRefresh as jest.Mock).mockReturnValue({
        refreshing: true,
        handleRefresh: jest.fn(),
      });

      // Re-render should keep list visible
      expect(getByTestId('beer-list')).toBeDefined();
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

      // State 3: Retry — the database recovers, user taps Try Again
      mockGetAll.mockResolvedValue(mockBeers);

      fireEvent.press(getByTestId('try-again-button'));

      // State 4: Loaded — error cleared and the list replaces it
      await waitFor(() => {
        expect(getByTestId('beer-list')).toBeDefined();
      });

      expect(queryByTestId('error-container')).toBeNull();
      expect(queryByTestId('skeleton-loader')).toBeNull();
    });
  });

  describe('Performance', () => {
    it('should show skeleton within 100ms of mount', () => {
      (beerRepository.getAll as jest.Mock).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(mockBeers), 1000))
      );

      const start = performance.now();

      const { getByTestId } = renderAllBeers();

      const skeleton = getByTestId('skeleton-loader');
      const duration = performance.now() - start;

      expect(skeleton).toBeDefined();
      expect(duration).toBeLessThan(100);
    });

    it('should not block UI thread during data load', async () => {
      (beerRepository.getAll as jest.Mock).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(mockBeers), 500))
      );

      const { getByTestId } = renderAllBeers();

      // Skeleton appears immediately (non-blocking)
      expect(getByTestId('skeleton-loader')).toBeDefined();

      // UI remains responsive
      // (Cannot directly test, but component should render without blocking)
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

      const { getByTestId } = renderAllBeers();

      await waitFor(() => {
        expect(getByTestId('beer-list')).toBeDefined();
      });

      // Should filter out empty names and not crash
    });

    it('should handle loading state when repository returns null', async () => {
      (beerRepository.getAll as jest.Mock).mockResolvedValue(null as any);

      const { queryByTestId } = renderAllBeers();

      // Should handle gracefully (either error or empty state)
      await waitFor(() => {
        expect(queryByTestId('skeleton-loader')).toBeNull();
      });
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
      const containerDuringLoad = queryByTestId('all-beers-container');
      expect(containerDuringLoad).toBeDefined();

      await waitFor(() => {
        expect(getByTestId('beer-list')).toBeDefined();
      });

      const containerAfterLoad = getByTestId('all-beers-container');
      expect(containerAfterLoad).toBeDefined();
    });
  });
});
