/**
 * ResponsiveLayout - Adaptive layout component for tablet split-view support
 *
 * Provides a responsive layout that automatically adapts between phone and tablet
 * form factors. On phones, renders children in a single pane. On tablets, renders
 * a split view with a sidebar and content area.
 *
 * Features:
 * - Automatic breakpoint detection using useBreakpoint hook
 * - Configurable sidebar width with sensible defaults per breakpoint
 * - Subtle border separator between sidebar and content
 * - Full dark mode support using ThemedView
 * - Accessible touch targets and proper semantic structure
 *
 * @example
 * ```tsx
 * // Basic usage with sidebar and content
 * <ResponsiveLayout
 *   sidebar={<NavigationMenu />}
 *   content={<DetailView />}
 * >
 *   <PhoneFallbackView />
 * </ResponsiveLayout>
 *
 * // Custom sidebar width
 * <ResponsiveLayout
 *   sidebar={<FilterPanel />}
 *   content={<BeerList />}
 *   sidebarWidth={280}
 * >
 *   <MobileFilterableList />
 * </ResponsiveLayout>
 * ```
 *
 * @module components/layout/ResponsiveLayout
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useThemeColor } from '@/hooks/useThemeColor';

import { ThemedView } from '../ThemedView';

/**
 * Default sidebar widths for each tablet breakpoint
 */
const DEFAULT_SIDEBAR_WIDTHS = {
  /** Default width for tablet portrait mode */
  tablet: 320,
  /** Default width for tablet landscape mode */
  tabletLandscape: 400,
} as const;

/**
 * Props for the ResponsiveLayout component
 */
export interface ResponsiveLayoutProps {
  /**
   * Content to render in the sidebar (left pane) on tablets.
   * Ignored on phone layouts.
   */
  sidebar?: React.ReactNode;

  /**
   * Main content to render in the content area (right pane) on tablets.
   * Ignored on phone layouts.
   */
  content?: React.ReactNode;

  /**
   * Custom width for the sidebar in pixels.
   * Defaults to 320 for tablet portrait and 400 for tablet landscape.
   * Only applies to tablet layouts.
   */
  sidebarWidth?: number;

  /**
   * Fallback content rendered on phone layouts.
   * When provided, this is rendered instead of the split view on phones.
   */
  children?: React.ReactNode;

  /**
   * Test ID for the container, useful for testing
   */
  testID?: string;
}

/**
 * ResponsiveLayout - A component that adapts between phone and tablet layouts
 *
 * On phones (width < 768px):
 * - Renders `children` as a single pane
 * - Ignores `sidebar` and `content` props
 *
 * On tablets (width >= 768px):
 * - Renders a split view with `sidebar` on the left and `content` on the right
 * - Adds a subtle border between the two panes
 * - Uses appropriate sidebar width based on orientation
 *
 * The component uses ThemedView for proper dark mode support and applies
 * consistent styling across both themes.
 *
 * @param props - Component props
 * @returns Responsive layout element
 *
 * @example
 * ```tsx
 * function BeerScreen() {
 *   const { isPhone } = useBreakpoint();
 *
 *   return (
 *     <ResponsiveLayout
 *       sidebar={<BeerCategories onSelect={handleSelect} />}
 *       content={<BeerDetails beer={selectedBeer} />}
 *     >
 *       <BeerListWithDetails />
 *     </ResponsiveLayout>
 *   );
 * }
 * ```
 */
export function ResponsiveLayout({
  sidebar,
  content,
  sidebarWidth,
  children,
  testID,
}: ResponsiveLayoutProps): React.JSX.Element {
  const { isPhone, isTabletLandscape } = useBreakpoint();
  const borderColor = useThemeColor({}, 'border');

  // Phone layout: render children as single pane
  if (isPhone) {
    return (
      <ThemedView style={styles.container} testID={testID}>
        {children}
      </ThemedView>
    );
  }

  // Determine sidebar width based on breakpoint or custom value
  const computedSidebarWidth =
    sidebarWidth ??
    (isTabletLandscape ? DEFAULT_SIDEBAR_WIDTHS.tabletLandscape : DEFAULT_SIDEBAR_WIDTHS.tablet);

  // Tablet layout: render split view with sidebar and content
  return (
    <ThemedView style={styles.container} testID={testID}>
      <View style={styles.splitContainer}>
        {/* Sidebar pane */}
        <ThemedView
          style={[
            styles.sidebarPane,
            {
              width: computedSidebarWidth,
              borderRightColor: borderColor,
            },
          ]}
          variant="secondary"
          accessibilityRole="menu"
          accessibilityLabel="Sidebar navigation"
        >
          {sidebar}
        </ThemedView>

        {/* Content pane */}
        <ThemedView style={styles.contentPane} accessibilityLabel="Main content">
          {content}
        </ThemedView>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  /**
   * Root container that fills the available space
   */
  container: {
    flex: 1,
  },

  /**
   * Horizontal flex container for the split view
   */
  splitContainer: {
    flex: 1,
    flexDirection: 'row',
  },

  /**
   * Sidebar pane with right border separator
   */
  sidebarPane: {
    borderRightWidth: StyleSheet.hairlineWidth,
  },

  /**
   * Content pane that fills remaining space
   */
  contentPane: {
    flex: 1,
  },
});
