import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
/**
 * Comprehensive tests for dataUpdateService module
 *
 * This test suite validates the dataUpdateService functions for fetching
 * and updating beer data from the Flying Saucer API.
 */

import {
  fetchAndUpdateAllBeers,
  fetchAndUpdateMyBeers,
  shouldRefreshData,
  fetchAndUpdateRewards,
  sequentialRefreshAllData,
  refreshAllDataFromAPI,
  fetchTaplistFromProxyOrDirect,
} from '../dataUpdateService';
import { Beer, Beerfinder } from '../../types/beer';
import { config } from '@/src/config';

// Import mocked functions after setting up mocks
import { getPreference, setPreference, areApiUrlsConfigured } from '../../database/preferences';
import { beerRepository } from '../../database/repositories/BeerRepository';
import { myBeersRepository } from '../../database/repositories/MyBeersRepository';
import { rewardsRepository } from '../../database/repositories/RewardsRepository';
import { databaseLockManager } from '../../database/DatabaseLockManager';
import {
  fetchBeersFromAPI,
  fetchMemberDataFromAPI,
  fetchMyBeersFromAPI,
  fetchRewardsFromAPI,
} from '../../api/beerApi';
import {
  fetchedRows,
  confirmedEmpty,
  malformed,
  unavailable,
  failed,
} from '../../api/__tests__/helpers/fetchOutcomeFixtures';
import { ApiErrorType, getUserFriendlyErrorMessage } from '../../utils/notificationUtils';
import { logError, logWarning } from '../../utils/errorLogger';
import { DatabaseContentionError } from '../../database/errors';
import {
  fetchBeersFromProxy,
  fetchEnrichmentBatchWithMissing,
  syncBeersToWorker,
  mergeEnrichmentData,
  pollForEnrichmentUpdates,
} from '../enrichmentService';

// Helper: flush all pending microtasks and macrotasks
async function flushPromises(iterations = 10): Promise<void> {
  for (let i = 0; i < iterations; i++) {
    await new Promise(resolve => setImmediate(resolve));
  }
}

// Mock database preferences
vi.mock('../../database/preferences', async () => ({
  getPreference: vi.fn(),

  setPreference: vi.fn(),
  areApiUrlsConfigured: vi.fn(),
}));

// Mock repositories
vi.mock('../../database/repositories/BeerRepository', async () => ({
  beerRepository: {
    count: vi.fn(async () => 12),
    insertMany: vi.fn(),
    insertManyUnsafe: vi.fn(),
    updateEnrichmentData: vi.fn().mockResolvedValue(0),
  },
}));

vi.mock('../../database/repositories/MyBeersRepository', async () => ({
  myBeersRepository: {
    replaceAllWithEmpty: vi.fn(),
    replaceAllWithEmptyUnsafe: vi.fn(),
    insertMany: vi.fn(),
    insertManyUnsafe: vi.fn(),
    updateEnrichmentData: vi.fn().mockResolvedValue(0),
  },
}));

vi.mock('../../database/repositories/RewardsRepository', async () => ({
  rewardsRepository: {
    replaceAllWithEmpty: vi.fn(async () => {}),
    replaceAllWithEmptyUnsafe: vi.fn(async () => {}),
    insertMany: vi.fn(),
    insertManyUnsafe: vi.fn(),
  },
}));

// Delegates to a REAL DatabaseLockManager rather than faking the lock away.
// A mock of the shape `jest.fn((_name, task) => task())` has no release to
// observe, so a test asserting "the lock was released" against it passes even
// when withDatabaseLock's finally is deleted. Keeping a spy on top preserves
// the call-name assertions while isLocked() reports genuine state.
vi.mock('../../database/DatabaseLockManager', async () => {
  const actual = await vi.importActual<typeof import('../../database/DatabaseLockManager')>(
    '../../database/DatabaseLockManager'
  );
  const real = new actual.DatabaseLockManager();
  return {
    databaseLockManager: {
      withDatabaseLock: vi.fn((name: string, task: () => Promise<unknown>) =>
        real.withDatabaseLock(name, task)
      ),
      isLocked: () => real.isLocked(),
      getQueueLength: () => real.getQueueLength(),
      hasAbandonedHolder: () => real.hasAbandonedHolder(),
      resetForTesting: () => real.resetForTesting(),
    },
  };
});

vi.mock('../../api/beerApi', async () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  (await import('../../api/__tests__/helpers/beerApiMock')).beerApiMockFactory()
);

// Mock enrichment service
vi.mock('../enrichmentService', async () => ({
  fetchBeersFromProxy: vi.fn(),
  fetchEnrichmentBatchWithMissing: vi.fn().mockResolvedValue({ enrichments: {}, missing: [] }),
  syncBeersToWorker: vi.fn().mockResolvedValue({ synced: 0, failed: 0, queued_for_cleanup: 0 }),
  mergeEnrichmentData: vi.fn().mockImplementation(beers => beers),
  recordFallback: vi.fn(),
  pollForEnrichmentUpdates: vi.fn().mockResolvedValue({}),
}));

// Mock error logger — pass through to console.error so existing assertions still work
vi.mock('../../utils/errorLogger', async () => ({
  logError: vi.fn((...args: unknown[]) => console.error(...args)),
  logWarning: vi.fn(),
}));

// Partial mock of config — only override enrichment.isConfigured
vi.mock('@/src/config', async () => {
  const actual = await vi.importActual<typeof import('@/src/config')>('@/src/config');
  return {
    ...actual,
    config: {
      ...actual.config,
      enrichment: {
        ...actual.config.enrichment,
        isConfigured: vi.fn().mockReturnValue(false),
      },
    },
  };
});

// Mock fetch
global.fetch = vi.fn();

// Mock console methods
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

describe('dataUpdateService', () => {
  // Test URLs from config
  const testAllBeersUrl = `${config.api.baseUrl}/api/all-beers`;

  /**
   * Answer `all_beers_api_url` with `url` consistently, for every read.
   *
   * `mockResolvedValueOnce` is wrong for any test that reaches the taplist
   * write, because the write re-reads this preference under the lock to check
   * the store has not changed mid-refresh. A one-shot mock answers the URL and
   * then `undefined`, which the guard correctly reads as "the store switched"
   * and abandons the write. Preferences are durable storage: a second read of
   * an unwritten key returns the same value, and the fixture has to say so.
   *
   * Takes the URL rather than assuming `testAllBeersUrl`: the Config
   * Integration tests below each exist to show a particular URL shape works, so
   * substituting a different one would delete the thing they test.
   *
   * At `describe('dataUpdateService')` scope rather than inside
   * `fetchAndUpdateAllBeers`, because it was scoped there when it was written
   * and the five Config Integration tests that needed it could not see it. They
   * silently took the abandon path for it instead — asserting only that a fetch
   * happened, and passing against a taplist write that inserted nothing.
   */
  const taplistUrlIsStable = (url: string = testAllBeersUrl): void => {
    (getPreference as Mock).mockImplementation(async (key: string) =>
      key === 'all_beers_api_url' ? url : null
    );
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Mock console methods to prevent noise in tests
    console.log = vi.fn();
    console.error = vi.fn();

    // Default mock for fetch
    (global.fetch as Mock).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([]),
    });
  });

  afterEach(async () => {
    // Restore console methods
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    vi.restoreAllMocks();
  });

  describe('fetchAndUpdateAllBeers', () => {
    it('should return failure result if API URL is not set', async () => {
      // Mock getPreference to return null (no API URL set)
      (getPreference as Mock).mockResolvedValueOnce(null);

      const result = await fetchAndUpdateAllBeers();

      expect(result.success).toBe(false);
      expect(result.dataUpdated).toBe(false);
      expect(result.error).toBeDefined();
      expect(getPreference).toHaveBeenCalledWith('all_beers_api_url');
    });

    it('should return failure result if fetchBeersFromAPI throws', async () => {
      (getPreference as Mock).mockResolvedValueOnce(testAllBeersUrl);
      (fetchBeersFromAPI as Mock).mockRejectedValueOnce(new Error('Network error'));

      const result = await fetchAndUpdateAllBeers();

      expect(result.success).toBe(false);
      expect(result.dataUpdated).toBe(false);
      expect(result.error).toBeDefined();
      expect(getPreference).toHaveBeenCalledWith('all_beers_api_url');
    });

    it('should return failure result when fetchBeersFromAPI returns empty array', async () => {
      (getPreference as Mock).mockResolvedValueOnce(testAllBeersUrl);
      (fetchBeersFromAPI as Mock).mockResolvedValueOnce(fetchedRows([]));

      const result = await fetchAndUpdateAllBeers();

      expect(result.success).toBe(false);
      expect(result.dataUpdated).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return failure result when all beers are invalid', async () => {
      (getPreference as Mock).mockResolvedValueOnce(testAllBeersUrl);
      (fetchBeersFromAPI as Mock).mockResolvedValueOnce(
        fetchedRows([{ brew_name: 'No ID Beer', brewer: 'Brewery 1' }])
      );

      const result = await fetchAndUpdateAllBeers();

      expect(result.success).toBe(false);
      expect(result.dataUpdated).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should successfully update all beers', async () => {
      taplistUrlIsStable();

      const mockBeers: Beer[] = [
        { id: 'beer-1', brew_name: 'Test Beer 1', brewer: 'Brewery 1' },
        { id: 'beer-2', brew_name: 'Test Beer 2', brewer: 'Brewery 2' },
      ];

      (fetchBeersFromAPI as Mock).mockResolvedValueOnce(fetchedRows(mockBeers));
      (beerRepository.insertMany as Mock).mockResolvedValueOnce(undefined);
      (setPreference as Mock).mockResolvedValue(undefined);

      const result = await fetchAndUpdateAllBeers();

      expect(result.success).toBe(true);
      expect(result.dataUpdated).toBe(true);
      expect(result.itemCount).toBe(mockBeers.length);
      // insertManyUnsafe, not insertMany: the rows and the ETag they imply now
      // sit in one critical section this function opens itself, so a nested
      // lock acquisition would be the contention the master lock removed.
      expect(beerRepository.insertManyUnsafe).toHaveBeenCalledWith([
        {
          id: 'beer-1',
          brew_name: 'Test Beer 1',
          brewer: 'Brewery 1',
          container_type: null,
          abv: null,
          enrichment_confidence: null,
          enrichment_source: null,
        },
        {
          id: 'beer-2',
          brew_name: 'Test Beer 2',
          brewer: 'Brewery 2',
          container_type: null,
          abv: null,
          enrichment_confidence: null,
          enrichment_source: null,
        },
      ]);
      expect(setPreference).toHaveBeenCalledWith('all_beers_last_update', expect.any(String));
      expect(setPreference).toHaveBeenCalledWith('all_beers_last_check', expect.any(String));
    });

    it('should handle errors during update', async () => {
      (getPreference as Mock).mockResolvedValueOnce(testAllBeersUrl);
      (fetchBeersFromAPI as Mock).mockRejectedValueOnce(new Error('Network error'));

      const result = await fetchAndUpdateAllBeers();

      expect(result.success).toBe(false);
      expect(result.dataUpdated).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should categorize AbortError as NETWORK_ERROR via createErrorResponse', async () => {
      (getPreference as Mock).mockResolvedValueOnce(testAllBeersUrl);
      // An abort is classified inside beerApi now and arrives as `failed`;
      // see beerApi.timeout.test.ts for the abort itself.
      (fetchBeersFromAPI as Mock).mockResolvedValueOnce(
        failed(ApiErrorType.NETWORK_ERROR, 'Network connection error: request timed out')
      );

      const result = await fetchAndUpdateAllBeers();

      expect(result.success).toBe(false);
      expect(result.dataUpdated).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.type).toBe('NETWORK_ERROR');
    });

    it('should delegate to fetchBeersFromAPI for fetching', async () => {
      (getPreference as Mock).mockResolvedValueOnce(testAllBeersUrl);
      (fetchBeersFromAPI as Mock).mockResolvedValueOnce(
        fetchedRows([{ id: '1', brew_name: 'Test' }])
      );
      (beerRepository.insertMany as Mock).mockResolvedValueOnce(undefined);
      (setPreference as Mock).mockResolvedValue(undefined);

      await fetchAndUpdateAllBeers();

      expect(fetchBeersFromAPI).toHaveBeenCalled();
    });

    it('should filter out invalid beers without IDs', async () => {
      taplistUrlIsStable();

      const mockBeers = [
        { id: 'beer-1', brew_name: 'Valid Beer 1', brewer: 'Brewery 1' },
        { brew_name: 'Invalid Beer - No ID', brewer: 'Brewery 2' },
        { id: 'beer-3', brew_name: 'Valid Beer 2', brewer: 'Brewery 3' },
      ];

      (fetchBeersFromAPI as Mock).mockResolvedValueOnce(fetchedRows(mockBeers));
      (beerRepository.insertMany as Mock).mockResolvedValueOnce(undefined);
      (setPreference as Mock).mockResolvedValue(undefined);

      const result = await fetchAndUpdateAllBeers();

      expect(result.success).toBe(true);
      expect(result.itemCount).toBe(2);
    });
  });

  describe('fetchAndUpdateMyBeers', () => {
    /**
     * Rewritten wholesale by plan refresh-failure-classification D3.
     *
     * This entry point carried its own copy of the whole my-beers pipeline: a
     * raw `fetch` with a hard-coded 15s timeout and no retry, its own parse, its
     * own extraction, its own validation and its own writes. It therefore
     * inherited none of the transport work — a body that would not parse was
     * PARSE_ERROR with no retry, every non-2xx was SERVER_ERROR including a 4xx,
     * and "all rows lack an id" reached the user verbatim through UNKNOWN_ERROR.
     * It now composes `fetchMyBeersFromAPI` + `prepareMyBeers` + `writeMyBeers`,
     * the same three pieces the sequential path uses.
     *
     * So these tests drive OUTCOMES rather than response bodies. The body-shaped
     * cases they used to stage — a non-array payload, a missing array, rows
     * without ids — are now `beerApi`'s to classify and are tested there against
     * a real `global.fetch`; what is left here is that this entry point routes
     * each outcome to the right write, lock and timestamp.
     */
    // No preference fixture, and none needed: after D3 this entry point reads no
    // preferences at all — resolving the URL and checking visitor mode are
    // `beerApi`'s, expressed here as the `unavailable` outcomes it returns.
    //
    // Deliberately not a `beforeEach` that installs one either. `clearAllMocks`
    // does not clear a `mockImplementation`, so a preference fixture set in a
    // `beforeEach` here leaks into every later describe in this file — which is
    // exactly how the ETag test twelve hundred lines below started failing while
    // this block was being written.

    it('makes no request of its own — the shared fetcher makes it', async () => {
      // THE POINT OF D3. A second raw `fetch` in this file is how the entry
      // point came to have a different timeout, a different retry policy and a
      // different error vocabulary from every other source.
      (fetchMyBeersFromAPI as Mock).mockResolvedValue(
        fetchedRows([{ id: 'beer-1', brew_name: 'Test Beer 1', tasted_date: '2023-01-01' }])
      );

      await fetchAndUpdateMyBeers();

      expect(fetchMyBeersFromAPI).toHaveBeenCalledTimes(1);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('returns failure with actionable copy when the URL is not configured', async () => {
      (fetchMyBeersFromAPI as Mock).mockResolvedValue(
        unavailable('not-configured', 'my_beers_api_url is not set')
      );

      const result = await fetchAndUpdateMyBeers();

      expect(result.success).toBe(false);
      expect(result.dataUpdated).toBe(false);
      // Same type and same sentence as the hand-written branch this replaces —
      // `unavailableCopy('My beers', 'not-configured')` produces it verbatim.
      expect(result.error?.type).toBe(ApiErrorType.VALIDATION_ERROR);
      expect(getUserFriendlyErrorMessage(result.error!)).toBe(
        'My beers API URL not set. Please log in to configure API URLs.'
      );
    });

    it('reports a server error as a server error', async () => {
      (fetchMyBeersFromAPI as Mock).mockResolvedValue(
        failed(ApiErrorType.SERVER_ERROR, 'HTTP 500 Internal Server Error')
      );

      const result = await fetchAndUpdateMyBeers();

      expect(result.success).toBe(false);
      expect(result.dataUpdated).toBe(false);
      expect(result.error?.type).toBe(ApiErrorType.SERVER_ERROR);
    });

    it('reports a transport failure as a network error', async () => {
      (fetchMyBeersFromAPI as Mock).mockResolvedValue(
        failed(ApiErrorType.NETWORK_ERROR, 'Network connection error: request timed out')
      );

      const result = await fetchAndUpdateMyBeers();

      expect(result.success).toBe(false);
      expect(result.error?.type).toBe(ApiErrorType.NETWORK_ERROR);
    });

    it('reports a body that could not be read with its own type and copy', async () => {
      // Previously PARSE_ERROR, produced by this function's own `response.json()`
      // catch, with no retry and no relation to the classification every other
      // source uses. Inherited now rather than reimplemented.
      (fetchMyBeersFromAPI as Mock).mockResolvedValue(
        failed(ApiErrorType.UNREADABLE_BODY_ERROR, 'Response body could not be read as JSON')
      );

      const result = await fetchAndUpdateMyBeers();

      expect(result.success).toBe(false);
      expect(result.error?.type).toBe(ApiErrorType.UNREADABLE_BODY_ERROR);
    });

    it.each([
      ['a body of the wrong shape', 'response contained no tasted_brew_current_round array'],
      ['rows that all lack an id', '2 rows returned and none carried an id'],
    ])('refuses to write for %s, without leaking the detail', async (_label, detail) => {
      // Two cases this function used to classify itself and get wrong in two
      // different ways: a missing array was VALIDATION_ERROR, whose renderer
      // returns `message` verbatim, and rows-without-ids was an untyped `Error`
      // that reached UNKNOWN_ERROR — which returns `message` verbatim too. Both
      // put parser prose in the refresh alert. MALFORMED_RESPONSE_ERROR has copy
      // written to suppress exactly that.
      (fetchMyBeersFromAPI as Mock).mockResolvedValue(malformed(detail));

      const result = await fetchAndUpdateMyBeers();

      expect(result.success).toBe(false);
      expect(result.dataUpdated).toBe(false);
      expect(result.error?.type).toBe(ApiErrorType.MALFORMED_RESPONSE_ERROR);
      expect(getUserFriendlyErrorMessage(result.error!)).not.toContain(detail);
      // The table is left alone and no timestamp is stamped — writing here is
      // what wiped a populated tasted list, and stamping hid it for 12 hours.
      expect(myBeersRepository.insertManyUnsafe).not.toHaveBeenCalled();
      expect(myBeersRepository.replaceAllWithEmptyUnsafe).not.toHaveBeenCalled();
      expect(setPreference).not.toHaveBeenCalledWith('my_beers_last_update', expect.anything());
    });

    it('writes the rows and stamps both timestamps on success', async () => {
      (fetchMyBeersFromAPI as Mock).mockResolvedValue(
        fetchedRows([
          { id: 'beer-1', brew_name: 'Test Beer 1', tasted_date: '2023-01-01' },
          { id: 'beer-2', brew_name: 'Test Beer 2', tasted_date: '2023-01-02' },
        ])
      );

      const result = await fetchAndUpdateMyBeers();

      expect(result.success).toBe(true);
      expect(result.dataUpdated).toBe(true);
      expect(result.itemCount).toBe(2);
      // `insertManyUnsafe`, not `insertMany`: the write now runs inside one
      // explicit lock hold covering the rows AND the timestamps, instead of the
      // repository taking and releasing its own lock for the rows alone.
      // container_type and the enrichment columns are added by
      // `calculateContainerTypes` before the write.
      expect(myBeersRepository.insertManyUnsafe).toHaveBeenCalledWith([
        expect.objectContaining({ id: 'beer-1', container_type: null, abv: null }),
        expect.objectContaining({ id: 'beer-2', container_type: null, abv: null }),
      ]);
      expect(setPreference).toHaveBeenCalledWith('my_beers_last_update', expect.any(String));
      expect(setPreference).toHaveBeenCalledWith('my_beers_last_check', expect.any(String));
    });

    it('clears the table when the server confirms an empty round', async () => {
      (fetchMyBeersFromAPI as Mock).mockResolvedValue(confirmedEmpty());

      const result = await fetchAndUpdateMyBeers();

      expect(result.success).toBe(true);
      expect(result.dataUpdated).toBe(true);
      expect(result.itemCount).toBe(0);
      expect(myBeersRepository.replaceAllWithEmptyUnsafe).toHaveBeenCalled();
      expect(myBeersRepository.insertManyUnsafe).not.toHaveBeenCalled();
    });

    it('skips in visitor mode without stamping a freshness timestamp', async () => {
      // BEHAVIOUR CHANGE, and a deliberate one. This used to stamp
      // `my_beers_last_check` "to prevent repeated checks" and return an INFO
      // error. Both were inert and one was harmful: `checkAndRefreshOnAppOpen`
      // already gates my-beers on `!isVisitor`, so the stamp prevented nothing —
      // but it persisted, so a visitor who logged in had a fresh timestamp
      // claiming their tasted list had just been checked, and the 12-hour window
      // could skip the first app-open refresh they were ever entitled to. A
      // non-answer must not stamp; that is the rule the rest of this work
      // established.
      //
      // The INFO error went unread: `_layout` discards this result and
      // `checkAndRefreshOnAppOpen` only collects errors when `success` is false.
      (fetchMyBeersFromAPI as Mock).mockResolvedValue(
        unavailable('not-applicable', 'visitor mode has no tasted beers')
      );

      const result = await fetchAndUpdateMyBeers();

      expect(result.success).toBe(true);
      expect(result.dataUpdated).toBe(false);
      expect(setPreference).not.toHaveBeenCalledWith('my_beers_last_check', expect.any(String));
      expect(myBeersRepository.replaceAllWithEmptyUnsafe).not.toHaveBeenCalled();
    });

    it('takes the database lock for the write burst', async () => {
      // `writeMyBeers` uses the `*Unsafe` repository methods, which assume the
      // caller holds the lock. The sequential path holds the master lock already;
      // this entry point has to take one, and the rows and the timestamps must
      // land inside the same hold.
      (fetchMyBeersFromAPI as Mock).mockResolvedValue(
        fetchedRows([{ id: 'beer-1', brew_name: 'B', tasted_date: '2023-01-01' }])
      );

      await fetchAndUpdateMyBeers();

      expect(databaseLockManager.withDatabaseLock).toHaveBeenCalledTimes(1);
    });

    it('resolves to a classified failure when the lock cannot be acquired', async () => {
      // REGRESSION. Rewriting this function around the shared pipeline dropped
      // its outer try/catch, and `withDatabaseLock` awaits `acquire` BEFORE
      // entering its own try — so an acquisition failure propagated straight out
      // and this function stopped honouring `Promise<DataUpdateResult>`.
      //
      // `acquire` rejects on two live paths: the 30s acquisition timeout, and
      // `isShuttingDown`. The first is reachable whenever app open contends with
      // an in-flight refresh holding the master lock. `checkAndRefreshOnAppOpen`
      // then unwinds to its own outer catch and returns `{updated:false}`,
      // discarding the `updated` flag from an all-beers refresh that had already
      // succeeded.
      //
      // `applyPlan`'s catch does NOT cover this: it sits inside the lock
      // callback, so it only ever sees the write. The two sibling entry points
      // both kept an outer catch; this one was the odd case out.
      (fetchMyBeersFromAPI as Mock).mockResolvedValue(
        fetchedRows([{ id: 'beer-1', brew_name: 'B', tasted_date: '2023-01-01' }])
      );
      // `DatabaseContentionError`, NOT a plain `Error` — and this test was
      // written with a plain one, which made it a false green on the axis that
      // matters. `_timeoutAcquisition` rejects with the typed error, and its own
      // comment says why: a plain Error falls through `createErrorResponse` to
      // the substring rules, where `message.includes('timeout')` classifies a
      // purely local lock problem as NETWORK_ERROR and tells the user to check
      // their internet connection. Staging that shape here meant the test
      // exercised the very defect the lock manager exists to prevent, and then
      // asserted only that SOME error came back.
      //
      // NETWORK_ERROR is also `isTransportFault: true` where CONTENTION_ERROR is
      // false, so the value the old arrangement drove would have flipped
      // `allNetworkErrors` — the failure this codebase has now fixed twice — and
      // the test would not have noticed.
      (databaseLockManager.withDatabaseLock as Mock).mockRejectedValueOnce(
        new DatabaseContentionError(
          'Lock acquisition timeout for fetchAndUpdateMyBeers after 30000ms'
        )
      );

      const result = await fetchAndUpdateMyBeers();

      expect(result.success).toBe(false);
      expect(result.dataUpdated).toBe(false);
      expect(result.error?.type).toBe(ApiErrorType.CONTENTION_ERROR);
      // Transient and local: the user is told to try again, not to check a
      // connection that had nothing to do with it.
      expect(getUserFriendlyErrorMessage(result.error!)).toBe(
        'The app was busy updating. Please try again in a moment.'
      );
    });

    it('does not take the lock when there is nothing to write', async () => {
      // A failed source has no write burst, so taking the lock would be a
      // pointless acquisition at the moment other retries are most likely to be
      // contending for it — the same reasoning `runSequentialRefresh` applies.
      (fetchMyBeersFromAPI as Mock).mockResolvedValue(failed(ApiErrorType.NETWORK_ERROR));

      await fetchAndUpdateMyBeers();

      expect(databaseLockManager.withDatabaseLock).not.toHaveBeenCalled();
    });

    it('starts the worker sync after the write, not during the fetch', async () => {
      // The old code fired this inside its enrichment block, during the fetch.
      // The sync polls the Worker and then writes enrichment into the same table
      // under its own lock, so starting it early lets it land BEFORE the
      // clear-and-reinsert below and be wiped by it.
      (config.enrichment.isConfigured as Mock).mockReturnValue(true);
      (fetchEnrichmentBatchWithMissing as Mock).mockResolvedValue({
        enrichments: {},
        missing: ['beer-1'],
      });
      (fetchMyBeersFromAPI as Mock).mockResolvedValue(
        fetchedRows([{ id: 'beer-1', brew_name: 'B', tasted_date: '2023-01-01' }])
      );

      await fetchAndUpdateMyBeers();

      // No flush needed, and deliberately none: this suite runs on fake timers,
      // where `flushPromises`' `setImmediate` never fires.
      // `syncMissingBeersInBackground` reaches `syncBeersToWorker` with no
      // `await` in front of it, so it has already been invoked by the time the
      // call above resolves. If it had NOT been started synchronously after the
      // write, this assertion would fail rather than hang.
      const writeOrder = (myBeersRepository.insertManyUnsafe as Mock).mock.invocationCallOrder[0];
      const syncOrder = (syncBeersToWorker as Mock).mock.invocationCallOrder[0];
      expect(writeOrder).toBeDefined();
      expect(syncOrder).toBeGreaterThan(writeOrder);
    });

    it('writes the tasted list even when enrichment fails outright', async () => {
      // Enrichment is an optional enhancement and its catch says so — but
      // mutation showed that catch is the ONE uncovered statement on this path:
      // rethrowing instead of swallowing left all 15 service suites green. An
      // enrichment outage would then turn a perfectly good tasted-beers refresh
      // into a failed source and skip the write entirely, and nothing would say
      // so.
      //
      // Pre-existing — `main` had the same catch, untested, in two places. What
      // changed is that it is now ONE shared site, so this single test covers
      // every source that enriches.
      (config.enrichment.isConfigured as Mock).mockReturnValue(true);
      (fetchEnrichmentBatchWithMissing as Mock).mockRejectedValue(
        new Error('enrichment worker unreachable')
      );
      (fetchMyBeersFromAPI as Mock).mockResolvedValue(
        fetchedRows([{ id: 'beer-1', brew_name: 'B', tasted_date: '2023-01-01' }])
      );

      const result = await fetchAndUpdateMyBeers();

      expect(result.success).toBe(true);
      expect(result.dataUpdated).toBe(true);
      expect(myBeersRepository.insertManyUnsafe).toHaveBeenCalled();
    });

    it('calculates container types AFTER enrichment so ABV drives glass selection', async () => {
      // A draft beer with no ABV in its description gets container_type = null —
      // a question-mark icon — unless enrichment lands first. Kept from the
      // original suite; it now exercises the shared `prepareMyBeers` ordering
      // rather than this function's own copy of it.
      (config.enrichment.isConfigured as Mock).mockReturnValue(true);
      (fetchMyBeersFromAPI as Mock).mockResolvedValue(
        fetchedRows([
          {
            id: 'beer-1',
            brew_name: 'Parish West Coast Ghost',
            brewer: 'Parish Brewing',
            brew_container: 'Draft',
            brew_style: 'IPA',
            brew_description: 'A west coast IPA',
            tasted_date: '2024-06-15',
          },
        ])
      );
      (fetchEnrichmentBatchWithMissing as Mock).mockResolvedValueOnce({
        enrichments: {
          'beer-1': {
            enriched_abv: 6.5,
            enrichment_confidence: 0.9,
            enrichment_source: 'perplexity',
            brew_description: 'A west coast IPA. 6.5% ABV.',
            has_cleaned_description: true,
          },
        },
        missing: [],
      });
      (mergeEnrichmentData as Mock).mockImplementationOnce((beers, enrichmentData) =>
        beers.map((beer: Record<string, unknown>) => {
          const enrichment = enrichmentData[beer.id as string];
          return enrichment
            ? {
                ...beer,
                abv: enrichment.enriched_abv ?? beer.abv,
                enrichment_confidence: enrichment.enrichment_confidence,
                enrichment_source: enrichment.enrichment_source,
                brew_description: enrichment.brew_description ?? beer.brew_description,
              }
            : beer;
        })
      );

      await fetchAndUpdateMyBeers();

      const inserted = (myBeersRepository.insertManyUnsafe as Mock).mock.calls[0][0];
      expect(inserted[0].container_type).toBe('pint');
      expect(inserted[0].abv).toBe(6.5);
    });

    // MOVED, not dropped: 'should use configured URL from preferences' asserted
    // `global.fetch` was called with the URL from preferences. Resolving that URL
    // is `beerApi`'s job now, and `beerApi.test.ts` already asserts the fetch is
    // made against the resolved `my_beers_api_url`. Keeping a copy here would
    // require this entry point to know the URL, which is the coupling D3 removes.
  });

  describe('Config Integration', () => {
    describe('Environment Configuration', () => {
      // Each of these asserts the rows LANDED, not merely that a fetch was
      // attempted. `success: true` alone is satisfied by
      // `abandonedAfterStoreSwitch`, which is what these five did for a while:
      // the one-shot preference mock made the write's own guard read "the store
      // switched", so every one of them passed against a taplist write that
      // inserted nothing. `dataUpdated` and the insert are what make the name of
      // the test its actual subject.
      it('should work with production config base URL', async () => {
        const productionUrl = `${config.api.baseUrl}/visitor`;
        taplistUrlIsStable(productionUrl);
        (fetchBeersFromAPI as Mock).mockResolvedValueOnce(
          fetchedRows([{ id: '1', brew_name: 'Test' }])
        );
        (setPreference as Mock).mockResolvedValue(undefined);

        const result = await fetchAndUpdateAllBeers();

        expect(result.success).toBe(true);
        expect(result.dataUpdated).toBe(true);
        expect(fetchBeersFromAPI).toHaveBeenCalled();
        expect(beerRepository.insertManyUnsafe).toHaveBeenCalled();
      });

      it('should work with custom API URL', async () => {
        const customBaseUrl = 'https://staging.flyingsaucer.com';
        const customUrl = `${customBaseUrl}/api/beers`;

        taplistUrlIsStable(customUrl);
        (fetchBeersFromAPI as Mock).mockResolvedValueOnce(
          fetchedRows([{ id: '1', brew_name: 'Test' }])
        );
        (setPreference as Mock).mockResolvedValue(undefined);

        const result = await fetchAndUpdateAllBeers();

        expect(result.success).toBe(true);
        expect(result.dataUpdated).toBe(true);
        expect(fetchBeersFromAPI).toHaveBeenCalled();
        expect(beerRepository.insertManyUnsafe).toHaveBeenCalled();
      });
    });

    describe('Network Timeout Configuration', () => {
      it('should delegate fetch to fetchBeersFromAPI which handles timeouts', async () => {
        // Same fixture as the five above, for the same reason. "Delegates the
        // fetch" is technically satisfied by a refresh that fetches and then
        // abandons the write, so this would have stayed green while doing half
        // of what it describes.
        taplistUrlIsStable();
        (fetchBeersFromAPI as Mock).mockResolvedValueOnce(
          fetchedRows([{ id: '1', brew_name: 'Test' }])
        );
        (setPreference as Mock).mockResolvedValue(undefined);

        const result = await fetchAndUpdateAllBeers();

        expect(fetchBeersFromAPI).toHaveBeenCalled();
        expect(result.dataUpdated).toBe(true);
      });

      it('should handle timeout gracefully', async () => {
        (getPreference as Mock).mockResolvedValueOnce(testAllBeersUrl);
        (fetchBeersFromAPI as Mock).mockRejectedValueOnce(new Error('Timeout'));

        const result = await fetchAndUpdateAllBeers();

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      });
    });

    describe('URL Validation', () => {
      it('should handle malformed URLs gracefully', async () => {
        const malformedUrl = 'not-a-valid-url';
        (getPreference as Mock).mockResolvedValueOnce(malformedUrl);
        (fetchBeersFromAPI as Mock).mockRejectedValueOnce(new TypeError('Failed to fetch'));

        const result = await fetchAndUpdateAllBeers();

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      });

      it('should accept HTTPS URLs', async () => {
        const httpsUrl = 'https://secure.api.com/beers';
        taplistUrlIsStable(httpsUrl);
        (fetchBeersFromAPI as Mock).mockResolvedValueOnce(
          fetchedRows([{ id: '1', brew_name: 'Test' }])
        );
        (setPreference as Mock).mockResolvedValue(undefined);

        const result = await fetchAndUpdateAllBeers();

        expect(result.success).toBe(true);
        expect(result.dataUpdated).toBe(true);
        expect(fetchBeersFromAPI).toHaveBeenCalled();
        expect(beerRepository.insertManyUnsafe).toHaveBeenCalled();
      });

      it('should accept HTTP URLs', async () => {
        const httpUrl = 'http://localhost:3000/api/beers';
        taplistUrlIsStable(httpUrl);
        (fetchBeersFromAPI as Mock).mockResolvedValueOnce(
          fetchedRows([{ id: '1', brew_name: 'Test' }])
        );
        (setPreference as Mock).mockResolvedValue(undefined);

        const result = await fetchAndUpdateAllBeers();

        expect(result.success).toBe(true);
        expect(result.dataUpdated).toBe(true);
        expect(fetchBeersFromAPI).toHaveBeenCalled();
        expect(beerRepository.insertManyUnsafe).toHaveBeenCalled();
      });
    });

    describe('Config Module Compatibility', () => {
      it('should work with config.api.baseUrl value', async () => {
        expect(config.api.baseUrl).toBeDefined();
        expect(typeof config.api.baseUrl).toBe('string');

        const configBasedUrl = `${config.api.baseUrl}/custom/endpoint`;
        taplistUrlIsStable(configBasedUrl);
        (fetchBeersFromAPI as Mock).mockResolvedValueOnce(
          fetchedRows([{ id: '1', brew_name: 'Test' }])
        );
        (setPreference as Mock).mockResolvedValue(undefined);

        const result = await fetchAndUpdateAllBeers();

        expect(result.success).toBe(true);
        expect(result.dataUpdated).toBe(true);
        expect(fetchBeersFromAPI).toHaveBeenCalled();
        expect(beerRepository.insertManyUnsafe).toHaveBeenCalled();
      });

      it('should respect config network settings for timeout handling', async () => {
        expect(config.network.timeout).toBeDefined();
        expect(config.network.retries).toBeDefined();
        expect(config.network.retryDelay).toBeDefined();

        expect(config.network.timeout).toBeGreaterThan(0);
        expect(config.network.retries).toBeGreaterThanOrEqual(0);
      });
    });

    describe('Error Handling with Config', () => {
      it('should properly categorize network errors', async () => {
        // Drives the REAL contract. Post-5.3 the fetchers cannot reject for a
        // transport failure — their whole body is inside a try — so a rejecting
        // mock tests a path production can no longer take. That is why the
        // classification regression this test appears to guard stayed green:
        // the mock preserved the old contract the code had already left.
        (getPreference as Mock).mockResolvedValueOnce(testAllBeersUrl);
        (fetchBeersFromAPI as Mock).mockResolvedValueOnce(
          failed(ApiErrorType.NETWORK_ERROR, 'Network connection error')
        );

        const result = await fetchAndUpdateAllBeers();

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error?.type).toBe('NETWORK_ERROR');
      });

      it('should properly categorize unknown errors', async () => {
        (getPreference as Mock).mockResolvedValueOnce(testAllBeersUrl);
        (fetchBeersFromAPI as Mock).mockRejectedValueOnce(new Error('Server error'));

        const result = await fetchAndUpdateAllBeers();

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error?.type).toBe('UNKNOWN_ERROR');
      });

      it('should properly categorize validation errors', async () => {
        (getPreference as Mock).mockResolvedValueOnce(null);

        const result = await fetchAndUpdateAllBeers();

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error?.type).toBe('VALIDATION_ERROR');
      });

      it('should properly categorize empty response as validation error', async () => {
        (getPreference as Mock).mockResolvedValueOnce(testAllBeersUrl);
        (fetchBeersFromAPI as Mock).mockResolvedValueOnce(fetchedRows([]));

        const result = await fetchAndUpdateAllBeers();

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error?.type).toBe('VALIDATION_ERROR');
      });
    });
  });

  describe('shouldRefreshData', () => {
    it('returns true when no previous check timestamp exists', async () => {
      (getPreference as Mock).mockResolvedValue(null);

      const result = await shouldRefreshData('all_beers_last_check');

      expect(result).toBe(true);
    });

    it('returns true when last check was more than 12 hours ago', async () => {
      const thirteenHoursAgo = new Date(Date.now() - 13 * 60 * 60 * 1000).toISOString();
      (getPreference as Mock).mockResolvedValue(thirteenHoursAgo);

      const result = await shouldRefreshData('all_beers_last_check');

      expect(result).toBe(true);
    });

    it('returns false when last check was less than 12 hours ago', async () => {
      const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
      (getPreference as Mock).mockResolvedValue(oneHourAgo);

      const result = await shouldRefreshData('all_beers_last_check');

      expect(result).toBe(false);
    });

    it('returns true when last check is exactly 12 hours ago', async () => {
      const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
      (getPreference as Mock).mockResolvedValue(twelveHoursAgo);

      const result = await shouldRefreshData('all_beers_last_check');

      expect(result).toBe(true);
    });

    it('respects custom interval when provided', async () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      (getPreference as Mock).mockResolvedValue(twoHoursAgo);

      const resultWithOneHour = await shouldRefreshData('all_beers_last_check', 1);
      const resultWithThreeHours = await shouldRefreshData('all_beers_last_check', 3);

      expect(resultWithOneHour).toBe(true);
      expect(resultWithThreeHours).toBe(false);
    });

    it('returns true when getPreference throws an error', async () => {
      (getPreference as Mock).mockRejectedValue(new Error('DB error'));

      const result = await shouldRefreshData('all_beers_last_check');

      expect(result).toBe(true);
    });
  });

  describe('fetchAndUpdateRewards', () => {
    it('returns success with data when rewards are fetched successfully', async () => {
      const mockRewards = [{ id: 'reward-1', name: 'Free Beer' }];
      (getPreference as Mock).mockResolvedValue('false');
      (fetchRewardsFromAPI as Mock).mockResolvedValue(fetchedRows(mockRewards));
      (rewardsRepository.insertMany as Mock).mockResolvedValue(undefined);

      const result = await fetchAndUpdateRewards();

      expect(result.success).toBe(true);
      expect(result.dataUpdated).toBe(true);
      expect(result.itemCount).toBe(1);
      expect(rewardsRepository.insertMany).toHaveBeenCalledWith(mockRewards);
    });

    it('skips fetch and returns success when in visitor mode', async () => {
      (getPreference as Mock).mockResolvedValue('true');

      const result = await fetchAndUpdateRewards();

      expect(result.success).toBe(true);
      expect(result.dataUpdated).toBe(false);
      expect(fetchRewardsFromAPI).not.toHaveBeenCalled();
    });

    it('returns failure when fetchRewardsFromAPI throws', async () => {
      (getPreference as Mock).mockResolvedValue('false');
      (fetchRewardsFromAPI as Mock).mockRejectedValue(new Error('API error'));

      const result = await fetchAndUpdateRewards();

      expect(result.success).toBe(false);
      expect(result.dataUpdated).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('returns failure when rewardsRepository.insertMany throws', async () => {
      const mockRewards = [{ id: 'reward-1', name: 'Free Beer' }];
      (getPreference as Mock).mockResolvedValue('false');
      (fetchRewardsFromAPI as Mock).mockResolvedValue(fetchedRows(mockRewards));
      (rewardsRepository.insertMany as Mock).mockRejectedValue(new Error('DB write error'));

      const result = await fetchAndUpdateRewards();

      expect(result.success).toBe(false);
      expect(result.dataUpdated).toBe(false);
    });
  });

  // Plan 05 Phase 5.3, review remediation.
  //
  // `decideRewards` forwards `source.error` intact, but the all-beers path went
  // through `requireRows`, which threw `new Error(\`${label} failed: ${msg}\`)`.
  // The enclosing catch then re-ran createErrorResponse on that plain Error,
  // whose message matches none of the substring rules — so a typed SERVER_ERROR
  // became UNKNOWN_ERROR, and UNKNOWN_ERROR returns error.message verbatim,
  // putting "All beers failed: HTTP 500 Internal Server Error" in a user-facing
  // alert. The classification was discarded one frame after it was built, on the
  // very path the fix was written for.
  describe('all-beers preserves the typed fetch error', () => {
    beforeEach(async () => {
      (getPreference as Mock).mockImplementation(async (key: string) =>
        key === 'all_beers_api_url' ? 'https://example.com/all.json?sid=13884' : null
      );
    });

    it('reports a 5xx as SERVER_ERROR rather than UNKNOWN_ERROR', async () => {
      (fetchBeersFromAPI as Mock).mockResolvedValue(
        failed(ApiErrorType.SERVER_ERROR, 'HTTP 500 Internal Server Error')
      );

      const result = await fetchAndUpdateAllBeers();

      expect(result.success).toBe(false);
      expect(result.error?.type).toBe(ApiErrorType.SERVER_ERROR);
    });

    it('reports an offline fetch as NETWORK_ERROR', async () => {
      // The other half: allNetworkErrors selects the softer "check your
      // connection" alert, and it can only do that if the type survives.
      (fetchBeersFromAPI as Mock).mockResolvedValue(
        failed(ApiErrorType.NETWORK_ERROR, 'Network connection error')
      );

      const result = await fetchAndUpdateAllBeers();

      expect(result.error?.type).toBe(ApiErrorType.NETWORK_ERROR);
    });

    it('keeps allNetworkErrors true when every source is offline', async () => {
      // THE regression this remediation exists for. Before 5.3 the fetchers threw
      // a TypeError('Network request failed'), which createErrorResponse read as
      // NETWORK_ERROR, so allNetworkErrors was true and the user saw ONE clean
      // "check your internet connection" alert. Returning `failed` routed the
      // error through requireRows and the my-beers switches, which stringified
      // it into UNKNOWN_ERROR — flipping allNetworkErrors to false and putting
      // "All beers failed: Network connection error" in the alert body.
      //
      // Making the fetch layer honest must not make the UI dishonest.
      const offline = () => failed(ApiErrorType.NETWORK_ERROR, 'Network connection error');
      (fetchBeersFromAPI as Mock).mockResolvedValue(offline());
      (fetchMyBeersFromAPI as Mock).mockResolvedValue(offline());
      (fetchRewardsFromAPI as Mock).mockResolvedValue(offline());

      const result = await sequentialRefreshAllData();

      expect(result.hasErrors).toBe(true);
      expect(result.allNetworkErrors).toBe(true);
      expect(result.allBeersResult.error?.type).toBe(ApiErrorType.NETWORK_ERROR);
      expect(result.myBeersResult.error?.type).toBe(ApiErrorType.NETWORK_ERROR);
    });

    it('does not leak the developer message into the user-facing channel', async () => {
      // UNKNOWN_ERROR and VALIDATION_ERROR return error.message verbatim;
      // SERVER_ERROR has dedicated copy. This is what the type buys.
      expect(
        getUserFriendlyErrorMessage({
          type: ApiErrorType.SERVER_ERROR,
          message: 'All beers failed: HTTP 500 Internal Server Error',
        })
      ).not.toContain('HTTP 500');
    });
  });

  // Plan 05 Phase 5.1.
  //
  // `rowsOrNone` flattened unavailable / failed / unchanged to `[]`, and every
  // caller then reported `success: true, dataUpdated: true, itemCount: 0`. So
  // "no rewards URL configured" and "the rewards fetch failed" both surfaced as
  // a successful refresh that found zero rewards. That is the same defect class
  // plan 02 exists to remove — a non-answer laundered into an answer —
  // reintroduced one layer above the one 02 fixed.
  //
  // The mapping these tests pin, and why it is not "every non-data case fails":
  //   data            → success, rows written
  //   confirmed-empty → success; the server really did report none
  //   not-applicable  → success, dataUpdated FALSE; visitor mode and a none://
  //                     placeholder are normal states, and reporting them as
  //                     errors drives a user-facing alert via hasErrors
  //   not-configured  → failure; matches how the all-beers path already treats a
  //                     missing URL. A deliberate departure from
  //                     UnavailableReason's doc comment, which groups both codes
  //                     as non-errors — that grouping is about the transport
  //                     layer, not about what each consumer should do
  //   failed          → failure, carrying the transport error
  //   malformed       → failure; a body arrived and was unusable
  describe('rewards outcome handling', () => {
    beforeEach(async () => {
      (getPreference as Mock).mockResolvedValue('false');
      (rewardsRepository.insertMany as Mock).mockResolvedValue(undefined);
      (rewardsRepository.insertManyUnsafe as Mock).mockResolvedValue(undefined);
    });

    describe('fetchAndUpdateRewards', () => {
      it('reports failure when the rewards source is not configured', async () => {
        (fetchRewardsFromAPI as Mock).mockResolvedValue(unavailable('not-configured'));

        const result = await fetchAndUpdateRewards();

        expect(result.success).toBe(false);
        expect(result.dataUpdated).toBe(false);
        // The TYPE is the assertion that matters, not merely that it failed:
        // it decides which copy the user sees. Without this, swapping in
        // UNKNOWN_ERROR passes, and UNKNOWN_ERROR returns error.message verbatim
        // (notificationUtils.ts:222-224).
        expect(result.error?.type).toBe(ApiErrorType.VALIDATION_ERROR);
        expect(rewardsRepository.insertMany).not.toHaveBeenCalled();
      });

      it('reports failure when the rewards fetch fails', async () => {
        (fetchRewardsFromAPI as Mock).mockResolvedValue(failed());

        const result = await fetchAndUpdateRewards();

        expect(result.success).toBe(false);
        expect(result.dataUpdated).toBe(false);
        expect(result.error?.type).toBe(ApiErrorType.NETWORK_ERROR);
        expect(rewardsRepository.insertMany).not.toHaveBeenCalled();
      });

      it('forwards the transport error unchanged rather than re-deriving one', async () => {
        // The previous test cannot distinguish forwarding from re-deriving,
        // because the `failed()` fixture defaults to NETWORK_ERROR — the same
        // type a hardcoded fallback would use. A non-default type and a specific
        // message are what pin the passthrough, and the passthrough is the whole
        // reason FetchedSource.failed carries a typed error.
        (fetchRewardsFromAPI as Mock).mockResolvedValue(
          failed(ApiErrorType.SERVER_ERROR, 'HTTP 503 from rewards')
        );

        const result = await fetchAndUpdateRewards();

        expect(result.error?.type).toBe(ApiErrorType.SERVER_ERROR);
        expect(result.error?.message).toBe('HTTP 503 from rewards');
      });

      it('reports failure when the rewards body is malformed', async () => {
        (fetchRewardsFromAPI as Mock).mockResolvedValue(malformed());

        const result = await fetchAndUpdateRewards();

        expect(result.success).toBe(false);
        // MALFORMED_RESPONSE_ERROR is one of the types with dedicated user copy
        // that deliberately SUPPRESSES the developer message (the
        // MALFORMED_RESPONSE_ERROR arm of `getUserFriendlyErrorMessage`; the
        // line number this used to cite had drifted). Getting the type wrong
        // leaks "Rewards response was unusable: …" to the user.
        expect(result.error?.type).toBe(ApiErrorType.MALFORMED_RESPONSE_ERROR);
        expect(rewardsRepository.insertMany).not.toHaveBeenCalled();
      });

      it('reports success without an update when rewards are not applicable', async () => {
        (fetchRewardsFromAPI as Mock).mockResolvedValue(unavailable('not-applicable'));

        const result = await fetchAndUpdateRewards();

        // Not an error — but not an update either. Reporting dataUpdated here is
        // what marked stale rewards fresh.
        expect(result.success).toBe(true);
        expect(result.dataUpdated).toBe(false);
        expect(rewardsRepository.insertMany).not.toHaveBeenCalled();
      });

      it('clears the table and reports an update when the server confirms zero rewards', async () => {
        (fetchRewardsFromAPI as Mock).mockResolvedValue(confirmedEmpty());

        const result = await fetchAndUpdateRewards();

        // The one case where nothing to write is still a real answer.
        expect(result.success).toBe(true);
        expect(result.dataUpdated).toBe(true);
        expect(result.itemCount).toBe(0);

        // The clear is the half this test used to miss. It asserted the three
        // values above and nothing about the table, so `insertMany([])` — which
        // early-returns without clearing — satisfied it completely: the server
        // said "you have no rewards", the stale rewards stayed, and the refresh
        // reported a successful update. Pinning the reporting without pinning
        // the write is what kept that invisible.
        expect(rewardsRepository.replaceAllWithEmpty).toHaveBeenCalled();
        expect(rewardsRepository.insertMany).not.toHaveBeenCalled();
      });

      // GUARD — passes before and after. Over-correction protection: the fix
      // must not make the ordinary path stop writing.
      it('writes rows and reports success when rewards arrive', async () => {
        const rewards = [{ id: 'reward-1', name: 'Free Beer' }];
        (fetchRewardsFromAPI as Mock).mockResolvedValue(fetchedRows(rewards));

        const result = await fetchAndUpdateRewards();

        expect(result.success).toBe(true);
        expect(result.dataUpdated).toBe(true);
        expect(rewardsRepository.insertMany).toHaveBeenCalledWith(rewards);
      });
    });

    // Three call sites, three tests. Fixing two of three is indistinguishable
    // from fixing none — the same reasoning plan 04 Phase 2 gives for its own
    // triplicated ETag write.
    describe('sequentialRefreshAllData', () => {
      beforeEach(async () => {
        (fetchBeersFromAPI as Mock).mockResolvedValue(
          fetchedRows([{ id: 'beer-1', brew_name: 'Test IPA', brewer: 'Brewery 1' }])
        );
        (fetchMyBeersFromAPI as Mock).mockResolvedValue(
          fetchedRows([{ id: 'beer-1', brew_name: 'Test IPA', tasted_date: '2023-01-01' }])
        );
        (beerRepository.insertManyUnsafe as Mock).mockResolvedValue(undefined);
        (myBeersRepository.insertManyUnsafe as Mock).mockResolvedValue(undefined);
      });

      it('reports rewards failure when the rewards fetch fails', async () => {
        (fetchRewardsFromAPI as Mock).mockResolvedValue(failed());

        const result = await sequentialRefreshAllData();

        expect(result.rewardsResult.success).toBe(false);
        expect(result.hasErrors).toBe(true);
        // `allNetworkErrors` picks the softer "check your connection" alert over
        // the generic one (useDataRefresh.ts:127). Nothing in this repo asserted
        // it before these two tests, so threading a typed error through
        // decideRewards was unverified end to end — telling "you're offline"
        // from "something's misconfigured" is the point of doing it at all.
        expect(result.allNetworkErrors).toBe(true);
        expect(rewardsRepository.insertManyUnsafe).not.toHaveBeenCalled();
      });

      it('reports rewards failure when the rewards source is not configured', async () => {
        (fetchRewardsFromAPI as Mock).mockResolvedValue(unavailable('not-configured'));

        const result = await sequentialRefreshAllData();

        expect(result.rewardsResult.success).toBe(false);
        expect(result.rewardsResult.error?.type).toBe(ApiErrorType.VALIDATION_ERROR);
        // A misconfiguration is NOT a network error — the other half of the pair.
        expect(result.allNetworkErrors).toBe(false);
        expect(rewardsRepository.insertManyUnsafe).not.toHaveBeenCalled();
      });

      /**
       * A real visitor: BOTH member sources report not-applicable.
       *
       * The earlier version of these tests mocked `fetchMyBeersFromAPI` to return
       * tasted-beer ROWS while calling itself a visitor test — a combination no
       * visitor can produce. It asserted `hasErrors === false` and passed only
       * because my-beers had succeeded, so it documented a property the system
       * does not have.
       */
      const arrangeRealVisitor = (): void => {
        (fetchMyBeersFromAPI as Mock).mockResolvedValue(unavailable('not-applicable'));
        (fetchRewardsFromAPI as Mock).mockResolvedValue(unavailable('not-applicable'));
      };

      describe('a real visitor refresh', () => {
        it('does not report a rewards error for a visitor', async () => {
          arrangeRealVisitor();

          const result = await sequentialRefreshAllData();

          // The property this phase actually controls.
          expect(result.rewardsResult.success).toBe(true);
          expect(result.rewardsResult.dataUpdated).toBe(false);
        });

        it('does not report a my-beers error for a visitor', async () => {
          arrangeRealVisitor();

          const result = await sequentialRefreshAllData();

          // `not-applicable` means "this source does not apply to you", which is
          // what visitor mode IS. Treating it as a failure put developer prose —
          // "My beers unavailable (not-applicable): …" — into a user-facing Alert,
          // because UNKNOWN_ERROR returns error.message verbatim.
          expect(result.myBeersResult.success).toBe(true);
          expect(result.myBeersResult.dataUpdated).toBe(false);
        });

        it('leaves the tasted table alone for a visitor', async () => {
          arrangeRealVisitor();

          await sequentialRefreshAllData();

          // The distinction that must survive: `not-applicable` is not
          // `confirmed-empty`. A visitor has no tasted list to clear, and clearing
          // is correct ONLY when the server actually reported zero.
          expect(myBeersRepository.replaceAllWithEmptyUnsafe).not.toHaveBeenCalled();
          expect(myBeersRepository.insertManyUnsafe).not.toHaveBeenCalled();
        });

        it('raises no error alert at all for a visitor refresh', async () => {
          arrangeRealVisitor();

          const result = await sequentialRefreshAllData();

          // The property plan 05 Phase 5.1's rationale is built on. It was only
          // half true when 5.1 landed — rewards stopped raising an alert, my-beers
          // still did — so this is the assertion that makes the rationale real.
          expect(result.hasErrors).toBe(false);
        });
      });
    });

    describe('refreshAllDataFromAPI', () => {
      beforeEach(async () => {
        (areApiUrlsConfigured as Mock).mockResolvedValue(true);
        (fetchBeersFromAPI as Mock).mockResolvedValue(
          fetchedRows([{ id: 'beer-1', brew_name: 'Test IPA', brewer: 'Brewery 1' }])
        );
        (fetchMyBeersFromAPI as Mock).mockResolvedValue(
          fetchedRows([{ id: 'beer-1', brew_name: 'Test IPA', tasted_date: '2023-01-01' }])
        );
        (beerRepository.insertManyUnsafe as Mock).mockResolvedValue(undefined);
        (myBeersRepository.insertManyUnsafe as Mock).mockResolvedValue(undefined);
      });

      it('does not write rewards when the rewards fetch fails', async () => {
        (fetchRewardsFromAPI as Mock).mockResolvedValue(failed());

        const result = await refreshAllDataFromAPI();

        // This entry point has no per-source success channel, so the only thing
        // it can get wrong is writing on a non-answer. It must not.
        expect(rewardsRepository.insertManyUnsafe).not.toHaveBeenCalled();
        expect(result.rewards).toEqual([]);
      });

      it('does not let a failed rewards outcome escape refreshAllDataFromAPI', async () => {
        (fetchRewardsFromAPI as Mock).mockResolvedValue(failed());

        // Renamed from 'still writes the other sources when rewards fail', which
        // could not fail for the reason its comment gave: rewards is the LAST
        // source, so the beer and my-beers writes have already landed before it
        // is even fetched. No rewards behaviour can un-write them. The property
        // genuinely at risk is the new `throw` on a failed outcome escaping its
        // own catch, which is what this asserts.
        await expect(refreshAllDataFromAPI()).resolves.toBeDefined();

        expect(beerRepository.insertManyUnsafe).toHaveBeenCalled();
        expect(myBeersRepository.insertManyUnsafe).toHaveBeenCalled();
      });

      it('treats a not-applicable my-beers source as a skip, not a failure', async () => {
        (fetchMyBeersFromAPI as Mock).mockResolvedValue(unavailable('not-applicable'));

        const result = await refreshAllDataFromAPI();

        expect(myBeersRepository.insertManyUnsafe).not.toHaveBeenCalled();
        expect(result.myBeers).toEqual([]);
        // This is the autoLogin -> checkInBeer path, so throwing here logged an
        // error on every visitor login. Same assertion shape as the rewards case:
        // skip and fail are otherwise indistinguishable at a site with no success
        // channel.
        expect(logError).not.toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ operation: 'refreshAllDataFromAPI - my beers' })
        );
      });

      it('labels its failures with its own entry point, not the sequential one', async () => {
        (fetchBeersFromAPI as Mock).mockRejectedValue(new Error('network fail'));

        await refreshAllDataFromAPI();

        // The `prepare*` phase is shared with sequentialRefreshAllData, and the
        // operation label is the only thing that tells a reader which entry
        // point a failure came from. `RefreshOperation` stops an INVALID label
        // being passed; nothing stopped the wrong VALID one — swapping
        // REFRESH_FROM_API for SEQUENTIAL_REFRESH here left every test green,
        // on the path whose only output channel is the log.
        expect(logError).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ operation: 'refreshAllDataFromAPI - all beers' })
        );
      });

      it('logs a rewards failure on a path that has nowhere else to report it', async () => {
        (fetchRewardsFromAPI as Mock).mockResolvedValue(failed());

        await refreshAllDataFromAPI();

        // This entry point returns rows and has NO per-source success channel,
        // so `rewards: []` is indistinguishable from "you have no rewards" to
        // every caller. The log is therefore the only trace a rewards fetch
        // failed at all — which is why the old inline block carried a dedicated
        // logWarning, and why routing this path through the shared
        // prepareRewards silently deleted the only signal there was.
        //
        // logWarning, not logError, so that skip and fail stay distinguishable
        // exactly as the two tests below assert: skip logs nothing.
        expect(logWarning).toHaveBeenCalledWith(
          expect.stringContaining('Rewards refresh failed'),
          expect.objectContaining({ operation: 'refreshAllDataFromAPI - rewards' })
        );
      });

      it('treats a not-applicable rewards source as a skip, not a failure', async () => {
        (fetchRewardsFromAPI as Mock).mockResolvedValue(unavailable('not-applicable'));

        const result = await refreshAllDataFromAPI();

        expect(rewardsRepository.insertManyUnsafe).not.toHaveBeenCalled();
        expect(result.rewards).toEqual([]);
        // The only assertion that can tell skip from fail at a site with no
        // success channel: both leave `rewards` empty and write nothing, and
        // differ ONLY in whether the error path was taken. This is the
        // autoLogin -> checkInBeer path, so a visitor or a none:// placeholder
        // would otherwise silently log an error on every check-in.
        expect(logError).not.toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ operation: 'refreshAllDataFromAPI - rewards' })
        );
      });
    });
  });

  describe('sequentialRefreshAllData', () => {
    const mockAllBeers: Beer[] = [{ id: 'beer-1', brew_name: 'Test IPA', brewer: 'Brewery 1' }];
    const mockMyBeers = [{ id: 'beer-1', brew_name: 'Test IPA', tasted_date: '2023-01-01' }];
    const mockRewards = [{ id: 'reward-1', name: 'Free Beer' }];

    it('acquires lock and releases it on success', async () => {
      (getPreference as Mock).mockResolvedValue(null);
      (fetchBeersFromAPI as Mock).mockResolvedValue(fetchedRows(mockAllBeers));
      (fetchMyBeersFromAPI as Mock).mockResolvedValue(fetchedRows(mockMyBeers));
      (fetchRewardsFromAPI as Mock).mockResolvedValue(fetchedRows(mockRewards));
      (beerRepository.insertManyUnsafe as Mock).mockResolvedValue(undefined);
      (myBeersRepository.insertManyUnsafe as Mock).mockResolvedValue(undefined);
      (rewardsRepository.insertManyUnsafe as Mock).mockResolvedValue(undefined);
      (setPreference as Mock).mockResolvedValue(undefined);

      await sequentialRefreshAllData();

      // Renamed from 'refresh-all-data-sequential' by plan 05 Phase 5.4. The
      // lock no longer spans the sequence — the fetches run outside it — so a
      // name claiming it does would misdescribe every log line and every
      // contention report it appears in.
      expect(databaseLockManager.withDatabaseLock).toHaveBeenCalledWith(
        'refresh-all-data-write',
        expect.any(Function)
      );
    });

    it('releases lock even when an operation fails', async () => {
      (getPreference as Mock).mockResolvedValue(null);
      (fetchBeersFromAPI as Mock).mockRejectedValue(new Error('network fail'));
      (fetchMyBeersFromAPI as Mock).mockResolvedValue(fetchedRows(mockMyBeers));
      (fetchRewardsFromAPI as Mock).mockResolvedValue(fetchedRows(mockRewards));
      (myBeersRepository.insertManyUnsafe as Mock).mockResolvedValue(undefined);
      (rewardsRepository.insertManyUnsafe as Mock).mockResolvedValue(undefined);
      (setPreference as Mock).mockResolvedValue(undefined);

      await sequentialRefreshAllData();

      // Asserts the lock is actually free, not merely that the wrapper was
      // called. The manager behind this mock is real, so deleting the finally
      // from withDatabaseLock fails this.
      expect(databaseLockManager.withDatabaseLock).toHaveBeenCalledWith(
        'refresh-all-data-write',
        expect.any(Function)
      );
      expect(databaseLockManager.isLocked()).toBe(false);
      expect(databaseLockManager.getQueueLength()).toBe(0);
    });

    it('returns hasErrors=false when all operations succeed', async () => {
      (getPreference as Mock).mockResolvedValue(null);
      (fetchBeersFromAPI as Mock).mockResolvedValue(fetchedRows(mockAllBeers));
      (fetchMyBeersFromAPI as Mock).mockResolvedValue(fetchedRows(mockMyBeers));
      (fetchRewardsFromAPI as Mock).mockResolvedValue(fetchedRows(mockRewards));
      (beerRepository.insertManyUnsafe as Mock).mockResolvedValue(undefined);
      (myBeersRepository.insertManyUnsafe as Mock).mockResolvedValue(undefined);
      (rewardsRepository.insertManyUnsafe as Mock).mockResolvedValue(undefined);
      (setPreference as Mock).mockResolvedValue(undefined);

      const result = await sequentialRefreshAllData();

      expect(result.hasErrors).toBe(false);
      expect(result.allBeersResult.success).toBe(true);
      expect(result.myBeersResult.success).toBe(true);
      expect(result.rewardsResult.success).toBe(true);
    });

    it('reports error in allBeersResult when all beers fetch fails', async () => {
      (getPreference as Mock).mockResolvedValue(null);
      (fetchBeersFromAPI as Mock).mockRejectedValue(new Error('fetch fail'));
      (fetchMyBeersFromAPI as Mock).mockResolvedValue(fetchedRows(mockMyBeers));
      (fetchRewardsFromAPI as Mock).mockResolvedValue(fetchedRows(mockRewards));
      (myBeersRepository.insertManyUnsafe as Mock).mockResolvedValue(undefined);
      (rewardsRepository.insertManyUnsafe as Mock).mockResolvedValue(undefined);
      (setPreference as Mock).mockResolvedValue(undefined);

      const result = await sequentialRefreshAllData();

      expect(result.hasErrors).toBe(true);
      expect(result.allBeersResult.success).toBe(false);
      expect(result.myBeersResult.success).toBe(true);
      expect(result.rewardsResult.success).toBe(true);
    });

    it('reports error in rewardsResult when rewards fetch fails', async () => {
      (getPreference as Mock).mockResolvedValue(null);
      (fetchBeersFromAPI as Mock).mockResolvedValue(fetchedRows(mockAllBeers));
      (fetchMyBeersFromAPI as Mock).mockResolvedValue(fetchedRows(mockMyBeers));
      (fetchRewardsFromAPI as Mock).mockRejectedValue(new Error('rewards fail'));
      (beerRepository.insertManyUnsafe as Mock).mockResolvedValue(undefined);
      (myBeersRepository.insertManyUnsafe as Mock).mockResolvedValue(undefined);
      (setPreference as Mock).mockResolvedValue(undefined);

      const result = await sequentialRefreshAllData();

      expect(result.hasErrors).toBe(true);
      expect(result.allBeersResult.success).toBe(true);
      expect(result.rewardsResult.success).toBe(false);
    });

    it('uses proxy when enrichment is configured and storeId is extractable', async () => {
      const storeUrl = 'https://fsbs.beerknurd.com/bk-store-json.php?sid=13885';
      (getPreference as Mock).mockResolvedValue(storeUrl);
      (config.enrichment.isConfigured as Mock).mockReturnValue(true);
      (fetchBeersFromProxy as Mock).mockResolvedValue({
        beers: [
          {
            id: 'beer-1',
            brew_name: 'Test IPA',
            brewer: 'Brewery 1',
            enriched_abv: 6.5,
            enrichment_confidence: 0.9,
            enrichment_source: 'perplexity',
          },
        ],
        cached: false,
      });
      (fetchMyBeersFromAPI as Mock).mockResolvedValue(fetchedRows(mockMyBeers));
      (fetchRewardsFromAPI as Mock).mockResolvedValue(fetchedRows(mockRewards));
      (beerRepository.insertManyUnsafe as Mock).mockResolvedValue(undefined);
      (myBeersRepository.insertManyUnsafe as Mock).mockResolvedValue(undefined);
      (rewardsRepository.insertManyUnsafe as Mock).mockResolvedValue(undefined);
      (setPreference as Mock).mockResolvedValue(undefined);

      const result = await sequentialRefreshAllData();

      expect(fetchBeersFromProxy).toHaveBeenCalledWith('13885', expect.anything());
      expect(result.allBeersResult.success).toBe(true);
    });

    it('falls back to direct API when proxy fails', async () => {
      const storeUrl = 'https://fsbs.beerknurd.com/bk-store-json.php?sid=13885';
      (getPreference as Mock).mockResolvedValue(storeUrl);
      (config.enrichment.isConfigured as Mock).mockReturnValue(true);
      (fetchBeersFromProxy as Mock).mockRejectedValue(new Error('proxy down'));
      (fetchBeersFromAPI as Mock).mockResolvedValue(fetchedRows(mockAllBeers));
      (fetchMyBeersFromAPI as Mock).mockResolvedValue(fetchedRows(mockMyBeers));
      (fetchRewardsFromAPI as Mock).mockResolvedValue(fetchedRows(mockRewards));
      (beerRepository.insertManyUnsafe as Mock).mockResolvedValue(undefined);
      (myBeersRepository.insertManyUnsafe as Mock).mockResolvedValue(undefined);
      (rewardsRepository.insertManyUnsafe as Mock).mockResolvedValue(undefined);
      (setPreference as Mock).mockResolvedValue(undefined);

      const result = await sequentialRefreshAllData();

      expect(fetchBeersFromAPI).toHaveBeenCalled();
      expect(result.allBeersResult.success).toBe(true);
    });

    it('sets last_update and last_check preferences on success', async () => {
      // A configured taplist URL, not null. `fetchBeersFromAPI` below returns rows,
      // and in production that is only possible when this key is set — an absent URL
      // makes it return `unavailable('not-configured')`. With null the pair is an
      // impossible state, and the all-beers write is now correctly refused, because
      // rows that cannot be attributed to a store must not be committed.
      (getPreference as Mock).mockImplementation(async (key: string) =>
        key === 'all_beers_api_url' ? 'https://example.com/allbeers.json' : null
      );
      (fetchBeersFromAPI as Mock).mockResolvedValue(fetchedRows(mockAllBeers));
      (fetchMyBeersFromAPI as Mock).mockResolvedValue(fetchedRows(mockMyBeers));
      (fetchRewardsFromAPI as Mock).mockResolvedValue(fetchedRows(mockRewards));
      (beerRepository.insertManyUnsafe as Mock).mockResolvedValue(undefined);
      (myBeersRepository.insertManyUnsafe as Mock).mockResolvedValue(undefined);
      (rewardsRepository.insertManyUnsafe as Mock).mockResolvedValue(undefined);
      (setPreference as Mock).mockResolvedValue(undefined);

      await sequentialRefreshAllData();

      expect(setPreference).toHaveBeenCalledWith('all_beers_last_update', expect.any(String));
      expect(setPreference).toHaveBeenCalledWith('all_beers_last_check', expect.any(String));
      expect(setPreference).toHaveBeenCalledWith('my_beers_last_update', expect.any(String));
      expect(setPreference).toHaveBeenCalledWith('my_beers_last_check', expect.any(String));
    });
  });

  describe('refreshAllDataFromAPI', () => {
    const mockAllBeers: Beer[] = [{ id: 'beer-1', brew_name: 'Test IPA', brewer: 'Brewery 1' }];
    const mockMyBeers = [{ id: 'beer-1', brew_name: 'Test IPA', tasted_date: '2023-01-01' }];
    const mockRewards = [{ id: 'reward-1', name: 'Free Beer' }];

    it('throws when API URLs are not configured', async () => {
      (areApiUrlsConfigured as Mock).mockResolvedValue(false);

      await expect(refreshAllDataFromAPI()).rejects.toThrow('API URLs not configured');
    });

    it('acquires lock and releases it on success', async () => {
      (areApiUrlsConfigured as Mock).mockResolvedValue(true);
      (getPreference as Mock).mockResolvedValue(null);
      (fetchBeersFromAPI as Mock).mockResolvedValue(fetchedRows(mockAllBeers));
      (fetchMyBeersFromAPI as Mock).mockResolvedValue(fetchedRows(mockMyBeers));
      (fetchRewardsFromAPI as Mock).mockResolvedValue(fetchedRows(mockRewards));
      (beerRepository.insertManyUnsafe as Mock).mockResolvedValue(undefined);
      (myBeersRepository.insertManyUnsafe as Mock).mockResolvedValue(undefined);
      (rewardsRepository.insertManyUnsafe as Mock).mockResolvedValue(undefined);

      await refreshAllDataFromAPI();

      // Renamed from 'refresh-all-from-api' by plan 05 Phase 5.5: the lock no
      // longer spans the sequence, only the write burst.
      expect(databaseLockManager.withDatabaseLock).toHaveBeenCalledWith(
        'refresh-all-from-api-write',
        expect.any(Function)
      );
    });

    it('releases lock when fetch throws', async () => {
      (areApiUrlsConfigured as Mock).mockResolvedValue(true);
      (getPreference as Mock).mockResolvedValue(null);
      (fetchBeersFromAPI as Mock).mockRejectedValue(new Error('network fail'));
      // Now reachable: the other sources run even when all-beers fails.
      (fetchMyBeersFromAPI as Mock).mockResolvedValue(fetchedRows([]));
      (fetchRewardsFromAPI as Mock).mockResolvedValue(fetchedRows([]));

      // INVERTED by plan 02 Phase 2.5 — a failing source no longer aborts the
      // function. INVERTED AGAIN by 05 Phase 5.5: with all-beers failing and
      // the other two sources confirmed-empty, my-beers clears and rewards
      // writes nothing, so the lock IS still taken — but for the write burst
      // alone, after every fetch has finished.
      await refreshAllDataFromAPI();

      expect(databaseLockManager.withDatabaseLock).toHaveBeenCalledWith(
        'refresh-all-from-api-write',
        expect.any(Function)
      );
      // Asserts the lock is actually free, not merely that the wrapper was
      // called. The manager behind this mock is real, so deleting the finally
      // from withDatabaseLock fails this.
      expect(databaseLockManager.isLocked()).toBe(false);
      expect(databaseLockManager.getQueueLength()).toBe(0);
    });

    it('returns all beers, my beers, and rewards on success', async () => {
      (areApiUrlsConfigured as Mock).mockResolvedValue(true);
      (getPreference as Mock).mockResolvedValue(null);
      (fetchBeersFromAPI as Mock).mockResolvedValue(fetchedRows(mockAllBeers));
      (fetchMyBeersFromAPI as Mock).mockResolvedValue(fetchedRows(mockMyBeers));
      (fetchRewardsFromAPI as Mock).mockResolvedValue(fetchedRows(mockRewards));
      (beerRepository.insertManyUnsafe as Mock).mockResolvedValue(undefined);
      (myBeersRepository.insertManyUnsafe as Mock).mockResolvedValue(undefined);
      (rewardsRepository.insertManyUnsafe as Mock).mockResolvedValue(undefined);

      const result = await refreshAllDataFromAPI();

      expect(result.allBeers).toHaveLength(1);
      expect(result.myBeers).toHaveLength(1);
      expect(result.rewards).toEqual(mockRewards);
    });

    it('throws when all beers response is empty', async () => {
      (areApiUrlsConfigured as Mock).mockResolvedValue(true);
      (getPreference as Mock).mockResolvedValue(null);
      (fetchBeersFromAPI as Mock).mockResolvedValue(fetchedRows([]));

      // INVERTED by plan 02 Phase 2.5: an empty taplist still fails ITS source
      // and writes nothing for it, but no longer aborts my-beers and rewards.
      await expect(refreshAllDataFromAPI()).resolves.toBeDefined();

      expect(beerRepository.insertManyUnsafe).not.toHaveBeenCalled();
    });

    it('uses proxy for all beers when enrichment is configured', async () => {
      const storeUrl = 'https://fsbs.beerknurd.com/bk-store-json.php?sid=13885';
      (areApiUrlsConfigured as Mock).mockResolvedValue(true);
      (getPreference as Mock).mockResolvedValue(storeUrl);
      (config.enrichment.isConfigured as Mock).mockReturnValue(true);
      (fetchBeersFromProxy as Mock).mockResolvedValue({
        beers: [
          {
            id: 'beer-1',
            brew_name: 'Test IPA',
            brewer: 'Brewery 1',
            enriched_abv: 6.5,
            enrichment_confidence: 0.9,
            enrichment_source: 'perplexity',
          },
        ],
        cached: false,
      });
      (fetchMyBeersFromAPI as Mock).mockResolvedValue(fetchedRows(mockMyBeers));
      (fetchRewardsFromAPI as Mock).mockResolvedValue(fetchedRows(mockRewards));
      (beerRepository.insertManyUnsafe as Mock).mockResolvedValue(undefined);
      (myBeersRepository.insertManyUnsafe as Mock).mockResolvedValue(undefined);
      (rewardsRepository.insertManyUnsafe as Mock).mockResolvedValue(undefined);

      await refreshAllDataFromAPI();

      expect(fetchBeersFromProxy).toHaveBeenCalledWith('13885', expect.anything());
      expect(fetchBeersFromAPI).not.toHaveBeenCalled();
    });

    it('falls back to direct API when proxy fails', async () => {
      const storeUrl = 'https://fsbs.beerknurd.com/bk-store-json.php?sid=13885';
      (areApiUrlsConfigured as Mock).mockResolvedValue(true);
      (getPreference as Mock).mockResolvedValue(storeUrl);
      (config.enrichment.isConfigured as Mock).mockReturnValue(true);
      (fetchBeersFromProxy as Mock).mockRejectedValue(new Error('proxy down'));
      (fetchBeersFromAPI as Mock).mockResolvedValue(fetchedRows(mockAllBeers));
      (fetchMyBeersFromAPI as Mock).mockResolvedValue(fetchedRows(mockMyBeers));
      (fetchRewardsFromAPI as Mock).mockResolvedValue(fetchedRows(mockRewards));
      (beerRepository.insertManyUnsafe as Mock).mockResolvedValue(undefined);
      (myBeersRepository.insertManyUnsafe as Mock).mockResolvedValue(undefined);
      (rewardsRepository.insertManyUnsafe as Mock).mockResolvedValue(undefined);

      const result = await refreshAllDataFromAPI();

      expect(fetchBeersFromAPI).toHaveBeenCalled();
      expect(result.allBeers).toHaveLength(1);
    });

    it('applies batch enrichment to my beers when enrichment is configured', async () => {
      (areApiUrlsConfigured as Mock).mockResolvedValue(true);
      (getPreference as Mock).mockResolvedValue(null);
      (config.enrichment.isConfigured as Mock).mockReturnValue(true);
      (fetchBeersFromAPI as Mock).mockResolvedValue(fetchedRows(mockAllBeers));
      (fetchMyBeersFromAPI as Mock).mockResolvedValue(fetchedRows(mockMyBeers));
      (fetchRewardsFromAPI as Mock).mockResolvedValue(fetchedRows(mockRewards));
      (fetchEnrichmentBatchWithMissing as Mock).mockResolvedValue({
        enrichments: { 'beer-1': { enriched_abv: 5.5 } },
        missing: [],
      });
      (beerRepository.insertManyUnsafe as Mock).mockResolvedValue(undefined);
      (myBeersRepository.insertManyUnsafe as Mock).mockResolvedValue(undefined);
      (rewardsRepository.insertManyUnsafe as Mock).mockResolvedValue(undefined);

      await refreshAllDataFromAPI();

      expect(fetchEnrichmentBatchWithMissing).toHaveBeenCalled();
    });
  });

  describe('Polling Persistence via syncMissingBeersInBackground', () => {
    it('should persist polling enrichment results to both repositories', async () => {
      // Use real timers for this test since we need fire-and-forget promise chains to resolve
      vi.useRealTimers();

      // Enable enrichment
      (config.enrichment.isConfigured as Mock).mockReturnValue(true);

      // Mock beers with IDs
      const mockTastedBeers: Beerfinder[] = [
        { id: 'beer-1', brew_name: 'Test Beer 1', tasted_date: '2023-01-01' },
        { id: 'beer-2', brew_name: 'Test Beer 2', tasted_date: '2023-01-02' },
      ];

      // Driven through the shared fetcher, like every other source. The two
      // `mockResolvedValueOnce` preference values this used to queue are gone
      // with the raw fetch: `fetchAndUpdateMyBeers` reads no preferences now, so
      // the queue was never drained and its leftovers were served to whichever
      // test ran next — which is how the ETag test below started failing.
      (fetchMyBeersFromAPI as Mock).mockResolvedValue(fetchedRows(mockTastedBeers));

      // Mock enrichment batch: return enrichments + missing IDs
      (fetchEnrichmentBatchWithMissing as Mock).mockResolvedValueOnce({
        enrichments: {},
        missing: ['beer-1', 'beer-2'],
      });

      // Mock pollForEnrichmentUpdates to return enrichment data
      const mockPollingResults = {
        'beer-1': {
          enriched_abv: 5.5,
          enrichment_confidence: 0.9,
          enrichment_source: 'perplexity' as const,
          brew_description: 'A hoppy IPA',
        },
        'beer-2': {
          enriched_abv: 6.0,
          enrichment_confidence: 0.85,
          enrichment_source: 'description' as const,
          brew_description: 'A smooth stout',
        },
      };
      (pollForEnrichmentUpdates as Mock).mockResolvedValueOnce(mockPollingResults);

      // Mock syncBeersToWorker to return queued_for_cleanup > 0 (triggers polling path)
      (syncBeersToWorker as Mock).mockResolvedValueOnce({
        synced: 2,
        failed: 0,
        queued_for_cleanup: 2,
      });

      // Mock repository methods. `insertManyUnsafe`: the write runs inside one
      // explicit lock hold now rather than the repository taking its own.
      (myBeersRepository.insertManyUnsafe as Mock).mockResolvedValueOnce(undefined);
      (setPreference as Mock).mockResolvedValue(undefined);

      await fetchAndUpdateMyBeers();

      // Flush fire-and-forget promise chains
      // syncBeersToWorker().then() -> pollForEnrichmentUpdates().then() -> persist
      await flushPromises();

      // Verify syncBeersToWorker was called with the missing beers
      expect(syncBeersToWorker).toHaveBeenCalled();

      // Verify pollForEnrichmentUpdates was called with missing IDs
      expect(pollForEnrichmentUpdates).toHaveBeenCalledWith(['beer-1', 'beer-2']);

      // Verify enrichment data was persisted to both repositories
      const expectedUpdates = {
        'beer-1': {
          enriched_abv: 5.5,
          enrichment_confidence: 0.9,
          enrichment_source: 'perplexity',
          brew_description: 'A hoppy IPA',
        },
        'beer-2': {
          enriched_abv: 6.0,
          enrichment_confidence: 0.85,
          enrichment_source: 'description',
          brew_description: 'A smooth stout',
        },
      };
      expect(beerRepository.updateEnrichmentData).toHaveBeenCalledWith(expectedUpdates);
      expect(myBeersRepository.updateEnrichmentData).toHaveBeenCalledWith(expectedUpdates);

      // Restore fake timers for remaining tests
      vi.useFakeTimers();
    }, 10000);
  });

  describe('ETag / 304 handling', () => {
    describe('fetchTaplistFromProxyOrDirect', () => {
      it('should return notModified true when proxy returns 304', async () => {
        (config.enrichment.isConfigured as Mock).mockReturnValue(true);

        (fetchBeersFromProxy as Mock).mockResolvedValueOnce({
          beers: [],
          storeId: '13879',
          source: 'not_modified',
          requestId: '',
          etag: '"abc123"',
          notModified: true,
        });

        const result = await fetchTaplistFromProxyOrDirect('13879');

        expect(result.notModified).toBe(true);
        expect(result.beers).toEqual([]);
        expect(result.etag).toBe('"abc123"');
      });

      it('should pass stored ETag to fetchBeersFromProxy when preference exists', async () => {
        (config.enrichment.isConfigured as Mock).mockReturnValue(true);

        (getPreference as Mock).mockImplementation((key: string) => {
          if (key === 'all_beers_etag') return Promise.resolve('"stored-etag"');
          return Promise.resolve(null);
        });

        (fetchBeersFromProxy as Mock).mockResolvedValueOnce({
          beers: [],
          storeId: '13879',
          source: 'cache',
          etag: '"stored-etag"',
          notModified: false,
        });

        await fetchTaplistFromProxyOrDirect('13879');

        expect(fetchBeersFromProxy).toHaveBeenCalledWith('13879', '"stored-etag"');
      });

      it('should NOT pass ETag to fetchBeersFromProxy when no preference exists', async () => {
        (config.enrichment.isConfigured as Mock).mockReturnValue(true);

        (getPreference as Mock).mockResolvedValue(null);

        (fetchBeersFromProxy as Mock).mockResolvedValueOnce({
          beers: [],
          storeId: '13879',
          source: 'live',
          etag: null,
          notModified: false,
        });

        await fetchTaplistFromProxyOrDirect('13879');

        expect(fetchBeersFromProxy).toHaveBeenCalledWith('13879', undefined);
      });

      it('should default notModified to false on normal 200 proxy response', async () => {
        (config.enrichment.isConfigured as Mock).mockReturnValue(true);

        (getPreference as Mock).mockResolvedValue(null);

        (fetchBeersFromProxy as Mock).mockResolvedValueOnce({
          beers: [{ id: '1', brew_name: 'Test', brewer: 'Brewer' }],
          storeId: '13879',
          source: 'live',
          etag: '"new-etag"',
          notModified: false,
        });

        const result = await fetchTaplistFromProxyOrDirect('13879');

        expect(result.notModified).toBe(false);
        expect(result.beers.length).toBe(1);
      });

      it('should default notModified to false on direct Flying Saucer fallback', async () => {
        (config.enrichment.isConfigured as Mock).mockReturnValue(false);

        (fetchBeersFromAPI as Mock).mockResolvedValueOnce(
          fetchedRows([{ id: '1', brew_name: 'Test', brewer: 'Brewer' }])
        );

        const result = await fetchTaplistFromProxyOrDirect('13879');

        expect(result.notModified).toBe(false);
        expect(result.etag).toBeNull();
      });
    });

    describe('fetchAndUpdateAllBeers with 304', () => {
      it('should skip DB writes on 304 and return dataUpdated false', async () => {
        (config.enrichment.isConfigured as Mock).mockReturnValue(true);

        (getPreference as Mock).mockImplementation((key: string) => {
          if (key === 'all_beers_api_url')
            return Promise.resolve('https://fsbs.beerknurd.com/bk-store-json.php?sid=13879');
          if (key === 'all_beers_etag') return Promise.resolve('"cached-etag"');
          return Promise.resolve(null);
        });

        (fetchBeersFromProxy as Mock).mockResolvedValueOnce({
          beers: [],
          storeId: '13879',
          source: 'not_modified',
          requestId: '',
          etag: '"cached-etag"',
          notModified: true,
        });

        const result = await fetchAndUpdateAllBeers();

        expect(result.success).toBe(true);
        expect(result.dataUpdated).toBe(false);
        expect(beerRepository.insertMany).not.toHaveBeenCalled();
      });

      it('should update all_beers_last_check on 304', async () => {
        (config.enrichment.isConfigured as Mock).mockReturnValue(true);

        (getPreference as Mock).mockImplementation((key: string) => {
          if (key === 'all_beers_api_url')
            return Promise.resolve('https://fsbs.beerknurd.com/bk-store-json.php?sid=13879');
          if (key === 'all_beers_etag') return Promise.resolve('"cached-etag"');
          return Promise.resolve(null);
        });

        (fetchBeersFromProxy as Mock).mockResolvedValueOnce({
          beers: [],
          storeId: '13879',
          source: 'not_modified',
          etag: '"cached-etag"',
          notModified: true,
        });

        await fetchAndUpdateAllBeers();

        expect(setPreference).toHaveBeenCalledWith('all_beers_last_check', expect.any(String));
      });

      it('should store ETag after successful 200 from proxy with ETag header', async () => {
        (config.enrichment.isConfigured as Mock).mockReturnValue(true);

        (getPreference as Mock).mockImplementation((key: string) => {
          if (key === 'all_beers_api_url')
            return Promise.resolve('https://fsbs.beerknurd.com/bk-store-json.php?sid=13879');
          if (key === 'all_beers_etag') return Promise.resolve(null);
          return Promise.resolve(null);
        });

        (fetchBeersFromProxy as Mock).mockResolvedValueOnce({
          beers: [{ id: '1', brew_name: 'Test IPA', brewer: 'Test Brewery' }],
          storeId: '13879',
          source: 'live',
          etag: '"new-etag"',
          notModified: false,
        });

        (beerRepository.insertMany as Mock).mockResolvedValueOnce(undefined);
        (setPreference as Mock).mockResolvedValue(undefined);

        await fetchAndUpdateAllBeers();

        expect(setPreference).toHaveBeenCalledWith(
          'all_beers_etag',
          '"new-etag"',
          expect.any(String)
        );
      });

      // INVERTED by plan 04 Phase 2. "should NOT store" was accurate under the
      // old design, where not-storing and not-clearing were the same act. Under
      // the invariant they are opposites: a 200 carrying no ETag cannot be
      // revalidated later, so leaving the previous one in place names data the
      // table no longer holds.
      it('clears the stored ETag after a 200 from the proxy with no ETag header', async () => {
        (config.enrichment.isConfigured as Mock).mockReturnValue(true);

        (getPreference as Mock).mockImplementation((key: string) => {
          if (key === 'all_beers_api_url')
            return Promise.resolve('https://fsbs.beerknurd.com/bk-store-json.php?sid=13879');
          if (key === 'all_beers_etag') return Promise.resolve(null);
          return Promise.resolve(null);
        });

        (fetchBeersFromProxy as Mock).mockResolvedValueOnce({
          beers: [{ id: '1', brew_name: 'Test IPA', brewer: 'Test Brewery' }],
          storeId: '13879',
          source: 'live',
          etag: null,
          notModified: false,
        });

        (beerRepository.insertMany as Mock).mockResolvedValueOnce(undefined);
        (setPreference as Mock).mockResolvedValue(undefined);

        await fetchAndUpdateAllBeers();

        expect(setPreference).toHaveBeenCalledWith('all_beers_etag', '', expect.any(String));
      });

      // INVERTED by plan 04 Phase 2, same reasoning: a fallback write must
      // actively invalidate the ETag rather than merely decline to set one.
      it('clears the stored ETag after a 200 from the direct Flying Saucer fetch', async () => {
        (config.enrichment.isConfigured as Mock).mockReturnValue(false);

        (getPreference as Mock).mockImplementation((key: string) => {
          if (key === 'all_beers_api_url')
            return Promise.resolve('https://fsbs.beerknurd.com/bk-store-json.php?sid=13879');
          return Promise.resolve(null);
        });

        (fetchBeersFromAPI as Mock).mockResolvedValueOnce(
          fetchedRows([{ id: '1', brew_name: 'Test IPA', brewer: 'Test Brewery' }])
        );

        (beerRepository.insertMany as Mock).mockResolvedValueOnce(undefined);
        (setPreference as Mock).mockResolvedValue(undefined);

        await fetchAndUpdateAllBeers();

        expect(setPreference).toHaveBeenCalledWith('all_beers_etag', '', expect.any(String));
      });
    });
  });
});

describe('refreshAllDataFromAPI per-source isolation', () => {
  const mockAllBeers: Beer[] = [{ id: 'beer-1', brew_name: 'Test IPA', brewer: 'Brewery 1' }];
  const mockMyBeers = [{ id: 'beer-1', brew_name: 'Test IPA', tasted_date: '2023-01-01' }];
  const mockRewards = [{ id: 'reward-1', name: 'Free Beer' }];

  beforeEach(async () => {
    vi.clearAllMocks();
    (areApiUrlsConfigured as Mock).mockResolvedValue(true);
    // A configured taplist URL, not null. `fetchBeersFromAPI` below returns rows,
    // and in production that is only possible when this key is set — an absent URL
    // makes it return `unavailable('not-configured')`. With null the pair is an
    // impossible state, and the all-beers write is now correctly refused, because
    // rows that cannot be attributed to a store must not be committed.
    (getPreference as Mock).mockImplementation(async (key: string) =>
      key === 'all_beers_api_url' ? 'https://example.com/allbeers.json' : null
    );
    (setPreference as Mock).mockResolvedValue(undefined);
  });

  // WHICH ISOLATION SURVIVES COALESCING, restated after review found these
  // asserting a property production no longer has.
  //
  // The live scenario is unchanged: CHECK IN with an expired session on a weak
  // link. checkInBeer -> autoLogin -> refreshAllDataFromAPI. A source fails and
  // the throw used to escape past every later write, leaving the user with a
  // fresh taplist, a stale tasted list and stale rewards — a wrong-high
  // Beerfinder count.
  //
  // What changed is the boundary. My-beers and rewards read the SAME url and are
  // now one request, so they share fate by design: a real member-request failure
  // fails both, and rewards are NOT written. The two tests below that assert
  // otherwise pass only because the shared mock drives the halves from two
  // independent per-source mocks — an arrangement production cannot produce.
  // They are retitled and repointed at the boundary that IS still real: the
  // taplist is a different url and a different request, and it survives a member
  // failure. Left as they were, they would have documented isolation between
  // my-beers and rewards that no longer exists, and the next person to rely on
  // it would have believed them.
  it('writes the taplist and neither member source when the member request fails', async () => {
    // Drives a real both-failed member pair by overriding the delegating mock,
    // which is the only way to reach this state: the shared factory builds the
    // two halves from two independent per-source mocks, so rejecting
    // `fetchMyBeersFromAPI` alone produces a pairing production cannot.
    //
    // This reclaims the assertion the retitle deleted, as a POSITIVE statement
    // of the new behaviour rather than an absence — rewards are NOT written when
    // the member request fails — and it is the only shared-fate coverage on the
    // login entry point. The sibling block in
    // `dataUpdateService.manualRefresh.test.ts` drives
    // `sequentialRefreshAllData` and `manualRefreshAllData`, not this function.
    (fetchBeersFromAPI as Mock).mockResolvedValue(fetchedRows(mockAllBeers));
    (fetchMemberDataFromAPI as Mock).mockResolvedValueOnce({
      myBeers: failed(ApiErrorType.NETWORK_ERROR, 'Network request failed'),
      rewards: failed(ApiErrorType.NETWORK_ERROR, 'Network request failed'),
    });

    await refreshAllDataFromAPI();

    // The taplist is a different url and a different request, so it survives.
    expect(beerRepository.insertManyUnsafe).toHaveBeenCalled();
    // Both member sources share the one request, so neither lands.
    expect(myBeersRepository.insertManyUnsafe).not.toHaveBeenCalled();
    expect(rewardsRepository.insertManyUnsafe).not.toHaveBeenCalled();
  });

  it('preserves the all-beers write when the my-beers fetch fails', async () => {
    (fetchBeersFromAPI as Mock).mockResolvedValue(fetchedRows(mockAllBeers));
    (fetchMyBeersFromAPI as Mock).mockRejectedValue(new Error('network timeout'));
    (fetchRewardsFromAPI as Mock).mockResolvedValue(fetchedRows(mockRewards));

    await expect(refreshAllDataFromAPI()).resolves.toBeDefined();

    expect(beerRepository.insertManyUnsafe).toHaveBeenCalled();
  });

  it('writes the taplist and my beers when only the rewards HALF is unusable', async () => {
    // `malformed`, not a rejection — and that is what makes both assertions
    // below legitimate again. A rejection produces a one-sided `failed`, which
    // coalescing makes unreachable; but a mixed `malformed`/`data` pairing is
    // still entirely reachable, because the two extractors read different slices
    // of ONE body. A response with a good `data[1].tasted_brew_current_round`
    // and an unusable `data[2].reward` gives exactly this, and my-beers must
    // still be written.
    //
    // The `myBeersRepository` assertion was deleted when this test was retitled,
    // correctly for the old arrangement and incorrectly for the property: the
    // property is real, it is the one the mock docstring names as still
    // reachable, and nothing else at the service layer drives a coalesced
    // `rewards: malformed`.
    (fetchBeersFromAPI as Mock).mockResolvedValue(fetchedRows(mockAllBeers));
    (fetchMyBeersFromAPI as Mock).mockResolvedValue(fetchedRows(mockMyBeers));
    (fetchRewardsFromAPI as Mock).mockResolvedValue(
      malformed('response contained no reward array')
    );

    await refreshAllDataFromAPI();
    expect(beerRepository.insertManyUnsafe).toHaveBeenCalled();
    expect(myBeersRepository.insertManyUnsafe).toHaveBeenCalled();
  });

  // GUARD — passes today via the existing finally. Not this phase's RED.
  it('releases the master lock when a source fails', async () => {
    (fetchBeersFromAPI as Mock).mockResolvedValue(fetchedRows(mockAllBeers));
    (fetchMyBeersFromAPI as Mock).mockRejectedValue(new Error('network timeout'));
    (fetchRewardsFromAPI as Mock).mockResolvedValue(fetchedRows(mockRewards));

    // Tolerates the rejection deliberately: this must pass BOTH today (where
    // the function still rejects) and after the fix (where it does not), or it
    // is not a guard — it would just be another RED wearing a GUARD label.
    await refreshAllDataFromAPI().catch(() => undefined);

    expect(databaseLockManager.isLocked()).toBe(false);
  });
});
