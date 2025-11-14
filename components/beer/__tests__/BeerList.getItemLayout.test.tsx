/**
 * MP-3 Step 2a: Tests for Bottleneck #1 - getItemLayout for FlatList
 *
 * Purpose: Verify that FlatList.getItemLayout optimization correctly calculates
 * item offsets and heights for improved scroll performance.
 *
 * Optimization: Add getItemLayout prop to FlatList to eliminate layout measurement
 * overhead during scrolling (10-15 FPS improvement expected).
 *
 * Expected Behavior (AFTER optimization):
 * - getItemLayout should return correct offset for any index
 * - Height calculations should be accurate (150dp per collapsed item)
 * - Scroll performance should improve significantly
 * - Scroll position should be accurate even with many items
 *
 * Current Status: FAILING (optimization not yet implemented)
 * These tests will pass after Step 2b implementation.
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { FlatList } from 'react-native';
import { BeerList } from '../BeerList';
import { Beer } from '@/src/types/beer';

// Mock dependencies
jest.mock('@/hooks/useThemeColor', () => ({
  useThemeColor: jest.fn(() => '#007AFF'),
}));

jest.mock('../../ThemedView', () => ({
  ThemedView: ({ children, ...props }: any) => <>{children}</>,
}));

jest.mock('../../ThemedText', () => ({
  ThemedText: ({ children, ...props }: any) => <>{children}</>,
}));

jest.mock('../BeerItem', () => ({
  BeerItem: jest.fn(() => null),
}));

describe('BeerList - getItemLayout Optimization (Bottleneck #1)', () => {
  // Expected item height after optimization
  const EXPECTED_ITEM_HEIGHT = 150; // Collapsed BeerItem height in dp

  const createMockBeer = (id: string): Beer => ({
    id,
    brew_name: `Test Beer ${id}`,
    brewer: 'Test Brewery',
    brew_style: 'IPA',
    added_date: '1234567890',
    brewer_loc: 'Austin, TX',
    brew_container: 'Draft',
    brew_description: 'Test description',
  });

  const mockBeers: Beer[] = Array.from({ length: 200 }, (_, i) =>
    createMockBeer(String(i + 1))
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getItemLayout Implementation', () => {
    it('should provide getItemLayout prop to FlatList', () => {
      const { UNSAFE_getByType } = render(
        <BeerList
          beers={mockBeers}
          loading={false}
          refreshing={false}
          onRefresh={() => {}}
          expandedId={null}
          onToggleExpand={() => {}}
        />
      );

      const flatList = UNSAFE_getByType(FlatList);

      // EXPECTED (after optimization): getItemLayout should be defined
      // CURRENT (before optimization): This will fail
      expect(flatList.props.getItemLayout).toBeDefined();
      expect(typeof flatList.props.getItemLayout).toBe('function');
    });

    it('should calculate correct offset for first item (index 0)', () => {
      const { UNSAFE_getByType } = render(
        <BeerList
          beers={mockBeers}
          loading={false}
          refreshing={false}
          onRefresh={() => {}}
          expandedId={null}
          onToggleExpand={() => {}}
        />
      );

      const flatList = UNSAFE_getByType(FlatList);
      const getItemLayout = flatList.props.getItemLayout;

      // EXPECTED: First item should have offset 0
      if (getItemLayout) {
        const layout = getItemLayout(mockBeers, 0);
        expect(layout).toEqual({
          length: EXPECTED_ITEM_HEIGHT,
          offset: 0,
          index: 0,
        });
      } else {
        // Fail if getItemLayout not implemented
        fail('getItemLayout is not implemented');
      }
    });

    it('should calculate correct offset for item at index 10', () => {
      const { UNSAFE_getByType } = render(
        <BeerList
          beers={mockBeers}
          loading={false}
          refreshing={false}
          onRefresh={() => {}}
          expandedId={null}
          onToggleExpand={() => {}}
        />
      );

      const flatList = UNSAFE_getByType(FlatList);
      const getItemLayout = flatList.props.getItemLayout;

      // EXPECTED: Item 10 should have offset = EXPECTED_ITEM_HEIGHT * 10
      if (getItemLayout) {
        const layout = getItemLayout(mockBeers, 10);
        expect(layout).toEqual({
          length: EXPECTED_ITEM_HEIGHT,
          offset: EXPECTED_ITEM_HEIGHT * 10,
          index: 10,
        });
      } else {
        fail('getItemLayout is not implemented');
      }
    });

    it('should calculate correct offset for item at index 100', () => {
      const { UNSAFE_getByType } = render(
        <BeerList
          beers={mockBeers}
          loading={false}
          refreshing={false}
          onRefresh={() => {}}
          expandedId={null}
          onToggleExpand={() => {}}
        />
      );

      const flatList = UNSAFE_getByType(FlatList);
      const getItemLayout = flatList.props.getItemLayout;

      // EXPECTED: Item 100 should have offset = EXPECTED_ITEM_HEIGHT * 100
      if (getItemLayout) {
        const layout = getItemLayout(mockBeers, 100);
        expect(layout).toEqual({
          length: EXPECTED_ITEM_HEIGHT,
          offset: EXPECTED_ITEM_HEIGHT * 100,
          index: 100,
        });
      } else {
        fail('getItemLayout is not implemented');
      }
    });

    it('should calculate correct offset for last item', () => {
      const { UNSAFE_getByType } = render(
        <BeerList
          beers={mockBeers}
          loading={false}
          refreshing={false}
          onRefresh={() => {}}
          expandedId={null}
          onToggleExpand={() => {}}
        />
      );

      const flatList = UNSAFE_getByType(FlatList);
      const getItemLayout = flatList.props.getItemLayout;

      const lastIndex = mockBeers.length - 1;

      // EXPECTED: Last item should have correct offset
      if (getItemLayout) {
        const layout = getItemLayout(mockBeers, lastIndex);
        expect(layout).toEqual({
          length: EXPECTED_ITEM_HEIGHT,
          offset: EXPECTED_ITEM_HEIGHT * lastIndex,
          index: lastIndex,
        });
      } else {
        fail('getItemLayout is not implemented');
      }
    });
  });

  describe('Height Consistency', () => {
    it('should return consistent height for all items', () => {
      const { UNSAFE_getByType } = render(
        <BeerList
          beers={mockBeers}
          loading={false}
          refreshing={false}
          onRefresh={() => {}}
          expandedId={null}
          onToggleExpand={() => {}}
        />
      );

      const flatList = UNSAFE_getByType(FlatList);
      const getItemLayout = flatList.props.getItemLayout;

      if (getItemLayout) {
        // Check multiple items for consistent height
        const indices = [0, 10, 50, 100, 199];
        const heights = indices.map(index => getItemLayout(mockBeers, index).length);

        // All heights should be the same (collapsed height)
        expect(new Set(heights).size).toBe(1);
        expect(heights[0]).toBe(EXPECTED_ITEM_HEIGHT);
      } else {
        fail('getItemLayout is not implemented');
      }
    });

    it('should use collapsed height even when item is expanded', () => {
      // Note: We use collapsed height for getItemLayout as a trade-off
      // Only one item is expanded at a time, so this is acceptable

      const { UNSAFE_getByType, rerender } = render(
        <BeerList
          beers={mockBeers}
          loading={false}
          refreshing={false}
          onRefresh={() => {}}
          expandedId={null}
          onToggleExpand={() => {}}
        />
      );

      let flatList = UNSAFE_getByType(FlatList);
      const getItemLayout = flatList.props.getItemLayout;

      if (!getItemLayout) {
        fail('getItemLayout is not implemented');
      }

      const collapsedLayout = getItemLayout(mockBeers, 10);

      // Expand item 10
      rerender(
        <BeerList
          beers={mockBeers}
          loading={false}
          refreshing={false}
          onRefresh={() => {}}
          expandedId="11"
          onToggleExpand={() => {}}
        />
      );

      flatList = UNSAFE_getByType(FlatList);
      const expandedLayout = flatList.props.getItemLayout(mockBeers, 10);

      // Height should remain the same (we use collapsed height)
      expect(expandedLayout.length).toBe(collapsedLayout.length);
      expect(expandedLayout.length).toBe(EXPECTED_ITEM_HEIGHT);
    });
  });

  describe('Offset Calculations', () => {
    it('should have sequential offsets with no gaps', () => {
      const { UNSAFE_getByType } = render(
        <BeerList
          beers={mockBeers}
          loading={false}
          refreshing={false}
          onRefresh={() => {}}
          expandedId={null}
          onToggleExpand={() => {}}
        />
      );

      const flatList = UNSAFE_getByType(FlatList);
      const getItemLayout = flatList.props.getItemLayout;

      if (getItemLayout) {
        // Check that each item's offset is exactly one item height after previous
        for (let i = 1; i < 10; i++) {
          const currentLayout = getItemLayout(mockBeers, i);
          const previousLayout = getItemLayout(mockBeers, i - 1);

          const expectedOffset = previousLayout.offset + previousLayout.length;
          expect(currentLayout.offset).toBe(expectedOffset);
        }
      } else {
        fail('getItemLayout is not implemented');
      }
    });

    it('should calculate total list height correctly', () => {
      const { UNSAFE_getByType } = render(
        <BeerList
          beers={mockBeers}
          loading={false}
          refreshing={false}
          onRefresh={() => {}}
          expandedId={null}
          onToggleExpand={() => {}}
        />
      );

      const flatList = UNSAFE_getByType(FlatList);
      const getItemLayout = flatList.props.getItemLayout;

      if (getItemLayout) {
        const lastIndex = mockBeers.length - 1;
        const lastItemLayout = getItemLayout(mockBeers, lastIndex);

        // Total height = offset of last item + height of last item
        const totalHeight = lastItemLayout.offset + lastItemLayout.length;
        const expectedTotalHeight = mockBeers.length * EXPECTED_ITEM_HEIGHT;

        expect(totalHeight).toBe(expectedTotalHeight);
      } else {
        fail('getItemLayout is not implemented');
      }
    });
  });

  describe('Performance Properties', () => {
    it('should work efficiently with large datasets', () => {
      // Test with 1000 beers to simulate large dataset
      const largeBeers = Array.from({ length: 1000 }, (_, i) =>
        createMockBeer(String(i + 1))
      );

      const { UNSAFE_getByType } = render(
        <BeerList
          beers={largeBeers}
          loading={false}
          refreshing={false}
          onRefresh={() => {}}
          expandedId={null}
          onToggleExpand={() => {}}
        />
      );

      const flatList = UNSAFE_getByType(FlatList);
      const getItemLayout = flatList.props.getItemLayout;

      if (getItemLayout) {
        // Test calculation speed (should be O(1), not O(n))
        const startTime = performance.now();
        const layout500 = getItemLayout(largeBeers, 500);
        const layout999 = getItemLayout(largeBeers, 999);
        const endTime = performance.now();

        // Calculations should be instant (< 1ms)
        expect(endTime - startTime).toBeLessThan(1);

        // Verify correct calculations
        expect(layout500.offset).toBe(EXPECTED_ITEM_HEIGHT * 500);
        expect(layout999.offset).toBe(EXPECTED_ITEM_HEIGHT * 999);
      } else {
        fail('getItemLayout is not implemented');
      }
    });

    it('should enable removeClippedSubviews optimization', () => {
      // getItemLayout enables removeClippedSubviews to work correctly
      const { UNSAFE_getByType } = render(
        <BeerList
          beers={mockBeers}
          loading={false}
          refreshing={false}
          onRefresh={() => {}}
          expandedId={null}
          onToggleExpand={() => {}}
        />
      );

      const flatList = UNSAFE_getByType(FlatList);

      // Verify removeClippedSubviews is enabled (should already be in current code)
      expect(flatList.props.removeClippedSubviews).toBe(true);

      // Verify getItemLayout is present to support it
      expect(flatList.props.getItemLayout).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty beer list', () => {
      const { queryByTestId } = render(
        <BeerList
          beers={[]}
          loading={false}
          refreshing={false}
          onRefresh={() => {}}
          expandedId={null}
          onToggleExpand={() => {}}
        />
      );

      // Should show empty state, not FlatList
      const emptyMessage = queryByTestId('beer-list-empty-message');
      expect(emptyMessage).toBeTruthy();
    });

    it('should handle single beer', () => {
      const singleBeer = [createMockBeer('1')];

      const { UNSAFE_getByType } = render(
        <BeerList
          beers={singleBeer}
          loading={false}
          refreshing={false}
          onRefresh={() => {}}
          expandedId={null}
          onToggleExpand={() => {}}
        />
      );

      const flatList = UNSAFE_getByType(FlatList);
      const getItemLayout = flatList.props.getItemLayout;

      if (getItemLayout) {
        const layout = getItemLayout(singleBeer, 0);
        expect(layout).toEqual({
          length: EXPECTED_ITEM_HEIGHT,
          offset: 0,
          index: 0,
        });
      } else {
        fail('getItemLayout is not implemented');
      }
    });

    it('should return correct index in layout object', () => {
      const { UNSAFE_getByType } = render(
        <BeerList
          beers={mockBeers}
          loading={false}
          refreshing={false}
          onRefresh={() => {}}
          expandedId={null}
          onToggleExpand={() => {}}
        />
      );

      const flatList = UNSAFE_getByType(FlatList);
      const getItemLayout = flatList.props.getItemLayout;

      if (getItemLayout) {
        // Test random indices
        const indices = [0, 5, 25, 100, 199];
        indices.forEach(index => {
          const layout = getItemLayout(mockBeers, index);
          expect(layout.index).toBe(index);
        });
      } else {
        fail('getItemLayout is not implemented');
      }
    });

    it('should work with Beerfinder type (union type support)', () => {
      // Test that getItemLayout works with Beerfinder type too
      const mockBeerfinders = mockBeers.map(beer => ({
        ...beer,
        tasted_date: '11/14/2025',
        tasted: true,
      }));

      const { UNSAFE_getByType } = render(
        <BeerList
          beers={mockBeerfinders}
          loading={false}
          refreshing={false}
          onRefresh={() => {}}
          expandedId={null}
          onToggleExpand={() => {}}
        />
      );

      const flatList = UNSAFE_getByType(FlatList);
      const getItemLayout = flatList.props.getItemLayout;

      if (getItemLayout) {
        const layout = getItemLayout(mockBeerfinders, 10);
        expect(layout.length).toBe(EXPECTED_ITEM_HEIGHT);
        expect(layout.offset).toBe(EXPECTED_ITEM_HEIGHT * 10);
      } else {
        fail('getItemLayout is not implemented');
      }
    });
  });

  describe('Integration with Other Props', () => {
    it('should work correctly with initialNumToRender', () => {
      const { UNSAFE_getByType } = render(
        <BeerList
          beers={mockBeers}
          loading={false}
          refreshing={false}
          onRefresh={() => {}}
          expandedId={null}
          onToggleExpand={() => {}}
        />
      );

      const flatList = UNSAFE_getByType(FlatList);

      // Verify both getItemLayout and initialNumToRender are set
      expect(flatList.props.getItemLayout).toBeDefined();
      expect(flatList.props.initialNumToRender).toBe(20);
    });

    it('should work correctly with windowSize optimization', () => {
      const { UNSAFE_getByType } = render(
        <BeerList
          beers={mockBeers}
          loading={false}
          refreshing={false}
          onRefresh={() => {}}
          expandedId={null}
          onToggleExpand={() => {}}
        />
      );

      const flatList = UNSAFE_getByType(FlatList);

      // Verify getItemLayout works with windowSize (current: 21, future: 11)
      expect(flatList.props.getItemLayout).toBeDefined();
      expect(flatList.props.windowSize).toBeDefined();
    });

    it('should maintain accuracy with maxToRenderPerBatch', () => {
      const { UNSAFE_getByType } = render(
        <BeerList
          beers={mockBeers}
          loading={false}
          refreshing={false}
          onRefresh={() => {}}
          expandedId={null}
          onToggleExpand={() => {}}
        />
      );

      const flatList = UNSAFE_getByType(FlatList);

      // Verify optimization properties are correctly configured
      expect(flatList.props.getItemLayout).toBeDefined();
      expect(flatList.props.maxToRenderPerBatch).toBe(20);
    });
  });
});
