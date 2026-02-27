/**
 * Unit tests for updateEnrichmentData methods in BeerRepository and MyBeersRepository
 *
 * These tests cover:
 * - Should return 0 when enrichments map is empty
 * - Should acquire and release the repository lock
 * - Should update enrichment columns for existing beers
 * - Should use COALESCE for ABV and description (preserve existing if null passed)
 * - Should directly assign confidence and source (even if null)
 * - Should return count of updated beers
 * - Should handle database errors gracefully
 */

import { BeerRepository } from '../BeerRepository';
import { MyBeersRepository } from '../MyBeersRepository';
import * as connection from '../../connection';
import { databaseLockManager } from '../../locks';
import { EnrichmentUpdate } from '../../../types/enrichment';

// Mock dependencies
jest.mock('../../connection');
jest.mock('../../locks', () => ({
  databaseLockManager: {
    acquireLock: jest.fn(),
    releaseLock: jest.fn(),
  },
}));

type MockStatement = {
  executeAsync: jest.Mock;
  finalizeAsync: jest.Mock;
};

type MockDatabase = {
  withTransactionAsync: jest.Mock;
  prepareAsync: jest.Mock;
  runAsync: jest.Mock;
  getAllAsync: jest.Mock;
  getFirstAsync: jest.Mock;
};

function createMockStatement(): MockStatement {
  return {
    executeAsync: jest.fn(),
    finalizeAsync: jest.fn().mockResolvedValue(undefined),
  };
}

function createMockDatabase(mockStatement: MockStatement): MockDatabase {
  return {
    withTransactionAsync: jest.fn(async (callback: () => Promise<void>) => await callback()),
    prepareAsync: jest.fn().mockResolvedValue(mockStatement),
    runAsync: jest.fn(),
    getAllAsync: jest.fn(),
    getFirstAsync: jest.fn(),
  };
}

function setupLocks(): void {
  (databaseLockManager.acquireLock as jest.Mock).mockResolvedValue(true);
  (databaseLockManager.releaseLock as jest.Mock).mockImplementation(() => {});
}

describe('BeerRepository.updateEnrichmentData', () => {
  // ============================================================================
  // EMPTY INPUT TESTS
  // ============================================================================

  describe('Empty Input', () => {
    test('should return 0 when enrichments map is empty', async () => {
      const mockStatement = createMockStatement();
      const mockDatabase = createMockDatabase(mockStatement);
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      (connection.getDatabase as jest.Mock).mockClear();
      setupLocks();
      (databaseLockManager.acquireLock as jest.Mock).mockClear();
      const repository = new BeerRepository();

      const result = await repository.updateEnrichmentData({});

      expect(result).toBe(0);

      // Should not acquire lock or interact with database
      expect(databaseLockManager.acquireLock).not.toHaveBeenCalled();
      expect(connection.getDatabase).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // LOCK MANAGEMENT TESTS
  // ============================================================================

  describe('Lock Management', () => {
    test('should acquire BeerRepository lock before database operations', async () => {
      const mockStatement = createMockStatement();
      const mockDatabase = createMockDatabase(mockStatement);
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      setupLocks();
      const repository = new BeerRepository();
      const enrichments: Record<string, EnrichmentUpdate> = {
        'beer-1': {
          enriched_abv: 5.5,
          enrichment_confidence: 0.9,
          enrichment_source: 'perplexity',
          brew_description: 'Test description',
        },
      };

      mockStatement.executeAsync.mockResolvedValue({ changes: 1 });

      await repository.updateEnrichmentData(enrichments);

      expect(databaseLockManager.acquireLock).toHaveBeenCalledWith('BeerRepository');
    });

    test('should release BeerRepository lock after successful operation', async () => {
      const mockStatement = createMockStatement();
      const mockDatabase = createMockDatabase(mockStatement);
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      setupLocks();
      const repository = new BeerRepository();
      const enrichments: Record<string, EnrichmentUpdate> = {
        'beer-1': {
          enriched_abv: 5.5,
          enrichment_confidence: 0.9,
          enrichment_source: 'perplexity',
          brew_description: 'Test description',
        },
      };

      mockStatement.executeAsync.mockResolvedValue({ changes: 1 });

      await repository.updateEnrichmentData(enrichments);

      expect(databaseLockManager.releaseLock).toHaveBeenCalledWith('BeerRepository');
    });

    test('should release lock even when database operation fails', async () => {
      const mockStatement = createMockStatement();
      const mockDatabase = createMockDatabase(mockStatement);
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      setupLocks();
      const repository = new BeerRepository();
      const enrichments: Record<string, EnrichmentUpdate> = {
        'beer-1': {
          enriched_abv: 5.5,
          enrichment_confidence: 0.9,
          enrichment_source: 'perplexity',
          brew_description: 'Test description',
        },
      };

      mockStatement.executeAsync.mockRejectedValue(new Error('Database error'));

      await expect(repository.updateEnrichmentData(enrichments)).rejects.toThrow('Database error');

      // Lock should still be released
      expect(databaseLockManager.releaseLock).toHaveBeenCalledWith('BeerRepository');
    });

    test('should throw error when lock cannot be acquired', async () => {
      const mockStatement = createMockStatement();
      const mockDatabase = createMockDatabase(mockStatement);
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      (connection.getDatabase as jest.Mock).mockClear();
      setupLocks();
      (databaseLockManager.acquireLock as jest.Mock).mockResolvedValue(false);
      const repository = new BeerRepository();
      const enrichments: Record<string, EnrichmentUpdate> = {
        'beer-1': {
          enriched_abv: 5.5,
          enrichment_confidence: 0.9,
          enrichment_source: 'perplexity',
          brew_description: 'Test description',
        },
      };

      await expect(repository.updateEnrichmentData(enrichments)).rejects.toThrow(
        'Could not acquire database lock for enrichment update'
      );

      // Should not attempt database operations
      expect(connection.getDatabase).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // SQL UPDATE TESTS
  // ============================================================================

  describe('SQL Update Operations', () => {
    test('should update enrichment columns for existing beers', async () => {
      const mockStatement = createMockStatement();
      const mockDatabase = createMockDatabase(mockStatement);
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      setupLocks();
      const repository = new BeerRepository();
      const enrichments: Record<string, EnrichmentUpdate> = {
        'beer-1': {
          enriched_abv: 5.5,
          enrichment_confidence: 0.9,
          enrichment_source: 'perplexity',
          brew_description: 'A hoppy IPA',
        },
      };

      mockStatement.executeAsync.mockResolvedValue({ changes: 1 });

      await repository.updateEnrichmentData(enrichments);

      // Should prepare the correct UPDATE statement
      expect(mockDatabase.prepareAsync).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE allbeers SET')
      );

      // Should execute with correct parameters
      expect(mockStatement.executeAsync).toHaveBeenCalledWith([
        5.5, // enriched_abv
        0.9, // enrichment_confidence
        'perplexity', // enrichment_source
        'A hoppy IPA', // brew_description
        'beer-1', // id
      ]);
    });

    test('should use COALESCE for ABV (preserve existing if null passed)', async () => {
      const mockStatement = createMockStatement();
      const mockDatabase = createMockDatabase(mockStatement);
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      setupLocks();
      const repository = new BeerRepository();
      const enrichments: Record<string, EnrichmentUpdate> = {
        'beer-1': {
          enriched_abv: null, // null value
          enrichment_confidence: 0.8,
          enrichment_source: 'description',
          brew_description: 'Test',
        },
      };

      mockStatement.executeAsync.mockResolvedValue({ changes: 1 });

      await repository.updateEnrichmentData(enrichments);

      // The SQL should use COALESCE(?, abv) which preserves existing when null
      expect(mockDatabase.prepareAsync).toHaveBeenCalledWith(
        expect.stringContaining('abv = COALESCE(?, abv)')
      );

      // Parameter should be null (COALESCE will use existing)
      expect(mockStatement.executeAsync).toHaveBeenCalledWith([
        null, // enriched_abv (null, so COALESCE uses existing)
        0.8,
        'description',
        'Test',
        'beer-1',
      ]);
    });

    test('should use COALESCE for description (preserve existing if null passed)', async () => {
      const mockStatement = createMockStatement();
      const mockDatabase = createMockDatabase(mockStatement);
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      setupLocks();
      const repository = new BeerRepository();
      const enrichments: Record<string, EnrichmentUpdate> = {
        'beer-1': {
          enriched_abv: 5.0,
          enrichment_confidence: 0.8,
          enrichment_source: 'description',
          brew_description: null, // null description
        },
      };

      mockStatement.executeAsync.mockResolvedValue({ changes: 1 });

      await repository.updateEnrichmentData(enrichments);

      // The SQL should use COALESCE(?, brew_description)
      expect(mockDatabase.prepareAsync).toHaveBeenCalledWith(
        expect.stringContaining('brew_description = COALESCE(?, brew_description)')
      );
    });

    test('should directly assign confidence (even if null)', async () => {
      const mockStatement = createMockStatement();
      const mockDatabase = createMockDatabase(mockStatement);
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      setupLocks();
      const repository = new BeerRepository();
      const enrichments: Record<string, EnrichmentUpdate> = {
        'beer-1': {
          enriched_abv: 5.0,
          enrichment_confidence: null, // explicitly null
          enrichment_source: 'manual',
          brew_description: 'Test',
        },
      };

      mockStatement.executeAsync.mockResolvedValue({ changes: 1 });

      await repository.updateEnrichmentData(enrichments);

      // Confidence should be directly assigned (no COALESCE)
      expect(mockDatabase.prepareAsync).toHaveBeenCalledWith(
        expect.stringContaining('enrichment_confidence = ?')
      );
      expect(mockDatabase.prepareAsync).toHaveBeenCalledWith(
        expect.not.stringContaining('enrichment_confidence = COALESCE')
      );

      // Should pass null directly
      expect(mockStatement.executeAsync).toHaveBeenCalledWith(expect.arrayContaining([null]));
    });

    test('should directly assign source (even if null)', async () => {
      const mockStatement = createMockStatement();
      const mockDatabase = createMockDatabase(mockStatement);
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      setupLocks();
      const repository = new BeerRepository();
      const enrichments: Record<string, EnrichmentUpdate> = {
        'beer-1': {
          enriched_abv: 5.0,
          enrichment_confidence: 0.8,
          enrichment_source: null, // explicitly null
          brew_description: 'Test',
        },
      };

      mockStatement.executeAsync.mockResolvedValue({ changes: 1 });

      await repository.updateEnrichmentData(enrichments);

      // Source should be directly assigned (no COALESCE)
      expect(mockDatabase.prepareAsync).toHaveBeenCalledWith(
        expect.stringContaining('enrichment_source = ?')
      );
      expect(mockDatabase.prepareAsync).toHaveBeenCalledWith(
        expect.not.stringContaining('enrichment_source = COALESCE')
      );
    });
  });

  // ============================================================================
  // RETURN VALUE TESTS
  // ============================================================================

  describe('Return Value', () => {
    test('should return count of updated beers', async () => {
      const mockStatement = createMockStatement();
      const mockDatabase = createMockDatabase(mockStatement);
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      setupLocks();
      const repository = new BeerRepository();
      const enrichments: Record<string, EnrichmentUpdate> = {
        'beer-1': {
          enriched_abv: 5.5,
          enrichment_confidence: 0.9,
          enrichment_source: 'perplexity',
          brew_description: 'Test',
        },
        'beer-2': {
          enriched_abv: 6.0,
          enrichment_confidence: 0.8,
          enrichment_source: 'description',
          brew_description: 'Another test',
        },
        'beer-3': {
          enriched_abv: 4.5,
          enrichment_confidence: 0.7,
          enrichment_source: 'manual',
          brew_description: 'Third test',
        },
      };

      // Only 2 of 3 actually exist in database
      mockStatement.executeAsync
        .mockResolvedValueOnce({ changes: 1 })
        .mockResolvedValueOnce({ changes: 1 })
        .mockResolvedValueOnce({ changes: 0 }); // beer-3 doesn't exist

      const result = await repository.updateEnrichmentData(enrichments);

      expect(result).toBe(2);
    });

    test('should return 0 when no beers match in database', async () => {
      const mockStatement = createMockStatement();
      const mockDatabase = createMockDatabase(mockStatement);
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      setupLocks();
      const repository = new BeerRepository();
      const enrichments: Record<string, EnrichmentUpdate> = {
        'nonexistent-beer': {
          enriched_abv: 5.5,
          enrichment_confidence: 0.9,
          enrichment_source: 'perplexity',
          brew_description: 'Test',
        },
      };

      mockStatement.executeAsync.mockResolvedValue({ changes: 0 });

      const result = await repository.updateEnrichmentData(enrichments);

      expect(result).toBe(0);
    });
  });

  // ============================================================================
  // ERROR HANDLING TESTS
  // ============================================================================

  describe('Error Handling', () => {
    test('should throw error on database failure', async () => {
      const mockStatement = createMockStatement();
      const mockDatabase = createMockDatabase(mockStatement);
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      setupLocks();
      const repository = new BeerRepository();
      const enrichments: Record<string, EnrichmentUpdate> = {
        'beer-1': {
          enriched_abv: 5.5,
          enrichment_confidence: 0.9,
          enrichment_source: 'perplexity',
          brew_description: 'Test',
        },
      };

      mockDatabase.prepareAsync.mockRejectedValue(new Error('Prepare failed'));

      await expect(repository.updateEnrichmentData(enrichments)).rejects.toThrow('Prepare failed');
    });

    test('should finalize statement even on execute error', async () => {
      const mockStatement = createMockStatement();
      const mockDatabase = createMockDatabase(mockStatement);
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      setupLocks();
      const repository = new BeerRepository();
      const enrichments: Record<string, EnrichmentUpdate> = {
        'beer-1': {
          enriched_abv: 5.5,
          enrichment_confidence: 0.9,
          enrichment_source: 'perplexity',
          brew_description: 'Test',
        },
      };

      mockStatement.executeAsync.mockRejectedValue(new Error('Execute failed'));

      await expect(repository.updateEnrichmentData(enrichments)).rejects.toThrow('Execute failed');

      // Statement should still be finalized
      expect(mockStatement.finalizeAsync).toHaveBeenCalled();
    });
  });
});

// ============================================================================
// MyBeersRepository Tests (parallel structure)
// ============================================================================

describe('MyBeersRepository.updateEnrichmentData', () => {
  describe('Empty Input', () => {
    test('should return 0 when enrichments map is empty', async () => {
      const mockStatement = createMockStatement();
      const mockDatabase = createMockDatabase(mockStatement);
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      setupLocks();
      (databaseLockManager.acquireLock as jest.Mock).mockClear();
      const repository = new MyBeersRepository();

      const result = await repository.updateEnrichmentData({});

      expect(result).toBe(0);
      expect(databaseLockManager.acquireLock).not.toHaveBeenCalled();
    });
  });

  describe('Lock Management', () => {
    test('should acquire MyBeersRepository lock', async () => {
      const mockStatement = createMockStatement();
      const mockDatabase = createMockDatabase(mockStatement);
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      setupLocks();
      const repository = new MyBeersRepository();
      const enrichments: Record<string, EnrichmentUpdate> = {
        'beer-1': {
          enriched_abv: 5.5,
          enrichment_confidence: 0.9,
          enrichment_source: 'perplexity',
          brew_description: 'Test',
        },
      };

      mockStatement.executeAsync.mockResolvedValue({ changes: 1 });

      await repository.updateEnrichmentData(enrichments);

      expect(databaseLockManager.acquireLock).toHaveBeenCalledWith('MyBeersRepository');
    });

    test('should release MyBeersRepository lock after operation', async () => {
      const mockStatement = createMockStatement();
      const mockDatabase = createMockDatabase(mockStatement);
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      setupLocks();
      const repository = new MyBeersRepository();
      const enrichments: Record<string, EnrichmentUpdate> = {
        'beer-1': {
          enriched_abv: 5.5,
          enrichment_confidence: 0.9,
          enrichment_source: 'perplexity',
          brew_description: 'Test',
        },
      };

      mockStatement.executeAsync.mockResolvedValue({ changes: 1 });

      await repository.updateEnrichmentData(enrichments);

      expect(databaseLockManager.releaseLock).toHaveBeenCalledWith('MyBeersRepository');
    });

    test('should throw when lock cannot be acquired', async () => {
      const mockStatement = createMockStatement();
      const mockDatabase = createMockDatabase(mockStatement);
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      setupLocks();
      (databaseLockManager.acquireLock as jest.Mock).mockResolvedValue(false);
      const repository = new MyBeersRepository();
      const enrichments: Record<string, EnrichmentUpdate> = {
        'beer-1': {
          enriched_abv: 5.5,
          enrichment_confidence: 0.9,
          enrichment_source: 'perplexity',
          brew_description: 'Test',
        },
      };

      await expect(repository.updateEnrichmentData(enrichments)).rejects.toThrow(
        'Could not acquire database lock for enrichment update'
      );
    });
  });

  describe('SQL Update Operations', () => {
    test('should update tasted_brew_current_round table', async () => {
      const mockStatement = createMockStatement();
      const mockDatabase = createMockDatabase(mockStatement);
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      setupLocks();
      const repository = new MyBeersRepository();
      const enrichments: Record<string, EnrichmentUpdate> = {
        'beer-1': {
          enriched_abv: 5.5,
          enrichment_confidence: 0.9,
          enrichment_source: 'perplexity',
          brew_description: 'Test',
        },
      };

      mockStatement.executeAsync.mockResolvedValue({ changes: 1 });

      await repository.updateEnrichmentData(enrichments);

      expect(mockDatabase.prepareAsync).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE tasted_brew_current_round SET')
      );
    });

    test('should use same COALESCE pattern as BeerRepository', async () => {
      const mockStatement = createMockStatement();
      const mockDatabase = createMockDatabase(mockStatement);
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      setupLocks();
      const repository = new MyBeersRepository();
      const enrichments: Record<string, EnrichmentUpdate> = {
        'beer-1': {
          enriched_abv: null,
          enrichment_confidence: 0.8,
          enrichment_source: 'description',
          brew_description: null,
        },
      };

      mockStatement.executeAsync.mockResolvedValue({ changes: 1 });

      await repository.updateEnrichmentData(enrichments);

      // Should use COALESCE for ABV and description
      expect(mockDatabase.prepareAsync).toHaveBeenCalledWith(
        expect.stringContaining('abv = COALESCE(?, abv)')
      );
      expect(mockDatabase.prepareAsync).toHaveBeenCalledWith(
        expect.stringContaining('brew_description = COALESCE(?, brew_description)')
      );
    });
  });

  describe('Return Value', () => {
    test('should return count of updated beers', async () => {
      const mockStatement = createMockStatement();
      const mockDatabase = createMockDatabase(mockStatement);
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      setupLocks();
      const repository = new MyBeersRepository();
      const enrichments: Record<string, EnrichmentUpdate> = {
        'beer-1': {
          enriched_abv: 5.5,
          enrichment_confidence: 0.9,
          enrichment_source: 'perplexity',
          brew_description: 'Test',
        },
        'beer-2': {
          enriched_abv: 6.0,
          enrichment_confidence: 0.8,
          enrichment_source: 'description',
          brew_description: 'Another',
        },
      };

      mockStatement.executeAsync
        .mockResolvedValueOnce({ changes: 1 })
        .mockResolvedValueOnce({ changes: 1 });

      const result = await repository.updateEnrichmentData(enrichments);

      expect(result).toBe(2);
    });
  });

  describe('Error Handling', () => {
    test('should release lock on error', async () => {
      const mockStatement = createMockStatement();
      const mockDatabase = createMockDatabase(mockStatement);
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      setupLocks();
      const repository = new MyBeersRepository();
      const enrichments: Record<string, EnrichmentUpdate> = {
        'beer-1': {
          enriched_abv: 5.5,
          enrichment_confidence: 0.9,
          enrichment_source: 'perplexity',
          brew_description: 'Test',
        },
      };

      mockStatement.executeAsync.mockRejectedValue(new Error('Database error'));

      await expect(repository.updateEnrichmentData(enrichments)).rejects.toThrow('Database error');

      expect(databaseLockManager.releaseLock).toHaveBeenCalledWith('MyBeersRepository');
    });
  });
});
