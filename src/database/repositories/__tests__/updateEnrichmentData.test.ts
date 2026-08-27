import { vi, type Mock } from 'vitest';
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
vi.mock('../../connection');
// Delegates to a REAL DatabaseLockManager. A `jest.fn((_name, task) => task())`
// stand-in has no release to observe, so "released the lock" assertions against
// it pass even with withDatabaseLock's finally deleted.
vi.mock('../../locks', async () => {
  const actual = await vi.importActual<typeof import('../../DatabaseLockManager')>(
    '../../DatabaseLockManager'
  );
  const real = new actual.DatabaseLockManager();
  const delegate = (name: string, task: () => Promise<unknown>) =>
    real.withDatabaseLock(name, task);
  return {
    databaseLockManager: {
      withDatabaseLock: vi.fn(delegate),
      // Exposed so setupLocks can restore delegation after a test overrides
      // the implementation (e.g. to simulate an acquisition failure).
      __delegate: delegate,
      isLocked: () => real.isLocked(),
      getQueueLength: () => real.getQueueLength(),
      resetForTesting: () => real.resetForTesting(),
    },
  };
});

type MockStatement = {
  executeAsync: Mock;
  finalizeAsync: Mock;
};

type MockDatabase = {
  withTransactionAsync: Mock;
  prepareAsync: Mock;
  runAsync: Mock;
  getAllAsync: Mock;
  getFirstAsync: Mock;
};

function createMockStatement(): MockStatement {
  return {
    executeAsync: vi.fn(),
    finalizeAsync: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockDatabase(mockStatement: MockStatement): MockDatabase {
  return {
    withTransactionAsync: vi.fn(async (callback: () => Promise<void>) => await callback()),
    prepareAsync: vi.fn().mockResolvedValue(mockStatement),
    runAsync: vi.fn(),
    getAllAsync: vi.fn(),
    getFirstAsync: vi.fn(),
  };
}

function setupLocks(): void {
  const mocked = databaseLockManager as unknown as {
    __delegate: (name: string, task: () => Promise<unknown>) => Promise<unknown>;
  };
  // Restores delegation to the real lock manager, undoing any per-test
  // override. Not a plain task-runner: isLocked() has to mean something.
  (databaseLockManager.withDatabaseLock as Mock).mockImplementation(mocked.__delegate);
  databaseLockManager.resetForTesting();
}

describe('BeerRepository.updateEnrichmentData', () => {
  // ============================================================================
  // EMPTY INPUT TESTS
  // ============================================================================

  describe('Empty Input', () => {
    test('should return 0 when enrichments map is empty', async () => {
      const mockStatement = createMockStatement();
      const mockDatabase = createMockDatabase(mockStatement);
      (connection.getDatabase as Mock).mockResolvedValue(mockDatabase);
      (connection.getDatabase as Mock).mockClear();
      setupLocks();
      (databaseLockManager.withDatabaseLock as Mock).mockClear();
      const repository = new BeerRepository();

      const result = await repository.updateEnrichmentData({});

      expect(result).toBe(0);

      // Should not acquire lock or interact with database
      expect(databaseLockManager.withDatabaseLock).not.toHaveBeenCalled();
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
      (connection.getDatabase as Mock).mockResolvedValue(mockDatabase);
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

      expect(databaseLockManager.withDatabaseLock).toHaveBeenCalledWith(
        'BeerRepository.updateEnrichmentData',
        expect.any(Function)
      );
      expect(databaseLockManager.isLocked()).toBe(false);
    });

    test('should release BeerRepository lock after successful operation', async () => {
      const mockStatement = createMockStatement();
      const mockDatabase = createMockDatabase(mockStatement);
      (connection.getDatabase as Mock).mockResolvedValue(mockDatabase);
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

      expect(databaseLockManager.withDatabaseLock).toHaveBeenCalledWith(
        'BeerRepository.updateEnrichmentData',
        expect.any(Function)
      );
      expect(databaseLockManager.isLocked()).toBe(false);
    });

    test('should release lock even when database operation fails', async () => {
      const mockStatement = createMockStatement();
      const mockDatabase = createMockDatabase(mockStatement);
      (connection.getDatabase as Mock).mockResolvedValue(mockDatabase);
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
      expect(databaseLockManager.withDatabaseLock).toHaveBeenCalledWith(
        'BeerRepository.updateEnrichmentData',
        expect.any(Function)
      );
      expect(databaseLockManager.isLocked()).toBe(false);
    });

    test('should propagate an acquisition failure without touching the database', async () => {
      const mockStatement = createMockStatement();
      const mockDatabase = createMockDatabase(mockStatement);
      (connection.getDatabase as Mock).mockResolvedValue(mockDatabase);
      (connection.getDatabase as Mock).mockClear();
      setupLocks();
      // withDatabaseLock has no "returned false" mode — acquisition either
      // succeeds or rejects (timeout / shutdown). That dead branch is gone.
      (databaseLockManager.withDatabaseLock as Mock).mockRejectedValue(
        new Error('Lock acquisition timeout for enrichment update after 30000ms')
      );
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
        /Lock acquisition timeout/
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
      (connection.getDatabase as Mock).mockResolvedValue(mockDatabase);
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
      (connection.getDatabase as Mock).mockResolvedValue(mockDatabase);
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
      (connection.getDatabase as Mock).mockResolvedValue(mockDatabase);
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
      (connection.getDatabase as Mock).mockResolvedValue(mockDatabase);
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
      (connection.getDatabase as Mock).mockResolvedValue(mockDatabase);
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
      (connection.getDatabase as Mock).mockResolvedValue(mockDatabase);
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
      (connection.getDatabase as Mock).mockResolvedValue(mockDatabase);
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
      (connection.getDatabase as Mock).mockResolvedValue(mockDatabase);
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
      (connection.getDatabase as Mock).mockResolvedValue(mockDatabase);
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
      (connection.getDatabase as Mock).mockResolvedValue(mockDatabase);
      setupLocks();
      (databaseLockManager.withDatabaseLock as Mock).mockClear();
      const repository = new MyBeersRepository();

      const result = await repository.updateEnrichmentData({});

      expect(result).toBe(0);
      expect(databaseLockManager.withDatabaseLock).not.toHaveBeenCalled();
    });
  });

  describe('Lock Management', () => {
    test('should acquire MyBeersRepository lock', async () => {
      const mockStatement = createMockStatement();
      const mockDatabase = createMockDatabase(mockStatement);
      (connection.getDatabase as Mock).mockResolvedValue(mockDatabase);
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

      expect(databaseLockManager.withDatabaseLock).toHaveBeenCalledWith(
        'MyBeersRepository.updateEnrichmentData',
        expect.any(Function)
      );
      expect(databaseLockManager.isLocked()).toBe(false);
    });

    test('should release MyBeersRepository lock after operation', async () => {
      const mockStatement = createMockStatement();
      const mockDatabase = createMockDatabase(mockStatement);
      (connection.getDatabase as Mock).mockResolvedValue(mockDatabase);
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

      expect(databaseLockManager.withDatabaseLock).toHaveBeenCalledWith(
        'MyBeersRepository.updateEnrichmentData',
        expect.any(Function)
      );
      expect(databaseLockManager.isLocked()).toBe(false);
    });

    test('should propagate an acquisition failure', async () => {
      const mockStatement = createMockStatement();
      const mockDatabase = createMockDatabase(mockStatement);
      (connection.getDatabase as Mock).mockResolvedValue(mockDatabase);
      setupLocks();
      // withDatabaseLock has no "returned false" mode — acquisition either
      // succeeds or rejects (timeout / shutdown). That dead branch is gone.
      (databaseLockManager.withDatabaseLock as Mock).mockRejectedValue(
        new Error('Lock acquisition timeout for enrichment update after 30000ms')
      );
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
        /Lock acquisition timeout/
      );
    });
  });

  describe('SQL Update Operations', () => {
    test('should update tasted_brew_current_round table', async () => {
      const mockStatement = createMockStatement();
      const mockDatabase = createMockDatabase(mockStatement);
      (connection.getDatabase as Mock).mockResolvedValue(mockDatabase);
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
      (connection.getDatabase as Mock).mockResolvedValue(mockDatabase);
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
      (connection.getDatabase as Mock).mockResolvedValue(mockDatabase);
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
      (connection.getDatabase as Mock).mockResolvedValue(mockDatabase);
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

      expect(databaseLockManager.withDatabaseLock).toHaveBeenCalledWith(
        'MyBeersRepository.updateEnrichmentData',
        expect.any(Function)
      );
      expect(databaseLockManager.isLocked()).toBe(false);
    });
  });
});
