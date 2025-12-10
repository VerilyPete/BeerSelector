import { createIconSet } from '@expo/vector-icons';

/**
 * Custom icon set for beer-related glyphs
 * Uses IcoMoon-generated font with custom beer icons
 *
 * Available icons:
 * - tulip: Tulip glass for high ABV draft beers (>=8%)
 * - pint: Pint glass for regular draft beers (<8%)
 * - can: Can icon for canned beers
 * - bottle: Bottle icon for bottled beers
 * - flight: Flight icon for beer flights (4 tasting glasses)
 */

// Glyph map: icon name -> unicode code point
const glyphMap = {
  tulip: 0xf000, // normalized_tulip
  pint: 0xf001, // normalized_pint
  can: 0xf002, // normalized_can
  bottle: 0xf003, // normalized_bottle
  flight: 0xf004, // normalized_flight
};

// Create the icon set using the custom font
// Font name must match what's registered in useFonts
const BeerIcon = createIconSet(glyphMap, 'BeerIcons', 'BeerIcons.ttf');

export type BeerIconName = keyof typeof glyphMap;

export default BeerIcon;
