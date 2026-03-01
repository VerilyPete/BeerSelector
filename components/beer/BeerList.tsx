import React, { useCallback, useMemo } from 'react';
import { StyleSheet, FlatList, RefreshControl, View, Text, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BeerItem } from './BeerItem';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/Colors';
import { BeerWithContainerType, BeerfinderWithContainerType } from '@/src/types/beer';

type DisplayableBeer = BeerWithContainerType | BeerfinderWithContainerType;

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
  numColumns?: number;
};

const EXPECTED_ITEM_HEIGHT = 150;
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
  numColumns = 1,
}) => {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme() ?? 'dark';
  const colors = Colors[colorScheme];

  const columnWrapperStyle = useMemo<ViewStyle | undefined>(() => {
    if (numColumns <= 1) return undefined;
    return {
      justifyContent: 'flex-start',
      gap: 8,
    };
  }, [numColumns]);

  const itemWrapperStyle = useMemo<ViewStyle | null>(() => {
    if (numColumns <= 1) return null;
    return {
      flex: 1,
      maxWidth: `${100 / numColumns}%`,
    };
  }, [numColumns]);

  const renderItem = useCallback(
    ({ item }: { item: DisplayableBeer }) => {
      const content = (
        <BeerItem
          beer={item}
          isExpanded={expandedId === item.id}
          onToggle={onToggleExpand}
          dateLabel={dateLabel}
          renderActions={renderItemActions ? () => renderItemActions(item) : undefined}
        />
      );

      if (numColumns > 1 && itemWrapperStyle) {
        return <View style={itemWrapperStyle}>{content}</View>;
      }

      return content;
    },
    [expandedId, onToggleExpand, dateLabel, renderItemActions, numColumns, itemWrapperStyle]
  );

  if (!loading && beers.length === 0) {
    return (
      <View style={styles.emptyContainer} testID="beer-list-empty">
        <Text style={[styles.emptyText, { color: colors.textSecondary }]} testID="beer-list-empty-message">
          {emptyMessage}
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      testID="beer-list"
      data={beers}
      keyExtractor={item => item.id}
      renderItem={renderItem}
      key={`beer-list-${numColumns}`}
      numColumns={numColumns}
      columnWrapperStyle={columnWrapperStyle}
      contentContainerStyle={[
        styles.listContent,
        { paddingBottom: TAB_BAR_HEIGHT + insets.bottom + 16 },
      ]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.tint}
          colors={[colors.tint]}
        />
      }
      initialNumToRender={10}
      maxToRenderPerBatch={10}
      windowSize={7}
      removeClippedSubviews={true}
      updateCellsBatchingPeriod={50}
      {...(numColumns === 1 && {
        getItemLayout: (_data: ArrayLike<DisplayableBeer> | null | undefined, index: number) => ({
          length: EXPECTED_ITEM_HEIGHT,
          offset: EXPECTED_ITEM_HEIGHT * index,
          index,
        }),
      })}
    />
  );
};

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: 0,
    paddingTop: 4,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: 'SpaceMono',
    fontSize: 11,
  },
});
