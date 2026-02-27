import { getContainerType, extractABV, ContainerType } from '@/src/utils/beerGlassType';
import { Beer, BeerWithContainerType, EnrichmentSource } from '@/src/types/beer';

/**
 * Return type for calculateContainerType function
 * Explicitly includes all fields for type safety
 */
type BeerWithContainerTypeAndEnrichment = Beer & {
  container_type: ContainerType;
  abv: number | null;
  enrichment_confidence: number | null;
  enrichment_source: EnrichmentSource;
};

/**
 * Calculate and assign container type and ABV to a beer object
 * Returns new object with container_type, abv, and enrichment properties
 *
 * If beer already has enriched ABV (from Worker), use that.
 * Otherwise, extract ABV from description.
 *
 * Enrichment fields are passed through if present.
 */
export function calculateContainerType(beer: Beer): BeerWithContainerTypeAndEnrichment {
  // Use enriched ABV from Worker if available, otherwise extract from description for display only
  const displayAbv = beer.abv ?? extractABV(beer.brew_description);

  // container_type uses displayAbv (best available for icon)
  const containerType = getContainerType(
    beer.brew_container,
    beer.brew_description,
    beer.brew_style,
    beer.brew_name,
    displayAbv
  );

  return {
    ...beer,
    container_type: containerType,
    abv: beer.abv ?? null, // only persist Worker-sourced ABV
    // Pass through enrichment fields, defaulting to null if not present
    enrichment_confidence: beer.enrichment_confidence ?? null,
    enrichment_source: beer.enrichment_source ?? null,
  };
}

/**
 * Calculate container types and ABV for an array of beers
 * Used in data sync to pre-compute before insertion
 *
 * Returns BeerWithContainerType[] to match repository type signatures
 *
 * If beer already has enriched ABV (from Worker), use that.
 * Otherwise, extract ABV from description.
 *
 * Enrichment fields are passed through if present.
 */
export function calculateContainerTypes(beers: Beer[]): BeerWithContainerType[] {
  return beers.map((beer): BeerWithContainerType => {
    // Use enriched ABV from Worker if available, otherwise extract from description for display only
    const displayAbv = beer.abv ?? extractABV(beer.brew_description);

    // container_type uses displayAbv (best available for icon)
    const containerType = getContainerType(
      beer.brew_container,
      beer.brew_description,
      beer.brew_style,
      beer.brew_name,
      displayAbv
    );

    return {
      ...beer,
      container_type: containerType,
      abv: beer.abv ?? null, // only persist Worker-sourced ABV
      // Pass through enrichment fields, defaulting to null if not present
      enrichment_confidence: beer.enrichment_confidence ?? null,
      enrichment_source: beer.enrichment_source ?? null,
    };
  });
}
