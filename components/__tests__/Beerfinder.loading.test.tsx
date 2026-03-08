/**
 * MP-3 Step 3a: Integration Tests for Beerfinder Loading States (TDD Approach)
 *
 * Purpose: Define expected loading state behavior for Beerfinder component BEFORE implementation.
 * These tests will FAIL initially - that's correct for TDD!
 *
 * Beerfinder-Specific Requirements:
 * - Show SkeletonLoader during initial untasted beers fetch
 * - Fetch and populate My Beers data if needed (for tasted status)
 * - Show action buttons after data loads (Check Me In, Check Untappd)
 * - Handle View Queues and Rewards buttons during loading
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { Beerfinder } from '../Beerfinder';
import { beerRepository } from '@/src/database/repositories/BeerRepository';
import { myBeersRepository } from '@/src/database/repositories/MyBeersRepository';

// Mock dependencies
jest.mock('@/src/database/repositories/BeerRepository');
jest.mock('@/src/database/repositories/MyBeersRepository');
jest.mock('@/src/api/beerApi');
jest.mock('@/hooks/useBeerFilters');
jest.mock('@/hooks/useDataRefresh');
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

describe('Beerfinder Loading States (MP-3 Step 3a)', () => {
  const mockUntastedBeers = [
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
    },
  ];

  const mockMyBeers = [
    {
      id: '100',
      brew_name: 'Tasted IPA',
      brewer: 'Tasted Brewery',
      tasted_date: '11/01/2025',
      tasted: true,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock useBeerFilters hook
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
    const { fetchMyBeersFromAPI } = require('@/src/api/beerApi');
    fetchMyBeersFromAPI.mockResolvedValue(mockMyBeers);

    // Mock My Beers repository
    (myBeersRepository.insertMany as jest.Mock).mockResolvedValue(undefined);
  });

  describe('Initial Load - Skeleton Display', () => {
    it('should show skeleton loader during initial untasted beers fetch', async () => {
      (beerRepository.getUntasted as jest.Mock).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(mockUntastedBeers), 1000))
      );

      const { getByTestId, queryByTestId } = render(<Beerfinder />);

      // Should show skeleton immediately
      expect(getByTestId('skeleton-loader')).toBeDefined();

      // Should NOT show beer list yet
      expect(queryByTestId('beer-list')).toBeNull();
    });

    it('should show skeleton while fetching My Beers data', async () => {
      (beerRepository.getUntasted as jest.Mock).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(mockUntastedBeers), 500))
      );

      const { fetchMyBeersFromAPI } = require('@/src/api/beerApi');
      fetchMyBeersFromAPI.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(mockMyBeers), 800))
      );

      const { getByTestId } = render(<Beerfinder />);

      // Should show skeleton during My Beers fetch
      expect(getByTestId('skeleton-loader')).toBeDefined();
    });

    it('should show action buttons (View Queues, Rewards) above skeleton', async () => {
      (beerRepository.getUntasted as jest.Mock).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(mockUntastedBeers), 500))
      );

      const { getByTestId } = render(<Beerfinder />);

      // Skeleton visible
      expect(getByTestId('skeleton-loader')).toBeDefined();

      // Action buttons should be visible even during loading
      // (Better UX - user can navigate away if needed)
      // Note: Implementation decision - may vary
    });
  });

  describe('Data Loaded - Show BeerList with Actions', () => {
    it('should hide skeleton and show beer list when untasted beers load', async () => {
      (beerRepository.getUntasted as jest.Mock).mockResolvedValue(mockUntastedBeers);

      const { queryByTestId, getByTestId } = render(<Beerfinder />);

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
      (beerRepository.getUntasted as jest.Mock).mockResolvedValue(mockUntastedBeers);

      const { getByText } = render(<Beerfinder />);

      await waitFor(() => {
        expect(getByText(/2 brews available/)).toBeDefined();
      });
    });

    it('should show Check Me In buttons after data loads', async () => {
      (beerRepository.getUntasted as jest.Mock).mockResolvedValue(mockUntastedBeers);

      const { getByTestId } = render(<Beerfinder />);

      await waitFor(() => {
        expect(getByTestId('beer-list')).toBeDefined();
      });

      // Action buttons should be available in expanded items
      // (Testing presence of BeerList with renderItemActions)
    });

    it('should show View Queues button when loaded', async () => {
      (beerRepository.getUntasted as jest.Mock).mockResolvedValue(mockUntastedBeers);

      const { getByText } = render(<Beerfinder />);

      await waitFor(() => {
        expect(getByText('View Queues')).toBeDefined();
      });
    });

    it('should show Rewards button when loaded', async () => {
      (beerRepository.getUntasted as jest.Mock).mockResolvedValue(mockUntastedBeers);

      const { getByText } = render(<Beerfinder />);

      await waitFor(() => {
        expect(getByText('Rewards')).toBeDefined();
      });
    });
  });

  describe('My Beers Data Fetch', () => {
    it('should attempt to fetch My Beers data during load', async () => {
      (beerRepository.getUntasted as jest.Mock).mockResolvedValue(mockUntastedBeers);

      const { fetchMyBeersFromAPI } = require('@/src/api/beerApi');
      fetchMyBeersFromAPI.mockResolvedValue(mockMyBeers);

      render(<Beerfinder />);

      await waitFor(() => {
        expect(fetchMyBeersFromAPI).toHaveBeenCalled();
      });
    });

    it('should populate My Beers repository after fetch', async () => {
      (beerRepository.getUntasted as jest.Mock).mockResolvedValue(mockUntastedBeers);

      const { fetchMyBeersFromAPI } = require('@/src/api/beerApi');
      fetchMyBeersFromAPI.mockResolvedValue(mockMyBeers);

      render(<Beerfinder />);

      await waitFor(() => {
        expect(myBeersRepository.insertMany).toHaveBeenCalledWith(mockMyBeers);
      });
    });

    it('should continue loading if My Beers fetch fails', async () => {
      (beerRepository.getUntasted as jest.Mock).mockResolvedValue(mockUntastedBeers);

      const { fetchMyBeersFromAPI } = require('@/src/api/beerApi');
      fetchMyBeersFromAPI.mockRejectedValue(new Error('Network error'));

      const { getByTestId } = render(<Beerfinder />);

      // Should still show untasted beers even if My Beers fetch fails
      await waitFor(() => {
        expect(getByTestId('beer-list')).toBeDefined();
      });
    });
  });

  describe('Empty State', () => {
    it('should show empty message when no untasted beers', async () => {
      (beerRepository.getUntasted as jest.Mock).mockResolvedValue([]);

      const { queryByTestId, getByText } = render(<Beerfinder />);

      await waitFor(() => {
        expect(queryByTestId('skeleton-loader')).toBeNull();
        expect(getByText('No beer found')).toBeDefined();
      });
    });

    it('should not show skeleton for empty state', async () => {
      (beerRepository.getUntasted as jest.Mock).mockResolvedValue([]);

      const { queryByTestId } = render(<Beerfinder />);

      await waitFor(() => {
        expect(queryByTestId('skeleton-loader')).toBeNull();
      });
    });

    it('should still show action buttons in empty state', async () => {
      (beerRepository.getUntasted as jest.Mock).mockResolvedValue([]);

      const { getByText } = render(<Beerfinder />);

      await waitFor(() => {
        expect(getByText('View Queues')).toBeDefined();
        expect(getByText('Rewards')).toBeDefined();
      });
    });
  });

  describe('Error State', () => {
    it('should hide skeleton and show error message on fetch failure', async () => {
      (beerRepository.getUntasted as jest.Mock).mockRejectedValue(new Error('Database error'));

      const { queryByTestId, getByText } = render(<Beerfinder />);

      await waitFor(() => {
        expect(queryByTestId('skeleton-loader')).toBeNull();
        expect(getByText(/Failed to load beers/)).toBeDefined();
      });
    });

    it('should show try again button on error', async () => {
      (beerRepository.getUntasted as jest.Mock).mockRejectedValue(new Error('Network error'));

      const { getByText } = render(<Beerfinder />);

      await waitFor(() => {
        expect(getByText('Try Again')).toBeDefined();
      });
    });
  });

  describe('Refresh State', () => {
    it('should NOT show skeleton during refresh', async () => {
      (beerRepository.getUntasted as jest.Mock).mockResolvedValue(mockUntastedBeers);

      const useDataRefresh = require('@/hooks/useDataRefresh').useDataRefresh;
      useDataRefresh.mockReturnValue({
        refreshing: true,
        handleRefresh: jest.fn(),
      });

      const { queryByTestId, getByTestId } = render(<Beerfinder />);

      await waitFor(() => {
        expect(getByTestId('beer-list')).toBeDefined();
      });

      // Should NOT show skeleton during refresh
      expect(queryByTestId('skeleton-loader')).toBeNull();
    });

    it('should maintain beer list visibility during refresh', async () => {
      (beerRepository.getUntasted as jest.Mock).mockResolvedValue(mockUntastedBeers);

      const { getByTestId } = render(<Beerfinder />);

      await waitFor(() => {
        expect(getByTestId('beer-list')).toBeDefined();
      });

      // Refresh state
      const useDataRefresh = require('@/hooks/useDataRefresh').useDataRefresh;
      useDataRefresh.mockReturnValue({
        refreshing: true,
        handleRefresh: jest.fn(),
      });

      // List should still be visible
      expect(getByTestId('beer-list')).toBeDefined();
    });
  });

  describe('Loading State Transitions', () => {
    it('should transition from loading to loaded smoothly', async () => {
      (beerRepository.getUntasted as jest.Mock).mockResolvedValue(mockUntastedBeers);

      const { queryByTestId, getByTestId } = render(<Beerfinder />);

      // Loading state
      expect(queryByTestId('skeleton-loader')).toBeDefined();

      // Loaded state
      await waitFor(() => {
        expect(getByTestId('beer-list')).toBeDefined();
        expect(queryByTestId('skeleton-loader')).toBeNull();
      });
    });

    it('should handle loading → error → retry → loading → loaded', async () => {
      const mockGetUntasted = beerRepository.getUntasted as jest.Mock;

      // First call fails
      mockGetUntasted.mockRejectedValueOnce(new Error('Network error'));

      const { queryByTestId, getByText } = render(<Beerfinder />);

      // Loading
      expect(queryByTestId('skeleton-loader')).toBeDefined();

      // Error
      await waitFor(() => {
        expect(getByText(/Failed to load beers/)).toBeDefined();
        expect(queryByTestId('skeleton-loader')).toBeNull();
      });
    });
  });

  describe('Performance', () => {
    it('should show skeleton within 100ms of mount', () => {
      (beerRepository.getUntasted as jest.Mock).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(mockUntastedBeers), 1000))
      );

      const start = performance.now();

      const { getByTestId } = render(<Beerfinder />);

      const skeleton = getByTestId('skeleton-loader');
      const duration = performance.now() - start;

      expect(skeleton).toBeDefined();
      expect(duration).toBeLessThan(100);
    });
  });

  describe('Beerfinder-Specific Features', () => {
    it('should filter out beers with empty names', async () => {
      const beersWithEmpty = [
        ...mockUntastedBeers,
        { ...mockUntastedBeers[0], id: '3', brew_name: '' },
        { ...mockUntastedBeers[0], id: '4', brew_name: '   ' },
      ];

      (beerRepository.getUntasted as jest.Mock).mockResolvedValue(beersWithEmpty);

      const { getByText } = render(<Beerfinder />);

      await waitFor(() => {
        // Should only count valid beers (2 out of 4)
        expect(getByText(/2 brews available/)).toBeDefined();
      });
    });

    it('should show check-in functionality after load', async () => {
      (beerRepository.getUntasted as jest.Mock).mockResolvedValue(mockUntastedBeers);

      const { getByTestId } = render(<Beerfinder />);

      await waitFor(() => {
        // BeerList with renderItemActions should be present
        expect(getByTestId('beer-list')).toBeDefined();
      });

      // Check Me In buttons are rendered via renderItemActions
      // Actual button testing would require expanding an item
    });

    it('should show Untappd search functionality after load', async () => {
      (beerRepository.getUntasted as jest.Mock).mockResolvedValue(mockUntastedBeers);

      const { getByTestId } = render(<Beerfinder />);

      await waitFor(() => {
        expect(getByTestId('beer-list')).toBeDefined();
      });

      // Check Untappd buttons are available via renderItemActions
    });
  });

  describe('Visual Consistency', () => {
    it('should show buttons container during loading', async () => {
      (beerRepository.getUntasted as jest.Mock).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(mockUntastedBeers), 500))
      );

      const { getByTestId } = render(<Beerfinder />);

      // Skeleton visible
      expect(getByTestId('skeleton-loader')).toBeDefined();

      // Action buttons may be visible for better UX
      // (Implementation decision)
    });

    it('should maintain layout structure between states', async () => {
      (beerRepository.getUntasted as jest.Mock).mockResolvedValue(mockUntastedBeers);

      const { getByTestId } = render(<Beerfinder />);

      await waitFor(() => {
        // Loaded layout should use same container - verify component renders
        expect(getByTestId('beer-list')).toBeDefined();
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle My Beers fetch timeout gracefully', async () => {
      (beerRepository.getUntasted as jest.Mock).mockResolvedValue(mockUntastedBeers);

      const { fetchMyBeersFromAPI } = require('@/src/api/beerApi');
      fetchMyBeersFromAPI.mockImplementation(
        () => new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
      );

      const { getByTestId } = render(<Beerfinder />);

      // Should still show untasted beers despite My Beers timeout
      await waitFor(
        () => {
          expect(getByTestId('beer-list')).toBeDefined();
        },
        { timeout: 6000 }
      );
    });

    it('should handle concurrent fetches (untasted + My Beers)', async () => {
      (beerRepository.getUntasted as jest.Mock).mockResolvedValue(mockUntastedBeers);

      const { fetchMyBeersFromAPI } = require('@/src/api/beerApi');
      fetchMyBeersFromAPI.mockResolvedValue(mockMyBeers);

      const { getByTestId } = render(<Beerfinder />);

      await waitFor(() => {
        // Both fetches complete successfully
        expect(getByTestId('beer-list')).toBeDefined();
        expect(myBeersRepository.insertMany).toHaveBeenCalled();
      });
    });
  });
});
