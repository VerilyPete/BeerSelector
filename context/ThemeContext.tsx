import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { ThemeProvider as RestyleThemeProvider } from '@shopify/restyle';
import { Theme, theme, darkTheme } from '@/constants/theme';

// Context for accessing theme utilities
interface ThemeContextValue {
  /** Current color scheme ('light' or 'dark') */
  colorScheme: 'light' | 'dark';
  /** Whether the app is in dark mode */
  isDark: boolean;
  /** The current restyle theme object */
  theme: Theme;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
  /** Force a specific color scheme (useful for testing) */
  forcedColorScheme?: 'light' | 'dark';
}

/**
 * ThemeProvider wraps the app with @shopify/restyle's ThemeProvider
 * and provides additional theme utilities via context.
 *
 * This provider automatically switches between light and dark themes
 * based on the device's color scheme setting.
 *
 * @example
 * ```tsx
 * // In _layout.tsx
 * import { ThemeProvider } from '@/context/ThemeContext';
 *
 * export default function RootLayout() {
 *   return (
 *     <ThemeProvider>
 *       <Stack />
 *     </ThemeProvider>
 *   );
 * }
 * ```
 */
export function ThemeProvider({ children, forcedColorScheme }: ThemeProviderProps) {
  const systemColorScheme = useColorScheme();
  const colorScheme = forcedColorScheme ?? systemColorScheme ?? 'light';
  const isDark = colorScheme === 'dark';
  const currentTheme = isDark ? darkTheme : theme;

  const contextValue = useMemo<ThemeContextValue>(
    () => ({
      colorScheme,
      isDark,
      theme: currentTheme,
    }),
    [colorScheme, isDark, currentTheme]
  );

  return (
    <ThemeContext.Provider value={contextValue}>
      <RestyleThemeProvider theme={currentTheme}>{children}</RestyleThemeProvider>
    </ThemeContext.Provider>
  );
}

/**
 * Hook to access theme utilities.
 *
 * @returns ThemeContextValue with colorScheme, isDark, and theme
 * @throws Error if used outside of ThemeProvider
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { isDark, colorScheme } = useAppTheme();
 *
 *   return (
 *     <Text>Current mode: {isDark ? 'Dark' : 'Light'}</Text>
 *   );
 * }
 * ```
 */
export function useAppTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);

  if (context === undefined) {
    throw new Error('useAppTheme must be used within a ThemeProvider');
  }

  return context;
}

// Re-export theme types and values for convenience
export { Theme, theme, darkTheme };
