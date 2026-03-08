import React from 'react';
import { render } from '@testing-library/react-native';

import { MetricCard } from '../MetricCard';
import { Colors } from '@/constants/Colors';

const colors = Colors.dark;

describe('MetricCard', () => {
  describe('Tasted count display', () => {
    test('displays tastedCount number', () => {
      const { getByText } = render(<MetricCard tastedCount={42} colors={colors} />);
      expect(getByText('42')).toBeTruthy();
    });

    test('displays "/200" denominator', () => {
      const { getByText } = render(<MetricCard tastedCount={42} colors={colors} />);
      expect(getByText('/200')).toBeTruthy();
    });
  });

  describe('Progress label', () => {
    test('shows "0.0% UFO CLUB PROGRESS" at 0 beers', () => {
      const { getByText } = render(<MetricCard tastedCount={0} colors={colors} />);
      expect(getByText('0.0% UFO CLUB PROGRESS')).toBeTruthy();
    });

    test('shows "50.0% UFO CLUB PROGRESS" at 100 beers', () => {
      const { getByText } = render(<MetricCard tastedCount={100} colors={colors} />);
      expect(getByText('50.0% UFO CLUB PROGRESS')).toBeTruthy();
    });

    test('shows "100.0% UFO CLUB PROGRESS" at 200 beers', () => {
      const { getByText } = render(<MetricCard tastedCount={200} colors={colors} />);
      expect(getByText('100.0% UFO CLUB PROGRESS')).toBeTruthy();
    });

    test('progress capped at 100% for counts greater than 200', () => {
      const { getByText } = render(<MetricCard tastedCount={250} colors={colors} />);
      expect(getByText('100.0% UFO CLUB PROGRESS')).toBeTruthy();
    });
  });

  describe('Progress fill width', () => {
    test('progress fill width is "0%" at 0 beers', () => {
      const { getByTestId } = render(<MetricCard tastedCount={0} colors={colors} />);
      const fill = getByTestId('metric-progress-fill');
      const flatStyle = Array.isArray(fill.props.style)
        ? Object.assign({}, ...fill.props.style)
        : fill.props.style;
      expect(flatStyle?.width).toBe('0%');
    });

    test('progress fill width is "50%" at 100 beers', () => {
      const { getByTestId } = render(<MetricCard tastedCount={100} colors={colors} />);
      const fill = getByTestId('metric-progress-fill');
      const flatStyle = Array.isArray(fill.props.style)
        ? Object.assign({}, ...fill.props.style)
        : fill.props.style;
      expect(flatStyle?.width).toBe('50%');
    });

    test('progress fill width capped at "100%" for counts greater than 200', () => {
      const { getByTestId } = render(<MetricCard tastedCount={250} colors={colors} />);
      const fill = getByTestId('metric-progress-fill');
      const flatStyle = Array.isArray(fill.props.style)
        ? Object.assign({}, ...fill.props.style)
        : fill.props.style;
      expect(flatStyle?.width).toBe('100%');
    });
  });

  describe('Ghost segment', () => {
    test('ghost segment always displays "888"', () => {
      const { getByText } = render(<MetricCard tastedCount={0} colors={colors} />);
      expect(getByText('888')).toBeTruthy();
    });
  });
});
