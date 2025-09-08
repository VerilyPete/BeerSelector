import React, { useEffect, useState, useCallback } from 'react';
import { StyleSheet, View, TouchableOpacity, Alert, FlatList, ActivityIndicator } from 'react-native';
import { getMyBeers, fetchAndPopulateMyBeers, areApiUrlsConfigured, setPreference } from '@/src/database/db';
import { manualRefreshAllData } from '@/src/services/dataUpdateService';
import { ThemedText } from './ThemedText';
import { ThemedView } from './ThemedView';
import { LoadingIndicator } from './LoadingIndicator';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useColorScheme } from '@/hooks/useColorScheme';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { SearchBar } from './SearchBar';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useBottomTabOverflow } from '@/components/ui/TabBarBackground';
import { IconSymbol } from './ui/IconSymbol';
import { getUserFriendlyErrorMessage } from '@/src/utils/notificationUtils';
import { Beerfinder } from '@/src/types/beer';
import { ApiErrorType } from '@/src/utils/notificationUtils';

type SortOption = 'date' | 'name';

export const TastedBrewList = () => {
  // All hooks must be called at the top level, before any conditional logic
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const tabOverflow = useBottomTabOverflow();
  const [tastedBeers, setTastedBeers] = useState<Beerfinder[]>([]);
  const [displayedBeers, setDisplayedBeers] = useState<Beerfinder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>('date');
  const [searchText, setSearchText] = useState('');

  // Theme colors
  const cardColor = useThemeColor({}, 'background');
  const borderColor = useThemeColor({ light: '#e0e0e0', dark: '#333' }, 'text');
  const activeButtonColor = useThemeColor({}, 'tint');
  const inactiveButtonColor = useThemeColor({ light: '#E5E5E5', dark: '#2C2C2E' }, 'background');
  const inactiveButtonTextColor = useThemeColor({ light: '#333333', dark: '#EFEFEF' }, 'text');
  const textColor = useThemeColor({}, 'text');

  // Define all derived values outside of hooks and render methods
  const buttonTextColor = colorScheme === 'dark' && sortBy === 'name' ? '#000000' : 'white';
  const activeBgColor = colorScheme === 'dark' && sortBy === 'name' ? '#FFC107' : activeButtonColor;

  const loadBeers = async () => {
    try {
      setLoading(true);
      console.log('TastedBrewList: Loading tasted beers...');

      // Try to fetch My Beers data if it hasn't been loaded yet
      try {
        console.log('TastedBrewList: Attempting to fetch and populate My Beers data...');
        await fetchAndPopulateMyBeers();
        console.log('TastedBrewList: Successfully fetched and populated My Beers data');
      } catch (err) {
        console.log('TastedBrewList: Failed to fetch My Beers data, continuing with local data:', err);
        // Continue with whatever data we have locally
      }

      console.log('TastedBrewList: Retrieving tasted beers from database...');
      const data = await getMyBeers();
      console.log(`TastedBrewList: Retrieved ${data.length} tasted beers from database`);

      // Filter out any beers with empty or null brew_name as a second layer of protection
      const filteredData = data.filter(beer => beer.brew_name && beer.brew_name.trim() !== '');
      console.log(`TastedBrewList: After filtering, ${filteredData.length} valid tasted beers remain`);

      if (filteredData.length > 0) {
        console.log('TastedBrewList: Sample beer:', JSON.stringify(filteredData[0]));
      } else {
        console.log('TastedBrewList: No tasted beers found after filtering (new user or round rollover at 200 beers)');
      }

      setTastedBeers(filteredData);
      setDisplayedBeers(filteredData);
      setError(null);
    } catch (err) {
      console.error('TastedBrewList: Failed to load tasted beers:', err);
      setError('Failed to load tasted beers. Please check your internet connection and try again.');
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
      console.log('Manual refresh initiated by user in TastedBrewList');

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
        // If all errors are network-related, show a single consolidated message
        if (result.allNetworkErrors) {
          Alert.alert(
            'Server Connection Error',
            'Unable to connect to the server. Please check your internet connection and try again later.',
            [{ text: 'OK' }]
          );
        }
        // Otherwise, show individual error messages for each endpoint
        else {
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
          
          if (!result.rewardsResult.success && result.rewardsResult.error) {
            const rewardsError = getUserFriendlyErrorMessage(result.rewardsResult.error);
            errorMessages.push(`Rewards data: ${rewardsError}`);
          }

          // Show error alert with all error messages
          Alert.alert(
            'Data Refresh Error',
            `There were problems refreshing beer data:\n\n${errorMessages.join('\n\n')}`,
            [{ text: 'OK' }]
          );
        }
      }

      // Refresh the local display regardless of API errors (use cached data)
      try {
        const freshBeers = await getMyBeers();

        // Set the base beers
        setTastedBeers(freshBeers);

        // Sort the beers based on current sort order before setting them
        let sortedBeers = [...freshBeers];
        if (sortBy === 'name') {
          sortedBeers.sort((a, b) => (a.brew_name || '').localeCompare(b.brew_name || ''));
        } else {
          // Sort by tasted_date
          sortedBeers.sort((a, b) => {
            // Parse dates in format MM/DD/YYYY
            const partsA = (a.tasted_date || '').split('/');
            const partsB = (b.tasted_date || '').split('/');

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
        }

        // Apply the sorted beers
        setDisplayedBeers(sortedBeers);
        setError(null);

        // Show success message if no errors
        if (!result.hasErrors) {
          console.log('All data refreshed successfully from TastedBrewList tab');
        }
      } catch (localError: any) {
        console.error('Error loading local beer data after refresh:', localError);
        setError('Failed to load beer data from local storage.');
      }
    } catch (error: any) {
      console.error('Error in unified refresh from TastedBrewList:', error);
      setError('Failed to refresh beer data. Please try again later.');
      Alert.alert('Error', 'Failed to refresh beer data. Please try again later.');
    } finally {
      setRefreshing(false);
    }
  }, [sortBy]);

  // Filter beers when search text changes
  useEffect(() => {
    let filtered = tastedBeers;

    // Apply text search filter
    if (searchText.trim() !== '') {
      const searchLower = searchText.toLowerCase().trim();
      filtered = filtered.filter(beer =>
        (beer.brew_name && beer.brew_name.toLowerCase().includes(searchLower)) ||
        (beer.brewer && beer.brewer.toLowerCase().includes(searchLower)) ||
        (beer.brew_style && beer.brew_style.toLowerCase().includes(searchLower)) ||
        (beer.brew_description && beer.brew_description.toLowerCase().includes(searchLower)) ||
        (beer.brewer_loc && beer.brewer_loc.toLowerCase().includes(searchLower))
      );
    }

    // Apply sorting
    let sortedAndFiltered = [...filtered];
    if (sortBy === 'name') {
      sortedAndFiltered.sort((a, b) => (a.brew_name || '').localeCompare(b.brew_name || ''));
    } else {
      // Parse dates in format MM/DD/YYYY
      sortedAndFiltered.sort((a, b) => {
        const partsA = (a.tasted_date || '').split('/');
        const partsB = (b.tasted_date || '').split('/');

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
    }

    setDisplayedBeers(sortedAndFiltered);
    // Reset expanded item when filter changes
    setExpandedId(null);
  }, [tastedBeers, searchText, sortBy]);

  const toggleSortOption = () => {
    setSortBy(sortBy === 'date' ? 'name' : 'date');
  };

  // Function to format date to readable format
  const formatDate = (dateStr: string | undefined): string => {
    if (!dateStr) return 'Unknown date';

    try {
      // Parse date string in format MM/DD/YYYY
      const parts = dateStr.split('/');
      if (parts.length === 3) {
        const month = parseInt(parts[0], 10) - 1; // JS months are 0-based
        const day = parseInt(parts[1], 10);
        const year = parseInt(parts[2], 10);

        const date = new Date(year, month, day);
        return date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        });
      }
      return dateStr; // Return as-is if not in expected format
    } catch (err) {
      console.error('Error formatting date:', err);
      return 'Invalid date';
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const handleSearchChange = (text: string) => {
    setSearchText(text);
  };

  const clearSearch = () => {
    setSearchText('');
  };

  const renderBeerItem = (item: Beerfinder) => {
    const isExpanded = expandedId === item.id;

    return (
      <TouchableOpacity
        key={item.id}
        onPress={() => toggleExpand(item.id)}
        activeOpacity={0.8}
      >
        <View style={[
          styles.beerItem,
          {
            backgroundColor: cardColor,
            borderColor: borderColor
          },
          isExpanded && styles.expandedItem
        ]}>
          <ThemedText type="defaultSemiBold" style={styles.beerName}>
            {item.brew_name || 'Unnamed Beer'}
          </ThemedText>
          <ThemedText>
            {item.brewer} {item.brewer_loc ? `• ${item.brewer_loc}` : ''}
          </ThemedText>
          <ThemedText>
            {item.brew_style} {item.brew_container ? `• ${item.brew_container}` : ''}
          </ThemedText>
          <ThemedText style={styles.dateAdded}>
            Tasted: {formatDate(item.tasted_date)}
          </ThemedText>

          {isExpanded && item.brew_description && (
            <View style={[styles.descriptionContainer, { borderTopColor: borderColor }]}>
              <ThemedText type="defaultSemiBold" style={styles.descriptionTitle}>
                Description:
              </ThemedText>
              <ThemedText style={styles.description}>
                {item.brew_description.replace(/<\/?p>/g, '').replace(/<\/?br ?\/?>/, '\n')}
              </ThemedText>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderFilterButtons = () => {
    return (
      <View style={styles.filtersContainer}>
        <SearchBar
          searchText={searchText}
          onSearchChange={handleSearchChange}
          onClear={clearSearch}
          placeholder="Search tasted beer..."
        />
        <View style={styles.beerCountContainer}>
          <ThemedText style={styles.beerCount}>
            {displayedBeers.length} {displayedBeers.length === 1 ? 'brew' : 'brews'} tasted
          </ThemedText>
        </View>
        <View style={styles.filterContainer}>
          <TouchableOpacity
            style={styles.sortButton}
            onPress={toggleSortOption}
            activeOpacity={0.7}
          >
            <ThemedText style={styles.sortButtonText}>
              Sort by: {sortBy === 'date' ? 'Name' : 'Date'}
            </ThemedText>
            <IconSymbol
              name={sortBy === 'date' ? 'textformat' : 'calendar'}
              size={16}
              color={textColor}
              style={styles.sortIcon}
            />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {loading ? (
        <LoadingIndicator />
      ) : error ? (
        <View style={styles.errorContainer}>
          <ThemedText style={styles.errorText}>{error}</ThemedText>
          <TouchableOpacity onPress={loadBeers}>
            <ThemedText>Retry</ThemedText>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          {renderFilterButtons()}

          {displayedBeers.length === 0 ? (
            <View style={styles.emptyContainer}>
              <ThemedText style={styles.emptyText}>
                {searchText
                  ? "No tasted beer matches your search criteria."
                  : "No beers in your current round yet. Start exploring and log some brews!"}
              </ThemedText>
            </View>
          ) : (
            <View style={{ flex: 1, paddingBottom: tabBarHeight + 10 }}>
              <FlatList
                data={displayedBeers}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => renderBeerItem(item)}
                contentContainerStyle={styles.listContent}
                refreshing={refreshing}
                onRefresh={handleRefresh}
                initialNumToRender={10}
                maxToRenderPerBatch={10}
                windowSize={10}
              />
            </View>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  beerItem: {
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    marginHorizontal: 1, // Add small margin to prevent bleed
  },
  expandedItem: {
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  beerName: {
    marginBottom: 6,
    fontSize: 16,
  },
  dateAdded: {
    marginTop: 8,
    fontSize: 12,
    opacity: 0.8,
  },
  descriptionContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  descriptionTitle: {
    marginBottom: 6,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
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
  filterContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(150, 150, 150, 0.1)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  sortButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  sortIcon: {
    marginLeft: 8,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  errorText: {
    textAlign: 'center',
    marginBottom: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  emptyText: {
    textAlign: 'center',
  },
});