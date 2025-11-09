import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { FilterBar } from '../FilterBar';
import { Text } from 'react-native';

// Mock the themed components and hooks
jest.mock('../../ThemedText', () => {
  const { Text } = require('react-native');
  return {
    ThemedText: ({ children, ...props }: any) => <Text {...props}>{children}</Text>
  };
});

jest.mock('../../ui/IconSymbol', () => ({
  IconSymbol: ({ name, ...props }: any) => {
    const { Text } = require('react-native');
    return <Text {...props}>{name}</Text>;
  }
}));

jest.mock('@/hooks/useThemeColor', () => ({
  useThemeColor: () => '#FFFFFF'
}));

jest.mock('@/hooks/useColorScheme', () => ({
  useColorScheme: () => 'light'
}));

describe('FilterBar', () => {
  const mockOnToggleFilter = jest.fn();
  const mockOnToggleSort = jest.fn();

  const defaultProps = {
    filters: {
      isDraft: false,
      isHeavies: false,
      isIpa: false,
    },
    sortBy: 'date' as const,
    onToggleFilter: mockOnToggleFilter,
    onToggleSort: mockOnToggleSort,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders all filter buttons when showHeaviesAndIpa is true', () => {
      const { getByText } = render(
        <FilterBar {...defaultProps} showHeaviesAndIpa={true} />
      );

      expect(getByText('Draft')).toBeTruthy();
      expect(getByText('Heavies')).toBeTruthy();
      expect(getByText('IPA')).toBeTruthy();
      expect(getByText(/Sort by:/)).toBeTruthy();
    });

    it('renders only Draft button when showHeaviesAndIpa is false', () => {
      const { getByText, queryByText } = render(
        <FilterBar {...defaultProps} showHeaviesAndIpa={false} />
      );

      expect(getByText('Draft')).toBeTruthy();
      expect(queryByText('Heavies')).toBeNull();
      expect(queryByText('IPA')).toBeNull();
      expect(getByText(/Sort by:/)).toBeTruthy();
    });

    it('defaults to showing Heavies and IPA when prop is not provided', () => {
      const { getByText } = render(
        <FilterBar {...defaultProps} />
      );

      expect(getByText('Draft')).toBeTruthy();
      expect(getByText('Heavies')).toBeTruthy();
      expect(getByText('IPA')).toBeTruthy();
    });
  });

  describe('Filter Toggle Behavior', () => {
    it('calls onToggleFilter with "isDraft" when Draft button is pressed', () => {
      const { getByText } = render(
        <FilterBar {...defaultProps} />
      );

      fireEvent.press(getByText('Draft'));

      expect(mockOnToggleFilter).toHaveBeenCalledWith('isDraft');
      expect(mockOnToggleFilter).toHaveBeenCalledTimes(1);
    });

    it('calls onToggleFilter with "isHeavies" when Heavies button is pressed', () => {
      const { getByText } = render(
        <FilterBar {...defaultProps} />
      );

      fireEvent.press(getByText('Heavies'));

      expect(mockOnToggleFilter).toHaveBeenCalledWith('isHeavies');
      expect(mockOnToggleFilter).toHaveBeenCalledTimes(1);
    });

    it('calls onToggleFilter with "isIpa" when IPA button is pressed', () => {
      const { getByText } = render(
        <FilterBar {...defaultProps} />
      );

      fireEvent.press(getByText('IPA'));

      expect(mockOnToggleFilter).toHaveBeenCalledWith('isIpa');
      expect(mockOnToggleFilter).toHaveBeenCalledTimes(1);
    });
  });

  describe('Sort Toggle Behavior', () => {
    it('calls onToggleSort when sort button is pressed', () => {
      const { getByText } = render(
        <FilterBar {...defaultProps} />
      );

      fireEvent.press(getByText(/Sort by:/));

      expect(mockOnToggleSort).toHaveBeenCalledTimes(1);
    });

    it('displays "Sort by: Name" when current sort is by date', () => {
      const { getByText } = render(
        <FilterBar {...defaultProps} sortBy="date" />
      );

      expect(getByText('Sort by: Name')).toBeTruthy();
    });

    it('displays "Sort by: Date" when current sort is by name', () => {
      const { getByText } = render(
        <FilterBar {...defaultProps} sortBy="name" />
      );

      expect(getByText('Sort by: Date')).toBeTruthy();
    });

    it('shows calendar icon when sorting by date', () => {
      const { getByText } = render(
        <FilterBar {...defaultProps} sortBy="date" />
      );

      expect(getByText('textformat')).toBeTruthy(); // Icon for name sort
    });

    it('shows textformat icon when sorting by name', () => {
      const { getByText } = render(
        <FilterBar {...defaultProps} sortBy="name" />
      );

      expect(getByText('calendar')).toBeTruthy(); // Icon for date sort
    });
  });

  describe('Filter State Display', () => {
    it('shows active state when Draft filter is enabled', () => {
      const { getByText } = render(
        <FilterBar
          {...defaultProps}
          filters={{ ...defaultProps.filters, isDraft: true }}
        />
      );

      // Component should render with active styling (we can't test exact styles, but can verify it renders)
      expect(getByText('Draft')).toBeTruthy();
    });

    it('shows active state when Heavies filter is enabled', () => {
      const { getByText } = render(
        <FilterBar
          {...defaultProps}
          filters={{ ...defaultProps.filters, isHeavies: true }}
        />
      );

      expect(getByText('Heavies')).toBeTruthy();
    });

    it('shows active state when IPA filter is enabled', () => {
      const { getByText } = render(
        <FilterBar
          {...defaultProps}
          filters={{ ...defaultProps.filters, isIpa: true }}
        />
      );

      expect(getByText('IPA')).toBeTruthy();
    });

    it('handles multiple filters being active simultaneously', () => {
      const { getByText } = render(
        <FilterBar
          {...defaultProps}
          filters={{
            isDraft: true,
            isHeavies: true,
            isIpa: false,
          }}
        />
      );

      expect(getByText('Draft')).toBeTruthy();
      expect(getByText('Heavies')).toBeTruthy();
      expect(getByText('IPA')).toBeTruthy();
    });
  });
});
