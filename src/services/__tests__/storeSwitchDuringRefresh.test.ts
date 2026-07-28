/**
 * A refresh must not commit rows fetched for a store the app has since left.
 *
 * The window is real on every taplist path: the fetch happens outside the write
 * lock (plan 05 Phase 5.4/5.5 put it there deliberately), and `LoginWebView`
 * rewrites `all_beers_api_url` and clears the taplist ETag without taking that
 * lock at all. So a refresh that fetched store A can acquire the lock after a
 * login has switched to store B, and write A's rows — and, worse, A's validator
 * — under B's configuration. `shouldTrustNotModified` then passes, because rows
 * exist, so the mismatch survives the next conditional request rather than
 * being corrected by it.
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

jest.mock('../../database/preferences', () => ({
  getPreference: jest.fn(async (key: string) => {
    if (key === 'all_beers_api_url') return mockTaplistUrl;
    if (key === 'my_beers_api_url') return 'https://example.com/mybeers.json';
    return null;
  }),
  setPreference: jest.fn(async () => {}),
  areApiUrlsConfigured: jest.fn(async () => true),
}));

jest.mock('../../api/beerApi', () => ({
  fetchBeersFromAPI: jest.fn(),
  fetchMyBeersFromAPI: jest.fn(),
  fetchRewardsFromAPI: jest.fn(),
}));

jest.mock('../enrichmentService', () => ({
  fetchBeersFromProxy: jest.fn(),
  fetchEnrichmentBatchWithMissing: jest.fn(async () => ({ enrichments: {}, missing: [] })),
  syncBeersToWorker: jest.fn(async () => ({ synced: 0, failed: 0, queued_for_cleanup: 0 })),
  mergeEnrichmentData: jest.fn((beers: unknown) => beers),
  recordFallback: jest.fn(),
  pollForEnrichmentUpdates: jest.fn(async () => ({})),
}));

jest.mock('../../database/repositories/BeerRepository', () => ({
  beerRepository: { insertManyUnsafe: jest.fn(async () => {}), count: jest.fn(async () => 12) },
}));

jest.mock('../../database/repositories/MyBeersRepository', () => ({
  myBeersRepository: {
    insertManyUnsafe: jest.fn(async () => {}),
    replaceAllWithEmptyUnsafe: jest.fn(async () => {}),
  },
}));

jest.mock('../../database/repositories/RewardsRepository', () => ({
  rewardsRepository: {
    insertManyUnsafe: jest.fn(async () => {}),
    replaceAllWithEmptyUnsafe: jest.fn(async () => {}),
  },
}));

jest.mock('../../database/DatabaseLockManager', () => ({
  databaseLockManager: {
    withDatabaseLock: jest.fn(async (_name: string, task: () => Promise<unknown>) => task()),
  },
}));

jest.mock('../../utils/errorLogger', () => ({ logError: jest.fn(), logWarning: jest.fn() }));

jest.mock('@/src/config', () => {
  const actual = jest.requireActual('@/src/config');
  return {
    ...actual,
    config: {
      ...actual.config,
      enrichment: { ...actual.config.enrichment, isConfigured: jest.fn().mockReturnValue(false) },
    },
  };
});

const ALL_BEERS = [{ id: 'b1', brew_name: 'Store A Beer', brewer: 'Brewery' }];

/** Every key written via setPreference, in order. */
const writtenKeys = (): string[] => (setPreference as jest.Mock).mock.calls.map(([key]) => key);

/**
 * Answer the taplist fetch, switching the configured store as it resolves.
 *
 * This is the race, staged deterministically: the rows are for A, and by the
 * time anything can commit them the app is pointed at B.
 */
const fetchThenSwitchStore = (): void => {
  (fetchBeersFromAPI as jest.Mock).mockImplementation(async () => {
    mockTaplistUrl = STORE_B;
    return fetchedRows(ALL_BEERS);
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockTaplistUrl = STORE_A;
  resetInFlightSequentialRefresh();
  dropInFlightTaplistFetch();
  (fetchBeersFromAPI as jest.Mock).mockResolvedValue(fetchedRows(ALL_BEERS));
  (fetchMyBeersFromAPI as jest.Mock).mockResolvedValue(confirmedEmpty());
  (fetchRewardsFromAPI as jest.Mock).mockResolvedValue(confirmedEmpty());
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
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

  describe('when the configuration did not change', () => {
    it('writes normally', async () => {
      await sequentialRefreshAllData();

      expect(beerRepository.insertManyUnsafe).toHaveBeenCalled();
      expect(writtenKeys()).toContain('all_beers_last_check');
    });

    it('writes when the same store is re-selected', async () => {
      // Re-login to the SAME store rewrites the preference with an identical
      // value. The rows are still valid for it, and a scheme that keyed on "the
      // configuration was written" rather than on what it says would throw away
      // a perfectly good refresh here.
      (fetchBeersFromAPI as jest.Mock).mockImplementation(async () => {
        mockTaplistUrl = STORE_A;
        return fetchedRows(ALL_BEERS);
      });

      await sequentialRefreshAllData();

      expect(beerRepository.insertManyUnsafe).toHaveBeenCalled();
    });
  });
});
