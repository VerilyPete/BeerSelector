/**
 * The master lock must not be held across a network request.
 *
 * Plan 01 Phase 4, sequenced as plan 05 Phase 5.4.
 *
 * `sequentialRefreshAllData` wraps its entire body — three fetches, an
 * enrichment batch, and every write — in one `withDatabaseLock`. On a weak link
 * that hold outlives the lock's 15s hold timeout, at which point the grant is
 * abandoned and `DatabaseLockManager` blocks every later writer until the
 * stalled request finally returns. The fix is to fetch first and lock second, so
 * the lock covers only the write burst.
 *
 * Releasing the lock during the fetches removes the ONLY thing serialising
 * concurrent refreshes today — `useDataRefresh`'s `refreshing` flag is
 * per-component and `shouldRunFocusRefresh` is a 5-minute throttle, not a mutex
 * — so the same change must add in-flight de-duplication or it buys one bug for
 * another: two concurrent full taplist downloads on exactly the link this work
 * targets.
 *
 * **Ordering is asserted from a recorded event log, never from wall-clock
 * timing.** Every mock settles immediately and no test uses fake timers.
 */

import { fetchBeersFromAPI, fetchMyBeersFromAPI, fetchRewardsFromAPI } from '../../api/beerApi';
import { beerRepository } from '../../database/repositories/BeerRepository';
import { myBeersRepository } from '../../database/repositories/MyBeersRepository';
import { rewardsRepository } from '../../database/repositories/RewardsRepository';
import { fetchEnrichmentBatchWithMissing, syncBeersToWorker } from '../enrichmentService';
import { config } from '@/src/config';
import { fetchedRows, failed, unavailable } from '../../api/__tests__/helpers/fetchOutcomeFixtures';
import { sequentialRefreshAllData } from '../dataUpdateService';

/**
 * One ordered log of everything worth ordering.
 *
 * Named with the `mock` prefix so babel-jest permits the `jest.mock` factory
 * below to close over it. The factory only *captures* the reference — the first
 * read happens inside `withDatabaseLock` during a test, long after the module
 * has finished evaluating — so there is no temporal-dead-zone hazard here.
 */
const mockEvents: string[] = [];

jest.mock('../../database/preferences', () => ({
  getPreference: jest.fn(async (key: string) => {
    if (key === 'all_beers_api_url') return 'https://example.com/allbeers.json';
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
  fetchEnrichmentBatchWithMissing: jest.fn(),
  syncBeersToWorker: jest.fn(async () => {}),
  mergeEnrichmentData: jest.fn((beers: unknown) => beers),
  recordFallback: jest.fn(),
  pollForEnrichmentUpdates: jest.fn(),
}));

jest.mock('../../database/repositories/BeerRepository', () => ({
  beerRepository: { insertManyUnsafe: jest.fn(async () => {}) },
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
    withDatabaseLock: jest.fn(async (_name: string, task: () => Promise<unknown>) => {
      mockEvents.push('lock:acquire');
      try {
        return await task();
      } finally {
        mockEvents.push('lock:release');
      }
    }),
  },
}));

const ALL_BEERS = [{ id: 'b1', brew_name: 'Taplist Beer', brewer: 'Brewery' }];
const MY_BEERS = [
  { id: 'b1', brew_name: 'Taplist Beer', brewer: 'Brewery', tasted_date: '2026-01-01' },
];
const REWARDS = [{ reward_id: 'r1', reward_type: 'badge' }];

/** Record a fetch in the log, then answer with `outcome`. */
const respondsWith = (mock: jest.Mock, label: string, outcome: unknown): void => {
  mock.mockImplementation(async () => {
    mockEvents.push(`fetch:${label}`);
    return outcome;
  });
};

const recordWrite = (mock: jest.Mock, label: string): void => {
  mock.mockImplementation(async () => {
    mockEvents.push(`write:${label}`);
  });
};

const allSourcesSucceed = (): void => {
  respondsWith(fetchBeersFromAPI as jest.Mock, 'allBeers', fetchedRows(ALL_BEERS));
  respondsWith(fetchMyBeersFromAPI as jest.Mock, 'myBeers', fetchedRows(MY_BEERS));
  respondsWith(fetchRewardsFromAPI as jest.Mock, 'rewards', fetchedRows(REWARDS));
};

describe('sequentialRefreshAllData locking', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEvents.length = 0;

    recordWrite(beerRepository.insertManyUnsafe as jest.Mock, 'allBeers');
    recordWrite(myBeersRepository.insertManyUnsafe as jest.Mock, 'myBeers');
    recordWrite(myBeersRepository.replaceAllWithEmptyUnsafe as jest.Mock, 'myBeers:clear');
    recordWrite(rewardsRepository.insertManyUnsafe as jest.Mock, 'rewards');
  });

  it('completes every network fetch before acquiring the database lock', async () => {
    allSourcesSucceed();

    await sequentialRefreshAllData();

    const acquire = mockEvents.indexOf('lock:acquire');
    expect(acquire).toBeGreaterThan(mockEvents.lastIndexOf('fetch:allBeers'));
    expect(acquire).toBeGreaterThan(mockEvents.lastIndexOf('fetch:myBeers'));
    expect(acquire).toBeGreaterThan(mockEvents.lastIndexOf('fetch:rewards'));

    // One acquisition for the whole write burst — not three, and not one per
    // source. Three locks would reintroduce the contention the master lock was
    // added to remove.
    expect(mockEvents.filter(event => event.startsWith('lock:'))).toEqual([
      'lock:acquire',
      'lock:release',
    ]);
  });

  it('holds the lock across every write', async () => {
    // The other half of the same property. Hoisting the fetches is only correct
    // if the writes stay inside — a split that moved a write out with them
    // would satisfy the test above and lose the atomicity the lock exists for.
    allSourcesSucceed();

    await sequentialRefreshAllData();

    const acquire = mockEvents.indexOf('lock:acquire');
    const release = mockEvents.indexOf('lock:release');
    const writes = mockEvents
      .map((event, index) => ({ event, index }))
      .filter(({ event }) => event.startsWith('write:'));

    expect(writes.length).toBeGreaterThan(0);
    for (const { event, index } of writes) {
      expect({ event, insideLock: index > acquire && index < release }).toEqual({
        event,
        insideLock: true,
      });
    }
  });

  it('fetches enrichment data before acquiring the lock', async () => {
    // Enrichment is a network round trip too, and it sits in the middle of the
    // my-beers block — so hoisting only the three `beerApi` calls would leave
    // the lock wrapped around an HTTP request anyway, which is the whole defect.
    //
    // The spy goes on the `enrichment` GETTER, not on the object it returns.
    // `config.enrichment` is a getter (`config.ts:506`) that builds a fresh
    // object per access, so `jest.spyOn(config.enrichment, 'isConfigured')`
    // patches a value that is discarded before production code reads it — the
    // enrichment call never happens, and a test asserting it does NOT happen
    // would pass for entirely the wrong reason.
    const enrichmentSpy = jest
      .spyOn(config, 'enrichment', 'get')
      .mockReturnValue({ ...config.enrichment, isConfigured: () => true });
    allSourcesSucceed();
    (fetchEnrichmentBatchWithMissing as jest.Mock).mockImplementation(async () => {
      mockEvents.push('fetch:enrichment');
      return { enrichments: {}, missing: [] };
    });

    await sequentialRefreshAllData();

    expect(mockEvents).toContain('fetch:enrichment');
    expect(mockEvents.indexOf('lock:acquire')).toBeGreaterThan(
      mockEvents.lastIndexOf('fetch:enrichment')
    );

    enrichmentSpy.mockRestore();
  });

  it('starts the background worker sync only after the write burst', async () => {
    // The sync polls the Worker and then writes enrichment straight into
    // `allbeers` and `tasted_brew_current_round`, taking the master lock itself
    // to do it. While the refresh held one lock end to end, that write could
    // only ever queue BEHIND the refresh's own writes. Now the lock is free
    // during the fetch phase, so a poll returning mid-refresh can land first
    // and then be wiped by the clear-and-reinsert — enrichment written, logged
    // as persisted, and gone, on exactly the slow link that makes the window
    // wide enough to hit.
    const enrichmentSpy = jest
      .spyOn(config, 'enrichment', 'get')
      .mockReturnValue({ ...config.enrichment, isConfigured: () => true });
    allSourcesSucceed();
    (fetchEnrichmentBatchWithMissing as jest.Mock).mockResolvedValue({
      enrichments: {},
      missing: ['b1'],
    });
    (syncBeersToWorker as jest.Mock).mockImplementation(async () => {
      mockEvents.push('sync:worker');
      return { synced: 1, queued_for_cleanup: 0 };
    });

    await sequentialRefreshAllData();

    expect(mockEvents).toContain('sync:worker');
    expect(mockEvents.indexOf('sync:worker')).toBeGreaterThan(mockEvents.indexOf('lock:release'));

    enrichmentSpy.mockRestore();
  });

  it('writes the sources that fetched successfully when another source fails', async () => {
    respondsWith(fetchBeersFromAPI as jest.Mock, 'allBeers', fetchedRows(ALL_BEERS));
    respondsWith(fetchMyBeersFromAPI as jest.Mock, 'myBeers', failed());
    respondsWith(fetchRewardsFromAPI as jest.Mock, 'rewards', fetchedRows(REWARDS));

    const result = await sequentialRefreshAllData();

    // Per-source isolation is the property that made hoisting safe at all — 02
    // Phase 2.5 is what removed the blocker recorded in 01 Phase 4. If a single
    // failure could suppress the other two writes, this restructure would be
    // the regression it exists to prevent.
    expect(beerRepository.insertManyUnsafe).toHaveBeenCalled();
    expect(rewardsRepository.insertManyUnsafe).toHaveBeenCalled();
    expect(myBeersRepository.insertManyUnsafe).not.toHaveBeenCalled();
    expect(result.myBeersResult.success).toBe(false);
    expect(result.allBeersResult.success).toBe(true);
    expect(result.rewardsResult.success).toBe(true);
  });

  it('writes the other sources when one source fails at the write, not the fetch', async () => {
    // The fetch-failure case above is isolated by three separate `prepare`
    // functions; this one is isolated by `applyPlan`'s catch, which is a
    // different mechanism and was reachable by no test. A repository throwing
    // mid-burst must leave the other two writes standing, exactly as a failing
    // fetch does — otherwise the split has quietly coupled the sources back
    // together at the point where they finally touch the database.
    allSourcesSucceed();
    (myBeersRepository.insertManyUnsafe as jest.Mock).mockImplementation(async () => {
      throw new Error('database is locked');
    });

    const result = await sequentialRefreshAllData();

    expect(result.myBeersResult.success).toBe(false);
    expect(result.allBeersResult.success).toBe(true);
    expect(result.rewardsResult.success).toBe(true);
    expect(rewardsRepository.insertManyUnsafe).toHaveBeenCalled();
  });

  it('does not acquire the lock at all when every fetch fails', async () => {
    respondsWith(fetchBeersFromAPI as jest.Mock, 'allBeers', failed());
    respondsWith(fetchMyBeersFromAPI as jest.Mock, 'myBeers', failed());
    respondsWith(fetchRewardsFromAPI as jest.Mock, 'rewards', failed());

    const result = await sequentialRefreshAllData();

    // Nothing to write, so nothing to lock. Taking it anyway is a pointless
    // acquisition on a dead connection, and on the offline path it is the one
    // most likely to collide with whatever else is retrying.
    expect(mockEvents.filter(event => event.startsWith('lock:'))).toEqual([]);
    expect(result.hasErrors).toBe(true);
  });

  it('does not acquire the lock when no source has anything to write', async () => {
    // Not the same case as the one above, and it fails differently: these are
    // successes. A visitor gets `not-applicable` for my-beers and rewards, and
    // an unconfigured taplist fails — no error worth an alert for two of the
    // three, and still nothing to write.
    respondsWith(fetchBeersFromAPI as jest.Mock, 'allBeers', failed());
    respondsWith(
      fetchMyBeersFromAPI as jest.Mock,
      'myBeers',
      unavailable('not-applicable', 'visitor mode')
    );
    respondsWith(
      fetchRewardsFromAPI as jest.Mock,
      'rewards',
      unavailable('not-applicable', 'visitor mode')
    );

    const result = await sequentialRefreshAllData();

    expect(mockEvents.filter(event => event.startsWith('lock:'))).toEqual([]);
    expect(result.myBeersResult).toEqual({ success: true, dataUpdated: false });
    expect(result.rewardsResult).toEqual({ success: true, dataUpdated: false });
  });

  it('returns the in-flight refresh to a second caller instead of starting another fetch', async () => {
    allSourcesSucceed();

    const [first, second] = await Promise.all([
      sequentialRefreshAllData(),
      sequentialRefreshAllData(),
    ]);

    // The master lock used to be the only thing serialising these. Without a
    // replacement, hoisting the fetches out of it means two concurrent taplist
    // downloads on a link too weak for one.
    expect(fetchBeersFromAPI).toHaveBeenCalledTimes(1);
    expect(fetchMyBeersFromAPI).toHaveBeenCalledTimes(1);
    expect(fetchRewardsFromAPI).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
  });

  it('starts a fresh refresh once the previous one has settled', async () => {
    // GUARD. De-duplication that never clears is a cache, and a refresh button
    // that returns the first refresh forever is worse than the contention it
    // was added to prevent.
    allSourcesSucceed();

    const first = await sequentialRefreshAllData();
    const second = await sequentialRefreshAllData();

    expect(fetchBeersFromAPI).toHaveBeenCalledTimes(2);
    expect(first).not.toBe(second);
  });

  it('clears the in-flight refresh even when a source fails', async () => {
    // GUARD, for the failure path specifically: the clear must be in a `finally`.
    // A leaked in-flight promise after an offline refresh would pin the app to
    // that failed result for the rest of the session — and offline is precisely
    // when the user retries.
    respondsWith(fetchBeersFromAPI as jest.Mock, 'allBeers', failed());
    respondsWith(fetchMyBeersFromAPI as jest.Mock, 'myBeers', failed());
    respondsWith(fetchRewardsFromAPI as jest.Mock, 'rewards', failed());

    await sequentialRefreshAllData();
    await sequentialRefreshAllData();

    expect(fetchBeersFromAPI).toHaveBeenCalledTimes(2);
  });
});
