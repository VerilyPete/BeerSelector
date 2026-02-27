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
 * BeerDetails type for detailed beer information
 * Note: abv is inherited from Beer as number | null, not overridden as string
 */
export type BeerDetails = Beer & {
  ibu?: string;
  availability?: string;
  seasonal?: boolean;
  origin_country?: string;
  untappd_rating?: string;
  untappd_ratings_count?: number;
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

/**
 * Type guard to check if an object is a Beerfinder
 * @param obj The object to check
 * @returns True if the object is a Beerfinder, false otherwise
 */
export function isBeerfinder(obj: unknown): obj is Beerfinder {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Beer & Record<string, unknown>;
  return (
    isBeer(obj) &&
    (o.roh_lap !== undefined ||
      o.tasted_date !== undefined ||
      o.review_ratings !== undefined ||
      o.chit_code !== undefined)
  );
}

/**
 * Type guard to check if an object is a BeerDetails
 * @param obj The object to check
 * @returns True if the object is a BeerDetails, false otherwise
 */
export function isBeerDetails(obj: unknown): obj is BeerDetails {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Beer & Record<string, unknown>;
  return (
    isBeer(obj) &&
    (o.abv !== undefined ||
      o.ibu !== undefined ||
      o.availability !== undefined ||
      o.seasonal !== undefined ||
      o.origin_country !== undefined ||
      o.untappd_rating !== undefined ||
      o.untappd_ratings_count !== undefined)
  );
}

/**
 * Type guard to check if an object is a BeerWithContainerType
 * @param obj The object to check
 * @returns True if the object is a BeerWithContainerType, false otherwise
 */
export function isBeerWithContainerType(obj: unknown): obj is BeerWithContainerType {
  if (!isBeer(obj)) return false;

  // Check for container_type property (not on Beer, but required for BeerWithContainerType)
  if (!('container_type' in obj)) return false;

  const validTypes: readonly (string | null)[] = ['pint', 'tulip', 'can', 'bottle', 'flight', null];
  const containerType = (obj as { container_type: unknown }).container_type;
  if (typeof containerType !== 'string' && containerType !== null) return false;
  if (!validTypes.includes(containerType)) return false;

  // Enrichment fields must be present (can be null)
  if (!('enrichment_confidence' in obj) || !('enrichment_source' in obj)) {
    return false;
  }

  // Validate enrichment_source value if not null
  const source = (obj as { enrichment_source: unknown }).enrichment_source;
  if (source !== null) {
    if (source !== 'description' && source !== 'perplexity' && source !== 'manual') {
      return false;
    }
  }

  return true;
}

/**
 * Type guard to check if an object is a BeerfinderWithContainerType
 * @param obj The object to check
 * @returns True if the object is a BeerfinderWithContainerType, false otherwise
 */
export function isBeerfinderWithContainerType(obj: unknown): obj is BeerfinderWithContainerType {
  if (!isBeerWithContainerType(obj)) return false;
  if (!isBeerfinder(obj)) return false;
  return true;
}

/**
 * Type guard to check if an object is a CheckInResponse
 * @param obj The object to check
 * @returns True if the object is a CheckInResponse, false otherwise
 */
export function isCheckInResponse(obj: unknown): obj is CheckInResponse {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  return typeof o.success === 'boolean';
}
