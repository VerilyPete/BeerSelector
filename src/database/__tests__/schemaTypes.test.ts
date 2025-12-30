/**
 * Tests for database schema types and Zod schemas
 *
 * These tests verify that:
 * 1. Database row types match SQL schema definitions
 * 2. Zod schemas correctly validate database rows
 * 3. Type guards work correctly for runtime type checking
 */

import { describe, it, expect } from '@jest/globals';
import {
  AllBeersRow,
  TastedBrewRow,
  RewardRow,
  PreferenceRow,
  allBeersRowSchema,
  tastedBrewRowSchema,
  rewardRowSchema,
  preferenceRowSchema,
  isAllBeersRow,
  isTastedBrewRow,
  isRewardRow,
  isPreferenceRow,
  allBeersRowToBeer,
  tastedBrewRowToBeerfinder,
  rewardRowToReward,
  preferenceRowToPreference,
} from '../schemaTypes';

describe('AllBeersRow type and schema', () => {
  it('should validate valid AllBeersRow with all fields', () => {
    const validRow = {
      id: '123',
      added_date: '2024-01-01',
      brew_name: 'Test Beer',
      brewer: 'Test Brewery',
      brewer_loc: 'Austin, TX',
      brew_style: 'IPA',
      brew_container: 'Draft',
      review_count: '10',
      review_rating: '4.5',
      brew_description: 'A great beer',
    };

    const result = allBeersRowSchema.safeParse(validRow);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(validRow);
    }
  });

  it('should validate AllBeersRow with only required fields (id, brew_name)', () => {
    const minimalRow = {
      id: '123',
      brew_name: 'Test Beer',
    };

    const result = allBeersRowSchema.safeParse(minimalRow);
    expect(result.success).toBe(true);
  });

  it('should reject AllBeersRow missing id', () => {
    const invalidRow = {
      brew_name: 'Test Beer',
    };

    const result = allBeersRowSchema.safeParse(invalidRow);
    expect(result.success).toBe(false);
  });

  it('should reject AllBeersRow missing brew_name', () => {
    const invalidRow = {
      id: '123',
    };

    const result = allBeersRowSchema.safeParse(invalidRow);
    expect(result.success).toBe(false);
  });

  it('should reject AllBeersRow with null id', () => {
    const invalidRow = {
      id: null,
      brew_name: 'Test Beer',
    };

    const result = allBeersRowSchema.safeParse(invalidRow);
    expect(result.success).toBe(false);
  });

  it('should reject AllBeersRow with empty string brew_name', () => {
    const invalidRow = {
      id: '123',
      brew_name: '',
    };

    const result = allBeersRowSchema.safeParse(invalidRow);
    expect(result.success).toBe(false);
  });

  it('should provide type guard for AllBeersRow', () => {
    const validRow = {
      id: '123',
      brew_name: 'Test Beer',
      brewer: 'Test Brewery',
    };

    expect(isAllBeersRow(validRow)).toBe(true);
    expect(isAllBeersRow(null)).toBe(false);
    expect(isAllBeersRow({ id: '123' })).toBe(false);
  });
});

describe('TastedBrewRow type and schema', () => {
  it('should validate valid TastedBrewRow with all fields', () => {
    const validRow = {
      id: '123',
      roh_lap: '1',
      tasted_date: '2024-01-01',
      brew_name: 'Test Beer',
      brewer: 'Test Brewery',
      brewer_loc: 'Austin, TX',
      brew_style: 'IPA',
      brew_container: 'Draft',
      review_count: '10',
      review_ratings: '4.5',
      brew_description: 'A great beer',
      chit_code: 'ABC123',
    };

    const result = tastedBrewRowSchema.safeParse(validRow);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(validRow);
    }
  });

  it('should validate TastedBrewRow with only required fields (id, brew_name)', () => {
    const minimalRow = {
      id: '123',
      brew_name: 'Test Beer',
    };

    const result = tastedBrewRowSchema.safeParse(minimalRow);
    expect(result.success).toBe(true);
  });

  it('should reject TastedBrewRow missing id', () => {
    const invalidRow = {
      brew_name: 'Test Beer',
    };

    const result = tastedBrewRowSchema.safeParse(invalidRow);
    expect(result.success).toBe(false);
  });

  it('should provide type guard for TastedBrewRow', () => {
    const validRow = {
      id: '123',
      brew_name: 'Test Beer',
      tasted_date: '2024-01-01',
    };

    expect(isTastedBrewRow(validRow)).toBe(true);
    expect(isTastedBrewRow(null)).toBe(false);
    expect(isTastedBrewRow({ id: '123' })).toBe(false);
  });
});

describe('RewardRow type and schema', () => {
  it('should validate valid RewardRow with all fields', () => {
    const validRow = {
      reward_id: '123',
      redeemed: 'true',
      reward_type: 'plate',
    };

    const result = rewardRowSchema.safeParse(validRow);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(validRow);
    }
  });

  it('should validate RewardRow with only required field (reward_id)', () => {
    const minimalRow = {
      reward_id: '123',
    };

    const result = rewardRowSchema.safeParse(minimalRow);
    expect(result.success).toBe(true);
  });

  it('should reject RewardRow missing reward_id', () => {
    const invalidRow = {
      redeemed: 'true',
      reward_type: 'plate',
    };

    const result = rewardRowSchema.safeParse(invalidRow);
    expect(result.success).toBe(false);
  });

  it('should provide type guard for RewardRow', () => {
    const validRow = {
      reward_id: '123',
      redeemed: 'true',
      reward_type: 'plate',
    };

    expect(isRewardRow(validRow)).toBe(true);
    expect(isRewardRow(null)).toBe(false);
    expect(isRewardRow({ redeemed: 'true' })).toBe(false);
  });
});

describe('PreferenceRow type and schema', () => {
  it('should validate valid PreferenceRow with all fields', () => {
    const validRow = {
      key: 'all_beers_api_url',
      value: 'https://example.com/api',
      description: 'API endpoint for fetching all beers',
    };

    const result = preferenceRowSchema.safeParse(validRow);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(validRow);
    }
  });

  it('should validate PreferenceRow with only required fields (key, value)', () => {
    const minimalRow = {
      key: 'test_key',
      value: 'test_value',
    };

    const result = preferenceRowSchema.safeParse(minimalRow);
    expect(result.success).toBe(true);
  });

  it('should reject PreferenceRow missing key', () => {
    const invalidRow = {
      value: 'test_value',
    };

    const result = preferenceRowSchema.safeParse(invalidRow);
    expect(result.success).toBe(false);
  });

  it('should reject PreferenceRow missing value', () => {
    const invalidRow = {
      key: 'test_key',
    };

    const result = preferenceRowSchema.safeParse(invalidRow);
    expect(result.success).toBe(false);
  });

  it('should provide type guard for PreferenceRow', () => {
    const validRow = {
      key: 'test_key',
      value: 'test_value',
      description: 'test description',
    };

    expect(isPreferenceRow(validRow)).toBe(true);
    expect(isPreferenceRow(null)).toBe(false);
    expect(isPreferenceRow({ key: 'test_key' })).toBe(false);
  });
});

describe('Database row to domain model conversions', () => {
  it('should convert AllBeersRow to Beer type', () => {
    const dbRow = {
      id: '123',
      added_date: '2024-01-01',
      brew_name: 'Test Beer',
      brewer: 'Test Brewery',
      brewer_loc: 'Austin, TX',
      brew_style: 'IPA',
      brew_container: 'Draft',
      review_count: '10',
      review_rating: '4.5',
      brew_description: 'A great beer',
    };

    const beer = allBeersRowToBeer(dbRow);

    expect(beer).toEqual({
      id: '123',
      added_date: '2024-01-01',
      brew_name: 'Test Beer',
      brewer: 'Test Brewery',
      brewer_loc: 'Austin, TX',
      brew_style: 'IPA',
      brew_container: 'Draft',
      review_count: '10',
      review_rating: '4.5',
      brew_description: 'A great beer',
    });
  });

  it('should convert TastedBrewRow to Beerfinder type', () => {
    const dbRow = {
      id: '123',
      roh_lap: '1',
      tasted_date: '2024-01-01',
      brew_name: 'Test Beer',
      brewer: 'Test Brewery',
      brewer_loc: 'Austin, TX',
      brew_style: 'IPA',
      brew_container: 'Draft',
      review_count: '10',
      review_ratings: '4.5',
      brew_description: 'A great beer',
      chit_code: 'ABC123',
    };

    const beerfinder = tastedBrewRowToBeerfinder(dbRow);

    expect(beerfinder).toEqual({
      id: '123',
      roh_lap: '1',
      tasted_date: '2024-01-01',
      brew_name: 'Test Beer',
      brewer: 'Test Brewery',
      brewer_loc: 'Austin, TX',
      brew_style: 'IPA',
      brew_container: 'Draft',
      review_count: '10',
      review_ratings: '4.5',
      brew_description: 'A great beer',
      chit_code: 'ABC123',
    });
  });

  it('should convert RewardRow to Reward type', () => {
    const dbRow = {
      reward_id: '123',
      redeemed: 'true',
      reward_type: 'plate',
    };

    const reward = rewardRowToReward(dbRow);

    expect(reward).toEqual({
      reward_id: '123',
      redeemed: 'true',
      reward_type: 'plate',
    });
  });

  it('should convert PreferenceRow to Preference type', () => {
    const dbRow = {
      key: 'all_beers_api_url',
      value: 'https://example.com/api',
      description: 'API endpoint for fetching all beers',
    };

    const preference = preferenceRowToPreference(dbRow);

    expect(preference).toEqual({
      key: 'all_beers_api_url',
      value: 'https://example.com/api',
      description: 'API endpoint for fetching all beers',
    });
  });
});

describe('Query result validation', () => {
  it('should validate array of AllBeersRow', () => {
    const rows = [
      { id: '1', brew_name: 'Beer 1', brewer: 'Brewery 1' },
      { id: '2', brew_name: 'Beer 2', brewer: 'Brewery 2' },
      { id: '3', brew_name: 'Beer 3', brewer: 'Brewery 3' },
    ];

    const arraySchema = allBeersRowSchema.array();
    const result = arraySchema.safeParse(rows);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(3);
    }
  });

  it('should reject array with invalid AllBeersRow', () => {
    const rows = [
      { id: '1', brew_name: 'Beer 1' },
      { id: '2' }, // Missing brew_name
      { id: '3', brew_name: 'Beer 3' },
    ];

    const arraySchema = allBeersRowSchema.array();
    const result = arraySchema.safeParse(rows);

    expect(result.success).toBe(false);
  });

  it('should provide detailed error messages for validation failures', () => {
    const invalidRow = {
      id: 123, // Should be string
      brew_name: '', // Should not be empty
    };

    const result = allBeersRowSchema.safeParse(invalidRow);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toBeDefined();
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });
});
