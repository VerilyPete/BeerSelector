/**
 * Database Data Validation
 *
 * Validates data before database insertion to prevent silent data corruption.
 * Provides detailed validation results with operation summaries.
 */

import { Beer } from '../types/beer';
import { Reward } from '../types/database';
import { rewardRowSchema } from './schemaTypes';

/**
 * Result of validating a single beer object
 */
export type BeerValidationResult = {
  isValid: boolean;
  errors: string[];
};

/**
 * Summary of a batch validation operation
 */
export type ValidationSummary = {
  total: number;
  valid: number;
  invalid: number;
};

/**
 * Result of validating multiple beer objects
 */
export type BeersValidationResult<T = Beer> = {
  validBeers: T[];
  invalidBeers: {
    beer: unknown;
    errors: string[];
  }[];
  summary: ValidationSummary;
};

/**
 * Validates a single beer object has required fields for database insertion.
 *
 * Required fields:
 * - id: Must be present, not null, not undefined
 * - brew_name: Must be present, not null, not undefined, not empty string
 *
 * @param beer - The beer object to validate
 * @returns Validation result with error details
 *
 * @example
 * const result = validateBeerForInsertion(beer);
 * if (result.isValid) {
 *   await insertBeer(beer);
 * } else {
 *   logWarning(`Skipping invalid beer: ${result.errors.join(', ')}`, {
 *     operation: 'insertBeers',
 *     additionalData: { beer }
 *   });
 * }
 */
export function validateBeerForInsertion(beer: unknown): BeerValidationResult {
  const errors: string[] = [];

  // Check for null/undefined beer object
  if (beer === null || beer === undefined) {
    errors.push('Beer object is null or undefined');
    return { isValid: false, errors };
  }

  // Check if beer is an object
  if (typeof beer !== 'object' || Array.isArray(beer)) {
    errors.push('Beer object is not a valid object');
    return { isValid: false, errors };
  }

  // Legacy validation for backward compatibility with existing tests
  // TODO: Remove this once all validation migrates to Zod schemas (allBeersRowSchema)
  const beerObj = beer as Record<string, unknown>;

  // Validate required field: id
  if (!('id' in beerObj)) {
    errors.push('Missing required field: id');
  } else if (beerObj.id === null || beerObj.id === undefined) {
    errors.push('Field id is null or undefined');
  }

  // Validate required field: brew_name
  if (!('brew_name' in beerObj)) {
    errors.push('Missing required field: brew_name');
  } else if (beerObj.brew_name === null || beerObj.brew_name === undefined) {
    errors.push('Field brew_name is null or undefined');
  } else if (typeof beerObj.brew_name === 'string' && beerObj.brew_name.trim() === '') {
    errors.push('Field brew_name is empty string');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validates an array of beer objects for database insertion.
 *
 * Separates valid beers from invalid ones and provides a summary.
 * This allows the caller to insert valid beers while logging warnings
 * about invalid ones.
 *
 * @param beers - Array of beer objects to validate
 * @returns Object with valid beers, invalid beers with errors, and summary
 *
 * @example
 * const { validBeers, invalidBeers, summary } = validateBeersForInsertion(beers);
 *
 * // Log warnings for invalid beers
 * invalidBeers.forEach(({ beer, errors }) => {
 *   logWarning(`Skipping invalid beer: ${errors.join(', ')}`, {
 *     operation: 'insertBeers',
 *     additionalData: { beerId: beer.id, errors }
 *   });
 * });
 *
 * // Insert only valid beers
 * await insertBeersIntoDatabase(validBeers);
 *
 * // Log summary
 * logInfo(`Inserted ${summary.valid} beers, skipped ${summary.invalid} invalid beers`, {
 *   operation: 'insertBeers',
 *   additionalData: summary
 * });
 */
export function validateBeersForInsertion(beers: unknown[]): BeersValidationResult<Beer> {
  const validBeers: Beer[] = [];
  const invalidBeers: { beer: unknown; errors: string[] }[] = [];

  for (const beer of beers) {
    const validationResult = validateBeerForInsertion(beer);

    if (validationResult.isValid) {
      // Safe after validateBeerForInsertion confirms id and brew_name exist
      validBeers.push(beer as Beer);
    } else {
      invalidBeers.push({
        beer,
        errors: validationResult.errors,
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

/**
 * Validates a reward object has required fields for database insertion.
 *
 * Required fields vary based on reward type, but typically include:
 * - id or unique identifier
 * - name or title
 *
 * @param reward - The reward object to validate
 * @returns Validation result with error details
 */
export function validateRewardForInsertion(reward: unknown): BeerValidationResult {
  const errors: string[] = [];

  // Check for null/undefined reward object
  if (reward === null || reward === undefined) {
    errors.push('Reward object is null or undefined');
    return { isValid: false, errors };
  }

  // Check if reward is an object
  if (typeof reward !== 'object' || Array.isArray(reward)) {
    errors.push('Reward object is not a valid object');
    return { isValid: false, errors };
  }

  // Use Zod schema for validation
  const result = rewardRowSchema.safeParse(reward);
  if (!result.success) {
    result.error.issues.forEach(issue => {
      errors.push(`${issue.path.join('.')}: ${issue.message}`);
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validates an array of reward objects for database insertion.
 *
 * @param rewards - Array of reward objects to validate
 * @returns Object with valid rewards, invalid rewards with errors, and summary
 */
export function validateRewardsForInsertion(rewards: unknown[]): BeersValidationResult<Reward> {
  const validRewards: Reward[] = [];
  const invalidRewards: { beer: unknown; errors: string[] }[] = [];

  for (const reward of rewards) {
    const validationResult = validateRewardForInsertion(reward);

    if (validationResult.isValid) {
      validRewards.push(reward as Reward);
    } else {
      invalidRewards.push({
        beer: reward,
        errors: validationResult.errors,
      });
    }
  }

  return {
    validBeers: validRewards,
    invalidBeers: invalidRewards,
    summary: {
      total: rewards.length,
      valid: validRewards.length,
      invalid: invalidRewards.length,
    },
  };
}
