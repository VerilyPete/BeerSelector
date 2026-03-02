import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import { FilterBar } from '../FilterBar';

jest.mock('@/hooks/useColorScheme', () => ({
  useColorScheme: jest.fn(() => 'light'),
}));

jest.mock('@/components/ui/IconSymbol', () => ({
  IconSymbol: ({ name, testID }: { name: string; testID?: string }) => {
    const { View } = require('react-native');
    return <View testID={testID || `icon-${name}`} />;
  },
}));

jest.mock('@/components/icons/BeerIcon', () => {
  const { View } = require('react-native');
  return ({ name, testID }: { name: string; testID?: string }) => (
    <View testID={testID || `beericon-${name}`} />
  );
});

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: {
    Light: 'light',
    Medium: 'medium',
    Heavy: 'heavy',
  },
}));

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
    test('renders showing "ALL" when containerFilter is all', () => {
      const props = createDefaultProps();
      const { getByText } = render(<FilterBar {...props} containerFilter="all" />);
      expect(getByText('ALL')).toBeTruthy();
    });

    test('renders showing "DRAFT" when containerFilter is draft', () => {
      const props = createDefaultProps();
      const { getByText } = render(<FilterBar {...props} containerFilter="draft" />);
      expect(getByText('DRAFT')).toBeTruthy();
    });

    test('renders showing "CANS" when containerFilter is cans', () => {
      const props = createDefaultProps();
      const { getByText } = render(<FilterBar {...props} containerFilter="cans" />);
      expect(getByText('CANS')).toBeTruthy();
    });

    test('calls onCycleContainerFilter when pressed', () => {
      const props = createDefaultProps();
      const { getByText } = render(<FilterBar {...props} containerFilter="all" />);
      fireEvent.press(getByText('ALL'));
      expect(props.onCycleContainerFilter).toHaveBeenCalledTimes(1);
    });

    test('has active styling when containerFilter is not all', () => {
      const props = createDefaultProps();
      const { getByTestId } = render(<FilterBar {...props} containerFilter="draft" />);
      const button = getByTestId('filter-container-button');
      expect(button.props.style).not.toEqual(
        expect.objectContaining({ backgroundColor: '#F5F5F0' })
      );
    });

    test('does not have active styling when containerFilter is all', () => {
      const props = createDefaultProps();
      const { getByTestId } = render(<FilterBar {...props} containerFilter="all" />);
      const button = getByTestId('filter-container-button');
      const tintColor = '#0a7ea4';
      const flatStyle = Array.isArray(button.props.style)
        ? Object.assign({}, ...button.props.style)
        : button.props.style;
      expect(flatStyle?.backgroundColor).not.toBe(tintColor);
    });

    test('active and inactive states render different label text', () => {
      const props = createDefaultProps();
      const { getByText: getDraftText } = render(
        <FilterBar {...props} containerFilter="draft" />
      );
      const { getByText: getAllText } = render(
        <FilterBar {...props} containerFilter="all" />
      );

      expect(getDraftText('DRAFT')).toBeTruthy();
      expect(getAllText('ALL')).toBeTruthy();
    });
  });

  describe('Sort button', () => {
    test('shows "DATE" when sortBy is date', () => {
      const props = createDefaultProps();
      const { getByTestId } = render(<FilterBar {...props} sortBy="date" />);
      expect(getByTestId('sort-button-text').props.children).toBe('DATE');
    });

    test('shows "NAME" when sortBy is name', () => {
      const props = createDefaultProps();
      const { getByTestId } = render(<FilterBar {...props} sortBy="name" />);
      expect(getByTestId('sort-button-text').props.children).toBe('NAME');
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
      { sortBy: 'date' as const, direction: 'asc' as const, label: 'OLD ↓' },
      { sortBy: 'date' as const, direction: 'desc' as const, label: 'NEW ↓' },
      { sortBy: 'name' as const, direction: 'asc' as const, label: 'A-Z ↓' },
      { sortBy: 'name' as const, direction: 'desc' as const, label: 'Z-A ↓' },
      { sortBy: 'abv' as const, direction: 'asc' as const, label: 'LOW ↓' },
      { sortBy: 'abv' as const, direction: 'desc' as const, label: 'HIGH ↓' },
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
    test('container "ALL" label describes next state as Draft', () => {
      const props = createDefaultProps();
      const { getByTestId } = render(<FilterBar {...props} containerFilter="all" />);
      expect(getByTestId('filter-container-button').props.accessibilityLabel).toBe(
        'Container filter: ALL. Double tap to show Draft.'
      );
    });

    test('container "DRAFT" label describes next state as Cans', () => {
      const props = createDefaultProps();
      const { getByTestId } = render(<FilterBar {...props} containerFilter="draft" />);
      expect(getByTestId('filter-container-button').props.accessibilityLabel).toBe(
        'Container filter: DRAFT. Double tap to show Cans.'
      );
    });

    test('sort "DATE" label describes next state as Name', () => {
      const props = createDefaultProps();
      const { getByTestId } = render(<FilterBar {...props} sortBy="date" />);
      expect(getByTestId('sort-toggle-button').props.accessibilityLabel).toBe(
        'Sort by DATE. Double tap to sort by Name.'
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
        'Sort: OLD. Double tap for NEW.'
      );
    });

    test('direction label for date/desc shows contextual labels', () => {
      const props = createDefaultProps();
      const { getByTestId } = render(
        <FilterBar {...props} sortBy="date" sortDirection="desc" />
      );
      expect(getByTestId('sort-direction-button').props.accessibilityLabel).toBe(
        'Sort: NEW. Double tap for OLD.'
      );
    });

    test('direction label for name/asc shows contextual labels', () => {
      const props = createDefaultProps();
      const { getByTestId } = render(
        <FilterBar {...props} sortBy="name" sortDirection="asc" />
      );
      expect(getByTestId('sort-direction-button').props.accessibilityLabel).toBe(
        'Sort: A-Z. Double tap for Z-A.'
      );
    });

    test('direction label for abv/desc shows contextual labels', () => {
      const props = createDefaultProps();
      const { getByTestId } = render(
        <FilterBar {...props} sortBy="abv" sortDirection="desc" />
      );
      expect(getByTestId('sort-direction-button').props.accessibilityLabel).toBe(
        'Sort: HIGH. Double tap for LOW.'
      );
    });
  });

  describe('Layout', () => {
    test('all buttons render as chip style', () => {
      const props = createDefaultProps();
      const { getByTestId } = render(<FilterBar {...props} />);

      const containerButton = getByTestId('filter-container-button');
      const sortButton = getByTestId('sort-toggle-button');
      const directionButton = getByTestId('sort-direction-button');

      // All chip buttons should render
      expect(containerButton).toBeTruthy();
      expect(sortButton).toBeTruthy();
      expect(directionButton).toBeTruthy();
    });
  });
});
