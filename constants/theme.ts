import { createTheme } from '@shopify/restyle';
import { Colors } from './Colors';

// Define the base theme with light colors
const theme = createTheme({
  colors: {
    // Core colors
    text: Colors.light.text,
    textSecondary: Colors.light.textSecondary,
    textMuted: Colors.light.textMuted,
    background: Colors.light.background,
    backgroundSecondary: Colors.light.backgroundSecondary,
    backgroundElevated: Colors.light.backgroundElevated,
    backgroundTertiary: Colors.light.backgroundTertiary,

    // Brand/accent colors
    tint: Colors.light.tint,
    accent: Colors.light.accent,
    untappd: Colors.light.untappd,
    link: Colors.light.link,
    destructive: Colors.light.destructive,

    // Icon colors
    icon: Colors.light.icon,
    tabIconDefault: Colors.light.tabIconDefault,
    tabIconSelected: Colors.light.tabIconSelected,

    // Border colors
    border: Colors.light.border,
    borderFocused: Colors.light.borderFocused,

    // Status colors
    success: Colors.light.success,
    error: Colors.light.error,
    warning: Colors.light.warning,
    info: Colors.light.info,

    // Status backgrounds
    successBg: Colors.light.successBg,
    errorBg: Colors.light.errorBg,
    warningBg: Colors.light.warningBg,
    infoBg: Colors.light.infoBg,

    // Status borders
    successBorder: Colors.light.successBorder,
    errorBorder: Colors.light.errorBorder,
    warningBorder: Colors.light.warningBorder,
    infoBorder: Colors.light.infoBorder,

    // UI elements
    textOnPrimary: Colors.light.textOnPrimary,
    textOnStatus: Colors.light.textOnStatus,
    overlay: Colors.light.overlay,

    // Special values for shadows and transparency
    transparent: 'transparent',
    black: '#000000',
    white: '#FFFFFF',
  },
  spacing: {
    none: 0,
    xs: 4,
    s: 8,
    sm: 12,
    m: 16,
    ml: 20,
    l: 24,
    xl: 32,
    xxl: 48,
  },
  borderRadii: {
    none: 0,
    xs: 2,
    s: 4,
    m: 8,
    l: 16,
    xl: 24,
    full: 9999,
  },
  textVariants: {
    defaults: {
      fontSize: 16,
      lineHeight: 24,
      color: 'text',
    },
    header: {
      fontSize: 28,
      fontWeight: 'bold',
      lineHeight: 36,
      color: 'text',
    },
    subheader: {
      fontSize: 20,
      fontWeight: '600',
      lineHeight: 28,
      color: 'text',
    },
    body: {
      fontSize: 16,
      lineHeight: 24,
      color: 'text',
    },
    bodySmall: {
      fontSize: 14,
      lineHeight: 20,
      color: 'text',
    },
    caption: {
      fontSize: 12,
      lineHeight: 16,
      color: 'textMuted',
    },
    label: {
      fontSize: 14,
      fontWeight: '500',
      lineHeight: 20,
      color: 'textSecondary',
    },
    button: {
      fontSize: 16,
      fontWeight: '600',
      lineHeight: 24,
      color: 'textOnPrimary',
    },
    link: {
      fontSize: 16,
      lineHeight: 24,
      color: 'link',
    },
  },
  cardVariants: {
    defaults: {
      backgroundColor: 'backgroundSecondary',
      borderRadius: 'l',
      padding: 'm',
    },
    elevated: {
      backgroundColor: 'backgroundElevated',
      borderRadius: 'l',
      padding: 'm',
      shadowColor: 'black',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 12,
      elevation: 4,
    },
    outlined: {
      backgroundColor: 'background',
      borderRadius: 'l',
      padding: 'm',
      borderWidth: 1,
      borderColor: 'border',
    },
    flat: {
      backgroundColor: 'backgroundTertiary',
      borderRadius: 'm',
      padding: 'm',
    },
  },
  buttonVariants: {
    defaults: {
      backgroundColor: 'tint',
      borderRadius: 'm',
      paddingVertical: 's',
      paddingHorizontal: 'm',
    },
    primary: {
      backgroundColor: 'tint',
      borderRadius: 'm',
      paddingVertical: 's',
      paddingHorizontal: 'm',
    },
    secondary: {
      backgroundColor: 'backgroundSecondary',
      borderRadius: 'm',
      paddingVertical: 's',
      paddingHorizontal: 'm',
      borderWidth: 1,
      borderColor: 'border',
    },
    destructive: {
      backgroundColor: 'destructive',
      borderRadius: 'm',
      paddingVertical: 's',
      paddingHorizontal: 'm',
    },
    ghost: {
      backgroundColor: 'transparent',
      borderRadius: 'm',
      paddingVertical: 's',
      paddingHorizontal: 'm',
    },
  },
  inputVariants: {
    defaults: {
      backgroundColor: 'background',
      borderRadius: 'm',
      borderWidth: 1,
      borderColor: 'border',
      paddingVertical: 's',
      paddingHorizontal: 'm',
    },
    filled: {
      backgroundColor: 'backgroundSecondary',
      borderRadius: 'm',
      borderWidth: 0,
      paddingVertical: 's',
      paddingHorizontal: 'm',
    },
    outlined: {
      backgroundColor: 'transparent',
      borderRadius: 'm',
      borderWidth: 1,
      borderColor: 'border',
      paddingVertical: 's',
      paddingHorizontal: 'm',
    },
  },
});

// Create dark theme by overriding colors
const darkTheme: Theme = {
  ...theme,
  colors: {
    // Core colors
    text: Colors.dark.text,
    textSecondary: Colors.dark.textSecondary,
    textMuted: Colors.dark.textMuted,
    background: Colors.dark.background,
    backgroundSecondary: Colors.dark.backgroundSecondary,
    backgroundElevated: Colors.dark.backgroundElevated,
    backgroundTertiary: Colors.dark.backgroundTertiary,

    // Brand/accent colors
    tint: Colors.dark.tint,
    accent: Colors.dark.accent,
    untappd: Colors.dark.untappd,
    link: Colors.dark.link,
    destructive: Colors.dark.destructive,

    // Icon colors
    icon: Colors.dark.icon,
    tabIconDefault: Colors.dark.tabIconDefault,
    tabIconSelected: Colors.dark.tabIconSelected,

    // Border colors
    border: Colors.dark.border,
    borderFocused: Colors.dark.borderFocused,

    // Status colors
    success: Colors.dark.success,
    error: Colors.dark.error,
    warning: Colors.dark.warning,
    info: Colors.dark.info,

    // Status backgrounds
    successBg: Colors.dark.successBg,
    errorBg: Colors.dark.errorBg,
    warningBg: Colors.dark.warningBg,
    infoBg: Colors.dark.infoBg,

    // Status borders
    successBorder: Colors.dark.successBorder,
    errorBorder: Colors.dark.errorBorder,
    warningBorder: Colors.dark.warningBorder,
    infoBorder: Colors.dark.infoBorder,

    // UI elements
    textOnPrimary: Colors.dark.textOnPrimary,
    textOnStatus: Colors.dark.textOnStatus,
    overlay: Colors.dark.overlay,

    // Special values for shadows and transparency
    transparent: 'transparent',
    black: '#000000',
    white: '#FFFFFF',
  },
};

// Export theme type for use throughout the app
export type Theme = typeof theme;

// Export themes
export { theme, darkTheme };
