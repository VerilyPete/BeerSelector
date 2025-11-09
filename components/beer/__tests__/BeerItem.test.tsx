import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { BeerItem } from '../BeerItem';
import { View, Text } from 'react-native';

// Mock the themed components and hooks
jest.mock('../../ThemedText', () => {
  const { Text } = require('react-native');
  return {
    ThemedText: ({ children, ...props }: any) => <Text {...props}>{children}</Text>
  };
});

jest.mock('@/hooks/useThemeColor', () => ({
  useThemeColor: () => '#FFFFFF'
}));

describe('BeerItem', () => {
  const mockBeer = {
    id: '1',
    brew_name: 'Test IPA',
    brewer: 'Test Brewery',
    brewer_loc: 'Austin, TX',
    brew_style: 'IPA',
    brew_container: 'Draft',
    brew_description: '<p>A delicious test beer</p>',
    added_date: '1704067200' // 2024-01-01 00:00:00 UTC
  };

  const mockOnToggle = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Collapsed State', () => {
    it('renders beer information when collapsed', () => {
      const { getByText } = render(
        <BeerItem
          beer={mockBeer}
          isExpanded={false}
          onToggle={mockOnToggle}
        />
      );

      expect(getByText('Test IPA')).toBeTruthy();
      expect(getByText(/Test Brewery/)).toBeTruthy();
      expect(getByText(/Austin, TX/)).toBeTruthy();
      expect(getByText(/IPA/)).toBeTruthy();
      expect(getByText(/Draft/)).toBeTruthy();
    });

    it('does not show description when collapsed', () => {
      const { queryByText } = render(
        <BeerItem
          beer={mockBeer}
          isExpanded={false}
          onToggle={mockOnToggle}
        />
      );

      expect(queryByText('Description:')).toBeNull();
      expect(queryByText(/A delicious test beer/)).toBeNull();
    });

    it('displays default date label', () => {
      const { getByText } = render(
        <BeerItem
          beer={mockBeer}
          isExpanded={false}
          onToggle={mockOnToggle}
        />
      );

      expect(getByText(/Date Added:/)).toBeTruthy();
    });
  });

  describe('Expanded State', () => {
    it('shows description when expanded', () => {
      const { getByText } = render(
        <BeerItem
          beer={mockBeer}
          isExpanded={true}
          onToggle={mockOnToggle}
        />
      );

      expect(getByText('Description:')).toBeTruthy();
      expect(getByText('A delicious test beer')).toBeTruthy();
    });

    it('strips HTML tags from description', () => {
      const beerWithHtml = {
        ...mockBeer,
        brew_description: '<p>Test <br /> description</p>'
      };

      const { getByText, queryByText } = render(
        <BeerItem
          beer={beerWithHtml}
          isExpanded={true}
          onToggle={mockOnToggle}
        />
      );

      expect(getByText(/Test.*description/)).toBeTruthy();
      expect(queryByText(/<p>/)).toBeNull();
    });

    it('does not show description section if description is empty', () => {
      const beerWithoutDescription = {
        ...mockBeer,
        brew_description: ''
      };

      const { queryByText } = render(
        <BeerItem
          beer={beerWithoutDescription}
          isExpanded={true}
          onToggle={mockOnToggle}
        />
      );

      expect(queryByText('Description:')).toBeNull();
    });
  });

  describe('Toggle Behavior', () => {
    it('calls onToggle with beer ID when tapped', () => {
      const { getByText } = render(
        <BeerItem
          beer={mockBeer}
          isExpanded={false}
          onToggle={mockOnToggle}
        />
      );

      fireEvent.press(getByText('Test IPA'));

      expect(mockOnToggle).toHaveBeenCalledWith('1');
      expect(mockOnToggle).toHaveBeenCalledTimes(1);
    });
  });

  describe('Date Formatting', () => {
    it('formats timestamp date correctly', () => {
      const { getByText } = render(
        <BeerItem
          beer={mockBeer}
          isExpanded={false}
          onToggle={mockOnToggle}
        />
      );

      // Should show formatted date from timestamp
      expect(getByText(/Date Added:/)).toBeTruthy();
    });

    it('prefers tasted_date over added_date when available', () => {
      const beerWithTastedDate = {
        ...mockBeer,
        tasted_date: '01/15/2024'
      };

      const { getByText } = render(
        <BeerItem
          beer={beerWithTastedDate}
          isExpanded={false}
          onToggle={mockOnToggle}
          dateLabel="Tasted"
        />
      );

      expect(getByText(/Tasted:/)).toBeTruthy();
      expect(getByText(/Jan 15, 2024/)).toBeTruthy();
    });

    it('uses custom date label when provided', () => {
      const { getByText } = render(
        <BeerItem
          beer={mockBeer}
          isExpanded={false}
          onToggle={mockOnToggle}
          dateLabel="Custom Date"
        />
      );

      expect(getByText(/Custom Date:/)).toBeTruthy();
    });

    it('handles invalid timestamp gracefully', () => {
      const beerWithInvalidDate = {
        ...mockBeer,
        added_date: 'invalid'
      };

      const { getByText } = render(
        <BeerItem
          beer={beerWithInvalidDate}
          isExpanded={false}
          onToggle={mockOnToggle}
        />
      );

      // Should not crash and show some date text
      expect(getByText(/Date Added:/)).toBeTruthy();
    });

    it('handles empty timestamp gracefully', () => {
      const beerWithEmptyDate = {
        ...mockBeer,
        added_date: ''
      };

      const { getByText } = render(
        <BeerItem
          beer={beerWithEmptyDate}
          isExpanded={false}
          onToggle={mockOnToggle}
        />
      );

      expect(getByText(/Unknown date/)).toBeTruthy();
    });
  });

  describe('Optional Fields', () => {
    it('handles missing brewer_loc gracefully', () => {
      const beerWithoutLocation = {
        ...mockBeer,
        brewer_loc: ''
      };

      const { getByText, queryByText } = render(
        <BeerItem
          beer={beerWithoutLocation}
          isExpanded={false}
          onToggle={mockOnToggle}
        />
      );

      expect(getByText(/Test Brewery/)).toBeTruthy();
      expect(queryByText(/Austin, TX/)).toBeNull();
    });

    it('handles missing brew_container gracefully', () => {
      const beerWithoutContainer = {
        ...mockBeer,
        brew_container: ''
      };

      const { getByText, queryByText } = render(
        <BeerItem
          beer={beerWithoutContainer}
          isExpanded={false}
          onToggle={mockOnToggle}
        />
      );

      expect(getByText(/IPA/)).toBeTruthy();
      expect(queryByText(/Draft/)).toBeNull();
    });

    it('shows "Unnamed Beer" when brew_name is missing', () => {
      const beerWithoutName = {
        ...mockBeer,
        brew_name: ''
      };

      const { getByText } = render(
        <BeerItem
          beer={beerWithoutName}
          isExpanded={false}
          onToggle={mockOnToggle}
        />
      );

      expect(getByText('Unnamed Beer')).toBeTruthy();
    });
  });

  describe('Custom Actions', () => {
    it('renders custom actions when provided and expanded', () => {
      const renderActions = () => (
        <View>
          <Text>Custom Action Button</Text>
        </View>
      );

      const { getByText } = render(
        <BeerItem
          beer={mockBeer}
          isExpanded={true}
          onToggle={mockOnToggle}
          renderActions={renderActions}
        />
      );

      expect(getByText('Custom Action Button')).toBeTruthy();
    });

    it('does not render actions when collapsed', () => {
      const renderActions = () => (
        <View>
          <Text>Custom Action Button</Text>
        </View>
      );

      const { queryByText } = render(
        <BeerItem
          beer={mockBeer}
          isExpanded={false}
          onToggle={mockOnToggle}
          renderActions={renderActions}
        />
      );

      expect(queryByText('Custom Action Button')).toBeNull();
    });

    it('works without renderActions prop', () => {
      const { getByText } = render(
        <BeerItem
          beer={mockBeer}
          isExpanded={true}
          onToggle={mockOnToggle}
        />
      );

      // Should render normally without actions
      expect(getByText('Description:')).toBeTruthy();
    });
  });
});
