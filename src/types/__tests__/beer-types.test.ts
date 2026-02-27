import { isBeer } from '../beer';
import { Beer } from '../beer';

describe('Beer Type Guards', () => {
  describe('isBeer', () => {
    it('should return true for valid Beer objects', () => {
      const validBeer: Beer = {
        id: 'beer-123',
        brew_name: 'Test Beer',
        brewer: 'Test Brewery'
      };

      expect(isBeer(validBeer)).toBe(true);
    });

    it('should return false for invalid Beer objects', () => {
      const missingId = {
        brew_name: 'Test Beer',
        brewer: 'Test Brewery'
      };

      const missingBrewName = {
        id: 'beer-123',
        brewer: 'Test Brewery'
      };

      const wrongTypes = {
        id: 123,
        brew_name: 'Test Beer',
        brewer: 'Test Brewery'
      };

      expect(isBeer(missingId)).toBe(false);
      expect(isBeer(missingBrewName)).toBe(false);
      expect(isBeer(wrongTypes)).toBe(false);
      expect(isBeer(null)).toBe(false);
      expect(isBeer(undefined)).toBe(false);
    });
  });
});
