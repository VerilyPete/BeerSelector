/**
 * BeerSelector Color System — Robocop Industrial Theme
 *
 * Dark mode: Near-black backgrounds with cyan glow (#00FFD0) accent
 * Inspired by OCP's industrial aesthetic: steel panels, CRT displays, dystopian Detroit
 *
 * Design variable mapping (from Pencil):
 *   $bg-black         → background (#0A0A0A)
 *   $display-black    → backgroundSecondary (#0D1117)
 *   $bezel-dark       → backgroundElevated (#1A1D22)
 *   $bezel-edge       → border (#2A2E35)
 *   $steel-dark       → separator (#3A3F47)
 *   $steel-mid        → textSecondary (#8A919A)
 *   $steel-bright     → text (#C8CDD3)
 *   $display-glow     → tint (#00FFD0)
 *   $display-amber    → amber (#FFB300) — action buttons
 *   $accent-red       → destructive (#FF3333)
 */

export const Colors = {
  light: {
    text: '#1A1A1A',
    textSecondary: '#5A6069',
    textMuted: '#8A919A',
    background: '#E8ECF0',
    backgroundSecondary: '#D4D8DD',
    backgroundElevated: '#C8CDD3',
    backgroundActive: '#A0A7B0',

    tint: '#00B396',
    tintHover: '#009980',
    accent: '#00B396',
    accentMuted: '#00B39620',

    amber: '#CC8F00',
    amberDim: '#CC8F0033',
    amberWell: '#1A1200',
    amberBorderOuter: '#CC8F0080',
    amberBorderInner: '#33280080',

    icon: '#5A6069',
    iconActive: '#00B396',
    tabIconDefault: '#5A6069',
    tabIconSelected: '#00B396',

    border: '#C8CDD3',
    borderFocused: '#00B396',

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

    textOnPrimary: '#0A0A0A',
    textOnStatus: '#FFFFFF',
    overlay: 'rgba(0, 0, 0, 0.4)',
    backgroundTertiary: 'rgba(150, 150, 150, 0.1)',

    skeletonBase: '#D4D8DD',
    skeletonHighlight: '#C8CDD3',

    steelBezel: '#8A919A',
    steelBezelBorder: 'rgba(255, 255, 255, 0.25)',
    chromeBar: '#B8BFC7',
    chromeBarBorder: 'rgba(255, 255, 255, 0.2)',
    steelLabelPlate: '#8A919A',
    steelLabelBorder: 'rgba(90, 96, 105, 0.25)',
    progressTrack: '#C0C7CE',

    separator: '#C8CDD3',

    untappd: '#FFCC00',
    untappdPink: '#E91E63',
    link: '#00B396',
    destructive: '#DC2626',
    visitorBadge: '#FFB74D',

    glassTint: 'rgba(255, 255, 255, 0.7)',
  },
  dark: {
    text: '#C8CDD3',
    textSecondary: '#8A919A',
    textMuted: '#5A6069',
    background: '#0A0A0A',
    backgroundSecondary: '#0D1117',
    backgroundElevated: '#1A1D22',
    backgroundActive: '#2A2E35',

    tint: '#00FFD0',
    tintHover: '#00CCB0',
    accent: '#00FFD0',
    accentMuted: '#00FFD044',

    amber: '#FFB300',
    amberDim: '#FFB30033',
    amberWell: '#1A1200',
    amberBorderOuter: '#FFE08280',
    amberBorderInner: '#33280080',

    icon: '#5A6069',
    iconActive: '#00FFD0',
    tabIconDefault: '#3A3F47',
    tabIconSelected: '#00FFD0',

    border: '#2A2E35',
    borderFocused: '#00FFD0',

    success: '#00FFD0',
    error: '#FF3333',
    warning: '#FFB300',
    info: '#60A5FA',

    successBg: '#00FFD015',
    errorBg: '#FF333315',
    warningBg: '#FFB30015',
    infoBg: '#172554',

    successBorder: '#00FFD044',
    errorBorder: '#FF333344',
    warningBorder: '#FFB30044',
    infoBorder: '#3b82f6',

    textOnPrimary: '#0A0A0A',
    textOnStatus: '#FFFFFF',
    overlay: 'rgba(0, 0, 0, 0.8)',
    backgroundTertiary: 'rgba(150, 150, 150, 0.05)',

    skeletonBase: '#0D1117',
    skeletonHighlight: '#1A1D22',

    steelBezel: '#6B727B',
    steelBezelBorder: 'rgba(255, 255, 255, 0.25)',
    steelLabelPlate: '#5A6069',
    steelLabelBorder: 'rgba(160, 167, 176, 0.25)',
    chromeBar: '#8A919A',
    chromeBarBorder: 'rgba(255, 255, 255, 0.15)',
    progressTrack: '#1A2A2A',

    separator: '#1A1D22',

    untappd: '#FFCC00',
    untappdPink: '#E91E63',
    link: '#00FFD0',
    destructive: '#FF3333',
    visitorBadge: '#FFB300',

    glassTint: 'rgba(0, 0, 0, 0.6)',
  },
};

export const CHROME_GRADIENT = ['#8A919A', '#B8BFC7', '#8A919A'] as const;
