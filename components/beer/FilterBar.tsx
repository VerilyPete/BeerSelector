import React, { useCallback } from 'react';
import { StyleSheet, View, TouchableOpacity, ScrollView } from 'react-native';
import * as Haptics from 'expo-haptics';
import { ThemedText } from '../ThemedText';
import { IconSymbol, IconSymbolName } from '../ui/IconSymbol';
import BeerIcon from '../icons/BeerIcon';
import { useThemeColor } from '@/hooks/useThemeColor';
import { spacing } from '@/constants/spacing';
import { ContainerFilter, SortOption, SortDirection } from '@/hooks/useBeerFilters';

/** Minimum touch target size per Apple HIG */
const CHIP_MIN_HEIGHT = 44;

type FilterBarProps = {
  containerFilter: ContainerFilter;
  sortBy: SortOption;
  sortDirection: SortDirection;
  onCycleContainerFilter: () => void;
  onCycleSort: () => void;
  onToggleSortDirection: () => void;
};

const CONTAINER_LABELS: Record<ContainerFilter, string> = {
  all: 'All',
  draft: 'Draft',
  cans: 'Cans',
};

const SORT_LABELS: Record<SortOption, string> = {
  date: 'Date',
  name: 'Name',
  abv: 'ABV',
};

const SORT_ICONS: Record<SortOption, IconSymbolName> = {
  date: 'calendar',
  name: 'textformat',
  abv: 'percent',
};

const DIRECTION_LABELS: Record<SortOption, Record<SortDirection, string>> = {
  date: { asc: 'Oldest', desc: 'Newest' },
  name: { asc: 'A–Z', desc: 'Z–A' },
  abv: { asc: 'Low', desc: 'High' },
};

// These maps duplicate the cycling logic from nextContainerFilter/nextSortOption
// in useBeerFilters.ts. Keep them in sync when adding/removing filter or sort options.
const NEXT_CONTAINER: Record<ContainerFilter, string> = {
  all: 'Draft',
  draft: 'Cans',
  cans: 'All',
};
const NEXT_SORT: Record<SortOption, string> = { date: 'Name', name: 'ABV', abv: 'Date' };

const FilterBarComponent: React.FC<FilterBarProps> = ({
  containerFilter,
  sortBy,
  sortDirection,
  onCycleContainerFilter,
  onCycleSort,
  onToggleSortDirection,
}) => {
  const tint = useThemeColor({}, 'tint');
  const textOnPrimary = useThemeColor({}, 'textOnPrimary');
  const backgroundSecondary = useThemeColor({}, 'backgroundSecondary');
  const text = useThemeColor({}, 'text');
  const border = useThemeColor({}, 'border');
  const backgroundElevated = useThemeColor({}, 'backgroundElevated');

  const isContainerActive = containerFilter !== 'all';

  const handleContainerPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onCycleContainerFilter();
  }, [onCycleContainerFilter]);

  const handleSortPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onCycleSort();
  }, [onCycleSort]);

  const handleDirectionPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onToggleSortDirection();
  }, [onToggleSortDirection]);

  return (
    <View style={styles.container} testID="filter-bar">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        bounces={false}
      >
        {/* Container filter button */}
        <TouchableOpacity
          style={{
            minHeight: CHIP_MIN_HEIGHT,
            paddingVertical: spacing.sm,
            paddingHorizontal: spacing.m,
            borderRadius: CHIP_MIN_HEIGHT / 2,
            borderWidth: 1,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: isContainerActive ? tint : backgroundSecondary,
            borderColor: isContainerActive ? 'transparent' : border,
          }}
          onPress={handleContainerPress}
          activeOpacity={0.7}
          testID="filter-container-button"
          accessibilityRole="button"
          accessibilityState={{ selected: isContainerActive }}
          accessibilityLabel={`Container filter: ${CONTAINER_LABELS[containerFilter]}. Double tap to show ${NEXT_CONTAINER[containerFilter]}.`}
        >
          <ThemedText
            style={[styles.chipText, { color: isContainerActive ? textOnPrimary : text }]}
          >
            {CONTAINER_LABELS[containerFilter]}
          </ThemedText>
        </TouchableOpacity>

        {/* Sort button */}
        <TouchableOpacity
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            minHeight: CHIP_MIN_HEIGHT,
            paddingVertical: spacing.sm,
            paddingHorizontal: spacing.m,
            borderRadius: CHIP_MIN_HEIGHT / 2,
            borderWidth: 1,
            backgroundColor: backgroundElevated,
            borderColor: border,
          }}
          onPress={handleSortPress}
          activeOpacity={0.7}
          testID="sort-toggle-button"
          accessibilityRole="button"
          accessibilityLabel={`Sort by ${SORT_LABELS[sortBy]}. Double tap to sort by ${NEXT_SORT[sortBy]}.`}
        >
          {sortBy === 'abv' ? (
            <BeerIcon name="bottle" size={16} color={text} style={styles.sortIcon} />
          ) : (
            <IconSymbol name={SORT_ICONS[sortBy]} size={16} color={text} style={styles.sortIcon} />
          )}
          <ThemedText style={[styles.sortButtonText, { color: text }]} testID="sort-button-text">
            {SORT_LABELS[sortBy]}
          </ThemedText>
        </TouchableOpacity>

        {/* Sort direction button */}
        <TouchableOpacity
          style={{
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: CHIP_MIN_HEIGHT,
            minWidth: 62,
            paddingVertical: spacing.sm,
            paddingHorizontal: spacing.m,
            borderRadius: CHIP_MIN_HEIGHT / 2,
            borderWidth: 1,
            backgroundColor: backgroundElevated,
            borderColor: border,
          }}
          onPress={handleDirectionPress}
          activeOpacity={0.7}
          testID="sort-direction-button"
          accessibilityRole="button"
          accessibilityLabel={`Sort: ${DIRECTION_LABELS[sortBy][sortDirection]}. Double tap for ${DIRECTION_LABELS[sortBy][sortDirection === 'asc' ? 'desc' : 'asc']}.`}
        >
          <ThemedText style={[styles.chipText, { color: text }]}>
            {DIRECTION_LABELS[sortBy][sortDirection]}
          </ThemedText>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.s,
  },
  scrollContent: {
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.xs,
    alignItems: 'center',
    gap: spacing.s,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  sortButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  sortIcon: {
    marginRight: spacing.xs,
  },
});

export const FilterBar = React.memo(FilterBarComponent);
