import React, { useEffect, useState } from 'react';
import { StyleSheet, View, TouchableOpacity, Alert, FlatList } from 'react-native';
import { getBeersNotInMyBeers, fetchAndPopulateMyBeers } from '@/src/database/db';
import { ThemedText } from './ThemedText';
import { ThemedView } from './ThemedView';
import { LoadingIndicator } from './LoadingIndicator';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useColorScheme } from '@/hooks/useColorScheme';

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
      const data = await getBeersNotInMyBeers();
      // Filter out any beers with empty or null brew_name as a second layer of protection
      const filteredData = data.filter(beer => beer.brew_name && beer.brew_name.trim() !== '');
      setAvailableBeers(filteredData);
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

  // Refresh beers from API
  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      
      // Perform the refresh
      await fetchAndPopulateMyBeers();
      await loadBeers();
      setError(null);
      
      // Show success message
      Alert.alert('Success', `Successfully refreshed My Beers data from server.`);
    } catch (err) {
      console.error('Failed to refresh beers:', err);
      setError('Failed to refresh My Beers. Please try again later.');
      Alert.alert('Error', 'Failed to refresh My Beers from server. Please try again later.');
    } finally {
      // Set refreshing to false at the end, in both success and error cases
      setRefreshing(false);
    }
  };

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

  // Filter beers when any filter changes
  useEffect(() => {
    let filtered = availableBeers;

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
         beer.brew_style.toLowerCase().includes('barleywine'))
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
  }, [isDraftOnly, isHeaviesOnly, isIpaOnly, availableBeers, sortBy]);

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
      <View style={styles.filterContainer}>
        <View style={styles.buttonRow}>
          <TouchableOpacity 
            style={[
              styles.filterButton, 
              { 
                backgroundColor: isDraftOnly ? activeBgColor : inactiveButtonColor
              }
            ]}
            onPress={toggleDraftFilter}
          >
            <ThemedText 
              style={[
                styles.filterButtonText, 
                { 
                  color: isDraftOnly ? buttonTextColor : inactiveButtonTextColor
                }
              ]}
            >
              Draft Only
            </ThemedText>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[
              styles.filterButton, 
              { 
                backgroundColor: isHeaviesOnly ? activeBgColor : inactiveButtonColor
              }
            ]}
            onPress={toggleHeaviesFilter}
          >
            <ThemedText 
              style={[
                styles.filterButtonText, 
                { 
                  color: isHeaviesOnly ? buttonTextColor : inactiveButtonTextColor
                }
              ]}
            >
              Heavies
            </ThemedText>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[
              styles.filterButton, 
              { 
                backgroundColor: isIpaOnly ? activeBgColor : inactiveButtonColor
              }
            ]}
            onPress={toggleIpaFilter}
          >
            <ThemedText 
              style={[
                styles.filterButtonText, 
                { 
                  color: isIpaOnly ? buttonTextColor : inactiveButtonTextColor
                }
              ]}
            >
              IPA
            </ThemedText>
          </TouchableOpacity>
        </View>
        
        <View style={styles.buttonRow}>
          <TouchableOpacity 
            style={[
              styles.sortButton, 
              { 
                backgroundColor: sortBy === 'name' ? activeBgColor : inactiveButtonColor
              }
            ]}
            onPress={toggleSortOption}
          >
            <ThemedText 
              style={[
                styles.filterButtonText, 
                { 
                  color: sortBy === 'name' ? buttonTextColor : inactiveButtonTextColor 
                }
              ]}
            >
              {sortBy === 'name' ? 'Sorting by Name' : 'Sorting by Date'}
            </ThemedText>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[
              styles.refreshButton, 
              { 
                backgroundColor: inactiveButtonColor,
                opacity: refreshing ? 0.7 : 1 
              }
            ]}
            onPress={handleRefresh}
            disabled={refreshing}
          >
            <ThemedText 
              style={[
                styles.filterButtonText, 
                { 
                  color: inactiveButtonTextColor
                }
              ]}
            >
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </ThemedText>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <LoadingIndicator message="Loading beers..." />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <ThemedText style={styles.errorText}>{error}</ThemedText>
        <TouchableOpacity 
          style={styles.retryButton}
          onPress={loadBeers}
        >
          <ThemedText style={styles.retryButtonText}>Retry</ThemedText>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {renderFilterButtons()}
      
      <View style={styles.listContainer}>
        {displayedBeers.length === 0 ? (
          <View style={styles.emptyContainer}>
            <ThemedText style={styles.emptyText}>
              No beers available that you haven't tried yet. Try changing the filters or refreshing the list.
            </ThemedText>
          </View>
        ) : (
          <FlatList
            data={displayedBeers}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => renderBeerItem(item)}
            showsVerticalScrollIndicator={true}
            contentContainerStyle={styles.flatListContent}
          />
        )}
      </View>
    </ThemedView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
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
    marginBottom: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  filterButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 4,
    marginHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortButton: {
    flex: 2,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 4,
    marginRight: 4,
    alignItems: 'center',
    justifyContent: 'center',
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
    fontSize: 14,
  },
  listContainer: {
    flex: 1,
  },
  beerItem: {
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
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
}); 