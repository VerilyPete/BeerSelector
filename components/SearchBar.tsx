import React, { useState, useCallback } from 'react';
import { StyleSheet, TextInput, View, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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

  const chromeGradient = isFocused
    ? [colors.tint, colors.tint, colors.tint] as const
    : ['#8A919A', '#B8BFC7', '#8A919A'] as const;

  return (
    <View style={styles.chromeShell} testID="search-bar">
      <LinearGradient
        colors={[...chromeGradient]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          styles.container,
          { backgroundColor: colors.backgroundSecondary },
        ]}
      >
        <IconSymbol
          name="magnifyingglass"
          size={16}
          color={colors.textMuted}
          style={styles.icon}
        />
        <TextInput
          testID="search-input"
          style={[styles.input, { color: colors.text }]}
          value={searchText}
          onChangeText={onSearchChange}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
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
            <IconSymbol name="xmark.circle.fill" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

export const SearchBar = React.memo(SearchBarComponent);

const styles = StyleSheet.create({
  chromeShell: {
    borderRadius: 14,
    overflow: 'hidden',
    padding: 3,
    marginBottom: 8,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 11,
  },
  icon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontFamily: 'SpaceMono',
    fontSize: 11,
    height: '100%',
    padding: 0,
  },
  clearButton: {
    padding: 4,
    marginLeft: 8,
  },
});
