import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { TastedBrewList } from '../../components/TastedBrewList';
import { getMyBeers, fetchAndPopulateMyBeers, areApiUrlsConfigured, setPreference } from '@/src/database/db';

// Mock the database module
jest.mock('@/src/database/db', () => ({
  getMyBeers: jest.fn(),
  fetchAndPopulateMyBeers: jest.fn(),
  areApiUrlsConfigured: jest.fn(),
  setPreference: jest.fn(),
}));

// Mock the hooks
jest.mock('@/hooks/useThemeColor', () => ({
  useThemeColor: jest.fn().mockImplementation((props, colorName) => {
    if (colorName === 'background') return '#f5f5f5';
    if (colorName === 'text') return '#000000';
    if (colorName === 'tint') return '#2196F3';
    return '#000000';
  }),
}));

jest.mock('@/hooks/useColorScheme', () => ({
  __esModule: true,
  default: jest.fn().mockReturnValue('light'),
}));

// Mock the navigation hooks
jest.mock('@react-navigation/bottom-tabs', () => ({
  useBottomTabBarHeight: jest.fn().mockReturnValue(50),
}));

// Mock the safe area context
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: jest.fn().mockReturnValue({ top: 0, right: 0, bottom: 0, left: 0 }),
  SafeAreaView: ({ children }) => children,
}));

// Mock the components
jest.mock('@/components/ui/TabBarBackground', () => ({
  useBottomTabOverflow: jest.fn().mockReturnValue(0),
}));

jest.mock('@/components/LoadingIndicator', () => ({
  LoadingIndicator: () => 'LoadingIndicator',
}));

jest.mock('@/components/ThemedText', () => ({
  ThemedText: ({ children, style, type }) => ({ children, style, type, testID: 'themed-text' }),
}));

jest.mock('@/components/ThemedView', () => ({
  ThemedView: ({ children, style }) => ({ children, style, testID: 'themed-view' }),
}));

jest.mock('@/components/ui/IconSymbol', () => ({
  IconSymbol: ({ name, size, color, style }) => ({ name, size, color, style, testID: `icon-${name}` }),
}));

describe('TastedBrewList Integration Tests', () => {
  const mockTastedBeers = [
    {
      id: 'beer-1',
      brew_name: 'Tasted IPA',
      brewer: 'Test Brewery',
      brewer_loc: 'Test Location',
      brew_style: 'IPA',
      brew_container: 'Bottled',
      brew_description: 'A tasted IPA beer',
      tasted_date: '04/01/2023',
    },
    {
      id: 'beer-2',
      brew_name: 'Tasted Stout',
      brewer: 'Another Brewery',
      brewer_loc: 'Another Location',
      brew_style: 'Stout',
      brew_container: 'Draft',
      brew_description: 'A tasted stout beer',
      tasted_date: '05/01/2023',
    },
    {
      id: 'beer-3',
      brew_name: 'Tasted Lager',
      brewer: 'Third Brewery',
      brewer_loc: 'Third Location',
      brew_style: 'Lager',
      brew_container: 'Draft',
      brew_description: 'A tasted lager beer',
      tasted_date: '06/01/2023',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    (getMyBeers as jest.Mock).mockResolvedValue(mockTastedBeers);
    (areApiUrlsConfigured as jest.Mock).mockResolvedValue(true);
    (fetchAndPopulateMyBeers as jest.Mock).mockResolvedValue(true);
  });

  it('should load and display tasted beers on mount', async () => {
    const { findAllByTestId } = render(<TastedBrewList />);

    // Wait for the beers to load
    await waitFor(() => {
      expect(getMyBeers).toHaveBeenCalled();
    });

    // Check that all beers are displayed
    const beerItems = await findAllByTestId('themed-text');
    
    // Find beer names in the rendered text components
    const beerNames = beerItems
      .filter(item => item.children === 'Tasted IPA' || 
                      item.children === 'Tasted Stout' || 
                      item.children === 'Tasted Lager');
    
    expect(beerNames.length).toBeGreaterThan(0);
  });

  it('should search tasted beers by name', async () => {
    const { findByPlaceholderText, findAllByTestId } = render(<TastedBrewList />);

    // Wait for the beers to load
    await waitFor(() => {
      expect(getMyBeers).toHaveBeenCalled();
    });

    // Find the search input and enter text
    const searchInput = await findByPlaceholderText('Search tasted beer...');
    fireEvent.changeText(searchInput, 'IPA');

    // Check that only IPA beers are displayed
    const beerItems = await findAllByTestId('themed-text');
    
    // Count occurrences of each beer name
    const beerNameCounts = beerItems.reduce((counts, item) => {
      if (item.children === 'Tasted IPA') counts.ipa = (counts.ipa || 0) + 1;
      if (item.children === 'Tasted Stout') counts.stout = (counts.stout || 0) + 1;
      if (item.children === 'Tasted Lager') counts.lager = (counts.lager || 0) + 1;
      return counts;
    }, {} as Record<string, number>);
    
    // IPA beers should be displayed, non-IPA beers should not
    expect(beerNameCounts.ipa || 0).toBeGreaterThan(0); // IPA should be shown
    expect(beerNameCounts.stout || 0).toBe(0); // Stout should not be shown
    expect(beerNameCounts.lager || 0).toBe(0); // Lager should not be shown
  });

  it('should search tasted beers by brewery', async () => {
    const { findByPlaceholderText, findAllByTestId } = render(<TastedBrewList />);

    // Wait for the beers to load
    await waitFor(() => {
      expect(getMyBeers).toHaveBeenCalled();
    });

    // Find the search input and enter text
    const searchInput = await findByPlaceholderText('Search tasted beer...');
    fireEvent.changeText(searchInput, 'Another');

    // Check that only beers from "Another Brewery" are displayed
    const beerItems = await findAllByTestId('themed-text');
    
    // Count occurrences of each beer name
    const beerNameCounts = beerItems.reduce((counts, item) => {
      if (item.children === 'Tasted IPA') counts.ipa = (counts.ipa || 0) + 1;
      if (item.children === 'Tasted Stout') counts.stout = (counts.stout || 0) + 1;
      if (item.children === 'Tasted Lager') counts.lager = (counts.lager || 0) + 1;
      return counts;
    }, {} as Record<string, number>);
    
    // Only beers from "Another Brewery" should be displayed
    expect(beerNameCounts.ipa || 0).toBe(0); // IPA should not be shown
    expect(beerNameCounts.stout || 0).toBeGreaterThan(0); // Stout should be shown
    expect(beerNameCounts.lager || 0).toBe(0); // Lager should not be shown
  });

  it('should sort tasted beers by name when sort button is clicked', async () => {
    const { findByText, findAllByTestId } = render(<TastedBrewList />);

    // Wait for the beers to load
    await waitFor(() => {
      expect(getMyBeers).toHaveBeenCalled();
    });

    // Find and click the sort button
    const sortButton = await findByText('Sort by: Name');
    fireEvent.press(sortButton);

    // Check that beers are sorted by name
    const beerItems = await findAllByTestId('themed-text');
    
    // Extract beer names in the order they appear
    const beerNames = beerItems
      .map(item => item.children)
      .filter(name => name === 'Tasted IPA' || name === 'Tasted Stout' || name === 'Tasted Lager');
    
    // Find the indices of each beer name
    const ipaIndex = beerNames.indexOf('Tasted IPA');
    const stoutIndex = beerNames.indexOf('Tasted Stout');
    const lagerIndex = beerNames.indexOf('Tasted Lager');
    
    // Verify they appear in alphabetical order
    // IPA should come before Lager, which should come before Stout
    expect(ipaIndex).toBeLessThan(lagerIndex);
    expect(lagerIndex).toBeLessThan(stoutIndex);
  });

  it('should refresh tasted beers when pull-to-refresh is triggered', async () => {
    const { getByTestId } = render(<TastedBrewList />);

    // Wait for the beers to load
    await waitFor(() => {
      expect(getMyBeers).toHaveBeenCalled();
    });

    // Mock the fetchAndPopulateMyBeers function
    (fetchAndPopulateMyBeers as jest.Mock).mockResolvedValue(true);
    (getMyBeers as jest.Mock).mockResolvedValue([...mockTastedBeers, {
      id: 'beer-4',
      brew_name: 'New Tasted Beer',
      brewer: 'New Brewery',
      brew_style: 'Pilsner',
      tasted_date: '07/01/2023',
    }]);

    // Trigger the refresh
    const flatList = getByTestId('flat-list');
    fireEvent(flatList, 'refresh');

    // Check that the refresh functions were called
    await waitFor(() => {
      expect(setPreference).toHaveBeenCalledWith('my_beers_last_update', '');
      expect(setPreference).toHaveBeenCalledWith('my_beers_last_check', '');
      expect(fetchAndPopulateMyBeers).toHaveBeenCalled();
      expect(getMyBeers).toHaveBeenCalled();
    });
  });

  it('should show empty state when no tasted beers are found', async () => {
    // Mock the getMyBeers function to return an empty array
    (getMyBeers as jest.Mock).mockResolvedValue([]);

    const { findByText } = render(<TastedBrewList />);

    // Check that the empty state message is displayed
    const emptyMessage = await findByText('No tasted beer found. Please check your connection and try again.');
    expect(emptyMessage).toBeTruthy();
  });

  it('should show empty state with search message when search has no results', async () => {
    const { findByPlaceholderText, findByText } = render(<TastedBrewList />);

    // Wait for the beers to load
    await waitFor(() => {
      expect(getMyBeers).toHaveBeenCalled();
    });

    // Find the search input and enter text that won't match any beers
    const searchInput = await findByPlaceholderText('Search tasted beer...');
    fireEvent.changeText(searchInput, 'NonExistentBeer');

    // Check that the empty state message for search is displayed
    const emptyMessage = await findByText('No tasted beer matches your search criteria.');
    expect(emptyMessage).toBeTruthy();
  });

  it('should show error state when loading tasted beers fails', async () => {
    // Mock the getMyBeers function to throw an error
    (getMyBeers as jest.Mock).mockRejectedValue(new Error('Failed to load tasted beers'));

    const { findByText } = render(<TastedBrewList />);

    // Check that the error message is displayed
    const errorMessage = await findByText('Failed to load tasted beers. Please check your internet connection and try again.');
    expect(errorMessage).toBeTruthy();

    // Check that the Retry button is displayed
    const retryButton = await findByText('Retry');
    expect(retryButton).toBeTruthy();
  });

  it('should retry loading tasted beers when Retry button is clicked', async () => {
    // Mock the getMyBeers function to throw an error on first call
    (getMyBeers as jest.Mock)
      .mockRejectedValueOnce(new Error('Failed to load tasted beers'))
      .mockResolvedValueOnce(mockTastedBeers);

    const { findByText } = render(<TastedBrewList />);

    // Wait for the error state to be displayed
    const errorMessage = await findByText('Failed to load tasted beers. Please check your internet connection and try again.');
    expect(errorMessage).toBeTruthy();

    // Find and click the Retry button
    const retryButton = await findByText('Retry');
    fireEvent.press(retryButton);

    // Check that getMyBeers was called again
    await waitFor(() => {
      expect(getMyBeers).toHaveBeenCalledTimes(2);
    });
  });
});
