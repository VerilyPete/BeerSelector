import React from 'react';
import { StyleSheet, View, TouchableOpacity } from 'react-native';
import { ThemedText } from '../ThemedText';
import { useThemeColor } from '@/hooks/useThemeColor';

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

type BeerItemProps = {
  beer: Beer;
  isExpanded: boolean;
  onToggle: (id: string) => void;
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

export const BeerItem: React.FC<BeerItemProps> = ({ beer, isExpanded, onToggle }) => {
  // Theme colors
  const cardColor = useThemeColor({}, 'background');
  const borderColor = useThemeColor({ light: '#e0e0e0', dark: '#333' }, 'text');

  return (
    <TouchableOpacity
      onPress={() => onToggle(beer.id)}
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
          {beer.brew_name || 'Unnamed Beer'}
        </ThemedText>
        <ThemedText>
          {beer.brewer} {beer.brewer_loc ? `• ${beer.brewer_loc}` : ''}
        </ThemedText>
        <ThemedText>
          {beer.brew_style} {beer.brew_container ? `• ${beer.brew_container}` : ''}
        </ThemedText>
        <ThemedText style={styles.dateAdded}>
          Date Added: {formatDate(beer.added_date)}
        </ThemedText>

        {isExpanded && beer.brew_description && (
          <View style={[styles.descriptionContainer, { borderTopColor: borderColor }]}>
            <ThemedText type="defaultSemiBold" style={styles.descriptionTitle}>
              Description:
            </ThemedText>
            <ThemedText style={styles.description}>
              {beer.brew_description}
            </ThemedText>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
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
  dateAdded: {
    fontSize: 12,
    marginTop: 4,
    opacity: 0.8,
  },
});
