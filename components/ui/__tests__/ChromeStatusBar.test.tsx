import React from 'react';
import { render } from '@testing-library/react-native';
import type { ReactTestRendererJSON } from 'react-test-renderer';
import { ChromeStatusBar } from '../ChromeStatusBar';
import { Colors } from '@/constants/Colors';

jest.mock('@/hooks/useColorScheme', () => ({
  useColorScheme: jest.fn(() => 'dark'),
}));

/**
 * `toJSON()` is typed as `ReactTestRendererJSON | ReactTestRendererJSON[] | null`
 * because a tree can render multiple siblings or nothing at all. `ChromeStatusBar`
 * always renders a single root `View`, so tests can rely on that — but the type
 * system can't, and asserting it away would hide a real regression (e.g. the
 * component starting to render a fragment) instead of failing the test.
 */
function expectSingleRoot(
  tree: ReactTestRendererJSON | ReactTestRendererJSON[] | null
): ReactTestRendererJSON {
  if (tree === null || Array.isArray(tree)) {
    throw new Error('Expected ChromeStatusBar to render a single root element');
  }
  return tree;
}

describe('ChromeStatusBar', () => {
  it('renders with correct height from safe area insets', () => {
    // jest.setup.js mocks useSafeAreaInsets to return { top: 0 }
    // So expected height = 0 + 6 = 6
    const { toJSON } = render(<ChromeStatusBar />);
    const tree = expectSingleRoot(toJSON());
    expect(tree).toBeTruthy();
    // The root View should have height: 6 (insets.top=0 + 6)
    const style = Array.isArray(tree.props.style)
      ? Object.assign({}, ...tree.props.style)
      : tree.props.style;
    expect(style.height).toBe(6);
  });

  it('uses chromeBar background color', () => {
    const { toJSON } = render(<ChromeStatusBar />);
    const tree = expectSingleRoot(toJSON());
    const style = Array.isArray(tree.props.style)
      ? Object.assign({}, ...tree.props.style)
      : tree.props.style;
    expect(style.backgroundColor).toBe(Colors.dark.chromeBar);
  });

  it('uses chromeBarBorder for bottom border color', () => {
    const { toJSON } = render(<ChromeStatusBar />);
    const tree = expectSingleRoot(toJSON());
    const style = Array.isArray(tree.props.style)
      ? Object.assign({}, ...tree.props.style)
      : tree.props.style;
    expect(style.borderBottomColor).toBe(Colors.dark.chromeBarBorder);
  });
});
