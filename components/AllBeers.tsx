import React, { useEffect, useState } from 'react';
import { StyleSheet, View, TouchableOpacity } from 'react-native';
import { beerRepository } from '@/src/database/repositories/BeerRepository';
import { ThemedText } from './ThemedText';
import { LoadingIndicator } from './LoadingIndicator';
import { useThemeColor } from '@/hooks/useThemeColor';
import { SearchBar } from './SearchBar';
import { useBeerFilters } from '@/hooks/useBeerFilters';
import { useDataRefresh } from '@/hooks/useDataRefresh';
import { FilterBar } from './beer/FilterBar';
import { BeerList } from './beer/BeerList';
import { UntappdWebView } from './UntappdWebView';
import { Beer } from '@/src/types/beer';

export const AllBeers = () => {
  const [allBeers, setAllBeers] = useState<Beer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [untappdModalVisible, setUntappdModalVisible] = useState(false);
  const [selectedBeerName] = useState('');

  // Use the shared filtering hook
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
  } = useBeerFilters(allBeers);

  // Theme colors
  const activeButtonColor = useThemeColor({}, 'tint');

  const loadBeers = async () => {
    try {
      setLoading(true);
      const data = await beerRepository.getAll();
      // Filter out any beers with empty or null brew_name
      const filteredData = data.filter(beer => beer.brew_name && beer.brew_name.trim() !== '');
      setAllBeers(filteredData);
      setError(null);
    } catch (err) {
      console.error('Failed to load beers:', err);
      setError('Failed to load beers. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  // Use the shared data refresh hook
  const { refreshing, handleRefresh } = useDataRefresh({
    onDataReloaded: async () => {
      const freshBeers = await beerRepository.getAll();
      const filteredData = freshBeers.filter(beer => beer.brew_name && beer.brew_name.trim() !== '');
      setAllBeers(filteredData);
      setError(null);
    },
    componentName: 'AllBeers',
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

  return (
    <View style={styles.container} testID="all-beers-container">
      {loading ? (
        <LoadingIndicator />
      ) : error ? (
        <View style={styles.centered} testID="error-container">
          <ThemedText style={styles.errorText} testID="error-message">{error}</ThemedText>
          <TouchableOpacity
            style={[styles.refreshButton, { backgroundColor: activeButtonColor }]}
            onPress={loadBeers}
            testID="try-again-button"
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
              placeholder="Search beer..."
            />
            <View style={styles.beerCountContainer}>
              <ThemedText style={styles.beerCount} testID="beer-count">
                {filteredBeers.length} {filteredBeers.length === 1 ? 'brew' : 'brews'} available
              </ThemedText>
            </View>

            <FilterBar
              filters={filters}
              sortBy={sortBy}
              onToggleFilter={toggleFilter}
              onToggleSort={toggleSort}
            />
          </View>

          <BeerList
            beers={filteredBeers}
            loading={loading}
            refreshing={refreshing}
            onRefresh={handleRefresh}
            emptyMessage="No beers found"
            expandedId={expandedId}
            onToggleExpand={toggleExpand}
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
