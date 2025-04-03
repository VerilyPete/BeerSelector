import React, { useEffect, useState } from 'react';
import { StyleSheet, View, TouchableOpacity } from 'react-native';
import { getAllBeers } from '@/src/database/db';
import { ThemedText } from './ThemedText';
import { ThemedView } from './ThemedView';
import { LoadingIndicator } from './LoadingIndicator';
import { useThemeColor } from '@/hooks/useThemeColor';

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
  const [beers, setBeers] = useState<Beer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const cardColor = useThemeColor({}, 'background');
  const borderColor = useThemeColor({ light: '#e0e0e0', dark: '#333' }, 'text');

  useEffect(() => {
    const loadBeers = async () => {
      try {
        setLoading(true);
        const data = await getAllBeers();
        // Filter out any beers with empty or null brew_name as a second layer of protection
        setBeers(data.filter(beer => beer.brew_name && beer.brew_name.trim() !== ''));
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

  if (beers.length === 0) {
    return (
      <View style={styles.centered}>
        <ThemedText>No beers found.</ThemedText>
      </View>
    );
  }

  // Return the list of beer items directly rather than using a FlatList
  return (
    <View style={styles.container}>
      {beers.map(renderBeerItem)}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 16,
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
}); 