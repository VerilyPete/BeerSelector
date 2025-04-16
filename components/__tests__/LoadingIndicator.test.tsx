import React from 'react';
import { render } from '@testing-library/react-native';
import { LoadingIndicator } from '../LoadingIndicator';

// Mock the ThemedText component
jest.mock('../ThemedText', () => ({
  ThemedText: ({ children, style }) => {
    return { type: 'ThemedText', children, style, testID: 'themed-text' };
  },
}));

describe('LoadingIndicator', () => {
  it('renders correctly with default props', () => {
    const { getByTestId, UNSAFE_getByType } = render(<LoadingIndicator />);
    
    // Check that ActivityIndicator is rendered
    expect(UNSAFE_getByType('ActivityIndicator')).toBeTruthy();
    
    // Check that ThemedText is rendered with the default message
    const themedText = getByTestId('themed-text');
    expect(themedText.children).toBe('Loading...');
    
    // Check that the style is applied to ThemedText
    expect(themedText.style).toEqual({
      marginTop: 16,
      fontSize: 16,
      textAlign: 'center',
    });
  });

  it('renders correctly with custom message', () => {
    const customMessage = 'Custom loading message';
    const { getByTestId } = render(<LoadingIndicator message={customMessage} />);
    
    // Check that ThemedText is rendered with the custom message
    const themedText = getByTestId('themed-text');
    expect(themedText.children).toBe(customMessage);
  });

  it('applies correct styles to container', () => {
    const { UNSAFE_getByType } = render(<LoadingIndicator />);
    
    // Check that the container has the correct styles
    const container = UNSAFE_getByType('View');
    expect(container.props.style).toEqual({
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    });
  });
});
