/**
 * Container type utilities for determining appropriate serving vessel based on beer properties
 *
 * Container types:
 * - 'pint': Pint glass for regular draft beers (<7.4% ABV)
 * - 'tulip': Tulip glass for high ABV draft beers (>=7.4%)
 * - 'can': Can icon for canned beers
 * - 'bottle': Bottle icon for bottled beers
 * - 'flight': Flight icon for beer flights (4 tasting glasses)
 * - null: No icon displayed
 */

export type ContainerType = 'pint' | 'tulip' | 'can' | 'bottle' | 'flight' | null;

// Legacy alias for backwards compatibility
export type GlassType = 'pint' | 'tulip' | null;

/**
 * Extract ABV percentage from beer description HTML
 * Supports multiple formats:
 * - "5.2%" or "8%"
 * - "5.2 ABV" or "ABV 5.2"
 * - "5.2% ABV" or "ABV: 5.2%"
 * @param description - HTML description string containing ABV percentage
 * @returns ABV as a number or null if not found/invalid
 */
export function extractABV(description: string | undefined): number | null {
  if (!description) return null;

  // Strip HTML tags to get plain text
  const plainText = description.replace(/<[^>]*>/g, '');

  // Try multiple patterns in order of specificity

  // Pattern 1: Look for percentage pattern (e.g., "5.2%" or "8%")
  // Negative lookahead to avoid matching negative numbers
  const percentageMatch = plainText.match(/(?<!-)\b(\d+(?:\.\d+)?)\s*%/);
  if (percentageMatch && percentageMatch[1]) {
    const abv = parseFloat(percentageMatch[1]);
    if (!isNaN(abv) && abv >= 0 && abv <= 100) {
      return abv;
    }
  }

  // Pattern 2: Look for "ABV" near a number (e.g., "5.2 ABV", "ABV 5.2", "ABV: 5.2")
  // Negative lookahead to avoid matching negative numbers
  const abvPattern = /(?:ABV[:\s]*(?<!-)\b(\d+(?:\.\d+)?)|(?<!-)\b(\d+(?:\.\d+)?)\s*ABV)/i;
  const abvMatch = plainText.match(abvPattern);

  if (abvMatch) {
    // Match could be in group 1 (ABV first) or group 2 (number first)
    const abvString = abvMatch[1] || abvMatch[2];
    if (abvString) {
      const abv = parseFloat(abvString);
      if (!isNaN(abv) && abv >= 0 && abv <= 100) {
        return abv;
      }
    }
  }

  return null;
}

/**
 * Determine the appropriate container type based on container type and ABV
 * Rules (in priority order):
 * 1. Flight detection:
 *    - Name contains "flight" (word boundary) OR style equals "flight"
 *    - AND container is draft/draught/flight/empty/null → 'flight'
 * 2. Can detection:
 *    - Container contains "can" → 'can'
 * 3. Bottle detection:
 *    - Container contains "bottle" or "bottled" → 'bottle'
 * 4. Draft/Draught detection with glass type:
 *    a. Container size override:
 *       - "13oz draft" or "13 oz draft" → 'tulip' (skip ABV detection)
 *       - "16oz draft" or "16 oz draft" → 'pint' (skip ABV detection)
 *    b. ABV-based detection (for other draft beers):
 *       - ABV < 7.4% → 'pint'
 *       - ABV >= 7.4% → 'tulip'
 *    c. Beer style keyword fallback (if all other checks fail):
 *       - Style contains "pilsner" or "lager" → 'pint'
 *       - Style contains "imperial", "tripel", "quad", or "barleywine" → 'tulip'
 * 5. No icon shown for:
 *    - Non-draft containers without can/bottle
 *    - Draft beers without detectable ABV and no style keywords
 * @param container - Beer container type (e.g., "Draft", "13oz draft", "Can", "Bottled")
 * @param description - Beer description containing ABV
 * @param brewStyle - Beer style (e.g., "Imperial IPA", "Belgian Tripel", "Barleywine", "Flight")
 * @param brewName - Beer name (optional, used for flight detection)
 * @param abv - Pre-extracted ABV value (optional, if not provided will extract from description)
 * @returns Container type or null if no icon should be displayed
 */
export function getContainerType(
  container: string | undefined,
  description: string | undefined,
  brewStyle?: string,
  brewName?: string,
  abv?: number | null
): ContainerType {
  // Flight detection (highest priority for draft/empty containers)
  const isFlightByName = brewName && /\bflight\b/i.test(brewName);
  const isFlightByStyle = brewStyle?.toLowerCase() === 'flight';

  if (isFlightByName || isFlightByStyle) {
    const normalizedContainer = container?.toLowerCase() ?? '';
    const isFlightContainer =
      !container ||
      normalizedContainer === '' ||
      normalizedContainer.includes('draft') ||
      normalizedContainer.includes('draught') ||
      normalizedContainer.includes('flight');
    if (isFlightContainer) {
      return 'flight';
    }
  }

  if (!container) return null;

  const normalizedContainer = container.toLowerCase();

  // Check for can first (highest priority for non-draft)
  if (normalizedContainer.includes('can')) {
    return 'can';
  }

  // Check for bottle/bottled
  if (normalizedContainer.includes('bottle')) {
    return 'bottle';
  }

  // Check for draft/draught beers with glass type detection
  const isDraft = normalizedContainer.includes('draft') || normalizedContainer.includes('draught');

  if (!isDraft) return null;

  // Check for specific container sizes (skip ABV detection)
  // Match both "13oz" and "13 oz" (with or without space)
  if (normalizedContainer.includes('13oz') || normalizedContainer.includes('13 oz')) {
    return 'tulip';
  }
  if (normalizedContainer.includes('16oz') || normalizedContainer.includes('16 oz')) {
    return 'pint';
  }

  // Use provided ABV or extract from description
  const resolvedAbv = abv !== undefined ? abv : extractABV(description);
  if (resolvedAbv !== null) {
    // Tulip glass for >= 7.4% ABV
    if (resolvedAbv >= 7.4) return 'tulip';

    // Pint glass for < 7.4% ABV
    if (resolvedAbv < 7.4) return 'pint';
  }

  // Fallback: Check beer style for specific keywords
  if (brewStyle) {
    const normalizedStyle = brewStyle.toLowerCase();

    // Check for pint glass styles first
    const pintStyleKeywords = ['pilsner', 'lager'];
    for (const keyword of pintStyleKeywords) {
      if (normalizedStyle.includes(keyword)) {
        return 'pint';
      }
    }

    // Then check for tulip glass styles
    const tulipStyleKeywords = ['imperial', 'tripel', 'quad', 'barleywine'];
    for (const keyword of tulipStyleKeywords) {
      if (normalizedStyle.includes(keyword)) {
        return 'tulip';
      }
    }
  }

  return null;
}

/**
 * Legacy function - use getContainerType instead
 * @deprecated Use getContainerType which also handles can/bottle containers
 */
export function getGlassType(
  container: string | undefined,
  description: string | undefined,
  brewStyle?: string
): GlassType {
  const containerType = getContainerType(container, description, brewStyle);
  // Only return pint/tulip for glass types (legacy behavior)
  if (containerType === 'pint' || containerType === 'tulip') {
    return containerType;
  }
  return null;
}
