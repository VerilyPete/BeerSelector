import React, { useEffect, useState } from 'react';
import { StyleSheet, View, TouchableOpacity } from 'react-native';
import { getAllBeers } from '@/src/database/db';
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
};

export const BeerList = () => {
  // All hooks must be called at the top level, before any conditional logic
  const colorScheme = useColorScheme();
  const [allBeers, setAllBeers] = useState<Beer[]>([]);
  const [displayedBeers, setDisplayedBeers] = useState<Beer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isDraftOnly, setIsDraftOnly] = useState(false);
  const [isHeaviesOnly, setIsHeaviesOnly] = useState(false);
  
  // Theme colors
  const cardColor = useThemeColor({}, 'background');
  const borderColor = useThemeColor({ light: '#e0e0e0', dark: '#333' }, 'text');
  const activeButtonColor = useThemeColor({}, 'tint');
  const inactiveButtonColor = useThemeColor({ light: '#E5E5E5', dark: '#2C2C2E' }, 'background');
  const inactiveButtonTextColor = useThemeColor({ light: '#333333', dark: '#EFEFEF' }, 'text');
  
  // Define all derived values outside of hooks and render methods
  const buttonTextColor = colorScheme === 'dark' && (isDraftOnly || isHeaviesOnly) ? '#000000' : 'white';
  const activeBgColor = colorScheme === 'dark' && (isDraftOnly || isHeaviesOnly) ? '#FFC107' : activeButtonColor;

  useEffect(() => {
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
      }
    };

    loadBeers();
  }, []);

  // Filter beers when the draft filter or heavies filter changes
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

    setDisplayedBeers(filtered);
    // Reset expanded item when filter changes
    setExpandedId(null);
  }, [isDraftOnly, isHeaviesOnly, allBeers]);

  const toggleDraftFilter = () => {
    setIsDraftOnly(!isDraftOnly);
  };

  const toggleHeaviesFilter = () => {
    setIsHeaviesOnly(!isHeaviesOnly);
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
            }
          ]}
          onPress={toggleHeaviesFilter}
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
      </View>
    );
  };

  if (loading) {
    return <LoadingIndicator message="Loading beers..." />;
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <ThemedText style={styles.errorText}>{error}</ThemedText>
      </View>
    );
  }

  if (!displayedBeers || displayedBeers.length === 0) {
    return (
      <View style={styles.container}>
        {renderFilterButtons()}
        <View style={styles.centered}>
          <ThemedText>No beers found.</ThemedText>
          {(isDraftOnly || isHeaviesOnly) && (
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
  filterContainer: {
    flexDirection: 'row',
    marginBottom: 16,
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
}); 