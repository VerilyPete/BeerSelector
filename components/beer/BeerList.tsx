import React, { useCallback } from 'react';
import { StyleSheet, FlatList, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedView } from '../ThemedView';
import { ThemedText } from '../ThemedText';
import { BeerItem } from './BeerItem';
import { useThemeColor } from '@/hooks/useThemeColor';
import { BeerWithGlassType, BeerfinderWithGlassType } from '@/src/types/beer';

// Union type to accept both BeerWithGlassType and BeerfinderWithGlassType
// These branded types guarantee the glass_type property is present
type DisplayableBeer = BeerWithGlassType | BeerfinderWithGlassType;

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

/**
 * MP-3 Bottleneck #1: Expected BeerItem height for getItemLayout optimization
 * Using collapsed height provides best performance. Minor scroll inaccuracy when
 * item is expanded is acceptable since only one item expands at a time.
 */
const EXPECTED_ITEM_HEIGHT = 150;

/**
 * Tab bar height constant (typical Expo Router tab bar)
 * Combined with safe area insets for accurate bottom padding
 */
const TAB_BAR_HEIGHT = 49;

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
  const insets = useSafeAreaInsets();
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
      contentContainerStyle={[
        styles.listContent,
        { paddingBottom: TAB_BAR_HEIGHT + insets.bottom + 16 }
      ]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={tintColor}
          colors={[tintColor]}
        />
      }
      // Performance optimization: Reduce initial render and batch sizes for 60+ FPS
      initialNumToRender={10}
      maxToRenderPerBatch={10}
      // MP-3 Final: windowSize=5 (2.5 above + 2.5 below viewport) for optimal scroll FPS
      windowSize={5}
      removeClippedSubviews={true}
      updateCellsBatchingPeriod={50}
      getItemLayout={(data, index) => ({
        length: EXPECTED_ITEM_HEIGHT,
        offset: EXPECTED_ITEM_HEIGHT * index,
        index,
      })}
    />
  );
};

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    // paddingBottom is calculated dynamically: TAB_BAR_HEIGHT + insets.bottom + 16
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
