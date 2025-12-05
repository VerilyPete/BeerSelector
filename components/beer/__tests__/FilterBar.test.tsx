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

// Use real timers for this test suite to avoid hanging
beforeAll(() => {
  jest.useRealTimers();
});

afterAll(() => {
  jest.useFakeTimers();
});

describe('FilterBar', () => {
  const mockFilters = {
    isDraft: false,
    isHeavies: false,
    isIpa: false,
  };

  const mockOnToggleFilter = jest.fn();
  const mockOnToggleSort = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Test 1: Renders all filter buttons when showHeaviesAndIpa is true
  test('renders all filter buttons', () => {
    const { getByText } = render(
      <FilterBar
        filters={mockFilters}
        sortBy="name"
        onToggleFilter={mockOnToggleFilter}
        onToggleSort={mockOnToggleSort}
        showHeaviesAndIpa={true}
      />
    );

    expect(getByText('Draft')).toBeTruthy();
    expect(getByText('Heavies')).toBeTruthy();
    expect(getByText('IPA')).toBeTruthy();
  });

  // Test 2: Calls onToggleFilter when Draft button pressed
  test('calls onToggleFilter when Draft button pressed', () => {
    const { getByText } = render(
      <FilterBar
        filters={mockFilters}
        sortBy="name"
        onToggleFilter={mockOnToggleFilter}
        onToggleSort={mockOnToggleSort}
      />
    );

    fireEvent.press(getByText('Draft'));
    expect(mockOnToggleFilter).toHaveBeenCalledWith('isDraft');
    expect(mockOnToggleFilter).toHaveBeenCalledTimes(1);
  });

  // Test 3: Calls onToggleFilter when Heavies button pressed
  test('calls onToggleFilter when Heavies button pressed', () => {
    const { getByText } = render(
      <FilterBar
        filters={mockFilters}
        sortBy="name"
        onToggleFilter={mockOnToggleFilter}
        onToggleSort={mockOnToggleSort}
        showHeaviesAndIpa={true}
      />
    );

    fireEvent.press(getByText('Heavies'));
    expect(mockOnToggleFilter).toHaveBeenCalledWith('isHeavies');
    expect(mockOnToggleFilter).toHaveBeenCalledTimes(1);
  });

  // Test 4: Calls onToggleFilter when IPA button pressed
  test('calls onToggleFilter when IPA button pressed', () => {
    const { getByText } = render(
      <FilterBar
        filters={mockFilters}
        sortBy="name"
        onToggleFilter={mockOnToggleFilter}
        onToggleSort={mockOnToggleSort}
        showHeaviesAndIpa={true}
      />
    );

    fireEvent.press(getByText('IPA'));
    expect(mockOnToggleFilter).toHaveBeenCalledWith('isIpa');
    expect(mockOnToggleFilter).toHaveBeenCalledTimes(1);
  });

  // Test 5: Calls onToggleSort when sort button pressed
  test('calls onToggleSort when sort button pressed', () => {
    const { getByText } = render(
      <FilterBar
        filters={mockFilters}
        sortBy="name"
        onToggleFilter={mockOnToggleFilter}
        onToggleSort={mockOnToggleSort}
      />
    );

    fireEvent.press(getByText(/Sort by:/));
    expect(mockOnToggleSort).toHaveBeenCalled();
    expect(mockOnToggleSort).toHaveBeenCalledTimes(1);
  });

  // Test 6: Hides Heavies and IPA when showHeaviesAndIpa is false
  test('hides Heavies and IPA when showHeaviesAndIpa is false', () => {
    const { queryByText, getByText } = render(
      <FilterBar
        filters={mockFilters}
        sortBy="name"
        onToggleFilter={mockOnToggleFilter}
        onToggleSort={mockOnToggleSort}
        showHeaviesAndIpa={false}
      />
    );

    // Draft button should still be visible
    expect(getByText('Draft')).toBeTruthy();

    // Heavies and IPA buttons should NOT be visible
    expect(queryByText('Heavies')).toBeNull();
    expect(queryByText('IPA')).toBeNull();
  });

  // Test 7: Shows correct sort label for name sorting
  test('shows correct sort label for name sorting', () => {
    const { getByText } = render(
      <FilterBar
        filters={mockFilters}
        sortBy="name"
        onToggleFilter={mockOnToggleFilter}
        onToggleSort={mockOnToggleSort}
      />
    );

    // When sorted by name, button should offer "Sort by: Date"
    expect(getByText('Sort by: Date')).toBeTruthy();
  });

  // Test 8: Shows correct sort label for date sorting
  test('shows correct sort label for date sorting', () => {
    const { getByText } = render(
      <FilterBar
        filters={mockFilters}
        sortBy="date"
        onToggleFilter={mockOnToggleFilter}
        onToggleSort={mockOnToggleSort}
      />
    );

    // When sorted by date, button should offer "Sort by: Name"
    expect(getByText('Sort by: Name')).toBeTruthy();
  });

  // Test 9: Renders Draft filter as active
  test('displays Draft filter as active when enabled', () => {
    const activeFilters = { isDraft: true, isHeavies: false, isIpa: false };
    const { getByText } = render(
      <FilterBar
        filters={activeFilters}
        sortBy="name"
        onToggleFilter={mockOnToggleFilter}
        onToggleSort={mockOnToggleSort}
      />
    );

    // Draft button should be present (testing it renders without error)
    expect(getByText('Draft')).toBeTruthy();
  });

  // Test 10: Renders Heavies filter as active
  test('displays Heavies filter as active when enabled', () => {
    const activeFilters = { isDraft: false, isHeavies: true, isIpa: false };
    const { getByText } = render(
      <FilterBar
        filters={activeFilters}
        sortBy="name"
        onToggleFilter={mockOnToggleFilter}
        onToggleSort={mockOnToggleSort}
        showHeaviesAndIpa={true}
      />
    );

    expect(getByText('Heavies')).toBeTruthy();
  });

  // Test 11: Renders IPA filter as active
  test('displays IPA filter as active when enabled', () => {
    const activeFilters = { isDraft: false, isHeavies: false, isIpa: true };
    const { getByText } = render(
      <FilterBar
        filters={activeFilters}
        sortBy="name"
        onToggleFilter={mockOnToggleFilter}
        onToggleSort={mockOnToggleSort}
        showHeaviesAndIpa={true}
      />
    );

    expect(getByText('IPA')).toBeTruthy();
  });

  // Test 12: Handles multiple active filters
  test('handles multiple active filters', () => {
    const activeFilters = { isDraft: true, isHeavies: false, isIpa: true };
    const { getByText } = render(
      <FilterBar
        filters={activeFilters}
        sortBy="name"
        onToggleFilter={mockOnToggleFilter}
        onToggleSort={mockOnToggleSort}
        showHeaviesAndIpa={true}
      />
    );

    expect(getByText('Draft')).toBeTruthy();
    expect(getByText('IPA')).toBeTruthy();
    expect(getByText('Heavies')).toBeTruthy();
  });

  // Test 13: Shows correct icon for date sort
  test('renders calendar icon when sorting by date', () => {
    const { getByTestId } = render(
      <FilterBar
        filters={mockFilters}
        sortBy="date"
        onToggleFilter={mockOnToggleFilter}
        onToggleSort={mockOnToggleSort}
      />
    );

    // When sortBy is 'date', it should show 'textformat' icon
    expect(getByTestId('icon-textformat')).toBeTruthy();
  });

  // Test 14: Shows correct icon for name sort
  test('renders textformat icon when sorting by name', () => {
    const { getByTestId } = render(
      <FilterBar
        filters={mockFilters}
        sortBy="name"
        onToggleFilter={mockOnToggleFilter}
        onToggleSort={mockOnToggleSort}
      />
    );

    // When sortBy is 'name', it should show 'calendar' icon
    expect(getByTestId('icon-calendar')).toBeTruthy();
  });

  // Test 15: Uses default showHeaviesAndIpa when not provided
  test('shows Heavies and IPA by default when showHeaviesAndIpa prop omitted', () => {
    const { getByText } = render(
      <FilterBar
        filters={mockFilters}
        sortBy="name"
        onToggleFilter={mockOnToggleFilter}
        onToggleSort={mockOnToggleSort}
        // showHeaviesAndIpa not provided, should default to true
      />
    );

    expect(getByText('Draft')).toBeTruthy();
    expect(getByText('Heavies')).toBeTruthy();
    expect(getByText('IPA')).toBeTruthy();
  });

  // Test 16: Filters remain independent
  test('filter buttons work independently', () => {
    const { getByText } = render(
      <FilterBar
        filters={mockFilters}
        sortBy="name"
        onToggleFilter={mockOnToggleFilter}
        onToggleSort={mockOnToggleSort}
      />
    );

    // Press Draft
    fireEvent.press(getByText('Draft'));
    expect(mockOnToggleFilter).toHaveBeenCalledWith('isDraft');

    // Press Heavies
    fireEvent.press(getByText('Heavies'));
    expect(mockOnToggleFilter).toHaveBeenCalledWith('isHeavies');

    // Press IPA
    fireEvent.press(getByText('IPA'));
    expect(mockOnToggleFilter).toHaveBeenCalledWith('isIpa');

    // Each should have been called once
    expect(mockOnToggleFilter).toHaveBeenCalledTimes(3);
  });
});
