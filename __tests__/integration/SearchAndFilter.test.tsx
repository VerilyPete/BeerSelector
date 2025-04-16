import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { SearchBar } from '../../components/SearchBar';
import { getAllBeers, searchBeers } from '../../src/database/db';

// Mock the database module
jest.mock('../../src/database/db', () => ({
  getAllBeers: jest.fn(),
  searchBeers: jest.fn()
}));

// Mock the useThemeColor hook
jest.mock('@/hooks/useThemeColor', () => ({
  useThemeColor: jest.fn().mockImplementation((props, colorName) => {
    if (colorName === 'background') return '#f5f5f5';
    if (colorName === 'text') return '#000000';
    return '#000000';
  }),
}));

// Mock the IconSymbol component
jest.mock('../../components/ui/IconSymbol', () => ({
  IconSymbol: ({ name, size, color, style }) => {
    return { name, size, color, style, testID: `icon-${name}` };
  },
}));

describe('Search and Filter Integration', () => {
  const mockBeers = [
    {
      id: 'beer-1',
      brew_name: 'Test IPA',
      brewer: 'Test Brewery',
      brew_style: 'IPA'
    },
    {
      id: 'beer-2',
      brew_name: 'Test Stout',
      brewer: 'Another Brewery',
      brew_style: 'Stout'
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    (getAllBeers as jest.Mock).mockResolvedValue(mockBeers);
    (searchBeers as jest.Mock).mockImplementation(async (query) => {
      if (!query) return mockBeers;
      return mockBeers.filter(beer => 
        beer.brew_name.toLowerCase().includes(query.toLowerCase()) ||
        beer.brewer.toLowerCase().includes(query.toLowerCase()) ||
        beer.brew_style.toLowerCase().includes(query.toLowerCase())
      );
    });
  });

  it('should search beers when text is entered', async () => {
    // Create a component that uses SearchBar and the database
    const TestComponent = () => {
      const [searchText, setSearchText] = React.useState('');
      const [beers, setBeers] = React.useState<any[]>([]);
      
      React.useEffect(() => {
        const loadBeers = async () => {
          if (!searchText.trim()) {
            const allBeers = await getAllBeers();
            setBeers(allBeers);
          } else {
            const filteredBeers = await searchBeers(searchText);
            setBeers(filteredBeers);
          }
        };
        
        loadBeers();
      }, [searchText]);
      
      return (
        <>
          <SearchBar 
            searchText={searchText} 
            onSearchChange={setSearchText} 
            onClear={() => setSearchText('')} 
          />
          {beers.map(beer => (
            <div key={beer.id} data-testid={`beer-${beer.id}`}>
              {beer.brew_name} - {beer.brew_style}
            </div>
          ))}
        </>
      );
    };
    
    const { getByPlaceholderText, findByTestId } = render(<TestComponent />);
    
    // Initially, getAllBeers should be called
    await waitFor(() => {
      expect(getAllBeers).toHaveBeenCalled();
    });
    
    // Enter search text
    const searchInput = getByPlaceholderText('Search beers...');
    fireEvent.changeText(searchInput, 'IPA');
    
    // searchBeers should be called with the search text
    await waitFor(() => {
      expect(searchBeers).toHaveBeenCalledWith('IPA');
    });
    
    // Only the IPA beer should be displayed
    await findByTestId('beer-beer-1');
    expect(() => findByTestId('beer-beer-2')).rejects.toThrow();
  });

  it('should clear search and show all beers when clear button is pressed', async () => {
    // Create a component that uses SearchBar and the database
    const TestComponent = () => {
      const [searchText, setSearchText] = React.useState('IPA');
      const [beers, setBeers] = React.useState<any[]>([]);
      
      React.useEffect(() => {
        const loadBeers = async () => {
          if (!searchText.trim()) {
            const allBeers = await getAllBeers();
            setBeers(allBeers);
          } else {
            const filteredBeers = await searchBeers(searchText);
            setBeers(filteredBeers);
          }
        };
        
        loadBeers();
      }, [searchText]);
      
      return (
        <>
          <SearchBar 
            searchText={searchText} 
            onSearchChange={setSearchText} 
            onClear={() => setSearchText('')} 
          />
          {beers.map(beer => (
            <div key={beer.id} data-testid={`beer-${beer.id}`}>
              {beer.brew_name} - {beer.brew_style}
            </div>
          ))}
        </>
      );
    };
    
    const { getByTestId, findByTestId } = render(<TestComponent />);
    
    // Initially, searchBeers should be called with 'IPA'
    await waitFor(() => {
      expect(searchBeers).toHaveBeenCalledWith('IPA');
    });
    
    // Only the IPA beer should be displayed
    await findByTestId('beer-beer-1');
    
    // Press the clear button
    const clearButton = getByTestId('clear-button');
    fireEvent.press(clearButton);
    
    // getAllBeers should be called
    await waitFor(() => {
      expect(getAllBeers).toHaveBeenCalled();
    });
    
    // Both beers should be displayed
    await findByTestId('beer-beer-1');
    await findByTestId('beer-beer-2');
  });
});
