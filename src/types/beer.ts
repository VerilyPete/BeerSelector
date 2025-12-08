/**
 * Types related to beer data in the application
 */

import { ContainerType } from '@/src/utils/beerGlassType';

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
 * Beer with container type property (after database fetch)
 * The container_type field is always present after schema v4 migration,
 * but its value can be null for beers where we can't determine the container:
 * - Draft beers without detectable ABV or 13oz/16oz size marker
 * - Container types we don't recognize
 *
 * Container types: 'pint', 'tulip', 'can', 'bottle', or null (no icon shown)
 */
export interface BeerWithContainerType extends Beer {
  container_type: ContainerType; // Field present, value can be null
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
 * Beerfinder with container type (after database fetch)
 * Combines Beerfinder properties with container_type property
 * (container_type can be null for unrecognized container types)
 */
export interface BeerfinderWithContainerType extends BeerWithContainerType {
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
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  return typeof o.id === 'string' && typeof o.brew_name === 'string';
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
      o.review_rating !== undefined ||
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

  const beer = obj as any;

  // container_type must be present and valid
  const validTypes = ['pint', 'tulip', 'can', 'bottle', null];
  if (!validTypes.includes(beer.container_type)) {
    return false;
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
