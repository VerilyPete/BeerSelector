import { useState, useEffect, useMemo, useCallback } from 'react';
import { BeerWithContainerType, BeerfinderWithContainerType } from '@/src/types/beer';

// Union type to allow both BeerWithContainerType and BeerfinderWithContainerType
type FilterableBeer = BeerWithContainerType | BeerfinderWithContainerType;

export type SortOption = 'date' | 'name' | 'abv';
export type SortDirection = 'asc' | 'desc';
export type ContainerFilter = 'all' | 'draft' | 'cans';

export type FilterState = {
  containerFilter: ContainerFilter;
};

export type FilterOptions = {
  containerFilter: ContainerFilter;
  searchText: string;
};

type DateSortField = 'added_date' | 'tasted_date';

// Pure cycling helpers
export const nextContainerFilter = (current: ContainerFilter): ContainerFilter => {
  const cycle: Record<ContainerFilter, ContainerFilter> = {
    all: 'draft',
    draft: 'cans',
    cans: 'all',
  };
  return cycle[current];
};

export const nextSortOption = (current: SortOption): SortOption => {
  const cycle: Record<SortOption, SortOption> = { date: 'name', name: 'abv', abv: 'date' };
  return cycle[current];
};

export const defaultDirectionForSort = (sort: SortOption): SortDirection => {
  return sort === 'date' ? 'desc' : 'asc';
};

export const applyFilters = <T extends FilterableBeer>(beers: T[], options: FilterOptions): T[] => {
  const { searchText, containerFilter } = options;

  if (!searchText && containerFilter === 'all') {
    return beers;
  }

  const searchLower = searchText ? searchText.toLowerCase() : '';

  return beers.filter(beer => {
    if (searchLower) {
      const matchesSearch =
        (beer.brew_name && beer.brew_name.toLowerCase().includes(searchLower)) ||
        (beer.brewer && beer.brewer.toLowerCase().includes(searchLower)) ||
        (beer.brew_style && beer.brew_style.toLowerCase().includes(searchLower)) ||
        (beer.brewer_loc && beer.brewer_loc.toLowerCase().includes(searchLower));
      if (!matchesSearch) return false;
    }

    if (containerFilter === 'draft') {
      if (!beer.brew_container) return false;
      const container = beer.brew_container.toLowerCase();
      if (!container.includes('draft') && !container.includes('draught')) return false;
    }

    if (containerFilter === 'cans') {
      if (!beer.brew_container) return false;
      const container = beer.brew_container.toLowerCase();
      if (!container.includes('bottle') && !container.includes('can')) return false;
    }

    return true;
  });
};

export const applySorting = <T extends FilterableBeer>(
  beers: T[],
  sortBy: SortOption,
  direction: SortDirection,
  dateField: DateSortField = 'added_date'
): T[] => {
  const sorted = [...beers];
  const dir = direction === 'asc' ? 1 : -1;

  if (sortBy === 'name') {
    sorted.sort((a, b) => dir * (a.brew_name || '').localeCompare(b.brew_name || ''));
  } else if (sortBy === 'abv') {
    sorted.sort((a, b) => {
      const aNull = a.abv == null || isNaN(a.abv);
      const bNull = b.abv == null || isNaN(b.abv);
      if (aNull && bNull) return 0;
      if (aNull) return 1;
      if (bNull) return -1;
      // Non-null assertion safe: aNull/bNull guards above ensure both values are defined numbers
      return dir * (a.abv! - b.abv!);
    });
  } else {
    // date sort
    if (dateField === 'tasted_date') {
      sorted.sort((a, b) => {
        const tastedDateA = 'tasted_date' in a ? String(a.tasted_date ?? '') : '';
        const tastedDateB = 'tasted_date' in b ? String(b.tasted_date ?? '') : '';
        const partsA = tastedDateA.split('/');
        const partsB = tastedDateB.split('/');

        if (partsA.length === 3 && partsB.length === 3) {
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
          return dir * (dateA - dateB);
        }
        return 0;
      });
    } else {
      sorted.sort((a, b) => {
        const dateA = parseInt(a.added_date || '0', 10);
        const dateB = parseInt(b.added_date || '0', 10);
        return dir * (dateA - dateB);
      });
    }
  }

  return sorted;
};

export const useBeerFilters = <T extends FilterableBeer>(
  beers: T[],
  dateField: DateSortField = 'added_date'
) => {
  const [containerFilter, setContainerFilter] = useState<ContainerFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [searchText, setSearchText] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filteredBeers = useMemo(() => {
    const filtered = applyFilters(beers, { containerFilter, searchText });
    return applySorting(filtered, sortBy, sortDirection, dateField);
  }, [beers, containerFilter, searchText, sortBy, sortDirection, dateField]);

  useEffect(() => {
    setExpandedId(null);
  }, [containerFilter, searchText]);

  const cycleContainerFilter = useCallback(() => {
    setContainerFilter(prev => nextContainerFilter(prev));
  }, []);

  const cycleSort = useCallback(() => {
    const newSort = nextSortOption(sortBy);
    setSortBy(newSort);
    setSortDirection(defaultDirectionForSort(newSort));
  }, [sortBy]);

  const toggleSortDirection = useCallback(() => {
    setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
  }, []);

  const toggleExpand = useCallback((id: string) => {
    setExpandedId(prev => (prev === id ? null : id));
  }, []);

  return {
    filteredBeers,
    containerFilter,
    sortBy,
    sortDirection,
    searchText,
    expandedId,
    setSearchText,
    cycleContainerFilter,
    cycleSort,
    toggleSortDirection,
    toggleExpand,
    setExpandedId,
  };
};
