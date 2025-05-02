import React from 'react';
import { render } from '@testing-library/react-native';
import { ThemedText } from '../../components/ThemedText';

// Mock the hooks
jest.mock('@/hooks/useThemeColor', () => ({
  useThemeColor: jest.fn().mockImplementation((props, colorName) => {
    if (colorName === 'background') return '#f5f5f5';
    if (colorName === 'text') return '#000000';
    if (colorName === 'tint') return '#2196F3';
    return '#000000';
  }),
}));

jest.mock('@/hooks/useColorScheme', () => ({
  __esModule: true,
  default: jest.fn().mockReturnValue('light'),
}));

describe('Simple Integration Test', () => {
  it('renders ThemedText correctly', () => {
    const { getByText } = render(<ThemedText>Hello World</ThemedText>);
    expect(getByText('Hello World')).toBeTruthy();
  });
});
