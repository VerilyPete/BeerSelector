import { isBeer, isBeerfinder } from '../beer';

describe('Type Guards', () => {
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
      
      expect(isBeer(missingId)).toBe(false);
      expect(isBeer(missingName)).toBe(false);
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
});
