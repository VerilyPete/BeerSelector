import { isBeer, isBeerfinder, isBeerDetails } from '../beer';
import { isSessionData, isApiResponse, isLoginResult } from '../api';
import { isPreference, isReward, isUntappdCookie } from '../database';

describe('Type Guards', () => {
  describe('Beer Type Guards', () => {
    describe('isBeer', () => {
      it('should return true for valid Beer objects', () => {
        const validBeer = {
          id: 'beer-123',
          brew_name: 'Test Beer'
        };
        
        expect(isBeer(validBeer)).toBe(true);
      });
      
      it('should return false for invalid Beer objects', () => {
        const missingId = {
          brew_name: 'Test Beer'
        };
        
        const missingName = {
          id: 'beer-123'
        };
        
        const wrongTypes = {
          id: 123,
          brew_name: 'Test Beer'
        };
        
        expect(isBeer(missingId)).toBe(false);
        expect(isBeer(missingName)).toBe(false);
        expect(isBeer(wrongTypes)).toBe(false);
        expect(isBeer(null)).toBe(false);
        expect(isBeer(undefined)).toBe(false);
      });
    });
    
    describe('isBeerfinder', () => {
      it('should return true for valid Beerfinder objects', () => {
        const validBeerfinder = {
          id: 'beer-123',
          brew_name: 'Test Beer',
          tasted_date: '2023-01-01'
        };
        
        expect(isBeerfinder(validBeerfinder)).toBe(true);
      });
      
      it('should return false for objects that are not Beerfinder', () => {
        const regularBeer = {
          id: 'beer-123',
          brew_name: 'Test Beer'
        };
        
        expect(isBeerfinder(regularBeer)).toBe(false);
      });
    });
    
    describe('isBeerDetails', () => {
      it('should return true for valid BeerDetails objects', () => {
        const validBeerDetails = {
          id: 'beer-123',
          brew_name: 'Test Beer',
          abv: '5.5%',
          ibu: '45'
        };
        
        expect(isBeerDetails(validBeerDetails)).toBe(true);
      });
      
      it('should return false for objects that are not BeerDetails', () => {
        const regularBeer = {
          id: 'beer-123',
          brew_name: 'Test Beer'
        };
        
        expect(isBeerDetails(regularBeer)).toBe(false);
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
          sessionId: 'session-123'
        };
        
        expect(isSessionData(validSessionData)).toBe(true);
      });
      
      it('should return false for invalid SessionData objects', () => {
        const missingMemberId = {
          storeId: 'store-123',
          storeName: 'Test Store',
          sessionId: 'session-123'
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
          statusCode: 200
        };
        
        expect(isApiResponse(validApiResponse)).toBe(true);
      });
      
      it('should return false for invalid ApiResponse objects', () => {
        const missingSuccess = {
          data: { test: 'data' },
          statusCode: 200
        };
        
        const missingStatusCode = {
          success: true,
          data: { test: 'data' }
        };
        
        expect(isApiResponse(missingSuccess)).toBe(false);
        expect(isApiResponse(missingStatusCode)).toBe(false);
      });
    });
    
    describe('isLoginResult', () => {
      it('should return true for valid LoginResult objects', () => {
        const validLoginResult = {
          success: true,
          message: 'Login successful'
        };
        
        expect(isLoginResult(validLoginResult)).toBe(true);
      });
      
      it('should return false for invalid LoginResult objects', () => {
        const missingSuccess = {
          message: 'Login successful'
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
          description: 'Test description'
        };
        
        expect(isPreference(validPreference)).toBe(true);
      });
      
      it('should return false for invalid Preference objects', () => {
        const missingKey = {
          value: 'test-value',
          description: 'Test description'
        };
        
        expect(isPreference(missingKey)).toBe(false);
      });
    });
    
    describe('isReward', () => {
      it('should return true for valid Reward objects', () => {
        const validReward = {
          reward_id: 'reward-123',
          redeemed: '2023-01-01',
          reward_type: 'free-beer'
        };
        
        expect(isReward(validReward)).toBe(true);
      });
      
      it('should return false for invalid Reward objects', () => {
        const missingId = {
          redeemed: '2023-01-01',
          reward_type: 'free-beer'
        };
        
        expect(isReward(missingId)).toBe(false);
      });
    });
    
    describe('isUntappdCookie', () => {
      it('should return true for valid UntappdCookie objects', () => {
        const validCookie = {
          key: 'cookie-key',
          value: 'cookie-value',
          description: 'Cookie description'
        };
        
        expect(isUntappdCookie(validCookie)).toBe(true);
      });
      
      it('should return false for invalid UntappdCookie objects', () => {
        const missingKey = {
          value: 'cookie-value',
          description: 'Cookie description'
        };
        
        expect(isUntappdCookie(missingKey)).toBe(false);
      });
    });
  });
});
