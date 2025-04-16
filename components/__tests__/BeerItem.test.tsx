import React from 'react';
import { render } from '@testing-library/react-native';
import BeerItem from '../BeerItem';

// Mock the navigation prop
const mockNavigation = {
  navigate: jest.fn(),
};

describe('BeerItem', () => {
  it('renders correctly with minimal props', () => {
    const beer = {
      id: 'beer-123',
      brew_name: 'Test Beer',
    };
    
    const { getByText } = render(
      <BeerItem beer={beer} navigation={mockNavigation as any} />
    );
    
    // Check that the beer name is displayed
    expect(getByText('Test Beer')).toBeTruthy();
  });
  
  it('renders correctly with full props', () => {
    const beer = {
      id: 'beer-123',
      brew_name: 'Test Beer',
      brewer: 'Test Brewery',
      brew_style: 'IPA',
      review_rating: '4.5',
    };
    
    const { getByText } = render(
      <BeerItem beer={beer} navigation={mockNavigation as any} />
    );
    
    // Check that all the beer details are displayed
    expect(getByText('Test Beer')).toBeTruthy();
    expect(getByText('Test Brewery')).toBeTruthy();
    expect(getByText('IPA')).toBeTruthy();
  });
});
