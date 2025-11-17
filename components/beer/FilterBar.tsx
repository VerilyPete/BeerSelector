import React from 'react';
import { StyleSheet, View, TouchableOpacity } from 'react-native';
import { ThemedText } from '../ThemedText';
import { IconSymbol } from '../ui/IconSymbol';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useColorScheme } from '@/hooks/useColorScheme';

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

const FilterBarComponent: React.FC<FilterBarProps> = ({
  filters,
  sortBy,
  onToggleFilter,
  onToggleSort,
  showHeaviesAndIpa = true,
}) => {
  const colorScheme = useColorScheme();
  const activeButtonColor = useThemeColor({}, 'tint');
  const inactiveButtonColor = useThemeColor({ light: '#E5E5E5', dark: '#2C2C2E' }, 'background');
  const inactiveButtonTextColor = useThemeColor({ light: '#333333', dark: '#EFEFEF' }, 'text');
  const textColor = useThemeColor({}, 'text');

  // Dark mode active colors
  const isAnyFilterActive = filters.isDraft || filters.isHeavies || filters.isIpa || sortBy === 'name';
  const buttonTextColor = colorScheme === 'dark' && isAnyFilterActive ? '#000000' : 'white';
  const activeBgColor = colorScheme === 'dark' && isAnyFilterActive ? '#FFC107' : activeButtonColor;

  return (
    <View style={styles.filterContainer} testID="filter-bar">
      <TouchableOpacity
        style={[
          styles.filterButton,
          {
            backgroundColor: filters.isDraft ? activeBgColor : inactiveButtonColor,
          },
        ]}
        onPress={() => onToggleFilter('isDraft')}
        activeOpacity={0.7}
        testID="filter-draft-button"
      >
        <ThemedText
          style={[
            styles.filterButtonText,
            {
              color: filters.isDraft ? buttonTextColor : inactiveButtonTextColor,
            },
          ]}
        >
          Draft
        </ThemedText>
      </TouchableOpacity>

      {showHeaviesAndIpa && (
        <>
          <TouchableOpacity
            style={[
              styles.filterButton,
              {
                backgroundColor: filters.isHeavies ? activeBgColor : inactiveButtonColor,
              },
            ]}
            onPress={() => onToggleFilter('isHeavies')}
            activeOpacity={0.7}
            testID="filter-heavies-button"
          >
            <ThemedText
              style={[
                styles.filterButtonText,
                {
                  color: filters.isHeavies ? buttonTextColor : inactiveButtonTextColor,
                },
              ]}
            >
              Heavies
            </ThemedText>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterButton,
              {
                backgroundColor: filters.isIpa ? activeBgColor : inactiveButtonColor,
              },
            ]}
            onPress={() => onToggleFilter('isIpa')}
            activeOpacity={0.7}
            testID="filter-ipa-button"
          >
            <ThemedText
              style={[
                styles.filterButtonText,
                {
                  color: filters.isIpa ? buttonTextColor : inactiveButtonTextColor,
                },
              ]}
            >
              IPA
            </ThemedText>
          </TouchableOpacity>
        </>
      )}

      <TouchableOpacity
        style={styles.sortButton}
        onPress={onToggleSort}
        activeOpacity={0.7}
        testID="sort-toggle-button"
      >
        <ThemedText style={styles.sortButtonText} testID="sort-button-text">
          Sort by: {sortBy === 'date' ? 'Name' : 'Date'}
        </ThemedText>
        <IconSymbol
          name={sortBy === 'date' ? 'textformat' : 'calendar'}
          size={16}
          color={textColor}
          style={styles.sortIcon}
        />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  filterContainer: {
    flexDirection: 'row',
    marginBottom: 8,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  filterButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    marginRight: 6,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  filterButtonText: {
    fontWeight: '600',
    fontSize: 14,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(150, 150, 150, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    flexShrink: 1,
  },
  sortButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  sortIcon: {
    marginLeft: 4,
  },
});

// Export memoized component to prevent unnecessary re-renders
// Default shallow comparison is sufficient for this component's props
export const FilterBar = React.memo(FilterBarComponent);
