/**
 * Spacing scale for consistent margins and padding
 * Based on 4px base unit
 */
export const spacing = {
  /** 0px - No spacing */
  none: 0,
  /** 4px - Extra small spacing */
  xs: 4,
  /** 8px - Small spacing */
  s: 8,
  /** 12px - Small-medium spacing */
  sm: 12,
  /** 16px - Medium spacing (default) */
  m: 16,
  /** 20px - Medium-large spacing */
  ml: 20,
  /** 24px - Large spacing */
  l: 24,
  /** 32px - Extra large spacing */
  xl: 32,
  /** 48px - Extra extra large spacing */
  xxl: 48,
} as const;

export type SpacingKey = keyof typeof spacing;
