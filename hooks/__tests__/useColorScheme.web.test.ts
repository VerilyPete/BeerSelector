import { renderHook, act } from '@testing-library/react-hooks';
import { useColorScheme } from '../useColorScheme.web';

// Mock the React Native useColorScheme hook
jest.mock('react-native', () => ({
  useColorScheme: jest.fn()
}));

describe('useColorScheme (web)', () => {
  const useRNColorSchemeMock = require('react-native').useColorScheme;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns light theme before hydration', () => {
    useRNColorSchemeMock.mockReturnValue('dark');
    
    const { result } = renderHook(() => useColorScheme());
    
    // Before hydration, it should return 'light' regardless of the actual theme
    expect(result.current).toBe('light');
  });

  it('returns the actual color scheme after hydration', () => {
    useRNColorSchemeMock.mockReturnValue('dark');
    
    const { result } = renderHook(() => useColorScheme());
    
    // Simulate hydration by triggering the useEffect
    act(() => {
      jest.runAllTimers();
    });
    
    // After hydration, it should return the actual theme from React Native
    expect(result.current).toBe('dark');
  });

  it('returns light theme when React Native returns null', () => {
    useRNColorSchemeMock.mockReturnValue(null);
    
    const { result } = renderHook(() => useColorScheme());
    
    // Simulate hydration
    act(() => {
      jest.runAllTimers();
    });
    
    // When React Native returns null, it should still return the actual value (null)
    // The null-coalescing operator in useThemeColor will handle the fallback to 'light'
    expect(result.current).toBe(null);
  });

  it('updates when the color scheme changes', () => {
    useRNColorSchemeMock.mockReturnValue('light');
    
    const { result, rerender } = renderHook(() => useColorScheme());
    
    // Simulate hydration
    act(() => {
      jest.runAllTimers();
    });
    
    expect(result.current).toBe('light');
    
    // Change the color scheme
    useRNColorSchemeMock.mockReturnValue('dark');
    
    // Rerender the hook
    rerender();
    
    // It should now return the new color scheme
    expect(result.current).toBe('dark');
  });
});
