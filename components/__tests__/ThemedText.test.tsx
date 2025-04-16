import React from 'react';
import { render } from '@testing-library/react-native';
import { ThemedText } from '../ThemedText';

// Mock the useThemeColor hook
jest.mock('@/hooks/useThemeColor', () => ({
  useThemeColor: jest.fn().mockImplementation((props, colorName) => {
    if (props.light === 'red') return 'red';
    if (props.dark === 'blue') return 'blue';
    return '#000000';
  }),
}));

describe('ThemedText', () => {
  it('renders correctly with default props', () => {
    const { getByText } = render(<ThemedText>Test Text</ThemedText>);
    
    const textElement = getByText('Test Text');
    expect(textElement).toBeTruthy();
    
    // Check that the default style is applied
    expect(textElement.props.style).toEqual(
      expect.arrayContaining([
        { color: '#000000' },
        { fontSize: 16, lineHeight: 24 }
      ])
    );
  });

  it('renders correctly with title type', () => {
    const { getByText } = render(<ThemedText type="title">Title Text</ThemedText>);
    
    const textElement = getByText('Title Text');
    
    // Check that the title style is applied
    expect(textElement.props.style).toEqual(
      expect.arrayContaining([
        { color: '#000000' },
        undefined,
        { fontSize: 32, fontWeight: 'bold', lineHeight: 32 },
        undefined,
        undefined,
        undefined
      ])
    );
  });

  it('renders correctly with defaultSemiBold type', () => {
    const { getByText } = render(<ThemedText type="defaultSemiBold">Semi Bold Text</ThemedText>);
    
    const textElement = getByText('Semi Bold Text');
    
    // Check that the defaultSemiBold style is applied
    expect(textElement.props.style).toEqual(
      expect.arrayContaining([
        { color: '#000000' },
        undefined,
        undefined,
        { fontSize: 16, lineHeight: 24, fontWeight: '600' },
        undefined,
        undefined
      ])
    );
  });

  it('renders correctly with subtitle type', () => {
    const { getByText } = render(<ThemedText type="subtitle">Subtitle Text</ThemedText>);
    
    const textElement = getByText('Subtitle Text');
    
    // Check that the subtitle style is applied
    expect(textElement.props.style).toEqual(
      expect.arrayContaining([
        { color: '#000000' },
        undefined,
        undefined,
        undefined,
        { fontSize: 20, fontWeight: 'bold' },
        undefined
      ])
    );
  });

  it('renders correctly with link type', () => {
    const { getByText } = render(<ThemedText type="link">Link Text</ThemedText>);
    
    const textElement = getByText('Link Text');
    
    // Check that the link style is applied
    expect(textElement.props.style).toEqual(
      expect.arrayContaining([
        { color: '#000000' },
        undefined,
        undefined,
        undefined,
        undefined,
        { lineHeight: 30, fontSize: 16, color: '#0a7ea4' }
      ])
    );
  });

  it('applies custom light color when provided', () => {
    const { getByText } = render(<ThemedText lightColor="red">Custom Light Color</ThemedText>);
    
    const textElement = getByText('Custom Light Color');
    
    // Check that the custom light color is applied
    expect(textElement.props.style[0]).toEqual({ color: 'red' });
  });

  it('applies custom dark color when provided', () => {
    const { getByText } = render(<ThemedText darkColor="blue">Custom Dark Color</ThemedText>);
    
    const textElement = getByText('Custom Dark Color');
    
    // Check that the custom dark color is applied
    expect(textElement.props.style[0]).toEqual({ color: 'blue' });
  });

  it('applies custom style when provided', () => {
    const customStyle = { marginTop: 10, padding: 5 };
    const { getByText } = render(
      <ThemedText style={customStyle}>Custom Style</ThemedText>
    );
    
    const textElement = getByText('Custom Style');
    
    // Check that the custom style is applied
    expect(textElement.props.style).toEqual(
      expect.arrayContaining([customStyle])
    );
  });
});
