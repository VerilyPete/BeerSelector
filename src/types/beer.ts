/**
 * Types related to beer data in the application
 */

import { ContainerType } from '@/src/utils/beerGlassType';

/**
 * Valid enrichment source values
 * - 'description': ABV parsed from brew_description HTML
 * - 'perplexity': ABV fetched from Perplexity API
 * - 'manual': ABV manually verified/entered
 * - null: Not yet enriched
 */
export type EnrichmentSource = 'description' | 'perplexity' | 'manual' | null;

/**
 * Base Beer type representing a beer in the system
 */
export type Beer = {
  id: string;
  brew_name: string;
  brewer?: string;
  brewer_loc?: string;
  brew_style?: string;
  brew_container?: string;
  review_count?: string;
  review_rating?: string;
  brew_description?: string;
  added_date?: string;
  abv?: number | null;
  // Enrichment fields (from Cloudflare Worker)
  enrichment_confidence?: number | null;
  enrichment_source?: EnrichmentSource;
};

/**
 * Beer with container type property (after database fetch)
 * The container_type field is always present after schema v4 migration,
 * but its value can be null for beers where we can't determine the container:
 * - Draft beers without detectable ABV or 13oz/16oz size marker
 * - Container types we don't recognize
 *
 * Container types: 'pint', 'tulip', 'can', 'bottle', 'flight', or null (no icon shown)
 *
 * Enrichment fields are inherited from Beer and explicitly typed here for clarity.
 */
export type BeerWithContainerType = Beer & {
  container_type: ContainerType; // Field present, value can be null
  // Enrichment fields explicitly typed (inherited from Beer, made required with nullable values)
  enrichment_confidence: number | null;
  enrichment_source: EnrichmentSource;
};

/**
 * Beerfinder type representing a tasted beer with additional properties
 */
export type Beerfinder = Beer & {
  roh_lap?: string;
  tasted_date?: string;
  review_ratings?: string;
  chit_code?: string;
};

/**
 * Beerfinder with container type (after database fetch)
 * Combines Beerfinder properties with container_type property
 * (container_type can be null for unrecognized container types)
 *
 * Enrichment fields are inherited and explicitly typed here for clarity.
 */
export type BeerfinderWithContainerType = BeerWithContainerType & {
  roh_lap?: string;
  tasted_date?: string;
  review_ratings?: string;
  chit_code?: string;
};

/**
 * CheckInRequestData type for beer check-in requests
 */
export type CheckInRequestData = {
  chitCode: string;
  chitBrewId: string;
  chitBrewName: string;
  chitStoreName: string;
};

/**
 * CheckInResponse type for beer check-in responses
 */
export type CheckInResponse = {
  success: boolean;
  message?: string;
  rawResponse?: string;
  error?: string;
};

/**
 * Type guard to check if an object is a Beer
 * @param obj The object to check
 * @returns True if the object is a Beer, false otherwise
 */
export function isBeer(obj: unknown): obj is Beer {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;

  // Required fields
  if (typeof o.id !== 'string' || typeof o.brew_name !== 'string') {
    return false;
  }

  // Validate enrichment_source if present
  if (o.enrichment_source !== undefined && o.enrichment_source !== null) {
    if (
      o.enrichment_source !== 'description' &&
      o.enrichment_source !== 'perplexity' &&
      o.enrichment_source !== 'manual'
    ) {
      return false;
    }
  }

  // Validate enrichment_confidence if present (should be number or null)
  if (o.enrichment_confidence !== undefined && o.enrichment_confidence !== null) {
    if (typeof o.enrichment_confidence !== 'number') {
      return false;
    }
  }

  return true;
}

