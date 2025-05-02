import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Beerfinder } from '../../components/Beerfinder';
import { 
  getBeersNotInMyBeers, 
  fetchAndPopulateMyBeers, 
  areApiUrlsConfigured, 
  setPreference 
} from '@/src/database/db';
import { checkInBeer } from '@/src/api/beerService';
import { getSessionData } from '@/src/api/sessionManager';

// Mock the database module
jest.mock('@/src/database/db', () => ({
  getBeersNotInMyBeers: jest.fn(),
  fetchAndPopulateMyBeers: jest.fn(),
  areApiUrlsConfigured: jest.fn(),
  setPreference: jest.fn(),
}));

// Mock the API services
jest.mock('@/src/api/beerService', () => ({
  checkInBeer: jest.fn(),
}));

jest.mock('@/src/api/sessionManager', () => ({
  getSessionData: jest.fn(),
}));

// Mock the router
jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
  },
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

// Mock Alert
jest.mock('react-native', () => {
  const rn = jest.requireActual('react-native');
  return {
    ...rn,
    Alert: {
      alert: jest.fn(),
    },
  };
});

describe('Beerfinder Integration Tests', () => {
  const mockAvailableBeers = [
    {
      id: 'beer-1',
      brew_name: 'Available IPA',
      brewer: 'Test Brewery',
      brewer_loc: 'Test Location',
      brew_style: 'IPA',
      brew_container: 'Bottled',
      brew_description: 'An available IPA beer',
      added_date: '1617235200', // April 1, 2021
    },
    {
      id: 'beer-2',
      brew_name: 'Available Stout',
      brewer: 'Another Brewery',
      brewer_loc: 'Another Location',
      brew_style: 'Stout',
      brew_container: 'Draft',
      brew_description: 'An available stout beer',
      added_date: '1619827200', // May 1, 2021
    },
    {
      id: 'beer-3',
      brew_name: 'Available Lager',
      brewer: 'Third Brewery',
      brewer_loc: 'Third Location',
      brew_style: 'Lager',
      brew_container: 'Draft',
      brew_description: 'An available lager beer',
      added_date: '1622505600', // June 1, 2021
    },
  ];

  const mockSessionData = {
    memberId: 'test-member-id',
    storeId: 'test-store-id',
    storeName: 'Test Store',
    sessionId: 'test-session-id',
    username: 'testuser',
    firstName: 'Test',
    lastName: 'User',
    email: 'test@example.com',
    cardNum: '12345',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getBeersNotInMyBeers as jest.Mock).mockResolvedValue(mockAvailableBeers);
    (areApiUrlsConfigured as jest.Mock).mockResolvedValue(true);
    (fetchAndPopulateMyBeers as jest.Mock).mockResolvedValue(true);
    (getSessionData as jest.Mock).mockResolvedValue(mockSessionData);
    (checkInBeer as jest.Mock).mockResolvedValue({ success: true, message: 'Check-in successful' });
  });

  it('should load and display available beers on mount', async () => {
    const { findAllByTestId } = render(<Beerfinder />);

    // Wait for the beers to load
    await waitFor(() => {
      expect(getBeersNotInMyBeers).toHaveBeenCalled();
    });

    // Check that all beers are displayed
    const beerItems = await findAllByTestId('themed-text');
    
    // Find beer names in the rendered text components
    const beerNames = beerItems
      .filter(item => item.children === 'Available IPA' || 
                      item.children === 'Available Stout' || 
                      item.children === 'Available Lager');
    
    expect(beerNames.length).toBeGreaterThan(0);
  });

  it('should filter available beers by draft container', async () => {
    const { findByText, findAllByTestId } = render(<Beerfinder />);

    // Wait for the beers to load
    await waitFor(() => {
      expect(getBeersNotInMyBeers).toHaveBeenCalled();
    });

    // Find and click the Draft filter button
    const draftButton = await findByText('Draft');
    fireEvent.press(draftButton);

    // Check that only draft beers are displayed
    const beerItems = await findAllByTestId('themed-text');
    
    // Count occurrences of each beer name
    const beerNameCounts = beerItems.reduce((counts, item) => {
      if (item.children === 'Available IPA') counts.ipa = (counts.ipa || 0) + 1;
      if (item.children === 'Available Stout') counts.stout = (counts.stout || 0) + 1;
      if (item.children === 'Available Lager') counts.lager = (counts.lager || 0) + 1;
      return counts;
    }, {} as Record<string, number>);
    
    // Draft beers should be displayed, non-draft beers should not
    expect(beerNameCounts.ipa || 0).toBe(0); // IPA is bottled, should not be shown
    expect(beerNameCounts.stout || 0).toBeGreaterThan(0); // Stout is draft, should be shown
    expect(beerNameCounts.lager || 0).toBeGreaterThan(0); // Lager is draft, should be shown
  });

  it('should filter available beers by IPA style', async () => {
    const { findByText, findAllByTestId } = render(<Beerfinder />);

    // Wait for the beers to load
    await waitFor(() => {
      expect(getBeersNotInMyBeers).toHaveBeenCalled();
    });

    // Find and click the IPA filter button
    const ipaButton = await findByText('IPA');
    fireEvent.press(ipaButton);

    // Check that only IPA beers are displayed
    const beerItems = await findAllByTestId('themed-text');
    
    // Count occurrences of each beer name
    const beerNameCounts = beerItems.reduce((counts, item) => {
      if (item.children === 'Available IPA') counts.ipa = (counts.ipa || 0) + 1;
      if (item.children === 'Available Stout') counts.stout = (counts.stout || 0) + 1;
      if (item.children === 'Available Lager') counts.lager = (counts.lager || 0) + 1;
      return counts;
    }, {} as Record<string, number>);
    
    // IPA beers should be displayed, non-IPA beers should not
    expect(beerNameCounts.ipa || 0).toBeGreaterThan(0); // IPA should be shown
    expect(beerNameCounts.stout || 0).toBe(0); // Stout should not be shown
    expect(beerNameCounts.lager || 0).toBe(0); // Lager should not be shown
  });

  it('should search available beers by name', async () => {
    const { findByPlaceholderText, findAllByTestId } = render(<Beerfinder />);

    // Wait for the beers to load
    await waitFor(() => {
      expect(getBeersNotInMyBeers).toHaveBeenCalled();
    });

    // Find the search input and enter text
    const searchInput = await findByPlaceholderText('Search available beer...');
    fireEvent.changeText(searchInput, 'IPA');

    // Check that only IPA beers are displayed
    const beerItems = await findAllByTestId('themed-text');
    
    // Count occurrences of each beer name
    const beerNameCounts = beerItems.reduce((counts, item) => {
      if (item.children === 'Available IPA') counts.ipa = (counts.ipa || 0) + 1;
      if (item.children === 'Available Stout') counts.stout = (counts.stout || 0) + 1;
      if (item.children === 'Available Lager') counts.lager = (counts.lager || 0) + 1;
      return counts;
    }, {} as Record<string, number>);
    
    // IPA beers should be displayed, non-IPA beers should not
    expect(beerNameCounts.ipa || 0).toBeGreaterThan(0); // IPA should be shown
    expect(beerNameCounts.stout || 0).toBe(0); // Stout should not be shown
    expect(beerNameCounts.lager || 0).toBe(0); // Lager should not be shown
  });

  it('should sort available beers by name when sort button is clicked', async () => {
    const { findByText, findAllByTestId } = render(<Beerfinder />);

    // Wait for the beers to load
    await waitFor(() => {
      expect(getBeersNotInMyBeers).toHaveBeenCalled();
    });

    // Find and click the sort button
    const sortButton = await findByText('Sort by: Name');
    fireEvent.press(sortButton);

    // Check that beers are sorted by name
    const beerItems = await findAllByTestId('themed-text');
    
    // Extract beer names in the order they appear
    const beerNames = beerItems
      .map(item => item.children)
      .filter(name => name === 'Available IPA' || name === 'Available Stout' || name === 'Available Lager');
    
    // Find the indices of each beer name
    const ipaIndex = beerNames.indexOf('Available IPA');
    const stoutIndex = beerNames.indexOf('Available Stout');
    const lagerIndex = beerNames.indexOf('Available Lager');
    
    // Verify they appear in alphabetical order
    // IPA should come before Lager, which should come before Stout
    expect(ipaIndex).toBeLessThan(lagerIndex);
    expect(lagerIndex).toBeLessThan(stoutIndex);
  });

  it('should refresh available beers when pull-to-refresh is triggered', async () => {
    const { getByTestId } = render(<Beerfinder />);

    // Wait for the beers to load
    await waitFor(() => {
      expect(getBeersNotInMyBeers).toHaveBeenCalled();
    });

    // Mock the fetchAndPopulateMyBeers function
    (fetchAndPopulateMyBeers as jest.Mock).mockResolvedValue(true);
    (getBeersNotInMyBeers as jest.Mock).mockResolvedValue([...mockAvailableBeers, {
      id: 'beer-4',
      brew_name: 'New Available Beer',
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
      expect(setPreference).toHaveBeenCalledWith('my_beers_last_update', '');
      expect(setPreference).toHaveBeenCalledWith('my_beers_last_check', '');
      expect(fetchAndPopulateMyBeers).toHaveBeenCalled();
      expect(getBeersNotInMyBeers).toHaveBeenCalled();
    });
  });

  it('should show empty state when no available beers are found', async () => {
    // Mock the getBeersNotInMyBeers function to return an empty array
    (getBeersNotInMyBeers as jest.Mock).mockResolvedValue([]);

    const { findByText } = render(<Beerfinder />);

    // Check that the empty state message is displayed
    const emptyMessage = await findByText('No beer found');
    expect(emptyMessage).toBeTruthy();
  });

  it('should show error state when loading available beers fails', async () => {
    // Mock the getBeersNotInMyBeers function to throw an error
    (getBeersNotInMyBeers as jest.Mock).mockRejectedValue(new Error('Failed to load beers'));

    const { findByText } = render(<Beerfinder />);

    // Check that the error message is displayed
    const errorMessage = await findByText('Failed to load beers. Please check your internet connection and try again.');
    expect(errorMessage).toBeTruthy();

    // Check that the Try Again button is displayed
    const tryAgainButton = await findByText('Try Again');
    expect(tryAgainButton).toBeTruthy();
  });

  it('should retry loading available beers when Try Again button is clicked', async () => {
    // Mock the getBeersNotInMyBeers function to throw an error on first call
    (getBeersNotInMyBeers as jest.Mock)
      .mockRejectedValueOnce(new Error('Failed to load beers'))
      .mockResolvedValueOnce(mockAvailableBeers);

    const { findByText } = render(<Beerfinder />);

    // Wait for the error state to be displayed
    const errorMessage = await findByText('Failed to load beers. Please check your internet connection and try again.');
    expect(errorMessage).toBeTruthy();

    // Find and click the Try Again button
    const tryAgainButton = await findByText('Try Again');
    fireEvent.press(tryAgainButton);

    // Check that getBeersNotInMyBeers was called again
    await waitFor(() => {
      expect(getBeersNotInMyBeers).toHaveBeenCalledTimes(2);
    });
  });

  it('should check in a beer when Check Me In button is clicked', async () => {
    const { findByText, findAllByText } = render(<Beerfinder />);

    // Wait for the beers to load
    await waitFor(() => {
      expect(getBeersNotInMyBeers).toHaveBeenCalled();
    });

    // Find and click on a beer to expand it
    const beerName = await findByText('Available IPA');
    fireEvent.press(beerName);

    // Find and click the Check Me In button
    const checkInButtons = await findAllByText('Check Me In!');
    fireEvent.press(checkInButtons[0]);

    // Check that checkInBeer was called with the correct beer
    await waitFor(() => {
      expect(checkInBeer).toHaveBeenCalledWith(expect.objectContaining({
        id: 'beer-1',
        brew_name: 'Available IPA',
      }));
    });
  });

  it('should open Untappd webview when Check Untappd button is clicked', async () => {
    const { findByText, findAllByText, getByTestId } = render(<Beerfinder />);

    // Wait for the beers to load
    await waitFor(() => {
      expect(getBeersNotInMyBeers).toHaveBeenCalled();
    });

    // Find and click on a beer to expand it
    const beerName = await findByText('Available IPA');
    fireEvent.press(beerName);

    // Find and click the Check Untappd button
    const untappdButtons = await findAllByText('Check Untappd');
    fireEvent.press(untappdButtons[0]);

    // Check that the Untappd webview is opened with the correct beer name
    const untappdWebview = getByTestId('untappd-webview');
    expect(untappdWebview).toBeTruthy();
    expect(untappdWebview.props['data-beer-name']).toBe('Available IPA');
    expect(untappdWebview.props['data-visible']).toBe(true);
  });
});
