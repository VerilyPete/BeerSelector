import { renderHook } from '@testing-library/react-hooks';
import { useThemeColor } from '../useThemeColor';
import { Colors } from '@/constants/Colors';

// Mock the useColorScheme hook
jest.mock('@/hooks/useColorScheme', () => ({
  useColorScheme: jest.fn()
}));

describe('useThemeColor', () => {
  const useColorSchemeMock = require('@/hooks/useColorScheme').useColorScheme;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns light theme color when theme is light', () => {
    useColorSchemeMock.mockReturnValue('light');
    
    const { result } = renderHook(() => useThemeColor({}, 'text'));
    
    expect(result.current).toBe(Colors.light.text);
  });

  it('returns dark theme color when theme is dark', () => {
    useColorSchemeMock.mockReturnValue('dark');
    
    const { result } = renderHook(() => useThemeColor({}, 'text'));
    
    expect(result.current).toBe(Colors.dark.text);
  });

  it('returns light prop color when provided and theme is light', () => {
    useColorSchemeMock.mockReturnValue('light');
    
    const { result } = renderHook(() => 
      useThemeColor({ light: '#FF0000', dark: '#00FF00' }, 'text')
    );
    
    expect(result.current).toBe('#FF0000');
  });

  it('returns dark prop color when provided and theme is dark', () => {
    useColorSchemeMock.mockReturnValue('dark');
    
    const { result } = renderHook(() => 
      useThemeColor({ light: '#FF0000', dark: '#00FF00' }, 'text')
    );
    
    expect(result.current).toBe('#00FF00');
  });

  it('defaults to light theme when useColorScheme returns null', () => {
    useColorSchemeMock.mockReturnValue(null);
    
    const { result } = renderHook(() => useThemeColor({}, 'text'));
    
    expect(result.current).toBe(Colors.light.text);
  });
});
