import React, { useEffect, useState, useCallback } from 'react';
import { StyleSheet, View, TouchableOpacity, Alert, FlatList } from 'react-native';
import { getMyBeers, fetchAndPopulateMyBeers, areApiUrlsConfigured } from '@/src/database/db';
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
  tasted_date: string;
};

type SortOption = 'date' | 'name';

export const TastedBrewList = () => {
  // All hooks must be called at the top level, before any conditional logic
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const tabOverflow = useBottomTabOverflow();
  const [tastedBeers, setTastedBeers] = useState<Beer[]>([]);
  const [displayedBeers, setDisplayedBeers] = useState<Beer[]>([]);
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
      
      // Try to fetch My Beers data if it hasn't been loaded yet
      try {
        await fetchAndPopulateMyBeers();
      } catch (err) {
        console.log('Failed to fetch My Beers data, continuing with local data:', err);
        // Continue with whatever data we have locally
      }
      
      const data = await getMyBeers();
      // Filter out any beers with empty or null brew_name as a second layer of protection
      const filteredData = data.filter(beer => beer.brew_name && beer.brew_name.trim() !== '');
      setTastedBeers(filteredData);
      setDisplayedBeers(filteredData);
      setError(null);
    } catch (err) {
      console.error('Failed to load tasted beers:', err);
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
      setTastedBeers(freshBeers);
      setDisplayedBeers(freshBeers);
    } catch (error) {
      console.error('Error refreshing tasted beers:', error);
      Alert.alert('Error', 'Failed to refresh tasted beer list. Please try again later.');
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
    
    setDisplayedBeers(sortedBeers);
  }, [sortBy, tastedBeers]);

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
        (beer.brew_description && beer.brew_description.toLowerCase().includes(searchLower))
      );
    }

    // Apply sorting
    if (sortBy === 'name') {
      filtered.sort((a, b) => (a.brew_name || '').localeCompare(b.brew_name || ''));
    } else {
      // Parse dates in format MM/DD/YYYY
      filtered.sort((a, b) => {
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

    setDisplayedBeers(filtered);
    // Reset expanded item when filter changes
    setExpandedId(null);
  }, [tastedBeers, searchText]);

  const toggleSortOption = () => {
    setSortBy(sortBy === 'date' ? 'name' : 'date');
  };

  // Function to format date to readable format
  const formatDate = (dateStr: string): string => {
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

  const renderBeerItem = (item: Beer) => {
    const isExpanded = expandedId === item.id;
    
    return (
      <TouchableOpacity 
        key={item.id} 
        style={styles.card} 
        onPress={() => toggleExpand(item.id)}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <ThemedText type="subtitle" style={styles.beerName}>
            {item.brew_name}
          </ThemedText>
          <ThemedText type="default" style={styles.brewerInfo}>
            {item.brewer}{item.brewer_loc ? `, ${item.brewer_loc}` : ''}
          </ThemedText>
        </View>
        
        <View style={styles.cardContent}>
          <View style={styles.metaInfo}>
            <ThemedText type="default" style={styles.styleInfo}>
              {item.brew_style}
            </ThemedText>
            <ThemedText type="default" style={styles.containerInfo}>
              {item.brew_container}
            </ThemedText>
          </View>
          
          <ThemedText type="default" style={styles.dateInfo}>
            Tasted: {formatDate(item.tasted_date)}
          </ThemedText>
          
          {isExpanded && item.brew_description && (
            <ThemedText type="default" style={styles.description}>
              {item.brew_description.replace(/<\/?p>/g, '').replace(/<\/?br ?\/?>/, '\n')}
            </ThemedText>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderFilterButtons = () => {
    return (
      <View style={styles.filterContainer}>
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={styles.sortButton}
            onPress={toggleSortOption}
          >
            <ThemedText style={styles.sortButtonText}>
              Sort by: {sortBy === 'date' ? 'Date' : 'Name'}
            </ThemedText>
            <IconSymbol
              name={sortBy === 'date' ? 'calendar' : 'textformat'}
              size={16}
              color={textColor}
              style={styles.sortIcon}
            />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (loading) {
    return <LoadingIndicator />;
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <ThemedText style={styles.errorText}>{error}</ThemedText>
      </View>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SearchBar 
        searchText={searchText}
        onSearchChange={handleSearchChange}
        onClear={clearSearch}
        placeholder="Search tasted brews..." 
      />
      
      {renderFilterButtons()}
      
      {displayedBeers.length === 0 ? (
        <View style={styles.emptyContainer}>
          <ThemedText style={styles.emptyText}>
            No tasted brews found. Pull down to refresh.
          </ThemedText>
        </View>
      ) : (
        <FlatList
          data={displayedBeers}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => renderBeerItem(item)}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: tabBarHeight + insets.bottom + tabOverflow }
          ]}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={10}
        />
      )}
    </ThemedView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  card: {
    borderRadius: 12,
    marginBottom: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    marginBottom: 8,
  },
  beerName: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  brewerInfo: {
    fontSize: 14,
    marginBottom: 4,
  },
  cardContent: {
    flex: 1,
  },
  metaInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  styleInfo: {
    fontSize: 14,
    flex: 2,
  },
  containerInfo: {
    fontSize: 14,
    flex: 1,
    textAlign: 'right',
  },
  dateInfo: {
    fontSize: 14,
    marginTop: 8,
    fontStyle: 'italic',
  },
  description: {
    fontSize: 14,
    marginTop: 12,
    lineHeight: 20,
  },
  filterContainer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  filterRow: {
    flexDirection: 'row',
    marginBottom: 8,
    justifyContent: 'flex-end',
    alignItems: 'center',
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