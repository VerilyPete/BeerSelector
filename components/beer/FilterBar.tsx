import React, { useCallback } from 'react';
import { StyleSheet, View, TouchableOpacity, ScrollView } from 'react-native';
import * as Haptics from 'expo-haptics';
import { ThemedText } from '../ThemedText';
import { IconSymbol } from '../ui/IconSymbol';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/Colors';
import { spacing } from '@/constants/spacing';

/** Minimum touch target size per Apple HIG */
const CHIP_MIN_HEIGHT = 44;

type SortOption = 'date' | 'name';

type FilterState = {
  isDraft: boolean;
  isHeavies: boolean;
  isIpa: boolean;
};

type FilterBarProps = {
  filters: FilterState;
  sortBy: SortOption;
  onToggleFilter: (filterName: keyof FilterState) => void;
  onToggleSort: () => void;
  showHeaviesAndIpa?: boolean; // TastedBrewList doesn't have these filters
};

type FilterChipProps = {
  label: string;
  isActive: boolean;
  onPress: () => void;
  testID: string;
  themeColors: (typeof Colors)['light'];
  isDarkMode: boolean;
};

/**
 * Individual filter chip with pill-shaped design
 * Supports active/inactive states with smooth visual transitions
 */
const FilterChip: React.FC<FilterChipProps> = ({
  label,
  isActive,
  onPress,
  testID,
  themeColors,
  isDarkMode,
}) => {
  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  }, [onPress]);

  // Active state uses tint color, inactive uses secondary background with subtle border
  const backgroundColor = isActive ? themeColors.tint : themeColors.backgroundSecondary;
  const textColor = isActive ? themeColors.textOnPrimary : themeColors.text;
  const borderColor = isActive ? 'transparent' : themeColors.border;

  return (
    <TouchableOpacity
      style={[
        styles.filterChip,
        {
          backgroundColor,
          borderColor,
          // Subtle shadow for active chips
          ...(isActive && {
            shadowColor: isDarkMode ? themeColors.tint : '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: isDarkMode ? 0.4 : 0.15,
            shadowRadius: 4,
            elevation: 3,
          }),
        },
      ]}
      onPress={handlePress}
      activeOpacity={0.7}
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
      accessibilityLabel={`${label} filter${isActive ? ', active' : ''}`}
    >
      <ThemedText style={[styles.filterChipText, { color: textColor }]}>{label}</ThemedText>
    </TouchableOpacity>
  );
};

const FilterBarComponent: React.FC<FilterBarProps> = ({
  filters,
  sortBy,
  onToggleFilter,
  onToggleSort,
  showHeaviesAndIpa = true,
}) => {
  const colorScheme = useColorScheme();
  const isDarkMode = colorScheme === 'dark';
  const theme = colorScheme ?? 'light';
  const themeColors = Colors[theme];

  const handleSortPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onToggleSort();
  }, [onToggleSort]);

  return (
    <View style={styles.container} testID="filter-bar">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        bounces={false}
      >
        {/* Filter chips */}
        <FilterChip
          label="Draft"
          isActive={filters.isDraft}
          onPress={() => onToggleFilter('isDraft')}
          testID="filter-draft-button"
          themeColors={themeColors}
          isDarkMode={isDarkMode}
        />

        {showHeaviesAndIpa && (
          <>
            <FilterChip
              label="Heavies"
              isActive={filters.isHeavies}
              onPress={() => onToggleFilter('isHeavies')}
              testID="filter-heavies-button"
              themeColors={themeColors}
              isDarkMode={isDarkMode}
            />
            <FilterChip
              label="IPA"
              isActive={filters.isIpa}
              onPress={() => onToggleFilter('isIpa')}
              testID="filter-ipa-button"
              themeColors={themeColors}
              isDarkMode={isDarkMode}
            />
          </>
        )}

        {/* Sort button with secondary visual treatment */}
        <TouchableOpacity
          style={[
            styles.sortButton,
            {
              backgroundColor: themeColors.backgroundElevated,
              borderColor: themeColors.border,
            },
          ]}
          onPress={handleSortPress}
          activeOpacity={0.7}
          testID="sort-toggle-button"
          accessibilityRole="button"
          accessibilityLabel={`Sort by ${sortBy === 'date' ? 'name' : 'date'}`}
        >
          <IconSymbol
            name={sortBy === 'date' ? 'textformat' : 'calendar'}
            size={16}
            color={themeColors.textSecondary}
            style={styles.sortIcon}
          />
          <ThemedText
            style={[styles.sortButtonText, { color: themeColors.textSecondary }]}
            testID="sort-button-text"
          >
            {sortBy === 'date' ? 'Name' : 'Date'}
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
  filterChip: {
    minHeight: CHIP_MIN_HEIGHT,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.m,
    borderRadius: CHIP_MIN_HEIGHT / 2, // Perfect pill shape
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: CHIP_MIN_HEIGHT,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.m,
    borderRadius: CHIP_MIN_HEIGHT / 2,
    borderWidth: 1,
    marginLeft: spacing.xs, // Extra separation from filter chips
  },
  sortButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  sortIcon: {
    marginRight: spacing.xs,
  },
});

// Export memoized component to prevent unnecessary re-renders
// Default shallow comparison is sufficient for this component's props
export const FilterBar = React.memo(FilterBarComponent);
