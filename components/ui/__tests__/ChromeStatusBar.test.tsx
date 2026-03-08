import React from 'react';
import { render } from '@testing-library/react-native';
import { ChromeStatusBar } from '../ChromeStatusBar';
import { Colors } from '@/constants/Colors';

jest.mock('@/hooks/useColorScheme', () => ({
  useColorScheme: jest.fn(() => 'dark'),
}));

describe('ChromeStatusBar', () => {
  it('renders with correct height from safe area insets', () => {
    // jest.setup.js mocks useSafeAreaInsets to return { top: 0 }
    // So expected height = 0 + 6 = 6
    const { toJSON } = render(<ChromeStatusBar />);
    const tree = toJSON();
    expect(tree).toBeTruthy();
    // The root View should have height: 6 (insets.top=0 + 6)
    const style = Array.isArray(tree.props.style) ? Object.assign({}, ...tree.props.style) : tree.props.style;
    expect(style.height).toBe(6);
  });

  it('uses chromeBar background color', () => {
    const { toJSON } = render(<ChromeStatusBar />);
    const tree = toJSON();
    const style = Array.isArray(tree.props.style) ? Object.assign({}, ...tree.props.style) : tree.props.style;
    expect(style.backgroundColor).toBe(Colors.dark.chromeBar);
  });

  it('uses chromeBarBorder for bottom border color', () => {
    const { toJSON } = render(<ChromeStatusBar />);
    const tree = toJSON();
    const style = Array.isArray(tree.props.style) ? Object.assign({}, ...tree.props.style) : tree.props.style;
    expect(style.borderBottomColor).toBe(Colors.dark.chromeBarBorder);
  });
});
