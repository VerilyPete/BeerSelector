import React, { useCallback, useMemo, useEffect } from 'react';
import { StyleSheet, FlatList, RefreshControl, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedView } from '../ThemedView';
import { ThemedText } from '../ThemedText';
import { BeerItem } from './BeerItem';
import { AnimatedRefreshHeader } from '../ui/AnimatedRefreshHeader';
import { usePullToRefresh } from '@/animations/usePullToRefresh';
import { useThemeColor } from '@/hooks/useThemeColor';
import { BeerWithContainerType, BeerfinderWithContainerType } from '@/src/types/beer';

// Union type to accept both BeerWithContainerType and BeerfinderWithContainerType
// These types have the container_type property (which can be null)
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
  /** Number of columns for grid layout (1 for phone, 2 for tablet portrait, 3 for tablet landscape) */
  numColumns?: number;
  /** Whether to show the animated refresh header (default: true) */
  showAnimatedRefresh?: boolean;
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

/**
 * Height of the animated refresh header
 */
const REFRESH_HEADER_HEIGHT = 80;

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
  showAnimatedRefresh = true,
}) => {
  const insets = useSafeAreaInsets();
  const tintColor = useThemeColor({}, 'tint');

  // Pull-to-refresh animation hook
  const { pullProgress, isRefreshing, rotation, handleScroll, startRefresh, endRefresh } =
    usePullToRefresh({
      refreshThreshold: 60,
      maxPullDistance: 100,
      enableHaptics: true, // Haptic feedback triggered at threshold
    });

  // Sync refreshing state with animation
  useEffect(() => {
    if (refreshing) {
      startRefresh();
    } else {
      endRefresh();
    }
  }, [refreshing, startRefresh, endRefresh]);

  // Calculate column wrapper style for multi-column layouts
  const columnWrapperStyle = useMemo<ViewStyle | undefined>(() => {
    if (numColumns <= 1) return undefined;
    return {
      justifyContent: 'flex-start',
      gap: 8,
    };
  }, [numColumns]);

  // Memoize item wrapper style for multi-column layouts to avoid creating new objects per render
  const itemWrapperStyle = useMemo<ViewStyle | null>(() => {
    if (numColumns <= 1) return null;
    return {
      flex: 1,
      maxWidth: `${100 / numColumns}%`,
    };
  }, [numColumns]);

  // Memoize renderItem to prevent unnecessary re-renders of FlatList items
  // For multi-column layouts, wrap in a View with flex basis for equal width columns
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

      // For multi-column layouts, wrap in a View with proper flex sizing
      if (numColumns > 1 && itemWrapperStyle) {
        return <View style={itemWrapperStyle}>{content}</View>;
      }

      return content;
    },
    [expandedId, onToggleExpand, dateLabel, renderItemActions, numColumns, itemWrapperStyle]
  );

  // Render the animated refresh header as list header
  const ListHeaderComponent = useMemo(() => {
    if (!showAnimatedRefresh) return null;

    return (
      <AnimatedRefreshHeader
        pullProgress={pullProgress}
        isRefreshing={isRefreshing}
        rotation={rotation}
        height={REFRESH_HEADER_HEIGHT}
        accessibilityLabel="Pull down to refresh the beer list"
      />
    );
  }, [showAnimatedRefresh, pullProgress, isRefreshing, rotation]);

  if (!loading && beers.length === 0) {
    return (
      <ThemedView style={styles.emptyContainer} testID="beer-list-empty">
        <ThemedText style={styles.emptyText} testID="beer-list-empty-message">
          {emptyMessage}
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <FlatList
      testID="beer-list"
      data={beers}
      keyExtractor={item => item.id}
      renderItem={renderItem}
      // Key prop forces re-render when numColumns changes (required by FlatList)
      key={`beer-list-${numColumns}`}
      numColumns={numColumns}
      // columnWrapperStyle is only applied when numColumns > 1
      columnWrapperStyle={columnWrapperStyle}
      contentContainerStyle={[
        styles.listContent,
        { paddingBottom: TAB_BAR_HEIGHT + insets.bottom + 16 },
      ]}
      // Animated refresh header (positioned above list content)
      ListHeaderComponent={ListHeaderComponent}
      ListHeaderComponentStyle={showAnimatedRefresh ? styles.headerContainer : undefined}
      // Native RefreshControl for actual refresh functionality
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={showAnimatedRefresh ? 'transparent' : tintColor}
          colors={showAnimatedRefresh ? ['transparent'] : [tintColor]}
          // Hide the native spinner when using animated header
          style={showAnimatedRefresh ? styles.hiddenRefreshControl : undefined}
        />
      }
      // Handle scroll events for pull-to-refresh animation
      onScroll={showAnimatedRefresh ? handleScroll : undefined}
      scrollEventThrottle={showAnimatedRefresh ? 16 : undefined}
      // Performance optimization: Reduce initial render and batch sizes for 60+ FPS
      initialNumToRender={10}
      maxToRenderPerBatch={10}
      // MP-3 Final: windowSize=7 (3.5 above + 3.5 below viewport) for optimal scroll FPS
      // This is a 67% reduction from React Native default (21) - safer than windowSize=5
      // Fallback if blank areas appear: increase to 9 (57% reduction) or 11 (48% reduction)
      windowSize={7}
      removeClippedSubviews={true}
      updateCellsBatchingPeriod={50}
      // Note: getItemLayout is disabled for multi-column layouts as row heights vary
      // This is a minor performance tradeoff for correct layout calculation
      {...(numColumns === 1 && {
        getItemLayout: (_data: ArrayLike<DisplayableBeer> | null | undefined, index: number) => ({
          length: EXPECTED_ITEM_HEIGHT,
          offset: EXPECTED_ITEM_HEIGHT * index + (showAnimatedRefresh ? REFRESH_HEADER_HEIGHT : 0),
          index,
        }),
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
  headerContainer: {
    overflow: 'visible',
    zIndex: 1,
  },
  hiddenRefreshControl: {
    opacity: 0,
    height: 0,
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
