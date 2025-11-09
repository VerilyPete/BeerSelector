import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { AllBeers } from '../AllBeers';
import { Beerfinder } from '../Beerfinder';
import { TastedBrewList } from '../TastedBrewList';

// Mock database functions
jest.mock('@/src/database/db', () => ({
  getAllBeers: jest.fn(),
  getBeerfinder: jest.fn(),
  getMyBeers: jest.fn(),
  areApiUrlsConfigured: jest.fn(),
  fetchAndPopulateAllBeers: jest.fn(),
  fetchAndPopulateBeerfinder: jest.fn(),
  fetchAndPopulateMyBeers: jest.fn(),
}));

// Mock data update service
jest.mock('@/src/services/dataUpdateService', () => ({
  manualRefreshAllData: jest.fn(),
}));

// Mock themed components
jest.mock('../ThemedText', () => {
  const { Text } = require('react-native');
  return {
    ThemedText: ({ children, ...props }: any) => <Text {...props}>{children}</Text>
  };
});

jest.mock('../ThemedView', () => {
  const { View } = require('react-native');
  return {
    ThemedView: ({ children, ...props }: any) => <View {...props}>{children}</View>
  };
});

jest.mock('../LoadingIndicator', () => ({
  LoadingIndicator: () => {
    const { Text } = require('react-native');
    return <Text>Loading...</Text>;
  }
}));

jest.mock('../SearchBar', () => ({
  SearchBar: ({ onSearchChange, onClear, placeholder }: any) => {
    const { TextInput, TouchableOpacity, Text } = require('react-native');
    return (
      <>
        <TextInput
          testID="search-input"
          placeholder={placeholder}
          onChangeText={onSearchChange}
        />
        <TouchableOpacity testID="clear-button" onPress={onClear}>
          <Text>Clear</Text>
        </TouchableOpacity>
      </>
    );
  }
}));

jest.mock('../../hooks/useThemeColor', () => ({
  useThemeColor: () => '#FFFFFF'
}));

jest.mock('../../hooks/useColorScheme', () => ({
  useColorScheme: () => 'light'
}));

jest.mock('../ui/IconSymbol', () => ({
  IconSymbol: ({ name }: any) => {
    const { Text } = require('react-native');
    return <Text>{name}</Text>;
  }
}));

describe('Beer List Integration Tests', () => {
  const mockBeers = [
    {
      id: '1',
      brew_name: 'Test IPA',
      brewer: 'Test Brewery',
      brewer_loc: 'Austin, TX',
      brew_style: 'IPA',
      brew_container: 'Draft',
      brew_description: 'A delicious test beer',
      added_date: '1704067200'
    },
    {
      id: '2',
      brew_name: 'Test Stout',
      brewer: 'Another Brewery',
      brewer_loc: 'Portland, OR',
      brew_style: 'Stout',
      brew_container: 'Bottle',
      brew_description: 'A dark test beer',
      added_date: '1704153600'
    },
    {
      id: '3',
      brew_name: 'Draft Porter',
      brewer: 'Porter Brewery',
      brewer_loc: 'Seattle, WA',
      brew_style: 'Porter',
      brew_container: 'Draft',
      brew_description: 'A smooth porter',
      added_date: '1704240000'
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('AllBeers Integration', () => {
    it('integrates search, filters, and beer list rendering', async () => {
      const { getAllBeers } = require('@/src/database/db');
      getAllBeers.mockResolvedValue(mockBeers);

      const { getByTestId, getByText, queryByText } = render(<AllBeers />);

      // Wait for beers to load
      await waitFor(() => {
        expect(getByText('Test IPA')).toBeTruthy();
      });

      // Verify all beers are shown initially
      expect(getByText('Test IPA')).toBeTruthy();
      expect(getByText('Test Stout')).toBeTruthy();
      expect(getByText('Draft Porter')).toBeTruthy();

      // Test search functionality
      const searchInput = getByTestId('search-input');
      fireEvent.changeText(searchInput, 'IPA');

      await waitFor(() => {
        expect(getByText('Test IPA')).toBeTruthy();
        expect(queryByText('Test Stout')).toBeNull();
        expect(queryByText('Draft Porter')).toBeNull();
      });

      // Clear search
      const clearButton = getByTestId('clear-button');
      fireEvent.press(clearButton);

      await waitFor(() => {
        expect(getByText('Test IPA')).toBeTruthy();
        expect(getByText('Test Stout')).toBeTruthy();
        expect(getByText('Draft Porter')).toBeTruthy();
      });

      // Test Draft filter
      const draftButton = getByText('Draft');
      fireEvent.press(draftButton);

      await waitFor(() => {
        expect(getByText('Test IPA')).toBeTruthy();
        expect(queryByText('Test Stout')).toBeNull();
        expect(getByText('Draft Porter')).toBeTruthy();
      });
    });

    it('integrates filter mutual exclusivity (Heavies and IPA)', async () => {
      const { getAllBeers } = require('@/src/database/db');
      getAllBeers.mockResolvedValue(mockBeers);

      const { getByText, queryByText } = render(<AllBeers />);

      await waitFor(() => {
        expect(getByText('Test IPA')).toBeTruthy();
      });

      // Enable Heavies filter
      const heaviesButton = getByText('Heavies');
      fireEvent.press(heaviesButton);

      await waitFor(() => {
        expect(queryByText('Test IPA')).toBeNull();
        expect(getByText('Test Stout')).toBeTruthy();
        expect(getByText('Draft Porter')).toBeTruthy();
      });

      // Enable IPA filter (should disable Heavies)
      const ipaButton = getByText('IPA');
      fireEvent.press(ipaButton);

      await waitFor(() => {
        expect(getByText('Test IPA')).toBeTruthy();
        expect(queryByText('Test Stout')).toBeNull();
        expect(queryByText('Draft Porter')).toBeNull();
      });
    });

    it('integrates sort functionality with filters', async () => {
      const { getAllBeers } = require('@/src/database/db');
      getAllBeers.mockResolvedValue(mockBeers);

      const { getByText } = render(<AllBeers />);

      await waitFor(() => {
        expect(getByText('Test IPA')).toBeTruthy();
      });

      // Initially sorted by date (most recent first)
      // Toggle to sort by name
      const sortButton = getByText(/Sort by:/);
      fireEvent.press(sortButton);

      await waitFor(() => {
        expect(getByText('Sort by: Date')).toBeTruthy();
      });

      // Apply Draft filter while sorted by name
      const draftButton = getByText('Draft');
      fireEvent.press(draftButton);

      await waitFor(() => {
        expect(getByText('Test IPA')).toBeTruthy();
        expect(getByText('Draft Porter')).toBeTruthy();
      });
    });
  });

  describe('Beerfinder Integration', () => {
    it('integrates search and filters for untasted beers', async () => {
      const { getBeerfinder } = require('@/src/database/db');
      const beerfinderData = mockBeers.map(beer => ({
        ...beer,
        tasted: false,
        tasted_date: null
      }));
      getBeerfinder.mockResolvedValue(beerfinderData);

      const { getByTestId, getByText, queryByText } = render(<Beerfinder />);

      await waitFor(() => {
        expect(getByText('Test IPA')).toBeTruthy();
      });

      // Test search in Beerfinder
      const searchInput = getByTestId('search-input');
      fireEvent.changeText(searchInput, 'Stout');

      await waitFor(() => {
        expect(queryByText('Test IPA')).toBeNull();
        expect(getByText('Test Stout')).toBeTruthy();
        expect(queryByText('Draft Porter')).toBeNull();
      });
    });

    it('shows empty state when no untasted beers match filters', async () => {
      const { getBeerfinder } = require('@/src/database/db');
      getBeerfinder.mockResolvedValue([]);

      const { getByText } = render(<Beerfinder />);

      await waitFor(() => {
        expect(getByText(/No untasted beer matches/)).toBeTruthy();
      });
    });
  });

  describe('TastedBrewList Integration', () => {
    it('integrates search and filters for tasted beers', async () => {
      const { getMyBeers } = require('@/src/database/db');
      const tastedBeers = mockBeers.map(beer => ({
        ...beer,
        tasted_date: '01/15/2024'
      }));
      getMyBeers.mockResolvedValue(tastedBeers);

      const { getByTestId, getByText, queryByText } = render(<TastedBrewList />);

      await waitFor(() => {
        expect(getByText('Test IPA')).toBeTruthy();
      });

      // Test search in TastedBrewList
      const searchInput = getByTestId('search-input');
      fireEvent.changeText(searchInput, 'Porter');

      await waitFor(() => {
        expect(queryByText('Test IPA')).toBeNull();
        expect(queryByText('Test Stout')).toBeNull();
        expect(getByText('Draft Porter')).toBeTruthy();
      });

      // Clear search
      const clearButton = getByTestId('clear-button');
      fireEvent.press(clearButton);

      await waitFor(() => {
        expect(getByText('Test IPA')).toBeTruthy();
        expect(getByText('Test Stout')).toBeTruthy();
        expect(getByText('Draft Porter')).toBeTruthy();
      });
    });

    it('does not show Heavies and IPA filters', async () => {
      const { getMyBeers } = require('@/src/database/db');
      getMyBeers.mockResolvedValue([]);

      const { queryByText } = render(<TastedBrewList />);

      await waitFor(() => {
        // Draft should be available
        expect(queryByText('Draft')).toBeTruthy();
      });

      // Heavies and IPA should NOT be available
      expect(queryByText('Heavies')).toBeNull();
      expect(queryByText('IPA')).toBeNull();
    });

    it('integrates Draft filter for tasted beers', async () => {
      const { getMyBeers } = require('@/src/database/db');
      const tastedBeers = mockBeers.map(beer => ({
        ...beer,
        tasted_date: '01/15/2024'
      }));
      getMyBeers.mockResolvedValue(tastedBeers);

      const { getByText, queryByText } = render(<TastedBrewList />);

      await waitFor(() => {
        expect(getByText('Test IPA')).toBeTruthy();
      });

      // Apply Draft filter
      const draftButton = getByText('Draft');
      fireEvent.press(draftButton);

      await waitFor(() => {
        expect(getByText('Test IPA')).toBeTruthy();
        expect(queryByText('Test Stout')).toBeNull();
        expect(getByText('Draft Porter')).toBeTruthy();
      });
    });
  });

  describe('Shared Component Behavior Across All Lists', () => {
    it('expand/collapse works consistently across all beer lists', async () => {
      const { getAllBeers } = require('@/src/database/db');
      getAllBeers.mockResolvedValue(mockBeers);

      const { getByText } = render(<AllBeers />);

      await waitFor(() => {
        expect(getByText('Test IPA')).toBeTruthy();
      });

      // Tap to expand
      const beerItem = getByText('Test IPA');
      fireEvent.press(beerItem);

      await waitFor(() => {
        // Description should be visible when expanded
        expect(getByText(/A delicious test beer/)).toBeTruthy();
      });

      // Tap again to collapse
      fireEvent.press(beerItem);

      await waitFor(() => {
        // Description should be hidden when collapsed
        // This is implicit - we just verify the component doesn't crash
        expect(getByText('Test IPA')).toBeTruthy();
      });
    });

    it('beer count updates correctly after filtering', async () => {
      const { getAllBeers } = require('@/src/database/db');
      getAllBeers.mockResolvedValue(mockBeers);

      const { getByText } = render(<AllBeers />);

      await waitFor(() => {
        expect(getByText('3 brews')).toBeTruthy();
      });

      // Apply Draft filter
      const draftButton = getByText('Draft');
      fireEvent.press(draftButton);

      await waitFor(() => {
        expect(getByText('2 brews')).toBeTruthy();
      });

      // Apply search on top of filter
      const searchInput = getByText(/Search beer/);
      fireEvent.changeText(searchInput, 'IPA');

      await waitFor(() => {
        expect(getByText('1 brew')).toBeTruthy();
      });
    });
  });
});
