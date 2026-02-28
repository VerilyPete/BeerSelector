/**
 * API Response Validators
 *
 * Provides validation functions for API responses to ensure data integrity
 * before database insertion. This prevents silent data corruption from malformed
 * API responses.
 */

import { Beer } from '../types/beer';

/**
 * Validation result structure
 */
export type ValidationResult<T> = {
  isValid: boolean;
  errors: string[];
  data?: T;
};

/**
 * Validates the Flying Saucer API brewInStock response structure.
 *
 * Expected structure: [
 *   { ...metadata },
 *   { brewInStock: [...beer objects] }
 * ]
 *
 * @param response - The API response to validate
 * @returns Validation result with extracted brewInStock array if valid
 *
 * @example
 * const result = validateBrewInStockResponse(apiResponse);
 * if (result.isValid) {
 *   await insertBeersIntoDatabase(result.data);
 * } else {
 *   console.error('Invalid API response:', result.errors);
 * }
 */
export function validateBrewInStockResponse(response: unknown): ValidationResult<unknown[]> {
  const errors: string[] = [];

  // Check for null/undefined
  if (response === null || response === undefined) {
    errors.push('Response is null or undefined');
    return { isValid: false, errors, data: undefined };
  }

  // Check if response is an array
  if (!Array.isArray(response)) {
    errors.push('Response is not an array');
    return { isValid: false, errors, data: undefined };
  }

  // Check if response has at least 2 elements
  if (response.length < 2) {
    errors.push('Response array does not have expected structure (length < 2)');
    return { isValid: false, errors, data: undefined };
  }

  // Check if second element has brewInStock property
  const secondElement = response[1];
  if (!secondElement || typeof secondElement !== 'object') {
    errors.push('Response second element is not an object');
    return { isValid: false, errors, data: undefined };
  }

  if (!('brewInStock' in secondElement)) {
    errors.push('Response does not contain brewInStock array');
    return { isValid: false, errors, data: undefined };
  }

  const brewInStock = secondElement.brewInStock;

  // Check if brewInStock is an array
  if (!Array.isArray(brewInStock)) {
    errors.push('brewInStock is not an array');
    return { isValid: false, errors, data: undefined };
  }

  // Valid response structure
  return {
    isValid: true,
    errors: [],
    data: brewInStock,
  };
}

/**
 * Validates a single beer object has required fields.
 *
 * Required fields:
 * - id: Must be present and not null/undefined
 * - brew_name: Must be present, not null/undefined, and not empty string
 *
 * @param beer - The beer object to validate
 * @returns Validation result
 *
 * @example
 * const result = validateBeer(beerObject);
 * if (result.isValid) {
 *   await insertBeerIntoDatabase(result.data);
 * } else {
 *   console.warn('Skipping invalid beer:', result.errors);
 * }
 */
export function validateBeer(beer: unknown): ValidationResult<Beer> {
  const errors: string[] = [];

  // Check for null/undefined
  if (beer === null || beer === undefined) {
    errors.push('Beer object is null or undefined');
    return { isValid: false, errors, data: undefined };
  }

  // Check if beer is an object
  if (typeof beer !== 'object' || Array.isArray(beer)) {
    errors.push('Beer object is not a valid object');
    return { isValid: false, errors, data: undefined };
  }

  // Check required field: id
  if (!('id' in beer)) {
    errors.push('Beer object missing required field: id');
  } else if (beer.id === null || beer.id === undefined) {
    errors.push('Beer object has null or undefined id');
  }

  // Check required field: brew_name
  if (!('brew_name' in beer)) {
    errors.push('Beer object missing required field: brew_name');
  } else if (beer.brew_name === null || beer.brew_name === undefined) {
    errors.push('Beer object has null or undefined brew_name');
  } else if (typeof beer.brew_name === 'string' && beer.brew_name.trim() === '') {
    errors.push('Beer object has empty brew_name');
  }

  // Return validation result
  if (errors.length > 0) {
    return { isValid: false, errors, data: undefined };
  }

  const rawBeer = beer as Record<string, unknown>;
  return {
    isValid: true,
    errors: [],
    data: { ...rawBeer, id: String(rawBeer['id']) } as Beer,
  };
}

/**
 * Validates an array of beer objects and returns summary.
 *
 * @param beers - Array of beer objects to validate
 * @returns Object with valid beers, invalid beers, and error details
 *
 * @example
 * const { validBeers, invalidBeers, summary } = validateBeerArray(beers);
 * console.log(`Validated ${summary.total} beers: ${summary.valid} valid, ${summary.invalid} invalid`);
 * await insertBeersIntoDatabase(validBeers);
 */
export function validateBeerArray(beers: unknown[]): {
  validBeers: Beer[];
  invalidBeers: { beer: unknown; errors: string[] }[];
  summary: {
    total: number;
    valid: number;
    invalid: number;
  };
} {
  const validBeers: Beer[] = [];
  const invalidBeers: { beer: unknown; errors: string[] }[] = [];

  for (const beer of beers) {
    const result = validateBeer(beer);
    if (result.isValid && result.data) {
      validBeers.push(result.data);
    } else {
      invalidBeers.push({
        beer,
        errors: result.errors,
      });
    }
  }

  return {
    validBeers,
    invalidBeers,
    summary: {
      total: beers.length,
      valid: validBeers.length,
      invalid: invalidBeers.length,
    },
  };
}

