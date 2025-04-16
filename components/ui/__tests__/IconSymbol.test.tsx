import React from 'react';
import { render } from '@testing-library/react-native';
import { IconSymbol } from '../IconSymbol';

// Mock MaterialIcons
jest.mock('@expo/vector-icons/MaterialIcons', () => {
  return {
    __esModule: true,
    default: ({ name, size, color, style }) => {
      return { name, size, color, style, testID: `material-icon-${name}` };
    },
  };
});

describe('IconSymbol', () => {
  it('renders correctly with required props', () => {
    const { getByTestId } = render(
      <IconSymbol name="chevron.right" size={24} color="#000000" />
    );
    
    // The IconSymbol should map to the correct MaterialIcon
    expect(getByTestId('material-icon-chevron-right')).toBeTruthy();
  });

  it('applies custom size', () => {
    const { getByTestId } = render(
      <IconSymbol name="chevron.right" size={32} color="#000000" />
    );
    
    const icon = getByTestId('material-icon-chevron-right');
    expect(icon.size).toBe(32);
  });

  it('applies custom color', () => {
    const { getByTestId } = render(
      <IconSymbol name="chevron.right" size={24} color="#FF0000" />
    );
    
    const icon = getByTestId('material-icon-chevron-right');
    expect(icon.color).toBe('#FF0000');
  });

  it('applies custom style', () => {
    const customStyle = { marginRight: 10 };
    const { getByTestId } = render(
      <IconSymbol name="chevron.right" size={24} color="#000000" style={customStyle} />
    );
    
    const icon = getByTestId('material-icon-chevron-right');
    expect(icon.style).toEqual(customStyle);
  });

  it('maps SF Symbol names to Material Icons correctly', () => {
    const { getByTestId } = render(
      <IconSymbol name="house.fill" size={24} color="#000000" />
    );
    
    // The IconSymbol should map to the correct MaterialIcon
    expect(getByTestId('material-icon-home')).toBeTruthy();
  });
});
