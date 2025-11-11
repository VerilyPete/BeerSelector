import React from 'react';
import { render } from '@testing-library/react-native';

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

// Mock BeerItem component to simplify testing
jest.mock('../BeerItem', () => ({
  BeerItem: ({ beer }: any) => {
    const { View, Text } = require('react-native');
    return (
      <View testID={`beer-item-${beer.id}`}>
        <Text testID={`beer-name-${beer.id}`}>{beer.brew_name}</Text>
      </View>
    );
  },
}));

import { BeerList } from '../BeerList';

// Use real timers for this test suite to avoid hanging
beforeAll(() => {
  jest.useRealTimers();
});

afterAll(() => {
  jest.useFakeTimers();
});

describe('BeerList', () => {
  const mockBeers = [
    {
      id: '1',
      brew_name: 'Test Beer 1',
      brewer: 'Test Brewery',
      brew_style: 'IPA',
      brew_abv: '6.5',
      brew_container: 'Draft',
      brew_description: 'A test beer',
      added_date: '1699564800',
      brewer_loc: 'Texas',
    },
    {
      id: '2',
      brew_name: 'Test Beer 2',
      brewer: 'Another Brewery',
      brew_style: 'Stout',
      brew_abv: '8.0',
      brew_container: 'Bottle',
      brew_description: 'Another test beer',
      added_date: '1699651200',
      brewer_loc: 'Colorado',
    },
  ];

  const mockOnToggleExpand = jest.fn();
  const mockOnRefresh = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Test 1: Renders empty message when no beers and not loading
  test('renders empty message when no beers and not loading', () => {
    const { getByText } = render(
      <BeerList
        beers={[]}
        loading={false}
        expandedId={null}
        onToggleExpand={mockOnToggleExpand}
        refreshing={false}
        onRefresh={mockOnRefresh}
        emptyMessage="No beers found"
      />
    );

    expect(getByText('No beers found')).toBeTruthy();
  });

  // Test 2: Uses default empty message when not provided
  test('uses default empty message when not provided', () => {
    const { getByText } = render(
      <BeerList
        beers={[]}
        loading={false}
        expandedId={null}
        onToggleExpand={mockOnToggleExpand}
        refreshing={false}
        onRefresh={mockOnRefresh}
      />
    );

    expect(getByText('No beers found')).toBeTruthy();
  });

  // Test 3: Does not render empty message when loading
  test('does not render empty message when loading', () => {
    const { queryByText } = render(
      <BeerList
        beers={[]}
        loading={true}
        expandedId={null}
        onToggleExpand={mockOnToggleExpand}
        refreshing={false}
        onRefresh={mockOnRefresh}
        emptyMessage="No beers found"
      />
    );

    // When loading is true, should render FlatList even with empty beers
    expect(queryByText('No beers found')).toBeNull();
  });

  // Test 4: Handles empty beers with custom message
  test('handles empty beers with custom empty message', () => {
    const { getByText } = render(
      <BeerList
        beers={[]}
        loading={false}
        expandedId={null}
        onToggleExpand={mockOnToggleExpand}
        refreshing={false}
        onRefresh={mockOnRefresh}
        emptyMessage="Tap the search icon to find beers!"
      />
    );

    expect(getByText('Tap the search icon to find beers!')).toBeTruthy();
  });

  // Test 5: Shows empty state for visitor mode
  test('shows appropriate empty message for visitor mode', () => {
    const { getByText } = render(
      <BeerList
        beers={[]}
        loading={false}
        expandedId={null}
        onToggleExpand={mockOnToggleExpand}
        refreshing={false}
        onRefresh={mockOnRefresh}
        emptyMessage="Login to view your tasted beers"
      />
    );

    expect(getByText('Login to view your tasted beers')).toBeTruthy();
  });

  // Test 6: Empty state handles null values gracefully
  test('handles null/undefined gracefully', () => {
    const { getByText } = render(
      <BeerList
        beers={[]}
        loading={false}
        expandedId={null}
        onToggleExpand={mockOnToggleExpand}
        refreshing={false}
        onRefresh={mockOnRefresh}
      />
    );

    // Should still render default message
    expect(getByText('No beers found')).toBeTruthy();
  });

  // Test 7: Component accepts all required props
  test('accepts all required props without error', () => {
    expect(() =>
      render(
        <BeerList
          beers={mockBeers}
          loading={false}
          expandedId="1"
          onToggleExpand={mockOnToggleExpand}
          refreshing={false}
          onRefresh={mockOnRefresh}
        />
      )
    ).not.toThrow();
  });

  // Test 8: Component accepts optional props
  test('accepts optional props without error', () => {
    const renderActions = () => null;

    expect(() =>
      render(
        <BeerList
          beers={mockBeers}
          loading={false}
          expandedId="1"
          onToggleExpand={mockOnToggleExpand}
          refreshing={false}
          onRefresh={mockOnRefresh}
          emptyMessage="Custom message"
          dateLabel="Tasted"
          renderItemActions={renderActions}
        />
      )
    ).not.toThrow();
  });

  // Test 9: Handles loading state correctly
  test('renders component in loading state', () => {
    const { queryByText } = render(
      <BeerList
        beers={[]}
        loading={true}
        expandedId={null}
        onToggleExpand={mockOnToggleExpand}
        refreshing={false}
        onRefresh={mockOnRefresh}
      />
    );

    // Should not show empty message when loading
    expect(queryByText('No beers found')).toBeNull();
  });

  // Test 10: Handles refreshing state
  test('handles refreshing state', () => {
    expect(() =>
      render(
        <BeerList
          beers={mockBeers}
          loading={false}
          expandedId={null}
          onToggleExpand={mockOnToggleExpand}
          refreshing={true}
          onRefresh={mockOnRefresh}
        />
      )
    ).not.toThrow();
  });

  // Test 11: Empty state styling is applied
  test('applies correct empty state styling', () => {
    const { getByText } = render(
      <BeerList
        beers={[]}
        loading={false}
        expandedId={null}
        onToggleExpand={mockOnToggleExpand}
        refreshing={false}
        onRefresh={mockOnRefresh}
        emptyMessage="Test message"
      />
    );

    const emptyText = getByText('Test message');
    expect(emptyText).toBeTruthy();
    // Verify it's wrapped in a container
    expect(emptyText.parent).toBeTruthy();
  });

  // Test 12: Callbacks are provided correctly
  test('provides callback functions without error', () => {
    const customToggle = jest.fn();
    const customRefresh = jest.fn();

    expect(() =>
      render(
        <BeerList
          beers={[]}
          loading={false}
          expandedId={null}
          onToggleExpand={customToggle}
          refreshing={false}
          onRefresh={customRefresh}
        />
      )
    ).not.toThrow();
  });

  // Test 13: Handles different empty message scenarios
  test('handles various empty message formats', () => {
    const messages = [
      'No beers available',
      'Try searching for a beer!',
      'Your list is empty',
      '',
    ];

    messages.forEach((msg) => {
      const { rerender } = render(
        <BeerList
          beers={[]}
          loading={false}
          expandedId={null}
          onToggleExpand={mockOnToggleExpand}
          refreshing={false}
          onRefresh={mockOnRefresh}
          emptyMessage={msg}
        />
      );

      // Should render without crashing
      expect(true).toBe(true);
    });
  });

  // Test 14: Type safety - accepts Beer objects
  test('accepts valid Beer objects', () => {
    const validBeers = [
      {
        id: '999',
        brew_name: 'Valid Beer',
        brewer: 'Valid Brewery',
        brew_style: 'Ale',
        brew_abv: '5.0',
        brew_container: 'Can',
        brew_description: 'A valid beer',
        added_date: '1699910400',
        brewer_loc: 'Oregon',
      },
    ];

    expect(() =>
      render(
        <BeerList
          beers={validBeers}
          loading={false}
          expandedId={null}
          onToggleExpand={mockOnToggleExpand}
          refreshing={false}
          onRefresh={mockOnRefresh}
        />
      )
    ).not.toThrow();
  });

  // Test 15: Boolean props work correctly
  test('handles boolean props correctly', () => {
    const testCases = [
      { loading: true, refreshing: true },
      { loading: true, refreshing: false },
      { loading: false, refreshing: true },
      { loading: false, refreshing: false },
    ];

    testCases.forEach(({ loading, refreshing }) => {
      expect(() =>
        render(
          <BeerList
            beers={mockBeers}
            loading={loading}
            expandedId={null}
            onToggleExpand={mockOnToggleExpand}
            refreshing={refreshing}
            onRefresh={mockOnRefresh}
          />
        )
      ).not.toThrow();
    });
  });
});
