import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { SearchBar } from '../SearchBar';

// Mock the useThemeColor hook
jest.mock('@/hooks/useThemeColor', () => ({
  useThemeColor: jest.fn().mockImplementation((props, colorName) => {
    if (colorName === 'background') return '#f5f5f5';
    if (colorName === 'text') return '#000000';
    return '#000000';
  }),
}));

// Mock the IconSymbol component
jest.mock('../ui/IconSymbol', () => ({
  IconSymbol: ({ name, size, color, style }) => {
    return { name, size, color, style, testID: `icon-${name}` };
  },
}));

describe('SearchBar', () => {
  const mockOnSearchChange = jest.fn();
  const mockOnClear = jest.fn();
  
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly with default props', () => {
    const { getByPlaceholderText } = render(
      <SearchBar 
        searchText="" 
        onSearchChange={mockOnSearchChange} 
        onClear={mockOnClear} 
      />
    );
    
    // Check that the input is rendered with the default placeholder
    expect(getByPlaceholderText('Search beers...')).toBeTruthy();
  });

  it('renders correctly with custom placeholder', () => {
    const { getByPlaceholderText } = render(
      <SearchBar 
        searchText="" 
        onSearchChange={mockOnSearchChange} 
        onClear={mockOnClear} 
        placeholder="Custom placeholder"
      />
    );
    
    // Check that the input is rendered with the custom placeholder
    expect(getByPlaceholderText('Custom placeholder')).toBeTruthy();
  });

  it('calls onSearchChange when text is entered', () => {
    const { getByPlaceholderText } = render(
      <SearchBar 
        searchText="" 
        onSearchChange={mockOnSearchChange} 
        onClear={mockOnClear} 
      />
    );
    
    // Simulate typing in the search input
    const input = getByPlaceholderText('Search beers...');
    fireEvent.changeText(input, 'test search');
    
    // Check that onSearchChange was called with the correct text
    expect(mockOnSearchChange).toHaveBeenCalledWith('test search');
  });

  it('shows clear button when searchText is not empty', () => {
    const { getByTestId } = render(
      <SearchBar 
        searchText="test" 
        onSearchChange={mockOnSearchChange} 
        onClear={mockOnClear} 
      />
    );
    
    // The clear button should be visible
    expect(() => getByTestId('clear-button')).not.toThrow();
  });

  it('does not show clear button when searchText is empty', () => {
    const { queryByTestId } = render(
      <SearchBar 
        searchText="" 
        onSearchChange={mockOnSearchChange} 
        onClear={mockOnClear} 
      />
    );
    
    // The clear button should not be visible
    expect(queryByTestId('clear-button')).toBeNull();
  });

  it('calls onClear when clear button is pressed', () => {
    const { getByTestId } = render(
      <SearchBar 
        searchText="test" 
        onSearchChange={mockOnSearchChange} 
        onClear={mockOnClear} 
      />
    );
    
    // Press the clear button
    fireEvent.press(getByTestId('clear-button'));
    
    // Check that onClear was called
    expect(mockOnClear).toHaveBeenCalled();
  });
});
