import { isPreference, isReward } from '../database';
import { Preference, Reward } from '../database';

describe('Database Type Guards', () => {
  describe('isPreference', () => {
    it('should return true for valid Preference objects', () => {
      const validPreference: Preference = {
        key: 'test-key',
        value: 'test-value',
        description: 'Test description',
      };

      expect(isPreference(validPreference)).toBe(true);
    });

    it('should return false for invalid Preference objects', () => {
      const missingKey = {
        value: 'test-value',
        description: 'Test description',
      };

      const missingValue = {
        key: 'test-key',
        description: 'Test description',
      };

      const missingDescription = {
        key: 'test-key',
        value: 'test-value',
      };

      const wrongTypes = {
        key: 123,
        value: 'test-value',
        description: 'Test description',
      };

      expect(isPreference(missingKey)).toBe(false);
      expect(isPreference(missingValue)).toBe(false);
      expect(isPreference(missingDescription)).toBe(false);
      expect(isPreference(wrongTypes)).toBe(false);
      expect(isPreference(null)).toBe(false);
      expect(isPreference(undefined)).toBe(false);
    });
  });

  describe('isReward', () => {
    it('should return true for valid Reward objects', () => {
      const validReward: Reward = {
        reward_id: 'test-reward-id',
        redeemed: 'false',
        reward_type: 'test-reward-type',
      };

      expect(isReward(validReward)).toBe(true);
    });

    it('should return false for invalid Reward objects', () => {
      const missingRewardId = {
        redeemed: 'false',
        reward_type: 'test-reward-type',
      };

      const missingRedeemed = {
        reward_id: 'test-reward-id',
        reward_type: 'test-reward-type',
      };

      const missingRewardType = {
        reward_id: 'test-reward-id',
        redeemed: 'false',
      };

      const wrongTypes = {
        reward_id: 123,
        redeemed: 'false',
        reward_type: 'test-reward-type',
      };

      expect(isReward(missingRewardId)).toBe(false);
      expect(isReward(missingRedeemed)).toBe(false);
      expect(isReward(missingRewardType)).toBe(false);
      expect(isReward(wrongTypes)).toBe(false);
      expect(isReward(null)).toBe(false);
      expect(isReward(undefined)).toBe(false);
    });
  });
});
