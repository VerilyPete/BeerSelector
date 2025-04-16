import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { TouchableOpacity, View } from 'react-native';
import BeerItem from '../BeerItem';

// Mock the ThemedText component
jest.mock('../ThemedText', () => ({
  ThemedText: ({ children, style, type }) => {
    return { type: 'ThemedText', children, style, textType: type, testID: 'themed-text' };
  },
}));

// Mock the useThemeColor hook
jest.mock('@/hooks/useThemeColor', () => ({
  useThemeColor: jest.fn().mockImplementation((props, colorName) => {
    if (colorName === 'background') return '#ffffff';
    if (colorName === 'text') return '#000000';
    return '#000000';
  }),
}));

// Mock the useColorScheme hook
jest.mock('@/hooks/useColorScheme', () => ({
  useColorScheme: jest.fn().mockReturnValue('light'),
}));

// Mock the navigation prop
const mockNavigation = {
  navigate: jest.fn(),
};

describe('BeerItem', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly with minimal props', () => {
    const beer = {
      id: 'beer-123',
      brew_name: 'Test Beer',
    };

    const { UNSAFE_getAllByType } = render(
      <BeerItem beer={beer} navigation={mockNavigation as any} />
    );

    // Find all ThemedText components
    const themedTexts = UNSAFE_getAllByType('ThemedText');

    // Check that the beer name is displayed
    expect(themedTexts.some(text => text.children === 'Test Beer')).toBe(true);
  });

  it('renders correctly with full props', () => {
    const beer = {
      id: 'beer-123',
      brew_name: 'Test Beer',
      brewer: 'Test Brewery',
      brew_style: 'IPA',
      review_rating: '4.5',
      brew_container: 'Bottle',
      brewer_loc: 'Test Location',
      added_date: '2023-01-01',
    };

    const { UNSAFE_getAllByType } = render(
      <BeerItem beer={beer} navigation={mockNavigation as any} />
    );

    // Find all ThemedText components
    const themedTexts = UNSAFE_getAllByType('ThemedText');

    // Check that all the beer details are displayed
    expect(themedTexts.some(text => text.children === 'Test Beer')).toBe(true);
    expect(themedTexts.some(text => text.children === 'Test Brewery • Test Location')).toBe(true);
    expect(themedTexts.some(text => text.children === 'IPA • Bottle')).toBe(true);
  });

  it('navigates to beer details when pressed', () => {
    const beer = {
      id: 'beer-123',
      brew_name: 'Test Beer',
    };

    const { UNSAFE_getByType } = render(
      <BeerItem beer={beer} navigation={mockNavigation as any} />
    );

    // Find the TouchableOpacity component
    const touchable = UNSAFE_getByType(TouchableOpacity);

    // Simulate a press
    fireEvent.press(touchable);

    // Check that navigation.navigate was called with the correct parameters
    expect(mockNavigation.navigate).toHaveBeenCalledWith('BeerDetail', { beer });
  });

  it('applies correct styles to the beer item', () => {
    const beer = {
      id: 'beer-123',
      brew_name: 'Test Beer',
    };

    const { UNSAFE_getByType } = render(
      <BeerItem beer={beer} navigation={mockNavigation as any} />
    );

    // Find the View component
    const view = UNSAFE_getByType(View);

    // Check that the styles are applied correctly
    expect(view.props.style).toEqual(
      expect.objectContaining({
        backgroundColor: '#ffffff',
        borderRadius: expect.any(Number),
        padding: expect.any(Number),
        marginBottom: expect.any(Number),
      })
    );
  });

  it('handles missing optional props gracefully', () => {
    const beer = {
      id: 'beer-123',
      brew_name: 'Test Beer',
      brewer: 'Test Brewery',
      // Missing brew_style, brew_container, etc.
    };

    const { UNSAFE_getAllByType } = render(
      <BeerItem beer={beer} navigation={mockNavigation as any} />
    );

    // Find all ThemedText components
    const themedTexts = UNSAFE_getAllByType('ThemedText');

    // Check that the beer details are displayed without the missing props
    expect(themedTexts.some(text => text.children === 'Test Beer')).toBe(true);
    expect(themedTexts.some(text => text.children === 'Test Brewery')).toBe(true);

    // Check that no undefined values are displayed
    expect(themedTexts.every(text => !String(text.children).includes('undefined'))).toBe(true);
  });
});
