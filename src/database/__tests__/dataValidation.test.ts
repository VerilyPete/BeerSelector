import {
  validateBeerForInsertion,
  validateBeersForInsertion,
  ValidationSummary,
} from '../dataValidation';

describe('Database Data Validation', () => {
  describe('validateBeerForInsertion', () => {
    it('should validate a complete valid beer object', () => {
      const validBeer = {
        id: 1,
        brew_name: 'Test IPA',
        brewery: 'Test Brewery',
        style: 'IPA',
        abv: 6.5,
        ibu: 60,
        origin: 'USA',
      };

      const result = validateBeerForInsertion(validBeer);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate beer with minimal required fields', () => {
      const minimalBeer = {
        id: 1,
        brew_name: 'Test Beer',
      };

      const result = validateBeerForInsertion(minimalBeer);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject beer missing id field', () => {
      const invalidBeer = {
        brew_name: 'Test Beer',
        brewery: 'Test Brewery',
      };

      const result = validateBeerForInsertion(invalidBeer);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Missing required field: id');
    });

    it('should reject beer missing brew_name field', () => {
      const invalidBeer = {
        id: 1,
        brewery: 'Test Brewery',
      };

      const result = validateBeerForInsertion(invalidBeer);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Missing required field: brew_name');
    });

    it('should reject beer with null id', () => {
      const invalidBeer = {
        id: null,
        brew_name: 'Test Beer',
      };

      const result = validateBeerForInsertion(invalidBeer);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Field id is null or undefined');
    });

    it('should reject beer with undefined id', () => {
      const invalidBeer = {
        id: undefined,
        brew_name: 'Test Beer',
      };

      const result = validateBeerForInsertion(invalidBeer);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Field id is null or undefined');
    });

    it('should reject beer with empty brew_name', () => {
      const invalidBeer = {
        id: 1,
        brew_name: '',
      };

      const result = validateBeerForInsertion(invalidBeer);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Field brew_name is empty string');
    });

    it('should reject beer with whitespace-only brew_name', () => {
      const invalidBeer = {
        id: 1,
        brew_name: '   ',
      };

      const result = validateBeerForInsertion(invalidBeer);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Field brew_name is empty string');
    });

    it('should reject null beer object', () => {
      const result = validateBeerForInsertion(null as any);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Beer object is null or undefined');
    });

    it('should reject undefined beer object', () => {
      const result = validateBeerForInsertion(undefined as any);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Beer object is null or undefined');
    });

    it('should reject non-object beer', () => {
      const stringBeer = 'not an object';
      const numberBeer = 123;

      expect(validateBeerForInsertion(stringBeer as any).isValid).toBe(false);
      expect(validateBeerForInsertion(numberBeer as any).isValid).toBe(false);
    });

    it('should accept beer with numeric string id', () => {
      const beer = {
        id: '123',
        brew_name: 'Test Beer',
      };

      const result = validateBeerForInsertion(beer);

      expect(result.isValid).toBe(true);
    });

    it('should accept beer with special characters in name', () => {
      const beer = {
        id: 1,
        brew_name: "O'Malley's & Friends - Imperial IPA (2024)",
      };

      const result = validateBeerForInsertion(beer);

      expect(result.isValid).toBe(true);
    });

    it('should accept beer with additional optional fields', () => {
      const beer = {
        id: 1,
        brew_name: 'Test Beer',
        brewery: 'Test Brewery',
        style: 'IPA',
        abv: 6.5,
        ibu: 60,
        origin: 'USA',
        custom_field: 'custom value',
      };

      const result = validateBeerForInsertion(beer);

      expect(result.isValid).toBe(true);
    });

    it('should collect multiple validation errors', () => {
      const invalidBeer = {
        brewery: 'Test Brewery',
      };

      const result = validateBeerForInsertion(invalidBeer);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
      expect(result.errors).toContain('Missing required field: id');
      expect(result.errors).toContain('Missing required field: brew_name');
    });
  });

  describe('validateBeersForInsertion', () => {
    it('should validate array of all valid beers', () => {
      const beers = [
        { id: 1, brew_name: 'Beer 1', brewery: 'Brewery 1' },
        { id: 2, brew_name: 'Beer 2', brewery: 'Brewery 2' },
        { id: 3, brew_name: 'Beer 3', brewery: 'Brewery 3' },
      ];

      const result = validateBeersForInsertion(beers);

      expect(result.validBeers).toHaveLength(3);
      expect(result.invalidBeers).toHaveLength(0);
      expect(result.summary.total).toBe(3);
      expect(result.summary.valid).toBe(3);
      expect(result.summary.invalid).toBe(0);
    });

    it('should separate valid and invalid beers', () => {
      const beers = [
        { id: 1, brew_name: 'Valid Beer 1' },
        { id: null, brew_name: 'Invalid Beer 1' }, // Invalid: null id
        { brew_name: 'Invalid Beer 2' }, // Invalid: missing id
        { id: 4, brew_name: '' }, // Invalid: empty brew_name
        { id: 5, brew_name: 'Valid Beer 2' },
      ];

      const result = validateBeersForInsertion(beers);

      expect(result.validBeers).toHaveLength(2);
      expect(result.invalidBeers).toHaveLength(3);
      expect(result.summary.total).toBe(5);
      expect(result.summary.valid).toBe(2);
      expect(result.summary.invalid).toBe(3);
    });

    it('should provide detailed error information for invalid beers', () => {
      const beers = [
        { id: 1, brew_name: 'Valid Beer' },
        { id: null, brew_name: 'Invalid Beer' },
      ];

      const result = validateBeersForInsertion(beers);

      expect(result.invalidBeers).toHaveLength(1);
      expect(result.invalidBeers[0].beer).toEqual({ id: null, brew_name: 'Invalid Beer' });
      expect(result.invalidBeers[0].errors).toContain('Field id is null or undefined');
    });

    it('should handle empty array', () => {
      const beers: any[] = [];

      const result = validateBeersForInsertion(beers);

      expect(result.validBeers).toHaveLength(0);
      expect(result.invalidBeers).toHaveLength(0);
      expect(result.summary.total).toBe(0);
      expect(result.summary.valid).toBe(0);
      expect(result.summary.invalid).toBe(0);
    });

    it('should handle array with all invalid beers', () => {
      const beers = [
        { brew_name: 'Missing ID 1' },
        { id: null, brew_name: 'Null ID' },
        { id: 3, brew_name: '' },
      ];

      const result = validateBeersForInsertion(beers);

      expect(result.validBeers).toHaveLength(0);
      expect(result.invalidBeers).toHaveLength(3);
      expect(result.summary.valid).toBe(0);
      expect(result.summary.invalid).toBe(3);
    });

    it('should preserve order of valid beers', () => {
      const beers = [
        { id: 1, brew_name: 'Beer 1' },
        { id: 999, brew_name: '' }, // Invalid
        { id: 2, brew_name: 'Beer 2' },
        { id: 3, brew_name: 'Beer 3' },
      ];

      const result = validateBeersForInsertion(beers);

      expect(result.validBeers).toHaveLength(3);
      expect(result.validBeers[0].id).toBe(1);
      expect(result.validBeers[1].id).toBe(2);
      expect(result.validBeers[2].id).toBe(3);
    });

    it('should generate correct summary', () => {
      const beers = [
        { id: 1, brew_name: 'Valid 1' },
        { id: 2, brew_name: 'Valid 2' },
        { id: null, brew_name: 'Invalid 1' },
        { id: 4, brew_name: '' },
        { id: 5, brew_name: 'Valid 3' },
      ];

      const result = validateBeersForInsertion(beers);
      const { summary } = result;

      expect(summary.total).toBe(5);
      expect(summary.valid).toBe(3);
      expect(summary.invalid).toBe(2);
      expect(summary.total).toBe(summary.valid + summary.invalid);
    });

    it('should handle large dataset efficiently', () => {
      const beers = Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        brew_name: `Beer ${i}`,
      }));

      const startTime = Date.now();
      const result = validateBeersForInsertion(beers);
      const duration = Date.now() - startTime;

      expect(result.validBeers).toHaveLength(1000);
      expect(result.invalidBeers).toHaveLength(0);
      expect(duration).toBeLessThan(1000); // Should complete in less than 1 second
    });

    it('should handle mixed valid/invalid in large dataset', () => {
      const beers = Array.from({ length: 100 }, (_, i) => {
        if (i % 10 === 0) {
          // Every 10th beer is invalid
          return { brew_name: `Beer ${i}` }; // Missing id
        }
        return { id: i, brew_name: `Beer ${i}` };
      });

      const result = validateBeersForInsertion(beers);

      expect(result.validBeers).toHaveLength(90);
      expect(result.invalidBeers).toHaveLength(10);
      expect(result.summary.total).toBe(100);
    });
  });

  describe('ValidationSummary type', () => {
    it('should have correct structure', () => {
      const summary: ValidationSummary = {
        total: 10,
        valid: 8,
        invalid: 2,
      };

      expect(summary).toHaveProperty('total');
      expect(summary).toHaveProperty('valid');
      expect(summary).toHaveProperty('invalid');
      expect(summary.total).toBe(summary.valid + summary.invalid);
    });
  });

  describe('Integration with real API data patterns', () => {
    it('should validate Flying Saucer API response structure', () => {
      const beersFromAPI = [
        {
          id: 12345,
          brew_name: 'Stone IPA',
          brewery: 'Stone Brewing',
          style: 'IPA',
          abv: 6.9,
          ibu: 71,
          origin: 'Escondido, CA',
        },
        {
          id: 12346,
          brew_name: "Bell's Two Hearted Ale",
          brewery: "Bell's Brewery",
          style: 'American IPA',
          abv: 7.0,
          ibu: 55,
          origin: 'Kalamazoo, MI',
        },
      ];

      const result = validateBeersForInsertion(beersFromAPI);

      expect(result.validBeers).toHaveLength(2);
      expect(result.summary.invalid).toBe(0);
    });

    it('should handle API returning beers with extra fields', () => {
      const beersWithExtras = [
        {
          id: 1,
          brew_name: 'Test Beer',
          brewery: 'Test Brewery',
          extra_field_1: 'should be accepted',
          extra_field_2: 123,
          nested_object: { key: 'value' },
        },
      ];

      const result = validateBeersForInsertion(beersWithExtras);

      expect(result.validBeers).toHaveLength(1);
      expect(result.validBeers[0]).toHaveProperty('extra_field_1');
    });

    it('should handle API returning beers with missing optional fields', () => {
      const beersMinimal = [
        { id: 1, brew_name: 'Beer 1' },
        { id: 2, brew_name: 'Beer 2', brewery: 'Brewery 2' },
        {
          id: 3,
          brew_name: 'Beer 3',
          brewery: 'Brewery 3',
          style: 'IPA',
        },
      ];

      const result = validateBeersForInsertion(beersMinimal);

      expect(result.validBeers).toHaveLength(3);
    });
  });
});
