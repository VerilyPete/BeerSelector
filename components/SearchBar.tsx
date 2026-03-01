import React, { useState, useCallback } from 'react';
import { StyleSheet, TextInput, View, TouchableOpacity } from 'react-native';
import { IconSymbol } from './ui/IconSymbol';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import * as Haptics from 'expo-haptics';

type SearchBarProps = {
  searchText: string;
  onSearchChange: (text: string) => void;
  onClear: () => void;
  placeholder?: string;
};

const SearchBarComponent: React.FC<SearchBarProps> = ({
  searchText,
  onSearchChange,
  onClear,
  placeholder = 'Search beers, breweries, styles...',
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const colorScheme = useColorScheme() ?? 'dark';
  const colors = Colors[colorScheme];

  const handleFocus = useCallback(() => setIsFocused(true), []);
  const handleBlur = useCallback(() => setIsFocused(false), []);

  const handleClear = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClear();
  }, [onClear]);

  return (
    <View
      style={[
        styles.container,
        {
          borderColor: isFocused ? colors.tint : colors.border,
          borderWidth: isFocused ? 1.5 : 1,
        },
      ]}
      testID="search-bar"
    >
      <IconSymbol
        name="magnifyingglass"
        size={18}
        color={colors.textSecondary}
        style={styles.icon}
      />
      <TextInput
        testID="search-input"
        style={[styles.input, { color: colors.text }]}
        value={searchText}
        onChangeText={onSearchChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="never"
        onFocus={handleFocus}
        onBlur={handleBlur}
        selectionColor={colors.tint}
      />
      {searchText.length > 0 && (
        <TouchableOpacity
          onPress={handleClear}
          style={styles.clearButton}
          testID="clear-search-button"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel="Clear search"
          accessibilityRole="button"
        >
          <IconSymbol name="xmark.circle.fill" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      )}
    </View>
  );
};

export const SearchBar = React.memo(SearchBarComponent);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    paddingHorizontal: 16,
    marginHorizontal: 24,
    marginBottom: 8,
  },
  icon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontFamily: 'Inter',
    fontSize: 13,
    height: '100%',
    padding: 0,
  },
  clearButton: {
    padding: 4,
    marginLeft: 8,
  },
});
