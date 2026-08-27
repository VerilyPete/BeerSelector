import { vi, type Mock } from 'vitest';
import { withDatabaseTransaction, DatabaseOperationResult } from '../transactions';
import type { SQLiteDatabase } from 'expo-sqlite';

// Mock expo-sqlite
vi.mock('expo-sqlite');

// `runAsync` is REQUIRED, and createMockDatabase always supplies it. It used to
// be optional, with every call site written `db.runAsync(...)` — which meant a
// test that forgot to assign it would run its "write" as a silent no-op and
// still pass, because the operation's return value is what gets asserted. Every
// test in this file happened to assign it, so nothing was vacuous; the trapdoor
// was that nothing stopped the next one from being. Making it required moves
// that from luck to a compile error.
type MockDatabase = {
  withTransactionAsync: Mock;
  runAsync: Mock;
};

function createMockDatabase(): MockDatabase {
  return {
    withTransactionAsync: vi.fn(),
    runAsync: vi.fn(),
  };
}

/**
 * Stands in for an SQLiteDatabase. Cast at the call site because the mock
 * implements only the handful of methods withDatabaseTransaction actually
 * uses (`withTransactionAsync`, and `runAsync` for call-count assertions),
 * matching the convention in BeerRepository.atomicity.test.ts.
 *
 * Worth being honest about what this suite does and does not prove: it verifies
 * that withDatabaseTransaction calls through, propagates results, and lets
 * errors escape. It does NOT exercise SQLite transaction semantics — nothing
 * here rolls anything back, because the "database" is two jest.fn()s. A test
 * named "should rollback all operations if any operation fails" is asserting
 * that the error propagates, not that a rollback occurred.
 */
function asDatabase(mock: MockDatabase): SQLiteDatabase {
  return mock as unknown as SQLiteDatabase;
}

describe('Database Transactions', () => {
  describe('withDatabaseTransaction', () => {
    it('should execute operation within transaction successfully', async () => {
      const mockDatabase = createMockDatabase();
      const mockOperation = vi.fn().mockResolvedValue({ success: true, recordsAffected: 10 });

      mockDatabase.withTransactionAsync.mockImplementation(
        async (callback: () => Promise<unknown>) => {
          return await callback();
        }
      );

      const result = await withDatabaseTransaction(asDatabase(mockDatabase), mockOperation);

      expect(result.success).toBe(true);
      expect(result.recordsAffected).toBe(10);
      expect(mockDatabase.withTransactionAsync).toHaveBeenCalledTimes(1);
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it('should rollback transaction on operation failure', async () => {
      const mockDatabase = createMockDatabase();
      const mockError = new Error('Database operation failed');
      const mockOperation = vi.fn().mockRejectedValue(mockError);

      mockDatabase.withTransactionAsync.mockImplementation(
        async (callback: () => Promise<unknown>) => {
          try {
            await callback();
          } catch (error) {
            // Transaction automatically rolls back on error
            throw error;
          }
        }
      );

      await expect(
        withDatabaseTransaction(asDatabase(mockDatabase), mockOperation)
      ).rejects.toThrow('Database operation failed');

      expect(mockDatabase.withTransactionAsync).toHaveBeenCalledTimes(1);
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it('should pass database to operation callback', async () => {
      const mockDatabase = createMockDatabase();
      const mockOperation = vi.fn().mockResolvedValue({ success: true });

      mockDatabase.withTransactionAsync.mockImplementation(
        async (callback: () => Promise<unknown>) => {
          return await callback();
        }
      );

      await withDatabaseTransaction(asDatabase(mockDatabase), mockOperation);

      expect(mockOperation).toHaveBeenCalledWith(mockDatabase);
    });

    it('should handle multiple operations in single transaction', async () => {
      const mockDatabase = createMockDatabase();
      let insertCalled = false;
      let updateCalled = false;

      const mockOperation = vi.fn(async (db: SQLiteDatabase) => {
        // Simulate multiple database operations
        await db.runAsync('INSERT INTO table1...');
        insertCalled = true;

        await db.runAsync('UPDATE table2...');
        updateCalled = true;

        return { success: true, recordsAffected: 2 };
      });

      mockDatabase.runAsync = vi.fn().mockResolvedValue(undefined);

      mockDatabase.withTransactionAsync.mockImplementation(
        async (callback: () => Promise<unknown>) => {
          return await callback();
        }
      );

      const result = await withDatabaseTransaction(asDatabase(mockDatabase), mockOperation);

      expect(result.success).toBe(true);
      expect(insertCalled).toBe(true);
      expect(updateCalled).toBe(true);
      expect(mockDatabase.withTransactionAsync).toHaveBeenCalledTimes(1);
    });

    it('should rollback all operations if any operation fails', async () => {
      const mockDatabase = createMockDatabase();
      const mockOperation = vi.fn(async (db: SQLiteDatabase) => {
        // First operation succeeds
        await db.runAsync('INSERT INTO table1...');

        // Second operation fails; step 3 (a further runAsync call) is never reached
        throw new Error('Second operation failed');
      });

      mockDatabase.runAsync = vi.fn().mockResolvedValue(undefined);

      mockDatabase.withTransactionAsync.mockImplementation(
        async (callback: () => Promise<unknown>) => {
          try {
            await callback();
          } catch (error) {
            // Rollback happens automatically
            throw error;
          }
        }
      );

      await expect(
        withDatabaseTransaction(asDatabase(mockDatabase), mockOperation)
      ).rejects.toThrow('Second operation failed');

      // Both operations should have been attempted
      expect(mockOperation).toHaveBeenCalledTimes(1);
      // But transaction should have rolled back (handled by SQLite)
    });

    it('should return operation result on success', async () => {
      const mockDatabase = createMockDatabase();
      const expectedResult: DatabaseOperationResult = {
        success: true,
        recordsAffected: 25,
        data: { someKey: 'someValue' },
      };

      const mockOperation = vi.fn().mockResolvedValue(expectedResult);

      mockDatabase.withTransactionAsync.mockImplementation(
        async (callback: () => Promise<unknown>) => {
          return await callback();
        }
      );

      const result = await withDatabaseTransaction(asDatabase(mockDatabase), mockOperation);

      expect(result).toEqual(expectedResult);
    });

    it('should handle operation returning undefined', async () => {
      const mockDatabase = createMockDatabase();
      const mockOperation = vi.fn().mockResolvedValue(undefined);

      mockDatabase.withTransactionAsync.mockImplementation(
        async (callback: () => Promise<unknown>) => {
          return await callback();
        }
      );

      const result = await withDatabaseTransaction(asDatabase(mockDatabase), mockOperation);

      expect(result).toBeUndefined();
    });

    it('should handle concurrent transaction attempts gracefully', async () => {
      const mockDatabase = createMockDatabase();
      const mockOperation = vi.fn().mockResolvedValue({ success: true });

      mockDatabase.withTransactionAsync.mockImplementation(
        async (callback: () => Promise<unknown>) => {
          return await callback();
        }
      );

      // Start multiple transactions concurrently
      const promise1 = withDatabaseTransaction(asDatabase(mockDatabase), mockOperation);
      const promise2 = withDatabaseTransaction(asDatabase(mockDatabase), mockOperation);
      const promise3 = withDatabaseTransaction(asDatabase(mockDatabase), mockOperation);

      const results = await Promise.all([promise1, promise2, promise3]);

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result.success).toBe(true);
      });
      expect(mockDatabase.withTransactionAsync).toHaveBeenCalledTimes(3);
    });

    it('should propagate error details from failed operation', async () => {
      const mockDatabase = createMockDatabase();
      const mockError = new Error('Constraint violation');
      mockError.name = 'SQLiteError';

      const mockOperation = vi.fn().mockRejectedValue(mockError);

      mockDatabase.withTransactionAsync.mockImplementation(
        async (callback: () => Promise<unknown>) => {
          try {
            await callback();
          } catch (error) {
            throw error;
          }
        }
      );

      try {
        await withDatabaseTransaction(asDatabase(mockDatabase), mockOperation);
        fail('Should have thrown error');
      } catch (error) {
        expect(error).toBe(mockError);
        expect((error as Error).name).toBe('SQLiteError');
        expect((error as Error).message).toBe('Constraint violation');
      }
    });

    it('should handle operation with complex return type', async () => {
      const mockDatabase = createMockDatabase();
      interface ComplexResult extends DatabaseOperationResult {
        validRecords: Record<string, unknown>[];
        invalidRecords: Record<string, unknown>[];
        summary: { valid: number; invalid: number };
      }

      const expectedResult: ComplexResult = {
        success: true,
        recordsAffected: 10,
        validRecords: [{ id: 1 }, { id: 2 }],
        invalidRecords: [{ id: 3 }],
        summary: { valid: 2, invalid: 1 },
      };

      const mockOperation = vi.fn().mockResolvedValue(expectedResult);

      mockDatabase.withTransactionAsync.mockImplementation(
        async (callback: () => Promise<unknown>) => {
          return await callback();
        }
      );

      const result = await withDatabaseTransaction(asDatabase(mockDatabase), mockOperation);

      expect(result).toEqual(expectedResult);
      expect(result.validRecords).toHaveLength(2);
      expect(result.invalidRecords).toHaveLength(1);
    });
  });

  describe('Real-world transaction scenarios', () => {
    it('should handle beer insertion with validation', async () => {
      const mockDatabase = createMockDatabase();
      const beers = [
        { id: 1, brew_name: 'Beer 1' },
        { id: 2, brew_name: 'Beer 2' },
        { id: 3, brew_name: 'Beer 3' },
      ];

      const mockOperation = vi.fn(async (db: SQLiteDatabase) => {
        let recordsInserted = 0;

        for (const beer of beers) {
          await db.runAsync('INSERT INTO allbeers (id, brew_name) VALUES (?, ?)', [
            beer.id,
            beer.brew_name,
          ]);
          recordsInserted++;
        }

        return { success: true, recordsAffected: recordsInserted };
      });

      mockDatabase.runAsync = vi.fn().mockResolvedValue(undefined);

      mockDatabase.withTransactionAsync.mockImplementation(
        async (callback: () => Promise<unknown>) => {
          return await callback();
        }
      );

      const result = await withDatabaseTransaction(asDatabase(mockDatabase), mockOperation);

      expect(result.success).toBe(true);
      expect(result.recordsAffected).toBe(3);
      expect(mockDatabase.runAsync).toHaveBeenCalledTimes(3);
    });

    it('should rollback beer insertion on constraint violation', async () => {
      const mockDatabase = createMockDatabase();
      const beers = [
        { id: 1, brew_name: 'Beer 1' },
        { id: 2, brew_name: 'Beer 2' },
        { id: 1, brew_name: 'Duplicate ID' }, // Duplicate ID should fail
      ];

      const mockOperation = vi.fn(async (db: SQLiteDatabase) => {
        for (const beer of beers) {
          await db.runAsync('INSERT INTO allbeers (id, brew_name) VALUES (?, ?)', [
            beer.id,
            beer.brew_name,
          ]);
        }

        return { success: true, recordsAffected: beers.length };
      });

      // First two inserts succeed, third fails
      mockDatabase.runAsync = vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('UNIQUE constraint failed'));

      mockDatabase.withTransactionAsync.mockImplementation(
        async (callback: () => Promise<unknown>) => {
          try {
            await callback();
          } catch (error) {
            throw error;
          }
        }
      );

      await expect(
        withDatabaseTransaction(asDatabase(mockDatabase), mockOperation)
      ).rejects.toThrow('UNIQUE constraint failed');

      // All three inserts should have been attempted
      expect(mockDatabase.runAsync).toHaveBeenCalledTimes(3);
    });

    it('should handle multi-table update transaction', async () => {
      const mockDatabase = createMockDatabase();
      const mockOperation = vi.fn(async (db: SQLiteDatabase) => {
        // Update beers table
        await db.runAsync('UPDATE allbeers SET style = ? WHERE id = ?', ['IPA', 1]);

        // Update tasted_brew table
        await db.runAsync(
          'INSERT INTO tasted_brew_current_round (beer_id, tasted_date) VALUES (?, ?)',
          [1, Date.now()]
        );

        // Update preferences
        await db.runAsync('UPDATE preferences SET value = ? WHERE key = ?', [
          Date.now().toString(),
          'last_update',
        ]);

        return { success: true, recordsAffected: 3 };
      });

      mockDatabase.runAsync = vi.fn().mockResolvedValue(undefined);

      mockDatabase.withTransactionAsync.mockImplementation(
        async (callback: () => Promise<unknown>) => {
          return await callback();
        }
      );

      const result = await withDatabaseTransaction(asDatabase(mockDatabase), mockOperation);

      expect(result.success).toBe(true);
      expect(mockDatabase.runAsync).toHaveBeenCalledTimes(3);
    });

    it('should handle delete old and insert new data transaction', async () => {
      const mockDatabase = createMockDatabase();
      const newBeers = [
        { id: 1, brew_name: 'New Beer 1' },
        { id: 2, brew_name: 'New Beer 2' },
      ];

      const mockOperation = vi.fn(async (db: SQLiteDatabase) => {
        // Delete old data
        await db.runAsync('DELETE FROM allbeers');

        // Insert new data
        for (const beer of newBeers) {
          await db.runAsync('INSERT INTO allbeers (id, brew_name) VALUES (?, ?)', [
            beer.id,
            beer.brew_name,
          ]);
        }

        return { success: true, recordsAffected: newBeers.length };
      });

      mockDatabase.runAsync = vi.fn().mockResolvedValue(undefined);

      mockDatabase.withTransactionAsync.mockImplementation(
        async (callback: () => Promise<unknown>) => {
          return await callback();
        }
      );

      const result = await withDatabaseTransaction(asDatabase(mockDatabase), mockOperation);

      expect(result.success).toBe(true);
      // 1 DELETE + 2 INSERTS = 3 calls
      expect(mockDatabase.runAsync).toHaveBeenCalledTimes(3);
    });

    it('should ensure all-or-nothing behavior for data refresh', async () => {
      const mockDatabase = createMockDatabase();
      const mockOperation = vi.fn(async (db: SQLiteDatabase) => {
        // Step 1: Clear old data
        await db.runAsync('DELETE FROM allbeers');

        // Step 2: Insert new data (this fails)
        throw new Error('Network error during data fetch');
      });

      mockDatabase.runAsync = vi.fn().mockResolvedValue(undefined);

      mockDatabase.withTransactionAsync.mockImplementation(
        async (callback: () => Promise<unknown>) => {
          try {
            await callback();
          } catch (error) {
            // Rollback happens automatically
            throw error;
          }
        }
      );

      await expect(
        withDatabaseTransaction(asDatabase(mockDatabase), mockOperation)
      ).rejects.toThrow('Network error during data fetch');

      // Only the DELETE should have been attempted
      expect(mockDatabase.runAsync).toHaveBeenCalledTimes(1);
      // And it should have been rolled back automatically
    });
  });
});
