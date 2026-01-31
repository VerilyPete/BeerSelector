import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import { FilterBar } from '../FilterBar';

// Mock theme hooks before importing component
jest.mock('@/hooks/useColorScheme', () => ({
  useColorScheme: jest.fn(() => 'light'),
}));

jest.mock('@/hooks/useThemeColor', () => ({
  useThemeColor: jest.fn((_props, colorName) => {
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
  IconSymbol: ({ name, testID }: any) => {
    const { View } = require('react-native');
    return <View testID={testID || `icon-${name}`} />;
  },
}));

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

describe('FilterBar', () => {
  const mockOnCycleContainerFilter = jest.fn();
  const mockOnCycleSort = jest.fn();
  const mockOnToggleSortDirection = jest.fn();

  const defaultProps = {
    containerFilter: 'all' as const,
    sortBy: 'date' as const,
    sortDirection: 'desc' as const,
    onCycleContainerFilter: mockOnCycleContainerFilter,
    onCycleSort: mockOnCycleSort,
    onToggleSortDirection: mockOnToggleSortDirection,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Container filter button', () => {
    test('renders showing "All" when containerFilter is all', () => {
      const { getByText } = render(<FilterBar {...defaultProps} containerFilter="all" />);
      expect(getByText('All')).toBeTruthy();
    });

    test('renders showing "Draft" when containerFilter is draft', () => {
      const { getByText } = render(<FilterBar {...defaultProps} containerFilter="draft" />);
      expect(getByText('Draft')).toBeTruthy();
    });

    test('renders showing "Cans" when containerFilter is cans', () => {
      const { getByText } = render(<FilterBar {...defaultProps} containerFilter="cans" />);
      expect(getByText('Cans')).toBeTruthy();
    });

    test('calls onCycleContainerFilter when pressed', () => {
      const { getByText } = render(<FilterBar {...defaultProps} containerFilter="all" />);
      fireEvent.press(getByText('All'));
      expect(mockOnCycleContainerFilter).toHaveBeenCalledTimes(1);
    });

    test('has active styling when containerFilter is draft', () => {
      const { getByTestId } = render(<FilterBar {...defaultProps} containerFilter="draft" />);
      const button = getByTestId('filter-container-button');
      // Active state should use tint background color
      expect(button.props.style).toEqual(expect.objectContaining({ backgroundColor: '#0a7ea4' }));
    });

    test('has active styling when containerFilter is cans', () => {
      const { getByTestId } = render(<FilterBar {...defaultProps} containerFilter="cans" />);
      const button = getByTestId('filter-container-button');
      expect(button.props.style).toEqual(expect.objectContaining({ backgroundColor: '#0a7ea4' }));
    });

    test('does not have active styling when containerFilter is all', () => {
      const { getByTestId } = render(<FilterBar {...defaultProps} containerFilter="all" />);
      const button = getByTestId('filter-container-button');
      // Inactive state should use secondary background
      expect(button.props.style).not.toEqual(
        expect.objectContaining({ backgroundColor: '#0a7ea4' })
      );
    });
  });

  describe('Sort button', () => {
    test('shows "Date" when sortBy is date', () => {
      const { getByTestId } = render(<FilterBar {...defaultProps} sortBy="date" />);
      expect(getByTestId('sort-button-text').props.children).toBe('Date');
    });

    test('shows "Name" when sortBy is name', () => {
      const { getByTestId } = render(<FilterBar {...defaultProps} sortBy="name" />);
      expect(getByTestId('sort-button-text').props.children).toBe('Name');
    });

    test('shows "ABV" when sortBy is abv', () => {
      const { getByTestId } = render(<FilterBar {...defaultProps} sortBy="abv" />);
      expect(getByTestId('sort-button-text').props.children).toBe('ABV');
    });

    test('calls onCycleSort when pressed', () => {
      const { getByTestId } = render(<FilterBar {...defaultProps} />);
      fireEvent.press(getByTestId('sort-toggle-button'));
      expect(mockOnCycleSort).toHaveBeenCalledTimes(1);
    });

    test('shows calendar icon when sortBy is date', () => {
      const { getByTestId } = render(<FilterBar {...defaultProps} sortBy="date" />);
      expect(getByTestId('icon-calendar')).toBeTruthy();
    });

    test('shows textformat icon when sortBy is name', () => {
      const { getByTestId } = render(<FilterBar {...defaultProps} sortBy="name" />);
      expect(getByTestId('icon-textformat')).toBeTruthy();
    });

    test('shows percent icon when sortBy is abv', () => {
      const { getByTestId } = render(<FilterBar {...defaultProps} sortBy="abv" />);
      expect(getByTestId('icon-percent')).toBeTruthy();
    });
  });

  describe('Sort direction button', () => {
    test('calls onToggleSortDirection when pressed', () => {
      const { getByTestId } = render(<FilterBar {...defaultProps} />);
      fireEvent.press(getByTestId('sort-direction-button'));
      expect(mockOnToggleSortDirection).toHaveBeenCalledTimes(1);
    });

    test('shows arrow.up icon for ascending direction', () => {
      const { getByTestId } = render(<FilterBar {...defaultProps} sortDirection="asc" />);
      expect(getByTestId('icon-arrow.up')).toBeTruthy();
    });

    test('shows arrow.down icon for descending direction', () => {
      const { getByTestId } = render(<FilterBar {...defaultProps} sortDirection="desc" />);
      expect(getByTestId('icon-arrow.down')).toBeTruthy();
    });
  });

  describe('Haptics feedback', () => {
    const Haptics = require('expo-haptics');

    test('triggers haptics when container filter button is pressed', () => {
      const { getByTestId } = render(<FilterBar {...defaultProps} />);
      fireEvent.press(getByTestId('filter-container-button'));
      expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
    });

    test('triggers haptics when sort button is pressed', () => {
      const { getByTestId } = render(<FilterBar {...defaultProps} />);
      fireEvent.press(getByTestId('sort-toggle-button'));
      expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
    });

    test('triggers haptics when sort direction button is pressed', () => {
      const { getByTestId } = render(<FilterBar {...defaultProps} />);
      fireEvent.press(getByTestId('sort-direction-button'));
      expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
    });
  });

  describe('Accessibility labels with next action', () => {
    test('container "All" label describes next state as Draft', () => {
      const { getByTestId } = render(<FilterBar {...defaultProps} containerFilter="all" />);
      expect(getByTestId('filter-container-button').props.accessibilityLabel).toBe(
        'Container filter: All. Double tap to show Draft.'
      );
    });

    test('container "Draft" label describes next state as Cans', () => {
      const { getByTestId } = render(<FilterBar {...defaultProps} containerFilter="draft" />);
      expect(getByTestId('filter-container-button').props.accessibilityLabel).toBe(
        'Container filter: Draft. Double tap to show Cans.'
      );
    });

    test('sort "Date" label describes next state as Name', () => {
      const { getByTestId } = render(<FilterBar {...defaultProps} sortBy="date" />);
      expect(getByTestId('sort-toggle-button').props.accessibilityLabel).toBe(
        'Sort by Date. Double tap to sort by Name.'
      );
    });

    test('sort "ABV" label describes next state as Date', () => {
      const { getByTestId } = render(<FilterBar {...defaultProps} sortBy="abv" />);
      expect(getByTestId('sort-toggle-button').props.accessibilityLabel).toBe(
        'Sort by ABV. Double tap to sort by Date.'
      );
    });

    test('direction "asc" label describes next state as descending', () => {
      const { getByTestId } = render(<FilterBar {...defaultProps} sortDirection="asc" />);
      expect(getByTestId('sort-direction-button').props.accessibilityLabel).toBe(
        'Sort ascending. Double tap to sort descending.'
      );
    });

    test('direction "desc" label describes next state as ascending', () => {
      const { getByTestId } = render(<FilterBar {...defaultProps} sortDirection="desc" />);
      expect(getByTestId('sort-direction-button').props.accessibilityLabel).toBe(
        'Sort descending. Double tap to sort ascending.'
      );
    });
  });

  describe('Theme colors', () => {
    test('sort buttons use backgroundElevated color, not background', () => {
      const { getByTestId } = render(<FilterBar {...defaultProps} />);
      const sortButton = getByTestId('sort-toggle-button');
      const directionButton = getByTestId('sort-direction-button');
      // backgroundElevated is #FFFFFF, background is #FAFAFA
      expect(sortButton.props.style).toEqual(
        expect.objectContaining({ backgroundColor: '#FFFFFF' })
      );
      expect(directionButton.props.style).toEqual(
        expect.objectContaining({ backgroundColor: '#FFFFFF' })
      );
    });
  });

  describe('Layout', () => {
    test('all buttons render at same height (CHIP_MIN_HEIGHT)', () => {
      const { getByTestId } = render(<FilterBar {...defaultProps} />);

      const containerButton = getByTestId('filter-container-button');
      const sortButton = getByTestId('sort-toggle-button');
      const directionButton = getByTestId('sort-direction-button');

      // All buttons should have minHeight of 44 (CHIP_MIN_HEIGHT)
      const getMinHeight = (element: any) => {
        const style = element.props.style;
        if (Array.isArray(style)) {
          return style.reduce((acc: any, s: any) => ({ ...acc, ...s }), {}).minHeight;
        }
        return style?.minHeight;
      };

      expect(getMinHeight(containerButton)).toBe(44);
      expect(getMinHeight(sortButton)).toBe(44);
      expect(getMinHeight(directionButton)).toBe(44);
    });
  });
});
