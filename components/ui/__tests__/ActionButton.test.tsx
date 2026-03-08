import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { useColorScheme } from '@/hooks/useColorScheme';

import { ActionButton } from '../ActionButton';

jest.mock('@/hooks/useColorScheme', () => ({
  useColorScheme: jest.fn(() => 'dark'),
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children, testID, ...props }: { children?: React.ReactNode; testID?: string; colors?: readonly string[]; style?: object }) => {
    const { View } = require('react-native');
    return <View testID={testID} {...props}>{children}</View>;
  },
}));

type ActionButtonProps = React.ComponentProps<typeof ActionButton>;

function createDefaultProps(): ActionButtonProps {
  return {
    label: 'Test Button',
    onPress: jest.fn(),
    loading: false,
    disabled: false,
  };
}

describe('ActionButton', () => {
  describe('Label rendering', () => {
    test('renders label text when not loading', () => {
      const props = createDefaultProps();
      const { getByText } = render(<ActionButton {...props} />);
      expect(getByText('Test Button')).toBeTruthy();
    });

    test('does not render label when loading', () => {
      const props = createDefaultProps();
      const { queryByText } = render(<ActionButton {...props} loading={true} />);
      expect(queryByText('Test Button')).toBeNull();
    });
  });

  describe('ActivityIndicator', () => {
    test('renders ActivityIndicator when loading is true', () => {
      const props = createDefaultProps();
      const { UNSAFE_getByType } = render(<ActionButton {...props} loading={true} />);
      const { ActivityIndicator } = require('react-native');
      expect(UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
    });
  });

  describe('Disabled state', () => {
    test('TouchableOpacity is disabled when disabled prop is true', () => {
      const props = createDefaultProps();
      const { UNSAFE_getByType } = render(<ActionButton {...props} disabled={true} />);
      const { TouchableOpacity } = require('react-native');
      expect(UNSAFE_getByType(TouchableOpacity).props.disabled).toBe(true);
    });

    test('TouchableOpacity is disabled when loading is true', () => {
      const props = createDefaultProps();
      const { UNSAFE_getByType } = render(<ActionButton {...props} loading={true} />);
      const { TouchableOpacity } = require('react-native');
      expect(UNSAFE_getByType(TouchableOpacity).props.disabled).toBe(true);
    });
  });

  describe('onPress', () => {
    test('calls onPress when pressed in normal state', () => {
      const props = createDefaultProps();
      const { UNSAFE_getByType } = render(<ActionButton {...props} />);
      const { TouchableOpacity } = require('react-native');
      fireEvent.press(UNSAFE_getByType(TouchableOpacity));
      expect(props.onPress).toHaveBeenCalledTimes(1);
    });
  });

  describe('Custom style', () => {
    test('custom style prop is applied to outer TouchableOpacity', () => {
      const props = createDefaultProps();
      const customStyle = { marginTop: 16 };
      const { UNSAFE_getByType } = render(<ActionButton {...props} style={customStyle} />);
      const { TouchableOpacity } = require('react-native');
      const touchable = UNSAFE_getByType(TouchableOpacity);
      const flatStyle = Array.isArray(touchable.props.style)
        ? Object.assign({}, ...touchable.props.style)
        : touchable.props.style;
      expect(flatStyle?.marginTop).toBe(16);
    });
  });

  describe('Gradient colors by color scheme', () => {
    test('dark mode uses dark-mode gradient colors', () => {
      (useColorScheme as jest.Mock).mockReturnValue('dark');
      const props = createDefaultProps();
      const { UNSAFE_getAllByType } = render(<ActionButton {...props} />);
      const { View } = require('react-native');
      const views = UNSAFE_getAllByType(View);
      // The mocked LinearGradient renders as View with colors prop
      const gradientView = views.find((v: { props: { colors?: string[] } }) => Array.isArray(v.props.colors));
      expect(gradientView).toBeTruthy();
      expect(gradientView?.props.colors).toEqual(['#FFD54F', '#FFB300', '#E6A200']);
    });

    test('light mode uses light-mode gradient colors', () => {
      (useColorScheme as jest.Mock).mockReturnValue('light');
      const props = createDefaultProps();
      const { UNSAFE_getAllByType } = render(<ActionButton {...props} />);
      const { View } = require('react-native');
      const views = UNSAFE_getAllByType(View);
      const gradientView = views.find((v: { props: { colors?: string[] } }) => Array.isArray(v.props.colors));
      expect(gradientView).toBeTruthy();
      expect(gradientView?.props.colors).toEqual(['#E6A200', '#CC8F00', '#B37D00']);
    });
  });
});
