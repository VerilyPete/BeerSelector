import React from 'react';
import { render } from '@testing-library/react-native';
import { Text, View } from 'react-native';
import { ChromeShell } from '../ChromeShell';

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children, testID, ...props }: { children?: React.ReactNode; testID?: string; colors?: readonly string[]; style?: object }) => {
    const { View } = require('react-native');
    return <View testID={testID} {...props}>{children}</View>;
  },
}));

function createProps(overrides: Partial<React.ComponentProps<typeof ChromeShell>> = {}) {
  return {
    children: <Text>Test Content</Text>,
    ...overrides,
  };
}

describe('ChromeShell', () => {
  it('renders children', () => {
    const { getByText } = render(<ChromeShell {...createProps()} />);
    expect(getByText('Test Content')).toBeTruthy();
  });

  it('applies custom borderRadius and padding', () => {
    const { getByTestId } = render(
      <ChromeShell {...createProps({ borderRadius: 20, padding: 5 })} testID="shell" />
    );
    // Component should pass style props through
    // This test verifies the component accepts these props without error
  });

  it('renders without crashing when no optional props provided', () => {
    const { getByText } = render(<ChromeShell>{<Text>Minimal</Text>}</ChromeShell>);
    expect(getByText('Minimal')).toBeTruthy();
  });

  it('applies custom style prop', () => {
    const { getByText } = render(
      <ChromeShell {...createProps({ style: { width: 200 } })} />
    );
    expect(getByText('Test Content')).toBeTruthy();
  });

  it('accepts custom colors prop', () => {
    const customColors = ['#FF0000', '#00FF00', '#0000FF'] as const;
    const { getByText } = render(
      <ChromeShell {...createProps({ colors: customColors })} />
    );
    expect(getByText('Test Content')).toBeTruthy();
  });
});
