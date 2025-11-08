import { useState, useEffect, useMemo } from 'react';

type Beer = {
  id: string;
  brew_name: string;
  brewer: string;
  brewer_loc: string;
  brew_style: string;
  brew_container: string;
  brew_description: string;
  added_date: string;
};

type SortOption = 'date' | 'name';

type FilterState = {
  isDraft: boolean;
  isHeavies: boolean;
  isIpa: boolean;
};

type FilterOptions = FilterState & {
  searchText: string;
};

// Exported for testing
export const applyFilters = (beers: Beer[], options: FilterOptions): Beer[] => {
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
    filtered = filtered.filter(beer =>
      beer.brew_container &&
      beer.brew_container.toLowerCase() === 'draft'
    );
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
export const applySorting = (beers: Beer[], sortBy: SortOption): Beer[] => {
  const sorted = [...beers];

  if (sortBy === 'name') {
    sorted.sort((a, b) => (a.brew_name || '').localeCompare(b.brew_name || ''));
  } else {
    // Sort by date descending (most recent first)
    sorted.sort((a, b) => {
      const dateA = parseInt(a.added_date || '0', 10);
      const dateB = parseInt(b.added_date || '0', 10);
      return dateB - dateA;
    });
  }

  return sorted;
};

export const useBeerFilters = (beers: Beer[]) => {
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
    return applySorting(filtered, sortBy);
  }, [beers, filters, searchText, sortBy]);

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
