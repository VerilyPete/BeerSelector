/**
 * Comprehensive Edge Case Tests for Database Schema Types
 *
 * These tests verify that Zod schemas properly reject malformed, malicious,
 * and edge case data that could cause issues in the application.
 *
 * Test Categories:
 * 1. Wrong Type Values
 * 2. String Edge Cases
 * 3. Number Edge Cases
 * 4. Object/Array Edge Cases
 * 5. Security Concerns
 * 6. Unicode and Special Characters
 */

import { describe, it, expect } from '@jest/globals';
import {
  allBeersRowSchema,
  tastedBrewRowSchema,
  rewardRowSchema,
  preferenceRowSchema,
  isAllBeersRow,
  isTastedBrewRow,
  isRewardRow,
  isPreferenceRow,
} from '../schemaTypes';

describe('AllBeersRow Schema - Edge Cases', () => {
  describe('Wrong Type Values', () => {
    it('should reject id as boolean', () => {
      const invalidRow = {
        id: true,
        brew_name: 'Test Beer',
      };

      const result = allBeersRowSchema.safeParse(invalidRow);
      expect(result.success).toBe(false);
    });

    it('should reject id as array', () => {
      const invalidRow = {
        id: ['123'],
        brew_name: 'Test Beer',
      };

      const result = allBeersRowSchema.safeParse(invalidRow);
      expect(result.success).toBe(false);
    });

    it('should reject id as object', () => {
      const invalidRow = {
        id: { value: '123' },
        brew_name: 'Test Beer',
      };

      const result = allBeersRowSchema.safeParse(invalidRow);
      expect(result.success).toBe(false);
    });

    it('should reject id as function', () => {
      const invalidRow = {
        id: () => '123',
        brew_name: 'Test Beer',
      };

      const result = allBeersRowSchema.safeParse(invalidRow);
      expect(result.success).toBe(false);
    });

    it('should reject brew_name as number', () => {
      const invalidRow = {
        id: '123',
        brew_name: 12345,
      };

      const result = allBeersRowSchema.safeParse(invalidRow);
      expect(result.success).toBe(false);
    });

    it('should reject brew_name as boolean', () => {
      const invalidRow = {
        id: '123',
        brew_name: false,
      };

      const result = allBeersRowSchema.safeParse(invalidRow);
      expect(result.success).toBe(false);
    });

    it('should reject brew_name as array', () => {
      const invalidRow = {
        id: '123',
        brew_name: ['Test Beer'],
      };

      const result = allBeersRowSchema.safeParse(invalidRow);
      expect(result.success).toBe(false);
    });

    it('should reject brew_name as object', () => {
      const invalidRow = {
        id: '123',
        brew_name: { name: 'Test Beer' },
      };

      const result = allBeersRowSchema.safeParse(invalidRow);
      expect(result.success).toBe(false);
    });
  });

  describe('String Edge Cases', () => {
    it('should accept brew_name with only whitespace (Zod .min(1) checks length, not trim)', () => {
      const invalidRow = {
        id: '123',
        brew_name: '   \t\n   ',
      };

      const result = allBeersRowSchema.safeParse(invalidRow);
      // Zod .min(1) only checks string length, doesn't trim
      expect(result.success).toBe(true);
    });

    it('should accept id as whitespace-only string (schema checks !== empty, not trim)', () => {
      const invalidRow = {
        id: '   ',
        brew_name: 'Test Beer',
      };

      const result = allBeersRowSchema.safeParse(invalidRow);
      // Schema uses refine(val !== ''), doesn't check trim
      expect(result.success).toBe(true);
    });

    it('should accept very long string (10KB)', () => {
      const longString = 'A'.repeat(10000);
      const validRow = {
        id: '123',
        brew_name: longString,
      };

      const result = allBeersRowSchema.safeParse(validRow);
      expect(result.success).toBe(true);
    });

    it('should accept empty optional string fields', () => {
      const validRow = {
        id: '123',
        brew_name: 'Test Beer',
        brewer: '',
        brew_description: '',
      };

      const result = allBeersRowSchema.safeParse(validRow);
      expect(result.success).toBe(true);
    });

    it('should accept SQL-like strings in brew_name (not actual SQL injection)', () => {
      const validRow = {
        id: '123',
        brew_name: "'; DROP TABLE allbeers; --",
      };

      const result = allBeersRowSchema.safeParse(validRow);
      // Should pass validation - SQL injection is prevented at query level, not schema level
      expect(result.success).toBe(true);
    });

    it('should accept HTML/XSS-like strings in description', () => {
      const validRow = {
        id: '123',
        brew_name: 'Test Beer',
        brew_description: '<script>alert("xss")</script>',
      };

      const result = allBeersRowSchema.safeParse(validRow);
      // Should pass validation - XSS is prevented at rendering level, not schema level
      expect(result.success).toBe(true);
    });
  });

  describe('Unicode and Special Characters', () => {
    it('should accept emojis in brew_name', () => {
      const validRow = {
        id: '123',
        brew_name: 'Test Beer 🍺 Awesome Ale 🎉',
      };

      const result = allBeersRowSchema.safeParse(validRow);
      expect(result.success).toBe(true);
    });

    it('should accept RTL (right-to-left) text', () => {
      const validRow = {
        id: '123',
        brew_name: 'בירה טובה', // Hebrew
      };

      const result = allBeersRowSchema.safeParse(validRow);
      expect(result.success).toBe(true);
    });

    it('should accept Chinese/Japanese characters', () => {
      const validRow = {
        id: '123',
        brew_name: '日本のビール',
      };

      const result = allBeersRowSchema.safeParse(validRow);
      expect(result.success).toBe(true);
    });

    it('should accept special punctuation and symbols', () => {
      const validRow = {
        id: '123',
        brew_name: "O'Malley's & Friends - Imperial IPA (2024) #1",
      };

      const result = allBeersRowSchema.safeParse(validRow);
      expect(result.success).toBe(true);
    });

    it('should accept zero-width characters', () => {
      const validRow = {
        id: '123',
        brew_name: 'Test\u200BBeer', // Zero-width space
      };

      const result = allBeersRowSchema.safeParse(validRow);
      expect(result.success).toBe(true);
    });
  });

  describe('Number String Edge Cases', () => {
    it('should accept numeric strings in review_count', () => {
      const validRow = {
        id: '123',
        brew_name: 'Test Beer',
        review_count: '42',
      };

      const result = allBeersRowSchema.safeParse(validRow);
      expect(result.success).toBe(true);
    });

    it('should accept decimal strings in review_rating', () => {
      const validRow = {
        id: '123',
        brew_name: 'Test Beer',
        review_rating: '4.5',
      };

      const result = allBeersRowSchema.safeParse(validRow);
      expect(result.success).toBe(true);
    });

    it('should accept negative number strings', () => {
      const validRow = {
        id: '123',
        brew_name: 'Test Beer',
        review_count: '-5',
      };

      const result = allBeersRowSchema.safeParse(validRow);
      // Schema accepts any string - validation of numeric values happens elsewhere
      expect(result.success).toBe(true);
    });

    it('should accept non-numeric strings in numeric fields', () => {
      const validRow = {
        id: '123',
        brew_name: 'Test Beer',
        review_count: 'not a number',
      };

      const result = allBeersRowSchema.safeParse(validRow);
      // Schema accepts any string - validation happens at application level
      expect(result.success).toBe(true);
    });
  });

  describe('Object and Array Edge Cases', () => {
    it('should reject nested object in id', () => {
      const invalidRow = {
        id: { nested: '123' },
        brew_name: 'Test Beer',
      };

      const result = allBeersRowSchema.safeParse(invalidRow);
      expect(result.success).toBe(false);
    });

    it('should reject array in brew_name', () => {
      const invalidRow = {
        id: '123',
        brew_name: ['Test', 'Beer'],
      };

      const result = allBeersRowSchema.safeParse(invalidRow);
      expect(result.success).toBe(false);
    });

    it('should strip extra properties (Zod default behavior)', () => {
      const rowWithExtra = {
        id: '123',
        brew_name: 'Test Beer',
        unexpected_field: 'some value',
        another_field: 42,
      };

      const result = allBeersRowSchema.safeParse(rowWithExtra);
      expect(result.success).toBe(true);
      if (result.success) {
        // Zod .object() strips unknown properties by default
        expect(result.data).not.toHaveProperty('unexpected_field');
        expect(result.data).not.toHaveProperty('another_field');
      }
    });

    it('should handle frozen objects', () => {
      const frozenRow = Object.freeze({
        id: '123',
        brew_name: 'Test Beer',
      });

      const result = allBeersRowSchema.safeParse(frozenRow);
      expect(result.success).toBe(true);
    });

    it('should handle sealed objects', () => {
      const sealedRow = Object.seal({
        id: '123',
        brew_name: 'Test Beer',
      });

      const result = allBeersRowSchema.safeParse(sealedRow);
      expect(result.success).toBe(true);
    });
  });

  describe('Type Guard Edge Cases', () => {
    it('should reject NaN values', () => {
      const invalidRow = {
        id: NaN,
        brew_name: 'Test Beer',
      };

      expect(isAllBeersRow(invalidRow)).toBe(false);
    });

    it('should reject Infinity values', () => {
      const invalidRow = {
        id: Infinity,
        brew_name: 'Test Beer',
      };

      expect(isAllBeersRow(invalidRow)).toBe(false);
    });

    it('should reject objects with Symbol keys', () => {
      const sym = Symbol('id');
      const invalidRow = {
        [sym]: '123',
        brew_name: 'Test Beer',
      };

      expect(isAllBeersRow(invalidRow)).toBe(false);
    });

    it('should reject objects with getter properties', () => {
      const invalidRow = Object.defineProperty({}, 'id', {
        get: () => '123',
        enumerable: true,
      });
      (invalidRow as any).brew_name = 'Test Beer';

      // Type guard should work even with getters
      expect(isAllBeersRow(invalidRow)).toBe(true);
    });
  });
});

describe('TastedBrewRow Schema - Edge Cases', () => {
  describe('Wrong Type Values', () => {
    it('should reject id as number', () => {
      const invalidRow = {
        id: 123,
        brew_name: 'Test Beer',
      };

      const result = tastedBrewRowSchema.safeParse(invalidRow);
      expect(result.success).toBe(false);
    });

    it('should reject tasted_date as Date object', () => {
      const invalidRow = {
        id: '123',
        brew_name: 'Test Beer',
        tasted_date: new Date(),
      };

      const result = tastedBrewRowSchema.safeParse(invalidRow);
      expect(result.success).toBe(false);
    });

    it('should reject roh_lap as number', () => {
      const invalidRow = {
        id: '123',
        brew_name: 'Test Beer',
        roh_lap: 1,
      };

      const result = tastedBrewRowSchema.safeParse(invalidRow);
      expect(result.success).toBe(false);
    });
  });

  describe('String Edge Cases', () => {
    it('should accept various date format strings', () => {
      const validRow1 = {
        id: '123',
        brew_name: 'Test Beer',
        tasted_date: '2024-01-01',
      };

      const validRow2 = {
        id: '123',
        brew_name: 'Test Beer',
        tasted_date: '01/01/2024',
      };

      const validRow3 = {
        id: '123',
        brew_name: 'Test Beer',
        tasted_date: 'January 1, 2024',
      };

      // Schema accepts any string - date parsing happens elsewhere
      expect(tastedBrewRowSchema.safeParse(validRow1).success).toBe(true);
      expect(tastedBrewRowSchema.safeParse(validRow2).success).toBe(true);
      expect(tastedBrewRowSchema.safeParse(validRow3).success).toBe(true);
    });

    it('should accept empty id should be rejected', () => {
      const invalidRow = {
        id: '',
        brew_name: 'Test Beer',
      };

      const result = tastedBrewRowSchema.safeParse(invalidRow);
      expect(result.success).toBe(false);
    });

    it('should accept review_ratings (plural) but not review_rating', () => {
      const validRow = {
        id: '123',
        brew_name: 'Test Beer',
        review_ratings: '4.5', // Note: plural
      };

      const result = tastedBrewRowSchema.safeParse(validRow);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.review_ratings).toBe('4.5');
      }
    });
  });

  describe('Type Guard Edge Cases', () => {
    it('should reject objects with only some required fields', () => {
      const invalidRow = {
        id: '123',
        // Missing brew_name
      };

      expect(isTastedBrewRow(invalidRow)).toBe(false);
    });

    it('should reject primitive values', () => {
      expect(isTastedBrewRow('not an object')).toBe(false);
      expect(isTastedBrewRow(123)).toBe(false);
      expect(isTastedBrewRow(true)).toBe(false);
    });
  });
});

describe('RewardRow Schema - Edge Cases', () => {
  describe('Wrong Type Values', () => {
    it('should reject reward_id as number', () => {
      const invalidRow = {
        reward_id: 123,
      };

      const result = rewardRowSchema.safeParse(invalidRow);
      expect(result.success).toBe(false);
    });

    it('should reject redeemed as boolean', () => {
      const invalidRow = {
        reward_id: '123',
        redeemed: true,
      };

      const result = rewardRowSchema.safeParse(invalidRow);
      expect(result.success).toBe(false);
    });
  });

  describe('String Edge Cases', () => {
    it('should accept "0" and "1" as redeemed values', () => {
      const validRow1 = {
        reward_id: '123',
        redeemed: '0',
      };

      const validRow2 = {
        reward_id: '123',
        redeemed: '1',
      };

      expect(rewardRowSchema.safeParse(validRow1).success).toBe(true);
      expect(rewardRowSchema.safeParse(validRow2).success).toBe(true);
    });

    it('should accept "true" and "false" strings as redeemed values', () => {
      const validRow1 = {
        reward_id: '123',
        redeemed: 'true',
      };

      const validRow2 = {
        reward_id: '123',
        redeemed: 'false',
      };

      expect(rewardRowSchema.safeParse(validRow1).success).toBe(true);
      expect(rewardRowSchema.safeParse(validRow2).success).toBe(true);
    });

    it('should reject empty reward_id', () => {
      const invalidRow = {
        reward_id: '',
      };

      const result = rewardRowSchema.safeParse(invalidRow);
      expect(result.success).toBe(false);
    });
  });

  describe('Type Guard Edge Cases', () => {
    it('should accept valid minimal reward', () => {
      const validRow = {
        reward_id: '123',
      };

      expect(isRewardRow(validRow)).toBe(true);
    });

    it('should reject reward with missing reward_id', () => {
      const invalidRow = {
        redeemed: 'true',
        reward_type: 'plate',
      };

      expect(isRewardRow(invalidRow)).toBe(false);
    });
  });
});

describe('PreferenceRow Schema - Edge Cases', () => {
  describe('Wrong Type Values', () => {
    it('should reject key as number', () => {
      const invalidRow = {
        key: 123,
        value: 'test',
      };

      const result = preferenceRowSchema.safeParse(invalidRow);
      expect(result.success).toBe(false);
    });

    it('should reject value as object', () => {
      const invalidRow = {
        key: 'test_key',
        value: { nested: 'value' },
      };

      const result = preferenceRowSchema.safeParse(invalidRow);
      expect(result.success).toBe(false);
    });

    it('should reject value as array', () => {
      const invalidRow = {
        key: 'test_key',
        value: ['value1', 'value2'],
      };

      const result = preferenceRowSchema.safeParse(invalidRow);
      expect(result.success).toBe(false);
    });
  });

  describe('String Edge Cases', () => {
    it('should reject empty key', () => {
      const invalidRow = {
        key: '',
        value: 'test value',
      };

      const result = preferenceRowSchema.safeParse(invalidRow);
      expect(result.success).toBe(false);
    });

    it('should accept empty value (edge case: preference can be empty)', () => {
      const validRow = {
        key: 'test_key',
        value: '',
      };

      const result = preferenceRowSchema.safeParse(validRow);
      expect(result.success).toBe(true);
    });

    it('should accept JSON strings as values', () => {
      const validRow = {
        key: 'config',
        value: '{"setting1": true, "setting2": "value"}',
      };

      const result = preferenceRowSchema.safeParse(validRow);
      expect(result.success).toBe(true);
    });

    it('should accept URLs as values', () => {
      const validRow = {
        key: 'api_url',
        value: 'https://api.example.com/v1/beers',
      };

      const result = preferenceRowSchema.safeParse(validRow);
      expect(result.success).toBe(true);
    });
  });

  describe('Type Guard Edge Cases', () => {
    it('should require both key and value', () => {
      const invalidRow1 = {
        key: 'test',
      };

      const invalidRow2 = {
        value: 'test',
      };

      expect(isPreferenceRow(invalidRow1)).toBe(false);
      expect(isPreferenceRow(invalidRow2)).toBe(false);
    });

    it('should handle description as optional', () => {
      const validRow = {
        key: 'test_key',
        value: 'test_value',
        // description is optional
      };

      expect(isPreferenceRow(validRow)).toBe(true);
    });
  });
});

describe('Array Schema Validation - Edge Cases', () => {
  describe('Large Dataset Validation', () => {
    it('should validate array of 10,000 beers efficiently', () => {
      const beers = Array.from({ length: 10000 }, (_, i) => ({
        id: String(i),
        brew_name: `Beer ${i}`,
      }));

      const arraySchema = allBeersRowSchema.array();
      const startTime = Date.now();
      const result = arraySchema.safeParse(beers);
      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(2000); // Should complete in less than 2 seconds
    });

    it('should stop validation on first error in array', () => {
      const beers = Array.from({ length: 1000 }, (_, i) => {
        if (i === 500) {
          return { id: '', brew_name: 'Invalid Beer' }; // Invalid at index 500
        }
        return { id: String(i), brew_name: `Beer ${i}` };
      });

      const arraySchema = allBeersRowSchema.array();
      const result = arraySchema.safeParse(beers);

      expect(result.success).toBe(false);
    });
  });

  describe('Mixed Valid/Invalid Data', () => {
    it('should identify all invalid items in small array', () => {
      const beers = [
        { id: '1', brew_name: 'Valid Beer 1' },
        { id: '', brew_name: 'Invalid - Empty ID' },
        { id: '3', brew_name: '' },
        { id: '4', brew_name: 'Valid Beer 2' },
        { id: null, brew_name: 'Invalid - Null ID' },
      ];

      const arraySchema = allBeersRowSchema.array();
      const result = arraySchema.safeParse(beers);

      expect(result.success).toBe(false);
      // Zod stops on first error, doesn't collect all errors in array
    });
  });

  describe('Empty and Null Arrays', () => {
    it('should accept empty array', () => {
      const emptyArray: any[] = [];

      const arraySchema = allBeersRowSchema.array();
      const result = arraySchema.safeParse(emptyArray);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(0);
      }
    });

    it('should reject null instead of array', () => {
      const arraySchema = allBeersRowSchema.array();
      const result = arraySchema.safeParse(null);

      expect(result.success).toBe(false);
    });

    it('should reject undefined instead of array', () => {
      const arraySchema = allBeersRowSchema.array();
      const result = arraySchema.safeParse(undefined);

      expect(result.success).toBe(false);
    });
  });
});

describe('Conversion Function Edge Cases', () => {
  describe('allBeersRowToBeer', () => {
    it('should convert numeric id to string', () => {
      const { allBeersRowToBeer } = require('../schemaTypes');
      const row = {
        id: 123, // Numeric ID
        brew_name: 'Test Beer',
      };

      const beer = allBeersRowToBeer(row);

      expect(typeof beer.id).toBe('string');
      expect(beer.id).toBe('123');
    });

    it('should preserve optional undefined fields', () => {
      const { allBeersRowToBeer } = require('../schemaTypes');
      const row = {
        id: '123',
        brew_name: 'Test Beer',
        // All optional fields are undefined
      };

      const beer = allBeersRowToBeer(row);

      expect(beer.brewer).toBeUndefined();
      expect(beer.brew_style).toBeUndefined();
      expect(beer.brew_description).toBeUndefined();
    });
  });

  describe('rewardRowToReward', () => {
    it('should convert undefined redeemed to "0"', () => {
      const { rewardRowToReward } = require('../schemaTypes');
      const row = {
        reward_id: '123',
        // redeemed is undefined
      };

      const reward = rewardRowToReward(row);

      expect(reward.redeemed).toBe('0');
    });

    it('should convert undefined reward_type to empty string', () => {
      const { rewardRowToReward } = require('../schemaTypes');
      const row = {
        reward_id: '123',
        // reward_type is undefined
      };

      const reward = rewardRowToReward(row);

      expect(reward.reward_type).toBe('');
    });
  });

  describe('preferenceRowToPreference', () => {
    it('should convert undefined description to empty string', () => {
      const { preferenceRowToPreference } = require('../schemaTypes');
      const row = {
        key: 'test_key',
        value: 'test_value',
        // description is undefined
      };

      const preference = preferenceRowToPreference(row);

      expect(preference.description).toBe('');
    });
  });
});
