import { useState, useEffect, useMemo, useCallback } from 'react';
import { BeerWithContainerType, BeerfinderWithContainerType } from '@/src/types/beer';

// Union type to allow both BeerWithContainerType and BeerfinderWithContainerType
// These types have the container_type property (which can be null)
type FilterableBeer = BeerWithContainerType | BeerfinderWithContainerType;

type SortOption = 'date' | 'name';

type FilterState = {
  isDraft: boolean;
  isHeavies: boolean;
  isIpa: boolean;
};

type FilterOptions = FilterState & {
  searchText: string;
};

type DateSortField = 'added_date' | 'tasted_date';

/**
 * MP-3 Bottleneck #3: Single-pass filter optimization
 *
 * OLD APPROACH (3 separate filter passes):
 * - let result = beers;
 * - if (isDraft) result = result.filter(...);
 * - if (isHeavies) result = result.filter(...);
 * - if (isIpa) result = result.filter(...);
 *
 * Problem: Multiple array iterations even if only 1 filter active.
 * For 200 beers with all filters on = 3 × 200 = 600 iterations.
 *
 * NEW APPROACH (single-pass filtering):
 * - Early exit if no filters active (0 iterations!)
 * - Single .filter() call that evaluates all conditions in parallel
 * - For 200 beers with all filters on = 1 × 200 = 200 iterations
 *
 * Expected improvement: 40-50% faster filtering, < 10ms for 200 beers
 */
export const applyFilters = <T extends FilterableBeer>(beers: T[], options: FilterOptions): T[] => {
  const { searchText, isDraft, isHeavies, isIpa } = options;

  // Early exit: If no filters are active, return original array
  if (!searchText && !isDraft && !isHeavies && !isIpa) {
    return beers;
  }

  // Pre-compute search term for performance
  const searchLower = searchText ? searchText.toLowerCase() : '';

  // Single-pass filtering: evaluate all conditions in one iteration
  return beers.filter(beer => {
    // Search text filter
    if (searchLower) {
      const matchesSearch =
        (beer.brew_name && beer.brew_name.toLowerCase().includes(searchLower)) ||
        (beer.brewer && beer.brewer.toLowerCase().includes(searchLower)) ||
        (beer.brew_style && beer.brew_style.toLowerCase().includes(searchLower)) ||
        (beer.brewer_loc && beer.brewer_loc.toLowerCase().includes(searchLower));

      if (!matchesSearch) return false;
    }

    // Draft filter
    if (isDraft) {
      if (!beer.brew_container) return false;
      const container = beer.brew_container.toLowerCase();
      const isDraftBeer = container.includes('draft') || container.includes('draught');
      if (!isDraftBeer) return false;
    }

    // Heavies filter (porter, stout, barleywine, quad, tripel)
    if (isHeavies) {
      if (!beer.brew_style) return false;
      const styleLower = beer.brew_style.toLowerCase();
      const isHeavyBeer =
        styleLower.includes('porter') ||
        styleLower.includes('stout') ||
        styleLower.includes('barleywine') ||
        styleLower.includes('quad') ||
        styleLower.includes('tripel');
      if (!isHeavyBeer) return false;
    }

    // IPA filter
    if (isIpa) {
      if (!beer.brew_style) return false;
      const isIpaBeer = beer.brew_style.toLowerCase().includes('ipa');
      if (!isIpaBeer) return false;
    }

    // Passed all active filters
    return true;
  });
};

// Exported for testing
export const applySorting = <T extends FilterableBeer>(
  beers: T[],
  sortBy: SortOption,
  dateField: DateSortField = 'added_date'
): T[] => {
  const sorted = [...beers];

  if (sortBy === 'name') {
    sorted.sort((a, b) => (a.brew_name || '').localeCompare(b.brew_name || ''));
  } else {
    // Sort by date descending (most recent first)
    if (dateField === 'tasted_date') {
      // Parse dates in format MM/DD/YYYY for tasted_date
      sorted.sort((a, b) => {
        const tastedDateA = 'tasted_date' in a ? (a.tasted_date as string) : '';
        const tastedDateB = 'tasted_date' in b ? (b.tasted_date as string) : '';
        const partsA = tastedDateA.split('/');
        const partsB = tastedDateB.split('/');

        if (partsA.length === 3 && partsB.length === 3) {
          // Create Date objects with year, month (0-based), day
          const dateA = new Date(
            parseInt(partsA[2], 10),
            parseInt(partsA[0], 10) - 1,
            parseInt(partsA[1], 10)
          ).getTime();

          const dateB = new Date(
            parseInt(partsB[2], 10),
            parseInt(partsB[0], 10) - 1,
            parseInt(partsB[1], 10)
          ).getTime();

          return dateB - dateA; // Descending order
        }

        // Fallback if date parsing fails
        return 0;
      });
    } else {
      // added_date is a timestamp
      sorted.sort((a, b) => {
        const dateA = parseInt(a.added_date || '0', 10);
        const dateB = parseInt(b.added_date || '0', 10);
        return dateB - dateA;
      });
    }
  }

  return sorted;
};

export const useBeerFilters = <T extends FilterableBeer>(
  beers: T[],
  dateField: DateSortField = 'added_date'
) => {
  const [filters, setFilters] = useState<FilterState>({
    isDraft: false,
    isHeavies: false,
    isIpa: false,
  });
  const [sortBy, setSortBy] = useState<SortOption>('date');
  const [searchText, setSearchText] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Apply filters and sorting
  const filteredBeers = useMemo(() => {
    const filtered = applyFilters(beers, { ...filters, searchText });
    return applySorting(filtered, sortBy, dateField);
  }, [beers, filters, searchText, sortBy, dateField]);

  // Reset expanded item when filters change
  useEffect(() => {
    setExpandedId(null);
  }, [filters, searchText]);

  /**
   * MP-3 Bottleneck #2: Memoize callbacks to ensure stable references for React.memo
   * Without useCallback, these functions get recreated on every render, breaking
   * React.memo's shallow comparison and causing unnecessary BeerItem re-renders.
   */
  const toggleFilter = useCallback((filterName: keyof FilterState) => {
    setFilters(prev => {
      const newFilters = { ...prev };

      // Toggle the requested filter
      newFilters[filterName] = !prev[filterName];

      // Mutual exclusivity: Heavies and IPA can't both be on
      if (filterName === 'isHeavies' && newFilters.isHeavies) {
        newFilters.isIpa = false;
      } else if (filterName === 'isIpa' && newFilters.isIpa) {
        newFilters.isHeavies = false;
      }

      return newFilters;
    });
  }, []);

  const toggleSort = useCallback(() => {
    setSortBy(prev => (prev === 'date' ? 'name' : 'date'));
  }, []);

  const toggleExpand = useCallback((id: string) => {
    setExpandedId(prev => (prev === id ? null : id));
  }, []);

  return {
    filteredBeers,
    filters,
    sortBy,
    searchText,
    expandedId,
    setSearchText,
    toggleFilter,
    toggleSort,
    toggleExpand,
    setExpandedId,
  };
};
