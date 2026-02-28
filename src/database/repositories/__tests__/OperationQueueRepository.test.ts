/**
 * OperationQueueRepository Unit Tests
 *
 * Tests the SQLite persistence layer for queued operations.
 */

import { operationQueueRepository } from '../OperationQueueRepository';
import {
  QueuedOperation,
  OperationType,
  OperationStatus,
  CheckInBeerPayload,
} from '../../../types/operationQueue';

// Create mock database
const mockDb = {
  runAsync: jest.fn(),
  getAllAsync: jest.fn(),
  getFirstAsync: jest.fn(),
};

// Mock the database connection
jest.mock('../../connection', () => ({
  getDatabase: jest.fn(() => Promise.resolve(mockDb)),
}));

describe('OperationQueueRepository', () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
  });

  describe('addOperation', () => {
    it('should add operation to database', async () => {
      const operation: QueuedOperation = {
        id: 'test-op-1',
        type: OperationType.CHECK_IN_BEER,
        payload: {
          beerId: 'beer-123',
          beerName: 'Test Beer',
          storeId: 'store-456',
          storeName: 'Test Store',
          memberId: 'member-789',
        } as CheckInBeerPayload,
        timestamp: Date.now(),
        retryCount: 0,
        status: OperationStatus.PENDING,
      };

      await operationQueueRepository.addOperation(operation);

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO operation_queue'),
        expect.arrayContaining([
          operation.id,
          operation.type,
          expect.any(String), // JSON payload
          operation.timestamp,
          operation.retryCount,
          operation.status,
          null, // error_message
          null, // last_retry_timestamp
        ])
      );
    });

    it('should serialize payload as JSON', async () => {
      const payload: CheckInBeerPayload = {
        beerId: 'beer-123',
        beerName: 'Test Beer',
        storeId: 'store-456',
        storeName: 'Test Store',
        memberId: 'member-789',
      };

      const operation: QueuedOperation = {
        id: 'test-op-2',
        type: OperationType.CHECK_IN_BEER,
        payload,
        timestamp: Date.now(),
        retryCount: 0,
        status: OperationStatus.PENDING,
      };

      await operationQueueRepository.addOperation(operation);

      const callArgs = mockDb.runAsync.mock.calls[0][1];
      const payloadJson = callArgs[2];

      expect(typeof payloadJson).toBe('string');
      expect(JSON.parse(payloadJson)).toEqual(payload);
    });
  });

  describe('rowToOperation - corrupted payload handling', () => {
    it('filters out rows with non-JSON payload from getPendingOperations', async () => {
      const mockRows = [
        {
          id: 'op-valid',
          type: OperationType.CHECK_IN_BEER,
          payload: JSON.stringify({
            beerId: 'beer-1',
            beerName: 'Beer 1',
            storeId: 'store-1',
            storeName: 'Store 1',
            memberId: 'member-1',
          }),
          timestamp: Date.now(),
          retry_count: 0,
          status: OperationStatus.PENDING,
          error_message: null,
          last_retry_timestamp: null,
        },
        {
          id: 'op-corrupt',
          type: OperationType.CHECK_IN_BEER,
          payload: 'not-valid-json{{{',
          timestamp: Date.now(),
          retry_count: 0,
          status: OperationStatus.PENDING,
          error_message: null,
          last_retry_timestamp: null,
        },
      ];

      mockDb.getAllAsync.mockResolvedValue(mockRows);

      const operations = await operationQueueRepository.getPendingOperations();

      expect(operations).toHaveLength(1);
      expect(operations[0].id).toBe('op-valid');
    });

    it('filters out rows with non-object payload (e.g. a JSON number) from getAllOperations', async () => {
      const mockRows = [
        {
          id: 'op-valid',
          type: OperationType.CHECK_IN_BEER,
          payload: JSON.stringify({
            beerId: 'beer-1',
            beerName: 'Beer 1',
            storeId: 'store-1',
            storeName: 'Store 1',
            memberId: 'member-1',
          }),
          timestamp: Date.now(),
          retry_count: 0,
          status: OperationStatus.PENDING,
          error_message: null,
          last_retry_timestamp: null,
        },
        {
          id: 'op-scalar',
          type: OperationType.CHECK_IN_BEER,
          payload: JSON.stringify(42), // valid JSON, but not an object
          timestamp: Date.now(),
          retry_count: 0,
          status: OperationStatus.PENDING,
          error_message: null,
          last_retry_timestamp: null,
        },
      ];

      mockDb.getAllAsync.mockResolvedValue(mockRows);

      const operations = await operationQueueRepository.getAllOperations();

      expect(operations).toHaveLength(1);
      expect(operations[0].id).toBe('op-valid');
    });
  });

  describe('getPendingOperations', () => {
    it('should retrieve only pending operations', async () => {
      const mockRows = [
        {
          id: 'op-1',
          type: OperationType.CHECK_IN_BEER,
          payload: JSON.stringify({
            beerId: 'beer-1',
            beerName: 'Beer 1',
            storeId: 'store-1',
            storeName: 'Store 1',
            memberId: 'member-1',
          }),
          timestamp: Date.now(),
          retry_count: 0,
          status: OperationStatus.PENDING,
          error_message: null,
          last_retry_timestamp: null,
        },
      ];

      mockDb.getAllAsync.mockResolvedValue(mockRows);

      const operations = await operationQueueRepository.getPendingOperations();

      expect(mockDb.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining('WHERE status = ?'),
        [OperationStatus.PENDING]
      );
      expect(operations).toHaveLength(1);
      expect(operations[0].id).toBe('op-1');
      expect(operations[0].status).toBe(OperationStatus.PENDING);
    });

    it('should return empty array if no pending operations', async () => {
      mockDb.getAllAsync.mockResolvedValue([]);

      const operations = await operationQueueRepository.getPendingOperations();

      expect(operations).toEqual([]);
    });

    it('should parse JSON payload correctly', async () => {
      const payload: CheckInBeerPayload = {
        beerId: 'beer-1',
        beerName: 'Test Beer',
        storeId: 'store-1',
        storeName: 'Test Store',
        memberId: 'member-1',
      };

      const mockRows = [
        {
          id: 'op-1',
          type: OperationType.CHECK_IN_BEER,
          payload: JSON.stringify(payload),
          timestamp: Date.now(),
          retry_count: 0,
          status: OperationStatus.PENDING,
          error_message: null,
          last_retry_timestamp: null,
        },
      ];

      mockDb.getAllAsync.mockResolvedValue(mockRows);

      const operations = await operationQueueRepository.getPendingOperations();

      expect(operations[0].payload).toEqual(payload);
    });
  });

  describe('updateStatus', () => {
    it('should update operation status', async () => {
      await operationQueueRepository.updateStatus(
        'op-1',
        OperationStatus.SUCCESS
      );

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE operation_queue SET status = ?'),
        [OperationStatus.SUCCESS, null, 'op-1']
      );
    });

    it('should update status with error message', async () => {
      const errorMessage = 'Network error';

      await operationQueueRepository.updateStatus(
        'op-1',
        OperationStatus.FAILED,
        errorMessage
      );

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE operation_queue SET status = ?'),
        [OperationStatus.FAILED, errorMessage, 'op-1']
      );
    });
  });

  describe('incrementRetryCount', () => {
    it('should increment retry count and update timestamp', async () => {
      await operationQueueRepository.incrementRetryCount('op-1');

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('retry_count = retry_count + 1'),
        expect.arrayContaining([
          expect.any(Number), // timestamp
          null, // error_message
          OperationStatus.PENDING,
          'op-1',
        ])
      );
    });

    it('should increment retry count with error message', async () => {
      const errorMessage = 'Retry failed';

      await operationQueueRepository.incrementRetryCount('op-1', errorMessage);

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('retry_count = retry_count + 1'),
        expect.arrayContaining([
          expect.any(Number),
          errorMessage,
          OperationStatus.PENDING,
          'op-1',
        ])
      );
    });
  });

  describe('deleteOperation', () => {
    it('should delete operation by ID', async () => {
      await operationQueueRepository.deleteOperation('op-1');

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM operation_queue WHERE id = ?'),
        ['op-1']
      );
    });
  });

  describe('clearAll', () => {
    it('should delete all operations', async () => {
      await operationQueueRepository.clearAll();

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        'DELETE FROM operation_queue'
      );
    });
  });

  describe('getCountByStatus', () => {
    it('should return count of operations with given status', async () => {
      mockDb.getFirstAsync.mockResolvedValue({ count: 5 });

      const count = await operationQueueRepository.getCountByStatus(
        OperationStatus.PENDING
      );

      expect(count).toBe(5);
      expect(mockDb.getFirstAsync).toHaveBeenCalledWith(
        expect.stringContaining('COUNT(*) as count'),
        [OperationStatus.PENDING]
      );
    });

    it('should return 0 if no operations found', async () => {
      mockDb.getFirstAsync.mockResolvedValue({ count: 0 });

      const count = await operationQueueRepository.getCountByStatus(
        OperationStatus.SUCCESS
      );

      expect(count).toBe(0);
    });

    it('should return 0 on error', async () => {
      mockDb.getFirstAsync.mockRejectedValue(new Error('Database error'));

      const count = await operationQueueRepository.getCountByStatus(
        OperationStatus.PENDING
      );

      expect(count).toBe(0);
    });
  });

  describe('getTotalCount', () => {
    it('should return total count of all operations', async () => {
      mockDb.getFirstAsync.mockResolvedValue({ count: 10 });

      const count = await operationQueueRepository.getTotalCount();

      expect(count).toBe(10);
      expect(mockDb.getFirstAsync).toHaveBeenCalledWith(
        expect.stringContaining('COUNT(*) as count FROM operation_queue')
      );
    });

    it('should return 0 if no operations', async () => {
      mockDb.getFirstAsync.mockResolvedValue({ count: 0 });

      const count = await operationQueueRepository.getTotalCount();

      expect(count).toBe(0);
    });
  });

  describe('getOperationById', () => {
    it('should retrieve single operation by ID', async () => {
      const mockRow = {
        id: 'op-1',
        type: OperationType.CHECK_IN_BEER,
        payload: JSON.stringify({
          beerId: 'beer-1',
          beerName: 'Test Beer',
          storeId: 'store-1',
          storeName: 'Test Store',
          memberId: 'member-1',
        }),
        timestamp: Date.now(),
        retry_count: 2,
        status: OperationStatus.PENDING,
        error_message: 'Network timeout',
        last_retry_timestamp: Date.now(),
      };

      mockDb.getFirstAsync.mockResolvedValue(mockRow);

      const operation = await operationQueueRepository.getOperationById('op-1');

      expect(operation).toBeTruthy();
      expect(operation?.id).toBe('op-1');
      expect(operation?.retryCount).toBe(2);
      expect(operation?.errorMessage).toBe('Network timeout');
    });

    it('should return null if operation not found', async () => {
      mockDb.getFirstAsync.mockResolvedValue(null);

      const operation = await operationQueueRepository.getOperationById('nonexistent');

      expect(operation).toBeNull();
    });
  });

  describe('deleteSuccessfulOperations', () => {
    it('should delete all successful operations', async () => {
      await operationQueueRepository.deleteSuccessfulOperations();

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM operation_queue WHERE status = ?'),
        [OperationStatus.SUCCESS]
      );
    });
  });
});
