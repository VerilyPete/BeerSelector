import React, { useEffect, useState, useCallback } from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/Colors';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { SearchBar } from './SearchBar';
import { useBeerFilters } from '@/hooks/useBeerFilters';
import { useDataRefresh } from '@/hooks/useDataRefresh';
import { FilterBar } from './beer/FilterBar';
import { BeerList } from './beer/BeerList';
import { SkeletonLoader } from './beer/SkeletonLoader';
import { BeerfinderWithContainerType } from '@/src/types/beer';
import { useDebounce } from '@/hooks/useDebounce';
import { useAppContext } from '@/context/AppContext';
import { useOptimisticCheckIn } from '@/hooks/useOptimisticCheckIn';
import { OptimisticStatusBadge } from './optimistic/OptimisticStatusBadge';

export const TastedBrewList = () => {
  // MP-4 Step 2: Use context for beer data instead of local state
  const { beers, loading, errors, refreshBeerData } = useAppContext();

  // Responsive layout: 1 column on phone, 2 on tablet portrait, 3 on tablet landscape
  const { numColumns } = useBreakpoint();

  // MP-7 Step 3: Optimistic UI updates
  const { getPendingBeer, retryCheckIn, rollbackCheckIn } = useOptimisticCheckIn();

  /**
   * MP-3 Bottleneck #4: Local search state for immediate UI updates
   * Debounced version used for filtering to reduce excessive re-renders
   */
  const [localSearchText, setLocalSearchText] = useState('');
  const debouncedSearchText = useDebounce(localSearchText, 300);

  // Use the shared filtering hook with tasted beers from context
  // Pass 'tasted_date' to sort by the date the beer was tasted instead of added_date
  const {
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
  } = useBeerFilters(beers.tastedBeers, 'tasted_date');

  const colorScheme = useColorScheme() ?? 'dark';
  const colors = Colors[colorScheme];

  // Use the shared data refresh hook
  // Use AppContext's refreshBeerData to reload from database after refresh
  const { refreshing, handleRefresh } = useDataRefresh({
    onDataReloaded: refreshBeerData,
    componentName: 'TastedBrewList',
  });

  /**
   * Try Again re-reads the database; pull-to-refresh goes to the network.
   *
   * The failure this button appears under is a local read failure, so the
   * network round-trip is not what needs retrying. `handleRefresh` also bails
   * at its API-URL check before it ever reaches `onDataReloaded`, which made
   * Try Again a dead control for anyone logged out or on a first launch. (Not
   * for visitors on this screen specifically — this tab is `href: null` in
   * visitor mode, per app/(tabs)/_layout.tsx. AllBeers is where that matters.)
   */
  const handleTryAgain = useCallback(() => {
    void refreshBeerData();
  }, [refreshBeerData]);

  // Sync debounced search text with hook's search state
  useEffect(() => {
    setSearchText(debouncedSearchText);
  }, [debouncedSearchText, setSearchText]);

  /**
   * MP-3 Bottleneck #5: Memoized event handlers for stable references
   * MP-3 Bottleneck #4: Update local search for immediate UI, debouncing handles filtering
   */
  const handleSearchChange = useCallback((text: string) => {
    setLocalSearchText(text);
  }, []);

  const clearSearch = useCallback(() => {
    setLocalSearchText('');
  }, []);

  /**
   * MP-7 Step 3: Render optimistic status badge for tasted beers
   */
  const renderTastedBeerActions = useCallback(
    (item: BeerfinderWithContainerType) => {
      const pendingStatus = getPendingBeer(item.id);

      if (pendingStatus) {
        return (
          <OptimisticStatusBadge
            status={pendingStatus.status}
            error={pendingStatus.error}
            onRetry={() => retryCheckIn(item.id)}
            onCancel={() => rollbackCheckIn(item.id)}
          />
        );
      }

      return null;
    },
    [getPendingBeer, retryCheckIn, rollbackCheckIn]
  );

  const emptyMessage = searchText
    ? 'No tasted beer matches your search criteria.'
    : 'No beers in your current round yet. Start exploring and log some brews!';

  return (
    <View testID="tasted-brews-container" style={styles.container}>
      {/* Show skeleton during initial load (when loading=true and no beers yet) */}
      {loading.isLoadingBeers && beers.tastedBeers.length === 0 ? (
        <>
          {/* MP-3 Step 3b: Show search bar even during loading for better UX */}
          <View style={styles.filtersContainer}>
            <SearchBar
              searchText={localSearchText}
              onSearchChange={handleSearchChange}
              onClear={clearSearch}
              placeholder="Search tasted beer..."
            />
          </View>
          <SkeletonLoader count={20} />
        </>
      ) : errors.beerError ? (
        <View style={styles.centered}>
          <Text style={[styles.errorText, { color: colors.error }]}>{errors.beerError}</Text>
          <TouchableOpacity
            style={[styles.refreshButton, { backgroundColor: colors.tint }]}
            onPress={handleTryAgain}
          >
            <Text style={[styles.buttonText, { color: colors.textOnPrimary }]}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.filtersContainer}>
            <SearchBar
              searchText={localSearchText}
              onSearchChange={handleSearchChange}
              onClear={clearSearch}
              placeholder="Search tasted beer..."
            />
            <View style={styles.beerCountContainer}>
              <Text style={[styles.beerCount, { color: colors.textSecondary }]}>
                {filteredBeers.length} beers tasted
              </Text>
            </View>

            <FilterBar
              containerFilter={containerFilter}
              sortBy={sortBy}
              sortDirection={sortDirection}
              onCycleContainerFilter={cycleContainerFilter}
              onCycleSort={cycleSort}
              onToggleSortDirection={toggleSortDirection}
            />
          </View>

          <BeerList
            beers={filteredBeers}
            loading={loading.isLoadingBeers}
            refreshing={refreshing}
            onRefresh={handleRefresh}
            emptyMessage={emptyMessage}
            expandedId={expandedId}
            onToggleExpand={toggleExpand}
            dateLabel="Tasted"
            renderItemActions={renderTastedBeerActions}
            numColumns={numColumns}
          />
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingHorizontal: 18,
  },
  filtersContainer: {
    marginBottom: 16,
  },
  beerCountContainer: {
    marginBottom: 8,
  },
  beerCount: {
    fontFamily: 'SpaceMono',
    fontSize: 10,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    textAlign: 'center',
  },
  refreshButton: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  buttonText: {
    fontFamily: 'SpaceGrotesk-SemiBold',
    fontSize: 13,
  },
});
