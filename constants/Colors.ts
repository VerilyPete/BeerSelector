/**
 * Beer-Themed Color System for BeerSelector App
 *
 * The palette draws inspiration from craft beer colors (amber, stout, IPA gold)
 * while maintaining excellent contrast ratios for accessibility (WCAG 2.1 AA).
 *
 * Light mode: Warm cream backgrounds with stout-dark text
 * Dark mode: Deep rich backgrounds with cream-light text
 */

export const Colors = {
  light: {
    // Core - Beer-themed palette
    text: '#292524', // Stout Dark - Primary text
    textSecondary: '#57534E', // Stout Medium - Secondary text
    textMuted: '#78716C', // Stout Light - Tertiary text, icons
    background: '#FAFAFA', // Background Primary - Main screen backgrounds
    backgroundSecondary: '#F5F5F0', // Background Secondary - Card backgrounds, slight warmth
    backgroundElevated: '#FFFFFF', // Background Elevated - Modal backgrounds, elevated cards

    // Brand - Amber/IPA themed
    tint: '#D97706', // Amber Primary - Primary buttons, active states
    tintHover: '#B45309', // Amber Hover - Button pressed states
    accent: '#FCD34D', // IPA Gold - Highlights, badges
    accentMuted: '#FDE68A', // IPA Gold Muted - Soft highlights

    // Icons and Tab Bar
    icon: '#78716C', // Stout Light
    iconActive: '#D97706', // Amber Primary
    tabIconDefault: '#78716C', // Stout Light
    tabIconSelected: '#D97706', // Amber Primary

    // Borders
    border: '#E7E5E4', // Border Light - Card borders
    borderFocused: '#D97706', // Amber Primary

    // Status colors - Beer-inspired
    success: '#16A34A', // Hop Green - Success states, available
    error: '#DC2626', // Porter Red - Error states, alerts
    warning: '#F59E0B', // Amber warning
    info: '#2196F3', // Info blue

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
    textOnPrimary: '#FFFFFF', // Text on amber/colored buttons
    textOnStatus: '#FFFFFF', // Always white for text on colored status badges
    overlay: 'rgba(0, 0, 0, 0.4)', // Modal overlays
    backgroundTertiary: 'rgba(150, 150, 150, 0.1)',

    // Skeleton loading
    skeletonBase: '#F5F5F5',
    skeletonHighlight: '#E0E0E0',

    // Separators
    separator: 'rgba(128, 128, 128, 0.2)',

    // Brand colors
    untappd: '#FFCC00', // Untappd Yellow
    untappdPink: '#E91E63', // Untappd brand pink
    link: '#0a7ea4',
    destructive: '#ff3b30',
    visitorBadge: '#FFB74D', // Visitor mode badge

    // Glass effects
    glassTint: 'rgba(255, 255, 255, 0.7)',
  },
  dark: {
    // Core - Beer-themed palette
    text: '#FAFAF9', // Cream Light - Primary text
    textSecondary: '#E7E5E4', // Cream Medium - Secondary text
    textMuted: '#A8A29E', // Cream Muted - Tertiary text, icons
    background: '#0C0A09', // Background Primary - Main screen backgrounds
    backgroundSecondary: '#1C1917', // Background Secondary - Card backgrounds
    backgroundElevated: '#292524', // Background Elevated - Modal backgrounds, elevated cards

    // Brand - Amber/IPA themed (brighter for dark mode)
    tint: '#F59E0B', // Amber Primary - Primary buttons, active states
    tintHover: '#FBBF24', // Amber Hover - Button pressed states
    accent: '#FCD34D', // IPA Gold - Highlights, badges
    accentMuted: '#92400E', // IPA Gold Muted - Soft highlights (darker for dark mode)

    // Icons and Tab Bar
    icon: '#A8A29E', // Cream Muted
    iconActive: '#F59E0B', // Amber Primary
    tabIconDefault: '#A8A29E', // Cream Muted
    tabIconSelected: '#F59E0B', // Amber Primary

    // Borders
    border: '#44403C', // Border Dark - Card borders
    borderFocused: '#F59E0B', // Amber Primary

    // Status colors - Beer-inspired (brighter for dark mode)
    success: '#4ADE80', // Hop Green - Success states, available
    error: '#F87171', // Porter Red - Error states, alerts
    warning: '#FBBF24', // Amber warning
    info: '#60A5FA', // Info blue

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
    textOnPrimary: '#000000', // Text on amber/colored buttons
    textOnStatus: '#FFFFFF', // Always white for text on colored status badges
    overlay: 'rgba(0, 0, 0, 0.7)', // Modal overlays
    backgroundTertiary: 'rgba(150, 150, 150, 0.1)',

    // Skeleton loading
    skeletonBase: '#1C1C1E',
    skeletonHighlight: '#2C2C2E',

    // Separators
    separator: 'rgba(128, 128, 128, 0.2)',

    // Brand colors
    untappd: '#FFCC00', // Untappd Yellow
    untappdPink: '#E91E63', // Untappd brand pink
    link: '#60A5FA',
    destructive: '#ff453a',
    visitorBadge: '#FFB74D', // Visitor mode badge

    // Glass effects
    glassTint: 'rgba(0, 0, 0, 0.5)',
  },
};
