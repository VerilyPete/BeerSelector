/**
 * BeerSelector Color System — Red Accent Dark Theme
 *
 * Dark mode: Near-black backgrounds with red (#FF0000) accent
 * Light mode: Clean whites with muted red accent
 *
 * Design variable mapping:
 *   $bg-primary     → background
 *   $bg-elevated    → backgroundSecondary
 *   $bg-active      → backgroundElevated
 *   $border-primary → border
 *   $border-divider → separator
 *   $text-primary   → text
 *   $text-secondary → textSecondary
 *   $accent-red     → tint
 */

export const Colors = {
  light: {
    text: '#1A1A1A',
    textSecondary: '#666666',
    textMuted: '#999999',
    background: '#FFFFFF',
    backgroundSecondary: '#F5F5F5',
    backgroundElevated: '#E5E5E5',

    tint: '#DC2626',
    tintHover: '#B91C1C',
    accent: '#FF0000',
    accentMuted: '#FECACA',

    icon: '#999999',
    iconActive: '#DC2626',
    tabIconDefault: '#999999',
    tabIconSelected: '#DC2626',

    border: '#E5E5E5',
    borderFocused: '#DC2626',

    success: '#16A34A',
    error: '#DC2626',
    warning: '#F59E0B',
    info: '#2196F3',

    successBg: '#DCFCE7',
    errorBg: '#FEE2E2',
    warningBg: '#FEF3C7',
    infoBg: '#DBEAFE',

    successBorder: '#86EFAC',
    errorBorder: '#FCA5A5',
    warningBorder: '#FCD34D',
    infoBorder: '#93C5FD',

    textOnPrimary: '#FFFFFF',
    textOnStatus: '#FFFFFF',
    overlay: 'rgba(0, 0, 0, 0.4)',
    backgroundTertiary: 'rgba(150, 150, 150, 0.1)',

    skeletonBase: '#F5F5F5',
    skeletonHighlight: '#E0E0E0',

    separator: '#E5E5E5',

    untappd: '#FFCC00',
    untappdPink: '#E91E63',
    link: '#DC2626',
    destructive: '#DC2626',
    visitorBadge: '#FFB74D',

    glassTint: 'rgba(255, 255, 255, 0.7)',
  },
  dark: {
    text: '#FFFFFF',
    textSecondary: '#666666',
    textMuted: '#888888',
    background: '#0C0C0C',
    backgroundSecondary: '#1A1A1A',
    backgroundElevated: '#333333',

    tint: '#FF0000',
    tintHover: '#CC0000',
    accent: '#FF0000',
    accentMuted: '#330000',

    icon: '#666666',
    iconActive: '#FF0000',
    tabIconDefault: '#666666',
    tabIconSelected: '#FF0000',

    border: '#333333',
    borderFocused: '#FF0000',

    success: '#4ADE80',
    error: '#F87171',
    warning: '#FBBF24',
    info: '#60A5FA',

    successBg: '#052e16',
    errorBg: '#450a0a',
    warningBg: '#451a03',
    infoBg: '#172554',

    successBorder: '#22c55e',
    errorBorder: '#ef4444',
    warningBorder: '#f59e0b',
    infoBorder: '#3b82f6',

    textOnPrimary: '#0C0C0C',
    textOnStatus: '#FFFFFF',
    overlay: 'rgba(0, 0, 0, 0.7)',
    backgroundTertiary: 'rgba(150, 150, 150, 0.1)',

    skeletonBase: '#1A1A1A',
    skeletonHighlight: '#333333',

    separator: '#1A1A1A',

    untappd: '#FFCC00',
    untappdPink: '#E91E63',
    link: '#FF0000',
    destructive: '#FF0000',
    visitorBadge: '#FFB74D',

    glassTint: 'rgba(0, 0, 0, 0.5)',
  },
};
