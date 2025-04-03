import React, { useEffect, useState } from 'react';
import { StyleSheet, View, TouchableOpacity, Alert } from 'react-native';
import { getAllBeers, refreshBeersFromAPI } from '@/src/database/db';
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

export const BeerList = () => {
  // All hooks must be called at the top level, before any conditional logic
  const colorScheme = useColorScheme();
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

  // Refresh beers from API
  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      
      // No initial alert, just update the button text to "Refreshing..."
      
      // Perform the refresh
      const refreshedBeers = await refreshBeersFromAPI();
      // Filter out any beers with empty or null brew_name as a second layer of protection
      const filteredData = refreshedBeers.filter(beer => beer.brew_name && beer.brew_name.trim() !== '');
      setAllBeers(filteredData);
      setDisplayedBeers(filteredData);
      setError(null);
      
      // Show success message
      Alert.alert('Success', `Successfully refreshed ${filteredData.length} beers from server.`);
    } catch (err) {
      console.error('Failed to refresh beers:', err);
      setError('Failed to refresh beers. Please try again later.');
      Alert.alert('Error', 'Failed to refresh beers from server. Please try again later.');
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
    let filtered = allBeers;

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
  }, [isDraftOnly, isHeaviesOnly, isIpaOnly, allBeers, sortBy]);

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
      <View style={styles.filtersContainer}>
        <View style={styles.beerCountContainer}>
          <ThemedText style={styles.beerCount}>
            {displayedBeers.length} beers found
          </ThemedText>
        </View>
        
        <View style={styles.filterContainer}>
          <TouchableOpacity 
            style={[
              styles.filterButton, 
              { 
                backgroundColor: isDraftOnly ? activeBgColor : inactiveButtonColor,
                borderWidth: 1,
                borderColor: isDraftOnly ? activeBgColor : borderColor,
              }
            ]}
            onPress={toggleDraftFilter}
          >
            <ThemedText style={[
              styles.filterButtonText, 
              { 
                color: isDraftOnly ? buttonTextColor : inactiveButtonTextColor 
              }
            ]}>
              {isDraftOnly ? 'Draft: On' : 'Draft Only'}
            </ThemedText>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[
              styles.filterButton, 
              { 
                backgroundColor: isHeaviesOnly ? activeBgColor : inactiveButtonColor,
                borderWidth: 1,
                borderColor: isHeaviesOnly ? activeBgColor : borderColor,
                opacity: isIpaOnly ? 0.5 : 1,
              }
            ]}
            onPress={toggleHeaviesFilter}
            disabled={isIpaOnly}
          >
            <ThemedText style={[
              styles.filterButtonText, 
              { 
                color: isHeaviesOnly ? buttonTextColor : inactiveButtonTextColor 
              }
            ]}>
              {isHeaviesOnly ? 'Heavies: On' : 'Heavies'}
            </ThemedText>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[
              styles.filterButton, 
              { 
                backgroundColor: isIpaOnly ? activeBgColor : inactiveButtonColor,
                borderWidth: 1,
                borderColor: isIpaOnly ? activeBgColor : borderColor,
                opacity: isHeaviesOnly ? 0.5 : 1,
              }
            ]}
            onPress={toggleIpaFilter}
            disabled={isHeaviesOnly}
          >
            <ThemedText style={[
              styles.filterButtonText, 
              { 
                color: isIpaOnly ? buttonTextColor : inactiveButtonTextColor 
              }
            ]}>
              {isIpaOnly ? 'IPA: On' : 'IPA'}
            </ThemedText>
          </TouchableOpacity>
        </View>

        <View style={styles.sortContainer}>
          <TouchableOpacity 
            style={[
              styles.sortButton, 
              { 
                backgroundColor: sortBy === 'name' ? activeBgColor : inactiveButtonColor,
                borderWidth: 1,
                borderColor: sortBy === 'name' ? activeBgColor : borderColor,
              }
            ]}
            onPress={toggleSortOption}
          >
            <ThemedText style={[
              styles.filterButtonText, 
              { 
                color: sortBy === 'name' ? buttonTextColor : inactiveButtonTextColor 
              }
            ]}>
              Sort: {sortBy === 'date' ? 'Newest First' : 'A-Z'}
            </ThemedText>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[
              styles.sortButton, 
              { 
                backgroundColor: inactiveButtonColor,
                borderWidth: 1,
                borderColor: borderColor,
                marginLeft: 8,
              }
            ]}
            onPress={handleRefresh}
            disabled={refreshing}
          >
            <ThemedText style={[
              styles.filterButtonText, 
              { 
                color: inactiveButtonTextColor 
              }
            ]}>
              {refreshing ? 'Refreshing...' : 'Refresh Data'}
            </ThemedText>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (loading) {
    return <LoadingIndicator message="Loading beers..." />;
  }

  if (error && !refreshing) {
    return (
      <View style={styles.centered}>
        <ThemedText style={styles.errorText}>{error}</ThemedText>
        <TouchableOpacity onPress={loadBeers} style={styles.resetButton}>
          <ThemedText style={{ color: activeButtonColor }}>Try Again</ThemedText>
        </TouchableOpacity>
      </View>
    );
  }

  if (!displayedBeers || displayedBeers.length === 0) {
    return (
      <View style={styles.container}>
        {renderFilterButtons()}
        <View style={styles.centered}>
          <ThemedText>No beers found.</ThemedText>
          {(isDraftOnly || isHeaviesOnly || isIpaOnly) && (
            <View style={styles.resetButtonsContainer}>
              {isDraftOnly && (
                <TouchableOpacity onPress={toggleDraftFilter} style={styles.resetButton}>
                  <ThemedText style={{ color: activeButtonColor }}>Clear Draft Filter</ThemedText>
                </TouchableOpacity>
              )}
              {isHeaviesOnly && (
                <TouchableOpacity onPress={toggleHeaviesFilter} style={styles.resetButton}>
                  <ThemedText style={{ color: activeButtonColor }}>Clear Heavies Filter</ThemedText>
                </TouchableOpacity>
              )}
              {isIpaOnly && (
                <TouchableOpacity onPress={toggleIpaFilter} style={styles.resetButton}>
                  <ThemedText style={{ color: activeButtonColor }}>Clear IPA Filter</ThemedText>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </View>
    );
  }

  // Return the list of beer items directly rather than using a FlatList
  return (
    <View style={styles.container}>
      {renderFilterButtons()}
      {displayedBeers.map(renderBeerItem)}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 16,
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
  sortContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
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
  sortButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
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
}); 