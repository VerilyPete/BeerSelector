/**
 * MP-3 Step 2a: Tests for Bottleneck #3 - Filter Logic Optimization
 *
 * Purpose: Verify that filter logic is optimized for parallel evaluation and
 * early exit when no filters are active, reducing CPU overhead.
 *
 * Optimization:
 * - Implement early exit when no filters are active (skip filtering entirely)
 * - Use parallel filter evaluation instead of sequential chaining
 * - Reduce filter execution time from 15-20ms to < 10ms for 200 beers
 *
 * Expected Behavior (AFTER optimization):
 * - Early exit when no filters active (0ms processing time)
 * - Parallel evaluation of all filters in single pass
 * - Performance < 10ms for 200 beers with all filters active
 * - Correct filter results maintained
 *
 * Current Status: PARTIALLY OPTIMIZED (sequential filtering, no early exit)
 * These tests will fully pass after Step 2b implementation.
 */

import { renderHook, act } from '@testing-library/react-native';
import { useBeerFilters, applyFilters } from '../useBeerFilters';
import { Beer } from '@/src/types/beer';

describe('useBeerFilters - Optimization (Bottleneck #3)', () => {
  const createMockBeer = (overrides: Partial<Beer> = {}): Beer => ({
    id: '1',
    brew_name: 'Test IPA',
    brewer: 'Test Brewery',
    brew_style: 'IPA',
    added_date: '1234567890',
    brewer_loc: 'Austin, TX',
    brew_container: 'Draft',
    brew_description: 'Test description',
    ...overrides,
  });

  const createMockBeers = (count: number): Beer[] =>
    Array.from({ length: count }, (_, i) => createMockBeer({
      id: String(i + 1),
      brew_name: `Beer ${i + 1}`,
      brew_style: i % 3 === 0 ? 'IPA' : i % 3 === 1 ? 'Stout' : 'Porter',
      brew_container: i % 2 === 0 ? 'Draft' : 'Bottle',
    }));

  describe('Early Exit Optimization', () => {
    it('should skip filtering when no filters are active', () => {
      const beers = createMockBeers(200);

      // Measure time with no filters
      const startTime = performance.now();

      const result = applyFilters(beers, {
        searchText: '',
        isDraft: false,
        isHeavies: false,
        isIpa: false,
      });

      const endTime = performance.now();
      const duration = endTime - startTime;

      // EXPECTED (after optimization): Should return immediately (< 1ms)
      // CURRENT (before optimization): Still processes all beers (~5-10ms)
      expect(duration).toBeLessThan(1);

      // Should return original array (no filtering needed)
      expect(result).toHaveLength(beers.length);
    });

    it('should early exit with empty search and no filters', () => {
      const beers = createMockBeers(1000);

      const startTime = performance.now();

      const result = applyFilters(beers, {
        searchText: '',
        isDraft: false,
        isHeavies: false,
        isIpa: false,
      });

      const endTime = performance.now();

      // EXPECTED: Near-instant return with large dataset
      expect(endTime - startTime).toBeLessThan(1);
      expect(result.length).toBe(1000);
    });

    it('should not early exit when search text is provided', () => {
      const beers = createMockBeers(200);

      const result = applyFilters(beers, {
        searchText: 'IPA',
        isDraft: false,
        isHeavies: false,
        isIpa: false,
      });

      // Should filter based on search text
      expect(result.length).toBeLessThan(beers.length);
    });

    it('should not early exit when any filter is active', () => {
      const beers = createMockBeers(200);

      const resultDraft = applyFilters(beers, {
        searchText: '',
        isDraft: true,
        isHeavies: false,
        isIpa: false,
      });

      const resultIpa = applyFilters(beers, {
        searchText: '',
        isDraft: false,
        isHeavies: false,
        isIpa: true,
      });

      // Should apply filters
      expect(resultDraft.length).toBeLessThan(beers.length);
      expect(resultIpa.length).toBeLessThan(beers.length);
    });
  });

  describe('Parallel Filter Evaluation', () => {
    it('should evaluate all filters in single pass', () => {
      // Test that filters are applied in parallel, not sequentially

      const beers = createMockBeers(200);

      // Apply multiple filters
      const result = applyFilters(beers, {
        searchText: 'Beer',
        isDraft: true,
        isHeavies: false,
        isIpa: true,
      });

      // EXPECTED (after optimization): Single pass through array
      // Each beer is evaluated against ALL filters once
      // CURRENT: Multiple passes (filter by search, then draft, then IPA)

      // Verify correct filtering (all conditions must be met)
      result.forEach(beer => {
        expect(beer.brew_name.includes('Beer')).toBe(true);
        expect(beer.brew_container).toContain('Draft');
        expect(beer.brew_style).toContain('IPA');
      });
    });

    it('should complete filtering in < 10ms for 200 beers with all filters', () => {
      const beers = createMockBeers(200);

      const startTime = performance.now();

      applyFilters(beers, {
        searchText: 'Beer',
        isDraft: true,
        isHeavies: false,
        isIpa: true,
      });

      const endTime = performance.now();
      const duration = endTime - startTime;

      // EXPECTED (after optimization): < 10ms
      // CURRENT: 15-20ms (sequential filtering)
      expect(duration).toBeLessThan(10);
    });

    it('should maintain performance with complex search patterns', () => {
      const beers = createMockBeers(500);

      const startTime = performance.now();

      applyFilters(beers, {
        searchText: 'Test Brewery IPA Draft',
        isDraft: true,
        isHeavies: false,
        isIpa: true,
      });

      const endTime = performance.now();

      // Should remain efficient even with complex search
      expect(endTime - startTime).toBeLessThan(15);
    });
  });

  describe('Performance Benchmarks', () => {
    it('should handle 200 beers with no filters in < 1ms', () => {
      const beers = createMockBeers(200);

      const startTime = performance.now();

      applyFilters(beers, {
        searchText: '',
        isDraft: false,
        isHeavies: false,
        isIpa: false,
      });

      const endTime = performance.now();

      // EXPECTED: Early exit optimization
      expect(endTime - startTime).toBeLessThan(1);
    });

    it('should handle 200 beers with search in < 8ms', () => {
      const beers = createMockBeers(200);

      const startTime = performance.now();

      applyFilters(beers, {
        searchText: 'IPA',
        isDraft: false,
        isHeavies: false,
        isIpa: false,
      });

      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(8);
    });

    it('should handle 200 beers with single filter in < 6ms', () => {
      const beers = createMockBeers(200);

      const startTime = performance.now();

      applyFilters(beers, {
        searchText: '',
        isDraft: true,
        isHeavies: false,
        isIpa: false,
      });

      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(6);
    });

    it('should handle 200 beers with all filters in < 10ms', () => {
      const beers = createMockBeers(200);

      const startTime = performance.now();

      applyFilters(beers, {
        searchText: 'Beer',
        isDraft: true,
        isHeavies: false,
        isIpa: true,
      });

      const endTime = performance.now();

      // EXPECTED: < 10ms (target from bottleneck analysis)
      expect(endTime - startTime).toBeLessThan(10);
    });

    it('should scale efficiently with larger datasets (500 beers)', () => {
      const beers = createMockBeers(500);

      const startTime = performance.now();

      applyFilters(beers, {
        searchText: 'IPA',
        isDraft: true,
        isHeavies: false,
        isIpa: false,
      });

      const endTime = performance.now();

      // Should scale linearly (500 beers ~= 2.5x 200 beers)
      expect(endTime - startTime).toBeLessThan(25);
    });
  });

  describe('Filter Correctness', () => {
    it('should maintain correct results with parallel evaluation', () => {
      const beers = [
        createMockBeer({ id: '1', brew_style: 'IPA', brew_container: 'Draft' }),
        createMockBeer({ id: '2', brew_style: 'Stout', brew_container: 'Draft' }),
        createMockBeer({ id: '3', brew_style: 'IPA', brew_container: 'Bottle' }),
        createMockBeer({ id: '4', brew_style: 'Porter', brew_container: 'Can' }),
      ];

      const result = applyFilters(beers, {
        searchText: '',
        isDraft: true,
        isHeavies: false,
        isIpa: true,
      });

      // Should only return beer 1 (IPA + Draft)
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('should correctly combine search and filters', () => {
      const beers = [
        createMockBeer({ id: '1', brew_name: 'Hazy IPA', brew_style: 'IPA', brew_container: 'Draft' }),
        createMockBeer({ id: '2', brew_name: 'Clear IPA', brew_style: 'IPA', brew_container: 'Bottle' }),
        createMockBeer({ id: '3', brew_name: 'Hazy Stout', brew_style: 'Stout', brew_container: 'Draft' }),
      ];

      const result = applyFilters(beers, {
        searchText: 'Hazy',
        isDraft: true,
        isHeavies: false,
        isIpa: true,
      });

      // Should only return beer 1 (Hazy + IPA + Draft)
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('should handle edge case with no matches', () => {
      const beers = createMockBeers(100);

      const result = applyFilters(beers, {
        searchText: 'NonExistentBeer',
        isDraft: true,
        isHeavies: true,
        isIpa: true,
      });

      expect(result).toHaveLength(0);
    });
  });

  describe('Filter Logic Optimization Details', () => {
    it('should use AND logic for multiple filters', () => {
      const beers = [
        createMockBeer({ id: '1', brew_style: 'Imperial Stout', brew_container: 'Draft' }),
        createMockBeer({ id: '2', brew_style: 'IPA', brew_container: 'Draft' }),
        createMockBeer({ id: '3', brew_style: 'Imperial Stout', brew_container: 'Bottle' }),
      ];

      const result = applyFilters(beers, {
        searchText: '',
        isDraft: true,
        isHeavies: true, // Stout
        isIpa: false,
      });

      // Should only return beer 1 (Stout AND Draft)
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('should optimize case-insensitive search', () => {
      const beers = [
        createMockBeer({ id: '1', brew_name: 'HAZY IPA' }),
        createMockBeer({ id: '2', brew_name: 'hazy ipa' }),
        createMockBeer({ id: '3', brew_name: 'Hazy IPA' }),
      ];

      const result = applyFilters(beers, {
        searchText: 'HaZy',
        isDraft: false,
        isHeavies: false,
        isIpa: false,
      });

      // All should match (case-insensitive)
      expect(result).toHaveLength(3);
    });

    it('should search across multiple beer fields', () => {
      const beers = [
        createMockBeer({ id: '1', brew_name: 'Test Beer', brewer: 'Other', brew_style: 'Lager', brewer_loc: 'NYC' }),
        createMockBeer({ id: '2', brew_name: 'Other Beer', brewer: 'Searchable Brewery', brew_style: 'Lager', brewer_loc: 'NYC' }),
        createMockBeer({ id: '3', brew_name: 'Other Beer', brewer: 'Other', brew_style: 'Searchable Style', brewer_loc: 'NYC' }),
        createMockBeer({ id: '4', brew_name: 'Other Beer', brewer: 'Other', brew_style: 'Lager', brewer_loc: 'Searchable City' }),
      ];

      const result = applyFilters(beers, {
        searchText: 'Searchable',
        isDraft: false,
        isHeavies: false,
        isIpa: false,
      });

      // Should find in brewer, style, and location
      expect(result).toHaveLength(3);
      expect(result.map(b => b.id).sort()).toEqual(['2', '3', '4']);
    });
  });

  describe('Integration with useBeerFilters Hook', () => {
    it('should apply optimizations in hook context', () => {
      const beers = createMockBeers(200);

      const { result } = renderHook(() => useBeerFilters(beers));

      const startTime = performance.now();

      // No filters active - should use early exit
      const filtered = result.current.filteredBeers;

      const endTime = performance.now();

      // EXPECTED: Fast return with no filters
      expect(endTime - startTime).toBeLessThan(2);
      expect(filtered).toHaveLength(200);
    });

    it('should maintain performance when toggling filters', () => {
      const beers = createMockBeers(200);

      const { result } = renderHook(() => useBeerFilters(beers));

      // Toggle filter
      act(() => {
        result.current.toggleFilter('isDraft');
      });

      const startTime = performance.now();
      const filtered = result.current.filteredBeers;
      const endTime = performance.now();

      // Should complete quickly
      expect(endTime - startTime).toBeLessThan(5);
      expect(filtered.length).toBeLessThan(beers.length);
    });

    it('should handle rapid filter changes efficiently', () => {
      const beers = createMockBeers(200);

      const { result } = renderHook(() => useBeerFilters(beers));

      const times: number[] = [];

      // Rapidly toggle filters
      for (let i = 0; i < 5; i++) {
        const startTime = performance.now();

        act(() => {
          result.current.toggleFilter('isDraft');
        });

        const filtered = result.current.filteredBeers;
        const endTime = performance.now();

        times.push(endTime - startTime);
      }

      // All operations should be fast
      times.forEach(time => {
        expect(time).toBeLessThan(10);
      });
    });
  });

  describe('Memory Efficiency', () => {
    it('should not create unnecessary intermediate arrays', () => {
      // Test that optimization doesn't create multiple filtered copies

      const beers = createMockBeers(200);

      // With early exit, should return original array reference
      const result1 = applyFilters(beers, {
        searchText: '',
        isDraft: false,
        isHeavies: false,
        isIpa: false,
      });

      // EXPECTED (after optimization): Same reference (no filtering occurred)
      // CURRENT: New array created even with no filters
      expect(result1).toBe(beers); // Ideal optimization

      // Note: This might not be achievable due to immutability requirements
      // Alternative: verify no intermediate arrays during filtering
    });

    it('should efficiently handle filter combinations', () => {
      const beers = createMockBeers(1000);

      // Multiple filter combinations shouldn't cause memory issues
      const result1 = applyFilters(beers, {
        searchText: 'IPA',
        isDraft: true,
        isHeavies: false,
        isIpa: true,
      });

      const result2 = applyFilters(beers, {
        searchText: 'Stout',
        isDraft: false,
        isHeavies: true,
        isIpa: false,
      });

      const result3 = applyFilters(beers, {
        searchText: '',
        isDraft: true,
        isHeavies: false,
        isIpa: false,
      });

      // All operations should complete without memory issues
      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
      expect(result3).toBeDefined();
    });
  });

  describe('Regression Prevention', () => {
    it('should not break existing filter behavior', () => {
      const beers = [
        createMockBeer({ id: '1', brew_style: 'IPA', brew_container: 'Draft' }),
        createMockBeer({ id: '2', brew_style: 'Stout', brew_container: 'Draft' }),
        createMockBeer({ id: '3', brew_style: 'IPA', brew_container: 'Bottle' }),
      ];

      // Test each filter individually
      const draftResult = applyFilters(beers, {
        searchText: '',
        isDraft: true,
        isHeavies: false,
        isIpa: false,
      });
      expect(draftResult).toHaveLength(2);

      const ipaResult = applyFilters(beers, {
        searchText: '',
        isDraft: false,
        isHeavies: false,
        isIpa: true,
      });
      expect(ipaResult).toHaveLength(2);

      const combinedResult = applyFilters(beers, {
        searchText: '',
        isDraft: true,
        isHeavies: false,
        isIpa: true,
      });
      expect(combinedResult).toHaveLength(1);
      expect(combinedResult[0].id).toBe('1');
    });

    it('should maintain mutual exclusivity of Heavies and IPA filters', () => {
      const beers = createMockBeers(100);

      // Note: Mutual exclusivity is handled in useBeerFilters hook, not applyFilters
      // This test documents the expected behavior

      const { result } = renderHook(() => useBeerFilters(beers));

      // Enable Heavies
      act(() => {
        result.current.toggleFilter('isHeavies');
      });

      expect(result.current.filters.isHeavies).toBe(true);
      expect(result.current.filters.isIpa).toBe(false);

      // Enable IPA (should disable Heavies)
      act(() => {
        result.current.toggleFilter('isIpa');
      });

      expect(result.current.filters.isHeavies).toBe(false);
      expect(result.current.filters.isIpa).toBe(true);
    });
  });
});
