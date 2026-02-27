import { isBeer } from '../beer';
import { isSessionData, isApiResponse, isLoginResult } from '../api';
import { isPreference, isReward } from '../database';

describe('Type Guards', () => {
  describe('Beer Type Guards', () => {
    describe('isBeer', () => {
      it('should return true for valid Beer objects', () => {
        const validBeer = {
          id: 'beer-123',
          brew_name: 'Test Beer',
        };

        expect(isBeer(validBeer)).toBe(true);
      });

      it('should return false for invalid Beer objects', () => {
        const missingId = {
          brew_name: 'Test Beer',
        };

        const missingName = {
          id: 'beer-123',
        };

        const wrongTypes = {
          id: 123,
          brew_name: 'Test Beer',
        };

        expect(isBeer(missingId)).toBe(false);
        expect(isBeer(missingName)).toBe(false);
        expect(isBeer(wrongTypes)).toBe(false);
        expect(isBeer(null)).toBe(false);
        expect(isBeer(undefined)).toBe(false);
      });
    });
  });

  describe('API Type Guards', () => {
    describe('isSessionData', () => {
      it('should return true for valid SessionData objects', () => {
        const validSessionData = {
          memberId: 'member-123',
          storeId: 'store-123',
          storeName: 'Test Store',
          sessionId: 'session-123',
        };

        expect(isSessionData(validSessionData)).toBe(true);
      });

      it('should return false for invalid SessionData objects', () => {
        const missingMemberId = {
          storeId: 'store-123',
          storeName: 'Test Store',
          sessionId: 'session-123',
        };

        expect(isSessionData(missingMemberId)).toBe(false);
        expect(isSessionData(null)).toBe(false);
      });
    });

    describe('isApiResponse', () => {
      it('should return true for valid ApiResponse objects', () => {
        const validApiResponse = {
          success: true,
          data: { test: 'data' },
          statusCode: 200,
        };

        expect(isApiResponse(validApiResponse)).toBe(true);
      });

      it('should return false for invalid ApiResponse objects', () => {
        const missingSuccess = {
          data: { test: 'data' },
          statusCode: 200,
        };

        const missingStatusCode = {
          success: true,
          data: { test: 'data' },
        };

        expect(isApiResponse(missingSuccess)).toBe(false);
        expect(isApiResponse(missingStatusCode)).toBe(false);
      });
    });

    describe('isLoginResult', () => {
      it('should return true for valid success LoginResult objects', () => {
        const validLoginResult = {
          success: true,
          message: 'Login successful',
          sessionData: { memberId: '1', storeId: '2', storeName: 'S', sessionId: '3' },
          statusCode: 200,
        };

        expect(isLoginResult(validLoginResult)).toBe(true);
      });

      it('should return true for valid failure LoginResult objects', () => {
        const failureResult = {
          success: false,
          error: 'Login failed',
          statusCode: 401,
        };

        expect(isLoginResult(failureResult)).toBe(true);
      });

      it('should return false for invalid LoginResult objects', () => {
        const missingSuccess = {
          message: 'Login successful',
        };

        expect(isLoginResult(missingSuccess)).toBe(false);
        expect(isLoginResult(null)).toBe(false);
      });
    });
  });

  describe('Database Type Guards', () => {
    describe('isPreference', () => {
      it('should return true for valid Preference objects', () => {
        const validPreference = {
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

        expect(isPreference(missingKey)).toBe(false);
      });
    });

    describe('isReward', () => {
      it('should return true for valid Reward objects', () => {
        const validReward = {
          reward_id: 'reward-123',
          redeemed: '2023-01-01',
          reward_type: 'free-beer',
        };

        expect(isReward(validReward)).toBe(true);
      });

      it('should return false for invalid Reward objects', () => {
        const missingId = {
          redeemed: '2023-01-01',
          reward_type: 'free-beer',
        };

        expect(isReward(missingId)).toBe(false);
      });
    });
  });
});
