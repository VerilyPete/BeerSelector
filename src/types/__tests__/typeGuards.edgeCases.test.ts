/**
 * Comprehensive Edge Case Tests for Type Guards
 *
 * These tests verify that type guards properly handle malformed data,
 * wrong types, and edge cases that could cause runtime errors.
 *
 * Test Categories:
 * 1. Primitive Type Edge Cases
 * 2. Object Structure Edge Cases
 * 3. Property Type Edge Cases
 * 4. Special JavaScript Values
 * 5. Security and Malicious Data
 */

import { isBeer } from '../beer';

import { isSessionData } from '../api';

import { isPreference, isReward } from '../database';

describe('Beer Type Guards - Edge Cases', () => {
  describe('isBeer - Primitive Edge Cases', () => {
    it('should reject string primitives', () => {
      expect(isBeer('not an object')).toBe(false);
    });

    it('should reject number primitives', () => {
      expect(isBeer(123)).toBe(false);
      expect(isBeer(0)).toBe(false);
      expect(isBeer(-1)).toBe(false);
    });

    it('should reject boolean primitives', () => {
      expect(isBeer(true)).toBe(false);
      expect(isBeer(false)).toBe(false);
    });

    it('should reject null', () => {
      expect(isBeer(null)).toBe(false);
    });

    it('should reject undefined', () => {
      expect(isBeer(undefined)).toBe(false);
    });

    it('should reject arrays', () => {
      expect(isBeer([])).toBe(false);
      expect(isBeer(['id', 'name'])).toBe(false);
    });

    it('should reject functions', () => {
      const fn = () => ({ id: '123', brew_name: 'Test' });
      expect(isBeer(fn)).toBe(false);
    });

    it('should reject symbols', () => {
      expect(isBeer(Symbol('beer'))).toBe(false);
    });
  });

  describe('isBeer - Object Structure Edge Cases', () => {
    it('should reject object with id as number', () => {
      const obj = {
        id: 123, // Should be string
        brew_name: 'Test Beer',
      };

      expect(isBeer(obj)).toBe(false);
    });

    it('should reject object with id as boolean', () => {
      const obj = {
        id: true,
        brew_name: 'Test Beer',
      };

      expect(isBeer(obj)).toBe(false);
    });

    it('should reject object with id as object', () => {
      const obj = {
        id: { value: '123' },
        brew_name: 'Test Beer',
      };

      expect(isBeer(obj)).toBe(false);
    });

    it('should reject object with id as array', () => {
      const obj = {
        id: ['123'],
        brew_name: 'Test Beer',
      };

      expect(isBeer(obj)).toBe(false);
    });

    it('should reject object with brew_name as number', () => {
      const obj = {
        id: '123',
        brew_name: 12345,
      };

      expect(isBeer(obj)).toBe(false);
    });

    it('should reject object with brew_name as boolean', () => {
      const obj = {
        id: '123',
        brew_name: false,
      };

      expect(isBeer(obj)).toBe(false);
    });

    it('should reject object with brew_name as array', () => {
      const obj = {
        id: '123',
        brew_name: ['Test', 'Beer'],
      };

      expect(isBeer(obj)).toBe(false);
    });

    it('should reject object with brew_name as object', () => {
      const obj = {
        id: '123',
        brew_name: { name: 'Test Beer' },
      };

      expect(isBeer(obj)).toBe(false);
    });
  });

  describe('isBeer - Special JavaScript Values', () => {
    it('should reject object with NaN as id', () => {
      const obj = {
        id: NaN,
        brew_name: 'Test Beer',
      };

      expect(isBeer(obj)).toBe(false);
    });

    it('should reject object with Infinity as id', () => {
      const obj = {
        id: Infinity,
        brew_name: 'Test Beer',
      };

      expect(isBeer(obj)).toBe(false);
    });

    it('should reject object with -Infinity as id', () => {
      const obj = {
        id: -Infinity,
        brew_name: 'Test Beer',
      };

      expect(isBeer(obj)).toBe(false);
    });

    it('should accept object with empty string id (edge case)', () => {
      const obj = {
        id: '',
        brew_name: 'Test Beer',
      };

      // Type guard checks for typeof string, not length
      expect(isBeer(obj)).toBe(true);
    });

    it('should accept object with empty string brew_name (edge case)', () => {
      const obj = {
        id: '123',
        brew_name: '',
      };

      // Type guard checks for typeof string, not length
      expect(isBeer(obj)).toBe(true);
    });

    it('should accept object with whitespace-only strings', () => {
      const obj = {
        id: '   ',
        brew_name: '\t\n',
      };

      expect(isBeer(obj)).toBe(true);
    });
  });

  describe('isBeer - Property Access Edge Cases', () => {
    it('should accept object with getters', () => {
      const obj = Object.defineProperty({}, 'id', {
        get: () => '123',
        enumerable: true,
      });
      Object.defineProperty(obj, 'brew_name', {
        get: () => 'Test Beer',
        enumerable: true,
      });

      expect(isBeer(obj)).toBe(true);
    });

    it('should accept frozen object', () => {
      const obj = Object.freeze({
        id: '123',
        brew_name: 'Test Beer',
      });

      expect(isBeer(obj)).toBe(true);
    });

    it('should accept sealed object', () => {
      const obj = Object.seal({
        id: '123',
        brew_name: 'Test Beer',
      });

      expect(isBeer(obj)).toBe(true);
    });

    it('should accept object with extra properties', () => {
      const obj = {
        id: '123',
        brew_name: 'Test Beer',
        extra_field: 'value',
        another_field: 42,
      };

      expect(isBeer(obj)).toBe(true);
    });

    it('should reject object with Symbol properties only', () => {
      const sym1 = Symbol('id');
      const sym2 = Symbol('brew_name');
      const obj = {
        [sym1]: '123',
        [sym2]: 'Test Beer',
      };

      expect(isBeer(obj)).toBe(false);
    });

    it('should accept object with non-enumerable properties', () => {
      const obj = Object.create(null);
      Object.defineProperty(obj, 'id', {
        value: '123',
        enumerable: true,
      });
      Object.defineProperty(obj, 'brew_name', {
        value: 'Test Beer',
        enumerable: true,
      });
      Object.defineProperty(obj, 'hidden', {
        value: 'secret',
        enumerable: false,
      });

      expect(isBeer(obj)).toBe(true);
    });
  });

  describe('isBeer - Unicode and Special Characters', () => {
    it('should accept object with emoji in brew_name', () => {
      const obj = {
        id: '123',
        brew_name: '🍺 Test Beer 🎉',
      };

      expect(isBeer(obj)).toBe(true);
    });

    it('should accept object with RTL text', () => {
      const obj = {
        id: '123',
        brew_name: 'בירה טובה',
      };

      expect(isBeer(obj)).toBe(true);
    });

    it('should accept object with Chinese characters', () => {
      const obj = {
        id: '123',
        brew_name: '日本のビール',
      };

      expect(isBeer(obj)).toBe(true);
    });

    it('should accept object with zero-width characters', () => {
      const obj = {
        id: '123',
        brew_name: 'Test\u200BBeer',
      };

      expect(isBeer(obj)).toBe(true);
    });
  });
});

describe('isSessionData - Edge Cases', () => {
  describe('Required Fields Validation', () => {
    it('should reject object missing memberId', () => {
      const obj = {
        storeId: '456',
        storeName: 'Test Store',
        sessionId: '789',
      };

      expect(isSessionData(obj)).toBe(false);
    });

    it('should reject object missing storeId', () => {
      const obj = {
        memberId: '123',
        storeName: 'Test Store',
        sessionId: '789',
      };

      expect(isSessionData(obj)).toBe(false);
    });

    it('should reject object missing storeName', () => {
      const obj = {
        memberId: '123',
        storeId: '456',
        sessionId: '789',
      };

      expect(isSessionData(obj)).toBe(false);
    });

    it('should reject object missing sessionId', () => {
      const obj = {
        memberId: '123',
        storeId: '456',
        storeName: 'Test Store',
      };

      expect(isSessionData(obj)).toBe(false);
    });

    it('should accept object with all required fields plus optional fields', () => {
      const obj = {
        memberId: '123',
        storeId: '456',
        storeName: 'Test Store',
        sessionId: '789',
        username: 'testuser',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        cardNum: 'CARD123',
      };

      expect(isSessionData(obj)).toBe(true);
    });

    it('should reject object with required field as null', () => {
      const obj = {
        memberId: null,
        storeId: '456',
        storeName: 'Test Store',
        sessionId: '789',
      };

      expect(isSessionData(obj)).toBe(false);
    });

    it('should reject object with required field as number', () => {
      const obj = {
        memberId: 123,
        storeId: '456',
        storeName: 'Test Store',
        sessionId: '789',
      };

      expect(isSessionData(obj)).toBe(false);
    });
  });
});

describe('isPreference - Edge Cases', () => {
  describe('Required Fields Validation', () => {
    it('should reject object missing key', () => {
      const obj = {
        value: 'test_value',
        description: 'test description',
      };

      expect(isPreference(obj)).toBe(false);
    });

    it('should reject object missing value', () => {
      const obj = {
        key: 'test_key',
        description: 'test description',
      };

      expect(isPreference(obj)).toBe(false);
    });

    it('should reject object missing description', () => {
      const obj = {
        key: 'test_key',
        value: 'test_value',
      };

      expect(isPreference(obj)).toBe(false);
    });

    it('should accept object with all three fields', () => {
      const obj = {
        key: 'test_key',
        value: 'test_value',
        description: 'test description',
      };

      expect(isPreference(obj)).toBe(true);
    });

    it('should accept object with empty strings', () => {
      const obj = {
        key: 'test_key',
        value: '',
        description: '',
      };

      expect(isPreference(obj)).toBe(true);
    });

    it('should reject object with key as number', () => {
      const obj = {
        key: 123,
        value: 'test_value',
        description: 'test description',
      };

      expect(isPreference(obj)).toBe(false);
    });

    it('should reject object with value as object', () => {
      const obj = {
        key: 'test_key',
        value: { nested: 'value' },
        description: 'test description',
      };

      expect(isPreference(obj)).toBe(false);
    });
  });
});

describe('isReward - Edge Cases', () => {
  describe('Required Fields Validation', () => {
    it('should reject object missing reward_id', () => {
      const obj = {
        redeemed: 'true',
        reward_type: 'plate',
      };

      expect(isReward(obj)).toBe(false);
    });

    it('should reject object missing redeemed', () => {
      const obj = {
        reward_id: '123',
        reward_type: 'plate',
      };

      expect(isReward(obj)).toBe(false);
    });

    it('should reject object missing reward_type', () => {
      const obj = {
        reward_id: '123',
        redeemed: 'true',
      };

      expect(isReward(obj)).toBe(false);
    });

    it('should accept object with all three fields', () => {
      const obj = {
        reward_id: '123',
        redeemed: 'true',
        reward_type: 'plate',
      };

      expect(isReward(obj)).toBe(true);
    });

    it('should accept object with redeemed as "0"', () => {
      const obj = {
        reward_id: '123',
        redeemed: '0',
        reward_type: 'plate',
      };

      expect(isReward(obj)).toBe(true);
    });

    it('should accept object with redeemed as "1"', () => {
      const obj = {
        reward_id: '123',
        redeemed: '1',
        reward_type: 'plate',
      };

      expect(isReward(obj)).toBe(true);
    });

    it('should accept object with empty strings', () => {
      const obj = {
        reward_id: '123',
        redeemed: '',
        reward_type: '',
      };

      expect(isReward(obj)).toBe(true);
    });

    it('should reject object with reward_id as number', () => {
      const obj = {
        reward_id: 123,
        redeemed: 'true',
        reward_type: 'plate',
      };

      expect(isReward(obj)).toBe(false);
    });
  });
});
