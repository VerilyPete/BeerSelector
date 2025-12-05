/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

const tintColorLight = '#0a7ea4';
const tintColorDark = '#fff';

export const Colors = {
  light: {
    // Core
    text: '#11181C',
    textSecondary: '#57534E',
    textMuted: '#78716C',
    background: '#fff',
    backgroundSecondary: '#F5F5F0',
    backgroundElevated: '#FFFFFF',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,

    // Borders
    border: '#E7E5E4',
    borderFocused: tintColorLight,

    // Status colors
    success: '#16A34A',
    error: '#DC2626',
    warning: '#F59E0B',
    info: '#2196F3',

    // Status backgrounds (for badges, alerts)
    successBg: '#95de64',
    errorBg: '#ff7875',
    warningBg: '#ffc53d',
    infoBg: '#69c0ff',

    // Status borders
    successBorder: '#73d13d',
    errorBorder: '#ffa39e',
    warningBorder: '#ffa940',
    infoBorder: '#40a9ff',

    // UI elements
    textOnPrimary: '#FFFFFF',
    textOnStatus: '#FFFFFF', // Always white for text on colored status badges (success, error, warning, info)
    overlay: 'rgba(0, 0, 0, 0.5)',
    backgroundTertiary: 'rgba(150, 150, 150, 0.1)',

    // Brand colors
    accent: '#FFC107',
    untappd: '#FFCC00',
    link: '#0a7ea4',
    destructive: '#ff3b30',
  },
  dark: {
    // Core
    text: '#ECEDEE',
    textSecondary: '#E7E5E4',
    textMuted: '#A8A29E',
    background: '#151718',
    backgroundSecondary: '#1C1917',
    backgroundElevated: '#1a1a1a',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,

    // Borders
    border: '#333',
    borderFocused: tintColorDark,

    // Status colors
    success: '#4ADE80',
    error: '#F87171',
    warning: '#FBBF24',
    info: '#60A5FA',

    // Status backgrounds (for badges, alerts)
    successBg: '#52c41a',
    errorBg: '#ff4d4f',
    warningBg: '#d48806',
    infoBg: '#1890ff',

    // Status borders
    successBorder: '#73d13d',
    errorBorder: '#ff7875',
    warningBorder: '#faad14',
    infoBorder: '#40a9ff',

    // UI elements
    textOnPrimary: '#000000',
    textOnStatus: '#FFFFFF', // Always white for text on colored status badges (success, error, warning, info)
    overlay: 'rgba(0, 0, 0, 0.7)',
    backgroundTertiary: 'rgba(150, 150, 150, 0.1)',

    // Brand colors
    accent: '#FFC107',
    untappd: '#FFCC00',
    link: '#60A5FA',
    destructive: '#ff453a',
  },
};
