/**
 * Comprehensive tests for BeerRepository
 * Tests CRUD operations for Beer entity using TDD approach
 */

import { BeerRepository } from '../BeerRepository';
import { Beer, BeerWithContainerType } from '../../../types/beer';
import * as connection from '../../connection';

// Mock the database connection module
jest.mock('../../connection');

type MockDatabase = {
  withTransactionAsync: jest.Mock;
  runAsync: jest.Mock;
  getAllAsync: jest.Mock;
  getFirstAsync: jest.Mock;
};

function createMockDatabase(): MockDatabase {
  return {
    withTransactionAsync: jest.fn(async (callback: () => Promise<void>) => await callback()),
    runAsync: jest.fn(),
    getAllAsync: jest.fn(),
    getFirstAsync: jest.fn(),
  };
}

function createRepository(): BeerRepository {
  return new BeerRepository();
}

describe('BeerRepository', () => {
  describe('insertMany', () => {
    it('should insert multiple beers in batches', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();
      const beers: BeerWithContainerType[] = [
        {
          id: '1',
          brew_name: 'Test IPA',
          brewer: 'Test Brewery',
          brew_style: 'IPA',
          added_date: '2024-01-01',
          container_type: 'pint',
          enrichment_confidence: null,
          enrichment_source: null,
        },
        {
          id: '2',
          brew_name: 'Test Stout',
          brewer: 'Another Brewery',
          brew_style: 'Stout',
          added_date: '2024-01-02',
          container_type: 'tulip',
          enrichment_confidence: null,
          enrichment_source: null,
        },
      ];

      mockDatabase.getFirstAsync.mockResolvedValue({ count: 0 });

      await repository.insertMany(beers);

      // Should call getDatabase
      expect(connection.getDatabase).toHaveBeenCalled();

      // Should clear existing beers first
      expect(mockDatabase.runAsync).toHaveBeenCalledWith('DELETE FROM allbeers');

      // Should insert all beers
      expect(mockDatabase.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO allbeers'),
        expect.arrayContaining(['1', '2024-01-01', 'Test IPA', 'Test Brewery'])
      );
    });

    it('should skip beers without IDs', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();
      const beers: BeerWithContainerType[] = [
        {
          id: '1',
          brew_name: 'Valid Beer',
          brewer: 'Test Brewery',
          container_type: 'pint',
          enrichment_confidence: null,
          enrichment_source: null,
        },
        {
          id: '',
          brew_name: 'Invalid Beer - No ID',
          brewer: 'Test Brewery',
          container_type: 'pint',
          enrichment_confidence: null,
          enrichment_source: null,
        } as BeerWithContainerType,
        {
          id: '2',
          brew_name: 'Another Valid Beer',
          brewer: 'Test Brewery',
          container_type: 'tulip',
          enrichment_confidence: null,
          enrichment_source: null,
        },
      ];

      mockDatabase.getFirstAsync.mockResolvedValue({ count: 0 });

      await repository.insertMany(beers);

      // Should only insert the valid beers (2 beers)
      const insertCalls = mockDatabase.runAsync.mock.calls.filter((call: unknown[]) =>
        (call[0] as string).includes('INSERT OR REPLACE')
      );

      expect(insertCalls).toHaveLength(2);
      expect(insertCalls[0][1]).toContain('1');
      expect(insertCalls[1][1]).toContain('2');
    });

    it('should process beers in batches of 50', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();
      const beers: BeerWithContainerType[] = Array.from({ length: 120 }, (_, i) => ({
        id: `beer-${i}`,
        brew_name: `Beer ${i}`,
        brewer: 'Test Brewery',
        container_type: i % 2 === 0 ? ('pint' as const) : ('tulip' as const),
        enrichment_confidence: null,
        enrichment_source: null,
      }));

      mockDatabase.getFirstAsync.mockResolvedValue({ count: 0 });

      await repository.insertMany(beers);

      // Should use transactions for batching (120 beers = 3 batches of 50, 50, 20)
      expect(mockDatabase.withTransactionAsync).toHaveBeenCalled();

      // Should insert all 120 beers
      const insertCalls = mockDatabase.runAsync.mock.calls.filter((call: unknown[]) =>
        (call[0] as string).includes('INSERT OR REPLACE')
      );
      expect(insertCalls).toHaveLength(120);
    });

    it('should handle empty beer array', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();

      mockDatabase.getFirstAsync.mockResolvedValue({ count: 0 });

      await repository.insertMany([]);

      // Should still clear the table
      expect(mockDatabase.runAsync).toHaveBeenCalledWith('DELETE FROM allbeers');

      // Should not insert any beers
      const insertCalls = mockDatabase.runAsync.mock.calls.filter((call: unknown[]) =>
        (call[0] as string).includes('INSERT OR REPLACE')
      );
      expect(insertCalls).toHaveLength(0);
    });

    it('should handle beers with optional fields missing', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();
      const beers: BeerWithContainerType[] = [
        {
          id: '1',
          brew_name: 'Minimal Beer',
          container_type: 'pint',
          enrichment_confidence: null,
          enrichment_source: null,
          // All optional fields missing
        },
      ];

      mockDatabase.getFirstAsync.mockResolvedValue({ count: 0 });

      await repository.insertMany(beers);

      // Should insert beer with empty strings for missing fields and container_type
      expect(mockDatabase.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO allbeers'),
        expect.arrayContaining(['1', '', 'Minimal Beer', '', '', '', '', '', '', '', 'pint'])
      );
    });

    it('should throw error on database failure', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();
      const beers: BeerWithContainerType[] = [
        {
          id: '1',
          brew_name: 'Test Beer',
          brewer: 'Test Brewery',
          container_type: 'pint',
          enrichment_confidence: null,
          enrichment_source: null,
        },
      ];

      mockDatabase.runAsync.mockRejectedValueOnce(new Error('Database error'));

      await expect(repository.insertMany(beers)).rejects.toThrow('Database error');
    });

  });

  describe('getAll', () => {
    it('should return all beers ordered by added_date DESC', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();
      const mockBeers: BeerWithContainerType[] = [
        {
          id: '2',
          brew_name: 'Newer Beer',
          brewer: 'Test Brewery',
          added_date: '2024-01-02',
          container_type: 'pint',
          abv: null,
          brew_container: undefined,
          brew_description: undefined,
          brew_style: undefined,
          brewer_loc: undefined,
          review_count: undefined,
          review_rating: undefined,
          enrichment_confidence: null,
          enrichment_source: null,
        },
        {
          id: '1',
          brew_name: 'Older Beer',
          brewer: 'Test Brewery',
          added_date: '2024-01-01',
          container_type: 'tulip',
          abv: null,
          brew_container: undefined,
          brew_description: undefined,
          brew_style: undefined,
          brewer_loc: undefined,
          review_count: undefined,
          review_rating: undefined,
          enrichment_confidence: null,
          enrichment_source: null,
        },
      ];

      mockDatabase.getAllAsync.mockResolvedValue(mockBeers);

      const result = await repository.getAll();

      expect(result).toEqual(mockBeers);
      expect(mockDatabase.getAllAsync).toHaveBeenCalledWith(
        'SELECT * FROM allbeers WHERE brew_name IS NOT NULL AND brew_name != "" ORDER BY added_date DESC'
      );
    });

    it('should return empty array when no beers exist', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();

      mockDatabase.getAllAsync.mockResolvedValue([]);

      const result = await repository.getAll();

      expect(result).toEqual([]);
    });

    it('should filter out beers with null or empty brew_name', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();

      mockDatabase.getAllAsync.mockResolvedValue([]);

      await repository.getAll();

      // Query should exclude beers with null or empty brew_name
      expect(mockDatabase.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining('WHERE brew_name IS NOT NULL AND brew_name != ""')
      );
    });

    it('should not return beers with null or empty brew_name (SQL filtering verification)', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();
      // This test verifies that the SQL WHERE clause correctly filters out
      // beers with empty or null brew_name. Since we're using mocks, we verify
      // that only valid beers are returned when the SQL filtering is applied.
      const validBeers: BeerWithContainerType[] = [
        {
          id: 'test-valid',
          brew_name: 'Valid Beer',
          brewer: 'Test Brewer',
          brew_style: 'IPA',
          container_type: 'pint',
          abv: null,
          added_date: undefined,
          brew_container: undefined,
          brew_description: undefined,
          brewer_loc: undefined,
          review_count: undefined,
          review_rating: undefined,
          enrichment_confidence: null,
          enrichment_source: null,
        },
      ];

      // Mock returns only valid beers (as the SQL WHERE clause would filter)
      mockDatabase.getAllAsync.mockResolvedValue(validBeers);

      const beers = await repository.getAll();

      // Verify the SQL query includes the filtering clause
      expect(mockDatabase.getAllAsync).toHaveBeenCalledWith(
        'SELECT * FROM allbeers WHERE brew_name IS NOT NULL AND brew_name != "" ORDER BY added_date DESC'
      );

      // Should only return the valid beer
      expect(beers.length).toBe(1);
      expect(beers[0].id).toBe('test-valid');
      expect(beers.every(b => b.brew_name && b.brew_name.length > 0)).toBe(true);
    });

    it('should throw error on database failure', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();

      mockDatabase.getAllAsync.mockRejectedValueOnce(new Error('Database error'));

      await expect(repository.getAll()).rejects.toThrow('Database error');
    });
  });

  describe('getById', () => {
    it('should return beer when found', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();
      const mockBeer: BeerWithContainerType = {
        id: '123',
        brew_name: 'Test IPA',
        brewer: 'Test Brewery',
        container_type: 'pint',
        abv: null,
        added_date: undefined,
        brew_container: undefined,
        brew_description: undefined,
        brew_style: undefined,
        brewer_loc: undefined,
        review_count: undefined,
        review_rating: undefined,
        enrichment_confidence: null,
        enrichment_source: null,
      };

      mockDatabase.getFirstAsync.mockResolvedValue(mockBeer);

      const result = await repository.getById('123');

      expect(result).toEqual(mockBeer);
      expect(mockDatabase.getFirstAsync).toHaveBeenCalledWith(
        'SELECT * FROM allbeers WHERE id = ?',
        ['123']
      );
    });

    it('should return null when beer not found', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();

      mockDatabase.getFirstAsync.mockResolvedValue(null);

      const result = await repository.getById('nonexistent');

      expect(result).toBeNull();
    });

    it('should handle empty ID string', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();

      mockDatabase.getFirstAsync.mockResolvedValue(null);

      const result = await repository.getById('');

      expect(result).toBeNull();
      expect(mockDatabase.getFirstAsync).toHaveBeenCalledWith(
        'SELECT * FROM allbeers WHERE id = ?',
        ['']
      );
    });

    it('should throw error on database failure', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();

      mockDatabase.getFirstAsync.mockRejectedValueOnce(new Error('Database error'));

      await expect(repository.getById('123')).rejects.toThrow('Database error');
    });
  });

  describe('search', () => {
    it('should search beers by name, brewer, style, and description', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();
      const mockBeers: BeerWithContainerType[] = [
        {
          id: '1',
          brew_name: 'Hoppy IPA',
          brewer: 'Test Brewery',
          brew_style: 'IPA',
          container_type: 'pint',
          abv: null,
          added_date: undefined,
          brew_container: undefined,
          brew_description: undefined,
          brewer_loc: undefined,
          review_count: undefined,
          review_rating: undefined,
          enrichment_confidence: null,
          enrichment_source: null,
        },
      ];

      mockDatabase.getAllAsync.mockResolvedValue(mockBeers);

      const result = await repository.search('hoppy');

      expect(result).toEqual(mockBeers);
      expect(mockDatabase.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining('brew_name LIKE ?'),
        ['%hoppy%', '%hoppy%', '%hoppy%', '%hoppy%']
      );
    });

    it('should return all beers when query is empty', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();
      const mockBeers: BeerWithContainerType[] = [
        {
          id: '1',
          brew_name: 'Beer 1',
          brewer: 'Brewery 1',
          container_type: 'pint',
          abv: null,
          added_date: undefined,
          brew_container: undefined,
          brew_description: undefined,
          brew_style: undefined,
          brewer_loc: undefined,
          review_count: undefined,
          review_rating: undefined,
          enrichment_confidence: null,
          enrichment_source: null,
        },
      ];

      mockDatabase.getAllAsync.mockResolvedValue(mockBeers);

      const result = await repository.search('');

      expect(result).toEqual(mockBeers);
      // Should call getAll() which queries all beers
      expect(mockDatabase.getAllAsync).toHaveBeenCalledWith(
        'SELECT * FROM allbeers WHERE brew_name IS NOT NULL AND brew_name != "" ORDER BY added_date DESC'
      );
    });

    it('should trim whitespace from query', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();

      mockDatabase.getAllAsync.mockResolvedValue([]);

      await repository.search('  test query  ');

      expect(mockDatabase.getAllAsync).toHaveBeenCalledWith(expect.any(String), [
        '%test query%',
        '%test query%',
        '%test query%',
        '%test query%',
      ]);
    });

    it('should handle special characters in search query', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();

      mockDatabase.getAllAsync.mockResolvedValue([]);

      await repository.search('50% ABV');

      expect(mockDatabase.getAllAsync).toHaveBeenCalledWith(expect.any(String), [
        '%50% ABV%',
        '%50% ABV%',
        '%50% ABV%',
        '%50% ABV%',
      ]);
    });

    it('should search across all text fields', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();

      mockDatabase.getAllAsync.mockResolvedValue([]);

      await repository.search('test');

      // Should search in brew_name, brewer, brew_style, and brew_description
      expect(mockDatabase.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining('brew_name LIKE ?'),
        expect.anything()
      );
      expect(mockDatabase.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining('brewer LIKE ?'),
        expect.anything()
      );
      expect(mockDatabase.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining('brew_style LIKE ?'),
        expect.anything()
      );
      expect(mockDatabase.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining('brew_description LIKE ?'),
        expect.anything()
      );
    });

    it('should throw error on database failure', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();

      mockDatabase.getAllAsync.mockRejectedValueOnce(new Error('Database error'));

      await expect(repository.search('test')).rejects.toThrow('Database error');
    });
  });

  describe('getByStyle', () => {
    it('should return beers matching the style', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();
      const mockBeers: BeerWithContainerType[] = [
        {
          id: '1',
          brew_name: 'IPA 1',
          brewer: 'Brewery 1',
          brew_style: 'IPA',
          container_type: 'pint',
          abv: null,
          added_date: undefined,
          brew_container: undefined,
          brew_description: undefined,
          brewer_loc: undefined,
          review_count: undefined,
          review_rating: undefined,
          enrichment_confidence: null,
          enrichment_source: null,
        },
        {
          id: '2',
          brew_name: 'IPA 2',
          brewer: 'Brewery 2',
          brew_style: 'IPA',
          container_type: 'tulip',
          abv: null,
          added_date: undefined,
          brew_container: undefined,
          brew_description: undefined,
          brewer_loc: undefined,
          review_count: undefined,
          review_rating: undefined,
          enrichment_confidence: null,
          enrichment_source: null,
        },
      ];

      mockDatabase.getAllAsync.mockResolvedValue(mockBeers);

      const result = await repository.getByStyle('IPA');

      expect(result).toEqual(mockBeers);
      expect(mockDatabase.getAllAsync).toHaveBeenCalledWith(
        'SELECT * FROM allbeers WHERE brew_name IS NOT NULL AND brew_name != "" AND brew_style = ? ORDER BY added_date DESC',
        ['IPA']
      );
    });

    it('should return empty array when no beers match style', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();

      mockDatabase.getAllAsync.mockResolvedValue([]);

      const result = await repository.getByStyle('Nonexistent Style');

      expect(result).toEqual([]);
    });

    it('should handle empty style string', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();

      mockDatabase.getAllAsync.mockResolvedValue([]);

      const result = await repository.getByStyle('');

      expect(result).toEqual([]);
      expect(mockDatabase.getAllAsync).toHaveBeenCalledWith(expect.any(String), ['']);
    });

    it('should throw error on database failure', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();

      mockDatabase.getAllAsync.mockRejectedValueOnce(new Error('Database error'));

      await expect(repository.getByStyle('IPA')).rejects.toThrow('Database error');
    });
  });

  describe('getByBrewer', () => {
    it('should return beers from the specified brewer', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();
      const mockBeers: BeerWithContainerType[] = [
        {
          id: '1',
          brew_name: 'IPA',
          brewer: 'Test Brewery',
          brew_style: 'IPA',
          container_type: 'pint',
          abv: null,
          added_date: undefined,
          brew_container: undefined,
          brew_description: undefined,
          brewer_loc: undefined,
          review_count: undefined,
          review_rating: undefined,
          enrichment_confidence: null,
          enrichment_source: null,
        },
        {
          id: '2',
          brew_name: 'Stout',
          brewer: 'Test Brewery',
          brew_style: 'Stout',
          container_type: 'tulip',
          abv: null,
          added_date: undefined,
          brew_container: undefined,
          brew_description: undefined,
          brewer_loc: undefined,
          review_count: undefined,
          review_rating: undefined,
          enrichment_confidence: null,
          enrichment_source: null,
        },
      ];

      mockDatabase.getAllAsync.mockResolvedValue(mockBeers);

      const result = await repository.getByBrewer('Test Brewery');

      expect(result).toEqual(mockBeers);
      expect(mockDatabase.getAllAsync).toHaveBeenCalledWith(
        'SELECT * FROM allbeers WHERE brew_name IS NOT NULL AND brew_name != "" AND brewer = ? ORDER BY added_date DESC',
        ['Test Brewery']
      );
    });

    it('should return empty array when no beers match brewer', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();

      mockDatabase.getAllAsync.mockResolvedValue([]);

      const result = await repository.getByBrewer('Nonexistent Brewery');

      expect(result).toEqual([]);
    });

    it('should handle empty brewer string', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();

      mockDatabase.getAllAsync.mockResolvedValue([]);

      const result = await repository.getByBrewer('');

      expect(result).toEqual([]);
      expect(mockDatabase.getAllAsync).toHaveBeenCalledWith(expect.any(String), ['']);
    });

    it('should throw error on database failure', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();

      mockDatabase.getAllAsync.mockRejectedValueOnce(new Error('Database error'));

      await expect(repository.getByBrewer('Test Brewery')).rejects.toThrow('Database error');
    });
  });

  describe('getUntasted', () => {
    it('should return beers not in tasted_brew_current_round table', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();
      const mockBeers: BeerWithContainerType[] = [
        {
          id: '1',
          brew_name: 'Untasted Beer 1',
          brewer: 'Brewery 1',
          container_type: 'pint',
          abv: null,
          added_date: undefined,
          brew_container: undefined,
          brew_description: undefined,
          brew_style: undefined,
          brewer_loc: undefined,
          review_count: undefined,
          review_rating: undefined,
          enrichment_confidence: null,
          enrichment_source: null,
        },
        {
          id: '2',
          brew_name: 'Untasted Beer 2',
          brewer: 'Brewery 2',
          container_type: 'tulip',
          abv: null,
          added_date: undefined,
          brew_container: undefined,
          brew_description: undefined,
          brew_style: undefined,
          brewer_loc: undefined,
          review_count: undefined,
          review_rating: undefined,
          enrichment_confidence: null,
          enrichment_source: null,
        },
      ];

      mockDatabase.getAllAsync.mockResolvedValue(mockBeers);

      const result = await repository.getUntasted();

      expect(result).toEqual(mockBeers);
      expect(mockDatabase.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining('NOT IN (SELECT id FROM tasted_brew_current_round)')
      );
    });

    it('should return empty array when all beers are tasted', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();

      mockDatabase.getAllAsync.mockResolvedValue([]);

      const result = await repository.getUntasted();

      expect(result).toEqual([]);
    });

    it('should filter out beers with null or empty brew_name', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();

      mockDatabase.getAllAsync.mockResolvedValue([]);

      await repository.getUntasted();

      expect(mockDatabase.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining('WHERE brew_name IS NOT NULL')
      );
    });

    it('should order results by added_date DESC', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();

      mockDatabase.getAllAsync.mockResolvedValue([]);

      await repository.getUntasted();

      expect(mockDatabase.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY added_date DESC')
      );
    });

    it('should throw error on database failure', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();

      mockDatabase.getAllAsync.mockRejectedValueOnce(new Error('Database error'));

      await expect(repository.getUntasted()).rejects.toThrow('Database error');
    });
  });
});
