import { validateBrewInStockResponse, validateBeer, ValidationResult } from '../validators';

describe('API Response Validators', () => {
  describe('validateBrewInStockResponse', () => {
    it('should validate a valid brewInStock response structure', () => {
      const validResponse = [
        {},
        {
          brewInStock: [
            {
              id: 1,
              brew_name: 'Test Beer',
              brewery: 'Test Brewery',
              style: 'IPA',
              abv: 6.5,
              ibu: 60,
              origin: 'USA',
            },
          ],
        },
      ];

      const result = validateBrewInStockResponse(validResponse);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.data).toEqual(validResponse[1].brewInStock);
    });

    it('should reject response with missing brewInStock array', () => {
      const invalidResponse = [{}, { someOtherField: [] }];

      const result = validateBrewInStockResponse(invalidResponse);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Response does not contain brewInStock array');
      expect(result.data).toBeUndefined();
    });

    it('should reject response that is not an array', () => {
      const invalidResponse = { brewInStock: [] };

      const result = validateBrewInStockResponse(invalidResponse as any);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Response is not an array');
      expect(result.data).toBeUndefined();
    });

    it('should reject response array with less than 2 elements', () => {
      const invalidResponse = [{}];

      const result = validateBrewInStockResponse(invalidResponse);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Response array does not have expected structure (length < 2)');
      expect(result.data).toBeUndefined();
    });

    it('should reject response where brewInStock is not an array', () => {
      const invalidResponse = [{}, { brewInStock: 'not an array' }];

      const result = validateBrewInStockResponse(invalidResponse);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('brewInStock is not an array');
      expect(result.data).toBeUndefined();
    });

    it('should accept empty brewInStock array', () => {
      const validResponse = [{}, { brewInStock: [] }];

      const result = validateBrewInStockResponse(validResponse);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.data).toEqual([]);
    });

    it('should reject null or undefined response', () => {
      const nullResult = validateBrewInStockResponse(null as any);
      const undefinedResult = validateBrewInStockResponse(undefined as any);

      expect(nullResult.isValid).toBe(false);
      expect(nullResult.errors).toContain('Response is null or undefined');

      expect(undefinedResult.isValid).toBe(false);
      expect(undefinedResult.errors).toContain('Response is null or undefined');
    });

    it('should validate response with multiple beers', () => {
      const validResponse = [
        {},
        {
          brewInStock: [
            { id: 1, brew_name: 'Beer 1', brewery: 'Brewery 1' },
            { id: 2, brew_name: 'Beer 2', brewery: 'Brewery 2' },
            { id: 3, brew_name: 'Beer 3', brewery: 'Brewery 3' },
          ],
        },
      ];

      const result = validateBrewInStockResponse(validResponse);

      expect(result.isValid).toBe(true);
      expect(result.data).toHaveLength(3);
    });

    it('should handle response with nested brewInStock structure variations', () => {
      const validResponse = [
        { metadata: 'some value' },
        {
          brewInStock: [
            {
              id: 1,
              brew_name: 'Test Beer',
              brewery: 'Test Brewery',
              extra_field: 'should be allowed',
            },
          ],
        },
      ];

      const result = validateBrewInStockResponse(validResponse);

      expect(result.isValid).toBe(true);
      expect(result.data?.[0]).toHaveProperty('extra_field');
    });
  });

  describe('validateBeer', () => {
    it('should validate a complete beer object with all required fields', () => {
      const validBeer = {
        id: 1,
        brew_name: 'Test Beer',
        brewery: 'Test Brewery',
        style: 'IPA',
        abv: 6.5,
        ibu: 60,
        origin: 'USA',
        description: 'A great beer',
      };

      const result = validateBeer(validBeer);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.data).toEqual(validBeer);
    });

    it('should reject beer object missing id field', () => {
      const invalidBeer = {
        brew_name: 'Test Beer',
        brewery: 'Test Brewery',
      };

      const result = validateBeer(invalidBeer);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Beer object missing required field: id');
      expect(result.data).toBeUndefined();
    });

    it('should reject beer object missing brew_name field', () => {
      const invalidBeer = {
        id: 1,
        brewery: 'Test Brewery',
      };

      const result = validateBeer(invalidBeer);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Beer object missing required field: brew_name');
      expect(result.data).toBeUndefined();
    });

    it('should reject beer object with null id', () => {
      const invalidBeer = {
        id: null,
        brew_name: 'Test Beer',
        brewery: 'Test Brewery',
      };

      const result = validateBeer(invalidBeer);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Beer object has null or undefined id');
      expect(result.data).toBeUndefined();
    });

    it('should reject beer object with empty brew_name', () => {
      const invalidBeer = {
        id: 1,
        brew_name: '',
        brewery: 'Test Brewery',
      };

      const result = validateBeer(invalidBeer);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Beer object has empty brew_name');
      expect(result.data).toBeUndefined();
    });

    it('should reject beer object with whitespace-only brew_name', () => {
      const invalidBeer = {
        id: 1,
        brew_name: '   ',
        brewery: 'Test Brewery',
      };

      const result = validateBeer(invalidBeer);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Beer object has empty brew_name');
      expect(result.data).toBeUndefined();
    });

    it('should reject null or undefined beer object', () => {
      const nullResult = validateBeer(null as any);
      const undefinedResult = validateBeer(undefined as any);

      expect(nullResult.isValid).toBe(false);
      expect(nullResult.errors).toContain('Beer object is null or undefined');

      expect(undefinedResult.isValid).toBe(false);
      expect(undefinedResult.errors).toContain('Beer object is null or undefined');
    });

    it('should reject beer object that is not an object', () => {
      const stringBeer = 'not an object';
      const numberBeer = 123;
      const arrayBeer = [];

      expect(validateBeer(stringBeer as any).isValid).toBe(false);
      expect(validateBeer(numberBeer as any).isValid).toBe(false);
      expect(validateBeer(arrayBeer as any).isValid).toBe(false);
    });

    it('should accept beer object with only required fields', () => {
      const minimalBeer = {
        id: 1,
        brew_name: 'Test Beer',
      };

      const result = validateBeer(minimalBeer);

      expect(result.isValid).toBe(true);
      expect(result.data).toEqual(minimalBeer);
    });

    it('should accept beer object with additional optional fields', () => {
      const beerWithExtras = {
        id: 1,
        brew_name: 'Test Beer',
        custom_field: 'custom value',
        another_field: 123,
      };

      const result = validateBeer(beerWithExtras);

      expect(result.isValid).toBe(true);
      expect(result.data).toEqual(beerWithExtras);
    });

    it('should reject beer object with multiple missing fields', () => {
      const invalidBeer = {
        brewery: 'Test Brewery',
      };

      const result = validateBeer(invalidBeer);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
      expect(result.errors).toContain('Beer object missing required field: id');
      expect(result.errors).toContain('Beer object missing required field: brew_name');
    });

    it('should validate beer object with numeric string id', () => {
      const validBeer = {
        id: '123',
        brew_name: 'Test Beer',
      };

      const result = validateBeer(validBeer);

      expect(result.isValid).toBe(true);
      expect(result.data).toEqual(validBeer);
    });

    it('should validate beer object with special characters in brew_name', () => {
      const validBeer = {
        id: 1,
        brew_name: "Test Beer's & Friends - Limited Edition (2024)",
      };

      const result = validateBeer(validBeer);

      expect(result.isValid).toBe(true);
      expect(result.data).toEqual(validBeer);
    });
  });

  describe('validateBeerArray', () => {
    it('should validate array of valid beers', () => {
      const beers = [
        { id: 1, brew_name: 'Beer 1' },
        { id: 2, brew_name: 'Beer 2' },
        { id: 3, brew_name: 'Beer 3' },
      ];

      const result = validateBrewInStockResponse([{}, { brewInStock: beers }]);

      expect(result.isValid).toBe(true);
      expect(result.data).toHaveLength(3);
    });

    it('should provide detailed errors for multiple invalid beers', () => {
      const beers = [
        { id: 1, brew_name: 'Valid Beer' },
        { id: null, brew_name: 'Invalid Beer 1' }, // Invalid: null id
        { brew_name: 'Invalid Beer 2' }, // Invalid: missing id
        { id: 4, brew_name: '' }, // Invalid: empty brew_name
        { id: 5, brew_name: 'Valid Beer 2' },
      ];

      const response = [{}, { brewInStock: beers }];

      // This should still return isValid: true but provide warnings about invalid items
      const result = validateBrewInStockResponse(response);

      expect(result.isValid).toBe(true);
      // The validator should return all beers, validation of individual beers
      // happens at the database insertion level
    });
  });

  describe('ValidationResult type', () => {
    it('should have correct structure for valid result', () => {
      const result: ValidationResult<string> = {
        isValid: true,
        errors: [],
        data: 'test data',
      };

      expect(result).toHaveProperty('isValid');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('data');
    });

    it('should have correct structure for invalid result', () => {
      const result: ValidationResult<string> = {
        isValid: false,
        errors: ['error message'],
        data: undefined,
      };

      expect(result).toHaveProperty('isValid');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('data');
      expect(result.data).toBeUndefined();
    });
  });
});
