/**
 * How concurrent refreshes are kept from colliding.
 *
 * Rewritten by plan 05 Phase 5.4. The original file's premise was the defect:
 * it asserted that the master lock was held for the whole refresh sequence and
 * that three concurrent refreshes should perform three full sets of fetches,
 * queued behind one another. Both are now wrong on purpose.
 *
 * - The lock covers the write burst only. Holding it across the fetches is what
 *   let one stalled request outlive the 15s hold timeout and wedge every later
 *   writer. Ordering of fetch versus lock is asserted in
 *   `sequentialRefreshAllData.locking.test.ts`, which owns that property.
 * - Concurrent refreshes de-duplicate rather than queue. Three queued refreshes
 *   meant three full taplist downloads on a link too weak for one; the second
 *   and third callers now receive the first one's promise.
 *
 * **Two of the original tests were deleted rather than rewritten.** One asserted
 * that a run with every dependency mocked finishes in under a second, which no
 * defect this codebase can produce would fail. The other built three local
 * closures that called `withDatabaseLock` directly and then asserted the spy had
 * recorded three calls — a mock asserting a mock, with no production code in the
 * path at all.
 *
 * **The mocks here were a dead contract.** They resolved the three fetchers to
 * plain arrays, which `beerApi` stopped returning in 02 Phase 3. Every test in
 * this file that read as a success-path test was in fact driving all three
 * sources down the failure path and asserting only call counts and ordering,
 * which happen to look identical either way. They now use the shared
 * `fetchOutcomeFixtures` builders.
 */

import { databaseLockManager } from '../../database/DatabaseLockManager';

import {
  sequentialRefreshAllData,
  manualRefreshAllData,
  refreshAllDataFromAPI,
  resetLastManualRefreshTime,
  resetInFlightSequentialRefresh,
} from '../dataUpdateService';
import { getPreference, setPreference, areApiUrlsConfigured } from '../../database/preferences';
import { fetchBeersFromAPI, fetchMyBeersFromAPI, fetchRewardsFromAPI } from '../../api/beerApi';
import { beerRepository } from '../../database/repositories/BeerRepository';
import { fetchedRows } from '../../api/__tests__/helpers/fetchOutcomeFixtures';

jest.mock('../../database/db', () => ({
  getPreference: jest.fn(),
  setPreference: jest.fn(),
}));

jest.mock('../../database/preferences', () => ({
  getPreference: jest.fn(),
  setPreference: jest.fn(),
  areApiUrlsConfigured: jest.fn(),
}));

jest.mock('../../api/beerApi', () => ({
  fetchBeersFromAPI: jest.fn(),
  fetchMyBeersFromAPI: jest.fn(),
  fetchRewardsFromAPI: jest.fn(),
}));

jest.mock('../../database/repositories/BeerRepository', () => ({
  beerRepository: {
    insertMany: jest.fn(),
    insertManyUnsafe: jest.fn(),
  },
}));

jest.mock('../../database/repositories/MyBeersRepository', () => ({
  myBeersRepository: {
    insertMany: jest.fn(),
    insertManyUnsafe: jest.fn(),
    replaceAllWithEmptyUnsafe: jest.fn(),
  },
}));

jest.mock('../../database/repositories/RewardsRepository', () => ({
  rewardsRepository: {
    replaceAllWithEmpty: jest.fn(async () => {}),
    replaceAllWithEmptyUnsafe: jest.fn(async () => {}),
    insertMany: jest.fn(),
    insertManyUnsafe: jest.fn(),
  },
}));

const ALL_BEERS = [{ id: '1', brew_name: 'Test Beer', brewer: 'Test Brewery' }];
const MY_BEERS = [
  { id: '2', brew_name: 'Tasted Beer', brewer: 'Test Brewery', tasted_date: '2026-01-01' },
];
const REWARDS = [{ reward_id: '3', reward_type: 'badge' }];

/** Log the call, then answer with the real `FetchedSource` shape. */
const logsAndResolves = (mock: jest.Mock, label: string, rows: readonly unknown[], log: string[]) =>
  mock.mockImplementation(async () => {
    log.push(`${label}-start`);
    await Promise.resolve();
    log.push(`${label}-end`);
    return fetchedRows(rows);
  });

describe('Sequential Refresh Coordination', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    databaseLockManager.resetForTesting();
    resetInFlightSequentialRefresh();
    resetLastManualRefreshTime();

    (getPreference as jest.Mock).mockImplementation(async (key: string) => {
      if (key === 'all_beers_api_url') return 'http://api.example.com/all';
      if (key === 'my_beers_api_url') return 'http://api.example.com/my';
      return null;
    });
    (setPreference as jest.Mock).mockResolvedValue(undefined);
    (areApiUrlsConfigured as jest.Mock).mockResolvedValue(true);
    (fetchBeersFromAPI as jest.Mock).mockResolvedValue(fetchedRows(ALL_BEERS));
    (fetchMyBeersFromAPI as jest.Mock).mockResolvedValue(fetchedRows(MY_BEERS));
    (fetchRewardsFromAPI as jest.Mock).mockResolvedValue(fetchedRows(REWARDS));
  });

  afterEach(() => {
    // In an `afterEach`, not at the end of each test body. A spy on
    // `withDatabaseLock` that a failing test leaves installed is picked up by
    // the NEXT test as its `originalWithLock`, which then wraps itself and dies
    // with "Maximum call stack size exceeded" — reporting the second test as
    // broken when the first one is. That is exactly how this file behaved
    // before the rewrite.
    jest.restoreAllMocks();
    databaseLockManager.resetForTesting();
  });

  describe('sequentialRefreshAllData', () => {
    it('fetches each source in turn rather than all at once', async () => {
      const executionLog: string[] = [];
      logsAndResolves(fetchBeersFromAPI as jest.Mock, 'allBeers', ALL_BEERS, executionLog);
      logsAndResolves(fetchMyBeersFromAPI as jest.Mock, 'myBeers', MY_BEERS, executionLog);
      logsAndResolves(fetchRewardsFromAPI as jest.Mock, 'rewards', REWARDS, executionLog);

      await sequentialRefreshAllData();

      // Still sequential after the lock split, and deliberately so. Firing all
      // three at once would triple the peak demand on the connection this plan
      // exists to cope with, and the reason for sequencing them was never the
      // lock.
      expect(executionLog).toEqual([
        'allBeers-start',
        'allBeers-end',
        'myBeers-start',
        'myBeers-end',
        'rewards-start',
        'rewards-end',
      ]);
    });

    it('takes the database lock exactly once', async () => {
      const lockAcquisitions: string[] = [];
      const originalWithLock = databaseLockManager.withDatabaseLock.bind(databaseLockManager);
      jest
        .spyOn(databaseLockManager, 'withDatabaseLock')
        .mockImplementation(async (operation: string, task: () => Promise<unknown>) => {
          lockAcquisitions.push(operation);
          return originalWithLock(operation, task);
        });

      await sequentialRefreshAllData();

      // One acquisition, not one per source: the repositories are called
      // through their `…Unsafe` variants precisely so they do not each take a
      // nested lock of their own.
      expect(lockAcquisitions).toEqual(['refresh-all-data-write']);
    });

    it('serves one set of fetches to concurrent callers instead of repeating them', async () => {
      const results = await Promise.all([
        sequentialRefreshAllData(),
        sequentialRefreshAllData(),
        sequentialRefreshAllData(),
      ]);

      // The original asserted three fetches per source here, queued behind the
      // master lock. That was the behaviour, and it was the bug: three full
      // taplist downloads to answer one question.
      expect(fetchBeersFromAPI).toHaveBeenCalledTimes(1);
      expect(fetchMyBeersFromAPI).toHaveBeenCalledTimes(1);
      expect(fetchRewardsFromAPI).toHaveBeenCalledTimes(1);
      expect(results[1]).toBe(results[0]);
      expect(results[2]).toBe(results[0]);
    });

    it('releases the lock when a source fails', async () => {
      (fetchMyBeersFromAPI as jest.Mock).mockRejectedValue(new Error('Network error'));

      const result = await sequentialRefreshAllData();

      expect(result.hasErrors).toBe(true);
      expect(result.myBeersResult.success).toBe(false);

      // Asserts the lock is genuinely free, not merely that the wrapper
      // returned: the manager here is the real one.
      const token = await databaseLockManager.acquire('test-operation');
      expect(databaseLockManager.isLocked()).toBe(true);
      databaseLockManager.release(token);
    });

    it('never acquires the lock when every source fails', async () => {
      // Asserted through the ACQUISITION LOG, not through `isLocked()`. The
      // earlier version checked only that the lock was free afterwards, which
      // is equally true of "took it and released it" — so forcing `needsLock`
      // to true left it green, and it could not fail at the thing its name
      // claimed.
      const lockAcquisitions: string[] = [];
      const originalWithLock = databaseLockManager.withDatabaseLock.bind(databaseLockManager);
      jest
        .spyOn(databaseLockManager, 'withDatabaseLock')
        .mockImplementation(async (operation: string, task: () => Promise<unknown>) => {
          lockAcquisitions.push(operation);
          return originalWithLock(operation, task);
        });

      (fetchBeersFromAPI as jest.Mock).mockRejectedValue(new Error('Network error'));
      (fetchMyBeersFromAPI as jest.Mock).mockRejectedValue(new Error('Network error'));
      (fetchRewardsFromAPI as jest.Mock).mockRejectedValue(new Error('Network error'));

      const result = await sequentialRefreshAllData();

      expect(result.hasErrors).toBe(true);
      expect(lockAcquisitions).toEqual([]);
      expect(databaseLockManager.isLocked()).toBe(false);
    });
  });

  describe('manualRefreshAllData', () => {
    it('delegates to the sequential refresh', async () => {
      const executionLog: string[] = [];
      logsAndResolves(fetchBeersFromAPI as jest.Mock, 'allBeers', ALL_BEERS, executionLog);
      logsAndResolves(fetchMyBeersFromAPI as jest.Mock, 'myBeers', MY_BEERS, executionLog);
      logsAndResolves(fetchRewardsFromAPI as jest.Mock, 'rewards', REWARDS, executionLog);

      await manualRefreshAllData();

      expect(executionLog).toEqual([
        'allBeers-start',
        'allBeers-end',
        'myBeers-start',
        'myBeers-end',
        'rewards-start',
        'rewards-end',
      ]);
      expect(beerRepository.insertManyUnsafe).toHaveBeenCalled();
    });

    it('takes the database lock exactly once', async () => {
      const lockAcquisitions: string[] = [];
      const originalWithLock = databaseLockManager.withDatabaseLock.bind(databaseLockManager);
      jest
        .spyOn(databaseLockManager, 'withDatabaseLock')
        .mockImplementation(async (operation: string, task: () => Promise<unknown>) => {
          lockAcquisitions.push(operation);
          return originalWithLock(operation, task);
        });

      await manualRefreshAllData();

      expect(lockAcquisitions).toEqual(['refresh-all-data-write']);
    });

    it('waits out an in-flight refresh and then runs its own', async () => {
      // INVERTED. This asserted one fetch and one shared result — the
      // de-duplication applying to explicit refreshes too. That is wrong for
      // this entry point specifically: manualRefreshAllData exists to
      // invalidate state and force a full fetch, and a run already in flight
      // read the old state. Joining made the second tap a silent no-op.
      //
      // Two serialised downloads for two explicit taps is what shipped before
      // 5.4, so this is not a regression against released behaviour. The
      // automatic refreshes de-duplication was added for still join.
      const results = await Promise.all([manualRefreshAllData(), manualRefreshAllData()]);

      expect(fetchBeersFromAPI).toHaveBeenCalledTimes(2);
      expect(results[1]).not.toBe(results[0]);
    });

    it('clears the ETag only after the refresh it is overtaking has written', async () => {
      // The rapid-double-refresh escape hatch, and the ONLY arrangement that
      // tests it: the second call must arrive while the first is still running.
      // With both calls awaited in turn there is never an in-flight refresh, the
      // wait is a no-op, and deleting it entirely leaves the test green — which
      // is exactly what the first version of this test did.
      //
      // If the clear lands mid-run, the running refresh's write burst stamps its
      // own ETag over it and the next request 304s again, so the user's "refresh
      // again, it still looks wrong" does nothing — twice.
      const order: string[] = [];
      (setPreference as jest.Mock).mockImplementation(async (key: string, value: string) => {
        order.push(value === '' ? `clear:${key}` : `set:${key}`);
      });
      (beerRepository.insertManyUnsafe as jest.Mock).mockImplementation(async () => {
        order.push('write:allBeers');
      });

      // Hold the FIRST refresh open at its rewards fetch, so the second call
      // arrives mid-run rather than after it.
      let releaseFirstRun: () => void = () => {};
      const firstRunReachedRewards = new Promise<void>(resolve => {
        (fetchRewardsFromAPI as jest.Mock).mockImplementationOnce(async () => {
          resolve();
          await new Promise<void>(release => {
            releaseFirstRun = release;
          });
          return fetchedRows(REWARDS);
        });
      });

      const first = manualRefreshAllData();
      await firstRunReachedRewards;

      const second = manualRefreshAllData();
      // Give the second call every chance to run its clears early if it is
      // going to: without the wait it does so on this tick.
      await Promise.resolve();
      await Promise.resolve();

      releaseFirstRun();
      await Promise.all([first, second]);

      expect(order).toContain('write:allBeers');
      expect(order.indexOf('clear:all_beers_etag')).toBeGreaterThan(
        order.indexOf('write:allBeers')
      );
    });

    it('re-stamps the timestamps it cleared', async () => {
      // Joining a run that had already stamped left these at '' with fresh data
      // in the table, and `shouldRefreshData` treats a missing timestamp as
      // "never checked" — so the next app open paid for a full refresh it did
      // not need.
      const written = new Map<string, string>();
      (setPreference as jest.Mock).mockImplementation(async (key: string, value: string) => {
        written.set(key, value);
      });

      await manualRefreshAllData();

      expect(written.get('all_beers_last_check')).not.toBe('');
      expect(written.get('my_beers_last_check')).not.toBe('');
    });
  });

  describe('refreshAllDataFromAPI', () => {
    it('fetches each source in turn', async () => {
      const executionLog: string[] = [];
      logsAndResolves(fetchBeersFromAPI as jest.Mock, 'allBeers', ALL_BEERS, executionLog);
      logsAndResolves(fetchMyBeersFromAPI as jest.Mock, 'myBeers', MY_BEERS, executionLog);
      logsAndResolves(fetchRewardsFromAPI as jest.Mock, 'rewards', REWARDS, executionLog);

      await refreshAllDataFromAPI();

      expect(executionLog).toEqual([
        'allBeers-start',
        'allBeers-end',
        'myBeers-start',
        'myBeers-end',
        'rewards-start',
        'rewards-end',
      ]);
    });

    it('still holds one lock across its whole body, pending Phase 5.5', async () => {
      // Deliberately asserting the CURRENT shape of the login path, which plan
      // 05 Phase 5.5 has not reached yet: it still fetches inside the lock. The
      // test is here so that when 5.5 lands, this file goes red and says which
      // property changed, rather than quietly continuing to pass under a name
      // that no longer describes anything.
      const lockAcquisitions: string[] = [];
      const originalWithLock = databaseLockManager.withDatabaseLock.bind(databaseLockManager);
      jest
        .spyOn(databaseLockManager, 'withDatabaseLock')
        .mockImplementation(async (operation: string, task: () => Promise<unknown>) => {
          lockAcquisitions.push(operation);
          return originalWithLock(operation, task);
        });

      await refreshAllDataFromAPI();

      expect(lockAcquisitions).toEqual(['refresh-all-from-api']);
    });
  });
});
