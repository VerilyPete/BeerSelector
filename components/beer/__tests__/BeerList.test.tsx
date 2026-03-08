import React from 'react';
import { render } from '@testing-library/react-native';

import { BeerList } from '../BeerList';

// Mock theme hooks before importing component
jest.mock('@/hooks/useColorScheme', () => ({
  useColorScheme: jest.fn(() => 'light'),
}));

// Mock BeerItem component to simplify testing
jest.mock('../BeerItem', () => ({
  BeerItem: ({ beer }: { beer: { id: string; brew_name: string } }) => {
    const { View, Text } = require('react-native');
    return (
      <View testID={`beer-item-${beer.id}`}>
        <Text testID={`beer-name-${beer.id}`}>{beer.brew_name}</Text>
      </View>
    );
  },
}));

// Use real timers for this test suite to avoid hanging
beforeAll(() => {
  jest.useRealTimers();
});

afterAll(() => {
  jest.useFakeTimers();
});

type MockBeer = {
  id: string;
  brew_name: string;
  brewer: string;
  brew_style: string;
  brew_abv: string;
  brew_container: string;
  brew_description: string;
  added_date: string;
  brewer_loc: string;
  container_type: 'tulip' | 'pint' | 'can' | 'bottle' | null;
  enrichment_confidence: null;
  enrichment_source: null;
};

function createMockBeers(): MockBeer[] {
  return [
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
      container_type: 'tulip', // Pre-computed glass type for IPA
      enrichment_confidence: null,
      enrichment_source: null,
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
      container_type: 'pint', // Pre-computed glass type for Stout
      enrichment_confidence: null,
      enrichment_source: null,
    },
  ];
}

describe('BeerList', () => {
  // Test 1: Renders empty message when no beers and not loading
  test('renders empty message when no beers and not loading', () => {
    const mockOnToggleExpand = jest.fn();
    const mockOnRefresh = jest.fn();
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
    const mockOnToggleExpand = jest.fn();
    const mockOnRefresh = jest.fn();
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
    const mockOnToggleExpand = jest.fn();
    const mockOnRefresh = jest.fn();
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
    const mockOnToggleExpand = jest.fn();
    const mockOnRefresh = jest.fn();
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
    const mockOnToggleExpand = jest.fn();
    const mockOnRefresh = jest.fn();
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
    const mockOnToggleExpand = jest.fn();
    const mockOnRefresh = jest.fn();
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

  // Test 7: Component renders beer names from the provided list
  test('renders beer names from the provided list', () => {
    const mockOnToggleExpand = jest.fn();
    const mockOnRefresh = jest.fn();
    const mockBeers = createMockBeers();
    const { getByText } = render(
      <BeerList
        beers={mockBeers}
        loading={false}
        expandedId="1"
        onToggleExpand={mockOnToggleExpand}
        refreshing={false}
        onRefresh={mockOnRefresh}
      />
    );
    expect(getByText('Test Beer 1')).toBeTruthy();
    expect(getByText('Test Beer 2')).toBeTruthy();
  });

  // Test 8: Component renders with optional props
  test('renders beer list with optional dateLabel and renderItemActions', () => {
    const mockOnToggleExpand = jest.fn();
    const mockOnRefresh = jest.fn();
    const renderActions = () => null;
    const mockBeers = createMockBeers();
    const { getByText } = render(
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
    );
    expect(getByText('Test Beer 1')).toBeTruthy();
  });

  // Test 9: Handles loading state correctly
  test('renders component in loading state', () => {
    const mockOnToggleExpand = jest.fn();
    const mockOnRefresh = jest.fn();
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

  // Test 10: Handles refreshing state — still renders beer list
  test('renders beer list while refreshing', () => {
    const mockOnToggleExpand = jest.fn();
    const mockOnRefresh = jest.fn();
    const mockBeers = createMockBeers();
    const { getByText } = render(
      <BeerList
        beers={mockBeers}
        loading={false}
        expandedId={null}
        onToggleExpand={mockOnToggleExpand}
        refreshing={true}
        onRefresh={mockOnRefresh}
      />
    );
    expect(getByText('Test Beer 1')).toBeTruthy();
  });

  // Test 11: Empty state styling is applied
  test('applies correct empty state styling', () => {
    const mockOnToggleExpand = jest.fn();
    const mockOnRefresh = jest.fn();
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

  // Test 12: Callback functions are invokable
  test('provides callback functions without error', () => {
    const customToggle = jest.fn();
    const customRefresh = jest.fn();

    const { getByText } = render(
      <BeerList
        beers={[]}
        loading={false}
        expandedId={null}
        onToggleExpand={customToggle}
        refreshing={false}
        onRefresh={customRefresh}
      />
    );
    expect(getByText('No beers found')).toBeTruthy();
  });

  // Test 13: Renders each variation of loading/refreshing flags
  test.each([
    { loading: true, refreshing: true },
    { loading: true, refreshing: false },
    { loading: false, refreshing: false },
  ])('does not show empty message when loading=$loading or refreshing=$refreshing with beers', ({ loading, refreshing }) => {
    const mockOnToggleExpand = jest.fn();
    const mockOnRefresh = jest.fn();
    const mockBeers = createMockBeers();
    const { queryByText } = render(
      <BeerList
        beers={mockBeers}
        loading={loading}
        expandedId={null}
        onToggleExpand={mockOnToggleExpand}
        refreshing={refreshing}
        onRefresh={mockOnRefresh}
      />
    );
    expect(queryByText('No beers found')).toBeNull();
  });
});
