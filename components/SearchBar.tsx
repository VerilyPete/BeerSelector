import React from 'react';
import { StyleSheet, TextInput, View, TouchableOpacity } from 'react-native';
import { useThemeColor } from '@/hooks/useThemeColor';
import { IconSymbol } from './ui/IconSymbol';

interface SearchBarProps {
  searchText: string;
  onSearchChange: (text: string) => void;
  onClear: () => void;
  placeholder?: string;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  searchText,
  onSearchChange,
  onClear,
  placeholder = 'Search beers...'
}) => {
  const backgroundColor = useThemeColor({ light: '#f5f5f5', dark: '#2c2c2c' }, 'background');
  const textColor = useThemeColor({}, 'text');
  const iconColor = useThemeColor({ light: '#777', dark: '#999' }, 'text');
  const borderColor = useThemeColor({ light: '#ddd', dark: '#444' }, 'text');

  return (
    <View style={[styles.container, { backgroundColor, borderColor }]}>
      <IconSymbol name="magnifyingglass" size={18} color={iconColor} style={styles.searchIcon} />
      <TextInput
        style={[styles.input, { color: textColor }]}
        value={searchText}
        onChangeText={onSearchChange}
        placeholder={placeholder}
        placeholderTextColor={iconColor}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="never"
      />
      {searchText.length > 0 && (
        <TouchableOpacity onPress={onClear} style={styles.clearButton} testID="clear-button">
          <IconSymbol name="xmark.circle.fill" size={20} color={iconColor} />
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 12,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 16,
    height: '100%',
    padding: 0,
  },
  clearButton: {
    padding: 4,
  },
});