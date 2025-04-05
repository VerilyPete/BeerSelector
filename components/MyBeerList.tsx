import React, { useEffect, useState, useCallback } from 'react';
import { StyleSheet, View, TouchableOpacity, Alert, FlatList } from 'react-native';
import { getBeersNotInMyBeers, fetchAndPopulateMyBeers, getMyBeers, areApiUrlsConfigured } from '@/src/database/db';
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

export const MyBeerList = () => {
  // All hooks must be called at the top level, before any conditional logic
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const tabOverflow = useBottomTabOverflow();
  const [availableBeers, setAvailableBeers] = useState<Beer[]>([]);
  const [displayedBeers, setDisplayedBeers] = useState<Beer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isDraftOnly, setIsDraftOnly] = useState(false);
  const [isHeaviesOnly, setIsHeaviesOnly] = useState(false);
  const [isIpaOnly, setIsIpaOnly] = useState(false);
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
  const buttonTextColor = colorScheme === 'dark' && (isDraftOnly || isHeaviesOnly || isIpaOnly || sortBy === 'name') ? '#000000' : 'white';
  const activeBgColor = colorScheme === 'dark' && (isDraftOnly || isHeaviesOnly || isIpaOnly || sortBy === 'name') ? '#FFC107' : activeButtonColor;

  const loadBeers = async () => {
    try {
      setLoading(true);
      
      // Try to fetch My Beers data if it hasn't been loaded yet
      try {
        await fetchAndPopulateMyBeers();
      } catch (err) {
        console.log('Failed to fetch My Beers data, continuing with local data:', err);
        // Continue with whatever data we have locally
      }
      
      const data = await getBeersNotInMyBeers();
      // Filter out any beers with empty or null brew_name as a second layer of protection
      const filteredData = data.filter(beer => beer.brew_name && beer.brew_name.trim() !== '');
      setAvailableBeers(filteredData);
      setDisplayedBeers(filteredData);
      setError(null);
    } catch (err) {
      console.error('Failed to load beers:', err);
      setError('Failed to load beers. Please check your internet connection and try again.');
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
      
      // If API URLs are configured, proceed with refresh
      await fetchAndPopulateMyBeers();
      const freshBeers = await getMyBeers();
      setAvailableBeers(freshBeers);
      setDisplayedBeers(freshBeers);
    } catch (error) {
      console.error('Error refreshing my beers:', error);
      Alert.alert('Error', 'Failed to refresh my beer list. Please try again later.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Sort beers when sort option changes
  useEffect(() => {
    if (displayedBeers.length === 0) return;
    
    const sortedBeers = [...displayedBeers];
    
    if (sortBy === 'name') {
      sortedBeers.sort((a, b) => {
        return (a.brew_name || '').localeCompare(b.brew_name || '');
      });
    } else {
      // Default sort is by date (already handled by the database query)
      sortedBeers.sort((a, b) => {
        const dateA = parseInt(a.added_date || '0', 10);
        const dateB = parseInt(b.added_date || '0', 10);
        return dateB - dateA; // Descending order
      });
    }
    
    setDisplayedBeers(sortedBeers);
  }, [sortBy, availableBeers]);

  // Filter beers when any filter changes or search text changes
  useEffect(() => {
    let filtered = availableBeers;

    // Apply text search filter
    if (searchText.trim() !== '') {
      const searchLower = searchText.toLowerCase().trim();
      filtered = filtered.filter(beer => 
        (beer.brew_name && beer.brew_name.toLowerCase().includes(searchLower)) ||
        (beer.brewer && beer.brewer.toLowerCase().includes(searchLower)) ||
        (beer.brew_style && beer.brew_style.toLowerCase().includes(searchLower)) ||
        (beer.brew_description && beer.brew_description.toLowerCase().includes(searchLower))
      );
    }

    if (isDraftOnly) {
      filtered = filtered.filter(beer => 
        beer.brew_container && 
        (beer.brew_container.toLowerCase().includes('draught') ||
        beer.brew_container.toLowerCase().includes('draft'))
      );
    }

    if (isHeaviesOnly) {
      filtered = filtered.filter(beer => 
        beer.brew_style && 
        (beer.brew_style.toLowerCase().includes('porter') || 
         beer.brew_style.toLowerCase().includes('stout') || 
         beer.brew_style.toLowerCase().includes('barleywine'))
      );
    }

    if (isIpaOnly) {
      filtered = filtered.filter(beer => 
        beer.brew_style && 
        beer.brew_style.toLowerCase().includes('ipa')
      );
    }

    setDisplayedBeers(filtered);
    // Reset expanded item when filter changes
    setExpandedId(null);
  }, [isDraftOnly, isHeaviesOnly, isIpaOnly, availableBeers, searchText]);

  const toggleDraftFilter = () => {
    setIsDraftOnly(!isDraftOnly);
  };

  const toggleHeaviesFilter = () => {
    setIsHeaviesOnly(!isHeaviesOnly);
    // If turning on Heavies filter, turn off IPA filter
    if (!isHeaviesOnly) {
      setIsIpaOnly(false);
    }
  };

  const toggleIpaFilter = () => {
    setIsIpaOnly(!isIpaOnly);
    // If turning on IPA filter, turn off Heavies filter
    if (!isIpaOnly) {
      setIsHeaviesOnly(false);
    }
  };

  const toggleSortOption = () => {
    setSortBy(sortBy === 'date' ? 'name' : 'date');
  };

  // Function to format unix timestamp to readable date
  const formatDate = (timestamp: string): string => {
    if (!timestamp) return 'Unknown date';
    
    try {
      // Convert unix timestamp (seconds) to milliseconds
      const date = new Date(parseInt(timestamp, 10) * 1000);
      return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      });
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

  const renderBeerItem = (item: Beer) => {
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
            Date Added: {formatDate(item.added_date)}
          </ThemedText>
          
          {isExpanded && item.brew_description && (
            <View style={[styles.descriptionContainer, { borderTopColor: borderColor }]}>
              <ThemedText type="defaultSemiBold" style={styles.descriptionTitle}>
                Description:
              </ThemedText>
              <ThemedText style={styles.description}>
                {item.brew_description}
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
          placeholder="Search available beers..."
        />
        <View style={styles.beerCountContainer}>
          <ThemedText style={styles.beerCount}>
            {displayedBeers.length} {displayedBeers.length === 1 ? 'beer' : 'beers'} available
          </ThemedText>
        </View>
        <View style={styles.filterContainer}>
          <TouchableOpacity
            style={[
              styles.filterButton,
              {
                backgroundColor: isDraftOnly ? activeBgColor : inactiveButtonColor,
              },
            ]}
            onPress={toggleDraftFilter}
            activeOpacity={0.7}
          >
            <ThemedText
              style={[
                styles.filterButtonText,
                {
                  color: isDraftOnly ? buttonTextColor : inactiveButtonTextColor,
                },
              ]}
            >
              Draft Only
            </ThemedText>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[
              styles.filterButton,
              {
                backgroundColor: isHeaviesOnly ? activeBgColor : inactiveButtonColor,
              },
            ]}
            onPress={toggleHeaviesFilter}
            activeOpacity={0.7}
          >
            <ThemedText
              style={[
                styles.filterButtonText,
                {
                  color: isHeaviesOnly ? buttonTextColor : inactiveButtonTextColor,
                },
              ]}
            >
              Heavies
            </ThemedText>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[
              styles.filterButton,
              {
                backgroundColor: isIpaOnly ? activeBgColor : inactiveButtonColor,
              },
            ]}
            onPress={toggleIpaFilter}
            activeOpacity={0.7}
          >
            <ThemedText
              style={[
                styles.filterButtonText,
                {
                  color: isIpaOnly ? buttonTextColor : inactiveButtonTextColor,
                },
              ]}
            >
              IPA
            </ThemedText>
          </TouchableOpacity>

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
        <View style={{ flex: 1 }}>
          {renderFilterButtons()}
          {displayedBeers.length === 0 ? (
            <View style={styles.centered}>
              <ThemedText style={styles.noBeersText}>
                No beers match your filters
              </ThemedText>
            </View>
          ) : (
            <View style={{ flex: 1, paddingBottom: tabBarHeight + 10 }}>
              <FlatList
                data={displayedBeers}
                renderItem={({ item }) => renderBeerItem(item)}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                onRefresh={handleRefresh}
                refreshing={refreshing}
                style={{ flex: 1 }}
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
    backgroundColor: 'transparent', // Let ThemedView handle the background
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  errorText: {
    marginBottom: 16,
    textAlign: 'center',
    fontSize: 16,
  },
  errorHint: {
    marginBottom: 16,
    textAlign: 'center',
    fontSize: 14,
    opacity: 0.7,
    paddingHorizontal: 20,
  },
  retryButton: {
    backgroundColor: '#FF6B6B',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 4,
  },
  retryButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  filterContainer: {
    flexDirection: 'row',
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  filterButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginRight: 8,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  refreshButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 4,
    marginLeft: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterButtonText: {
    fontWeight: '600',
  },
  listContainer: {
    flex: 1,
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 16,
    opacity: 0.7,
    lineHeight: 24,
  },
  flatListContent: {
    paddingBottom: 20,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  noBeersText: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  buttonText: {
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
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
}); 