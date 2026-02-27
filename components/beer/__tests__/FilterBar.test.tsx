import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import { FilterBar } from '../FilterBar';

// Mock theme hooks before importing component
jest.mock('@/hooks/useColorScheme', () => ({
  useColorScheme: jest.fn(() => 'light'),
}));

jest.mock('@/hooks/useThemeColor', () => ({
  useThemeColor: jest.fn((_props: unknown, colorName: string) => {
    const colors: Record<string, string> = {
      tint: '#0a7ea4',
      textOnPrimary: '#FFFFFF',
      backgroundSecondary: '#F5F5F0',
      backgroundTertiary: 'rgba(150, 150, 150, 0.1)',
      text: '#11181C',
      background: '#FAFAFA',
      backgroundElevated: '#FFFFFF',
      border: '#E7E5E4',
      accent: '#FFC107',
    };
    return colors[colorName] || '#000000';
  }),
}));

// Mock IconSymbol component
jest.mock('@/components/ui/IconSymbol', () => ({
  IconSymbol: ({ name, testID }: { name: string; testID?: string }) => {
    const { View } = require('react-native');
    return <View testID={testID || `icon-${name}`} />;
  },
}));

// Mock BeerIcon component
jest.mock('@/components/icons/BeerIcon', () => {
  const { View } = require('react-native');
  return ({ name, testID }: { name: string; testID?: string }) => (
    <View testID={testID || `beericon-${name}`} />
  );
});

// Mock ThemedText and ThemedView to use plain React Native components
jest.mock('@/components/ThemedText');
jest.mock('@/components/ThemedView');

// Mock expo-haptics
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: {
    Light: 'light',
    Medium: 'medium',
    Heavy: 'heavy',
  },
}));

// Use real timers for this test suite to avoid hanging
beforeAll(() => {
  jest.useRealTimers();
});

afterAll(() => {
  jest.useFakeTimers();
});

type FilterBarProps = {
  containerFilter: 'all' | 'draft' | 'cans';
  sortBy: 'date' | 'name' | 'abv';
  sortDirection: 'asc' | 'desc';
  onCycleContainerFilter: jest.Mock;
  onCycleSort: jest.Mock;
  onToggleSortDirection: jest.Mock;
};

function createDefaultProps(): FilterBarProps {
  return {
    containerFilter: 'all',
    sortBy: 'date',
    sortDirection: 'desc',
    onCycleContainerFilter: jest.fn(),
    onCycleSort: jest.fn(),
    onToggleSortDirection: jest.fn(),
  };
}

describe('FilterBar', () => {
  describe('Container filter button', () => {
    test('renders showing "All" when containerFilter is all', () => {
      const props = createDefaultProps();
      const { getByText } = render(<FilterBar {...props} containerFilter="all" />);
      expect(getByText('All')).toBeTruthy();
    });

    test('renders showing "Draft" when containerFilter is draft', () => {
      const props = createDefaultProps();
      const { getByText } = render(<FilterBar {...props} containerFilter="draft" />);
      expect(getByText('Draft')).toBeTruthy();
    });

    test('renders showing "Cans" when containerFilter is cans', () => {
      const props = createDefaultProps();
      const { getByText } = render(<FilterBar {...props} containerFilter="cans" />);
      expect(getByText('Cans')).toBeTruthy();
    });

    test('calls onCycleContainerFilter when pressed', () => {
      const props = createDefaultProps();
      const { getByText } = render(<FilterBar {...props} containerFilter="all" />);
      fireEvent.press(getByText('All'));
      expect(props.onCycleContainerFilter).toHaveBeenCalledTimes(1);
    });

    test('has active styling when containerFilter is not all', () => {
      const props = createDefaultProps();
      const { getByTestId } = render(<FilterBar {...props} containerFilter="draft" />);
      const button = getByTestId('filter-container-button');
      // Active state should use a non-secondary background (tint color)
      expect(button.props.style).not.toEqual(
        expect.objectContaining({ backgroundColor: '#F5F5F0' })
      );
    });

    test('does not have active styling when containerFilter is all', () => {
      const props = createDefaultProps();
      const { getByTestId } = render(<FilterBar {...props} containerFilter="all" />);
      const button = getByTestId('filter-container-button');
      // Inactive state should use secondary background, not tint
      const tintColor = '#0a7ea4';
      const flatStyle = Array.isArray(button.props.style)
        ? Object.assign({}, ...button.props.style)
        : button.props.style;
      expect(flatStyle?.backgroundColor).not.toBe(tintColor);
    });

    test('active and inactive states use different background colors', () => {
      const props = createDefaultProps();
      const { getByTestId: getDraftTestId } = render(
        <FilterBar {...props} containerFilter="draft" />
      );
      const { getByTestId: getAllTestId } = render(
        <FilterBar {...props} containerFilter="all" />
      );

      const activeButton = getDraftTestId('filter-container-button');
      const inactiveButton = getAllTestId('filter-container-button');

      const getBackground = (el: { props: { style: unknown } }) => {
        const style = el.props.style;
        if (Array.isArray(style)) {
          return style.reduce<Record<string, unknown>>((acc, s) => ({ ...acc, ...(s as object) }), {}).backgroundColor;
        }
        return (style as Record<string, unknown>)?.backgroundColor;
      };

      expect(getBackground(activeButton)).not.toBe(getBackground(inactiveButton));
    });
  });

  describe('Sort button', () => {
    test('shows "Date" when sortBy is date', () => {
      const props = createDefaultProps();
      const { getByTestId } = render(<FilterBar {...props} sortBy="date" />);
      expect(getByTestId('sort-button-text').props.children).toBe('Date');
    });

    test('shows "Name" when sortBy is name', () => {
      const props = createDefaultProps();
      const { getByTestId } = render(<FilterBar {...props} sortBy="name" />);
      expect(getByTestId('sort-button-text').props.children).toBe('Name');
    });

    test('shows "ABV" when sortBy is abv', () => {
      const props = createDefaultProps();
      const { getByTestId } = render(<FilterBar {...props} sortBy="abv" />);
      expect(getByTestId('sort-button-text').props.children).toBe('ABV');
    });

    test('calls onCycleSort when pressed', () => {
      const props = createDefaultProps();
      const { getByTestId } = render(<FilterBar {...props} />);
      fireEvent.press(getByTestId('sort-toggle-button'));
      expect(props.onCycleSort).toHaveBeenCalledTimes(1);
    });

    test('shows calendar icon when sortBy is date', () => {
      const props = createDefaultProps();
      const { getByTestId } = render(<FilterBar {...props} sortBy="date" />);
      expect(getByTestId('icon-calendar')).toBeTruthy();
    });

    test('shows textformat icon when sortBy is name', () => {
      const props = createDefaultProps();
      const { getByTestId } = render(<FilterBar {...props} sortBy="name" />);
      expect(getByTestId('icon-textformat')).toBeTruthy();
    });

    test('shows bottle icon when sortBy is abv', () => {
      const props = createDefaultProps();
      const { getByTestId } = render(<FilterBar {...props} sortBy="abv" />);
      expect(getByTestId('beericon-bottle')).toBeTruthy();
    });
  });

  describe('Sort direction button', () => {
    test('calls onToggleSortDirection when pressed', () => {
      const props = createDefaultProps();
      const { getByTestId } = render(<FilterBar {...props} />);
      fireEvent.press(getByTestId('sort-direction-button'));
      expect(props.onToggleSortDirection).toHaveBeenCalledTimes(1);
    });

    test.each([
      { sortBy: 'date' as const, direction: 'asc' as const, label: 'Oldest' },
      { sortBy: 'date' as const, direction: 'desc' as const, label: 'Newest' },
      { sortBy: 'name' as const, direction: 'asc' as const, label: 'A–Z' },
      { sortBy: 'name' as const, direction: 'desc' as const, label: 'Z–A' },
      { sortBy: 'abv' as const, direction: 'asc' as const, label: 'Low' },
      { sortBy: 'abv' as const, direction: 'desc' as const, label: 'High' },
    ])('shows "$label" for sortBy=$sortBy direction=$direction', ({ sortBy, direction, label }) => {
      const props = createDefaultProps();
      const { getByText } = render(
        <FilterBar {...props} sortBy={sortBy} sortDirection={direction} />
      );
      expect(getByText(label)).toBeTruthy();
    });
  });

  describe('Haptics feedback', () => {
    const Haptics = require('expo-haptics');

    test('triggers haptics when container filter button is pressed', () => {
      const props = createDefaultProps();
      const { getByTestId } = render(<FilterBar {...props} />);
      fireEvent.press(getByTestId('filter-container-button'));
      expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
    });

    test('triggers haptics when sort button is pressed', () => {
      const props = createDefaultProps();
      const { getByTestId } = render(<FilterBar {...props} />);
      fireEvent.press(getByTestId('sort-toggle-button'));
      expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
    });

    test('triggers haptics when sort direction button is pressed', () => {
      const props = createDefaultProps();
      const { getByTestId } = render(<FilterBar {...props} />);
      fireEvent.press(getByTestId('sort-direction-button'));
      expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
    });
  });

  describe('Accessibility labels with next action', () => {
    test('container "All" label describes next state as Draft', () => {
      const props = createDefaultProps();
      const { getByTestId } = render(<FilterBar {...props} containerFilter="all" />);
      expect(getByTestId('filter-container-button').props.accessibilityLabel).toBe(
        'Container filter: All. Double tap to show Draft.'
      );
    });

    test('container "Draft" label describes next state as Cans', () => {
      const props = createDefaultProps();
      const { getByTestId } = render(<FilterBar {...props} containerFilter="draft" />);
      expect(getByTestId('filter-container-button').props.accessibilityLabel).toBe(
        'Container filter: Draft. Double tap to show Cans.'
      );
    });

    test('sort "Date" label describes next state as Name', () => {
      const props = createDefaultProps();
      const { getByTestId } = render(<FilterBar {...props} sortBy="date" />);
      expect(getByTestId('sort-toggle-button').props.accessibilityLabel).toBe(
        'Sort by Date. Double tap to sort by Name.'
      );
    });

    test('sort "ABV" label describes next state as Date', () => {
      const props = createDefaultProps();
      const { getByTestId } = render(<FilterBar {...props} sortBy="abv" />);
      expect(getByTestId('sort-toggle-button').props.accessibilityLabel).toBe(
        'Sort by ABV. Double tap to sort by Date.'
      );
    });

    test('direction label for date/asc shows contextual labels', () => {
      const props = createDefaultProps();
      const { getByTestId } = render(
        <FilterBar {...props} sortBy="date" sortDirection="asc" />
      );
      expect(getByTestId('sort-direction-button').props.accessibilityLabel).toBe(
        'Sort: Oldest. Double tap for Newest.'
      );
    });

    test('direction label for date/desc shows contextual labels', () => {
      const props = createDefaultProps();
      const { getByTestId } = render(
        <FilterBar {...props} sortBy="date" sortDirection="desc" />
      );
      expect(getByTestId('sort-direction-button').props.accessibilityLabel).toBe(
        'Sort: Newest. Double tap for Oldest.'
      );
    });

    test('direction label for name/asc shows contextual labels', () => {
      const props = createDefaultProps();
      const { getByTestId } = render(
        <FilterBar {...props} sortBy="name" sortDirection="asc" />
      );
      expect(getByTestId('sort-direction-button').props.accessibilityLabel).toBe(
        'Sort: A–Z. Double tap for Z–A.'
      );
    });

    test('direction label for abv/desc shows contextual labels', () => {
      const props = createDefaultProps();
      const { getByTestId } = render(
        <FilterBar {...props} sortBy="abv" sortDirection="desc" />
      );
      expect(getByTestId('sort-direction-button').props.accessibilityLabel).toBe(
        'Sort: High. Double tap for Low.'
      );
    });
  });

  describe('Theme colors', () => {
    test('sort buttons use backgroundElevated color, not background color', () => {
      const props = createDefaultProps();
      const { getByTestId } = render(<FilterBar {...props} />);
      const sortButton = getByTestId('sort-toggle-button');
      const directionButton = getByTestId('sort-direction-button');

      const getBackground = (el: { props: { style: unknown } }) => {
        const style = el.props.style;
        if (Array.isArray(style)) {
          return style.reduce<Record<string, unknown>>((acc, s) => ({ ...acc, ...(s as object) }), {}).backgroundColor;
        }
        return (style as Record<string, unknown>)?.backgroundColor;
      };

      // backgroundElevated is #FFFFFF, background is #FAFAFA
      // Both are white-ish but elevated is used for raised surfaces
      const sortBg = getBackground(sortButton);
      const directionBg = getBackground(directionButton);

      // Both sort buttons should use the same background (elevated)
      expect(sortBg).toBe(directionBg);
      // And it should NOT be the body background color
      expect(sortBg).not.toBe('#FAFAFA');
    });
  });

  describe('Layout', () => {
    test('all buttons render at same height (CHIP_MIN_HEIGHT)', () => {
      const props = createDefaultProps();
      const { getByTestId } = render(<FilterBar {...props} />);

      const containerButton = getByTestId('filter-container-button');
      const sortButton = getByTestId('sort-toggle-button');
      const directionButton = getByTestId('sort-direction-button');

      const getMinHeight = (element: {
        props: { style: Record<string, unknown> | readonly Record<string, unknown>[] };
      }) => {
        const style = element.props.style;
        if (Array.isArray(style)) {
          return style.reduce<Record<string, unknown>>((acc, s) => ({ ...acc, ...s }), {})
            .minHeight;
        }
        return style?.minHeight;
      };

      expect(getMinHeight(containerButton)).toBe(44);
      expect(getMinHeight(sortButton)).toBe(44);
      expect(getMinHeight(directionButton)).toBe(44);
    });
  });
});
