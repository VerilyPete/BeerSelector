import React, { useEffect, useState, useCallback } from 'react';
import { StyleSheet, View, TouchableOpacity, Alert } from 'react-native';
import { getAllBeers, areApiUrlsConfigured } from '@/src/database/db';
import { manualRefreshAllData } from '@/src/services/dataUpdateService';
import { ThemedText } from './ThemedText';
import { LoadingIndicator } from './LoadingIndicator';
import { useThemeColor } from '@/hooks/useThemeColor';
import { SearchBar } from './SearchBar';
import { getUserFriendlyErrorMessage } from '@/src/utils/notificationUtils';
import { useBeerFilters } from '@/hooks/useBeerFilters';
import { FilterBar } from './beer/FilterBar';
import { BeerList } from './beer/BeerList';
import { UntappdWebView } from './UntappdWebView';

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

export const AllBeers = () => {
  const [allBeers, setAllBeers] = useState<Beer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [untappdModalVisible, setUntappdModalVisible] = useState(false);
  const [selectedBeerName, setSelectedBeerName] = useState('');

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
      const data = await getAllBeers();
      // Filter out any beers with empty or null brew_name
      const filteredData = data.filter(beer => beer.brew_name && beer.brew_name.trim() !== '');
      setAllBeers(filteredData);
      setError(null);
    } catch (err) {
      console.error('Failed to load beers:', err);
      setError('Failed to load beers. Please try again later.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadBeers();
  }, []);

  const handleRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      console.log('Manual refresh initiated by user in AllBeers');

      // First check if API URLs are configured
      const apiUrlsConfigured = await areApiUrlsConfigured();
      if (!apiUrlsConfigured) {
        Alert.alert(
          'API URLs Not Configured',
          'Please log in via the Settings screen to configure API URLs before refreshing.'
        );
        setRefreshing(false);
        return;
      }

      // Use the unified refresh function to refresh ALL data types
      console.log('Using unified refresh to update all data types');
      const result = await manualRefreshAllData();

      // Check if there were any errors
      if (result.hasErrors) {
        if (result.allNetworkErrors) {
          Alert.alert(
            'Server Connection Error',
            'Unable to connect to the server. Please check your internet connection and try again later.',
            [{ text: 'OK' }]
          );
        } else {
          // Collect error messages
          const errorMessages: string[] = [];

          if (!result.allBeersResult.success && result.allBeersResult.error) {
            const allBeersError = getUserFriendlyErrorMessage(result.allBeersResult.error);
            errorMessages.push(`All Beer data: ${allBeersError}`);
          }

          if (!result.myBeersResult.success && result.myBeersResult.error) {
            const myBeersError = getUserFriendlyErrorMessage(result.myBeersResult.error);
            errorMessages.push(`Beerfinder data: ${myBeersError}`);
          }

          Alert.alert(
            'Data Refresh Error',
            `There were problems refreshing beer data:\n\n${errorMessages.join('\n\n')}`,
            [{ text: 'OK' }]
          );
        }
      }

      // Refresh the local display regardless of API errors (use cached data)
      try {
        const freshBeers = await getAllBeers();
        setAllBeers(freshBeers);
        setError(null);

        if (!result.hasErrors) {
          console.log('All data refreshed successfully from AllBeers tab');
        }
      } catch (localError: any) {
        console.error('Error loading local beer data after refresh:', localError);
        setError('Failed to load beer data from local storage.');
      }
    } catch (error: any) {
      console.error('Error in unified refresh from AllBeers:', error);
      setError('Failed to refresh beer data. Please try again later.');
      Alert.alert('Error', 'Failed to refresh beer data. Please try again later.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  const handleSearchChange = (text: string) => {
    setSearchText(text);
  };

  const clearSearch = () => {
    setSearchText('');
  };

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
              placeholder="Search beer..."
            />
            <View style={styles.beerCountContainer}>
              <ThemedText style={styles.beerCount}>
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
