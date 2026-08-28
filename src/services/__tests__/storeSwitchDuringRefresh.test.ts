import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
/**
 * A refresh must not commit rows fetched for a store the app has since left.
 *
 * The window is real on every taplist path: the fetch happens outside the write
 * lock (plan 05 Phase 5.4/5.5 put it there deliberately), and `LoginWebView`
 * rewrites `all_beers_api_url` and clears the taplist ETag without taking that
 * lock at all. So a refresh that fetched store A can acquire the lock after a
 * login has switched to store B, and write A's rows — and, worse, A's validator
 * — under B's configuration.
 *
 * An earlier version of this header said `shouldTrustNotModified` then passes,
 * so "the mismatch survives the next conditional request rather than being
 * corrected by it". That is false — the proxy keys its validator per store, so
 * A's ETag against B's `sid` misses and returns a 200, and
 * `shouldTrustNotModified` is never reached. The ROWS self-correct.
 *
 * What does not self-correct is the freshness stamp: `all_beers_last_check`
 * written under B's configuration suppresses the automatic refresh for twelve
 * hours. That is the harm these tests actually protect against.
 *
 * The guard is the configuration itself rather than a separate counter: the
 * writer re-reads `all_beers_api_url` under the lock and compares it to the one
 * the rows were fetched against. A counter would be a second thing to keep in
 * sync with the first, and every writer of the configuration would have to
 * remember to bump it. Comparing the value that actually identifies the store
 * cannot drift from the store, and it gets the re-login-to-the-same-store case
 * right for free: same URL, so the rows are still valid and the write proceeds.
 *
 * Ordering here comes from flipping the mocked preference at a recorded point,
 * never from wall-clock timing.
 */

import { fetchBeersFromAPI, fetchMyBeersFromAPI, fetchRewardsFromAPI } from '../../api/beerApi';
import { fetchBeersFromProxy } from '../enrichmentService';
import { config } from '@/src/config';
import { beerRepository } from '../../database/repositories/BeerRepository';
import { setPreference } from '../../database/preferences';
import { fetchedRows, confirmedEmpty } from '../../api/__tests__/helpers/fetchOutcomeFixtures';
import {
  refreshAllDataFromAPI,
  sequentialRefreshAllData,
  fetchAndUpdateAllBeers,
  resetInFlightSequentialRefresh,
  dropInFlightTaplistFetch,
} from '../dataUpdateService';

const STORE_A = 'https://fsbs.beerknurd.com/bk-store-json.php?sid=13885';
const STORE_B = 'https://fsbs.beerknurd.com/bk-store-json.php?sid=13880';

/** The value `all_beers_api_url` currently answers with. Flipped mid-test. */
let mockTaplistUrl = STORE_A;

/**
 * Which operation held the lock at each read of `all_beers_api_url`.
 *
 * The containment assertions in this file record the holder at the INSERT and
 * at the STAMP. Both still run inside the hold if the guard READ is hoisted out
 * of it and its boolean passed in:
 *
 *     const passed = await taplistConfigurationHeld(fetchedFor);
 *     await withDatabaseLock('...', async () => { if (!passed) return false; ... });
 *
 * and that hoist IS the race — read store A outside the lock, a login writes
 * store B, the commit lands under B. Mutation testing confirmed the full suite
 * stayed green against it: the instruments were real but aimed one statement
 * too late, watching the commit rather than the check that authorises it.
 *
 * Recording the read pins both to the same hold, which is the actual invariant.
 */
const mockConfigReadHolders: (string | null)[] = [];

vi.mock('../../database/preferences', async () => ({
  getPreference: vi.fn(async (key: string) => {
    if (key === 'all_beers_api_url') {
      mockConfigReadHolders.push(mockLockHolder);
      return mockTaplistUrl;
    }
    if (key === 'my_beers_api_url') return 'https://example.com/mybeers.json';
    return null;
  }),
  setPreference: vi.fn(async () => {}),
  areApiUrlsConfigured: vi.fn(async () => true),
}));

vi.mock('../../api/beerApi', async () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  (await import('../../api/__tests__/helpers/beerApiMock')).beerApiMockFactory()
);

vi.mock('../enrichmentService', async () => ({
  fetchBeersFromProxy: vi.fn(),
  fetchEnrichmentBatchWithMissing: vi.fn(async () => ({ enrichments: {}, missing: [] })),
  syncBeersToWorker: vi.fn(async () => ({ synced: 0, failed: 0, queued_for_cleanup: 0 })),
  mergeEnrichmentData: vi.fn((beers: unknown) => beers),
  recordFallback: vi.fn(),
  pollForEnrichmentUpdates: vi.fn(async () => ({})),
}));

vi.mock('../../database/repositories/BeerRepository', async () => ({
  beerRepository: { insertManyUnsafe: vi.fn(async () => {}), count: vi.fn(async () => 12) },
}));

vi.mock('../../database/repositories/MyBeersRepository', async () => ({
  myBeersRepository: {
    insertManyUnsafe: vi.fn(async () => {}),
    replaceAllWithEmptyUnsafe: vi.fn(async () => {}),
  },
}));

vi.mock('../../database/repositories/RewardsRepository', async () => ({
  rewardsRepository: {
    insertManyUnsafe: vi.fn(async () => {}),
    replaceAllWithEmptyUnsafe: vi.fn(async () => {}),
  },
}));

// Tracks WHO holds the lock while the task runs. A bare passthrough stub can
// observe that a lock was ACQUIRED but never that work happened INSIDE the
// hold, and an empty-hold mutant with the guarded work hoisted out satisfies
// every acquisition-shaped assertion.
//
// Scope of that claim, corrected: the empty-hold mutant survives THIS FILE's
// assertions (13/13 green before the recorder was added). It does NOT survive
// the full suite — `sequentialRefreshAllData.locking.test.ts`'s "holds the lock
// across every write" catches it, and did so before any of this was written.
// An earlier version of this comment claimed the full suite missed it, which
// was false: the file-level result was measured and the suite-level extension
// was assumed.
let mockLockHolder: string | null = null;

vi.mock('../../database/DatabaseLockManager', async () => ({
  databaseLockManager: {
    withDatabaseLock: vi.fn(async (name: string, task: () => Promise<unknown>) => {
      mockLockHolder = name;
      try {
        return await task();
      } finally {
        mockLockHolder = null;
      }
    }),
    getCurrentOperation: () => mockLockHolder,
  },
}));

vi.mock('../../utils/errorLogger', async () => ({ logError: vi.fn(), logWarning: vi.fn() }));

vi.mock('@/src/config', async () => {
  const actual = await vi.importActual<typeof import('@/src/config')>('@/src/config');
  return {
    ...actual,
    config: {
      ...actual.config,
      enrichment: { ...actual.config.enrichment, isConfigured: vi.fn().mockReturnValue(false) },
    },
  };
});

const ALL_BEERS = [{ id: 'b1', brew_name: 'Store A Beer', brewer: 'Brewery' }];

/** Every key written via setPreference, in order. */
const writtenKeys = (): string[] => (setPreference as Mock).mock.calls.map(([key]) => key);

/**
 * Answer the taplist fetch, switching the configured store as it resolves.
 *
 * This is the race, staged deterministically: the rows are for A, and by the
 * time anything can commit them the app is pointed at B.
 */
const fetchThenSwitchStore = (): void => {
  (fetchBeersFromAPI as Mock).mockImplementation(async () => {
    mockTaplistUrl = STORE_B;
    return fetchedRows(ALL_BEERS);
  });
};

beforeEach(async () => {
  vi.clearAllMocks();
  mockConfigReadHolders.length = 0;
  mockTaplistUrl = STORE_A;
  resetInFlightSequentialRefresh();
  dropInFlightTaplistFetch();
  // Reset explicitly: `jest.clearAllMocks()` clears calls but NOT a
  // `mockReturnValue`, so the 304 tests below — which need the proxy path —
  // would leak `true` into every test after them and silently reroute their
  // fetches. Caught by two previously-passing tests going red.
  (config.enrichment.isConfigured as Mock).mockReturnValue(false);
  (fetchBeersFromAPI as Mock).mockResolvedValue(fetchedRows(ALL_BEERS));
  (fetchMyBeersFromAPI as Mock).mockResolvedValue(confirmedEmpty());
  (fetchRewardsFromAPI as Mock).mockResolvedValue(confirmedEmpty());
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
});

describe('a store switch between fetch and commit', () => {
  describe('on the login path (refreshAllDataFromAPI)', () => {
    it('does not insert rows fetched for the previous store', async () => {
      fetchThenSwitchStore();

      await refreshAllDataFromAPI();

      expect(beerRepository.insertManyUnsafe).not.toHaveBeenCalled();
    });

    it('does not leave the previous store ETag against the new configuration', async () => {
      fetchThenSwitchStore();

      await refreshAllDataFromAPI();

      // Not merely "no proxy ETag written" — no taplist ETag write at all. The
      // abandoned write must not touch the validator the login already set.
      expect(writtenKeys()).not.toContain('all_beers_etag');
    });
  });

  describe('on the manual/focus path (sequentialRefreshAllData)', () => {
    it('does not insert rows fetched for the previous store', async () => {
      fetchThenSwitchStore();

      await sequentialRefreshAllData();

      expect(beerRepository.insertManyUnsafe).not.toHaveBeenCalled();
    });

    it('does not stamp the check timestamp for a store it did not refresh', async () => {
      // The stamp is what makes this worse than a discarded fetch: the 12-hour
      // window would then suppress the new store's refresh, so the user sits on
      // the old store's taplist until the window expires.
      fetchThenSwitchStore();

      await sequentialRefreshAllData();

      expect(writtenKeys()).not.toContain('all_beers_last_check');
      expect(writtenKeys()).not.toContain('all_beers_last_update');
    });
  });

  describe('on the direct path (fetchAndUpdateAllBeers)', () => {
    it('does not insert rows fetched for the previous store', async () => {
      fetchThenSwitchStore();

      await fetchAndUpdateAllBeers();

      expect(beerRepository.insertManyUnsafe).not.toHaveBeenCalled();
    });

    it('reports the refresh as not having updated anything', async () => {
      fetchThenSwitchStore();

      const result = await fetchAndUpdateAllBeers();

      expect(result.dataUpdated).toBe(false);
    });
  });

  describe('when the server answers 304', () => {
    // A 304 writes no rows, which is why the guard was originally applied only
    // to the replace arm. That reasoning was wrong: a 304 stamps
    // `all_beers_last_check`, and stamping it for a store the app is no longer
    // pointed at suppresses the NEW store's refresh for the next twelve hours.
    // The `AllBeersWrite` doc says exactly this — it is the stated reason
    // `fetchedFor` is carried on the `not-modified` arm — and the arm it
    // describes had no guard. Three reviewers found this independently and no
    // test in this file set `notModified: true`.
    const respondNotModifiedThenSwitchStore = (): void => {
      (fetchBeersFromProxy as Mock).mockImplementation(async () => {
        mockTaplistUrl = STORE_B;
        return { beers: [], source: 'cache', notModified: true };
      });
      (config.enrichment.isConfigured as Mock).mockReturnValue(true);
    };

    it('does not stamp the check timestamp on the direct path', async () => {
      respondNotModifiedThenSwitchStore();

      await fetchAndUpdateAllBeers();

      expect(writtenKeys()).not.toContain('all_beers_last_check');
    });

    it('does not stamp the check timestamp on the manual/focus path', async () => {
      respondNotModifiedThenSwitchStore();

      await sequentialRefreshAllData();

      expect(writtenKeys()).not.toContain('all_beers_last_check');
    });

    it('does not stamp the check timestamp on the login path', async () => {
      respondNotModifiedThenSwitchStore();

      await refreshAllDataFromAPI();

      expect(writtenKeys()).not.toContain('all_beers_last_check');
    });

    it('still stamps the check timestamp when the store did not change', async () => {
      // The other half: a 304 for the store we are still on is a successful
      // freshness check and must advance the window, or every refresh re-fetches
      // in full and the ETag buys nothing.
      (fetchBeersFromProxy as Mock).mockResolvedValue({
        beers: [],
        source: 'cache',
        notModified: true,
      });
      (config.enrichment.isConfigured as Mock).mockReturnValue(true);

      await fetchAndUpdateAllBeers();

      expect(writtenKeys()).toContain('all_beers_last_check');
    });
  });

  describe('when the configuration is cleared rather than switched', () => {
    it('does not commit rows against a cleared configuration', async () => {
      // `''` is the live state during EVERY login: LoginWebView clears
      // `all_beers_api_url` to shut the configuration gate before writing the
      // new store. A refresh acquiring the lock in that window must abandon —
      // the rows belong to the old store and the app is mid-switch. The mutant
      // `current === '' || current === fetchedFor` survived the whole suite,
      // because this file only ever flipped STORE_A -> STORE_B.
      (fetchBeersFromAPI as Mock).mockImplementation(async () => {
        mockTaplistUrl = '';
        return fetchedRows(ALL_BEERS);
      });

      await sequentialRefreshAllData();

      expect(beerRepository.insertManyUnsafe).not.toHaveBeenCalled();
      expect(writtenKeys()).not.toContain('all_beers_last_check');
    });

    it('does not commit rows fetched when the configuration could not be read', async () => {
      // 9.6, and the mirror image of the test above. There the read succeeded
      // and the configuration changed underneath it. Here the READ ITSELF
      // failed, and the equality guard cannot tell the difference.
      //
      // `getPreference` swallows its errors and returns null, which
      // `readTaplistConfiguration` maps to ''. So a failed read produces the
      // same '' as "deliberately cleared" and "never configured" — three
      // distinct states collapsed into one sentinel. `fetchBeersFromAPI` then
      // re-reads the preference ITSELF, gets the real URL, and returns real
      // rows for a store this refresh cannot name.
      //
      // At the write guard the comparison is `'' === ''`, which PASSES, so the
      // rows are committed and the freshness window stamped for a store nobody
      // established. `fetchAndUpdateAllBeers` is safe here only because it
      // guards `if (!apiUrl)` before fetching; this path deliberately tolerates
      // the empty case and passes `storeId: null`, so it had no such guard.
      mockTaplistUrl = '';
      (fetchBeersFromAPI as Mock).mockImplementation(async () => fetchedRows(ALL_BEERS));

      await sequentialRefreshAllData();

      expect(beerRepository.insertManyUnsafe).not.toHaveBeenCalled();
      expect(writtenKeys()).not.toContain('all_beers_last_check');
    });
  });

  describe('when the configuration did not change', () => {
    it('writes normally', async () => {
      await sequentialRefreshAllData();

      expect(beerRepository.insertManyUnsafe).toHaveBeenCalled();
      expect(writtenKeys()).toContain('all_beers_last_check');
    });

    it('commits the rows while holding the write lock, not merely after taking it', async () => {
      // The containment half of the guard. Every other test here asserts that
      // a store switch is DETECTED; none asserts that the detection and the
      // commit happen inside one hold. A hold whose body is empty, with the
      // guard and the insert hoisted out after it, passes all of them — the
      // lock is still acquired, the guard still runs, the rows still land —
      // while reintroducing the exact window the lock exists to close.
      const holderDuringInsert: (string | null)[] = [];
      (beerRepository.insertManyUnsafe as Mock).mockImplementation(async () => {
        holderDuringInsert.push(mockLockHolder);
      });

      // The freshness stamp too, not just the insert. 9.15 was a stamp written
      // one statement AFTER its hold returned, on a different arm; these two
      // stamp inside the CALLER's hold rather than one of their own, so the
      // containment is real but comes from somewhere else and is worth
      // asserting rather than assuming.
      const holderDuringStamp: (string | null)[] = [];
      const realSetPreference = setPreference as Mock;
      realSetPreference.mockImplementation(async (key: string) => {
        if (key === 'all_beers_last_check') {
          holderDuringStamp.push(mockLockHolder);
        }
      });

      await sequentialRefreshAllData();

      // 'refresh-all-data-write', not 'all-beers-write': the sequential path
      // holds one lock across the whole refresh rather than one per source.
      // The first draft of this test asserted the per-source name and failed —
      // the expectation was wrong, not the code.
      expect(holderDuringInsert).toEqual(['refresh-all-data-write']);
      expect(holderDuringStamp).toEqual(['refresh-all-data-write']);

      // And the READ that authorises them, which is the half the other two
      // assertions cannot see.
      expect(mockConfigReadHolders).toContain('refresh-all-data-write');
    });

    it('writes when the same store is re-selected', async () => {
      // Re-login to the SAME store rewrites the preference with an identical
      // value. The rows are still valid for it, and a scheme that keyed on "the
      // configuration was written" rather than on what it says would throw away
      // a perfectly good refresh here.
      (fetchBeersFromAPI as Mock).mockImplementation(async () => {
        mockTaplistUrl = STORE_A;
        return fetchedRows(ALL_BEERS);
      });

      await sequentialRefreshAllData();

      expect(beerRepository.insertManyUnsafe).toHaveBeenCalled();
    });
  });
});
