/**
 * Tests for OptimisticUpdateRepository
 * Tests CRUD operations for optimistic UI updates
 */

import { optimisticUpdateRepository } from '../OptimisticUpdateRepository';
import {
  OptimisticUpdate,
  OptimisticUpdateStatus,
  OptimisticUpdateType,
  CheckInRollbackData,
} from '../../../types/optimisticUpdate';
import * as connection from '../../connection';

// Silence expected console.error calls from rowToUpdate validation
const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

jest.mock('../../connection');

type MockDatabase = {
  execAsync: jest.Mock;
  runAsync: jest.Mock;
  getAllAsync: jest.Mock;
  getFirstAsync: jest.Mock;
};

function createMockDatabase(): MockDatabase {
  return {
    execAsync: jest.fn(),
    runAsync: jest.fn(),
    getAllAsync: jest.fn(),
    getFirstAsync: jest.fn(),
  };
}

function createCheckInRollback(): CheckInRollbackData {
  return {
    type: 'CHECK_IN_BEER',
    beer: {
      id: 'beer-1',
      brew_name: 'Test IPA',
      brewer: 'Test Brewery',
    },
    wasInAllBeers: true,
    wasInTastedBeers: false,
  };
}

function createMockUpdate(overrides: Partial<OptimisticUpdate> = {}): OptimisticUpdate {
  const base: OptimisticUpdate = {
    id: 'update-1',
    type: OptimisticUpdateType.CHECK_IN_BEER,
    status: OptimisticUpdateStatus.PENDING,
    timestamp: 1700000000000,
    rollbackData: createCheckInRollback(),
  };
  return { ...base, ...overrides };
}

describe('OptimisticUpdateRepository', () => {
  describe('initialize', () => {
    it('should create the table and indexes', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      mockDatabase.execAsync.mockResolvedValue(undefined);

      await optimisticUpdateRepository.initialize();

      expect(mockDatabase.execAsync).toHaveBeenCalledTimes(3);
      expect(mockDatabase.execAsync).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS optimistic_updates')
      );
      expect(mockDatabase.execAsync).toHaveBeenCalledWith(
        expect.stringContaining('CREATE INDEX IF NOT EXISTS idx_optimistic_updates_status')
      );
      expect(mockDatabase.execAsync).toHaveBeenCalledWith(
        expect.stringContaining('CREATE INDEX IF NOT EXISTS idx_optimistic_updates_operation_id')
      );
    });

    it('should throw when database initialization fails', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      mockDatabase.execAsync.mockRejectedValueOnce(new Error('DB error'));

      await expect(optimisticUpdateRepository.initialize()).rejects.toThrow('DB error');
    });
  });

  describe('add', () => {
    it('should insert an optimistic update into the database', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const update = createMockUpdate();
      mockDatabase.runAsync.mockResolvedValue(undefined);

      await optimisticUpdateRepository.add(update);

      expect(mockDatabase.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO optimistic_updates'),
        expect.arrayContaining(['update-1', 'CHECK_IN_BEER', 'pending', 1700000000000])
      );
    });

    it('should serialize rollbackData as JSON string', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const update = createMockUpdate();
      mockDatabase.runAsync.mockResolvedValue(undefined);

      await optimisticUpdateRepository.add(update);

      const callArgs = mockDatabase.runAsync.mock.calls[0][1] as unknown[];
      const rollbackDataIndex = 4; // 5th param: rollback_data
      expect(typeof callArgs[rollbackDataIndex]).toBe('string');
      expect(() => JSON.parse(callArgs[rollbackDataIndex] as string)).not.toThrow();
    });

    it('should pass null for optional fields when not set', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const update = createMockUpdate({ errorMessage: undefined, operationId: undefined });
      mockDatabase.runAsync.mockResolvedValue(undefined);

      await optimisticUpdateRepository.add(update);

      const callArgs = mockDatabase.runAsync.mock.calls[0][1] as unknown[];
      expect(callArgs[5]).toBeNull(); // error_message
      expect(callArgs[6]).toBeNull(); // operation_id
    });

    it('should include errorMessage and operationId when provided', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const update = createMockUpdate({
        errorMessage: 'Network failed',
        operationId: 'op-abc',
      });
      mockDatabase.runAsync.mockResolvedValue(undefined);

      await optimisticUpdateRepository.add(update);

      const callArgs = mockDatabase.runAsync.mock.calls[0][1] as unknown[];
      expect(callArgs[5]).toBe('Network failed');
      expect(callArgs[6]).toBe('op-abc');
    });

    it('should throw when database insert fails', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const update = createMockUpdate();
      mockDatabase.runAsync.mockRejectedValueOnce(new Error('Insert failed'));

      await expect(optimisticUpdateRepository.add(update)).rejects.toThrow('Insert failed');
    });
  });

  describe('getAll', () => {
    it('should return all updates ordered by timestamp descending', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const rows = [
        {
          id: 'update-2',
          type: 'CHECK_IN_BEER',
          status: 'pending',
          timestamp: 1700000002000,
          rollback_data: JSON.stringify({ type: 'CHECK_IN_BEER', wasInAllBeers: true, wasInTastedBeers: false, beer: { id: 'b2', brew_name: 'Newer Beer' } }),
          error_message: undefined,
          operation_id: undefined,
        },
        {
          id: 'update-1',
          type: 'CHECK_IN_BEER',
          status: 'success',
          timestamp: 1700000001000,
          rollback_data: JSON.stringify({ type: 'CHECK_IN_BEER', wasInAllBeers: true, wasInTastedBeers: false, beer: { id: 'b1', brew_name: 'Older Beer' } }),
          error_message: undefined,
          operation_id: undefined,
        },
      ];
      mockDatabase.getAllAsync.mockResolvedValue(rows);

      const result = await optimisticUpdateRepository.getAll();

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('update-2');
      expect(result[1].id).toBe('update-1');
      expect(mockDatabase.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY timestamp DESC')
      );
    });

    it('should deserialize rollbackData from JSON string', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const rollback = { type: 'CHECK_IN_BEER', wasInAllBeers: true, wasInTastedBeers: false, beer: { id: 'b1', brew_name: 'Test' } };
      mockDatabase.getAllAsync.mockResolvedValue([
        {
          id: 'update-1',
          type: 'CHECK_IN_BEER',
          status: 'pending',
          timestamp: 1700000000000,
          rollback_data: JSON.stringify(rollback),
        },
      ]);

      const result = await optimisticUpdateRepository.getAll();

      expect(result[0].rollbackData).toEqual(rollback);
    });

    it('should return empty array when no updates exist', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      mockDatabase.getAllAsync.mockResolvedValue([]);

      const result = await optimisticUpdateRepository.getAll();

      expect(result).toEqual([]);
    });

    it('should throw when database query fails', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      mockDatabase.getAllAsync.mockRejectedValueOnce(new Error('Query failed'));

      await expect(optimisticUpdateRepository.getAll()).rejects.toThrow('Query failed');
    });
  });

  describe('getById', () => {
    it('should return update when found', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const rollback = { type: 'CHECK_IN_BEER', wasInAllBeers: true, wasInTastedBeers: false, beer: { id: 'b1', brew_name: 'Test' } };
      mockDatabase.getFirstAsync.mockResolvedValue({
        id: 'update-1',
        type: 'CHECK_IN_BEER',
        status: 'pending',
        timestamp: 1700000000000,
        rollback_data: JSON.stringify(rollback),
        error_message: undefined,
        operation_id: undefined,
      });

      const result = await optimisticUpdateRepository.getById('update-1');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('update-1');
      expect(result!.type).toBe(OptimisticUpdateType.CHECK_IN_BEER);
      expect(result!.status).toBe(OptimisticUpdateStatus.PENDING);
    });

    it('should return null when update not found', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      mockDatabase.getFirstAsync.mockResolvedValue(null);

      const result = await optimisticUpdateRepository.getById('nonexistent');

      expect(result).toBeNull();
    });

    it('should query by the given id', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      mockDatabase.getFirstAsync.mockResolvedValue(null);

      await optimisticUpdateRepository.getById('specific-id');

      expect(mockDatabase.getFirstAsync).toHaveBeenCalledWith(
        expect.stringContaining('WHERE id = ?'),
        ['specific-id']
      );
    });

    it('should throw when database query fails', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      mockDatabase.getFirstAsync.mockRejectedValueOnce(new Error('Read failed'));

      await expect(optimisticUpdateRepository.getById('update-1')).rejects.toThrow('Read failed');
    });
  });

  describe('getByStatus', () => {
    it('should return updates matching the given status', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const rollback = { type: 'CHECK_IN_BEER', wasInAllBeers: true, wasInTastedBeers: false, beer: { id: 'b1', brew_name: 'Test' } };
      mockDatabase.getAllAsync.mockResolvedValue([
        {
          id: 'update-1',
          type: 'CHECK_IN_BEER',
          status: 'pending',
          timestamp: 1700000000000,
          rollback_data: JSON.stringify(rollback),
        },
      ]);

      const result = await optimisticUpdateRepository.getByStatus(OptimisticUpdateStatus.PENDING);

      expect(result).toHaveLength(1);
      expect(mockDatabase.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining('WHERE status = ?'),
        [OptimisticUpdateStatus.PENDING]
      );
    });

    it('should return empty array when no updates match status', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      mockDatabase.getAllAsync.mockResolvedValue([]);

      const result = await optimisticUpdateRepository.getByStatus(OptimisticUpdateStatus.SUCCESS);

      expect(result).toEqual([]);
    });

    it('should throw when database query fails', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      mockDatabase.getAllAsync.mockRejectedValueOnce(new Error('Query failed'));

      await expect(optimisticUpdateRepository.getByStatus(OptimisticUpdateStatus.PENDING)).rejects.toThrow(
        'Query failed'
      );
    });
  });

  describe('getPendingUpdates', () => {
    it('should return updates with PENDING or SYNCING status', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const rollback = { type: 'CHECK_IN_BEER', wasInAllBeers: true, wasInTastedBeers: false, beer: { id: 'b1', brew_name: 'Test' } };
      mockDatabase.getAllAsync.mockResolvedValue([
        {
          id: 'update-1',
          type: 'CHECK_IN_BEER',
          status: 'pending',
          timestamp: 1700000001000,
          rollback_data: JSON.stringify(rollback),
        },
        {
          id: 'update-2',
          type: 'CHECK_IN_BEER',
          status: 'syncing',
          timestamp: 1700000002000,
          rollback_data: JSON.stringify(rollback),
        },
      ]);

      const result = await optimisticUpdateRepository.getPendingUpdates();

      expect(result).toHaveLength(2);
      expect(mockDatabase.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining('WHERE status IN'),
        [OptimisticUpdateStatus.PENDING, OptimisticUpdateStatus.SYNCING]
      );
    });

    it('should order results by timestamp ascending (oldest first)', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      mockDatabase.getAllAsync.mockResolvedValue([]);

      await optimisticUpdateRepository.getPendingUpdates();

      expect(mockDatabase.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY timestamp ASC'),
        expect.any(Array)
      );
    });

    it('should return empty array when no pending updates exist', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      mockDatabase.getAllAsync.mockResolvedValue([]);

      const result = await optimisticUpdateRepository.getPendingUpdates();

      expect(result).toEqual([]);
    });

    it('should throw when database query fails', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      mockDatabase.getAllAsync.mockRejectedValueOnce(new Error('Query failed'));

      await expect(optimisticUpdateRepository.getPendingUpdates()).rejects.toThrow('Query failed');
    });
  });

  describe('getByOperationId', () => {
    it('should return update matching the operation ID', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const rollback = { type: 'CHECK_IN_BEER', wasInAllBeers: true, wasInTastedBeers: false, beer: { id: 'b1', brew_name: 'Test' } };
      mockDatabase.getFirstAsync.mockResolvedValue({
        id: 'update-1',
        type: 'CHECK_IN_BEER',
        status: 'syncing',
        timestamp: 1700000000000,
        rollback_data: JSON.stringify(rollback),
        operation_id: 'op-xyz',
      });

      const result = await optimisticUpdateRepository.getByOperationId('op-xyz');

      expect(result).not.toBeNull();
      expect(result!.operationId).toBe('op-xyz');
      expect(mockDatabase.getFirstAsync).toHaveBeenCalledWith(
        expect.stringContaining('WHERE operation_id = ?'),
        ['op-xyz']
      );
    });

    it('should return null when no update has the given operation ID', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      mockDatabase.getFirstAsync.mockResolvedValue(null);

      const result = await optimisticUpdateRepository.getByOperationId('nonexistent-op');

      expect(result).toBeNull();
    });

    it('should throw when database query fails', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      mockDatabase.getFirstAsync.mockRejectedValueOnce(new Error('Query failed'));

      await expect(optimisticUpdateRepository.getByOperationId('op-xyz')).rejects.toThrow('Query failed');
    });
  });

  describe('updateStatus', () => {
    it('should update the status of an update', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      mockDatabase.runAsync.mockResolvedValue(undefined);

      await optimisticUpdateRepository.updateStatus('update-1', OptimisticUpdateStatus.SUCCESS);

      expect(mockDatabase.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('SET status = ?'),
        [OptimisticUpdateStatus.SUCCESS, null, 'update-1']
      );
    });

    it('should store the error message when provided', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      mockDatabase.runAsync.mockResolvedValue(undefined);

      await optimisticUpdateRepository.updateStatus('update-1', OptimisticUpdateStatus.FAILED, 'Server error');

      expect(mockDatabase.runAsync).toHaveBeenCalledWith(
        expect.any(String),
        [OptimisticUpdateStatus.FAILED, 'Server error', 'update-1']
      );
    });

    it('should use null for error message when not provided', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      mockDatabase.runAsync.mockResolvedValue(undefined);

      await optimisticUpdateRepository.updateStatus('update-1', OptimisticUpdateStatus.SUCCESS);

      expect(mockDatabase.runAsync).toHaveBeenCalledWith(expect.any(String), [
        OptimisticUpdateStatus.SUCCESS,
        null,
        'update-1',
      ]);
    });

    it('should throw when database update fails', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      mockDatabase.runAsync.mockRejectedValueOnce(new Error('Update failed'));

      await expect(
        optimisticUpdateRepository.updateStatus('update-1', OptimisticUpdateStatus.SUCCESS)
      ).rejects.toThrow('Update failed');
    });
  });

  describe('linkOperation', () => {
    it('should associate an update with an operation ID', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      mockDatabase.runAsync.mockResolvedValue(undefined);

      await optimisticUpdateRepository.linkOperation('update-1', 'op-abc');

      expect(mockDatabase.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('SET operation_id = ?'),
        ['op-abc', 'update-1']
      );
    });

    it('should throw when database update fails', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      mockDatabase.runAsync.mockRejectedValueOnce(new Error('Update failed'));

      await expect(optimisticUpdateRepository.linkOperation('update-1', 'op-abc')).rejects.toThrow('Update failed');
    });
  });

  describe('delete', () => {
    it('should delete the update with the given id', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      mockDatabase.runAsync.mockResolvedValue(undefined);

      await optimisticUpdateRepository.delete('update-1');

      expect(mockDatabase.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM optimistic_updates WHERE id = ?'),
        ['update-1']
      );
    });

    it('should throw when database delete fails', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      mockDatabase.runAsync.mockRejectedValueOnce(new Error('Delete failed'));

      await expect(optimisticUpdateRepository.delete('update-1')).rejects.toThrow('Delete failed');
    });
  });

  describe('clearAll', () => {
    it('should delete all optimistic updates', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      mockDatabase.runAsync.mockResolvedValue(undefined);

      await optimisticUpdateRepository.clearAll();

      expect(mockDatabase.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM optimistic_updates')
      );
    });

    it('should throw when database operation fails', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      mockDatabase.runAsync.mockRejectedValueOnce(new Error('Clear failed'));

      await expect(optimisticUpdateRepository.clearAll()).rejects.toThrow('Clear failed');
    });
  });

  describe('clearOldCompleted', () => {
    it('should delete SUCCESS and FAILED updates older than the cutoff', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      mockDatabase.runAsync.mockResolvedValue({ changes: 3 });

      await optimisticUpdateRepository.clearOldCompleted(24 * 60 * 60 * 1000);

      expect(mockDatabase.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('WHERE status IN'),
        expect.arrayContaining([
          OptimisticUpdateStatus.SUCCESS,
          OptimisticUpdateStatus.FAILED,
          expect.any(Number),
        ])
      );
    });

    it('should use 24 hours as the default max age', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      mockDatabase.runAsync.mockResolvedValue({ changes: 0 });
      const before = Date.now();

      await optimisticUpdateRepository.clearOldCompleted();

      const after = Date.now();
      const callArgs = mockDatabase.runAsync.mock.calls[0][1] as number[];
      const cutoffTimestamp = callArgs[2];
      const expectedMin = before - 24 * 60 * 60 * 1000;
      const expectedMax = after - 24 * 60 * 60 * 1000;

      expect(cutoffTimestamp).toBeGreaterThanOrEqual(expectedMin);
      expect(cutoffTimestamp).toBeLessThanOrEqual(expectedMax);
    });

    it('should throw when database operation fails', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      mockDatabase.runAsync.mockRejectedValueOnce(new Error('Delete failed'));

      await expect(optimisticUpdateRepository.clearOldCompleted()).rejects.toThrow('Delete failed');
    });
  });

  describe('rowToUpdate - corrupted rollback_data handling', () => {
    it('filters out rows with invalid rollback_data JSON from getAll', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      mockDatabase.getAllAsync.mockResolvedValue([
        {
          id: 'update-valid',
          type: 'CHECK_IN_BEER',
          status: 'pending',
          timestamp: 1700000000000,
          rollback_data: JSON.stringify({ type: 'CHECK_IN_BEER', wasInAllBeers: true, wasInTastedBeers: false, beer: { id: 'b1', brew_name: 'Valid Beer' } }),
        },
        {
          id: 'update-corrupt',
          type: 'CHECK_IN_BEER',
          status: 'pending',
          timestamp: 1700000001000,
          rollback_data: 'not-valid-json{{{',
        },
      ]);

      const result = await optimisticUpdateRepository.getAll();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('update-valid');
    });

    it('filters out rows where rollback_data parses but fails type guard from getAll', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      mockDatabase.getAllAsync.mockResolvedValue([
        {
          id: 'update-valid',
          type: 'CHECK_IN_BEER',
          status: 'pending',
          timestamp: 1700000000000,
          rollback_data: JSON.stringify({ type: 'CHECK_IN_BEER', wasInAllBeers: true, wasInTastedBeers: false, beer: { id: 'b1', brew_name: 'Valid Beer' } }),
        },
        {
          id: 'update-bad-shape',
          type: 'CHECK_IN_BEER',
          status: 'pending',
          timestamp: 1700000001000,
          rollback_data: JSON.stringify({ type: 'UNKNOWN_TYPE', someField: 'value' }),
        },
      ]);

      const result = await optimisticUpdateRepository.getAll();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('update-valid');
    });

    it('filters out rows with invalid rollback_data from getByStatus', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      mockDatabase.getAllAsync.mockResolvedValue([
        {
          id: 'update-valid',
          type: 'CHECK_IN_BEER',
          status: 'pending',
          timestamp: 1700000000000,
          rollback_data: JSON.stringify({ type: 'CHECK_IN_BEER', wasInAllBeers: true, wasInTastedBeers: false, beer: { id: 'b1', brew_name: 'Valid Beer' } }),
        },
        {
          id: 'update-corrupt',
          type: 'CHECK_IN_BEER',
          status: 'pending',
          timestamp: 1700000001000,
          rollback_data: 'corrupt-json',
        },
      ]);

      const result = await optimisticUpdateRepository.getByStatus(OptimisticUpdateStatus.PENDING);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('update-valid');
    });

    it('filters out rows with invalid rollback_data from getPendingUpdates', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      mockDatabase.getAllAsync.mockResolvedValue([
        {
          id: 'update-valid',
          type: 'CHECK_IN_BEER',
          status: 'pending',
          timestamp: 1700000000000,
          rollback_data: JSON.stringify({ type: 'CHECK_IN_BEER', wasInAllBeers: true, wasInTastedBeers: false, beer: { id: 'b1', brew_name: 'Valid Beer' } }),
        },
        {
          id: 'update-corrupt',
          type: 'CHECK_IN_BEER',
          status: 'pending',
          timestamp: 1700000001000,
          rollback_data: 'corrupt-json',
        },
      ]);

      const result = await optimisticUpdateRepository.getPendingUpdates();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('update-valid');
    });
  });

  describe('countByStatus', () => {
    it('should return the count of updates with the given status', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      mockDatabase.getFirstAsync.mockResolvedValue({ count: 5 });

      const result = await optimisticUpdateRepository.countByStatus(OptimisticUpdateStatus.PENDING);

      expect(result).toBe(5);
      expect(mockDatabase.getFirstAsync).toHaveBeenCalledWith(
        expect.stringContaining('SELECT COUNT(*) as count'),
        [OptimisticUpdateStatus.PENDING]
      );
    });

    it('should return 0 when no updates have the given status', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      mockDatabase.getFirstAsync.mockResolvedValue({ count: 0 });

      const result = await optimisticUpdateRepository.countByStatus(OptimisticUpdateStatus.FAILED);

      expect(result).toBe(0);
    });

    it('should return 0 when the query returns null', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      mockDatabase.getFirstAsync.mockResolvedValue(null);

      const result = await optimisticUpdateRepository.countByStatus(OptimisticUpdateStatus.PENDING);

      expect(result).toBe(0);
    });

    it('should throw when database query fails', async () => {
      const mockDatabase = createMockDatabase();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      mockDatabase.getFirstAsync.mockRejectedValueOnce(new Error('Query failed'));

      await expect(optimisticUpdateRepository.countByStatus(OptimisticUpdateStatus.PENDING)).rejects.toThrow(
        'Query failed'
      );
    });
  });
});
