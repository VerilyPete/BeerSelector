import React, { useCallback } from 'react';
import { StyleSheet, FlatList, RefreshControl } from 'react-native';
import { ThemedView } from '../ThemedView';
import { ThemedText } from '../ThemedText';
import { BeerItem } from './BeerItem';
import { useThemeColor } from '@/hooks/useThemeColor';
import { Beer, Beerfinder } from '@/src/types/beer';

// Union type to accept both Beer and Beerfinder
type DisplayableBeer = Beer | Beerfinder;

type BeerListProps = {
  beers: DisplayableBeer[];
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  emptyMessage?: string;
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  dateLabel?: string;
  renderItemActions?: (beer: DisplayableBeer) => React.ReactNode;
};

export const BeerList: React.FC<BeerListProps> = ({
  beers,
  loading,
  refreshing,
  onRefresh,
  emptyMessage = 'No beers found',
  expandedId,
  onToggleExpand,
  dateLabel,
  renderItemActions,
}) => {
  const tintColor = useThemeColor({}, 'tint');

  // Memoize renderItem to prevent unnecessary re-renders of FlatList items
  const renderItem = useCallback(({ item }: { item: DisplayableBeer }) => (
    <BeerItem
      beer={item}
      isExpanded={expandedId === item.id}
      onToggle={onToggleExpand}
      dateLabel={dateLabel}
      renderActions={renderItemActions ? () => renderItemActions(item) : undefined}
    />
  ), [expandedId, onToggleExpand, dateLabel, renderItemActions]);

  if (!loading && beers.length === 0) {
    return (
      <ThemedView style={styles.emptyContainer} testID="beer-list-empty">
        <ThemedText style={styles.emptyText} testID="beer-list-empty-message">{emptyMessage}</ThemedText>
      </ThemedView>
    );
  }

  return (
    <FlatList
      testID="beer-list"
      data={beers}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      contentContainerStyle={styles.listContent}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={tintColor}
          colors={[tintColor]}
        />
      }
      initialNumToRender={20}
      maxToRenderPerBatch={20}
      windowSize={21}
      removeClippedSubviews={true}
    />
  );
};

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
