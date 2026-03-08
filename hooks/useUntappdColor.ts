import { useColorScheme } from './useColorScheme';
import { Colors } from '@/constants/Colors';

export function useUntappdColor(): string {
  const colorScheme = useColorScheme() ?? 'dark';
  const colors = Colors[colorScheme];

  return colorScheme === 'dark' ? '#E91E63' : colors.tint;
}
