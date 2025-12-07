import { applyFilters, applySorting } from '../useBeerFilters';
import { BeerWithContainerType } from '@/src/types/beer';

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
      container_type: 'tulip',
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
      container_type: 'pint',
    },
    {
      id: '3',
      brew_name: 'Beta Porter',
      brewer: 'Test Brewery C',
      brewer_loc: 'Denver, CO',
      brew_style: 'Porter',
      brew_container: 'Draft',
      brew_description: 'A smooth porter',
      added_date: '1704240000', // Jan 3, 2024
      container_type: 'pint',
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
      container_type: 'pint',
    },
    {
      id: '5',
      brew_name: 'Delta Hazy IPA',
      brewer: 'Test Brewery E',
      brewer_loc: 'San Diego, CA',
      brew_style: 'Hazy IPA',
      brew_container: 'Draft',
      brew_description: 'A juicy IPA',
      added_date: '1704412800', // Jan 5, 2024
      container_type: 'tulip',
    },
  ];

  describe('applyFilters', () => {
    describe('Draft Filter', () => {
      it('should filter beers by draft container', () => {
        const result = applyFilters(mockBeers, {
          isDraft: true,
          isHeavies: false,
          isIpa: false,
          searchText: '',
        });

        expect(result).toHaveLength(3); // IDs 1, 3, 5 are draft
        expect(result.every(b => b.brew_container === 'Draft')).toBe(true);
      });

      it('should return all beers when draft filter is off', () => {
        const result = applyFilters(mockBeers, {
          isDraft: false,
          isHeavies: false,
          isIpa: false,
          searchText: '',
        });

        expect(result).toHaveLength(5);
      });
    });

    describe('Heavies Filter', () => {
      it('should filter beers by heavy styles (porter, stout, barleywine, quad, tripel)', () => {
        const result = applyFilters(mockBeers, {
          isDraft: false,
          isHeavies: true,
          isIpa: false,
          searchText: '',
        });

        expect(result).toHaveLength(2); // IDs 2 (Stout), 3 (Porter)
        expect(result.some(b => b.id === '2')).toBe(true);
        expect(result.some(b => b.id === '3')).toBe(true);
      });

      it('should handle case-insensitive style matching for heavies', () => {
        const beersWithVariedCase: BeerWithContainerType[] = [
          {
            ...mockBeers[0],
            id: '10',
            brew_style: 'PORTER',
          },
          {
            ...mockBeers[0],
            id: '11',
            brew_style: 'BarleyWine',
          },
        ];

        const result = applyFilters(beersWithVariedCase, {
          isDraft: false,
          isHeavies: true,
          isIpa: false,
          searchText: '',
        });

        expect(result).toHaveLength(2);
      });
    });

    describe('IPA Filter', () => {
      it('should filter beers by IPA style', () => {
        const result = applyFilters(mockBeers, {
          isDraft: false,
          isHeavies: false,
          isIpa: true,
          searchText: '',
        });

        expect(result).toHaveLength(2); // IDs 1 (IPA), 5 (Hazy IPA)
        expect(result.every(b => b.brew_style?.toLowerCase().includes('ipa'))).toBe(true);
      });
    });

    describe('Combined Filters', () => {
      it('should combine Draft and IPA filters', () => {
        const result = applyFilters(mockBeers, {
          isDraft: true,
          isHeavies: false,
          isIpa: true,
          searchText: '',
        });

        expect(result).toHaveLength(2); // IDs 1, 5 (both Draft IPAs)
        expect(
          result.every(
            b => b.brew_container === 'Draft' && b.brew_style?.toLowerCase().includes('ipa')
          )
        ).toBe(true);
      });

      it('should combine Draft and Heavies filters', () => {
        const result = applyFilters(mockBeers, {
          isDraft: true,
          isHeavies: true,
          isIpa: false,
          searchText: '',
        });

        expect(result).toHaveLength(1); // ID 3 (Draft Porter)
        expect(result[0].id).toBe('3');
      });

      it('should apply both Heavies and IPA as AND if both are true', () => {
        // Note: In the actual hook usage, Heavies and IPA are mutually exclusive
        // But the filter function should handle the edge case where both are true
        const result = applyFilters(mockBeers, {
          isDraft: false,
          isHeavies: true,
          isIpa: true,
          searchText: '',
        });

        // Both filters applied as AND = no results (no beer is both heavy style AND IPA)
        expect(result).toHaveLength(0);
      });
    });

    describe('Search Text', () => {
      it('should filter beers by search text in brew_name', () => {
        const result = applyFilters(mockBeers, {
          isDraft: false,
          isHeavies: false,
          isIpa: false,
          searchText: 'ipa',
        });

        expect(result).toHaveLength(2); // Alpha IPA, Delta Hazy IPA
      });

      it('should filter beers by search text in brewer', () => {
        const result = applyFilters(mockBeers, {
          isDraft: false,
          isHeavies: false,
          isIpa: false,
          searchText: 'Brewery B',
        });

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('2'); // Zeta Stout
      });

      it('should filter beers by search text in brew_style', () => {
        const result = applyFilters(mockBeers, {
          isDraft: false,
          isHeavies: false,
          isIpa: false,
          searchText: 'stout',
        });

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('2');
      });

      it('should filter beers by search text in brewer_loc', () => {
        const result = applyFilters(mockBeers, {
          isDraft: false,
          isHeavies: false,
          isIpa: false,
          searchText: 'Portland',
        });

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('2');
      });

      it('should be case-insensitive', () => {
        const result = applyFilters(mockBeers, {
          isDraft: false,
          isHeavies: false,
          isIpa: false,
          searchText: 'ALPHA',
        });

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('1');
      });

      it('should combine search with filters', () => {
        const result = applyFilters(mockBeers, {
          isDraft: true,
          isHeavies: false,
          isIpa: false,
          searchText: 'ipa',
        });

        expect(result).toHaveLength(2); // Both IPAs are draft
      });
    });

    describe('Edge Cases', () => {
      it('should handle empty beer list', () => {
        const result = applyFilters([], {
          isDraft: false,
          isHeavies: false,
          isIpa: false,
          searchText: '',
        });

        expect(result).toEqual([]);
      });

      it('should handle beers with null/undefined fields', () => {
        const beersWithNulls: BeerWithContainerType[] = [
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
          },
        ];

        const result = applyFilters(beersWithNulls, {
          isDraft: true,
          isHeavies: false,
          isIpa: false,
          searchText: '',
        });

        expect(result).toHaveLength(0); // Doesn't match 'Draft'
      });

      it('should handle search with no results', () => {
        const result = applyFilters(mockBeers, {
          isDraft: false,
          isHeavies: false,
          isIpa: false,
          searchText: 'nonexistent',
        });

        expect(result).toHaveLength(0);
      });
    });
  });

  describe('applySorting', () => {
    it('should sort by date descending (most recent first)', () => {
      const result = applySorting(mockBeers, 'date');

      expect(result[0].id).toBe('5'); // Jan 5
      expect(result[1].id).toBe('4'); // Jan 4
      expect(result[2].id).toBe('3'); // Jan 3
      expect(result[3].id).toBe('2'); // Jan 2
      expect(result[4].id).toBe('1'); // Jan 1
    });

    it('should sort by name alphabetically', () => {
      const result = applySorting(mockBeers, 'name');

      expect(result[0].brew_name).toBe('Alpha IPA');
      expect(result[1].brew_name).toBe('Beta Porter');
      expect(result[2].brew_name).toBe('Delta Hazy IPA');
      expect(result[3].brew_name).toBe('Gamma Lager');
      expect(result[4].brew_name).toBe('Zeta Stout');
    });

    it('should handle beers with null/empty names', () => {
      const beersWithEmptyNames: BeerWithContainerType[] = [
        { ...mockBeers[0], brew_name: '' },
        { ...mockBeers[1], brew_name: 'Alpha' },
      ];

      const result = applySorting(beersWithEmptyNames, 'name');

      expect(result).toHaveLength(2); // Should not crash
    });

    it('should handle beers with null/empty dates', () => {
      const beersWithEmptyDates: BeerWithContainerType[] = [
        { ...mockBeers[0], added_date: '' },
        { ...mockBeers[1], added_date: '1704153600' },
      ];

      const result = applySorting(beersWithEmptyDates, 'date');

      expect(result).toHaveLength(2); // Should not crash
    });

    it('should handle empty list', () => {
      const result = applySorting([], 'date');

      expect(result).toEqual([]);
    });
  });
});
