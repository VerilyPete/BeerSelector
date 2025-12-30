import { TextStyle } from 'react-native';

/**
 * Typography scale for consistent text styling
 */
export const typography = {
  /** Large headers (28px) */
  header: {
    fontSize: 28,
    fontWeight: '700' as TextStyle['fontWeight'],
    lineHeight: 36,
  },
  /** Section headers (20px) */
  subheader: {
    fontSize: 20,
    fontWeight: '600' as TextStyle['fontWeight'],
    lineHeight: 28,
  },
  /** Card titles (18px) */
  title: {
    fontSize: 18,
    fontWeight: '600' as TextStyle['fontWeight'],
    lineHeight: 24,
  },
  /** Body text (16px) */
  body: {
    fontSize: 16,
    fontWeight: '400' as TextStyle['fontWeight'],
    lineHeight: 24,
  },
  /** Secondary body (14px) */
  bodySmall: {
    fontSize: 14,
    fontWeight: '400' as TextStyle['fontWeight'],
    lineHeight: 20,
  },
  /** Captions and labels (12px) */
  caption: {
    fontSize: 12,
    fontWeight: '400' as TextStyle['fontWeight'],
    lineHeight: 16,
  },
  /** Button text (16px, medium weight) */
  button: {
    fontSize: 16,
    fontWeight: '500' as TextStyle['fontWeight'],
    lineHeight: 24,
  },
} as const;

export type TypographyKey = keyof typeof typography;
