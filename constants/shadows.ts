import { ViewStyle } from 'react-native';

/**
 * Shadow presets for consistent elevation
 */
export const shadows = {
  /** No shadow */
  none: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  } as ViewStyle,

  /** Subtle shadow for cards (elevation 2) */
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  } as ViewStyle,

  /** Default card shadow (elevation 4) */
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  } as ViewStyle,

  /** Prominent shadow for modals (elevation 8) */
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  } as ViewStyle,

  /** Strong shadow for floating elements (elevation 12) */
  xl: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 12,
  } as ViewStyle,
} as const;

export type ShadowKey = keyof typeof shadows;

/**
 * Get shadow with theme-aware opacity adjustment for dark mode
 */
export function getShadow(key: ShadowKey, isDark: boolean = false): ViewStyle {
  const shadow = shadows[key];
  // Cast to number since we know our shadow definitions use numeric opacity values
  const opacity = shadow.shadowOpacity as number | undefined;
  if (isDark && opacity !== undefined && opacity > 0) {
    return {
      ...shadow,
      shadowOpacity: opacity * 1.5, // Stronger shadows in dark mode
    };
  }
  return shadow;
}
