import React, { useEffect, useState } from 'react';
import { StyleSheet, View, TouchableOpacity } from 'react-native';
import { myBeersRepository } from '@/src/database/repositories/MyBeersRepository';
import { fetchMyBeersFromAPI } from '@/src/api/beerApi';
import { ThemedText } from './ThemedText';
import { LoadingIndicator } from './LoadingIndicator';
import { useThemeColor } from '@/hooks/useThemeColor';
import { SearchBar } from './SearchBar';
import { useBeerFilters } from '@/hooks/useBeerFilters';
import { useDataRefresh } from '@/hooks/useDataRefresh';
import { FilterBar } from './beer/FilterBar';
import { BeerList } from './beer/BeerList';
import { Beerfinder } from '@/src/types/beer';

export const TastedBrewList = () => {
  const [tastedBeers, setTastedBeers] = useState<Beerfinder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Use the shared filtering hook (no Heavies/IPA filters needed for tasted beers)
  // Pass 'tasted_date' to sort by the date the beer was tasted instead of added_date
  const {
    filteredBeers,
    filters,
    sortBy,
    searchText,
    expandedId,
    setSearchText,
    toggleFilter,
    toggleSort,
    toggleExpand,
  } = useBeerFilters(tastedBeers, 'tasted_date');

  // Theme colors
  const activeButtonColor = useThemeColor({}, 'tint');

  const loadBeers = async () => {
    try {
      setLoading(true);
      console.log('TastedBrewList: Loading tasted beers...');

      // Try to fetch My Beers data if it hasn't been loaded yet
      try {
        console.log('TastedBrewList: Attempting to fetch and populate My Beers data...');
        const freshMyBeers = await fetchMyBeersFromAPI();
        await myBeersRepository.insertMany(freshMyBeers);
        console.log('TastedBrewList: Successfully fetched and populated My Beers data');
      } catch (err) {
        console.log('TastedBrewList: Failed to fetch My Beers data, continuing with local data:', err);
      }

      console.log('TastedBrewList: Retrieving tasted beers from database...');
      const data = await myBeersRepository.getAll();
      console.log(`TastedBrewList: Retrieved ${data.length} tasted beers from database`);

      // Filter out any beers with empty or null brew_name
      const filteredData = data.filter(beer => beer.brew_name && beer.brew_name.trim() !== '');
      console.log(`TastedBrewList: After filtering, ${filteredData.length} valid tasted beers remain`);

      setTastedBeers(filteredData as Beerfinder[]);
      setError(null);
    } catch (err) {
      console.error('TastedBrewList: Failed to load tasted beers:', err);
      setError('Failed to load tasted beers. Please check your internet connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  // Use the shared data refresh hook
  const { refreshing, handleRefresh } = useDataRefresh({
    onDataReloaded: async () => {
      const freshBeers = await myBeersRepository.getAll();
      setTastedBeers(freshBeers as Beerfinder[]);
      setError(null);
    },
    componentName: 'TastedBrewList',
  });

  useEffect(() => {
    loadBeers();
  }, []);

  const handleSearchChange = (text: string) => {
    setSearchText(text);
  };

  const clearSearch = () => {
    setSearchText('');
  };

  const emptyMessage = searchText
    ? "No tasted beer matches your search criteria."
    : "No beers in your current round yet. Start exploring and log some brews!";

  return (
    <View style={styles.container}>
      {loading ? (
        <LoadingIndicator />
      ) : error ? (
        <View style={styles.centered}>
          <ThemedText style={styles.errorText}>{error}</ThemedText>
          <TouchableOpacity
            style={[styles.refreshButton, { backgroundColor: activeButtonColor }]}
            onPress={loadBeers}
          >
            <ThemedText style={[styles.buttonText, { color: 'white' }]}>
              Try Again
            </ThemedText>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.filtersContainer}>
            <SearchBar
              searchText={searchText}
              onSearchChange={handleSearchChange}
              onClear={clearSearch}
              placeholder="Search tasted beer..."
            />
            <View style={styles.beerCountContainer}>
              <ThemedText style={styles.beerCount}>
                {filteredBeers.length} {filteredBeers.length === 1 ? 'brew' : 'brews'} tasted
              </ThemedText>
            </View>

            <FilterBar
              filters={filters}
              sortBy={sortBy}
              onToggleFilter={toggleFilter}
              onToggleSort={toggleSort}
              showHeaviesAndIpa={false}
            />
          </View>

          <BeerList
            beers={filteredBeers}
            loading={loading}
            refreshing={refreshing}
            onRefresh={handleRefresh}
            emptyMessage={emptyMessage}
            expandedId={expandedId}
            onToggleExpand={toggleExpand}
            dateLabel="Tasted"
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
    paddingHorizontal: 16,
  },
  beerCount: {
    fontWeight: '600',
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
});
