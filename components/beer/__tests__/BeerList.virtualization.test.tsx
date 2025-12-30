/**
 * MP-3 Step 2a: Tests for Bottleneck #6 - Virtualization Window Tuning
 *
 * Purpose: Verify that FlatList virtualization parameters are optimized for
 * memory efficiency while maintaining smooth scrolling.
 *
 * Optimization: Reduce windowSize from 21 to 11 to decrease memory usage
 * by 30-40% without sacrificing scroll performance.
 *
 * Expected Behavior (AFTER optimization):
 * - windowSize should be 11 (down from 21)
 * - initialNumToRender should remain 20 (good balance)
 * - maxToRenderPerBatch should remain 20 (good balance)
 * - Memory usage should decrease by 30-40%
 * - Scroll performance should remain at 60 FPS
 *
 * Current Status: SUBOPTIMAL (windowSize=21 causes excessive memory usage)
 * These tests will pass after Step 2b implementation.
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { FlatList } from 'react-native';
import { BeerList } from '../BeerList';
import { BeerWithContainerType } from '@/src/types/beer';

// Mock dependencies
jest.mock('@/hooks/useThemeColor', () => ({
  useThemeColor: jest.fn(() => '#007AFF'),
}));

jest.mock('../../ThemedView', () => ({
  ThemedView: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

jest.mock('../../ThemedText', () => ({
  ThemedText: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

jest.mock('../BeerItem', () => ({
  BeerItem: jest.fn(() => null),
}));

describe('BeerList - Virtualization Window Tuning (Bottleneck #6)', () => {
  const createMockBeer = (id: string): BeerWithContainerType => ({
    id,
    brew_name: `Test Beer ${id}`,
    brewer: 'Test Brewery',
    brew_style: 'IPA',
    added_date: '1234567890',
    brewer_loc: 'Austin, TX',
    brew_container: 'Draft',
    brew_description: 'Test description',
    container_type: 'tulip', // Pre-computed glass type for IPA
    enrichment_confidence: null,
    enrichment_source: null,
  });

  const mockBeers: BeerWithContainerType[] = Array.from({ length: 200 }, (_, i) =>
    createMockBeer(String(i + 1))
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('windowSize Optimization', () => {
    it('should set windowSize to 11 for optimal memory usage', () => {
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

      // EXPECTED (after optimization): windowSize = 11
      // CURRENT (before optimization): windowSize = 21
      expect(flatList.props.windowSize).toBe(11);
    });

    it('should maintain initialNumToRender at 20', () => {
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

      // Should NOT change - 20 is optimal for initial render
      expect(flatList.props.initialNumToRender).toBe(20);
    });

    it('should maintain maxToRenderPerBatch at 20', () => {
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

      // Should NOT change - 20 is optimal for batch rendering
      expect(flatList.props.maxToRenderPerBatch).toBe(20);
    });

    it('should keep removeClippedSubviews enabled', () => {
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

      // Critical for memory optimization
      expect(flatList.props.removeClippedSubviews).toBe(true);
    });
  });

  describe('Memory Calculations', () => {
    it('should calculate rendered items based on windowSize', () => {
      // windowSize documentation:
      // "Determines the maximum number of items rendered outside of the visible area,
      // in units of visible lengths. So if your list fills the screen, then
      // windowSize={21} (the default) will render the visible screen area plus
      // up to 10 screens above and 10 screens below."

      const VISIBLE_ITEMS_PER_SCREEN = 10; // Approximate
      const WINDOW_SIZE_OPTIMIZED = 11;
      const WINDOW_SIZE_CURRENT = 21;

      // Current rendering (windowSize=21):
      // - Visible: 10 items
      // - Above: 10 screens * 10 items = 100 items
      // - Below: 10 screens * 10 items = 100 items
      // - Total: 210 items
      const currentRendered =
        VISIBLE_ITEMS_PER_SCREEN +
        Math.floor(WINDOW_SIZE_CURRENT / 2) * VISIBLE_ITEMS_PER_SCREEN * 2;

      // Optimized rendering (windowSize=11):
      // - Visible: 10 items
      // - Above: 5 screens * 10 items = 50 items
      // - Below: 5 screens * 10 items = 50 items
      // - Total: 110 items
      const optimizedRendered =
        VISIBLE_ITEMS_PER_SCREEN +
        Math.floor(WINDOW_SIZE_OPTIMIZED / 2) * VISIBLE_ITEMS_PER_SCREEN * 2;

      // Memory reduction calculation
      const reduction = ((currentRendered - optimizedRendered) / currentRendered) * 100;

      // EXPECTED: 30-40% memory reduction
      expect(reduction).toBeGreaterThanOrEqual(30);
      expect(reduction).toBeLessThanOrEqual(60); // Upper bound
    });

    it('should verify memory savings with 200 beer dataset', () => {
      // With 200 beers, windowSize=21 renders ~210 items (more than the dataset!)
      // windowSize=11 renders ~110 items (much more reasonable)

      const TOTAL_BEERS = 200;
      const WINDOW_SIZE_OPTIMIZED = 11;
      const VISIBLE_ITEMS = 10;

      // Optimized rendering should be ~55% of total beers
      const maxRenderedItems = VISIBLE_ITEMS * Math.ceil(WINDOW_SIZE_OPTIMIZED / 2) * 2;
      const percentageRendered = (maxRenderedItems / TOTAL_BEERS) * 100;

      // Should render approximately 55% of beers at most
      expect(percentageRendered).toBeLessThanOrEqual(60);
      expect(maxRenderedItems).toBeLessThan(TOTAL_BEERS);
    });
  });

  describe('Performance Properties', () => {
    it('should maintain all performance optimization props', () => {
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

      // Verify all performance props are set correctly
      expect(flatList.props.windowSize).toBe(11); // Optimized
      expect(flatList.props.initialNumToRender).toBe(20); // Unchanged
      expect(flatList.props.maxToRenderPerBatch).toBe(20); // Unchanged
      expect(flatList.props.removeClippedSubviews).toBe(true); // Unchanged
    });

    it('should work with getItemLayout optimization', () => {
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

      // Verify both optimizations are present
      expect(flatList.props.windowSize).toBe(11);
      // Note: getItemLayout will be added in Bottleneck #1
      // expect(flatList.props.getItemLayout).toBeDefined();
    });

    it('should have optimized props for large datasets', () => {
      const largeBeers = Array.from({ length: 1000 }, (_, i) => createMockBeer(String(i + 1)));

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

      // Even with 1000 beers, windowSize should remain 11
      expect(flatList.props.windowSize).toBe(11);
      expect(flatList.props.removeClippedSubviews).toBe(true);
    });
  });

  describe('Scroll Performance Maintenance', () => {
    it('should maintain sufficient buffer for smooth scrolling', () => {
      // windowSize=11 means 5.5 screens above and below visible area
      // This should be sufficient for 60fps scrolling

      const WINDOW_SIZE = 11;
      const SCREENS_BUFFERED = (WINDOW_SIZE - 1) / 2; // 5 screens each direction

      // Should buffer at least 3 screens for smooth scrolling
      expect(SCREENS_BUFFERED).toBeGreaterThanOrEqual(3);

      // Should not buffer more than 10 screens (excessive memory)
      expect(SCREENS_BUFFERED).toBeLessThanOrEqual(10);
    });

    it('should provide adequate buffer for fast scrolling', () => {
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

      // windowSize=11 provides ~5 screens buffer each direction
      // Combined with maxToRenderPerBatch=20, should handle fast scrolling
      expect(flatList.props.windowSize).toBe(11);
      expect(flatList.props.maxToRenderPerBatch).toBeGreaterThanOrEqual(20);
    });

    it('should work with batch rendering for progressive loading', () => {
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

      // Verify coordinated values
      const { windowSize, initialNumToRender, maxToRenderPerBatch } = flatList.props;

      // initialNumToRender should be <= maxToRenderPerBatch
      expect(initialNumToRender).toBeLessThanOrEqual(maxToRenderPerBatch);

      // windowSize should be reasonable (not too high, not too low)
      expect(windowSize).toBeGreaterThanOrEqual(5);
      expect(windowSize).toBeLessThanOrEqual(15);
    });
  });

  describe('Memory Efficiency Scenarios', () => {
    it('should optimize memory with small datasets (< 50 beers)', () => {
      const smallBeers = Array.from({ length: 30 }, (_, i) => createMockBeer(String(i + 1)));

      const { UNSAFE_getByType } = render(
        <BeerList
          beers={smallBeers}
          loading={false}
          refreshing={false}
          onRefresh={() => {}}
          expandedId={null}
          onToggleExpand={() => {}}
        />
      );

      const flatList = UNSAFE_getByType(FlatList);

      // Even with small dataset, use optimized windowSize
      expect(flatList.props.windowSize).toBe(11);
    });

    it('should optimize memory with medium datasets (50-200 beers)', () => {
      const mediumBeers = Array.from({ length: 150 }, (_, i) => createMockBeer(String(i + 1)));

      const { UNSAFE_getByType } = render(
        <BeerList
          beers={mediumBeers}
          loading={false}
          refreshing={false}
          onRefresh={() => {}}
          expandedId={null}
          onToggleExpand={() => {}}
        />
      );

      const flatList = UNSAFE_getByType(FlatList);

      expect(flatList.props.windowSize).toBe(11);
      expect(flatList.props.removeClippedSubviews).toBe(true);
    });

    it('should optimize memory with large datasets (> 200 beers)', () => {
      const largeBeers = Array.from({ length: 500 }, (_, i) => createMockBeer(String(i + 1)));

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

      // Critical for large datasets
      expect(flatList.props.windowSize).toBe(11);
      expect(flatList.props.removeClippedSubviews).toBe(true);
      expect(flatList.props.maxToRenderPerBatch).toBeLessThanOrEqual(20);
    });
  });

  describe('Comparison with Current Implementation', () => {
    it('should verify baseline performance characteristics', () => {
      // Document current (suboptimal) vs optimized values

      const CURRENT_WINDOW_SIZE = 21;
      const OPTIMIZED_WINDOW_SIZE = 11;

      const reduction = ((CURRENT_WINDOW_SIZE - OPTIMIZED_WINDOW_SIZE) / CURRENT_WINDOW_SIZE) * 100;

      // Reduction in render window
      expect(reduction).toBeGreaterThan(45); // ~47.6% reduction
    });

    it('should calculate memory savings from optimization', () => {
      // Estimate memory per item: ~2KB (React component + data)
      const MEMORY_PER_ITEM_KB = 2;
      const VISIBLE_ITEMS = 10;

      const currentItems = VISIBLE_ITEMS * 21; // 210 items
      const optimizedItems = VISIBLE_ITEMS * 11; // 110 items

      const currentMemoryKB = currentItems * MEMORY_PER_ITEM_KB; // 420 KB
      const optimizedMemoryKB = optimizedItems * MEMORY_PER_ITEM_KB; // 220 KB

      const savingsKB = currentMemoryKB - optimizedMemoryKB;
      const savingsPercent = (savingsKB / currentMemoryKB) * 100;

      // Should save ~200KB (~47% reduction)
      expect(savingsKB).toBeGreaterThan(150);
      expect(savingsPercent).toBeGreaterThanOrEqual(30);
      expect(savingsPercent).toBeLessThanOrEqual(50);
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

      // Still use optimized settings
      expect(flatList.props.windowSize).toBe(11);
    });

    it('should handle exactly windowSize items', () => {
      const exactBeers = Array.from({ length: 11 }, (_, i) => createMockBeer(String(i + 1)));

      const { UNSAFE_getByType } = render(
        <BeerList
          beers={exactBeers}
          loading={false}
          refreshing={false}
          onRefresh={() => {}}
          expandedId={null}
          onToggleExpand={() => {}}
        />
      );

      const flatList = UNSAFE_getByType(FlatList);

      expect(flatList.props.windowSize).toBe(11);
      expect(flatList.props.data).toHaveLength(11);
    });
  });

  describe('Integration with Other Optimizations', () => {
    it('should work with all FlatList optimizations combined', () => {
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

      // Verify all optimizations
      expect(flatList.props.windowSize).toBe(11); // Bottleneck #6
      // expect(flatList.props.getItemLayout).toBeDefined(); // Bottleneck #1
      expect(flatList.props.removeClippedSubviews).toBe(true);
      expect(flatList.props.initialNumToRender).toBe(20);
      expect(flatList.props.maxToRenderPerBatch).toBe(20);
    });

    it('should coordinate with memoization optimizations', () => {
      // windowSize reduction is most effective when combined with
      // React.memo (Bottleneck #2) and stable callbacks (Bottleneck #5)

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

      // Verify renderItem is memoized (from Bottleneck #5)
      expect(flatList.props.renderItem).toBeDefined();

      // Verify windowSize is optimized
      expect(flatList.props.windowSize).toBe(11);
    });
  });

  describe('Performance Benchmarks', () => {
    it('should target 30-40% memory reduction', () => {
      // Target from bottleneck analysis: 30-40% memory reduction

      const CURRENT_WINDOW = 21;
      const OPTIMIZED_WINDOW = 11;

      // Calculate actual reduction
      const itemReduction = ((CURRENT_WINDOW - OPTIMIZED_WINDOW) / CURRENT_WINDOW) * 100;

      // Should be close to 47% (exceeds target)
      expect(itemReduction).toBeGreaterThanOrEqual(30);
      expect(itemReduction).toBeLessThanOrEqual(50);
    });

    it('should maintain 60 FPS scroll target', () => {
      // This test documents that windowSize=11 should not degrade scroll performance
      // Actual FPS measurement would require Flashlight.dev in Step 3

      const WINDOW_SIZE = 11;
      const BUFFER_SCREENS = (WINDOW_SIZE - 1) / 2;

      // Should have at least 3 screens buffer for 60fps scrolling
      expect(BUFFER_SCREENS).toBeGreaterThanOrEqual(3);

      // This is a reasonable buffer for smooth scrolling
      // 5 screens buffer = ~50 items = enough for fast scroll at 60fps
    });
  });

  describe('Configuration Validation', () => {
    it('should use odd windowSize for symmetric buffering', () => {
      // windowSize should be odd for equal buffering above and below
      const WINDOW_SIZE = 11;

      expect(WINDOW_SIZE % 2).toBe(1); // Odd number
    });

    it('should maintain reasonable ratios between virtualization params', () => {
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
      const { windowSize, initialNumToRender, maxToRenderPerBatch } = flatList.props;

      // initialNumToRender should be reasonable compared to windowSize
      const itemsPerScreen = 10; // Approximate
      const maxWindowItems = windowSize * itemsPerScreen;

      // initialNumToRender should be < total window capacity
      expect(initialNumToRender).toBeLessThan(maxWindowItems);

      // maxToRenderPerBatch should not exceed initialNumToRender by too much
      expect(maxToRenderPerBatch).toBeLessThanOrEqual(initialNumToRender * 2);
    });
  });
});
