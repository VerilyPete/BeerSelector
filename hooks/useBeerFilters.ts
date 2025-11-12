import { useState, useEffect, useMemo } from 'react';
import { Beer, Beerfinder } from '@/src/types/beer';

// Union type to allow both Beer and Beerfinder
type FilterableBeer = Beer | Beerfinder;

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

// Exported for testing
export const applyFilters = <T extends FilterableBeer>(beers: T[], options: FilterOptions): T[] => {
  let filtered = beers;

  // Apply search text filter
  if (options.searchText) {
    const searchLower = options.searchText.toLowerCase();
    filtered = filtered.filter(beer =>
      (beer.brew_name && beer.brew_name.toLowerCase().includes(searchLower)) ||
      (beer.brewer && beer.brewer.toLowerCase().includes(searchLower)) ||
      (beer.brew_style && beer.brew_style.toLowerCase().includes(searchLower)) ||
      (beer.brewer_loc && beer.brewer_loc.toLowerCase().includes(searchLower))
    );
  }

  // Apply Draft filter
  if (options.isDraft) {
    filtered = filtered.filter(beer => {
      if (!beer.brew_container) return false;
      const container = beer.brew_container.toLowerCase();
      return container.includes('draft') || container.includes('draught');
    });
  }

  // Apply Heavies filter (porter, stout, barleywine, quad, tripel)
  if (options.isHeavies) {
    filtered = filtered.filter(beer =>
      beer.brew_style &&
      (beer.brew_style.toLowerCase().includes('porter') ||
       beer.brew_style.toLowerCase().includes('stout') ||
       beer.brew_style.toLowerCase().includes('barleywine') ||
       beer.brew_style.toLowerCase().includes('quad') ||
       beer.brew_style.toLowerCase().includes('tripel'))
    );
  }

  // Apply IPA filter
  if (options.isIpa) {
    filtered = filtered.filter(beer =>
      beer.brew_style &&
      beer.brew_style.toLowerCase().includes('ipa')
    );
  }

  return filtered;
};

// Exported for testing
export const applySorting = <T extends FilterableBeer>(beers: T[], sortBy: SortOption, dateField: DateSortField = 'added_date'): T[] => {
  const sorted = [...beers];

  if (sortBy === 'name') {
    sorted.sort((a, b) => (a.brew_name || '').localeCompare(b.brew_name || ''));
  } else {
    // Sort by date descending (most recent first)
    if (dateField === 'tasted_date') {
      // Parse dates in format MM/DD/YYYY for tasted_date
      sorted.sort((a, b) => {
        const partsA = ((a as any).tasted_date || '').split('/');
        const partsB = ((b as any).tasted_date || '').split('/');

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

export const useBeerFilters = <T extends FilterableBeer>(beers: T[], dateField: DateSortField = 'added_date') => {
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

  const toggleFilter = (filterName: keyof FilterState) => {
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
  };

  const toggleSort = () => {
    setSortBy(prev => prev === 'date' ? 'name' : 'date');
  };

  const toggleExpand = (id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  };

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
