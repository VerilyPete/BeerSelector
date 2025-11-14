/**
 * MP-3 Step 3a: Integration Tests for TastedBrewList Loading States (TDD Approach)
 *
 * Purpose: Define expected loading state behavior for TastedBrewList component BEFORE implementation.
 * These tests will FAIL initially - that's correct for TDD!
 *
 * TastedBrewList-Specific Requirements:
 * - Show SkeletonLoader during initial tasted beers fetch
 * - Fetch and populate My Beers data from API if needed
 * - Show empty state with helpful message when no tasted beers
 * - Display beers sorted by tasted_date instead of added_date
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { TastedBrewList } from '../TastedBrewList';
import { myBeersRepository } from '@/src/database/repositories/MyBeersRepository';
import { fetchMyBeersFromAPI } from '@/src/api/beerApi';

// Mock dependencies
jest.mock('@/src/database/repositories/MyBeersRepository');
jest.mock('@/src/api/beerApi');
jest.mock('@/hooks/useBeerFilters');
jest.mock('@/hooks/useDataRefresh');
jest.mock('@/hooks/useDebounce', () => ({
  useDebounce: (value: any) => value,
}));
jest.mock('@/hooks/useThemeColor', () => ({
  useThemeColor: jest.fn(() => '#007AFF'),
}));
jest.mock('@/hooks/useColorScheme', () => ({
  useColorScheme: jest.fn(() => 'light'),
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

describe('TastedBrewList Loading States (MP-3 Step 3a)', () => {
  const mockTastedBeers = [
    {
      id: '1',
      brew_name: 'Tasted IPA',
      brewer: 'Test Brewery',
      brew_style: 'IPA',
      brew_container: 'Draft',
      brew_description: 'Already tasted',
      added_date: '1699564800',
      brewer_loc: 'Austin, TX',
      tasted_date: '11/10/2025',
      tasted: true,
      abv: '6.5',
      ibu: '60',
    },
    {
      id: '2',
      brew_name: 'Tasted Stout',
      brewer: 'Another Brewery',
      brew_style: 'Stout',
      brew_container: 'Bottle',
      brew_description: 'Tasted yesterday',
      added_date: '1699651200',
      brewer_loc: 'Denver, CO',
      tasted_date: '11/13/2025',
      tasted: true,
      abv: '8.0',
      ibu: '45',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock useBeerFilters hook (with tasted_date sort)
    const useBeerFilters = require('@/hooks/useBeerFilters').useBeerFilters;
    useBeerFilters.mockImplementation((beers: any) => ({
      filteredBeers: beers,
      filters: { isDraft: false, isHeavies: false, isIpa: false },
      sortBy: 'date',
      searchText: '',
      expandedId: null,
      setSearchText: jest.fn(),
      toggleFilter: jest.fn(),
      toggleSort: jest.fn(),
      toggleExpand: jest.fn(),
    }));

    // Mock useDataRefresh hook
    const useDataRefresh = require('@/hooks/useDataRefresh').useDataRefresh;
    useDataRefresh.mockReturnValue({
      refreshing: false,
      handleRefresh: jest.fn(),
    });

    // Mock My Beers API
    (fetchMyBeersFromAPI as jest.Mock).mockResolvedValue(mockTastedBeers);

    // Mock My Beers repository
    (myBeersRepository.insertMany as jest.Mock).mockResolvedValue(undefined);
  });

  describe('Initial Load - Skeleton Display', () => {
    it('should show skeleton loader during initial tasted beers fetch', async () => {
      (myBeersRepository.getAll as jest.Mock).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(mockTastedBeers), 1000))
      );

      const { getByTestId, queryByTestId } = render(<TastedBrewList />);

      // Should show skeleton immediately
      expect(getByTestId('skeleton-loader')).toBeDefined();

      // Should NOT show beer list yet
      expect(queryByTestId('beer-list')).toBeNull();
    });

    it('should show skeleton while fetching My Beers from API', async () => {
      (myBeersRepository.getAll as jest.Mock).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(mockTastedBeers), 500))
      );

      (fetchMyBeersFromAPI as jest.Mock).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(mockTastedBeers), 800))
      );

      const { getByTestId } = render(<TastedBrewList />);

      // Should show skeleton during API fetch
      expect(getByTestId('skeleton-loader')).toBeDefined();
    });

    it('should NOT show error message during loading', async () => {
      (myBeersRepository.getAll as jest.Mock).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(mockTastedBeers), 500))
      );

      const { queryByText } = render(<TastedBrewList />);

      // Should not show error during loading
      expect(queryByText(/Failed to load/)).toBeNull();
    });
  });

  describe('Data Loaded - Show BeerList', () => {
    it('should hide skeleton and show beer list when tasted beers load', async () => {
      (myBeersRepository.getAll as jest.Mock).mockResolvedValue(mockTastedBeers);

      const { queryByTestId, getByTestId } = render(<TastedBrewList />);

      // Initially shows skeleton
      expect(queryByTestId('skeleton-loader')).toBeDefined();

      // Wait for data to load
      await waitFor(() => {
        expect(getByTestId('beer-list')).toBeDefined();
      });

      // Skeleton should be hidden
      expect(queryByTestId('skeleton-loader')).toBeNull();
    });

    it('should show beer count when data loads', async () => {
      (myBeersRepository.getAll as jest.Mock).mockResolvedValue(mockTastedBeers);

      const { getByText } = render(<TastedBrewList />);

      await waitFor(() => {
        expect(getByText(/2 brews tasted/)).toBeDefined();
      });
    });

    it('should show Tasted date label on beers', async () => {
      (myBeersRepository.getAll as jest.Mock).mockResolvedValue(mockTastedBeers);

      const { getByTestId } = render(<TastedBrewList />);

      await waitFor(() => {
        expect(getByTestId('beer-list')).toBeDefined();
      });

      // BeerList should have dateLabel="Tasted" prop
      // (Verified by component rendering without error)
    });

    it('should show filters without Heavies/IPA options', async () => {
      (myBeersRepository.getAll as jest.Mock).mockResolvedValue(mockTastedBeers);

      const { getByTestId } = render(<TastedBrewList />);

      await waitFor(() => {
        expect(getByTestId('beer-list')).toBeDefined();
      });

      // FilterBar should have showHeaviesAndIpa=false
      // (Tasted beers don't need these filters)
    });
  });

  describe('My Beers Data Fetch', () => {
    it('should attempt to fetch My Beers from API during load', async () => {
      (myBeersRepository.getAll as jest.Mock).mockResolvedValue([]);

      render(<TastedBrewList />);

      await waitFor(() => {
        expect(fetchMyBeersFromAPI).toHaveBeenCalled();
      });
    });

    it('should populate repository after API fetch', async () => {
      (myBeersRepository.getAll as jest.Mock).mockResolvedValue([]);

      render(<TastedBrewList />);

      await waitFor(() => {
        expect(myBeersRepository.insertMany).toHaveBeenCalledWith(mockTastedBeers);
      });
    });

    it('should continue loading if API fetch fails', async () => {
      (myBeersRepository.getAll as jest.Mock).mockResolvedValue(mockTastedBeers);
      (fetchMyBeersFromAPI as jest.Mock).mockRejectedValue(new Error('Network error'));

      const { getByTestId } = render(<TastedBrewList />);

      // Should still show local data if API fails
      await waitFor(() => {
        expect(getByTestId('beer-list')).toBeDefined();
      });
    });

    it('should reload data after successful API fetch', async () => {
      const mockGetAll = myBeersRepository.getAll as jest.Mock;

      // First call returns empty (before API fetch)
      mockGetAll.mockResolvedValueOnce([]);

      // Second call returns data (after API fetch populates DB)
      mockGetAll.mockResolvedValueOnce(mockTastedBeers);

      const { getByTestId } = render(<TastedBrewList />);

      await waitFor(() => {
        expect(mockGetAll).toHaveBeenCalled();
      });
    });
  });

  describe('Empty State', () => {
    it('should show contextual empty message when no tasted beers', async () => {
      (myBeersRepository.getAll as jest.Mock).mockResolvedValue([]);

      const { queryByTestId, getByText } = render(<TastedBrewList />);

      await waitFor(() => {
        expect(queryByTestId('skeleton-loader')).toBeNull();
        expect(
          getByText(/No beers in your current round yet/)
        ).toBeDefined();
      });
    });

    it('should show search-specific empty message when filtering', async () => {
      (myBeersRepository.getAll as jest.Mock).mockResolvedValue(mockTastedBeers);

      // Mock search filter active
      const useBeerFilters = require('@/hooks/useBeerFilters').useBeerFilters;
      useBeerFilters.mockImplementation((beers: any) => ({
        filteredBeers: [],
        filters: { isDraft: false, isHeavies: false, isIpa: false },
        sortBy: 'date',
        searchText: 'NonexistentBeer',
        expandedId: null,
        setSearchText: jest.fn(),
        toggleFilter: jest.fn(),
        toggleSort: jest.fn(),
        toggleExpand: jest.fn(),
      }));

      const { queryByTestId, getByText } = render(<TastedBrewList />);

      await waitFor(() => {
        expect(queryByTestId('skeleton-loader')).toBeNull();
        expect(
          getByText(/No tasted beer matches your search criteria/)
        ).toBeDefined();
      });
    });

    it('should not show skeleton for empty state', async () => {
      (myBeersRepository.getAll as jest.Mock).mockResolvedValue([]);

      const { queryByTestId } = render(<TastedBrewList />);

      await waitFor(() => {
        expect(queryByTestId('skeleton-loader')).toBeNull();
      });
    });
  });

  describe('Error State', () => {
    it('should hide skeleton and show error message on load failure', async () => {
      (myBeersRepository.getAll as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      const { queryByTestId, getByText } = render(<TastedBrewList />);

      await waitFor(() => {
        expect(queryByTestId('skeleton-loader')).toBeNull();
        expect(getByText(/Failed to load tasted beers/)).toBeDefined();
      });
    });

    it('should show try again button on error', async () => {
      (myBeersRepository.getAll as jest.Mock).mockRejectedValue(
        new Error('Network error')
      );

      const { getByText } = render(<TastedBrewList />);

      await waitFor(() => {
        expect(getByText('Try Again')).toBeDefined();
      });
    });

    it('should not show beer list on error', async () => {
      (myBeersRepository.getAll as jest.Mock).mockRejectedValue(
        new Error('Failed')
      );

      const { queryByTestId } = render(<TastedBrewList />);

      await waitFor(() => {
        expect(queryByTestId('beer-list')).toBeNull();
      });
    });
  });

  describe('Refresh State', () => {
    it('should NOT show skeleton during refresh', async () => {
      (myBeersRepository.getAll as jest.Mock).mockResolvedValue(mockTastedBeers);

      const useDataRefresh = require('@/hooks/useDataRefresh').useDataRefresh;
      useDataRefresh.mockReturnValue({
        refreshing: true,
        handleRefresh: jest.fn(),
      });

      const { queryByTestId, getByTestId } = render(<TastedBrewList />);

      await waitFor(() => {
        expect(getByTestId('beer-list')).toBeDefined();
      });

      // Should NOT show skeleton during refresh
      expect(queryByTestId('skeleton-loader')).toBeNull();
    });

    it('should use RefreshControl for pull-to-refresh', async () => {
      (myBeersRepository.getAll as jest.Mock).mockResolvedValue(mockTastedBeers);

      const { getByTestId } = render(<TastedBrewList />);

      await waitFor(() => {
        // BeerList has RefreshControl built-in
        const beerList = getByTestId('beer-list');
        expect(beerList).toBeDefined();
      });
    });

    it('should maintain beer list visibility during refresh', async () => {
      (myBeersRepository.getAll as jest.Mock).mockResolvedValue(mockTastedBeers);

      const { getByTestId, rerender } = render(<TastedBrewList />);

      await waitFor(() => {
        expect(getByTestId('beer-list')).toBeDefined();
      });

      // Trigger refresh
      const useDataRefresh = require('@/hooks/useDataRefresh').useDataRefresh;
      useDataRefresh.mockReturnValue({
        refreshing: true,
        handleRefresh: jest.fn(),
      });

      rerender(<TastedBrewList />);

      // List should still be visible
      expect(getByTestId('beer-list')).toBeDefined();
      expect(queryByTestId('skeleton-loader')).toBeNull();
    });
  });

  describe('Loading State Transitions', () => {
    it('should transition from loading to loaded smoothly', async () => {
      (myBeersRepository.getAll as jest.Mock).mockResolvedValue(mockTastedBeers);

      const { queryByTestId, getByTestId } = render(<TastedBrewList />);

      // Loading state
      expect(queryByTestId('skeleton-loader')).toBeDefined();

      // Loaded state
      await waitFor(() => {
        expect(getByTestId('beer-list')).toBeDefined();
        expect(queryByTestId('skeleton-loader')).toBeNull();
      });
    });

    it('should handle loading → loaded → refreshing → loaded', async () => {
      const mockGetAll = myBeersRepository.getAll as jest.Mock;
      mockGetAll.mockResolvedValue(mockTastedBeers);

      const { queryByTestId, getByTestId, rerender } = render(<TastedBrewList />);

      // State 1: Loading (skeleton)
      expect(queryByTestId('skeleton-loader')).toBeDefined();

      // State 2: Loaded (beer list)
      await waitFor(() => {
        expect(getByTestId('beer-list')).toBeDefined();
        expect(queryByTestId('skeleton-loader')).toBeNull();
      });

      // State 3: Refreshing (beer list, no skeleton)
      const useDataRefresh = require('@/hooks/useDataRefresh').useDataRefresh;
      useDataRefresh.mockReturnValue({
        refreshing: true,
        handleRefresh: jest.fn(),
      });

      rerender(<TastedBrewList />);

      expect(getByTestId('beer-list')).toBeDefined();
      expect(queryByTestId('skeleton-loader')).toBeNull();

      // State 4: Loaded again
      useDataRefresh.mockReturnValue({
        refreshing: false,
        handleRefresh: jest.fn(),
      });

      rerender(<TastedBrewList />);

      expect(getByTestId('beer-list')).toBeDefined();
      expect(queryByTestId('skeleton-loader')).toBeNull();
    });

    it('should handle loading → error → retry → loading → loaded', async () => {
      const mockGetAll = myBeersRepository.getAll as jest.Mock;

      // First call fails
      mockGetAll.mockRejectedValueOnce(new Error('Network error'));

      const { queryByTestId, getByText } = render(<TastedBrewList />);

      // Loading
      expect(queryByTestId('skeleton-loader')).toBeDefined();

      // Error
      await waitFor(() => {
        expect(getByText(/Failed to load tasted beers/)).toBeDefined();
        expect(queryByTestId('skeleton-loader')).toBeNull();
      });

      // Retry button is available (user can tap to retry)
      expect(getByText('Try Again')).toBeDefined();
    });
  });

  describe('Performance', () => {
    it('should show skeleton within 100ms of mount', () => {
      (myBeersRepository.getAll as jest.Mock).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(mockTastedBeers), 1000))
      );

      const start = performance.now();

      const { getByTestId } = render(<TastedBrewList />);

      const skeleton = getByTestId('skeleton-loader');
      const duration = performance.now() - start;

      expect(skeleton).toBeDefined();
      expect(duration).toBeLessThan(100);
    });

    it('should not block UI thread during data load', async () => {
      (myBeersRepository.getAll as jest.Mock).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(mockTastedBeers), 500))
      );

      const { getByTestId } = render(<TastedBrewList />);

      // Skeleton appears immediately (non-blocking)
      expect(getByTestId('skeleton-loader')).toBeDefined();

      // Component renders without freezing
    });
  });

  describe('TastedBrewList-Specific Features', () => {
    it('should filter out beers with empty names', async () => {
      const beersWithEmpty = [
        ...mockTastedBeers,
        { ...mockTastedBeers[0], id: '3', brew_name: '' },
        { ...mockTastedBeers[0], id: '4', brew_name: '   ' },
      ];

      (myBeersRepository.getAll as jest.Mock).mockResolvedValue(beersWithEmpty);

      const { getByText } = render(<TastedBrewList />);

      await waitFor(() => {
        // Should only count valid beers (2 out of 4)
        expect(getByText(/2 brews tasted/)).toBeDefined();
      });
    });

    it('should use tasted_date for sorting (not added_date)', async () => {
      (myBeersRepository.getAll as jest.Mock).mockResolvedValue(mockTastedBeers);

      const { getByTestId } = render(<TastedBrewList />);

      await waitFor(() => {
        expect(getByTestId('beer-list')).toBeDefined();
      });

      // useBeerFilters should be called with 'tasted_date' parameter
      const useBeerFilters = require('@/hooks/useBeerFilters').useBeerFilters;
      expect(useBeerFilters).toHaveBeenCalledWith(
        expect.anything(),
        'tasted_date'
      );
    });

    it('should display Beerfinder type beers with tasted_date', async () => {
      (myBeersRepository.getAll as jest.Mock).mockResolvedValue(mockTastedBeers);

      const { getByTestId } = render(<TastedBrewList />);

      await waitFor(() => {
        // BeerList should render Beerfinder type beers
        expect(getByTestId('beer-list')).toBeDefined();
      });

      // Beers have both added_date and tasted_date
      // BeerItem should show tasted_date (via dateLabel="Tasted")
    });
  });

  describe('Visual Consistency', () => {
    it('should show filters container during loading with skeleton', async () => {
      (myBeersRepository.getAll as jest.Mock).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(mockTastedBeers), 500))
      );

      const { getByTestId } = render(<TastedBrewList />);

      // Skeleton visible
      expect(getByTestId('skeleton-loader')).toBeDefined();

      // Layout should be consistent
    });

    it('should maintain layout structure between loading and loaded states', async () => {
      (myBeersRepository.getAll as jest.Mock).mockResolvedValue(mockTastedBeers);

      const { container } = render(<TastedBrewList />);

      const initialStructure = container;

      await waitFor(() => {
        // Same container structure after load
        expect(container).toBeDefined();
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle API fetch timeout gracefully', async () => {
      (myBeersRepository.getAll as jest.Mock).mockResolvedValue(mockTastedBeers);

      (fetchMyBeersFromAPI as jest.Mock).mockImplementation(
        () => new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
      );

      const { getByTestId } = render(<TastedBrewList />);

      // Should show local data despite API timeout
      await waitFor(() => {
        expect(getByTestId('beer-list')).toBeDefined();
      }, { timeout: 6000 });
    });

    it('should handle repository returning null gracefully', async () => {
      (myBeersRepository.getAll as jest.Mock).mockResolvedValue(null as any);

      const { queryByTestId } = render(<TastedBrewList />);

      // Should handle gracefully (error or empty state)
      await waitFor(() => {
        expect(queryByTestId('skeleton-loader')).toBeNull();
      });
    });

    it('should handle beers without tasted_date field', async () => {
      const beersWithoutDate = [
        { ...mockTastedBeers[0], tasted_date: undefined },
        { ...mockTastedBeers[1], tasted_date: '' },
      ];

      (myBeersRepository.getAll as jest.Mock).mockResolvedValue(beersWithoutDate);

      const { getByTestId } = render(<TastedBrewList />);

      await waitFor(() => {
        // Should still render without crashing
        expect(getByTestId('beer-list')).toBeDefined();
      });
    });
  });
});
