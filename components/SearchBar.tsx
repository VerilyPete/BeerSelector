import React, { useState, useCallback } from 'react';
import { StyleSheet, TextInput, View, TouchableOpacity, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from './ui/IconSymbol';
import { spacing, borderRadii } from '@/constants/spacing';
import * as Haptics from 'expo-haptics';

interface SearchBarProps {
  searchText: string;
  onSearchChange: (text: string) => void;
  onClear: () => void;
  placeholder?: string;
}

const SearchBarComponent: React.FC<SearchBarProps> = ({
  searchText,
  onSearchChange,
  onClear,
  placeholder = 'Search beers...',
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const colorScheme = useColorScheme();

  // Use theme color tokens
  const textColor = useThemeColor({}, 'text');
  const textMutedColor = useThemeColor({}, 'textMuted');
  const borderColor = useThemeColor({}, 'border');
  const borderFocusedColor = useThemeColor({}, 'borderFocused');
  const glassTintColor = useThemeColor({}, 'glassTint');
  const tintColor = useThemeColor({}, 'tint');

  const handleFocus = useCallback(() => {
    setIsFocused(true);
  }, []);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
  }, []);

  const handleClear = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClear();
  }, [onClear]);

  const currentBorderColor = isFocused ? borderFocusedColor : borderColor;
  const blurTint = colorScheme === 'dark' ? 'dark' : 'light';

  return (
    <View style={styles.wrapper} testID="search-bar">
      {/* Glassmorphism background with blur */}
      <BlurView
        intensity={Platform.OS === 'ios' ? 60 : 100}
        tint={blurTint}
        style={[
          styles.blurContainer,
          {
            borderColor: currentBorderColor,
            borderWidth: isFocused ? 1.5 : 1,
          },
        ]}
      >
        {/* Semi-transparent overlay for glass effect */}
        <View style={[styles.glassOverlay, { backgroundColor: glassTintColor }]} />

        {/* Content container */}
        <View style={styles.contentContainer}>
          {/* Search icon */}
          <IconSymbol
            name="magnifyingglass"
            size={18}
            color={isFocused ? tintColor : textMutedColor}
            style={styles.searchIcon}
          />

          {/* Text input */}
          <TextInput
            testID="search-input"
            style={[styles.input, { color: textColor }]}
            value={searchText}
            onChangeText={onSearchChange}
            placeholder={placeholder}
            placeholderTextColor={textMutedColor}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="never"
            onFocus={handleFocus}
            onBlur={handleBlur}
            selectionColor={tintColor}
          />

          {/* Clear button - only visible when text is entered */}
          {searchText.length > 0 && (
            <TouchableOpacity
              onPress={handleClear}
              style={styles.clearButton}
              testID="clear-search-button"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel="Clear search"
              accessibilityRole="button"
            >
              <IconSymbol
                name="xmark.circle.fill"
                size={20}
                color={isFocused ? tintColor : textMutedColor}
              />
            </TouchableOpacity>
          )}
        </View>
      </BlurView>
    </View>
  );
};

// Export memoized component to prevent unnecessary re-renders
export const SearchBar = React.memo(SearchBarComponent);

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: spacing.m,
    marginBottom: spacing.sm,
  },
  blurContainer: {
    borderRadius: borderRadii.xl,
    overflow: 'hidden',
  },
  glassOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  contentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48, // Slightly taller for better touch targets
    paddingHorizontal: spacing.m,
  },
  searchIcon: {
    marginRight: spacing.s,
  },
  input: {
    flex: 1,
    fontSize: 16,
    height: '100%',
    padding: 0,
  },
  clearButton: {
    padding: spacing.xs,
    marginLeft: spacing.xs,
  },
});
