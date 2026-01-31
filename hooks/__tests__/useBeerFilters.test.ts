import {
  applyFilters,
  applySorting,
  nextContainerFilter,
  nextSortOption,
  defaultDirectionForSort,
} from '../useBeerFilters';
import { BeerWithContainerType, BeerfinderWithContainerType } from '@/src/types/beer';

describe('useBeerFilters - Filter Logic', () => {
  const mockBeers: BeerWithContainerType[] = [
    {
      id: '1',
      brew_name: 'Alpha IPA',
      brewer: 'Test Brewery A',
      brewer_loc: 'Austin, TX',
      brew_style: 'IPA',
      brew_container: 'Draft',
      brew_description: 'A hoppy beer',
      added_date: '1704067200', // Jan 1, 2024
      abv: 6.5,
      container_type: 'tulip',
      enrichment_confidence: null,
      enrichment_source: null,
    },
    {
      id: '2',
      brew_name: 'Zeta Stout',
      brewer: 'Test Brewery B',
      brewer_loc: 'Portland, OR',
      brew_style: 'Stout',
      brew_container: 'Bottle',
      brew_description: 'A dark beer',
      added_date: '1704153600', // Jan 2, 2024
      abv: 8.2,
      container_type: 'pint',
      enrichment_confidence: null,
      enrichment_source: null,
    },
    {
      id: '3',
      brew_name: 'Beta Porter',
      brewer: 'Test Brewery C',
      brewer_loc: 'Denver, CO',
      brew_style: 'Porter',
      brew_container: 'Draught',
      brew_description: 'A smooth porter',
      added_date: '1704240000', // Jan 3, 2024
      abv: 5.4,
      container_type: 'pint',
      enrichment_confidence: null,
      enrichment_source: null,
    },
    {
      id: '4',
      brew_name: 'Gamma Lager',
      brewer: 'Test Brewery D',
      brewer_loc: 'Seattle, WA',
      brew_style: 'Lager',
      brew_container: 'Can',
      brew_description: 'A crisp lager',
      added_date: '1704326400', // Jan 4, 2024
      abv: 4.8,
      container_type: 'pint',
      enrichment_confidence: null,
      enrichment_source: null,
    },
    {
      id: '5',
      brew_name: 'Delta Hazy',
      brewer: 'Test Brewery E',
      brewer_loc: 'San Diego, CA',
      brew_style: 'Hazy IPA',
      brew_container: 'Draft',
      brew_description: 'A juicy hazy',
      added_date: '1704412800', // Jan 5, 2024
      abv: null,
      container_type: 'tulip',
      enrichment_confidence: null,
      enrichment_source: null,
    },
  ];

  describe('applyFilters', () => {
    describe('Container Filter - all', () => {
      it('should return all beers when containerFilter is all', () => {
        const result = applyFilters(mockBeers, {
          containerFilter: 'all',
          searchText: '',
        });

        expect(result).toHaveLength(5);
      });
    });

    describe('Container Filter - draft', () => {
      it('should filter beers matching "Draft" (case-insensitive)', () => {
        const result = applyFilters(mockBeers, {
          containerFilter: 'draft',
          searchText: '',
        });

        // IDs 1 (Draft), 3 (Draught), 5 (Draft)
        expect(result).toHaveLength(3);
        expect(result.map(b => b.id).sort()).toEqual(['1', '3', '5']);
      });

      it('should filter beers matching "Draught" (case-insensitive)', () => {
        const beersWithDraught: BeerWithContainerType[] = [
          { ...mockBeers[0], id: '10', brew_container: 'draught' },
          { ...mockBeers[0], id: '11', brew_container: 'DRAUGHT' },
          { ...mockBeers[0], id: '12', brew_container: 'Bottle' },
        ];

        const result = applyFilters(beersWithDraught, {
          containerFilter: 'draft',
          searchText: '',
        });

        expect(result).toHaveLength(2);
        expect(result.map(b => b.id).sort()).toEqual(['10', '11']);
      });
    });

    describe('Container Filter - cans', () => {
      it('should filter beers matching "Bottle" (case-insensitive)', () => {
        const result = applyFilters(mockBeers, {
          containerFilter: 'cans',
          searchText: '',
        });

        // IDs 2 (Bottle), 4 (Can)
        expect(result).toHaveLength(2);
        expect(result.map(b => b.id).sort()).toEqual(['2', '4']);
      });

      it('should filter beers matching "Can" (case-insensitive)', () => {
        const beersWithCans: BeerWithContainerType[] = [
          { ...mockBeers[0], id: '10', brew_container: 'can' },
          { ...mockBeers[0], id: '11', brew_container: 'CAN' },
          { ...mockBeers[0], id: '12', brew_container: 'Draft' },
        ];

        const result = applyFilters(beersWithCans, {
          containerFilter: 'cans',
          searchText: '',
        });

        expect(result).toHaveLength(2);
        expect(result.map(b => b.id).sort()).toEqual(['10', '11']);
      });
    });

    describe('Combined container filter + search text', () => {
      it('should apply both container filter and search text', () => {
        const result = applyFilters(mockBeers, {
          containerFilter: 'draft',
          searchText: 'alpha',
        });

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('1');
      });

      it('should return empty when container matches but search does not', () => {
        const result = applyFilters(mockBeers, {
          containerFilter: 'cans',
          searchText: 'nonexistent',
        });

        expect(result).toHaveLength(0);
      });
    });

    describe('Search Text', () => {
      it('should filter beers by search text in brew_name', () => {
        const result = applyFilters(mockBeers, {
          containerFilter: 'all',
          searchText: 'alpha',
        });

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('1');
      });

      it('should filter beers by search text in brewer', () => {
        const result = applyFilters(mockBeers, {
          containerFilter: 'all',
          searchText: 'Brewery B',
        });

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('2');
      });

      it('should filter beers by search text in brew_style', () => {
        const result = applyFilters(mockBeers, {
          containerFilter: 'all',
          searchText: 'stout',
        });

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('2');
      });

      it('should filter beers by search text in brewer_loc', () => {
        const result = applyFilters(mockBeers, {
          containerFilter: 'all',
          searchText: 'Portland',
        });

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('2');
      });

      it('should be case-insensitive', () => {
        const result = applyFilters(mockBeers, {
          containerFilter: 'all',
          searchText: 'ALPHA',
        });

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('1');
      });
    });

    describe('Early Exit', () => {
      it('should return original array reference when no filters active', () => {
        const result = applyFilters(mockBeers, {
          containerFilter: 'all',
          searchText: '',
        });

        expect(result).toBe(mockBeers); // Same reference, not just equal
      });
    });

    describe('Edge Cases', () => {
      it('should handle empty beer list', () => {
        const result = applyFilters([], {
          containerFilter: 'draft',
          searchText: '',
        });

        expect(result).toEqual([]);
      });

      it('should handle beers with empty brew_container', () => {
        const beersWithEmpty: BeerWithContainerType[] = [
          {
            id: '1',
            brew_name: 'Test Beer',
            brewer: 'Test Brewery',
            brewer_loc: '',
            brew_style: '',
            brew_container: '',
            brew_description: '',
            added_date: '',
            container_type: 'pint',
            enrichment_confidence: null,
            enrichment_source: null,
          },
        ];

        const result = applyFilters(beersWithEmpty, {
          containerFilter: 'draft',
          searchText: '',
        });

        expect(result).toHaveLength(0);
      });

      it('should handle search with no results', () => {
        const result = applyFilters(mockBeers, {
          containerFilter: 'all',
          searchText: 'nonexistent',
        });

        expect(result).toHaveLength(0);
      });
    });
  });

  describe('applySorting', () => {
    describe('Name sort', () => {
      it('should sort by name ascending (A-Z)', () => {
        const result = applySorting(mockBeers, 'name', 'asc');

        expect(result[0].brew_name).toBe('Alpha IPA');
        expect(result[1].brew_name).toBe('Beta Porter');
        expect(result[2].brew_name).toBe('Delta Hazy');
        expect(result[3].brew_name).toBe('Gamma Lager');
        expect(result[4].brew_name).toBe('Zeta Stout');
      });

      it('should sort by name descending (Z-A)', () => {
        const result = applySorting(mockBeers, 'name', 'desc');

        expect(result[0].brew_name).toBe('Zeta Stout');
        expect(result[1].brew_name).toBe('Gamma Lager');
        expect(result[2].brew_name).toBe('Delta Hazy');
        expect(result[3].brew_name).toBe('Beta Porter');
        expect(result[4].brew_name).toBe('Alpha IPA');
      });
    });

    describe('Date sort with added_date', () => {
      it('should sort by date descending (newest first)', () => {
        const result = applySorting(mockBeers, 'date', 'desc', 'added_date');

        expect(result[0].id).toBe('5'); // Jan 5
        expect(result[1].id).toBe('4'); // Jan 4
        expect(result[2].id).toBe('3'); // Jan 3
        expect(result[3].id).toBe('2'); // Jan 2
        expect(result[4].id).toBe('1'); // Jan 1
      });

      it('should sort by date ascending (oldest first)', () => {
        const result = applySorting(mockBeers, 'date', 'asc', 'added_date');

        expect(result[0].id).toBe('1'); // Jan 1
        expect(result[1].id).toBe('2'); // Jan 2
        expect(result[2].id).toBe('3'); // Jan 3
        expect(result[3].id).toBe('4'); // Jan 4
        expect(result[4].id).toBe('5'); // Jan 5
      });
    });

    describe('Date sort with tasted_date', () => {
      const tastedBeers: BeerfinderWithContainerType[] = [
        {
          id: '1',
          brew_name: 'Beer A',
          brewer: 'Brewery A',
          brewer_loc: '',
          brew_style: '',
          brew_container: 'Draft',
          brew_description: '',
          added_date: '',
          tasted_date: '01/15/2024', // MM/DD/YYYY
          container_type: 'pint',
          enrichment_confidence: null,
          enrichment_source: null,
        },
        {
          id: '2',
          brew_name: 'Beer B',
          brewer: 'Brewery B',
          brewer_loc: '',
          brew_style: '',
          brew_container: 'Draft',
          brew_description: '',
          added_date: '',
          tasted_date: '03/20/2024',
          container_type: 'pint',
          enrichment_confidence: null,
          enrichment_source: null,
        },
        {
          id: '3',
          brew_name: 'Beer C',
          brewer: 'Brewery C',
          brewer_loc: '',
          brew_style: '',
          brew_container: 'Draft',
          brew_description: '',
          added_date: '',
          tasted_date: '02/10/2024',
          container_type: 'pint',
          enrichment_confidence: null,
          enrichment_source: null,
        },
      ];

      it('should sort tasted_date descending (newest first)', () => {
        const result = applySorting(tastedBeers, 'date', 'desc', 'tasted_date');

        expect(result[0].id).toBe('2'); // Mar 20
        expect(result[1].id).toBe('3'); // Feb 10
        expect(result[2].id).toBe('1'); // Jan 15
      });

      it('should sort tasted_date ascending (oldest first)', () => {
        const result = applySorting(tastedBeers, 'date', 'asc', 'tasted_date');

        expect(result[0].id).toBe('1'); // Jan 15
        expect(result[1].id).toBe('3'); // Feb 10
        expect(result[2].id).toBe('2'); // Mar 20
      });
    });

    describe('ABV sort', () => {
      it('should sort by ABV ascending (lowest first)', () => {
        // mockBeers ABVs: 6.5, 8.2, 5.4, 4.8, null
        const result = applySorting(mockBeers, 'abv', 'asc');

        expect(result[0].id).toBe('4'); // 4.8
        expect(result[1].id).toBe('3'); // 5.4
        expect(result[2].id).toBe('1'); // 6.5
        expect(result[3].id).toBe('2'); // 8.2
      });

      it('should sort by ABV descending (highest first)', () => {
        const result = applySorting(mockBeers, 'abv', 'desc');

        expect(result[0].id).toBe('2'); // 8.2
        expect(result[1].id).toBe('1'); // 6.5
        expect(result[2].id).toBe('3'); // 5.4
        expect(result[3].id).toBe('4'); // 4.8
      });

      it('should sort null ABV values to end when ascending', () => {
        const result = applySorting(mockBeers, 'abv', 'asc');

        // null ABV (id 5) should be last
        expect(result[result.length - 1].id).toBe('5');
      });

      it('should sort null ABV values to end when descending', () => {
        const result = applySorting(mockBeers, 'abv', 'desc');

        // null ABV (id 5) should be last
        expect(result[result.length - 1].id).toBe('5');
      });

      it('should sort undefined ABV values to end when ascending', () => {
        const beersWithUndefinedAbv: BeerWithContainerType[] = [
          { ...mockBeers[0], id: '10', abv: 5.0 },
          { ...mockBeers[0], id: '11', abv: undefined },
          { ...mockBeers[0], id: '12', abv: 3.0 },
        ];

        const result = applySorting(beersWithUndefinedAbv, 'abv', 'asc');

        expect(result[0].id).toBe('12'); // 3.0
        expect(result[1].id).toBe('10'); // 5.0
        expect(result[2].id).toBe('11'); // undefined at end
      });

      it('should sort undefined ABV values to end when descending', () => {
        const beersWithUndefinedAbv: BeerWithContainerType[] = [
          { ...mockBeers[0], id: '10', abv: 5.0 },
          { ...mockBeers[0], id: '11', abv: undefined },
          { ...mockBeers[0], id: '12', abv: 3.0 },
        ];

        const result = applySorting(beersWithUndefinedAbv, 'abv', 'desc');

        expect(result[0].id).toBe('10'); // 5.0
        expect(result[1].id).toBe('12'); // 3.0
        expect(result[2].id).toBe('11'); // undefined at end
      });
    });

    describe('Edge Cases', () => {
      it('should handle empty list', () => {
        const result = applySorting([], 'date', 'desc');

        expect(result).toEqual([]);
      });

      it('should handle beers with null/empty names', () => {
        const beersWithEmptyNames: BeerWithContainerType[] = [
          { ...mockBeers[0], brew_name: '' },
          { ...mockBeers[1], brew_name: 'Alpha' },
        ];

        const result = applySorting(beersWithEmptyNames, 'name', 'asc');

        expect(result).toHaveLength(2);
      });

      it('should handle beers with null/empty dates', () => {
        const beersWithEmptyDates: BeerWithContainerType[] = [
          { ...mockBeers[0], added_date: '' },
          { ...mockBeers[1], added_date: '1704153600' },
        ];

        const result = applySorting(beersWithEmptyDates, 'date', 'desc');

        expect(result).toHaveLength(2);
      });
    });
  });

  describe('Pure Cycling Helpers', () => {
    describe('nextContainerFilter', () => {
      it('should cycle all -> draft', () => {
        expect(nextContainerFilter('all')).toBe('draft');
      });

      it('should cycle draft -> cans', () => {
        expect(nextContainerFilter('draft')).toBe('cans');
      });

      it('should cycle cans -> all', () => {
        expect(nextContainerFilter('cans')).toBe('all');
      });
    });

    describe('nextSortOption', () => {
      it('should cycle date -> name', () => {
        expect(nextSortOption('date')).toBe('name');
      });

      it('should cycle name -> abv', () => {
        expect(nextSortOption('name')).toBe('abv');
      });

      it('should cycle abv -> date', () => {
        expect(nextSortOption('abv')).toBe('date');
      });
    });

    describe('defaultDirectionForSort', () => {
      it('should return desc for date', () => {
        expect(defaultDirectionForSort('date')).toBe('desc');
      });

      it('should return asc for name', () => {
        expect(defaultDirectionForSort('name')).toBe('asc');
      });

      it('should return asc for abv', () => {
        expect(defaultDirectionForSort('abv')).toBe('asc');
      });
    });
  });
});
