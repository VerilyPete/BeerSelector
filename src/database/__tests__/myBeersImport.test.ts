/**
 * Tests for myBeers import idempotency and concurrency
 * HP-2 Step 3a: Verify that fetchAndPopulateMyBeers is idempotent and handles concurrent calls safely
 */

import { fetchAndPopulateMyBeers } from '../db';
import { databaseLockManager } from '../locks';
import { myBeersRepository } from '../repositories/MyBeersRepository';
import { getPreference, setPreference } from '../preferences';
import { fetchMyBeersFromAPI } from '../../api/beerApi';
import { Beerfinder } from '../../types/beer';

// Mock all dependencies
jest.mock('../locks');
jest.mock('../repositories/MyBeersRepository');
jest.mock('../preferences');
jest.mock('../../api/beerApi');

describe('MyBeers Import - Idempotency and Concurrency', () => {
  let mockAcquireLock: jest.Mock;
  let mockReleaseLock: jest.Mock;
  let mockInsertManyUnsafe: jest.Mock;
  let mockFetchMyBeersFromAPI: jest.Mock;
  let mockGetPreference: jest.Mock;
  let mockSetPreference: jest.Mock;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Setup lock manager mocks
    mockAcquireLock = jest.fn().mockResolvedValue(true);
    mockReleaseLock = jest.fn();
    (databaseLockManager.acquireLock as jest.Mock) = mockAcquireLock;
    (databaseLockManager.releaseLock as jest.Mock) = mockReleaseLock;

    // Setup repository mocks
    mockInsertManyUnsafe = jest.fn().mockResolvedValue(undefined);
    (myBeersRepository.insertManyUnsafe as jest.Mock) = mockInsertManyUnsafe;

    // Setup API mock
    mockFetchMyBeersFromAPI = fetchMyBeersFromAPI as jest.Mock;
    mockFetchMyBeersFromAPI.mockResolvedValue([
      {
        id: '1',
        brew_name: 'Test Beer 1',
        brewer: 'Test Brewery',
        roh_lap: '1'
      },
      {
        id: '2',
        brew_name: 'Test Beer 2',
        brewer: 'Test Brewery',
        roh_lap: '2'
      }
    ] as Beerfinder[]);

    // Setup preferences mock
    mockGetPreference = getPreference as jest.Mock;
    mockSetPreference = setPreference as jest.Mock;
    mockGetPreference.mockResolvedValue('false'); // Not in visitor mode by default
    mockSetPreference.mockResolvedValue(undefined);
  });

  describe('Idempotency', () => {
    it('should handle multiple sequential calls safely', async () => {
      // Call fetchAndPopulateMyBeers multiple times sequentially
      await fetchAndPopulateMyBeers();
      await fetchAndPopulateMyBeers();
      await fetchAndPopulateMyBeers();

      // Each call should complete fully (acquire lock, fetch, insert, release)
      // This is idempotent because insertMany clears the table first
      expect(mockFetchMyBeersFromAPI).toHaveBeenCalledTimes(3);
      expect(mockInsertManyUnsafe).toHaveBeenCalledTimes(3);
      expect(mockAcquireLock).toHaveBeenCalledTimes(3);
      expect(mockReleaseLock).toHaveBeenCalledTimes(3);
    });

    it('should be safe to call multiple times (idempotent data clearing)', async () => {
      const mockBeers: Beerfinder[] = [
        { id: '1', brew_name: 'Beer 1', brewer: 'Brewery 1', roh_lap: '1' }
      ];
      mockFetchMyBeersFromAPI.mockResolvedValue(mockBeers);

      // Call multiple times - each should clear and re-insert (idempotent)
      await fetchAndPopulateMyBeers();
      await fetchAndPopulateMyBeers();

      // Should have inserted the same data twice (no duplication because table is cleared first)
      expect(mockInsertManyUnsafe).toHaveBeenCalledTimes(2);
      expect(mockInsertManyUnsafe).toHaveBeenCalledWith(mockBeers);
    });

    it('should queue concurrent calls via lock manager', async () => {
      // Make the API call resolve normally (no artificial delay needed)
      mockFetchMyBeersFromAPI.mockResolvedValue([]);

      // Start multiple concurrent calls - lock manager will queue them
      const promise1 = fetchAndPopulateMyBeers();
      const promise2 = fetchAndPopulateMyBeers();
      const promise3 = fetchAndPopulateMyBeers();

      // Wait for all to complete
      await Promise.all([promise1, promise2, promise3]);

      // All three calls should complete sequentially via lock manager queue
      expect(mockFetchMyBeersFromAPI).toHaveBeenCalledTimes(3);
      expect(mockInsertManyUnsafe).toHaveBeenCalledTimes(3);
      expect(mockAcquireLock).toHaveBeenCalledTimes(3);
      expect(mockReleaseLock).toHaveBeenCalledTimes(3);

      // Verify each call used the lock manager
      for (let i = 0; i < 3; i++) {
        expect(mockAcquireLock).toHaveBeenNthCalledWith(i + 1, 'fetchAndPopulateMyBeers');
        expect(mockReleaseLock).toHaveBeenNthCalledWith(i + 1, 'fetchAndPopulateMyBeers');
      }
    });
  });

  describe('Concurrent Access Safety', () => {
    it('should acquire lock before importing', async () => {
      await fetchAndPopulateMyBeers();

      expect(mockAcquireLock).toHaveBeenCalledWith('fetchAndPopulateMyBeers');
      // Verify lock was acquired before API call
      const lockCallOrder = mockAcquireLock.mock.invocationCallOrder[0];
      const apiCallOrder = mockFetchMyBeersFromAPI.mock.invocationCallOrder[0];
      expect(lockCallOrder).toBeLessThan(apiCallOrder);
    });

    it('should release lock even if API call fails', async () => {
      mockFetchMyBeersFromAPI.mockRejectedValueOnce(new Error('API error'));

      await expect(fetchAndPopulateMyBeers()).rejects.toThrow('API error');

      // Lock should still be released
      expect(mockReleaseLock).toHaveBeenCalledWith('fetchAndPopulateMyBeers');
    });

    it('should release lock even if database insert fails', async () => {
      mockInsertManyUnsafe.mockRejectedValueOnce(new Error('Database error'));

      await expect(fetchAndPopulateMyBeers()).rejects.toThrow('Database error');

      // Lock should still be released
      expect(mockReleaseLock).toHaveBeenCalledWith('fetchAndPopulateMyBeers');
    });

    it('should throw error if lock acquisition fails', async () => {
      mockAcquireLock.mockResolvedValueOnce(false);

      await expect(fetchAndPopulateMyBeers()).rejects.toThrow(
        'Failed to acquire database lock'
      );

      // Should not proceed to API call or database operations
      expect(mockFetchMyBeersFromAPI).not.toHaveBeenCalled();
      expect(mockInsertManyUnsafe).not.toHaveBeenCalled();
    });

    it('should handle concurrent calls by queueing', async () => {
      // Make calls resolve quickly to avoid timeout
      mockFetchMyBeersFromAPI.mockResolvedValue([]);

      // Start multiple concurrent calls
      const promise1 = fetchAndPopulateMyBeers();
      const promise2 = fetchAndPopulateMyBeers();
      const promise3 = fetchAndPopulateMyBeers();

      await Promise.all([promise1, promise2, promise3]);

      // All calls should complete via lock manager queue (FIFO)
      expect(mockFetchMyBeersFromAPI).toHaveBeenCalledTimes(3);
      expect(mockInsertManyUnsafe).toHaveBeenCalledTimes(3);
      expect(mockAcquireLock).toHaveBeenCalledTimes(3);
      expect(mockReleaseLock).toHaveBeenCalledTimes(3);
    });
  });

  describe('Visitor Mode Handling', () => {
    it('should skip import in visitor mode without acquiring lock', async () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      mockGetPreference.mockResolvedValueOnce('true'); // visitor mode

      await fetchAndPopulateMyBeers();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('In visitor mode - skipping fetchAndPopulateMyBeers')
      );

      // Should not acquire lock or call API
      expect(mockAcquireLock).not.toHaveBeenCalled();
      expect(mockFetchMyBeersFromAPI).not.toHaveBeenCalled();
      expect(mockInsertManyUnsafe).not.toHaveBeenCalled();

      consoleLogSpy.mockRestore();
    });

    it('should consistently skip in visitor mode on multiple calls', async () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      // All calls should be in visitor mode
      mockGetPreference.mockResolvedValue('true');

      // Call multiple times
      await fetchAndPopulateMyBeers();
      await fetchAndPopulateMyBeers();
      await fetchAndPopulateMyBeers();

      // Should log visitor mode skip message for each call
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('In visitor mode - skipping fetchAndPopulateMyBeers')
      );
      expect(consoleLogSpy).toHaveBeenCalledTimes(3);

      // Should never acquire lock or call API
      expect(mockAcquireLock).not.toHaveBeenCalled();
      expect(mockFetchMyBeersFromAPI).not.toHaveBeenCalled();

      consoleLogSpy.mockRestore();
    });
  });

  describe('Data Integrity', () => {
    it('should insert fetched beers using unsafe method', async () => {
      const mockBeers: Beerfinder[] = [
        {
          id: '1',
          brew_name: 'Beer 1',
          brewer: 'Brewery 1',
          roh_lap: '1'
        },
        {
          id: '2',
          brew_name: 'Beer 2',
          brewer: 'Brewery 2',
          roh_lap: '2'
        }
      ];

      mockFetchMyBeersFromAPI.mockResolvedValueOnce(mockBeers);

      await fetchAndPopulateMyBeers();

      // Should insert the exact beers fetched from API
      expect(mockInsertManyUnsafe).toHaveBeenCalledWith(mockBeers);
    });

    it('should handle empty beer list', async () => {
      mockFetchMyBeersFromAPI.mockResolvedValueOnce([]);

      await fetchAndPopulateMyBeers();

      // Should still call insert with empty array
      expect(mockInsertManyUnsafe).toHaveBeenCalledWith([]);
    });

    it('should successfully complete import operation', async () => {
      await fetchAndPopulateMyBeers();

      // Verify the operation completed successfully
      expect(mockFetchMyBeersFromAPI).toHaveBeenCalled();
      expect(mockInsertManyUnsafe).toHaveBeenCalled();
      expect(mockReleaseLock).toHaveBeenCalledWith('fetchAndPopulateMyBeers');
    });

    it('should allow retry after failed insert', async () => {
      mockInsertManyUnsafe.mockRejectedValueOnce(new Error('Database error'));

      // First call should fail
      await expect(fetchAndPopulateMyBeers()).rejects.toThrow('Database error');

      // Reset the mock to succeed
      mockInsertManyUnsafe.mockResolvedValueOnce(undefined);

      // Second call should retry successfully (function is idempotent)
      await fetchAndPopulateMyBeers();

      // Should have called insert twice (once failed, once succeeded)
      expect(mockInsertManyUnsafe).toHaveBeenCalledTimes(2);
      expect(mockFetchMyBeersFromAPI).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error Recovery', () => {
    it('should allow retry after network error', async () => {
      mockFetchMyBeersFromAPI.mockRejectedValueOnce(new Error('Network error'));

      // First call should fail
      await expect(fetchAndPopulateMyBeers()).rejects.toThrow('Network error');

      // Reset mocks
      mockFetchMyBeersFromAPI.mockResolvedValueOnce([]);

      // Should be able to retry after error (idempotent)
      await fetchAndPopulateMyBeers();

      expect(mockFetchMyBeersFromAPI).toHaveBeenCalledTimes(2);
      expect(mockReleaseLock).toHaveBeenCalledTimes(2); // Both calls released lock
    });

    it('should handle lock acquisition failure gracefully', async () => {
      mockAcquireLock.mockResolvedValueOnce(false);

      await expect(fetchAndPopulateMyBeers()).rejects.toThrow(
        'Failed to acquire database lock'
      );

      // Should not leave system in bad state
      expect(mockReleaseLock).not.toHaveBeenCalled();
      expect(mockFetchMyBeersFromAPI).not.toHaveBeenCalled();
    });

    it('should release lock in finally block on any error', async () => {
      mockFetchMyBeersFromAPI.mockRejectedValueOnce(new Error('Unexpected error'));

      await expect(fetchAndPopulateMyBeers()).rejects.toThrow('Unexpected error');

      // Lock must be released even on error
      expect(mockReleaseLock).toHaveBeenCalledWith('fetchAndPopulateMyBeers');
    });
  });
});
