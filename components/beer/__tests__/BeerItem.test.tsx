import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import { BeerItem } from '../BeerItem';

// Mock theme hooks before importing component
jest.mock('@/hooks/useColorScheme', () => ({
  useColorScheme: jest.fn(() => 'light'),
}));

jest.mock('@/hooks/useThemeColor', () => ({
  useThemeColor: jest.fn(() => '#000000'),
}));

// Mock ThemedText and ThemedView to use plain React Native components
jest.mock('@/components/ThemedText');
jest.mock('@/components/ThemedView');

// Use real timers for this test suite to avoid hanging
beforeAll(() => {
  jest.useRealTimers();
});

afterAll(() => {
  jest.useFakeTimers();
});

describe('BeerItem', () => {
  const mockBeer = {
    id: '123',
    brew_name: 'Test IPA',
    brewer: 'Test Brewery',
    brewer_loc: 'Austin, TX',
    brew_style: 'IPA',
    brew_container: '16oz Can',
    brew_description: '<p>A delicious test beer with hoppy notes.</p>',
    added_date: '1699564800', // Unix timestamp (Nov 10, 2023)
    container_type: 'tulip' as const, // Pre-computed container type (tulip for draft IPA)
  };

  const mockOnToggle = jest.fn();

  beforeEach(() => {
    mockOnToggle.mockClear();
  });

  // Test 1: Renders collapsed state correctly
  test('renders collapsed state correctly', () => {
    const { getByText, queryByText } = render(
      <BeerItem beer={mockBeer} isExpanded={false} onToggle={mockOnToggle} />
    );

    // Should show basic info
    expect(getByText('Test IPA')).toBeTruthy();
    expect(getByText(/Test Brewery/)).toBeTruthy();
    expect(getByText(/Austin, TX/)).toBeTruthy();
    expect(getByText(/16oz Can/)).toBeTruthy();

    // Should NOT show description in collapsed state
    expect(queryByText('Description:')).toBeNull();
    expect(queryByText(/delicious test beer/)).toBeNull();
  });

  // Test 2: Renders expanded state with description
  test('renders expanded state with description', () => {
    const { getByText } = render(
      <BeerItem beer={mockBeer} isExpanded={true} onToggle={mockOnToggle} />
    );

    // Should show description when expanded
    expect(getByText('Description:')).toBeTruthy();
    expect(getByText(/delicious test beer/)).toBeTruthy();
  });

  // Test 3: Toggles expand/collapse on press
  test('calls onToggle with beer id when pressed', () => {
    const { getByText } = render(
      <BeerItem beer={mockBeer} isExpanded={false} onToggle={mockOnToggle} />
    );

    // Press the beer item
    fireEvent.press(getByText('Test IPA'));

    // Should call onToggle with the beer's id
    expect(mockOnToggle).toHaveBeenCalledWith('123');
    expect(mockOnToggle).toHaveBeenCalledTimes(1);
  });

  // Test 4: Formats timestamp date correctly (added_date)
  test('formats unix timestamp date correctly', () => {
    const { getByText } = render(
      <BeerItem beer={mockBeer} isExpanded={false} onToggle={mockOnToggle} dateLabel="Date Added" />
    );

    // Should display formatted date
    expect(getByText(/Date Added:/)).toBeTruthy();
    // Unix timestamp 1699564800 = Nov 9, 2023 (or Nov 10 depending on timezone)
    // Just verify it's a valid date format
    expect(getByText(/Nov \d{1,2}, 2023/)).toBeTruthy();
  });

  // Test 5: Formats MM/DD/YYYY date correctly (tasted_date)
  test('formats MM/DD/YYYY date correctly for tasted beers', () => {
    const tastedBeer = {
      ...mockBeer,
      tasted_date: '11/10/2023',
    };

    const { getByText } = render(
      <BeerItem beer={tastedBeer} isExpanded={false} onToggle={mockOnToggle} dateLabel="Tasted" />
    );

    // Should display formatted tasted date
    expect(getByText(/Tasted:/)).toBeTruthy();
    expect(getByText(/Nov 10, 2023/)).toBeTruthy();
  });

  // Test 6: Handles invalid/missing dates gracefully
  test('handles invalid dates gracefully', () => {
    const beerWithInvalidDate = {
      ...mockBeer,
      added_date: 'invalid',
    };

    const { getByText } = render(
      <BeerItem beer={beerWithInvalidDate} isExpanded={false} onToggle={mockOnToggle} />
    );

    // Should show "Invalid Date" for malformed dates (note capitalization)
    expect(getByText(/Invalid Date/i)).toBeTruthy();
  });

  // Test 7: Handles missing optional fields
  test('handles missing optional fields gracefully', () => {
    const minimalBeer = {
      id: '456',
      brew_name: 'Minimal Beer',
      brewer: 'Test Brewery',
      brewer_loc: '',
      brew_style: 'Lager',
      brew_container: '',
      brew_description: '',
      added_date: '1699564800',
      container_type: null, // Pre-computed container type (null for unknown containers)
    };

    const { getByText } = render(
      <BeerItem beer={minimalBeer} isExpanded={false} onToggle={mockOnToggle} />
    );

    // Should render without crashing
    expect(getByText('Minimal Beer')).toBeTruthy();
    expect(getByText(/Test Brewery/)).toBeTruthy();
    expect(getByText(/Lager/)).toBeTruthy();

    // Should not show empty container or location
    const breweryText = getByText(/Test Brewery/).props.children.join('');
    expect(breweryText).not.toContain('• ');
  });

  // Test 8: Renders custom actions when provided
  test('renders custom actions when expanded and provided', () => {
    const { View } = require('react-native');
    const renderActions = () => {
      return <View testID="custom-action" />;
    };

    const { getByTestId } = render(
      <BeerItem
        beer={mockBeer}
        isExpanded={true}
        onToggle={mockOnToggle}
        renderActions={renderActions}
      />
    );

    // Should show custom actions when expanded
    expect(getByTestId('custom-action')).toBeTruthy();

    // Render again in collapsed state
    const { queryByTestId: queryCollapsed } = render(
      <BeerItem
        beer={mockBeer}
        isExpanded={false}
        onToggle={mockOnToggle}
        renderActions={renderActions}
      />
    );

    // Should NOT show actions when collapsed
    expect(queryCollapsed('custom-action')).toBeNull();
  });

  // Test 9: Handles empty date string
  test('handles empty date string', () => {
    const beerWithEmptyDate = {
      ...mockBeer,
      added_date: '',
    };

    const { getByText } = render(
      <BeerItem beer={beerWithEmptyDate} isExpanded={false} onToggle={mockOnToggle} />
    );

    // Should show "Unknown date" for empty dates
    expect(getByText(/Unknown date/)).toBeTruthy();
  });

  // Test 10: Strips <p> and <br> tags from description
  test('strips <p> and <br> tags from description', () => {
    const beerWithHtmlDescription = {
      ...mockBeer,
      brew_description: '<p>This beer has <strong>bold</strong> flavors and <br/>hops.</p>',
    };

    const { getByText } = render(
      <BeerItem beer={beerWithHtmlDescription} isExpanded={true} onToggle={mockOnToggle} />
    );

    // Should strip <p> and <br> tags
    expect(getByText(/This beer has <strong>bold<\/strong> flavors/)).toBeTruthy();
  });

  // Test 11: Uses default date label when not provided
  test('uses default date label when not provided', () => {
    const { getByText } = render(
      <BeerItem beer={mockBeer} isExpanded={false} onToggle={mockOnToggle} />
    );

    // Should use default "Date Added" label
    expect(getByText(/Date Added:/)).toBeTruthy();
  });

  // Test 12: Renders beer name fallback
  test('renders fallback for unnamed beer', () => {
    const unnamedBeer = {
      ...mockBeer,
      brew_name: '',
    };

    const { getByText } = render(
      <BeerItem beer={unnamedBeer} isExpanded={false} onToggle={mockOnToggle} />
    );

    // Should show "Unnamed Beer" fallback
    expect(getByText('Unnamed Beer')).toBeTruthy();
  });
});
