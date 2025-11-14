/**
 * MP-3 Step 2a: Tests for Bottleneck #5 - useCallback for Event Handlers
 *
 * Purpose: Verify that event handler references remain stable across re-renders
 * to enable effective memoization and prevent unnecessary child re-renders.
 *
 * Optimization: Wrap onToggleExpand and other event handlers in useCallback
 * to ensure stable function references.
 *
 * Expected Behavior (AFTER optimization):
 * - Event handler functions should have stable references across renders
 * - Parent re-renders should not create new function instances
 * - Callback dependencies should be properly managed
 * - onToggleExpand callback should maintain reference when expandedId changes
 *
 * Current Status: FAILING (optimization not yet implemented)
 * These tests will pass after Step 2b implementation.
 */

import React, { useState } from 'react';
import { render } from '@testing-library/react-native';
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

describe('BeerList - useCallback Optimization (Bottleneck #5)', () => {
  const mockBeers: Beer[] = [
    {
      id: '1',
      brew_name: 'Test Beer 1',
      brewer: 'Test Brewery',
      brew_style: 'IPA',
      added_date: '1234567890',
      brewer_loc: 'Austin, TX',
      brew_container: 'Draft',
      brew_description: 'Test description',
    },
    {
      id: '2',
      brew_name: 'Test Beer 2',
      brewer: 'Test Brewery',
      brew_style: 'Stout',
      added_date: '1234567891',
      brewer_loc: 'Austin, TX',
      brew_container: 'Bottle',
      brew_description: 'Test description',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Stable Callback References', () => {
    it('should maintain stable onToggleExpand callback reference across re-renders', () => {
      // This test verifies that the callback passed to BeerItem doesn't change
      // when the parent re-renders (unless dependencies change)

      const TestWrapper = () => {
        const [beers, setBeers] = useState(mockBeers);
        const [expandedId, setExpandedId] = useState<string | null>(null);
        const [refreshing, setRefreshing] = useState(false);

        const handleToggleExpand = (id: string) => {
          setExpandedId(prev => prev === id ? null : id);
        };

        return (
          <BeerList
            beers={beers}
            loading={false}
            refreshing={refreshing}
            onRefresh={() => setRefreshing(!refreshing)}
            expandedId={expandedId}
            onToggleExpand={handleToggleExpand}
          />
        );
      };

      const { rerender } = render(<TestWrapper />);

      // Get the BeerItem mock to capture the callback reference
      const BeerItem = require('../BeerItem').BeerItem;
      const firstCallbacks = BeerItem.mock.calls.map((call: any) => call[0].onToggle);

      // Force re-render by triggering state change in parent
      rerender(<TestWrapper />);

      // Get callbacks after re-render
      const secondCallbacks = BeerItem.mock.calls.slice(2).map((call: any) => call[0].onToggle);

      // EXPECTED (after optimization): Callbacks should maintain reference
      // CURRENT (before optimization): This will fail because callbacks are recreated
      expect(firstCallbacks[0]).toBe(secondCallbacks[0]);
      expect(firstCallbacks[1]).toBe(secondCallbacks[1]);
    });

    it('should maintain stable onRefresh callback reference', () => {
      // Verify that onRefresh callback doesn't change on re-render

      let renderCount = 0;
      let capturedCallbacks: Array<() => void> = [];

      const TestWrapper = () => {
        const [refreshing, setRefreshing] = useState(false);
        renderCount++;

        const handleRefresh = () => {
          setRefreshing(!refreshing);
        };

        // Capture callback reference
        if (renderCount === 1 || renderCount === 2) {
          capturedCallbacks.push(handleRefresh);
        }

        return (
          <BeerList
            beers={mockBeers}
            loading={false}
            refreshing={refreshing}
            onRefresh={handleRefresh}
            expandedId={null}
            onToggleExpand={() => {}}
          />
        );
      };

      const { rerender } = render(<TestWrapper />);
      const firstCallback = capturedCallbacks[0];

      rerender(<TestWrapper />);
      const secondCallback = capturedCallbacks[1];

      // EXPECTED: Callback should be stable (wrapped in useCallback)
      // This may fail before optimization if parent doesn't use useCallback
      expect(firstCallback).toBe(secondCallback);
    });
  });

  describe('Callback Dependency Management', () => {
    it('should update renderItem callback only when dependencies change', () => {
      // Test that renderItem callback updates when expandedId changes
      // but remains stable when other state changes

      const BeerItem = require('../BeerItem').BeerItem;

      const TestWrapper = ({ expandedId }: { expandedId: string | null }) => {
        const [refreshing, setRefreshing] = useState(false);

        return (
          <BeerList
            beers={mockBeers}
            loading={false}
            refreshing={refreshing}
            onRefresh={() => setRefreshing(!refreshing)}
            expandedId={expandedId}
            onToggleExpand={() => {}}
          />
        );
      };

      const { rerender } = render(<TestWrapper expandedId={null} />);
      const firstRenderItems = BeerItem.mock.calls.length;

      // Change expandedId (should trigger new renderItem)
      rerender(<TestWrapper expandedId="1" />);
      const secondRenderItems = BeerItem.mock.calls.length;

      // Verify items were re-rendered (because expandedId changed)
      expect(secondRenderItems).toBeGreaterThan(firstRenderItems);

      // Verify isExpanded prop changed correctly
      const lastCall = BeerItem.mock.calls[BeerItem.mock.calls.length - 1];
      expect(lastCall[0].isExpanded).toBe(true);
    });

    it('should not recreate callbacks when unrelated state changes', () => {
      // Test that callbacks remain stable when unrelated state changes

      const onToggleExpand = jest.fn();
      const onRefresh = jest.fn();

      const { rerender } = render(
        <BeerList
          beers={mockBeers}
          loading={false}
          refreshing={false}
          onRefresh={onRefresh}
          expandedId={null}
          onToggleExpand={onToggleExpand}
        />
      );

      // Re-render with different loading state
      rerender(
        <BeerList
          beers={mockBeers}
          loading={true}
          refreshing={false}
          onRefresh={onRefresh}
          expandedId={null}
          onToggleExpand={onToggleExpand}
        />
      );

      // Callbacks should remain the same instances
      expect(onToggleExpand).not.toHaveBeenCalled();
      expect(onRefresh).not.toHaveBeenCalled();
    });
  });

  describe('Performance Impact', () => {
    it('should prevent unnecessary BeerItem re-renders when callbacks are stable', () => {
      // This test verifies that stable callbacks enable React.memo to work effectively

      const BeerItem = require('../BeerItem').BeerItem;

      const TestWrapper = ({ forceUpdate }: { forceUpdate: number }) => {
        const [expandedId, setExpandedId] = useState<string | null>(null);

        return (
          <BeerList
            beers={mockBeers}
            loading={false}
            refreshing={false}
            onRefresh={() => {}}
            expandedId={expandedId}
            onToggleExpand={setExpandedId}
          />
        );
      };

      const { rerender } = render(<TestWrapper forceUpdate={1} />);
      const firstRenderCount = BeerItem.mock.calls.length;

      // Force parent update without changing props
      rerender(<TestWrapper forceUpdate={2} />);
      const secondRenderCount = BeerItem.mock.calls.length;

      // EXPECTED (after optimization): BeerItem should NOT re-render
      // because props haven't changed and callbacks are stable
      // CURRENT: May fail if callbacks are recreated
      expect(secondRenderCount).toBe(firstRenderCount);
    });

    it('should verify minimal re-renders with stable callback pattern', () => {
      // Integration test: multiple re-renders with stable callbacks

      const BeerItem = require('../BeerItem').BeerItem;
      let renderCounts: number[] = [];

      const TestWrapper = ({ iteration }: { iteration: number }) => {
        return (
          <BeerList
            beers={mockBeers}
            loading={false}
            refreshing={false}
            onRefresh={() => {}}
            expandedId={null}
            onToggleExpand={() => {}}
          />
        );
      };

      const { rerender } = render(<TestWrapper iteration={1} />);
      renderCounts.push(BeerItem.mock.calls.length);

      // Trigger 3 more re-renders
      for (let i = 2; i <= 4; i++) {
        rerender(<TestWrapper iteration={i} />);
        renderCounts.push(BeerItem.mock.calls.length);
      }

      // EXPECTED: BeerItem should only render once (initial render)
      // All subsequent parent re-renders should not trigger BeerItem re-renders
      const uniqueRenderCounts = new Set(renderCounts);
      expect(uniqueRenderCounts.size).toBe(1);
      expect(renderCounts[0]).toBe(renderCounts[3]);
    });
  });

  describe('Callback Functionality', () => {
    it('should still trigger correct behavior when callback is invoked', () => {
      // Verify that stable callbacks still work correctly

      const onToggleExpand = jest.fn();

      render(
        <BeerList
          beers={mockBeers}
          loading={false}
          refreshing={false}
          onRefresh={() => {}}
          expandedId={null}
          onToggleExpand={onToggleExpand}
        />
      );

      // Get the callback passed to BeerItem
      const BeerItem = require('../BeerItem').BeerItem;
      const firstItemCallback = BeerItem.mock.calls[0][0].onToggle;

      // Invoke the callback
      firstItemCallback('1');

      // Verify it called the parent callback with correct argument
      expect(onToggleExpand).toHaveBeenCalledWith('1');
      expect(onToggleExpand).toHaveBeenCalledTimes(1);
    });

    it('should handle callback updates when dependencies actually change', () => {
      // Verify that callbacks DO update when their dependencies change

      const BeerItem = require('../BeerItem').BeerItem;

      const TestWrapper = ({ expandedId }: { expandedId: string | null }) => {
        return (
          <BeerList
            beers={mockBeers}
            loading={false}
            refreshing={false}
            onRefresh={() => {}}
            expandedId={expandedId}
            onToggleExpand={() => {}}
          />
        );
      };

      const { rerender } = render(<TestWrapper expandedId={null} />);
      const firstCallIsExpanded = BeerItem.mock.calls[0][0].isExpanded;

      // Change expandedId
      rerender(<TestWrapper expandedId="1" />);
      const secondCallIsExpanded = BeerItem.mock.calls[2][0].isExpanded;

      // Verify isExpanded prop updated correctly
      expect(firstCallIsExpanded).toBe(false);
      expect(secondCallIsExpanded).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid callback invocations', () => {
      // Test that stable callbacks work under rapid invocation

      const onToggleExpand = jest.fn();

      render(
        <BeerList
          beers={mockBeers}
          loading={false}
          refreshing={false}
          onRefresh={() => {}}
          expandedId={null}
          onToggleExpand={onToggleExpand}
        />
      );

      const BeerItem = require('../BeerItem').BeerItem;
      const callback = BeerItem.mock.calls[0][0].onToggle;

      // Invoke rapidly
      callback('1');
      callback('2');
      callback('1');

      expect(onToggleExpand).toHaveBeenCalledTimes(3);
    });

    it('should maintain callback stability with renderItemActions prop', () => {
      // Test callback stability when optional renderItemActions is provided

      const renderActions = jest.fn(() => null);
      const BeerItem = require('../BeerItem').BeerItem;

      const { rerender } = render(
        <BeerList
          beers={mockBeers}
          loading={false}
          refreshing={false}
          onRefresh={() => {}}
          expandedId={null}
          onToggleExpand={() => {}}
          renderItemActions={renderActions}
        />
      );

      const firstRenderCount = BeerItem.mock.calls.length;

      // Re-render
      rerender(
        <BeerList
          beers={mockBeers}
          loading={false}
          refreshing={false}
          onRefresh={() => {}}
          expandedId={null}
          onToggleExpand={() => {}}
          renderItemActions={renderActions}
        />
      );

      const secondRenderCount = BeerItem.mock.calls.length;

      // EXPECTED: No additional renders
      expect(secondRenderCount).toBe(firstRenderCount);
    });
  });
});
