import { Text, type TextProps, StyleSheet, type TextStyle } from 'react-native';

import { useThemeColor } from '@/hooks/useThemeColor';

export type ThemedTextType =
  | 'default'
  | 'title'
  | 'defaultSemiBold'
  | 'subtitle'
  | 'link'
  | 'muted'
  | 'secondary';

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?: ThemedTextType;
};

// Map text types to their corresponding color tokens
const typeToColorKey: Record<ThemedTextType, 'text' | 'textMuted' | 'textSecondary' | 'link'> = {
  default: 'text',
  title: 'text',
  defaultSemiBold: 'text',
  subtitle: 'text',
  link: 'link',
  muted: 'textMuted',
  secondary: 'textSecondary',
};

// Styles must be defined before typeStyles
const styles = StyleSheet.create({
  default: {
    fontSize: 16,
    lineHeight: 24,
  },
  defaultSemiBold: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    lineHeight: 32,
  },
  subtitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  link: {
    lineHeight: 30,
    fontSize: 16,
    // Color is now applied dynamically via useThemeColor with 'link' token
  },
  muted: {
    fontSize: 14,
    lineHeight: 20,
  },
  secondary: {
    fontSize: 16,
    lineHeight: 24,
  },
});

// Style lookup map for O(1) style resolution (avoids multiple conditionals in render)
const typeStyles: Record<ThemedTextType, TextStyle> = {
  default: styles.default,
  title: styles.title,
  defaultSemiBold: styles.defaultSemiBold,
  subtitle: styles.subtitle,
  link: styles.link,
  muted: styles.muted,
  secondary: styles.secondary,
};

export function ThemedText({
  style,
  lightColor,
  darkColor,
  type = 'default',
  ...rest
}: ThemedTextProps) {
  const colorKey = typeToColorKey[type];
  const color = useThemeColor({ light: lightColor, dark: darkColor }, colorKey);

  return <Text style={[{ color }, typeStyles[type], style]} {...rest} />;
}
