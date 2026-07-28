/**
 * The stored ETag may only survive a write that it actually describes.
 *
 * Plan 04 Phase 2, sequenced as plan 05 Phase 5.6.
 *
 * `all_beers_etag` was written `if (etag)` at three separate sites, so a
 * fallback write — which produces no ETag — left the PREVIOUS one in place. That
 * ETag then names proxy-enriched rows the table no longer holds, every later
 * conditional request 304s and returns without touching the database, and the
 * ABV placards never come back. Findings 1 and 7 of the branch review.
 *
 * The fix is not an `else` branch at each site. It is that one module owns the
 * correspondence: `taplistEtag.ts` decides, and the three writers only commit
 * what it decided. That module has existed and been dead since 04 Phase 1 —
 * `readTaplistEtag` and `commitTaplistWrite` had zero production importers.
 *
 * **Three entry points, three tests for the same property.** The bug was
 * copy-pasted three times, and fixing two of three is indistinguishable from
 * fixing none — the argument this plan has now had to make four separate times.
 */

import * as svc from '../dataUpdateService';
import { fetchBeersFromAPI, fetchMyBeersFromAPI, fetchRewardsFromAPI } from '../../api/beerApi';
import { getPreference, setPreference } from '../../database/preferences';
import { beerRepository } from '../../database/repositories/BeerRepository';
import { fetchBeersFromProxy } from '../enrichmentService';
import { config } from '@/src/config';
import { fetchedRows, unavailable } from '../../api/__tests__/helpers/fetchOutcomeFixtures';
import { databaseLockManager } from '../../database/DatabaseLockManager';
import { ApiErrorType } from '../../utils/notificationUtils';

jest.mock('../../database/preferences', () => ({
  getPreference: jest.fn(),
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
  syncBeersToWorker: jest.fn(async () => {}),
  mergeEnrichmentData: jest.fn((beers: unknown) => beers),
  recordFallback: jest.fn(),
  pollForEnrichmentUpdates: jest.fn(),
}));

jest.mock('../../database/repositories/BeerRepository', () => ({
  beerRepository: {
    insertMany: jest.fn(async () => {}),
    insertManyUnsafe: jest.fn(async () => {}),
    count: jest.fn(async () => 12),
  },
}));

jest.mock('../../database/repositories/MyBeersRepository', () => ({
  myBeersRepository: {
    insertMany: jest.fn(async () => {}),
    insertManyUnsafe: jest.fn(async () => {}),
    replaceAllWithEmptyUnsafe: jest.fn(async () => {}),
  },
}));

jest.mock('../../database/repositories/RewardsRepository', () => ({
  rewardsRepository: {
    insertMany: jest.fn(async () => {}),
    insertManyUnsafe: jest.fn(async () => {}),
    replaceAllWithEmpty: jest.fn(async () => {}),
    replaceAllWithEmptyUnsafe: jest.fn(async () => {}),
  },
}));

jest.mock('../../database/DatabaseLockManager', () => ({
  databaseLockManager: {
    withDatabaseLock: jest.fn(async (_name: string, task: () => Promise<unknown>) => task()),
  },
}));

const TAPLIST = [{ id: 'b1', brew_name: 'Test IPA', brewer: 'Test Brewery' }];
const STORE_URL = 'https://fsbs.beerknurd.com/bk-store-json.php?sid=13879';

/** Every `all_beers_etag` value written, in order. */
const etagWrites = (): unknown[] =>
  (setPreference as jest.Mock).mock.calls
    .filter(call => call[0] === 'all_beers_etag')
    .map(c => c[1]);

/**
 * Freshness stamps written this run.
 *
 * Stamping `all_beers_last_check` on the backstop path is what would make the
 * empty-table state self-sustaining — the next refresh would skip, and the
 * corrective full fetch would never happen.
 */
const freshnessStamps = (): unknown[] =>
  (setPreference as jest.Mock).mock.calls.filter(call => call[0] === 'all_beers_last_check');

/**
 * Did an ETag clear land before the rows were replaced?
 *
 * The property all three writers must hold: no validator may outlive the rows it
 * describes, so the invalidation has to precede the insert rather than follow it.
 */
const clearBeforeInsert = (): boolean => {
  const setPreferenceMock = setPreference as jest.Mock;
  const insertOrder = (beerRepository.insertManyUnsafe as jest.Mock).mock.invocationCallOrder[0];
  // Bounded BELOW by the fetch, not just above by the insert. Accepting any
  // earlier clear made this green for the wrong reason: `manualRefreshAllData`
  // emits its own escape-hatch clear before the fetch, so the helper could be
  // satisfied by a clear this writer never made. The writer's pre-clear is the
  // one that lands between fetching the taplist and storing it.
  const fetchOrder = (fetchBeersFromProxy as jest.Mock).mock.invocationCallOrder[0];
  if (insertOrder === undefined || fetchOrder === undefined) return false;

  return setPreferenceMock.mock.calls.some(
    (call: unknown[], index: number) =>
      call[0] === 'all_beers_etag' &&
      call[1] === '' &&
      setPreferenceMock.mock.invocationCallOrder[index] > fetchOrder &&
      setPreferenceMock.mock.invocationCallOrder[index] < insertOrder
  );
};

const storedEtagIs = (value: string | null): void => {
  (getPreference as jest.Mock).mockImplementation(async (key: string) => {
    if (key === 'all_beers_api_url') return STORE_URL;
    if (key === 'my_beers_api_url') return 'https://example.com/mybeers.json';
    if (key === 'all_beers_etag') return value;
    return null;
  });
};

/** The member sources answer "not for you", so only the taplist is in play. */
const onlyTaplistMatters = (): void => {
  (fetchMyBeersFromAPI as jest.Mock).mockResolvedValue(
    unavailable('not-applicable', 'none:// placeholder')
  );
  (fetchRewardsFromAPI as jest.Mock).mockResolvedValue(
    unavailable('not-applicable', 'none:// placeholder')
  );
};

/** Proxy configured and answering. */
const proxyReturns = (etag: string | null): void => {
  jest
    .spyOn(config, 'enrichment', 'get')
    .mockReturnValue({ ...config.enrichment, isConfigured: () => true });
  (fetchBeersFromProxy as jest.Mock).mockResolvedValue({
    beers: TAPLIST,
    storeId: '13879',
    source: 'live',
    etag,
    notModified: false,
  });
};

/** Proxy configured but failing, so the direct Flying Saucer fetch supplies the taplist. */
const proxyFailsAndDirectSucceeds = (): void => {
  jest
    .spyOn(config, 'enrichment', 'get')
    .mockReturnValue({ ...config.enrichment, isConfigured: () => true });
  (fetchBeersFromProxy as jest.Mock).mockRejectedValue(new Error('proxy unreachable'));
  (fetchBeersFromAPI as jest.Mock).mockResolvedValue(fetchedRows(TAPLIST));
};

describe('taplist ETag invalidation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    svc.resetInFlightSequentialRefresh();
    svc.resetLastManualRefreshTime();
    storedEtagIs('W/"old"');
    onlyTaplistMatters();
    (fetchBeersFromAPI as jest.Mock).mockResolvedValue(fetchedRows(TAPLIST));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('the reported bug: a fallback write leaves an ETag naming data the table no longer holds', () => {
    // Three entry points, three tests. Same property, deliberately not shared:
    // the defect was three copies and the fix has to be proven at each.
    it('clears the stored ETag when the direct fallback supplies the taplist — app open', async () => {
      proxyFailsAndDirectSucceeds();

      await svc.fetchAndUpdateAllBeers();

      expect(etagWrites()).toContain('');
      expect(etagWrites()).not.toContain('W/"old"');
    });

    it('clears the stored ETag when the direct fallback supplies the taplist — manual refresh', async () => {
      proxyFailsAndDirectSucceeds();

      await svc.sequentialRefreshAllData();

      expect(etagWrites()).toContain('');
      expect(etagWrites()).not.toContain('W/"old"');
    });

    it('clears the stored ETag when the direct fallback supplies the taplist — login', async () => {
      proxyFailsAndDirectSucceeds();

      await svc.refreshAllDataFromAPI();

      expect(etagWrites()).toContain('');
      expect(etagWrites()).not.toContain('W/"old"');
    });
  });

  it('refuses to believe a 304 when the table it describes is empty', async () => {
    // A 304 asserts "you already have this". Against an empty table that is
    // false, and honouring it returns success with no rows and no error — the
    // user sits looking at nothing while the app reports itself up to date, and
    // every later refresh repeats it because last_check keeps being stamped.
    //
    // `shouldTrustNotModified` was written for exactly this in 04 Phase 1 and
    // then had no production caller for the entire life of the branch — the
    // third inert export in this module, after the two 5.6 wired in.
    (beerRepository.count as jest.Mock).mockResolvedValue(0);
    jest
      .spyOn(config, 'enrichment', 'get')
      .mockReturnValue({ ...config.enrichment, isConfigured: () => true });
    (fetchBeersFromProxy as jest.Mock).mockResolvedValue({
      beers: [],
      storeId: '13879',
      source: 'live',
      etag: 'W/"old"',
      notModified: true,
    });

    const result = await svc.fetchAndUpdateAllBeers();

    // The stale validator is dropped, so the next request cannot 304 again.
    expect(etagWrites()).toContain('');
    expect(result.dataUpdated).toBe(false);
    // A failure, and crucially last_check must NOT be stamped: stamping it is
    // the mechanism that makes the empty-list state self-sustaining, and a
    // mutant that stamped it while reporting success survived both this test
    // and the login one.
    expect(result.success).toBe(false);
    expect(freshnessStamps()).toHaveLength(0);
    // The TYPE and wording, not merely "a failure". Every caller turns a throw
    // into `success: false` too, so without this the test passes when the
    // backstop path explodes — the same defect this file fixed one test above
    // and reintroduced in its three siblings.
    expect(result.error?.type).toBe(ApiErrorType.VALIDATION_ERROR);
    expect(result.error?.message).toContain('no beers are stored');
  });

  it('refuses to believe a 304 with an empty table — manual refresh', async () => {
    (beerRepository.count as jest.Mock).mockResolvedValue(0);
    jest
      .spyOn(config, 'enrichment', 'get')
      .mockReturnValue({ ...config.enrichment, isConfigured: () => true });
    (fetchBeersFromProxy as jest.Mock).mockResolvedValue({
      beers: [],
      storeId: '13879',
      source: 'live',
      etag: 'W/"old"',
      notModified: true,
    });

    const result = await svc.sequentialRefreshAllData();

    expect(etagWrites()).toContain('');
    expect(result.allBeersResult.success).toBe(false);
    expect(freshnessStamps()).toHaveLength(0);
    expect(result.allBeersResult.error?.type).toBe(ApiErrorType.VALIDATION_ERROR);
    expect(result.allBeersResult.error?.message).toContain('no beers are stored');
  });

  it('refuses to believe a 304 with an empty table — login', async () => {
    (beerRepository.count as jest.Mock).mockResolvedValue(0);
    jest
      .spyOn(config, 'enrichment', 'get')
      .mockReturnValue({ ...config.enrichment, isConfigured: () => true });
    (fetchBeersFromProxy as jest.Mock).mockResolvedValue({
      beers: [],
      storeId: '13879',
      source: 'live',
      etag: 'W/"old"',
      notModified: true,
    });

    await svc.refreshAllDataFromAPI();

    expect(etagWrites()).toContain('');
    expect(freshnessStamps()).toHaveLength(0);
  });

  it('keeps the stored ETag when the beer count cannot be read', async () => {
    // `null` is "cannot tell", and the two wrong answers are both silent.
    // Treating it as empty destroys a valid validator; treating it as trusted
    // stamps last_check and reports success, which suppresses the next refresh
    // for hours — and the likeliest cause of an unreadable count is a missing or
    // corrupt `allbeers` table, i.e. exactly the state the backstop is for.
    // Neither: keep the validator, stamp nothing, report the failure.
    (beerRepository.count as jest.Mock).mockResolvedValue(null);
    jest
      .spyOn(config, 'enrichment', 'get')
      .mockReturnValue({ ...config.enrichment, isConfigured: () => true });
    (fetchBeersFromProxy as jest.Mock).mockResolvedValue({
      beers: [],
      storeId: '13879',
      source: 'live',
      etag: 'W/"old"',
      notModified: true,
    });

    const result = await svc.fetchAndUpdateAllBeers();

    expect(etagWrites()).toHaveLength(0);
    expect(freshnessStamps()).toHaveLength(0);
    expect(result.success).toBe(false);
    expect(result.error?.message).toContain('could not be read');
  });

  it('takes the write lock before deciding a 304 is unbelievable', async () => {
    // The count and the clear must be atomic. Reading the count outside the lock
    // and clearing inside it grew the window between them from one await to a
    // 30s lock acquisition — spent waiting on the writer most likely to fill the
    // table — so a concurrent refresh could commit a full taplist and a valid
    // ETag in the gap and have it cleared.
    (beerRepository.count as jest.Mock).mockResolvedValue(0);
    jest
      .spyOn(config, 'enrichment', 'get')
      .mockReturnValue({ ...config.enrichment, isConfigured: () => true });
    (fetchBeersFromProxy as jest.Mock).mockResolvedValue({
      beers: [],
      storeId: '13879',
      source: 'live',
      etag: 'W/"old"',
      notModified: true,
    });

    await svc.fetchAndUpdateAllBeers();

    const lockedOperations = (databaseLockManager.withDatabaseLock as jest.Mock).mock.calls.map(
      ([name]) => name
    );
    expect(lockedOperations).toContain('all-beers-etag-invalidate');
    expect((beerRepository.count as jest.Mock).mock.invocationCallOrder[0]).toBeGreaterThan(
      (databaseLockManager.withDatabaseLock as jest.Mock).mock.invocationCallOrder[0]
    );
  });

  it('honours a 304 when the table actually holds rows', async () => {
    // The other direction: the backstop must not cost a full download on every
    // ordinary 304, which is the entire point of the ETag.
    (beerRepository.count as jest.Mock).mockResolvedValue(12);
    jest
      .spyOn(config, 'enrichment', 'get')
      .mockReturnValue({ ...config.enrichment, isConfigured: () => true });
    (fetchBeersFromProxy as jest.Mock).mockResolvedValue({
      beers: [],
      storeId: '13879',
      source: 'live',
      etag: 'W/"old"',
      notModified: true,
    });

    const result = await svc.fetchAndUpdateAllBeers();

    // Positives, not just a negative: asserting only "no clear happened" is
    // satisfied when the 304 path THROWS, so the old version of this test could
    // not tell an honoured 304 from an exploded one.
    expect(etagWrites()).not.toContain('');
    expect(result.success).toBe(true);
    expect(result.dataUpdated).toBe(false);
    expect(beerRepository.insertManyUnsafe).not.toHaveBeenCalled();
    expect(freshnessStamps()).toHaveLength(1);
  });

  it('stores the new ETag when the proxy returns a 200 carrying one', async () => {
    // The other direction. A fix that cleared unconditionally would pass every
    // test above and cost a full taplist download on every single refresh.
    proxyReturns('W/"new"');

    await svc.fetchAndUpdateAllBeers();

    expect(etagWrites()).toContain('W/"new"');
  });

  it('invalidates the stored ETag before the rows it describes are replaced', async () => {
    // The lock around the rows write and the ETag write gives mutual exclusion,
    // not atomicity: `insertManyUnsafe` commits its own transaction and the
    // preference write is a separate one. If the second never happens — a
    // contention throw, process death, iOS suspending the app between the two
    // awaits — the table holds the new rows while `all_beers_etag` still holds
    // the PREVIOUS proxy validator. Every later conditional request then 304s
    // and returns without touching the database, permanently.
    //
    // Ordering makes the non-atomicity harmless. Clearing first means an
    // interrupted write leaves a cleared ETag against either the old rows or the
    // new ones, and both cost exactly one full fetch.
    proxyReturns('W/"new"');

    await svc.fetchAndUpdateAllBeers();

    const setPreferenceMock = setPreference as jest.Mock;
    const clearOrder = setPreferenceMock.mock.calls
      .map((call: unknown[], index: number) => ({
        call,
        order: setPreferenceMock.mock.invocationCallOrder[index],
      }))
      .filter(({ call }: { call: unknown[] }) => call[0] === 'all_beers_etag' && call[1] === '')
      .map(({ order }: { order: number }) => order)[0];
    const insertOrder = (beerRepository.insertManyUnsafe as jest.Mock).mock.invocationCallOrder[0];

    expect(clearOrder).toBeDefined();
    expect(insertOrder).toBeDefined();
    expect(clearOrder).toBeLessThan(insertOrder);
  });

  it('invalidates before replacing on the manual-refresh path too', async () => {
    // The ordering is applied at three writers. Until this test and the one
    // below it, it was pinned at one: reverting the pre-clear in `writeAllBeers`
    // or `writeAllBeersOnLogin` left the whole suite green. The two existing
    // per-entry-point tests use the FALLBACK path, where the post-commit also
    // writes '', so they cannot tell the pre-clear apart from the post-commit.
    // Using a proxy ETag makes them distinguishable.
    proxyReturns('W/"new"');

    await svc.sequentialRefreshAllData();

    expect(clearBeforeInsert()).toBe(true);
  });

  it('invalidates before replacing on the login path too', async () => {
    proxyReturns('W/"new"');

    await svc.refreshAllDataFromAPI();

    expect(clearBeforeInsert()).toBe(true);
  });

  it('clears the stored ETag when the proxy returns a 200 without one', async () => {
    // A proxy answer with no ETag header cannot be revalidated later, so it is
    // worth no more than a fallback write.
    proxyReturns(null);

    await svc.fetchAndUpdateAllBeers();

    expect(etagWrites()).toContain('');
  });

  it('sends no If-None-Match once a fallback has cleared the ETag', async () => {
    // The other half of the invariant, and a separate defect: the read went
    // straight to the raw preference, and `'' ?? undefined` is `''` — so the
    // cleared value was forwarded as an empty `If-None-Match` header rather
    // than omitted.
    storedEtagIs('');
    proxyReturns('W/"new"');

    await svc.fetchAndUpdateAllBeers();

    expect(fetchBeersFromProxy).toHaveBeenCalledWith('13879', undefined);
  });

  it('leaves the stored ETag untouched on a 304', async () => {
    // GUARD, passes before and after. A 304 means the table already matches the
    // stored ETag, so there is nothing to invalidate — and this is the test that
    // fails if the 304 branch is ever "simplified" into the write path.
    jest
      .spyOn(config, 'enrichment', 'get')
      .mockReturnValue({ ...config.enrichment, isConfigured: () => true });
    (fetchBeersFromProxy as jest.Mock).mockResolvedValue({
      beers: [],
      storeId: '13879',
      source: 'live',
      etag: 'W/"old"',
      notModified: true,
    });

    await svc.fetchAndUpdateAllBeers();

    expect(etagWrites()).toEqual([]);
  });
});
