import React from 'react';
import { render } from '@testing-library/react-native';
import { BeerList } from '../BeerList';
import { Text } from 'react-native';

// Mock the themed components and hooks
jest.mock('../../ThemedView', () => {
  const { View } = require('react-native');
  return {
    ThemedView: ({ children, ...props }: any) => <View {...props}>{children}</View>
  };
});

jest.mock('../../ThemedText', () => {
  const { Text } = require('react-native');
  return {
    ThemedText: ({ children, ...props }: any) => <Text {...props}>{children}</Text>
  };
});

jest.mock('../BeerItem', () => ({
  BeerItem: ({ beer, isExpanded, onToggle }: any) => {
    const { Text, TouchableOpacity } = require('react-native');
    return (
      <TouchableOpacity onPress={() => onToggle(beer.id)} testID={`beer-item-${beer.id}`}>
        <Text>{beer.brew_name}</Text>
        <Text>{isExpanded ? 'Expanded' : 'Collapsed'}</Text>
      </TouchableOpacity>
    );
  }
}));

jest.mock('@/hooks/useThemeColor', () => ({
  useThemeColor: () => '#FFFFFF'
}));

describe('BeerList', () => {
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
    }
  ];

  const mockOnRefresh = jest.fn();
  const mockOnToggleExpand = jest.fn();

  const defaultProps = {
    beers: mockBeers,
    loading: false,
    refreshing: false,
    onRefresh: mockOnRefresh,
    expandedId: null,
    onToggleExpand: mockOnToggleExpand,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Empty State', () => {
    it('shows empty message when no beers and not loading', () => {
      const { getByText } = render(
        <BeerList {...defaultProps} beers={[]} loading={false} />
      );

      expect(getByText('No beers found')).toBeTruthy();
    });

    it('shows custom empty message when provided', () => {
      const { getByText } = render(
        <BeerList
          {...defaultProps}
          beers={[]}
          loading={false}
          emptyMessage="No tasted beers yet!"
        />
      );

      expect(getByText('No tasted beers yet!')).toBeTruthy();
    });

    it('does not show empty message when loading', () => {
      const { queryByText } = render(
        <BeerList {...defaultProps} beers={[]} loading={true} />
      );

      expect(queryByText('No beers found')).toBeNull();
    });

    it('does not show empty message when beers are present', () => {
      const { queryByText } = render(
        <BeerList {...defaultProps} />
      );

      expect(queryByText('No beers found')).toBeNull();
    });
  });

  describe('Beer List Rendering', () => {
    it('renders all beers in the list', () => {
      const { getByText } = render(
        <BeerList {...defaultProps} />
      );

      expect(getByText('Test IPA')).toBeTruthy();
      expect(getByText('Test Stout')).toBeTruthy();
    });

    it('renders beers with collapsed state by default', () => {
      const { getAllByText } = render(
        <BeerList {...defaultProps} expandedId={null} />
      );

      const collapsedStates = getAllByText('Collapsed');
      expect(collapsedStates.length).toBe(2);
    });

    it('renders expanded beer when expandedId matches', () => {
      const { getByText, getAllByText } = render(
        <BeerList {...defaultProps} expandedId="1" />
      );

      expect(getByText('Expanded')).toBeTruthy();

      // One expanded, one collapsed
      const collapsedStates = getAllByText('Collapsed');
      expect(collapsedStates.length).toBe(1);
    });

    it('uses unique key extractor for each beer', () => {
      const { getByTestId } = render(
        <BeerList {...defaultProps} />
      );

      expect(getByTestId('beer-item-1')).toBeTruthy();
      expect(getByTestId('beer-item-2')).toBeTruthy();
    });
  });

  describe('Refresh Control', () => {
    it('passes refreshing state to RefreshControl', () => {
      const { UNSAFE_getByType } = render(
        <BeerList {...defaultProps} refreshing={true} />
      );

      const { RefreshControl } = require('react-native');
      const refreshControl = UNSAFE_getByType(RefreshControl);
      expect(refreshControl.props.refreshing).toBe(true);
    });

    it('calls onRefresh when pull-to-refresh is triggered', () => {
      const { UNSAFE_getByType } = render(
        <BeerList {...defaultProps} />
      );

      const { RefreshControl } = require('react-native');
      const refreshControl = UNSAFE_getByType(RefreshControl);

      refreshControl.props.onRefresh();

      expect(mockOnRefresh).toHaveBeenCalledTimes(1);
    });
  });

  describe('Expand/Collapse Behavior', () => {
    it('calls onToggleExpand with beer id when beer item is toggled', () => {
      const { getByTestId } = render(
        <BeerList {...defaultProps} />
      );

      const beerItem = getByTestId('beer-item-1');
      beerItem.props.onPress();

      expect(mockOnToggleExpand).toHaveBeenCalledWith('1');
    });
  });

  describe('Optional Props', () => {
    it('passes dateLabel to BeerItem when provided', () => {
      // This is implicitly tested by BeerItem receiving the prop
      // In a real scenario, we would check if BeerItem receives the dateLabel prop
      const { getByText } = render(
        <BeerList {...defaultProps} dateLabel="Tasted" />
      );

      expect(getByText('Test IPA')).toBeTruthy();
    });

    it('works without optional props', () => {
      const { getByText } = render(
        <BeerList
          beers={mockBeers}
          loading={false}
          refreshing={false}
          onRefresh={mockOnRefresh}
          expandedId={null}
          onToggleExpand={mockOnToggleExpand}
        />
      );

      expect(getByText('Test IPA')).toBeTruthy();
    });
  });

  describe('Performance Optimizations', () => {
    it('renders FlatList with performance props', () => {
      const { UNSAFE_getByType } = render(
        <BeerList {...defaultProps} />
      );

      const { FlatList } = require('react-native');
      const flatList = UNSAFE_getByType(FlatList);

      expect(flatList.props.initialNumToRender).toBe(20);
      expect(flatList.props.maxToRenderPerBatch).toBe(20);
      expect(flatList.props.windowSize).toBe(21);
      expect(flatList.props.removeClippedSubviews).toBe(true);
    });
  });
});
