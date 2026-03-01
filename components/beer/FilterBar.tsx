import React, { useCallback } from 'react';
import { StyleSheet, View, TouchableOpacity, Text } from 'react-native';
import * as Haptics from 'expo-haptics';
import { IconSymbol, IconSymbolName } from '../ui/IconSymbol';
import BeerIcon from '../icons/BeerIcon';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { ContainerFilter, SortOption, SortDirection } from '@/hooks/useBeerFilters';

type FilterBarProps = {
  containerFilter: ContainerFilter;
  sortBy: SortOption;
  sortDirection: SortDirection;
  onCycleContainerFilter: () => void;
  onCycleSort: () => void;
  onToggleSortDirection: () => void;
};

const CONTAINER_LABELS: Record<ContainerFilter, string> = {
  all: 'ALL',
  draft: 'DRAFT',
  cans: 'CANS',
};

const SORT_LABELS: Record<SortOption, string> = {
  date: 'DATE',
  name: 'NAME',
  abv: 'ABV',
};

const SORT_ICONS: Record<SortOption, IconSymbolName> = {
  date: 'calendar',
  name: 'textformat',
  abv: 'percent',
};

const DIRECTION_LABELS: Record<SortOption, Record<SortDirection, string>> = {
  date: { asc: 'OLD ↓', desc: 'NEW ↓' },
  name: { asc: 'A-Z ↓', desc: 'Z-A ↓' },
  abv: { asc: 'LOW ↓', desc: 'HIGH ↓' },
};

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
  const colorScheme = useColorScheme() ?? 'dark';
  const colors = Colors[colorScheme];
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
      <View style={styles.chipRow}>
        {/* Container filter chip */}
        <TouchableOpacity
          style={[
            styles.chip,
            isContainerActive
              ? { backgroundColor: colors.tint }
              : { borderWidth: 1, borderColor: colors.border },
          ]}
          onPress={handleContainerPress}
          activeOpacity={0.7}
          testID="filter-container-button"
          accessibilityRole="button"
          accessibilityState={{ selected: isContainerActive }}
          accessibilityLabel={`Container filter: ${CONTAINER_LABELS[containerFilter]}. Double tap to show ${NEXT_CONTAINER[containerFilter]}.`}
        >
          <Text
            style={[
              styles.chipText,
              { color: isContainerActive ? colors.textOnPrimary : colors.textSecondary },
            ]}
          >
            {CONTAINER_LABELS[containerFilter]}
          </Text>
        </TouchableOpacity>

        {/* Sort chip */}
        <TouchableOpacity
          style={[styles.chip, { borderWidth: 1, borderColor: colors.border, flexDirection: 'row', gap: 6 }]}
          onPress={handleSortPress}
          activeOpacity={0.7}
          testID="sort-toggle-button"
          accessibilityRole="button"
          accessibilityLabel={`Sort by ${SORT_LABELS[sortBy]}. Double tap to sort by ${NEXT_SORT[sortBy]}.`}
        >
          {sortBy === 'abv' ? (
            <BeerIcon name="bottle" size={14} color={colors.textSecondary} />
          ) : (
            <IconSymbol name={SORT_ICONS[sortBy]} size={14} color={colors.textSecondary} />
          )}
          <Text style={[styles.chipText, { color: colors.textSecondary }]} testID="sort-button-text">
            {SORT_LABELS[sortBy]}
          </Text>
        </TouchableOpacity>

        {/* Sort direction chip */}
        <TouchableOpacity
          style={[styles.chip, { borderWidth: 1, borderColor: colors.border }]}
          onPress={handleDirectionPress}
          activeOpacity={0.7}
          testID="sort-direction-button"
          accessibilityRole="button"
          accessibilityLabel={`Sort: ${DIRECTION_LABELS[sortBy][sortDirection].replace(' ↓', '')}. Double tap for ${DIRECTION_LABELS[sortBy][sortDirection === 'asc' ? 'desc' : 'asc'].replace(' ↓', '')}.`}
        >
          <Text style={[styles.chipText, { color: colors.textSecondary }]}>
            {DIRECTION_LABELS[sortBy][sortDirection]}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 8,
    paddingHorizontal: 0,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  chipText: {
    fontFamily: 'SpaceMono',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 2,
  },
});

export const FilterBar = React.memo(FilterBarComponent);
