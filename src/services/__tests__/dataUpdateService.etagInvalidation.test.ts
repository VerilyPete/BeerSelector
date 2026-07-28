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

    await svc.fetchAndUpdateAllBeers();

    expect(etagWrites()).not.toContain('');
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
