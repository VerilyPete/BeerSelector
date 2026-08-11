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
 * - Keep QUEUE/REWARDS actions reachable in every state
 * - Show the context error and a Try Again control when loading fails
 * - Never show the skeleton during pull-to-refresh
 */

import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Beerfinder } from '../Beerfinder';
import { AppProvider } from '@/context/AppContext';
import { beerRepository } from '@/src/database/repositories/BeerRepository';
import { myBeersRepository } from '@/src/database/repositories/MyBeersRepository';
import { rewardsRepository } from '@/src/database/repositories/RewardsRepository';
import { getSessionData } from '@/src/api/sessionManager';
import { isVisitorMode } from '@/src/api/authService';
import { getQueuedBeers } from '@/src/api/queueService';
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
 */
const ERROR_SURFACE_TIMEOUT = 15000;

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
      containerFilter: null,
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
      error: null,
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
      // All beers land quickly, tasted beers lag — the untasted set is not
      // knowable until both are in, so the skeleton must stay put.
      (beerRepository.getAll as jest.Mock).mockResolvedValue(mockAllBeers);
      (myBeersRepository.getAll as jest.Mock).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(mockTastedBeers), 800))
      );

      const { getByTestId, queryByTestId } = renderBeerfinder();

      expect(getByTestId('skeleton-loader')).toBeDefined();
      expect(queryByTestId('beer-list')).toBeNull();
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

    it('should trigger a refresh when try again is pressed', async () => {
      const handleRefresh = jest.fn().mockResolvedValue(undefined);
      (useDataRefresh as jest.Mock).mockReturnValue({
        refreshing: false,
        error: null,
        handleRefresh,
      });
      (beerRepository.getAll as jest.Mock).mockRejectedValue(new Error('Network error'));

      const { getByText } = renderBeerfinder();

      await waitFor(
        () => {
          expect(getByText('Try Again')).toBeDefined();
        },
        { timeout: ERROR_SURFACE_TIMEOUT }
      );

      fireEvent.press(getByText('Try Again'));

      await waitFor(() => {
        expect(handleRefresh).toHaveBeenCalled();
      });
    });
  });

  describe('Refresh State (Pull-to-Refresh)', () => {
    it('should NOT show skeleton during refresh', async () => {
      (useDataRefresh as jest.Mock).mockReturnValue({
        refreshing: true,
        error: null,
        handleRefresh: jest.fn(),
      });

      const { queryByTestId, getByTestId } = renderBeerfinder();

      await waitFor(() => {
        expect(getByTestId('beer-list')).toBeDefined();
      });

      // Should NOT show skeleton during refresh
      expect(queryByTestId('skeleton-loader')).toBeNull();
    });

    it('should maintain beer list visibility during refresh', async () => {
      const { getByTestId, rerender } = renderBeerfinder();

      await waitFor(() => {
        expect(getByTestId('beer-list')).toBeDefined();
      });

      (useDataRefresh as jest.Mock).mockReturnValue({
        refreshing: true,
        error: null,
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

  describe('Performance', () => {
    it('should show skeleton within 100ms of mount', () => {
      (beerRepository.getAll as jest.Mock).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(mockAllBeers), 1000))
      );

      const start = performance.now();

      const { getByTestId } = renderBeerfinder();

      const skeleton = getByTestId('skeleton-loader');
      const duration = performance.now() - start;

      expect(skeleton).toBeDefined();
      expect(duration).toBeLessThan(100);
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
