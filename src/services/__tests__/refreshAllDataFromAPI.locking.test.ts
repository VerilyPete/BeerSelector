/**
 * The login path must not hold the master lock across a network request either.
 *
 * Plan 01 Phase 4, extended to `refreshAllDataFromAPI` as plan 05 Phase 5.5.
 * Sibling to `sequentialRefreshAllData.locking.test.ts`, which owns the same
 * property for the manual/focus refresh path.
 *
 * `01` Phase 4 deliberately left this function alone, and said why: it had no
 * per-source `try`/`catch`, so hoisting the fetches above the writes would let
 * one failing source suppress the others — "exactly the weak-link case this plan
 * exists to fix". `02` Phase 2.5 then gave it that isolation, which retired the
 * blocker rather than the concern; the concern is now a test (see
 * 'writes the sources that fetched successfully when another source fails').
 *
 * This is the `autoLogin` → `checkInBeer` path, so a lock held across a stalled
 * fetch here blocks a user trying to check a beer in.
 *
 * **Ordering is asserted from a recorded event log, never from wall-clock
 * timing.** Every mock settles immediately and no test ADVANCES timers; the
 * suite inherits `jest.setup.js`'s global fake timers and depends on nothing
 * they control.
 */

import { fetchBeersFromAPI, fetchMyBeersFromAPI, fetchRewardsFromAPI } from '../../api/beerApi';
import { beerRepository } from '../../database/repositories/BeerRepository';
import { myBeersRepository } from '../../database/repositories/MyBeersRepository';
import { rewardsRepository } from '../../database/repositories/RewardsRepository';
import { fetchEnrichmentBatchWithMissing, syncBeersToWorker } from '../enrichmentService';
import { config } from '@/src/config';
import { fetchedRows, failed, unavailable } from '../../api/__tests__/helpers/fetchOutcomeFixtures';
import { refreshAllDataFromAPI } from '../dataUpdateService';

/** One ordered log of everything worth ordering. See the sibling suite. */
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

describe('refreshAllDataFromAPI locking', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEvents.length = 0;

    recordWrite(beerRepository.insertManyUnsafe as jest.Mock, 'allBeers');
    recordWrite(myBeersRepository.insertManyUnsafe as jest.Mock, 'myBeers');
    recordWrite(myBeersRepository.replaceAllWithEmptyUnsafe as jest.Mock, 'myBeers:clear');
    recordWrite(rewardsRepository.insertManyUnsafe as jest.Mock, 'rewards');
    recordWrite(rewardsRepository.replaceAllWithEmptyUnsafe as jest.Mock, 'rewards:clear');
  });

  afterEach(() => {
    // Two tests spy on the `config.enrichment` getter. A failure before their
    // own `mockRestore()` would leave enrichment configured for the rest of the
    // file, and `clearAllMocks` does not undo a spy.
    jest.restoreAllMocks();
  });

  it('completes every network fetch before acquiring the database lock', async () => {
    allSourcesSucceed();

    await refreshAllDataFromAPI();

    const acquire = mockEvents.indexOf('lock:acquire');
    expect(acquire).toBeGreaterThan(mockEvents.lastIndexOf('fetch:allBeers'));
    expect(acquire).toBeGreaterThan(mockEvents.lastIndexOf('fetch:myBeers'));
    expect(acquire).toBeGreaterThan(mockEvents.lastIndexOf('fetch:rewards'));

    expect(mockEvents.filter(event => event.startsWith('lock:'))).toEqual([
      'lock:acquire',
      'lock:release',
    ]);
  });

  it('holds the lock across every write', async () => {
    allSourcesSucceed();

    await refreshAllDataFromAPI();

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
    // The spy goes on the GETTER: `config.enrichment` builds a fresh object per
    // access, so spying on the object it returns patches a value production
    // never reads.
    jest
      .spyOn(config, 'enrichment', 'get')
      .mockReturnValue({ ...config.enrichment, isConfigured: () => true });
    allSourcesSucceed();
    (fetchEnrichmentBatchWithMissing as jest.Mock).mockImplementation(async () => {
      mockEvents.push('fetch:enrichment');
      return { enrichments: {}, missing: [] };
    });

    await refreshAllDataFromAPI();

    expect(mockEvents).toContain('fetch:enrichment');
    expect(mockEvents.indexOf('lock:acquire')).toBeGreaterThan(
      mockEvents.lastIndexOf('fetch:enrichment')
    );
  });

  it('starts the background worker sync only after the write burst', async () => {
    // Same race the sequential path had: the sync polls and then writes
    // enrichment into both tables under its OWN lock, so starting it during the
    // fetch phase lets it land before the burst and be wiped by the
    // clear-and-reinsert.
    jest
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

    await refreshAllDataFromAPI();

    expect(mockEvents).toContain('sync:worker');
    expect(mockEvents.indexOf('sync:worker')).toBeGreaterThan(mockEvents.indexOf('lock:release'));
  });

  it('writes the sources that fetched successfully when another source fails', async () => {
    // The exact property `01` Phase 4 refused to risk when it left this
    // function alone. `02` Phase 2.5 supplied the per-source isolation that
    // makes hoisting safe; this is the assertion that it still does.
    respondsWith(fetchBeersFromAPI as jest.Mock, 'allBeers', fetchedRows(ALL_BEERS));
    respondsWith(fetchMyBeersFromAPI as jest.Mock, 'myBeers', failed());
    respondsWith(fetchRewardsFromAPI as jest.Mock, 'rewards', fetchedRows(REWARDS));

    const result = await refreshAllDataFromAPI();

    expect(beerRepository.insertManyUnsafe).toHaveBeenCalled();
    expect(rewardsRepository.insertManyUnsafe).toHaveBeenCalled();
    expect(myBeersRepository.insertManyUnsafe).not.toHaveBeenCalled();
    expect(result.myBeers).toEqual([]);
    expect(result.allBeers).toHaveLength(ALL_BEERS.length);
  });

  it('does not acquire the lock at all when every fetch fails', async () => {
    respondsWith(fetchBeersFromAPI as jest.Mock, 'allBeers', failed());
    respondsWith(fetchMyBeersFromAPI as jest.Mock, 'myBeers', failed());
    respondsWith(fetchRewardsFromAPI as jest.Mock, 'rewards', failed());

    const result = await refreshAllDataFromAPI();

    expect(mockEvents.filter(event => event.startsWith('lock:'))).toEqual([]);
    expect(result).toEqual({ allBeers: [], myBeers: [], rewards: [] });
  });

  it('does not acquire the lock for a visitor, who has nothing to write', async () => {
    // A visitor reaches "nothing to write" through success rather than failure:
    // my-beers and rewards are both `not-applicable`, and this is the
    // autoLogin path, so it runs on every visitor launch.
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

    await refreshAllDataFromAPI();

    expect(mockEvents.filter(event => event.startsWith('lock:'))).toEqual([]);
  });

  it('returns the rows it wrote', async () => {
    // GUARD. This entry point has no per-source result channel — its rows ARE
    // its output, and `autoLogin` → `checkInBeer` consumes them. A restructure
    // that wrote correctly but returned the wrong rows would be invisible to
    // every ordering assertion above.
    allSourcesSucceed();

    const result = await refreshAllDataFromAPI();

    expect(result.allBeers).toHaveLength(ALL_BEERS.length);
    expect(result.myBeers).toHaveLength(MY_BEERS.length);
    expect(result.rewards).toEqual(REWARDS);
  });
});
