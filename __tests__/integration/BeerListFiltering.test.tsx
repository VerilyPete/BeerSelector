import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { AllBeers } from '../../components/AllBeers';
import { getAllBeers, refreshBeersFromAPI, areApiUrlsConfigured, setPreference } from '@/src/database/db';

// Mock the database module
jest.mock('@/src/database/db', () => ({
  getAllBeers: jest.fn(),
  refreshBeersFromAPI: jest.fn(),
  areApiUrlsConfigured: jest.fn(),
  setPreference: jest.fn(),
  getMyBeers: jest.fn(),
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

jest.mock('@/components/UntappdWebView', () => ({
  UntappdWebView: ({ visible, onClose, beerName }) => (
    <div data-testid="untappd-webview" data-visible={visible} data-beer-name={beerName} />
  ),
}));

describe('AllBeers Integration Tests', () => {
  const mockBeers = [
    {
      id: 'beer-1',
      brew_name: 'Test IPA',
      brewer: 'Test Brewery',
      brewer_loc: 'Test Location',
      brew_style: 'IPA',
      brew_container: 'Bottled',
      brew_description: 'A test IPA beer',
      added_date: '1617235200', // April 1, 2021
    },
    {
      id: 'beer-2',
      brew_name: 'Test Stout',
      brewer: 'Another Brewery',
      brewer_loc: 'Another Location',
      brew_style: 'Stout',
      brew_container: 'Draft',
      brew_description: 'A test stout beer',
      added_date: '1619827200', // May 1, 2021
    },
    {
      id: 'beer-3',
      brew_name: 'Test Lager',
      brewer: 'Third Brewery',
      brewer_loc: 'Third Location',
      brew_style: 'Lager',
      brew_container: 'Draft',
      brew_description: 'A test lager beer',
      added_date: '1622505600', // June 1, 2021
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    (getAllBeers as jest.Mock).mockResolvedValue(mockBeers);
    (areApiUrlsConfigured as jest.Mock).mockResolvedValue(true);
  });

  it('should load and display beers on mount', async () => {
    const { findAllByTestId } = render(<AllBeers />);

    // Wait for the beers to load
    await waitFor(() => {
      expect(getAllBeers).toHaveBeenCalled();
    });

    // Check that all beers are displayed
    const beerItems = await findAllByTestId('themed-text');
    
    // Find beer names in the rendered text components
    const beerNames = beerItems
      .filter(item => item.children === 'Test IPA' || 
                      item.children === 'Test Stout' || 
                      item.children === 'Test Lager');
    
    expect(beerNames.length).toBeGreaterThan(0);
  });

  it('should filter beers by draft container', async () => {
    const { findByText, findAllByTestId } = render(<AllBeers />);

    // Wait for the beers to load
    await waitFor(() => {
      expect(getAllBeers).toHaveBeenCalled();
    });

    // Find and click the Draft filter button
    const draftButton = await findByText('Draft');
    fireEvent.press(draftButton);

    // Check that only draft beers are displayed
    const beerItems = await findAllByTestId('themed-text');
    
    // Count occurrences of each beer name
    const beerNameCounts = beerItems.reduce((counts, item) => {
      if (item.children === 'Test IPA') counts.ipa = (counts.ipa || 0) + 1;
      if (item.children === 'Test Stout') counts.stout = (counts.stout || 0) + 1;
      if (item.children === 'Test Lager') counts.lager = (counts.lager || 0) + 1;
      return counts;
    }, {} as Record<string, number>);
    
    // Draft beers should be displayed, non-draft beers should not
    expect(beerNameCounts.ipa || 0).toBe(0); // IPA is bottled, should not be shown
    expect(beerNameCounts.stout || 0).toBeGreaterThan(0); // Stout is draft, should be shown
    expect(beerNameCounts.lager || 0).toBeGreaterThan(0); // Lager is draft, should be shown
  });

  it('should filter beers by IPA style', async () => {
    const { findByText, findAllByTestId } = render(<AllBeers />);

    // Wait for the beers to load
    await waitFor(() => {
      expect(getAllBeers).toHaveBeenCalled();
    });

    // Find and click the IPA filter button
    const ipaButton = await findByText('IPA');
    fireEvent.press(ipaButton);

    // Check that only IPA beers are displayed
    const beerItems = await findAllByTestId('themed-text');
    
    // Count occurrences of each beer name
    const beerNameCounts = beerItems.reduce((counts, item) => {
      if (item.children === 'Test IPA') counts.ipa = (counts.ipa || 0) + 1;
      if (item.children === 'Test Stout') counts.stout = (counts.stout || 0) + 1;
      if (item.children === 'Test Lager') counts.lager = (counts.lager || 0) + 1;
      return counts;
    }, {} as Record<string, number>);
    
    // IPA beers should be displayed, non-IPA beers should not
    expect(beerNameCounts.ipa || 0).toBeGreaterThan(0); // IPA should be shown
    expect(beerNameCounts.stout || 0).toBe(0); // Stout should not be shown
    expect(beerNameCounts.lager || 0).toBe(0); // Lager should not be shown
  });

  it('should filter beers by Heavies style', async () => {
    const { findByText, findAllByTestId } = render(<AllBeers />);

    // Wait for the beers to load
    await waitFor(() => {
      expect(getAllBeers).toHaveBeenCalled();
    });

    // Find and click the Heavies filter button
    const heaviesButton = await findByText('Heavies');
    fireEvent.press(heaviesButton);

    // Check that only Heavies beers (stouts, porters) are displayed
    const beerItems = await findAllByTestId('themed-text');
    
    // Count occurrences of each beer name
    const beerNameCounts = beerItems.reduce((counts, item) => {
      if (item.children === 'Test IPA') counts.ipa = (counts.ipa || 0) + 1;
      if (item.children === 'Test Stout') counts.stout = (counts.stout || 0) + 1;
      if (item.children === 'Test Lager') counts.lager = (counts.lager || 0) + 1;
      return counts;
    }, {} as Record<string, number>);
    
    // Stout beers should be displayed, non-stout beers should not
    expect(beerNameCounts.ipa || 0).toBe(0); // IPA should not be shown
    expect(beerNameCounts.stout || 0).toBeGreaterThan(0); // Stout should be shown
    expect(beerNameCounts.lager || 0).toBe(0); // Lager should not be shown
  });

  it('should sort beers by name when sort button is clicked', async () => {
    const { findByText, findAllByTestId } = render(<AllBeers />);

    // Wait for the beers to load
    await waitFor(() => {
      expect(getAllBeers).toHaveBeenCalled();
    });

    // Find and click the sort button
    const sortButton = await findByText('Sort by: Name');
    fireEvent.press(sortButton);

    // Check that beers are sorted by name
    const beerItems = await findAllByTestId('themed-text');
    
    // Extract beer names in the order they appear
    const beerNames = beerItems
      .map(item => item.children)
      .filter(name => name === 'Test IPA' || name === 'Test Stout' || name === 'Test Lager');
    
    // Find the indices of each beer name
    const ipaIndex = beerNames.indexOf('Test IPA');
    const stoutIndex = beerNames.indexOf('Test Stout');
    const lagerIndex = beerNames.indexOf('Test Lager');
    
    // Verify they appear in alphabetical order
    // IPA should come before Lager, which should come before Stout
    expect(ipaIndex).toBeLessThan(lagerIndex);
    expect(lagerIndex).toBeLessThan(stoutIndex);
  });

  it('should refresh beers when pull-to-refresh is triggered', async () => {
    const { getByTestId } = render(<AllBeers />);

    // Wait for the beers to load
    await waitFor(() => {
      expect(getAllBeers).toHaveBeenCalled();
    });

    // Mock the refreshBeersFromAPI function
    (refreshBeersFromAPI as jest.Mock).mockResolvedValue(true);
    (getAllBeers as jest.Mock).mockResolvedValue([...mockBeers, {
      id: 'beer-4',
      brew_name: 'New Beer',
      brewer: 'New Brewery',
      brew_style: 'Pilsner',
      added_date: '1625097600', // July 1, 2021
    }]);

    // Trigger the refresh
    const flatList = getByTestId('flat-list');
    fireEvent(flatList, 'refresh');

    // Check that the refresh functions were called
    await waitFor(() => {
      expect(setPreference).toHaveBeenCalledWith('all_beers_last_update', '');
      expect(setPreference).toHaveBeenCalledWith('all_beers_last_check', '');
      expect(refreshBeersFromAPI).toHaveBeenCalled();
      expect(getAllBeers).toHaveBeenCalled();
    });
  });

  it('should show error state when loading beers fails', async () => {
    // Mock the getAllBeers function to throw an error
    (getAllBeers as jest.Mock).mockRejectedValue(new Error('Failed to load beers'));

    const { findByText } = render(<AllBeers />);

    // Check that the error message is displayed
    const errorMessage = await findByText('Failed to load beers. Please try again later.');
    expect(errorMessage).toBeTruthy();

    // Check that the Try Again button is displayed
    const tryAgainButton = await findByText('Try Again');
    expect(tryAgainButton).toBeTruthy();
  });

  it('should retry loading beers when Try Again button is clicked', async () => {
    // Mock the getAllBeers function to throw an error on first call
    (getAllBeers as jest.Mock)
      .mockRejectedValueOnce(new Error('Failed to load beers'))
      .mockResolvedValueOnce(mockBeers);

    const { findByText } = render(<AllBeers />);

    // Wait for the error state to be displayed
    const errorMessage = await findByText('Failed to load beers. Please try again later.');
    expect(errorMessage).toBeTruthy();

    // Find and click the Try Again button
    const tryAgainButton = await findByText('Try Again');
    fireEvent.press(tryAgainButton);

    // Check that getAllBeers was called again
    await waitFor(() => {
      expect(getAllBeers).toHaveBeenCalledTimes(2);
    });
  });
});
