/**
 * MP-3 Step 2a: Tests for Bottleneck #3 - Filter Logic Optimization
 *
 * Purpose: Verify that filter logic is optimized for parallel evaluation and
 * early exit when no filters are active, reducing CPU overhead.
 *
 * Updated for filter-bar-redesign: uses new FilterOptions shape with
 * containerFilter instead of isDraft/isHeavies/isIpa, and applySorting
 * now takes a direction parameter.
 */

import { applyFilters, applySorting } from '../useBeerFilters';
import { BeerWithContainerType } from '@/src/types/beer';

describe('useBeerFilters - Optimization (Bottleneck #3)', () => {
  const createMockBeer = (
    overrides: Partial<BeerWithContainerType> = {}
  ): BeerWithContainerType => ({
    id: '1',
    brew_name: 'Test IPA',
    brewer: 'Test Brewery',
    brew_style: 'IPA',
    added_date: '1234567890',
    brewer_loc: 'Austin, TX',
    brew_container: 'Draft',
    brew_description: 'Test description',
    container_type: 'tulip',
    enrichment_confidence: null,
    enrichment_source: null,
    ...overrides,
  });

  const createMockBeers = (count: number): BeerWithContainerType[] =>
    Array.from({ length: count }, (_, i) =>
      createMockBeer({
        id: String(i + 1),
        brew_name: `Beer ${i + 1}`,
        brew_style: i % 3 === 0 ? 'IPA' : i % 3 === 1 ? 'Stout' : 'Porter',
        brew_container: i % 2 === 0 ? 'Draft' : 'Bottle',
        container_type: i % 3 === 0 ? 'tulip' : 'pint',
      })
    );

  describe('Early Exit Optimization', () => {
    it('should skip filtering when no filters are active', () => {
      const beers = createMockBeers(200);

      const startTime = performance.now();

      const result = applyFilters(beers, {
        searchText: '',
        containerFilter: 'all',
      });

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(1);
      expect(result).toHaveLength(beers.length);
    });

    it('should early exit with empty search and no filters', () => {
      const beers = createMockBeers(1000);

      const startTime = performance.now();

      const result = applyFilters(beers, {
        searchText: '',
        containerFilter: 'all',
      });

      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(1);
      expect(result.length).toBe(1000);
    });

    it('should not early exit when search text is provided', () => {
      const beers = createMockBeers(200);

      const result = applyFilters(beers, {
        searchText: 'IPA',
        containerFilter: 'all',
      });

      expect(result.length).toBeLessThan(beers.length);
    });

    it('should not early exit when container filter is active', () => {
      const beers = createMockBeers(200);

      const resultDraft = applyFilters(beers, {
        searchText: '',
        containerFilter: 'draft',
      });

      const resultCans = applyFilters(beers, {
        searchText: '',
        containerFilter: 'cans',
      });

      expect(resultDraft.length).toBeLessThan(beers.length);
      expect(resultCans.length).toBeLessThan(beers.length);
    });
  });

  describe('Parallel Filter Evaluation', () => {
    it('should evaluate container filter and search in single pass', () => {
      const beers = createMockBeers(200);

      const result = applyFilters(beers, {
        searchText: 'Beer',
        containerFilter: 'draft',
      });

      result.forEach(beer => {
        expect(beer.brew_name.includes('Beer')).toBe(true);
        expect(beer.brew_container.toLowerCase()).toMatch(/draft|draught/);
      });
    });

    it('should complete filtering in < 10ms for 200 beers with all filters', () => {
      const beers = createMockBeers(200);

      const startTime = performance.now();

      applyFilters(beers, {
        searchText: 'Beer',
        containerFilter: 'draft',
      });

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(10);
    });

    it('should maintain performance with complex search patterns', () => {
      const beers = createMockBeers(500);

      const startTime = performance.now();

      applyFilters(beers, {
        searchText: 'Test Brewery IPA Draft',
        containerFilter: 'draft',
      });

      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(15);
    });
  });

  describe('Performance Benchmarks', () => {
    it('should handle 200 beers with no filters in < 1ms', () => {
      const beers = createMockBeers(200);

      const startTime = performance.now();

      applyFilters(beers, {
        searchText: '',
        containerFilter: 'all',
      });

      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(1);
    });

    it('should handle 200 beers with search in < 8ms', () => {
      const beers = createMockBeers(200);

      const startTime = performance.now();

      applyFilters(beers, {
        searchText: 'IPA',
        containerFilter: 'all',
      });

      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(8);
    });

    it('should handle 200 beers with container filter in < 6ms', () => {
      const beers = createMockBeers(200);

      const startTime = performance.now();

      applyFilters(beers, {
        searchText: '',
        containerFilter: 'draft',
      });

      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(6);
    });

    it('should handle 200 beers with all filters in < 10ms', () => {
      const beers = createMockBeers(200);

      const startTime = performance.now();

      applyFilters(beers, {
        searchText: 'Beer',
        containerFilter: 'draft',
      });

      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(10);
    });

    it('should scale efficiently with larger datasets (500 beers)', () => {
      const beers = createMockBeers(500);

      const startTime = performance.now();

      applyFilters(beers, {
        searchText: 'IPA',
        containerFilter: 'draft',
      });

      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(25);
    });
  });

  describe('Filter Correctness', () => {
    it('should maintain correct results with container filter', () => {
      const beers = [
        createMockBeer({ id: '1', brew_style: 'IPA', brew_container: 'Draft' }),
        createMockBeer({ id: '2', brew_style: 'Stout', brew_container: 'Draft' }),
        createMockBeer({ id: '3', brew_style: 'IPA', brew_container: 'Bottle' }),
        createMockBeer({ id: '4', brew_style: 'Porter', brew_container: 'Can' }),
      ];

      const draftResult = applyFilters(beers, {
        searchText: '',
        containerFilter: 'draft',
      });

      expect(draftResult).toHaveLength(2);
      expect(draftResult.map(b => b.id).sort()).toEqual(['1', '2']);

      const cansResult = applyFilters(beers, {
        searchText: '',
        containerFilter: 'cans',
      });

      // 'cans' matches "bottle" or "can"
      expect(cansResult).toHaveLength(2);
      expect(cansResult.map(b => b.id).sort()).toEqual(['3', '4']);
    });

    it('should correctly combine search and container filter', () => {
      const beers = [
        createMockBeer({
          id: '1',
          brew_name: 'Hazy IPA',
          brew_style: 'IPA',
          brew_container: 'Draft',
        }),
        createMockBeer({
          id: '2',
          brew_name: 'Clear IPA',
          brew_style: 'IPA',
          brew_container: 'Bottle',
        }),
        createMockBeer({
          id: '3',
          brew_name: 'Hazy Stout',
          brew_style: 'Stout',
          brew_container: 'Draft',
        }),
      ];

      const result = applyFilters(beers, {
        searchText: 'Hazy',
        containerFilter: 'draft',
      });

      expect(result).toHaveLength(2);
      expect(result.map(b => b.id).sort()).toEqual(['1', '3']);
    });

    it('should handle edge case with no matches', () => {
      const beers = createMockBeers(100);

      const result = applyFilters(beers, {
        searchText: 'NonExistentBeer',
        containerFilter: 'draft',
      });

      expect(result).toHaveLength(0);
    });
  });

  describe('Filter Logic Optimization Details', () => {
    it('should optimize case-insensitive search', () => {
      const beers = [
        createMockBeer({ id: '1', brew_name: 'HAZY IPA' }),
        createMockBeer({ id: '2', brew_name: 'hazy ipa' }),
        createMockBeer({ id: '3', brew_name: 'Hazy IPA' }),
      ];

      const result = applyFilters(beers, {
        searchText: 'HaZy',
        containerFilter: 'all',
      });

      expect(result).toHaveLength(3);
    });

    it('should search across multiple beer fields', () => {
      const beers = [
        createMockBeer({
          id: '1',
          brew_name: 'Test Beer',
          brewer: 'Other',
          brew_style: 'Lager',
          brewer_loc: 'NYC',
        }),
        createMockBeer({
          id: '2',
          brew_name: 'Other Beer',
          brewer: 'Searchable Brewery',
          brew_style: 'Lager',
          brewer_loc: 'NYC',
        }),
        createMockBeer({
          id: '3',
          brew_name: 'Other Beer',
          brewer: 'Other',
          brew_style: 'Searchable Style',
          brewer_loc: 'NYC',
        }),
        createMockBeer({
          id: '4',
          brew_name: 'Other Beer',
          brewer: 'Other',
          brew_style: 'Lager',
          brewer_loc: 'Searchable City',
        }),
      ];

      const result = applyFilters(beers, {
        searchText: 'Searchable',
        containerFilter: 'all',
      });

      expect(result).toHaveLength(3);
      expect(result.map(b => b.id).sort()).toEqual(['2', '3', '4']);
    });
  });

  describe('Sorting with Direction', () => {
    it('should sort by name ascending with direction parameter', () => {
      const beers = [
        createMockBeer({ id: '1', brew_name: 'Zebra Ale' }),
        createMockBeer({ id: '2', brew_name: 'Alpha Beer' }),
      ];

      const result = applySorting(beers, 'name', 'asc');
      expect(result[0].brew_name).toBe('Alpha Beer');
      expect(result[1].brew_name).toBe('Zebra Ale');
    });

    it('should sort by name descending with direction parameter', () => {
      const beers = [
        createMockBeer({ id: '1', brew_name: 'Alpha Beer' }),
        createMockBeer({ id: '2', brew_name: 'Zebra Ale' }),
      ];

      const result = applySorting(beers, 'name', 'desc');
      expect(result[0].brew_name).toBe('Zebra Ale');
      expect(result[1].brew_name).toBe('Alpha Beer');
    });

    it('should sort by date descending with direction parameter', () => {
      const beers = [
        createMockBeer({ id: '1', added_date: '1000' }),
        createMockBeer({ id: '2', added_date: '2000' }),
      ];

      const result = applySorting(beers, 'date', 'desc');
      expect(result[0].id).toBe('2');
      expect(result[1].id).toBe('1');
    });

    it('should sort by date ascending with direction parameter', () => {
      const beers = [
        createMockBeer({ id: '1', added_date: '2000' }),
        createMockBeer({ id: '2', added_date: '1000' }),
      ];

      const result = applySorting(beers, 'date', 'asc');
      expect(result[0].id).toBe('2');
      expect(result[1].id).toBe('1');
    });
  });

  describe('Memory Efficiency', () => {
    it('should not create unnecessary intermediate arrays', () => {
      const beers = createMockBeers(200);

      const result1 = applyFilters(beers, {
        searchText: '',
        containerFilter: 'all',
      });

      expect(result1).toBe(beers);
    });

    it('should efficiently handle filter combinations', () => {
      const beers = createMockBeers(1000);

      const result1 = applyFilters(beers, {
        searchText: 'IPA',
        containerFilter: 'draft',
      });

      const result2 = applyFilters(beers, {
        searchText: 'Stout',
        containerFilter: 'cans',
      });

      const result3 = applyFilters(beers, {
        searchText: '',
        containerFilter: 'draft',
      });

      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
      expect(result3).toBeDefined();
    });
  });
});
