import { withDatabaseTransaction, withBatchInsert, withReplaceData, DatabaseOperationResult } from '../transactions';
import * as SQLite from 'expo-sqlite';

// Mock expo-sqlite
jest.mock('expo-sqlite');

describe('Database Transactions', () => {
  let mockDatabase: any;
  let mockWithTransactionAsync: jest.Mock;

  beforeEach(() => {
    // Create mock database with transaction method
    mockWithTransactionAsync = jest.fn();
    mockDatabase = {
      withTransactionAsync: mockWithTransactionAsync,
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('withDatabaseTransaction', () => {
    it('should execute operation within transaction successfully', async () => {
      const mockOperation = jest.fn().mockResolvedValue({ success: true, recordsAffected: 10 });

      mockWithTransactionAsync.mockImplementation(async (callback: any) => {
        return await callback();
      });

      const result = await withDatabaseTransaction(mockDatabase, mockOperation);

      expect(result.success).toBe(true);
      expect(result.recordsAffected).toBe(10);
      expect(mockWithTransactionAsync).toHaveBeenCalledTimes(1);
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it('should rollback transaction on operation failure', async () => {
      const mockError = new Error('Database operation failed');
      const mockOperation = jest.fn().mockRejectedValue(mockError);

      mockWithTransactionAsync.mockImplementation(async (callback: any) => {
        try {
          await callback();
        } catch (error) {
          // Transaction automatically rolls back on error
          throw error;
        }
      });

      await expect(withDatabaseTransaction(mockDatabase, mockOperation)).rejects.toThrow(
        'Database operation failed'
      );

      expect(mockWithTransactionAsync).toHaveBeenCalledTimes(1);
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it('should pass database to operation callback', async () => {
      const mockOperation = jest.fn().mockResolvedValue({ success: true });

      mockWithTransactionAsync.mockImplementation(async (callback: any) => {
        return await callback();
      });

      await withDatabaseTransaction(mockDatabase, mockOperation);

      expect(mockOperation).toHaveBeenCalledWith(mockDatabase);
    });

    it('should handle multiple operations in single transaction', async () => {
      let insertCalled = false;
      let updateCalled = false;

      const mockOperation = jest.fn(async (db: any) => {
        // Simulate multiple database operations
        await db.runAsync('INSERT INTO table1...');
        insertCalled = true;

        await db.runAsync('UPDATE table2...');
        updateCalled = true;

        return { success: true, recordsAffected: 2 };
      });

      mockDatabase.runAsync = jest.fn().mockResolvedValue(undefined);

      mockWithTransactionAsync.mockImplementation(async (callback: any) => {
        return await callback();
      });

      const result = await withDatabaseTransaction(mockDatabase, mockOperation);

      expect(result.success).toBe(true);
      expect(insertCalled).toBe(true);
      expect(updateCalled).toBe(true);
      expect(mockWithTransactionAsync).toHaveBeenCalledTimes(1);
    });

    it('should rollback all operations if any operation fails', async () => {
      const mockOperation = jest.fn(async (db: any) => {
        // First operation succeeds
        await db.runAsync('INSERT INTO table1...');

        // Second operation fails
        throw new Error('Second operation failed');
      });

      mockDatabase.runAsync = jest.fn().mockResolvedValue(undefined);

      mockWithTransactionAsync.mockImplementation(async (callback: any) => {
        try {
          await callback();
        } catch (error) {
          // Rollback happens automatically
          throw error;
        }
      });

      await expect(withDatabaseTransaction(mockDatabase, mockOperation)).rejects.toThrow(
        'Second operation failed'
      );

      // Both operations should have been attempted
      expect(mockOperation).toHaveBeenCalledTimes(1);
      // But transaction should have rolled back (handled by SQLite)
    });

    it('should return operation result on success', async () => {
      const expectedResult: DatabaseOperationResult = {
        success: true,
        recordsAffected: 25,
        data: { someKey: 'someValue' },
      };

      const mockOperation = jest.fn().mockResolvedValue(expectedResult);

      mockWithTransactionAsync.mockImplementation(async (callback: any) => {
        return await callback();
      });

      const result = await withDatabaseTransaction(mockDatabase, mockOperation);

      expect(result).toEqual(expectedResult);
    });

    it('should handle operation returning undefined', async () => {
      const mockOperation = jest.fn().mockResolvedValue(undefined);

      mockWithTransactionAsync.mockImplementation(async (callback: any) => {
        return await callback();
      });

      const result = await withDatabaseTransaction(mockDatabase, mockOperation);

      expect(result).toBeUndefined();
    });

    it('should handle concurrent transaction attempts gracefully', async () => {
      const mockOperation = jest.fn().mockResolvedValue({ success: true });

      mockWithTransactionAsync.mockImplementation(async (callback: any) => {
        return await callback();
      });

      // Start multiple transactions concurrently
      const promise1 = withDatabaseTransaction(mockDatabase, mockOperation);
      const promise2 = withDatabaseTransaction(mockDatabase, mockOperation);
      const promise3 = withDatabaseTransaction(mockDatabase, mockOperation);

      const results = await Promise.all([promise1, promise2, promise3]);

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result.success).toBe(true);
      });
      expect(mockWithTransactionAsync).toHaveBeenCalledTimes(3);
    });

    it('should propagate error details from failed operation', async () => {
      const mockError = new Error('Constraint violation');
      mockError.name = 'SQLiteError';

      const mockOperation = jest.fn().mockRejectedValue(mockError);

      mockWithTransactionAsync.mockImplementation(async (callback: any) => {
        try {
          await callback();
        } catch (error) {
          throw error;
        }
      });

      try {
        await withDatabaseTransaction(mockDatabase, mockOperation);
        fail('Should have thrown error');
      } catch (error) {
        expect(error).toBe(mockError);
        expect((error as Error).name).toBe('SQLiteError');
        expect((error as Error).message).toBe('Constraint violation');
      }
    });

    it('should handle operation with complex return type', async () => {
      interface ComplexResult extends DatabaseOperationResult {
        validRecords: any[];
        invalidRecords: any[];
        summary: { valid: number; invalid: number };
      }

      const expectedResult: ComplexResult = {
        success: true,
        recordsAffected: 10,
        validRecords: [{ id: 1 }, { id: 2 }],
        invalidRecords: [{ id: 3 }],
        summary: { valid: 2, invalid: 1 },
      };

      const mockOperation = jest.fn().mockResolvedValue(expectedResult);

      mockWithTransactionAsync.mockImplementation(async (callback: any) => {
        return await callback();
      });

      const result = await withDatabaseTransaction(mockDatabase, mockOperation);

      expect(result).toEqual(expectedResult);
      expect(result.validRecords).toHaveLength(2);
      expect(result.invalidRecords).toHaveLength(1);
    });
  });

  describe('withBatchInsert', () => {
    it('should insert all valid records and skip invalid ones', async () => {
      const records = [
        { id: 1, name: 'Valid 1' },
        { id: 2, name: 'Valid 2' },
        { id: null, name: 'Invalid' }, // Invalid due to null id
        { id: 3, name: 'Valid 3' },
      ];

      const validator = (record: any) => {
        if (record.id === null || record.id === undefined) {
          return { isValid: false, errors: ['Missing id'] };
        }
        return { isValid: true, errors: [] };
      };

      const insertFn = jest.fn().mockResolvedValue(undefined);

      mockWithTransactionAsync.mockImplementation(async (callback: any) => {
        return await callback();
      });

      const result = await withBatchInsert(
        mockDatabase,
        'test_table',
        records,
        validator,
        insertFn
      );

      expect(result.success).toBe(true);
      expect(result.recordsAffected).toBe(3);
      expect(result.validRecords).toHaveLength(3);
      expect(result.invalidRecords).toHaveLength(1);
      expect(result.summary).toEqual({ valid: 3, invalid: 1 });
      expect(insertFn).toHaveBeenCalledTimes(3);
    });

    it('should handle all valid records', async () => {
      const records = [
        { id: 1, name: 'Valid 1' },
        { id: 2, name: 'Valid 2' },
      ];

      const validator = () => ({ isValid: true, errors: [] });
      const insertFn = jest.fn().mockResolvedValue(undefined);

      mockWithTransactionAsync.mockImplementation(async (callback: any) => {
        return await callback();
      });

      const result = await withBatchInsert(
        mockDatabase,
        'test_table',
        records,
        validator,
        insertFn
      );

      expect(result.success).toBe(true);
      expect(result.recordsAffected).toBe(2);
      expect(result.validRecords).toHaveLength(2);
      expect(result.invalidRecords).toHaveLength(0);
    });

    it('should handle all invalid records', async () => {
      const records = [
        { id: null, name: 'Invalid 1' },
        { id: null, name: 'Invalid 2' },
      ];

      const validator = () => ({ isValid: false, errors: ['Invalid record'] });
      const insertFn = jest.fn().mockResolvedValue(undefined);

      mockWithTransactionAsync.mockImplementation(async (callback: any) => {
        return await callback();
      });

      const result = await withBatchInsert(
        mockDatabase,
        'test_table',
        records,
        validator,
        insertFn
      );

      expect(result.success).toBe(true);
      expect(result.recordsAffected).toBe(0);
      expect(result.validRecords).toHaveLength(0);
      expect(result.invalidRecords).toHaveLength(2);
      expect(insertFn).not.toHaveBeenCalled();
    });

    it('should handle empty record array', async () => {
      const records: any[] = [];
      const validator = () => ({ isValid: true, errors: [] });
      const insertFn = jest.fn().mockResolvedValue(undefined);

      mockWithTransactionAsync.mockImplementation(async (callback: any) => {
        return await callback();
      });

      const result = await withBatchInsert(
        mockDatabase,
        'test_table',
        records,
        validator,
        insertFn
      );

      expect(result.success).toBe(true);
      expect(result.recordsAffected).toBe(0);
      expect(insertFn).not.toHaveBeenCalled();
    });

    it('should rollback if insert fails mid-batch', async () => {
      const records = [
        { id: 1, name: 'Valid 1' },
        { id: 2, name: 'Valid 2' },
        { id: 3, name: 'Valid 3' },
      ];

      const validator = () => ({ isValid: true, errors: [] });
      const insertFn = jest.fn()
        .mockResolvedValueOnce(undefined) // First succeeds
        .mockRejectedValueOnce(new Error('Insert failed')); // Second fails

      mockWithTransactionAsync.mockImplementation(async (callback: any) => {
        try {
          await callback();
        } catch (error) {
          throw error;
        }
      });

      await expect(
        withBatchInsert(mockDatabase, 'test_table', records, validator, insertFn)
      ).rejects.toThrow('Insert failed');

      // First insert was attempted, second failed
      expect(insertFn).toHaveBeenCalledTimes(2);
    });

    it('should handle validation with multiple error messages', async () => {
      const records = [
        { id: 1, name: 'Valid' },
        { id: null, name: '' }, // Multiple errors
      ];

      const validator = (record: any) => {
        const errors: string[] = [];
        if (record.id === null) errors.push('Missing id');
        if (record.name === '') errors.push('Missing name');
        return { isValid: errors.length === 0, errors };
      };

      const insertFn = jest.fn().mockResolvedValue(undefined);

      mockWithTransactionAsync.mockImplementation(async (callback: any) => {
        return await callback();
      });

      const result = await withBatchInsert(
        mockDatabase,
        'test_table',
        records,
        validator,
        insertFn
      );

      expect(result.success).toBe(true);
      expect(result.recordsAffected).toBe(1);
      expect(result.invalidRecords).toHaveLength(1);
    });
  });

  describe('withReplaceData', () => {
    it('should delete all old data and insert new data', async () => {
      const newRecords = [
        { id: 1, name: 'New 1' },
        { id: 2, name: 'New 2' },
      ];

      const insertFn = jest.fn().mockResolvedValue(undefined);
      mockDatabase.runAsync = jest.fn().mockResolvedValue(undefined);

      mockWithTransactionAsync.mockImplementation(async (callback: any) => {
        return await callback();
      });

      const result = await withReplaceData(
        mockDatabase,
        'test_table',
        undefined, // Delete all
        newRecords,
        insertFn
      );

      expect(result.success).toBe(true);
      expect(result.recordsAffected).toBe(2);
      expect(mockDatabase.runAsync).toHaveBeenCalledWith('DELETE FROM test_table');
      expect(insertFn).toHaveBeenCalledTimes(2);
    });

    it('should delete with condition and insert new data', async () => {
      const newRecords = [{ id: 1, name: 'New' }];
      const insertFn = jest.fn().mockResolvedValue(undefined);
      mockDatabase.runAsync = jest.fn().mockResolvedValue(undefined);

      mockWithTransactionAsync.mockImplementation(async (callback: any) => {
        return await callback();
      });

      const result = await withReplaceData(
        mockDatabase,
        'test_table',
        'WHERE id > 10',
        newRecords,
        insertFn
      );

      expect(result.success).toBe(true);
      expect(mockDatabase.runAsync).toHaveBeenCalledWith('DELETE FROM test_table WHERE id > 10');
      expect(insertFn).toHaveBeenCalledTimes(1);
    });

    it('should handle empty new records array', async () => {
      const newRecords: any[] = [];
      const insertFn = jest.fn().mockResolvedValue(undefined);
      mockDatabase.runAsync = jest.fn().mockResolvedValue(undefined);

      mockWithTransactionAsync.mockImplementation(async (callback: any) => {
        return await callback();
      });

      const result = await withReplaceData(
        mockDatabase,
        'test_table',
        undefined,
        newRecords,
        insertFn
      );

      expect(result.success).toBe(true);
      expect(result.recordsAffected).toBe(0);
      expect(mockDatabase.runAsync).toHaveBeenCalledWith('DELETE FROM test_table');
      expect(insertFn).not.toHaveBeenCalled();
    });

    it('should rollback if delete fails', async () => {
      const newRecords = [{ id: 1, name: 'New' }];
      const insertFn = jest.fn().mockResolvedValue(undefined);
      mockDatabase.runAsync = jest.fn().mockRejectedValue(new Error('Delete failed'));

      mockWithTransactionAsync.mockImplementation(async (callback: any) => {
        try {
          await callback();
        } catch (error) {
          throw error;
        }
      });

      await expect(
        withReplaceData(mockDatabase, 'test_table', undefined, newRecords, insertFn)
      ).rejects.toThrow('Delete failed');

      // Insert should not have been attempted
      expect(insertFn).not.toHaveBeenCalled();
    });

    it('should rollback if insert fails after delete', async () => {
      const newRecords = [
        { id: 1, name: 'New 1' },
        { id: 2, name: 'New 2' },
      ];

      const insertFn = jest.fn()
        .mockResolvedValueOnce(undefined) // First insert succeeds
        .mockRejectedValueOnce(new Error('Insert failed')); // Second insert fails

      mockDatabase.runAsync = jest.fn().mockResolvedValue(undefined);

      mockWithTransactionAsync.mockImplementation(async (callback: any) => {
        try {
          await callback();
        } catch (error) {
          throw error;
        }
      });

      await expect(
        withReplaceData(mockDatabase, 'test_table', undefined, newRecords, insertFn)
      ).rejects.toThrow('Insert failed');

      // Delete and first insert were attempted
      expect(mockDatabase.runAsync).toHaveBeenCalledTimes(1);
      expect(insertFn).toHaveBeenCalledTimes(2);
    });

    it('should handle large dataset replacement', async () => {
      const newRecords = Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        name: `Record ${i}`,
      }));

      const insertFn = jest.fn().mockResolvedValue(undefined);
      mockDatabase.runAsync = jest.fn().mockResolvedValue(undefined);

      mockWithTransactionAsync.mockImplementation(async (callback: any) => {
        return await callback();
      });

      const result = await withReplaceData(
        mockDatabase,
        'test_table',
        undefined,
        newRecords,
        insertFn
      );

      expect(result.success).toBe(true);
      expect(result.recordsAffected).toBe(1000);
      expect(insertFn).toHaveBeenCalledTimes(1000);
    });
  });

  describe('Real-world transaction scenarios', () => {
    it('should handle beer insertion with validation', async () => {
      const beers = [
        { id: 1, brew_name: 'Beer 1' },
        { id: 2, brew_name: 'Beer 2' },
        { id: 3, brew_name: 'Beer 3' },
      ];

      const mockOperation = jest.fn(async (db: any) => {
        let recordsInserted = 0;

        for (const beer of beers) {
          await db.runAsync(
            'INSERT INTO allbeers (id, brew_name) VALUES (?, ?)',
            [beer.id, beer.brew_name]
          );
          recordsInserted++;
        }

        return { success: true, recordsAffected: recordsInserted };
      });

      mockDatabase.runAsync = jest.fn().mockResolvedValue(undefined);

      mockWithTransactionAsync.mockImplementation(async (callback: any) => {
        return await callback();
      });

      const result = await withDatabaseTransaction(mockDatabase, mockOperation);

      expect(result.success).toBe(true);
      expect(result.recordsAffected).toBe(3);
      expect(mockDatabase.runAsync).toHaveBeenCalledTimes(3);
    });

    it('should rollback beer insertion on constraint violation', async () => {
      const beers = [
        { id: 1, brew_name: 'Beer 1' },
        { id: 2, brew_name: 'Beer 2' },
        { id: 1, brew_name: 'Duplicate ID' }, // Duplicate ID should fail
      ];

      const mockOperation = jest.fn(async (db: any) => {
        for (const beer of beers) {
          await db.runAsync(
            'INSERT INTO allbeers (id, brew_name) VALUES (?, ?)',
            [beer.id, beer.brew_name]
          );
        }

        return { success: true, recordsAffected: beers.length };
      });

      // First two inserts succeed, third fails
      mockDatabase.runAsync = jest.fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('UNIQUE constraint failed'));

      mockWithTransactionAsync.mockImplementation(async (callback: any) => {
        try {
          await callback();
        } catch (error) {
          throw error;
        }
      });

      await expect(withDatabaseTransaction(mockDatabase, mockOperation)).rejects.toThrow(
        'UNIQUE constraint failed'
      );

      // All three inserts should have been attempted
      expect(mockDatabase.runAsync).toHaveBeenCalledTimes(3);
    });

    it('should handle multi-table update transaction', async () => {
      const mockOperation = jest.fn(async (db: any) => {
        // Update beers table
        await db.runAsync('UPDATE allbeers SET style = ? WHERE id = ?', ['IPA', 1]);

        // Update tasted_brew table
        await db.runAsync(
          'INSERT INTO tasted_brew_current_round (beer_id, tasted_date) VALUES (?, ?)',
          [1, Date.now()]
        );

        // Update preferences
        await db.runAsync(
          'UPDATE preferences SET value = ? WHERE key = ?',
          [Date.now().toString(), 'last_update']
        );

        return { success: true, recordsAffected: 3 };
      });

      mockDatabase.runAsync = jest.fn().mockResolvedValue(undefined);

      mockWithTransactionAsync.mockImplementation(async (callback: any) => {
        return await callback();
      });

      const result = await withDatabaseTransaction(mockDatabase, mockOperation);

      expect(result.success).toBe(true);
      expect(mockDatabase.runAsync).toHaveBeenCalledTimes(3);
    });

    it('should handle delete old and insert new data transaction', async () => {
      const newBeers = [
        { id: 1, brew_name: 'New Beer 1' },
        { id: 2, brew_name: 'New Beer 2' },
      ];

      const mockOperation = jest.fn(async (db: any) => {
        // Delete old data
        await db.runAsync('DELETE FROM allbeers');

        // Insert new data
        for (const beer of newBeers) {
          await db.runAsync(
            'INSERT INTO allbeers (id, brew_name) VALUES (?, ?)',
            [beer.id, beer.brew_name]
          );
        }

        return { success: true, recordsAffected: newBeers.length };
      });

      mockDatabase.runAsync = jest.fn().mockResolvedValue(undefined);

      mockWithTransactionAsync.mockImplementation(async (callback: any) => {
        return await callback();
      });

      const result = await withDatabaseTransaction(mockDatabase, mockOperation);

      expect(result.success).toBe(true);
      // 1 DELETE + 2 INSERTS = 3 calls
      expect(mockDatabase.runAsync).toHaveBeenCalledTimes(3);
    });

    it('should ensure all-or-nothing behavior for data refresh', async () => {
      const mockOperation = jest.fn(async (db: any) => {
        // Step 1: Clear old data
        await db.runAsync('DELETE FROM allbeers');

        // Step 2: Insert new data (this fails)
        throw new Error('Network error during data fetch');

        // Step 3: Never reached
        await db.runAsync('UPDATE preferences SET value = ?', [Date.now()]);

        return { success: true };
      });

      mockDatabase.runAsync = jest.fn().mockResolvedValue(undefined);

      mockWithTransactionAsync.mockImplementation(async (callback: any) => {
        try {
          await callback();
        } catch (error) {
          // Rollback happens automatically
          throw error;
        }
      });

      await expect(withDatabaseTransaction(mockDatabase, mockOperation)).rejects.toThrow(
        'Network error during data fetch'
      );

      // Only the DELETE should have been attempted
      expect(mockDatabase.runAsync).toHaveBeenCalledTimes(1);
      // And it should have been rolled back automatically
    });
  });
});
