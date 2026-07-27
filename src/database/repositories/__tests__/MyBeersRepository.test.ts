/**
 * Comprehensive tests for MyBeersRepository
 * Tests CRUD operations for tasted beers (Beerfinder) entity using TDD approach
 */

import { MyBeersRepository } from '../MyBeersRepository';
import { BeerfinderWithContainerType } from '../../../types/beer';
import * as connection from '../../connection';
import { toNonEmpty } from '../../../api/fetchOutcome';
import type { NonEmptyArray } from '../../../api/fetchOutcome';
import { databaseLockManager } from '../../locks';
import { DatabaseContentionError } from '../../errors';

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
    // The real runAsync always resolves an SQLiteRunResult; the clear path
    // reads `changes` off the DELETE instead of a count-before-delete read.
    runAsync: jest.fn().mockResolvedValue({ changes: 0, lastInsertRowId: 0 }),
    getAllAsync: jest.fn(),
    getFirstAsync: jest.fn(),
  };
}

function createRepository(): MyBeersRepository {
  return new MyBeersRepository();
}

/**
 * Narrow a literal fixture array for the NonEmptyArray-typed repository
 * signatures. Throws rather than asserting, so a fixture that is accidentally
 * empty fails loudly instead of lying to the type system.
 */
function nel<T>(items: readonly T[]): NonEmptyArray<T> {
  const narrowed = toNonEmpty(items);
  if (narrowed === null) throw new Error('fixture array was unexpectedly empty');
  return narrowed;
}

describe('MyBeersRepository', () => {
  describe('insertMany', () => {
    it('should insert multiple tasted beers in batches', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();
      const beers: BeerfinderWithContainerType[] = [
        {
          id: '1',
          brew_name: 'Tasted IPA',
          brewer: 'Test Brewery',
          roh_lap: '1',
          tasted_date: '2024-01-01',
          chit_code: 'CHT123',
          container_type: 'pint',
          abv: null,
          enrichment_confidence: null,
          enrichment_source: null,
        },
        {
          id: '2',
          brew_name: 'Tasted Stout',
          brewer: 'Another Brewery',
          roh_lap: '2',
          tasted_date: '2024-01-02',
          chit_code: 'CHT456',
          container_type: 'tulip',
          abv: null,
          enrichment_confidence: null,
          enrichment_source: null,
        },
      ];

      mockDatabase.getFirstAsync.mockResolvedValue({ count: 0 });

      await repository.insertMany(nel(beers));

      // Should call getDatabase
      expect(connection.getDatabase).toHaveBeenCalled();

      // Should clear existing tasted beers first
      expect(mockDatabase.runAsync).toHaveBeenCalledWith('DELETE FROM tasted_brew_current_round');

      // Should insert all beers
      expect(mockDatabase.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO tasted_brew_current_round'),
        expect.arrayContaining(['1', '1', '2024-01-01', 'Tasted IPA', 'Test Brewery'])
      );
    });

    // INVERTED by plan 02 Phase 2. Previously asserted that insertMany([])
    // clears the table. Inferring "empty the tasted list" from an empty array is
    // exactly what let a benign empty response, a malformed one and a genuine
    // empty round all reach the same DELETE. Emptying is now explicit.
    it('should route an empty payload through replaceAllWithEmpty', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();
      jest.spyOn(console, 'log').mockImplementation();
      mockDatabase.getFirstAsync.mockResolvedValue({ count: 5 });

      await repository.replaceAllWithEmpty();

      // Should clear the table
      expect(mockDatabase.runAsync).toHaveBeenCalledWith('DELETE FROM tasted_brew_current_round');

      // Should not insert any beers
      const insertCalls = mockDatabase.runAsync.mock.calls.filter((call: unknown[]) =>
        (call[0] as string).includes('INSERT OR REPLACE')
      );
      expect(insertCalls).toHaveLength(0);
    });

    it('should filter out beers without IDs', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();
      const beers: BeerfinderWithContainerType[] = [
        {
          id: '1',
          brew_name: 'Valid Beer',
          brewer: 'Test Brewery',
          roh_lap: '1',
          container_type: 'pint',
          abv: null,
          enrichment_confidence: null,
          enrichment_source: null,
        },
        {
          id: '',
          brew_name: 'Invalid Beer - No ID',
          brewer: 'Test Brewery',
          roh_lap: '2',
          container_type: 'pint',
          abv: null,
          enrichment_confidence: null,
          enrichment_source: null,
        } as BeerfinderWithContainerType,
        {
          id: '2',
          brew_name: 'Another Valid Beer',
          brewer: 'Test Brewery',
          roh_lap: '3',
          container_type: 'tulip',
          abv: null,
          enrichment_confidence: null,
          enrichment_source: null,
        },
      ];

      mockDatabase.getFirstAsync.mockResolvedValue({ count: 0 });

      await repository.insertMany(nel(beers));

      // Should only insert the valid beers (2 beers)
      const insertCalls = mockDatabase.runAsync.mock.calls.filter((call: unknown[]) =>
        (call[0] as string).includes('INSERT OR REPLACE')
      );

      expect(insertCalls).toHaveLength(2);
      expect(insertCalls[0][1]).toContain('1');
      expect(insertCalls[1][1]).toContain('2');
    });

    // INVERTED by plan 02 Phase 2. Previously asserted the table is CLEARED
    // when every row lacks an id — the repository's own comment called it
    // "clearing table instead of throwing error". Malformed input must not be
    // able to empty a user's tasted list.
    it('should throw rather than clear when all beers are invalid', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();
      jest.spyOn(console, 'log').mockImplementation();
      const beers: BeerfinderWithContainerType[] = [
        {
          id: '',
          brew_name: 'Invalid Beer 1',
          brewer: 'Test Brewery',
          container_type: 'pint',
          abv: null,
          enrichment_confidence: null,
          enrichment_source: null,
        } as BeerfinderWithContainerType,
        {
          id: '',
          brew_name: 'Invalid Beer 2',
          brewer: 'Test Brewery',
          container_type: 'pint',
          abv: null,
          enrichment_confidence: null,
          enrichment_source: null,
        } as BeerfinderWithContainerType,
      ];

      mockDatabase.getFirstAsync.mockResolvedValue({ count: 0 });

      await expect(repository.insertMany(beers as never)).rejects.toThrow(/lack/i);

      // And must NOT have cleared the table
      expect(mockDatabase.runAsync).not.toHaveBeenCalledWith(
        'DELETE FROM tasted_brew_current_round'
      );

      // Should not insert any beers
      const insertCalls = mockDatabase.runAsync.mock.calls.filter((call: unknown[]) =>
        (call[0] as string).includes('INSERT OR REPLACE')
      );
      expect(insertCalls).toHaveLength(0);
    });

    it('should process beers in batches of 20', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();
      const beers: BeerfinderWithContainerType[] = Array.from({ length: 50 }, (_, i) => ({
        id: `beer-${i}`,
        brew_name: `Beer ${i}`,
        brewer: 'Test Brewery',
        roh_lap: `${i}`,
        container_type: i % 2 === 0 ? ('pint' as const) : ('tulip' as const),
        abv: null,
        enrichment_confidence: null,
        enrichment_source: null,
      }));

      mockDatabase.getFirstAsync.mockResolvedValue({ count: 0 });

      await repository.insertMany(nel(beers));

      // Should use transactions for batching
      expect(mockDatabase.withTransactionAsync).toHaveBeenCalled();

      // Should insert all 50 beers
      const insertCalls = mockDatabase.runAsync.mock.calls.filter((call: unknown[]) =>
        (call[0] as string).includes('INSERT OR REPLACE')
      );
      expect(insertCalls).toHaveLength(50);
    });

    it('should handle beers with optional fields missing', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();
      const beers: BeerfinderWithContainerType[] = [
        {
          id: '1',
          brew_name: 'Minimal Tasted Beer',
          container_type: 'pint',
          abv: null,
          enrichment_confidence: null,
          enrichment_source: null,
          // All optional Beerfinder fields missing
        },
      ];

      mockDatabase.getFirstAsync.mockResolvedValue({ count: 0 });

      await repository.insertMany(nel(beers));

      // Should insert beer with empty strings for missing fields
      expect(mockDatabase.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO tasted_brew_current_round'),
        expect.arrayContaining(['1', '', '', 'Minimal Tasted Beer', '', '', '', '', '', '', '', ''])
      );
    });

    it('should throw error on database failure during insert', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();
      const beers: BeerfinderWithContainerType[] = [
        {
          id: '1',
          brew_name: 'Test Beer',
          brewer: 'Test Brewery',
          container_type: 'pint',
          abv: null,
          enrichment_confidence: null,
          enrichment_source: null,
        },
      ];

      mockDatabase.runAsync.mockRejectedValueOnce(new Error('Database error'));

      await expect(repository.insertMany(nel(beers))).rejects.toThrow('Database error');
    });

    it('should include all Beerfinder-specific fields in insert', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();
      const beers: BeerfinderWithContainerType[] = [
        {
          id: '1',
          brew_name: 'Complete Beer',
          brewer: 'Test Brewery',
          roh_lap: '5',
          tasted_date: '2024-01-15',
          review_ratings: '4.5',
          chit_code: 'CHT789',
          container_type: 'tulip',
          abv: null,
          enrichment_confidence: null,
          enrichment_source: null,
        },
      ];

      mockDatabase.getFirstAsync.mockResolvedValue({ count: 0 });

      await repository.insertMany(nel(beers));

      // Should include roh_lap, tasted_date, review_ratings, chit_code
      expect(mockDatabase.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('roh_lap, tasted_date'),
        expect.arrayContaining(['1', '5', '2024-01-15', 'Complete Beer', 'Test Brewery'])
      );
      expect(mockDatabase.runAsync).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['CHT789'])
      );
    });
  });

  describe('getAll', () => {
    it('should return all tasted beers ordered by id', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();
      const mockBeers: BeerfinderWithContainerType[] = [
        {
          id: '1',
          brew_name: 'Tasted Beer 1',
          brewer: 'Brewery 1',
          roh_lap: '1',
          tasted_date: '2024-01-01',
          container_type: 'pint',
          abv: null,
          enrichment_confidence: null,
          enrichment_source: null,
        },
        {
          id: '2',
          brew_name: 'Tasted Beer 2',
          brewer: 'Brewery 2',
          roh_lap: '2',
          tasted_date: '2024-01-02',
          container_type: 'tulip',
          abv: null,
          enrichment_confidence: null,
          enrichment_source: null,
        },
      ];

      mockDatabase.getAllAsync.mockResolvedValue(mockBeers);

      const result = await repository.getAll();

      expect(result).toEqual(mockBeers);
      expect(mockDatabase.getAllAsync).toHaveBeenCalledWith(
        'SELECT * FROM tasted_brew_current_round ORDER BY id'
      );
    });

    it('should return empty array when no tasted beers exist', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();

      mockDatabase.getAllAsync.mockResolvedValue([]);

      const result = await repository.getAll();

      expect(result).toEqual([]);
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
    it('should return tasted beer when found', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();
      const mockBeer: BeerfinderWithContainerType = {
        id: '123',
        brew_name: 'Tasted IPA',
        brewer: 'Test Brewery',
        roh_lap: '5',
        tasted_date: '2024-01-15',
        container_type: 'pint',
        abv: null,
        enrichment_confidence: null,
        enrichment_source: null,
      };

      mockDatabase.getFirstAsync.mockResolvedValue(mockBeer);

      const result = await repository.getById('123');

      expect(result).toEqual(mockBeer);
      expect(mockDatabase.getFirstAsync).toHaveBeenCalledWith(
        'SELECT * FROM tasted_brew_current_round WHERE id = ?',
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
        'SELECT * FROM tasted_brew_current_round WHERE id = ?',
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

  describe('clear', () => {
    it('should clear all tasted beers from the table', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();

      mockDatabase.getFirstAsync
        .mockResolvedValueOnce({ count: 10 })
        .mockResolvedValueOnce({ count: 0 });

      await repository.clear();

      expect(mockDatabase.runAsync).toHaveBeenCalledWith('DELETE FROM tasted_brew_current_round');
      expect(mockDatabase.withTransactionAsync).toHaveBeenCalled();
    });

    it('should handle clearing empty table', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();

      mockDatabase.getFirstAsync
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 });

      await repository.clear();

      expect(mockDatabase.runAsync).toHaveBeenCalledWith('DELETE FROM tasted_brew_current_round');
    });

    it('should throw error on database failure', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();

      mockDatabase.runAsync.mockRejectedValueOnce(new Error('Database error'));

      await expect(repository.clear()).rejects.toThrow('Database error');
    });
  });

  describe('getCount', () => {
    it('should return count of tasted beers', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();

      mockDatabase.getFirstAsync.mockResolvedValue({ count: 42 });

      const result = await repository.getCount();

      expect(result).toBe(42);
      expect(mockDatabase.getFirstAsync).toHaveBeenCalledWith(
        'SELECT COUNT(*) as count FROM tasted_brew_current_round'
      );
    });

    it('should return 0 when no beers exist', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();

      mockDatabase.getFirstAsync.mockResolvedValue({ count: 0 });

      const result = await repository.getCount();

      expect(result).toBe(0);
    });

    it('should handle null count result', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();

      mockDatabase.getFirstAsync.mockResolvedValue(null);

      const result = await repository.getCount();

      expect(result).toBe(0);
    });

    it('should throw error on database failure', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();

      mockDatabase.getFirstAsync.mockRejectedValueOnce(new Error('Database error'));

      await expect(repository.getCount()).rejects.toThrow('Database error');
    });
  });

  describe('error handling', () => {
    // INVERTED by plan 02 Phase 5 (was MyBeersRepository.test.ts:531).
    // Previously asserted the import resolves when a row insert fails. That is
    // the defect: the DELETE has already run in the same transaction, so
    // "gracefully" meant committing an empty or partial table and reporting
    // success. Rolling back and rejecting leaves the previous list intact.
    it('rejects rather than committing a partial list when a row insert fails', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();
      jest.spyOn(console, 'error').mockImplementation();
      const beers: BeerfinderWithContainerType[] = [
        {
          id: '1',
          brew_name: 'Beer 1',
          brewer: 'Brewery 1',
          container_type: 'pint',
          abv: null,
          enrichment_confidence: null,
          enrichment_source: null,
        },
        {
          id: '2',
          brew_name: 'Beer 2',
          brewer: 'Brewery 2',
          container_type: 'tulip',
          abv: null,
          enrichment_confidence: null,
          enrichment_source: null,
        },
      ];

      mockDatabase.getFirstAsync.mockResolvedValue({ count: 0 });

      // First insert fails, second succeeds
      mockDatabase.runAsync
        .mockResolvedValueOnce(undefined) // DELETE succeeds
        .mockRejectedValueOnce(new Error('Insert failed for beer 1')) // First beer fails
        .mockResolvedValueOnce(undefined); // Second beer succeeds

      await expect(repository.insertMany(nel(beers))).rejects.toThrow(/1 of 2/);
    });

    it('should throw error on transaction failure', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();
      const beers: BeerfinderWithContainerType[] = [
        {
          id: '1',
          brew_name: 'Test Beer',
          brewer: 'Test Brewery',
          container_type: 'pint',
          abv: null,
          enrichment_confidence: null,
          enrichment_source: null,
        },
      ];

      mockDatabase.withTransactionAsync.mockRejectedValueOnce(new Error('Transaction failed'));

      await expect(repository.insertMany(nel(beers))).rejects.toThrow('Transaction failed');
    });

    // ----------------------------------------------------------
    // Database contention (plan 02 Phase 0)
    //
    // `database is locked` is what expo-sqlite raises when a write
    // collides with an exclusive transaction on another connection.
    // The repository is the one boundary where the raw string is
    // tested; everything above it classifies by type.
    // ----------------------------------------------------------

    it('insertMany rethrows a database-is-locked failure as DatabaseContentionError', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();
      const beers: BeerfinderWithContainerType[] = [
        {
          id: '1',
          brew_name: 'Test Beer',
          brewer: 'Test Brewery',
          container_type: 'pint',
          abv: null,
          enrichment_confidence: null,
          enrichment_source: null,
        },
      ];

      mockDatabase.withTransactionAsync.mockRejectedValueOnce(new Error('database is locked'));

      await expect(repository.insertMany(nel(beers))).rejects.toBeInstanceOf(
        DatabaseContentionError
      );
    });

    it('insertMany leaves an unrelated database failure unwrapped', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();
      const beers: BeerfinderWithContainerType[] = [
        {
          id: '1',
          brew_name: 'Test Beer',
          brewer: 'Test Brewery',
          container_type: 'pint',
          abv: null,
          enrichment_confidence: null,
          enrichment_source: null,
        },
      ];
      const original = new Error('no such table: tasted_brew_current_round');

      mockDatabase.withTransactionAsync.mockRejectedValueOnce(original);

      await expect(repository.insertMany(nel(beers))).rejects.toBe(original);
    });
  });

  describe('malformed input must not wipe the table', () => {
    // The branch this covers is why narrowing the type alone cannot fix the
    // wipe: a NonEmptyArray whose every row lacks an `id` is perfectly
    // well-typed, passes the signature, reaches the filter, and — before this —
    // ran DELETE FROM tasted_brew_current_round and returned normally. The
    // repository's own comment admitted it chose wiping over throwing.
    const idless = [
      { brew_name: 'no id here' },
    ] as unknown as NonEmptyArray<BeerfinderWithContainerType>;

    function deleteCalls(mockDatabase: ReturnType<typeof createMockDatabase>) {
      return mockDatabase.runAsync.mock.calls.filter((call: unknown[]) =>
        String(call[0]).includes('DELETE FROM tasted_brew_current_round')
      );
    }

    it('insertMany throws when every supplied beer lacks an id', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);

      await expect(createRepository().insertMany(idless)).rejects.toThrow(/lack/i);

      expect(deleteCalls(mockDatabase)).toHaveLength(0);
    });

    it('insertManyUnsafe throws when every supplied beer lacks an id', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);

      await expect(createRepository().insertManyUnsafe(idless)).rejects.toThrow(/lack/i);

      expect(deleteCalls(mockDatabase)).toHaveLength(0);
    });
  });

  describe('lock discipline', () => {
    // Nothing previously pinned this: the tests asserted the METHOD NAME, not
    // that a lock was or was not taken, so swapping the two bodies left every
    // assertion holding. The convention is unenforced by the lock manager, and
    // 01 Phase 6 removes the hold timeout that currently rescues a mistake —
    // after which calling the locked variant from inside the master lock would
    // wedge permanently.
    it('replaceAllWithEmpty takes the master lock', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const lockSpy = jest.spyOn(databaseLockManager, 'withDatabaseLock');

      await createRepository().replaceAllWithEmpty();

      expect(lockSpy).toHaveBeenCalledWith(
        'MyBeersRepository.replaceAllWithEmpty',
        expect.any(Function)
      );
      lockSpy.mockRestore();
    });

    it('replaceAllWithEmptyUnsafe does NOT take the master lock', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const lockSpy = jest.spyOn(databaseLockManager, 'withDatabaseLock');

      await createRepository().replaceAllWithEmptyUnsafe();

      // Its callers already hold it; acquiring again would queue behind their
      // own live grant.
      expect(lockSpy).not.toHaveBeenCalled();
      lockSpy.mockRestore();
    });

    it('insertManyUnsafe does NOT take the master lock', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const lockSpy = jest.spyOn(databaseLockManager, 'withDatabaseLock');

      await createRepository().insertManyUnsafe(
        nel([
          {
            id: '1',
            brew_name: 'B',
            brewer: 'X',
            container_type: 'pint',
            abv: null,
            enrichment_confidence: null,
            enrichment_source: null,
          },
        ])
      );

      expect(lockSpy).not.toHaveBeenCalled();
      lockSpy.mockRestore();
    });
  });

  describe('replaceAllWithEmpty', () => {
    // Emptying the tasted table is legitimate — a new user, or the round
    // rollover at 200 beers. It just has to be asked for explicitly rather than
    // inferred from an array that happens to be empty.
    it('issues exactly one delete against the tasted table', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);

      await createRepository().replaceAllWithEmpty();

      const deletes = mockDatabase.runAsync.mock.calls.filter((call: unknown[]) =>
        String(call[0]).includes('DELETE FROM tasted_brew_current_round')
      );
      expect(deletes).toHaveLength(1);
    });

    it('has an unlocked twin for callers already holding the master lock', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);

      await createRepository().replaceAllWithEmptyUnsafe();

      const deletes = mockDatabase.runAsync.mock.calls.filter((call: unknown[]) =>
        String(call[0]).includes('DELETE FROM tasted_brew_current_round')
      );
      expect(deletes).toHaveLength(1);
    });
  });

  describe('signature', () => {
    it('insertMany cannot be called with an empty array', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);

      // Compile-time guard: the empty case now has an explicit method, so an
      // empty array must not be expressible as "insert these".
      // @ts-expect-error an empty array is not a NonEmptyArray
      await expect(createRepository().insertMany([])).rejects.toThrow();
    });
  });

  describe('per-row insert failures', () => {
    function oneBeer(): BeerfinderWithContainerType[] {
      return [
        {
          id: '1',
          brew_name: 'Test Beer',
          brewer: 'Test Brewery',
          container_type: 'pint',
          abv: null,
          enrichment_confidence: null,
          enrichment_source: null,
        },
      ];
    }

    // A swallowed row error inside the transaction, AFTER the DELETE has run in
    // that same transaction, commits an EMPTY table and returns normally. The
    // caller then stamps my_beers_last_check and the empty list persists for 12
    // hours — the reported wrong-count symptom, reached without any wipe branch.
    it('insertMany rejects when a row insert fails', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();

      mockDatabase.runAsync.mockImplementation(async (sql: string) =>
        String(sql).includes('INSERT')
          ? Promise.reject(new Error('SQLITE_CONSTRAINT: NOT NULL'))
          : Promise.resolve({ changes: 0, lastInsertRowId: 0 })
      );

      await expect(repository.insertMany(nel(oneBeer()))).rejects.toThrow();
    });

    it('insertMany reports the number of rows that failed to insert', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();

      mockDatabase.runAsync.mockImplementation(async (sql: string) =>
        String(sql).includes('INSERT')
          ? Promise.reject(new Error('SQLITE_CONSTRAINT: NOT NULL'))
          : Promise.resolve({ changes: 0, lastInsertRowId: 0 })
      );

      // The count is what makes the failure actionable — one bad row from the
      // API reads very differently from every row failing.
      await expect(repository.insertMany(nel(oneBeer()))).rejects.toThrow(/1 of 1/);
    });

    it('insertManyUnsafe rejects when a row insert fails', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();

      mockDatabase.runAsync.mockImplementation(async (sql: string) =>
        String(sql).includes('INSERT')
          ? Promise.reject(new Error('SQLITE_CONSTRAINT: NOT NULL'))
          : Promise.resolve({ changes: 0, lastInsertRowId: 0 })
      );

      await expect(repository.insertManyUnsafe(nel(oneBeer()))).rejects.toThrow(/1 of 1/);
    });

    it('surfaces a contention abort on a row as DatabaseContentionError, not a row-count error', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();

      mockDatabase.runAsync.mockImplementation(async (sql: string) =>
        String(sql).includes('INSERT')
          ? Promise.reject(new Error('database is locked'))
          : Promise.resolve({ changes: 0, lastInsertRowId: 0 })
      );

      // Distinguishable from malformed data: one is retryable, the other is not.
      //
      // toBeInstanceOf ALONE is not enough here, and that is not a hypothetical:
      // if contention were collected as a row failure, the aggregate message
      // would quote it ("First failure: database is locked"), the substring
      // matcher in isDatabaseLockedError would match the quote, and the wrapper
      // would be applied anyway — passing for entirely the wrong reason. So this
      // also pins that it did NOT become a row-count aggregate.
      const thrown = await repository.insertMany(nel(oneBeer())).catch(error => error);

      expect(thrown).toBeInstanceOf(DatabaseContentionError);
      // Checking the WRAPPED original, not the wrapper's message: the wrapper
      // rewrites the message either way, so asserting on it cannot tell the two
      // paths apart. If contention had been collected as a row failure, the
      // original here would be the "Failed to insert 1 of 1..." aggregate.
      const original = (thrown as DatabaseContentionError).originalError;
      expect((original as Error).message).toBe('database is locked');
    });

    it('lets a row failure escape the transaction body so the engine rolls back', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();

      // The mocked connection cannot model rollback, so assert the property that
      // CAUSES it: the failure must propagate out of the transaction callback.
      // Throwing after the transaction closes would commit the empty table and
      // then complain about it — which is the bug wearing a different hat.
      let transactionRejected = false;
      mockDatabase.withTransactionAsync.mockImplementation(
        async (callback: () => Promise<void>) => {
          try {
            await callback();
          } catch (error) {
            transactionRejected = true;
            throw error;
          }
        }
      );
      mockDatabase.runAsync.mockImplementation(async (sql: string) =>
        String(sql).includes('INSERT')
          ? Promise.reject(new Error('SQLITE_CONSTRAINT: NOT NULL'))
          : Promise.resolve({ changes: 0, lastInsertRowId: 0 })
      );

      await expect(repository.insertMany(nel(oneBeer()))).rejects.toThrow();

      expect(transactionRejected).toBe(true);
    });
  });

  describe('insertManyUnsafe contention mapping', () => {
    it('maps a lock abort on replaceAllWithEmpty to DatabaseContentionError', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();

      mockDatabase.withTransactionAsync.mockRejectedValueOnce(new Error('database is locked'));

      // A bare DELETE is the statement most likely to abort under contention,
      // and these two branches used to run outside the mapping entirely.
      await expect(repository.replaceAllWithEmptyUnsafe()).rejects.toBeInstanceOf(
        DatabaseContentionError
      );
    });

    it('maps a lock abort on the locked clear to DatabaseContentionError', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();

      mockDatabase.withTransactionAsync.mockRejectedValueOnce(new Error('database is locked'));

      await expect(repository.replaceAllWithEmpty()).rejects.toBeInstanceOf(
        DatabaseContentionError
      );
    });
  });

  describe('insertManyUnsafe', () => {
    it('should insert beers without acquiring lock', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();
      const beers: BeerfinderWithContainerType[] = [
        {
          id: '1',
          brew_name: 'Test Beer 1',
          brewer: 'Test Brewery',
          roh_lap: '1',
          container_type: 'pint',
          abv: null,
          enrichment_confidence: null,
          enrichment_source: null,
        },
        {
          id: '2',
          brew_name: 'Test Beer 2',
          brewer: 'Test Brewery',
          roh_lap: '2',
          container_type: 'tulip',
          abv: null,
          enrichment_confidence: null,
          enrichment_source: null,
        },
      ];

      mockDatabase.getFirstAsync.mockResolvedValue({ count: 0 });

      await repository.insertManyUnsafe(nel(beers));

      expect(mockDatabase.withTransactionAsync).toHaveBeenCalled();
      const insertCalls = mockDatabase.runAsync.mock.calls.filter((call: unknown[]) =>
        (call[0] as string).includes('INSERT OR REPLACE')
      );
      expect(insertCalls).toHaveLength(2);
    });

    // INVERTED by plan 02 Phase 2, same reasoning as the locked twin.
    it('should route an empty payload through replaceAllWithEmptyUnsafe', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();
      jest.spyOn(console, 'log').mockImplementation();
      mockDatabase.getFirstAsync.mockResolvedValue({ count: 5 });

      await repository.replaceAllWithEmptyUnsafe();

      expect(mockDatabase.runAsync).toHaveBeenCalledWith('DELETE FROM tasted_brew_current_round');
    });

    // INVERTED by plan 02 Phase 2, same reasoning as the locked twin.
    it('should throw rather than clear when all beers invalid', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();
      jest.spyOn(console, 'log').mockImplementation();
      const beers: BeerfinderWithContainerType[] = [
        {
          id: '',
          brew_name: 'Invalid Beer',
          brewer: 'Test',
          container_type: 'pint',
          abv: null,
          enrichment_confidence: null,
          enrichment_source: null,
        } as BeerfinderWithContainerType,
      ];

      mockDatabase.getFirstAsync.mockResolvedValue({ count: 0 });

      await expect(repository.insertManyUnsafe(beers as never)).rejects.toThrow(/lack/i);

      expect(mockDatabase.runAsync).not.toHaveBeenCalledWith(
        'DELETE FROM tasted_brew_current_round'
      );
    });

    it('should process beers in batches of 20', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();
      const beers: BeerfinderWithContainerType[] = Array.from({ length: 50 }, (_, i) => ({
        id: `beer-${i}`,
        brew_name: `Beer ${i}`,
        brewer: 'Test Brewery',
        roh_lap: `${i}`,
        container_type: i % 2 === 0 ? ('pint' as const) : ('tulip' as const),
        abv: null,
        enrichment_confidence: null,
        enrichment_source: null,
      }));

      mockDatabase.getFirstAsync.mockResolvedValue({ count: 0 });

      await repository.insertManyUnsafe(nel(beers));

      const insertCalls = mockDatabase.runAsync.mock.calls.filter((call: unknown[]) =>
        (call[0] as string).includes('INSERT OR REPLACE')
      );
      expect(insertCalls).toHaveLength(50);
    });

    it('should skip beers without IDs during insert', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();
      jest.spyOn(console, 'log').mockImplementation();
      const beers: BeerfinderWithContainerType[] = [
        {
          id: '1',
          brew_name: 'Valid',
          brewer: 'Test',
          container_type: 'pint',
          abv: null,
          enrichment_confidence: null,
          enrichment_source: null,
        },
        {
          id: '',
          brew_name: 'Invalid',
          brewer: 'Test',
          container_type: 'pint',
          abv: null,
          enrichment_confidence: null,
          enrichment_source: null,
        } as BeerfinderWithContainerType,
        {
          id: '2',
          brew_name: 'Valid 2',
          brewer: 'Test',
          container_type: 'tulip',
          abv: null,
          enrichment_confidence: null,
          enrichment_source: null,
        },
      ];

      mockDatabase.getFirstAsync.mockResolvedValue({ count: 0 });

      await repository.insertManyUnsafe(nel(beers));

      const insertCalls = mockDatabase.runAsync.mock.calls.filter((call: unknown[]) =>
        (call[0] as string).includes('INSERT OR REPLACE')
      );
      expect(insertCalls).toHaveLength(2); // Only valid beers inserted
    });

    // INVERTED by plan 02 Phase 5 (was MyBeersRepository.test.ts:894), same
    // reasoning as its locked twin above.
    it('rejects rather than committing a partial list when a row insert fails', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();
      jest.spyOn(console, 'error').mockImplementation();
      const beers: BeerfinderWithContainerType[] = [
        {
          id: '1',
          brew_name: 'Beer 1',
          brewer: 'Test',
          container_type: 'pint',
          abv: null,
          enrichment_confidence: null,
          enrichment_source: null,
        },
      ];

      mockDatabase.getFirstAsync.mockResolvedValue({ count: 0 });
      mockDatabase.runAsync
        .mockResolvedValueOnce(undefined) // DELETE succeeds
        .mockRejectedValueOnce(new Error('Insert failed')); // INSERT fails

      await expect(repository.insertManyUnsafe(nel(beers))).rejects.toThrow(/of /);
    });

    it('should throw error on transaction failure', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();
      const beers: BeerfinderWithContainerType[] = [
        {
          id: '1',
          brew_name: 'Test Beer',
          brewer: 'Test',
          container_type: 'pint',
          abv: null,
          enrichment_confidence: null,
          enrichment_source: null,
        },
      ];

      mockDatabase.withTransactionAsync.mockRejectedValueOnce(new Error('Transaction failed'));

      await expect(repository.insertManyUnsafe(nel(beers))).rejects.toThrow('Transaction failed');
    });
  });
  // ==========================================================================
  // Lock lifetime (plan 01 Phase 3)
  //
  // These suites use the REAL databaseLockManager, so isLocked() asserts
  // genuine lock state. This is the guard for the likeliest defect in the
  // migration to withDatabaseLock: a dropped release, which on a device shows
  // up as a permanent hang at splash rather than a test failure.
  // ==========================================================================

  describe('lock lifetime', () => {
    it('does not leave the lock held when the write throws', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();
      const beers: BeerfinderWithContainerType[] = [
        {
          id: '1',
          brew_name: 'Test Beer',
          brewer: 'Test Brewery',
          container_type: 'pint',
          abv: null,
          enrichment_confidence: null,
          enrichment_source: null,
        },
      ];

      mockDatabase.runAsync.mockRejectedValue(new Error('Database error'));

      await expect(repository.insertMany(nel(beers))).rejects.toThrow();

      expect(databaseLockManager.isLocked()).toBe(false);
      expect(databaseLockManager.getQueueLength()).toBe(0);
    });

    it('does not leave the lock held on a successful write', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const repository = createRepository();
      const beers: BeerfinderWithContainerType[] = [
        {
          id: '1',
          brew_name: 'Test Beer',
          brewer: 'Test Brewery',
          container_type: 'pint',
          abv: null,
          enrichment_confidence: null,
          enrichment_source: null,
        },
      ];

      await repository.insertMany(nel(beers));

      expect(databaseLockManager.isLocked()).toBe(false);
    });
  });
});
