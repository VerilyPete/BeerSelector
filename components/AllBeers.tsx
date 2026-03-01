import React, { useEffect, useState, useCallback } from 'react';
import { StyleSheet, View, TouchableOpacity, Text } from 'react-native';
import * as Haptics from 'expo-haptics';
import { beerRepository } from '@/src/database/repositories/BeerRepository';
import { useUntappdColor } from '@/hooks/useUntappdColor';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/Colors';
import { SearchBar } from './SearchBar';
import { useBeerFilters } from '@/hooks/useBeerFilters';
import { useDataRefresh } from '@/hooks/useDataRefresh';
import { FilterBar } from './beer/FilterBar';
import { BeerList } from './beer/BeerList';
import { UntappdWebView } from './UntappdWebView';
import { SkeletonLoader } from './beer/SkeletonLoader';
import { BeerWithContainerType } from '@/src/types/beer';
import { useDebounce } from '@/hooks/useDebounce';
import { useAppContext } from '@/context/AppContext';

export const AllBeers = () => {
  // MP-4 Step 2: Use context for beer data instead of local state
  const { beers, loading, errors, setAllBeers, setLoadingBeers, setBeerError } = useAppContext();

  // Responsive layout: 1 column on phone, 2 on tablet portrait, 3 on tablet landscape
  const { numColumns } = useBreakpoint();

  const [untappdModalVisible, setUntappdModalVisible] = useState(false);
  const [selectedBeerName, setSelectedBeerName] = useState('');

  /**
   * MP-3 Bottleneck #4: Local search state for immediate UI updates
   * Debounced version used for filtering to reduce excessive re-renders
   */
  const [localSearchText, setLocalSearchText] = useState('');
  const debouncedSearchText = useDebounce(localSearchText, 300);

  // Use the shared filtering hook with data from context
  const {
    filteredBeers,
    containerFilter,
    sortBy,
    sortDirection,
    expandedId,
    setSearchText,
    cycleContainerFilter,
    cycleSort,
    toggleSortDirection,
    toggleExpand,
  } = useBeerFilters(beers.allBeers);

  // Sync debounced search text with hook's search state
  useEffect(() => {
    setSearchText(debouncedSearchText);
  }, [debouncedSearchText, setSearchText]);

  const colorScheme = useColorScheme() ?? 'dark';
  const colors = Colors[colorScheme];
  const untappdColor = useUntappdColor();

  const loadBeers = useCallback(async () => {
    try {
      setLoadingBeers(true);
      const data = await beerRepository.getAll();
      setAllBeers(data);
      setBeerError(null);
    } catch (err) {
      console.error('Failed to load beers:', err);
      setBeerError('Failed to load beers. Please try again later.');
    } finally {
      setLoadingBeers(false);
    }
  }, [setLoadingBeers, setAllBeers, setBeerError]);

  // Use the shared data refresh hook
  const { refreshing, handleRefresh } = useDataRefresh({
    onDataReloaded: async () => {
      const freshBeers = await beerRepository.getAll();
      setAllBeers(freshBeers);
      setBeerError(null);
    },
    componentName: 'AllBeers',
  });

  useEffect(() => {
    loadBeers();
  }, [loadBeers]);

  /**
   * MP-3 Bottleneck #5: Memoized event handlers for stable references
   * Bottleneck #4: Update local search for immediate UI, debouncing handles filtering
   */
  const handleSearchChange = useCallback((text: string) => {
    setLocalSearchText(text);
  }, []);

  const clearSearch = useCallback(() => {
    setLocalSearchText('');
  }, []);

  const handleUntappdSearch = useCallback((beerName: string) => {
    // Add haptic feedback for iOS
    if (process.env.EXPO_OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setSelectedBeerName(beerName);
    setUntappdModalVisible(true);
  }, []);

  // No useCallback wrapper - matches Beerfinder pattern
  // Function is called during render for each visible item, memoization doesn't help
  const renderBeerActions = (item: BeerWithContainerType) => (
    <View style={styles.buttonContainer}>
      <TouchableOpacity
        style={[styles.checkInButton, { borderColor: colors.tint }]}
        onPress={() => handleUntappdSearch(item.brew_name)}
        activeOpacity={0.7}
        accessible={true}
        accessibilityLabel={`Check ${item.brew_name} on Untappd`}
        accessibilityRole="button"
      >
        <Text style={[styles.checkInButtonText, { color: colors.tint }]} numberOfLines={1}>
          UNTAPPD
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container} testID="all-beers-container">
      {/* Show skeleton during initial load (when loading=true and no beers yet) */}
      {loading.isLoadingBeers && beers.allBeers.length === 0 ? (
        <>
          {/* MP-3 Step 3b: Show search bar even during loading for better UX */}
          <View style={styles.filtersContainer}>
            <SearchBar
              searchText={localSearchText}
              onSearchChange={handleSearchChange}
              onClear={clearSearch}
              placeholder="Search beer..."
            />
          </View>
          <SkeletonLoader count={20} />
        </>
      ) : errors.beerError ? (
        <View style={styles.centered} testID="error-container">
          <Text style={[styles.errorText, { color: colors.error }]} testID="error-message">
            {errors.beerError}
          </Text>
          <TouchableOpacity
            style={[styles.refreshButton, { backgroundColor: colors.tint }]}
            onPress={loadBeers}
            testID="try-again-button"
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
              placeholder="Search beer..."
            />
            <View style={styles.beerCountContainer}>
              <Text style={[styles.beerCount, { color: colors.textSecondary }]} testID="beer-count">
                {filteredBeers.length} beers on tap
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
            emptyMessage="No beers found"
            expandedId={expandedId}
            onToggleExpand={toggleExpand}
            renderItemActions={renderBeerActions}
            numColumns={numColumns}
          />

          <UntappdWebView
            visible={untappdModalVisible}
            onClose={() => setUntappdModalVisible(false)}
            beerName={selectedBeerName}
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
  },
  filtersContainer: {
    marginBottom: 16,
  },
  beerCountContainer: {
    marginBottom: 8,
    paddingHorizontal: 24,
  },
  beerCount: {
    fontFamily: 'Space Mono',
    fontSize: 11,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    color: 'red',
    textAlign: 'center',
  },
  refreshButton: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 24,
  },
  buttonText: {
    fontWeight: '600',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  checkInButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  checkInButtonText: {
    fontFamily: 'Inter',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 2,
  },
});
