/**
 * Glass type utilities for determining appropriate glassware based on beer properties
 */

export type GlassType = 'pint' | 'tulip' | null;

/**
 * Extract ABV percentage from beer description HTML
 * @param description - HTML description string containing ABV percentage
 * @returns ABV as a number or null if not found/invalid
 */
export function extractABV(description: string | undefined): number | null {
  if (!description) return null;

  // Strip HTML tags to get plain text
  const plainText = description.replace(/<[^>]*>/g, '');

  // Look for percentage pattern (e.g., "5.2%" or "8%")
  const percentageMatch = plainText.match(/(\d+(?:\.\d+)?)\s*%/);

  if (percentageMatch && percentageMatch[1]) {
    const abv = parseFloat(percentageMatch[1]);

    // Validate it's a reasonable ABV (0-100%)
    if (!isNaN(abv) && abv >= 0 && abv <= 100) {
      return abv;
    }
  }

  return null;
}

/**
 * Determine the appropriate glass type based on container type and ABV
 * @param container - Beer container type (e.g., "Draft", "Bottled")
 * @param description - Beer description containing ABV
 * @returns Glass type or null if no icon should be displayed
 */
export function getGlassType(
  container: string | undefined,
  description: string | undefined
): GlassType {
  if (!container) return null;

  const normalizedContainer = container.toLowerCase();

  // No glyphs for bottled beers
  if (normalizedContainer.includes('bottled')) return null;

  // Only show glyphs for draft/draught beers
  const isDraft = normalizedContainer.includes('draft') || normalizedContainer.includes('draught');

  if (!isDraft) return null;

  // Extract ABV from description
  const abv = extractABV(description);
  if (abv === null) return null;

  // Tulip glass for 8-18% ABV
  if (abv >= 8 && abv <= 18) return 'tulip';

  // Pint glass for < 8% ABV
  if (abv < 8) return 'pint';

  // No icon for > 18% ABV
  return null;
}
