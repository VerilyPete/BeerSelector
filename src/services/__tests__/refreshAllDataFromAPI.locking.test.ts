import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
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
 * What releasing the lock actually buys, stated correctly: NOT a faster check-in
 * for the user who triggered it. `checkInBeer` awaits `autoLogin`, which awaits
 * this function whole (`authService.ts:44`), so that user waits out the refresh
 * either way and the lock changes their wait by zero. The gain is that every
 * OTHER lock consumer — the app-open `fetchAndUpdate*` writes,
 * `BeerRepository.insertMany`, the enrichment sync's `updateEnrichmentData` —
 * stops queueing behind this refresh's network phase. Real benefit, different
 * mechanism than the one first claimed here.
 *
 * **Ordering is asserted from a recorded event log, never from wall-clock
 * timing.** Every mock settles immediately and no test ADVANCES timers; the
 * suite inherits `src/__vitest__/setup.ts`'s global fake timers and depends on nothing
 * they control.
 */

import {
  fetchBeersFromAPI,
  fetchMemberDataFromAPI,
  fetchMyBeersFromAPI,
  fetchRewardsFromAPI,
} from '../../api/beerApi';
import { beerRepository } from '../../database/repositories/BeerRepository';
import { myBeersRepository } from '../../database/repositories/MyBeersRepository';
import { rewardsRepository } from '../../database/repositories/RewardsRepository';
import { fetchEnrichmentBatchWithMissing, syncBeersToWorker } from '../enrichmentService';
import { config } from '@/src/config';
import { getPreference, setPreference } from '../../database/preferences';
import { fetchBeersFromProxy } from '../enrichmentService';
import {
  fetchedRows,
  failed,
  malformed,
  unavailable,
} from '../../api/__tests__/helpers/fetchOutcomeFixtures';
import { refreshAllDataFromAPI } from '../dataUpdateService';

/** One ordered log of everything worth ordering. See the sibling suite. */
const mockEvents: string[] = [];

vi.mock('../../database/preferences', () => ({
  getPreference: vi.fn(async (key: string) => {
    if (key === 'all_beers_api_url') return 'https://example.com/allbeers.json';
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

vi.mock('../enrichmentService', () => ({
  fetchBeersFromProxy: vi.fn(),
  fetchEnrichmentBatchWithMissing: vi.fn(),
  syncBeersToWorker: vi.fn(async () => {}),
  mergeEnrichmentData: vi.fn((beers: unknown) => beers),
  recordFallback: vi.fn(),
  pollForEnrichmentUpdates: vi.fn(),
}));

vi.mock('../../database/repositories/BeerRepository', () => ({
  beerRepository: { insertManyUnsafe: vi.fn(async () => {}), count: vi.fn(async () => 12) },
}));

vi.mock('../../database/repositories/MyBeersRepository', () => ({
  myBeersRepository: {
    insertManyUnsafe: vi.fn(async () => {}),
    replaceAllWithEmptyUnsafe: vi.fn(async () => {}),
  },
}));

vi.mock('../../database/repositories/RewardsRepository', () => ({
  rewardsRepository: {
    insertManyUnsafe: vi.fn(async () => {}),
    replaceAllWithEmptyUnsafe: vi.fn(async () => {}),
  },
}));

vi.mock('../../database/DatabaseLockManager', () => ({
  databaseLockManager: {
    withDatabaseLock: vi.fn(async (_name: string, task: () => Promise<unknown>) => {
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
const REWARDS = [{ reward_id: 'r1', redeemed: '0', reward_type: 'badge' }];

const respondsWith = (mock: Mock, label: string, outcome: unknown): void => {
  mock.mockImplementation(async () => {
    mockEvents.push(`fetch:${label}`);
    return outcome;
  });
};

const recordWrite = (mock: Mock, label: string): void => {
  mock.mockImplementation(async () => {
    mockEvents.push(`write:${label}`);
  });
};

const allSourcesSucceed = (): void => {
  respondsWith(fetchBeersFromAPI as Mock, 'allBeers', fetchedRows(ALL_BEERS));
  respondsWith(fetchMyBeersFromAPI as Mock, 'myBeers', fetchedRows(MY_BEERS));
  respondsWith(fetchRewardsFromAPI as Mock, 'rewards', fetchedRows(REWARDS));
};

describe('refreshAllDataFromAPI locking', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockEvents.length = 0;

    recordWrite(beerRepository.insertManyUnsafe as Mock, 'allBeers');
    recordWrite(myBeersRepository.insertManyUnsafe as Mock, 'myBeers');
    recordWrite(myBeersRepository.replaceAllWithEmptyUnsafe as Mock, 'myBeers:clear');
    recordWrite(rewardsRepository.insertManyUnsafe as Mock, 'rewards');
    recordWrite(rewardsRepository.replaceAllWithEmptyUnsafe as Mock, 'rewards:clear');
  });

  afterEach(async () => {
    // Two tests spy on the `config.enrichment` getter. A failure before their
    // own `mockRestore()` would leave enrichment configured for the rest of the
    // file, and `clearAllMocks` does not undo a spy.
    vi.restoreAllMocks();
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
    vi.spyOn(config, 'enrichment', 'get').mockReturnValue({
      ...config.enrichment,
      isConfigured: () => true,
    });
    allSourcesSucceed();
    (fetchEnrichmentBatchWithMissing as Mock).mockImplementation(async () => {
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
    vi.spyOn(config, 'enrichment', 'get').mockReturnValue({
      ...config.enrichment,
      isConfigured: () => true,
    });
    allSourcesSucceed();
    (fetchEnrichmentBatchWithMissing as Mock).mockResolvedValue({
      enrichments: {},
      missing: ['b1'],
    });
    (syncBeersToWorker as Mock).mockImplementation(async () => {
      mockEvents.push('sync:worker');
      return { synced: 1, queued_for_cleanup: 0 };
    });

    await refreshAllDataFromAPI();

    expect(mockEvents).toContain('sync:worker');
    expect(mockEvents.indexOf('sync:worker')).toBeGreaterThan(mockEvents.indexOf('lock:release'));
  });

  it('writes valid rewards when the same member body has malformed tasted rows', async () => {
    // This pairing can come from one real member response: malformed tasted
    // rows beside a valid reward array. The valid half must still be written.
    respondsWith(fetchBeersFromAPI as Mock, 'allBeers', fetchedRows(ALL_BEERS));
    respondsWith(fetchMyBeersFromAPI as Mock, 'myBeers', malformed('rows lacked an id'));
    respondsWith(fetchRewardsFromAPI as Mock, 'rewards', fetchedRows(REWARDS));

    const result = await refreshAllDataFromAPI();

    expect(beerRepository.insertManyUnsafe).toHaveBeenCalled();
    expect(rewardsRepository.insertManyUnsafe).toHaveBeenCalled();
    expect(myBeersRepository.insertManyUnsafe).not.toHaveBeenCalled();
    expect(result.myBeers).toEqual([]);
    expect(result.allBeers).toHaveLength(ALL_BEERS.length);
  });

  it('does not acquire the lock at all when every fetch fails', async () => {
    respondsWith(fetchBeersFromAPI as Mock, 'allBeers', failed());
    respondsWith(fetchMyBeersFromAPI as Mock, 'myBeers', failed());
    respondsWith(fetchRewardsFromAPI as Mock, 'rewards', failed());

    const result = await refreshAllDataFromAPI();

    expect(mockEvents.filter(event => event.startsWith('lock:'))).toEqual([]);
    expect(result).toEqual({ allBeers: [], myBeers: [], rewards: [] });
  });

  it('does not acquire the lock when both member sources are not-applicable', async () => {
    // "Nothing to write" reached through success rather than failure: my-beers
    // and rewards both `not-applicable`.
    //
    // NOT via visitor mode, despite the name — `authService.ts:42` guards the
    // call with `if (!isVisitorMode)`, so a true visitor never reaches this
    // function at all. The reachable route is a `none://` placeholder URL on a
    // member account. The scenario is real; an earlier version of this comment
    // named the wrong cause for it.
    respondsWith(fetchBeersFromAPI as Mock, 'allBeers', failed());
    respondsWith(
      fetchMyBeersFromAPI as Mock,
      'myBeers',
      unavailable('not-applicable', 'visitor mode')
    );
    respondsWith(
      fetchRewardsFromAPI as Mock,
      'rewards',
      unavailable('not-applicable', 'visitor mode')
    );

    await refreshAllDataFromAPI();

    expect(mockEvents.filter(event => event.startsWith('lock:'))).toEqual([]);
  });

  describe('what this path writes, which is deliberately less than the sequential path', () => {
    /**
     * 5.5 kept two write functions rather than sharing one, because
     * `writeAllBeers`/`writeMyBeers` stamp freshness timestamps and this path
     * never has — adding them would change when `checkAndRefreshOnAppOpen`
     * considers data fresh. That was argued at length and held by NOTHING:
     * swapping `writeAllBeersOnLogin` for `writeAllBeers` left every test green,
     * as did deleting the ETag write outright. A deliberately preserved
     * behaviour with no test is indistinguishable from an accident.
     */
    const taplistViaProxyWithEtag = (): void => {
      vi.spyOn(config, 'enrichment', 'get').mockReturnValue({
        ...config.enrichment,
        isConfigured: () => true,
      });
      (getPreference as Mock).mockImplementation(async (key: string) => {
        if (key === 'all_beers_api_url') return 'https://example.com/beers?sid=13885';
        if (key === 'my_beers_api_url') return 'https://example.com/mybeers.json';
        return null;
      });
      (fetchBeersFromProxy as Mock).mockResolvedValue({
        notModified: false,
        beers: [{ id: 'b1', brew_name: 'Proxy Beer', brewer: 'Brewery' }],
        etag: 'W/"v1"',
      });
    };

    const preferenceKeysWritten = (): string[] =>
      (setPreference as Mock).mock.calls.map(call => call[0]);

    it('stores the ETag but not the freshness timestamps', async () => {
      taplistViaProxyWithEtag();
      respondsWith(fetchMyBeersFromAPI as Mock, 'myBeers', fetchedRows(MY_BEERS));
      respondsWith(fetchRewardsFromAPI as Mock, 'rewards', fetchedRows(REWARDS));

      await refreshAllDataFromAPI();

      expect(preferenceKeysWritten()).toContain('all_beers_etag');
      // The asymmetry, in both directions. `writeAllBeers` would add the first
      // two and `writeMyBeers` the last two; this path writes none of them.
      expect(preferenceKeysWritten()).not.toContain('all_beers_last_update');
      expect(preferenceKeysWritten()).not.toContain('all_beers_last_check');
      expect(preferenceKeysWritten()).not.toContain('my_beers_last_update');
      expect(preferenceKeysWritten()).not.toContain('my_beers_last_check');
    });

    it('stamps only the check timestamp on a 304, and still takes the lock', async () => {
      // The login path's 304 arm had no coverage: it is reachable only through
      // this function, and the existing 304 tests drive fetchAndUpdateAllBeers.
      // A 304 is classified as a WRITE precisely so the check timestamp still
      // advances — the one preference this path does stamp.
      vi.spyOn(config, 'enrichment', 'get').mockReturnValue({
        ...config.enrichment,
        isConfigured: () => true,
      });
      (getPreference as Mock).mockImplementation(async (key: string) => {
        if (key === 'all_beers_api_url') return 'https://example.com/beers?sid=13885';
        if (key === 'my_beers_api_url') return 'https://example.com/mybeers.json';
        return null;
      });
      (fetchBeersFromProxy as Mock).mockResolvedValue({
        notModified: true,
        beers: [],
        etag: 'W/"unchanged"',
      });
      respondsWith(
        fetchMyBeersFromAPI as Mock,
        'myBeers',
        unavailable('not-applicable', 'none:// placeholder')
      );
      respondsWith(
        fetchRewardsFromAPI as Mock,
        'rewards',
        unavailable('not-applicable', 'none:// placeholder')
      );

      const result = await refreshAllDataFromAPI();

      expect(preferenceKeysWritten()).toContain('all_beers_last_check');
      expect(beerRepository.insertManyUnsafe).not.toHaveBeenCalled();
      expect(result.allBeers).toEqual([]);
      // Taken for the 304 alone — which is what makes "a 304 is a write"
      // load-bearing rather than a naming choice.
      expect(mockEvents.filter(event => event.startsWith('lock:'))).toEqual([
        'lock:acquire',
        'lock:release',
      ]);
    });
  });

  it('asks for the member body once for both sources', async () => {
    // My-beers and rewards read the same `my_beers_api_url` and take different
    // slices of the same array, so preparing them separately sent the identical
    // request twice. This is the SECOND of the two sites that prepare both back
    // to back; `dataUpdateService.manualRefresh.test.ts` pins the other. Wiring
    // one and leaving the other is what the pair guards against.
    allSourcesSucceed();

    await refreshAllDataFromAPI();

    expect(fetchMemberDataFromAPI).toHaveBeenCalledTimes(1);
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
