import React, { useEffect, useState, useCallback } from 'react';
import { StyleSheet, View, TouchableOpacity, Alert, FlatList } from 'react-native';
import { getAllBeers, refreshBeersFromAPI, areApiUrlsConfigured } from '@/src/database/db';
import { ThemedText } from './ThemedText';
import { ThemedView } from './ThemedView';
import { LoadingIndicator } from './LoadingIndicator';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useColorScheme } from '@/hooks/useColorScheme';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { SearchBar } from './SearchBar';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useBottomTabOverflow } from '@/components/ui/TabBarBackground';

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

export const BeerList = () => {
  // All hooks must be called at the top level, before any conditional logic
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const tabOverflow = useBottomTabOverflow();
  const [allBeers, setAllBeers] = useState<Beer[]>([]);
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
  
  // Define all derived values outside of hooks and render methods
  const buttonTextColor = colorScheme === 'dark' && (isDraftOnly || isHeaviesOnly || isIpaOnly || sortBy === 'name') ? '#000000' : 'white';
  const activeBgColor = colorScheme === 'dark' && (isDraftOnly || isHeaviesOnly || isIpaOnly || sortBy === 'name') ? '#FFC107' : activeButtonColor;

  const loadBeers = async () => {
    try {
      setLoading(true);
      const data = await getAllBeers();
      // Filter out any beers with empty or null brew_name as a second layer of protection
      const filteredData = data.filter(beer => beer.brew_name && beer.brew_name.trim() !== '');
      setAllBeers(filteredData);
      setDisplayedBeers(filteredData);
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
      await refreshBeersFromAPI();
      const freshBeers = await getAllBeers();
      setAllBeers(freshBeers);
      setDisplayedBeers(freshBeers);
      setError(null);
    } catch (error) {
      console.error('Error refreshing beers:', error);
      Alert.alert('Error', 'Failed to refresh beer list. Please try again later.');
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
  }, [sortBy]);

  // Filter beers when any filter changes or search text changes
  useEffect(() => {
    let filtered = allBeers;

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
        beer.brew_container.toLowerCase().includes('draught')
      );
    }

    if (isHeaviesOnly) {
      filtered = filtered.filter(beer => 
        beer.brew_style && 
        (beer.brew_style.toLowerCase().includes('porter') || 
         beer.brew_style.toLowerCase().includes('stout') || 
         beer.brew_style.toLowerCase().includes('barleywine') ||
         beer.brew_style.toLowerCase().includes('quad') ||
         beer.brew_style.toLowerCase().includes('tripel'))
      );
    }

    if (isIpaOnly) {
      filtered = filtered.filter(beer => 
        beer.brew_style && 
        beer.brew_style.toLowerCase().includes('ipa')
      );
    }

    // Apply sorting
    if (sortBy === 'name') {
      filtered.sort((a, b) => (a.brew_name || '').localeCompare(b.brew_name || ''));
    } else {
      filtered.sort((a, b) => {
        const dateA = parseInt(a.added_date || '0', 10);
        const dateB = parseInt(b.added_date || '0', 10);
        return dateB - dateA; // Descending order
      });
    }

    setDisplayedBeers(filtered);
    // Reset expanded item when filter changes
    setExpandedId(null);
  }, [isDraftOnly, isHeaviesOnly, isIpaOnly, allBeers, sortBy, searchText]);

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
          placeholder="Search beers..."
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
            style={[
              styles.filterButton,
              {
                backgroundColor: inactiveButtonColor,
              },
            ]}
            onPress={toggleSortOption}
            activeOpacity={0.7}
          >
            <ThemedText
              style={[
                styles.filterButtonText,
                {
                  color: inactiveButtonTextColor,
                },
              ]}
            >
              {sortBy === 'name' ? 'Sort: Name' : 'Sort: Date'}
            </ThemedText>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'right', 'left']}>
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
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent', // Let ThemedView handle the background
  },
  filtersContainer: {
    marginBottom: 16,
  },
  beerCountContainer: {
    marginBottom: 8,
  },
  beerCount: {
    fontWeight: '600',
  },
  filterContainer: {
    flexDirection: 'row',
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
  filterButtonText: {
    fontWeight: '600',
  },
  resetButton: {
    marginTop: 8,
    padding: 8,
  },
  beerItem: {
    marginBottom: 16,
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    marginHorizontal: 1, // Add small margin to prevent bleed
  },
  expandedItem: {
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  beerName: {
    marginBottom: 4,
  },
  descriptionContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  descriptionTitle: {
    marginBottom: 4,
  },
  description: {
    lineHeight: 20,
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
  resetButtonsContainer: {
    flexDirection: 'column',
    alignItems: 'center',
    marginTop: 16,
  },
  dateAdded: {
    fontSize: 12,
    marginTop: 4,
    opacity: 0.8,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
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
  noBeersText: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
}); 