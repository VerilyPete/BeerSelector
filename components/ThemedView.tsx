import { View, type ViewProps } from 'react-native';

import { useThemeColor } from '@/hooks/useThemeColor';

export type ThemedViewVariant = 'default' | 'secondary' | 'elevated';

export type ThemedViewProps = ViewProps & {
  variant?: ThemedViewVariant;
  lightColor?: string;
  darkColor?: string;
};

const variantToColorKey: Record<
  ThemedViewVariant,
  'background' | 'backgroundSecondary' | 'backgroundElevated'
> = {
  default: 'background',
  secondary: 'backgroundSecondary',
  elevated: 'backgroundElevated',
};

export function ThemedView({
  style,
  variant = 'default',
  lightColor,
  darkColor,
  ...otherProps
}: ThemedViewProps) {
  const colorKey = variantToColorKey[variant];
  const backgroundColor = useThemeColor({ light: lightColor, dark: darkColor }, colorKey);

  return <View style={[{ backgroundColor }, style]} {...otherProps} />;
}
