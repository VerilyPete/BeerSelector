import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';

/**
 * Breakpoint type representing device form factor
 */
export type Breakpoint = 'phone' | 'tablet' | 'tabletLandscape';

/**
 * Return type for useBreakpoint hook
 */
export interface BreakpointResult {
  /** Current breakpoint based on screen width */
  breakpoint: Breakpoint;
  /** True if device is a phone (width < 768) */
  isPhone: boolean;
  /** True if device is a tablet in portrait (768 <= width < 1024) */
  isTablet: boolean;
  /** True if device is a tablet in landscape (width >= 1024) */
  isTabletLandscape: boolean;
  /** Current screen width in pixels */
  width: number;
  /** Current screen height in pixels */
  height: number;
  /** Recommended number of columns for grid layouts */
  numColumns: number;
}

/**
 * Breakpoint thresholds in pixels
 */
const BREAKPOINTS = {
  /** Maximum width for phone devices (iPhone) */
  PHONE_MAX: 768,
  /** Maximum width for tablet portrait (iPad portrait) */
  TABLET_MAX: 1024,
} as const;

/**
 * Number of columns for each breakpoint
 */
const COLUMNS_BY_BREAKPOINT: Record<Breakpoint, number> = {
  phone: 1,
  tablet: 2,
  tabletLandscape: 3,
} as const;

/**
 * useBreakpoint - Responsive layout hook for React Native
 *
 * Determines the current device breakpoint based on screen width and provides
 * responsive layout information for building adaptive UIs across iPhone and iPad.
 *
 * Breakpoint definitions:
 * - phone: width < 768px (iPhone devices)
 * - tablet: 768px <= width < 1024px (iPad in portrait orientation)
 * - tabletLandscape: width >= 1024px (iPad in landscape orientation)
 *
 * Performance:
 * - Result is memoized to prevent unnecessary re-renders
 * - Only recalculates when window dimensions change
 *
 * @example
 * ```typescript
 * function MyComponent() {
 *   const { breakpoint, isPhone, numColumns, width } = useBreakpoint();
 *
 *   return (
 *     <FlatList
 *       data={items}
 *       numColumns={numColumns}
 *       key={numColumns} // Required when numColumns changes
 *       renderItem={({ item }) => (
 *         <View style={{ width: width / numColumns }}>
 *           {isPhone ? <CompactItem item={item} /> : <ExpandedItem item={item} />}
 *         </View>
 *       )}
 *     />
 *   );
 * }
 * ```
 *
 * @returns {BreakpointResult} Object containing breakpoint info and dimensions
 */
export function useBreakpoint(): BreakpointResult {
  const { width, height } = useWindowDimensions();

  return useMemo(() => {
    // Determine breakpoint based on width thresholds
    let breakpoint: Breakpoint;
    if (width < BREAKPOINTS.PHONE_MAX) {
      breakpoint = 'phone';
    } else if (width < BREAKPOINTS.TABLET_MAX) {
      breakpoint = 'tablet';
    } else {
      breakpoint = 'tabletLandscape';
    }

    return {
      breakpoint,
      isPhone: breakpoint === 'phone',
      isTablet: breakpoint === 'tablet',
      isTabletLandscape: breakpoint === 'tabletLandscape',
      width,
      height,
      numColumns: COLUMNS_BY_BREAKPOINT[breakpoint],
    };
  }, [width, height]);
}
