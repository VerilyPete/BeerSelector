/**
 * Types related to beer data in the application
 */

/**
 * Base Beer interface representing a beer in the system
 */
export interface Beer {
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
}

/**
 * Beer with glass type (after database fetch, guaranteed to have glass_type)
 * This is a branded type to ensure type safety - glass_type is always present
 * after fetching from database (post-migration to schema v3)
 */
export interface BeerWithGlassType extends Beer {
  glass_type: 'pint' | 'tulip' | null; // Required, not optional
}

/**
 * Beerfinder interface representing a tasted beer with additional properties
 */
export interface Beerfinder extends Beer {
  roh_lap?: string;
  tasted_date?: string;
  review_ratings?: string;
  chit_code?: string;
}

/**
 * Beerfinder with glass type (after database fetch)
 * Combines Beerfinder properties with guaranteed glass_type property
 */
export interface BeerfinderWithGlassType extends BeerWithGlassType {
  roh_lap?: string;
  tasted_date?: string;
  review_ratings?: string;
  chit_code?: string;
}

/**
 * BeerDetails interface for detailed beer information
 */
export interface BeerDetails extends Beer {
  abv?: string;
  ibu?: string;
  availability?: string;
  seasonal?: boolean;
  origin_country?: string;
  untappd_rating?: string;
  untappd_ratings_count?: number;
}

/**
 * CheckInRequestData interface for beer check-in requests
 */
export interface CheckInRequestData {
  chitCode: string;
  chitBrewId: string;
  chitBrewName: string;
  chitStoreName: string;
}

/**
 * CheckInResponse interface for beer check-in responses
 */
export interface CheckInResponse {
  success: boolean;
  message?: string;
  rawResponse?: string;
  error?: string;
}

/**
 * Type guard to check if an object is a Beer
 * @param obj The object to check
 * @returns True if the object is a Beer, false otherwise
 */
export function isBeer(obj: unknown): obj is Beer {
  if (!obj) return false;
  return typeof obj.id === 'string' &&
    typeof obj.brew_name === 'string';
}

/**
 * Type guard to check if an object is a Beerfinder
 * @param obj The object to check
 * @returns True if the object is a Beerfinder, false otherwise
 */
export function isBeerfinder(obj: unknown): obj is Beerfinder {
  if (!obj) return false;
  return isBeer(obj) && (
    obj.roh_lap !== undefined ||
    obj.tasted_date !== undefined ||
    obj.review_ratings !== undefined ||
    obj.chit_code !== undefined
  );
}

/**
 * Type guard to check if an object is a BeerDetails
 * @param obj The object to check
 * @returns True if the object is a BeerDetails, false otherwise
 */
export function isBeerDetails(obj: unknown): obj is BeerDetails {
  if (!obj) return false;
  return isBeer(obj) && (
    obj.abv !== undefined ||
    obj.ibu !== undefined ||
    obj.availability !== undefined ||
    obj.seasonal !== undefined ||
    obj.origin_country !== undefined ||
    obj.untappd_rating !== undefined ||
    obj.untappd_ratings_count !== undefined
  );
}

/**
 * Type guard to check if an object is a BeerWithGlassType
 * @param obj The object to check
 * @returns True if the object is a BeerWithGlassType, false otherwise
 */
export function isBeerWithGlassType(obj: unknown): obj is BeerWithGlassType {
  if (!isBeer(obj)) return false;

  const beer = obj as any;

  // glass_type must be present and valid
  if (beer.glass_type !== 'pint' &&
      beer.glass_type !== 'tulip' &&
      beer.glass_type !== null) {
    return false;
  }

  return true;
}

/**
 * Type guard to check if an object is a BeerfinderWithGlassType
 * @param obj The object to check
 * @returns True if the object is a BeerfinderWithGlassType, false otherwise
 */
export function isBeerfinderWithGlassType(obj: unknown): obj is BeerfinderWithGlassType {
  if (!isBeerWithGlassType(obj)) return false;
  if (!isBeerfinder(obj)) return false;
  return true;
}

/**
 * Type guard to check if an object is a CheckInResponse
 * @param obj The object to check
 * @returns True if the object is a CheckInResponse, false otherwise
 */
export function isCheckInResponse(obj: unknown): obj is CheckInResponse {
  if (!obj) return false;
  return typeof obj.success === 'boolean';
}
