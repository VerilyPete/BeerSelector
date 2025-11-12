/**
 * Tests for TastedBrewList component using repository pattern
 * Part of HP-7 Step 2a: Migration from db.ts to repositories
 */

import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import { TastedBrewList } from '../TastedBrewList';
import { myBeersRepository } from '@/src/database/repositories/MyBeersRepository';

// Mock dependencies
jest.mock('@/src/database/repositories/MyBeersRepository');
jest.mock('@/hooks/useDataRefresh');
jest.mock('@/src/api/beerApi');

const mockMyBeersRepository = jest.mocked(myBeersRepository);

describe('TastedBrewList Component with Repository Pattern', () => {
  const mockTastedBeers = [
    {
      id: '1',
      brew_name: 'IPA Test',
      brewer: 'Test Brewery',
      brewer_loc: 'Test City, TS',
      brew_style: 'IPA',
      brew_container: '16oz Draft',
      brew_description: 'A hoppy IPA',
      added_date: '2024-01-01',
      tasted_date: '2024-01-10',
    },
    {
      id: '2',
      brew_name: 'Stout Test',
      brewer: 'Dark Brewery',
      brewer_loc: 'Night City, NC',
      brew_style: 'Stout',
      brew_container: '12oz Bottle',
      brew_description: 'A dark stout',
      added_date: '2024-01-05',
      tasted_date: '2024-01-15',
    },
    {
      id: '3',
      brew_name: 'Lager Test',
      brewer: 'Light Brewery',
      brewer_loc: 'Sun City, SC',
      brew_style: 'Lager',
      brew_container: '12oz Can',
      brew_description: 'A crisp lager',
      added_date: '2024-01-08',
      tasted_date: '2024-01-20',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockMyBeersRepository.getAll.mockResolvedValue(mockTastedBeers);
    (mockMyBeersRepository.insertMany as jest.Mock).mockResolvedValue(undefined);

    // Mock useDataRefresh hook
    const useDataRefresh = require('@/hooks/useDataRefresh').useDataRefresh;
    useDataRefresh.mockImplementation(({ onDataReloaded }: any) => ({
      refreshing: false,
      handleRefresh: async () => {
        await onDataReloaded();
      },
    }));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Data Loading with Repository', () => {
    it('should load tasted beers using myBeersRepository.getAll()', async () => {
      const { getByText } = render(<TastedBrewList />);

      await waitFor(() => {
        expect(mockMyBeersRepository.getAll).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(getByText('IPA Test')).toBeTruthy();
        expect(getByText('Stout Test')).toBeTruthy();
        expect(getByText('Lager Test')).toBeTruthy();
      });
    });

    it('should not call deprecated db.getMyBeers()', async () => {
      const db = require('@/src/database/db');
      const spyGetMyBeers = jest.spyOn(db, 'getMyBeers');

      render(<TastedBrewList />);

      await waitFor(() => {
        expect(mockMyBeersRepository.getAll).toHaveBeenCalled();
      });

      // Ensure the deprecated function is not called
      expect(spyGetMyBeers).not.toHaveBeenCalled();
    });

    it('should display beer count correctly', async () => {
      const { getByText } = render(<TastedBrewList />);

      await waitFor(() => {
        expect(getByText('3 brews tasted')).toBeTruthy();
      });
    });

    it('should handle empty beers array', async () => {
      mockMyBeersRepository.getAll.mockResolvedValue([]);

      const { getByText } = render(<TastedBrewList />);

      await waitFor(() => {
        expect(getByText(/No beers in your current round yet/i)).toBeTruthy();
      });
    });

    it('should filter out beers with empty brew_name', async () => {
      const beersWithEmpty = [
        ...mockTastedBeers,
        {
          id: '4',
          brew_name: '',
          brewer: 'Empty Brewery',
          brewer_loc: 'Empty City',
          brew_style: 'Empty',
          brew_container: 'Empty',
          brew_description: 'Empty',
          added_date: '2024-01-01',
          tasted_date: '2024-01-01',
        },
        {
          id: '5',
          brew_name: '   ',
          brewer: 'Whitespace Brewery',
          brewer_loc: 'Space City',
          brew_style: 'Space',
          brew_container: 'Space',
          brew_description: 'Space',
          added_date: '2024-01-01',
          tasted_date: '2024-01-01',
        },
      ];

      mockMyBeersRepository.getAll.mockResolvedValue(beersWithEmpty);

      const { getByText, queryByText } = render(<TastedBrewList />);

      await waitFor(() => {
        // Should show only valid beers
        expect(getByText('3 brews tasted')).toBeTruthy();
        expect(getByText('IPA Test')).toBeTruthy();

        // Should not show empty beers
        expect(queryByText('Empty Brewery')).toBeNull();
        expect(queryByText('Whitespace Brewery')).toBeNull();
      });
    });
  });

  describe('Data Refresh with Repository', () => {
    it('should refresh data using myBeersRepository.getAll() via hook', async () => {
      const { rerender } = render(<TastedBrewList />);

      await waitFor(() => {
        expect(mockMyBeersRepository.getAll).toHaveBeenCalledTimes(1);
      });

      // Update mock data
      const updatedBeers = [...mockTastedBeers, {
        id: '4',
        brew_name: 'New Beer',
        brewer: 'New Brewery',
        brewer_loc: 'New City',
        brew_style: 'New Style',
        brew_container: 'New Container',
        brew_description: 'New Description',
        added_date: '2024-01-25',
        tasted_date: '2024-01-26',
      }];

      mockMyBeersRepository.getAll.mockResolvedValue(updatedBeers);

      // Trigger refresh via hook
      const useDataRefresh = require('@/hooks/useDataRefresh').useDataRefresh;
      const mockRefreshHandler = useDataRefresh.mock.results[0].value.handleRefresh;
      await mockRefreshHandler();

      rerender(<TastedBrewList />);

      await waitFor(() => {
        expect(mockMyBeersRepository.getAll).toHaveBeenCalledTimes(2);
      });
    });

    it('should not call deprecated db.fetchAndPopulateMyBeers() during refresh', async () => {
      const db = require('@/src/database/db');
      const spyFetchAndPopulate = jest.spyOn(db, 'fetchAndPopulateMyBeers');

      render(<TastedBrewList />);

      await waitFor(() => {
        expect(mockMyBeersRepository.getAll).toHaveBeenCalled();
      });

      // Trigger refresh
      const useDataRefresh = require('@/hooks/useDataRefresh').useDataRefresh;
      const mockRefreshHandler = useDataRefresh.mock.results[0].value.handleRefresh;
      await mockRefreshHandler();

      await waitFor(() => {
        expect(mockMyBeersRepository.getAll).toHaveBeenCalledTimes(2);
      });

      // Ensure deprecated function not called
      expect(spyFetchAndPopulate).not.toHaveBeenCalled();
    });
  });

  describe('Search and Filter with Repository Data', () => {
    it('should filter beers by search text', async () => {
      const { getByPlaceholderText, getByText, queryByText } = render(<TastedBrewList />);

      await waitFor(() => {
        expect(mockMyBeersRepository.getAll).toHaveBeenCalled();
      });

      const searchInput = getByPlaceholderText('Search tasted beer...');
      fireEvent.changeText(searchInput, 'IPA');

      await waitFor(() => {
        expect(getByText('IPA Test')).toBeTruthy();
        expect(queryByText('Stout Test')).toBeNull();
        expect(queryByText('Lager Test')).toBeNull();
      });
    });

    it('should show appropriate message when no beers match search', async () => {
      const { getByPlaceholderText, getByText } = render(<TastedBrewList />);

      await waitFor(() => {
        expect(mockMyBeersRepository.getAll).toHaveBeenCalled();
      });

      const searchInput = getByPlaceholderText('Search tasted beer...');
      fireEvent.changeText(searchInput, 'NonexistentBeer');

      await waitFor(() => {
        expect(getByText('No tasted beer matches your search criteria.')).toBeTruthy();
      });
    });

    it('should clear search and show all beers', async () => {
      const { getByPlaceholderText, getByText } = render(<TastedBrewList />);

      await waitFor(() => {
        expect(mockMyBeersRepository.getAll).toHaveBeenCalled();
      });

      const searchInput = getByPlaceholderText('Search tasted beer...');

      // Search first
      fireEvent.changeText(searchInput, 'IPA');
      await waitFor(() => {
        expect(getByText('1 brew tasted')).toBeTruthy();
      });

      // Clear search
      fireEvent.changeText(searchInput, '');
      await waitFor(() => {
        expect(getByText('3 brews tasted')).toBeTruthy();
      });
    });
  });

  describe('Error Handling', () => {
    it('should display error message when repository throws', async () => {
      const errorMessage = 'Database error';
      mockMyBeersRepository.getAll.mockRejectedValue(new Error(errorMessage));

      const { getByText } = render(<TastedBrewList />);

      await waitFor(() => {
        expect(getByText(/Failed to load tasted beers/i)).toBeTruthy();
      });
    });

    it('should show try again button on error', async () => {
      mockMyBeersRepository.getAll.mockRejectedValue(new Error('Error'));

      const { getByText } = render(<TastedBrewList />);

      await waitFor(() => {
        expect(getByText('Try Again')).toBeTruthy();
      });
    });

    it('should recover from error after retry', async () => {
      mockMyBeersRepository.getAll
        .mockRejectedValueOnce(new Error('Initial error'))
        .mockResolvedValue(mockTastedBeers);

      const { getByText } = render(<TastedBrewList />);

      await waitFor(() => {
        expect(getByText(/Failed to load tasted beers/i)).toBeTruthy();
      });

      // Click try again
      const tryAgainButton = getByText('Try Again');
      fireEvent.press(tryAgainButton);

      await waitFor(() => {
        expect(getByText('IPA Test')).toBeTruthy();
        expect(getByText('3 brews tasted')).toBeTruthy();
      });
    });
  });

  describe('Repository Call Patterns', () => {
    it('should call repository methods with correct signatures', async () => {
      render(<TastedBrewList />);

      await waitFor(() => {
        expect(mockMyBeersRepository.getAll).toHaveBeenCalledWith();
        expect(mockMyBeersRepository.getAll).toHaveBeenCalledTimes(1);
      });
    });

    it('should use repository for both initial load and refresh', async () => {
      render(<TastedBrewList />);

      // Initial load
      await waitFor(() => {
        expect(mockMyBeersRepository.getAll).toHaveBeenCalledTimes(1);
      });

      // Trigger refresh
      const useDataRefresh = require('@/hooks/useDataRefresh').useDataRefresh;
      const mockRefreshHandler = useDataRefresh.mock.results[0].value.handleRefresh;
      await mockRefreshHandler();

      await waitFor(() => {
        expect(mockMyBeersRepository.getAll).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Integration with Repository Pattern', () => {
    it('should demonstrate correct migration from db.ts', async () => {
      // This test verifies the migration pattern works correctly

      const db = require('@/src/database/db');
      const spyGetMyBeers = jest.spyOn(db, 'getMyBeers');
      const spyFetchAndPopulate = jest.spyOn(db, 'fetchAndPopulateMyBeers');

      render(<TastedBrewList />);

      await waitFor(() => {
        // Repository pattern is used
        expect(mockMyBeersRepository.getAll).toHaveBeenCalled();

        // Deprecated db.ts functions are NOT used
        expect(spyGetMyBeers).not.toHaveBeenCalled();
        expect(spyFetchAndPopulate).not.toHaveBeenCalled();
      });
    });
  });
});
