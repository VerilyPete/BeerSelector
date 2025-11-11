/**
 * Database Data Validation
 *
 * Validates data before database insertion to prevent silent data corruption.
 * Provides detailed validation results with operation summaries.
 */

/**
 * Result of validating a single beer object
 */
export interface BeerValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Summary of a batch validation operation
 */
export interface ValidationSummary {
  total: number;
  valid: number;
  invalid: number;
}

/**
 * Result of validating multiple beer objects
 */
export interface BeersValidationResult {
  validBeers: any[];
  invalidBeers: Array<{
    beer: any;
    errors: string[];
  }>;
  summary: ValidationSummary;
}

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
export function validateBeerForInsertion(beer: any): BeerValidationResult {
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

  // Validate required field: id
  if (!('id' in beer)) {
    errors.push('Missing required field: id');
  } else if (beer.id === null || beer.id === undefined) {
    errors.push('Field id is null or undefined');
  }

  // Validate required field: brew_name
  if (!('brew_name' in beer)) {
    errors.push('Missing required field: brew_name');
  } else if (beer.brew_name === null || beer.brew_name === undefined) {
    errors.push('Field brew_name is null or undefined');
  } else if (typeof beer.brew_name === 'string' && beer.brew_name.trim() === '') {
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
export function validateBeersForInsertion(beers: any[]): BeersValidationResult {
  const validBeers: any[] = [];
  const invalidBeers: Array<{ beer: any; errors: string[] }> = [];

  for (const beer of beers) {
    const validationResult = validateBeerForInsertion(beer);

    if (validationResult.isValid) {
      validBeers.push(beer);
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
export function validateRewardForInsertion(reward: any): BeerValidationResult {
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

  // Rewards validation can be more lenient since structure varies
  // Just ensure it's a valid object
  return {
    isValid: true,
    errors: [],
  };
}

/**
 * Validates an array of reward objects for database insertion.
 *
 * @param rewards - Array of reward objects to validate
 * @returns Object with valid rewards, invalid rewards with errors, and summary
 */
export function validateRewardsForInsertion(rewards: any[]): BeersValidationResult {
  const validBeers: any[] = [];
  const invalidBeers: Array<{ beer: any; errors: string[] }> = [];

  for (const reward of rewards) {
    const validationResult = validateRewardForInsertion(reward);

    if (validationResult.isValid) {
      validBeers.push(reward);
    } else {
      invalidBeers.push({
        beer: reward,
        errors: validationResult.errors,
      });
    }
  }

  return {
    validBeers,
    invalidBeers,
    summary: {
      total: rewards.length,
      valid: validBeers.length,
      invalid: invalidBeers.length,
    },
  };
}
