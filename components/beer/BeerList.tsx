import React from 'react';
import { StyleSheet, FlatList, RefreshControl } from 'react-native';
import { ThemedView } from '../ThemedView';
import { ThemedText } from '../ThemedText';
import { BeerItem } from './BeerItem';
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

type BeerListProps = {
  beers: Beer[];
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  emptyMessage?: string;
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  dateLabel?: string;
  renderItemActions?: (beer: Beer) => React.ReactNode;
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

  if (!loading && beers.length === 0) {
    return (
      <ThemedView style={styles.emptyContainer}>
        <ThemedText style={styles.emptyText}>{emptyMessage}</ThemedText>
      </ThemedView>
    );
  }

  return (
    <FlatList
      data={beers}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <BeerItem
          beer={item}
          isExpanded={expandedId === item.id}
          onToggle={onToggleExpand}
          dateLabel={dateLabel}
          renderActions={renderItemActions ? () => renderItemActions(item) : undefined}
        />
      )}
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
