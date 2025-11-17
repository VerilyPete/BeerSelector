import { useThemeColor } from './useThemeColor';
import { useColorScheme } from './useColorScheme';

/**
 * Returns the Untappd brand color appropriate for current theme
 * - Dark mode: Uses Untappd brand pink (#E91E63)
 * - Light mode: Uses the active button/tint color from theme
 *
 * This hook centralizes the Untappd button color logic to ensure
 * consistency across all components (AllBeers, Beerfinder, UntappdWebView, Settings).
 *
 * @returns The appropriate Untappd button color for the current theme
 */
export function useUntappdColor(): string {
  const activeButtonColor = useThemeColor({}, 'tint');
  const colorScheme = useColorScheme() ?? 'light';

  return colorScheme === 'dark' ? '#E91E63' : activeButtonColor;
}
