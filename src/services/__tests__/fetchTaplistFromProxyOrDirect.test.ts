/**
 * Tests for fetchTaplistFromProxyOrDirect shared helper
 *
 * This helper extracts the duplicated proxy-then-fallback logic from
 * fetchAndUpdateAllBeers, sequentialRefreshAllData, and refreshAllDataFromAPI.
 */

import { fetchTaplistFromProxyOrDirect } from '../dataUpdateService';
import { config } from '@/src/config';
import { fetchBeersFromAPI } from '../../api/beerApi';
import { fetchBeersFromProxy, recordFallback } from '../enrichmentService';
import {
  confirmedEmpty,
  fetchedRows,
  malformed,
  unavailable,
} from '../../api/__tests__/helpers/fetchOutcomeFixtures';
import { ApiErrorType, createErrorResponse } from '../../utils/notificationUtils';

jest.mock('../../database/preferences', () => ({
  // Returns null, not undefined. The real signature is Promise<string | null>,
  // and a bare jest.fn() answers `undefined` — which `normalizeStoredEtag`
  // rightly does not defend against, since the type forbids it. An
  // under-specified mock is the same trap as a stale one.
  getPreference: jest.fn(async () => null),
  setPreference: jest.fn(),
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

jest.mock('../../database/DatabaseLockManager', () => ({
  databaseLockManager: {
    withDatabaseLock: jest.fn(async (_name: string, task: () => Promise<unknown>) => task()),
  },
}));

jest.mock('../../api/beerApi', () => ({
  fetchBeersFromAPI: jest.fn(),
  fetchMyBeersFromAPI: jest.fn(),
  fetchRewardsFromAPI: jest.fn(),
}));

jest.mock('../enrichmentService', () => ({
  fetchBeersFromProxy: jest.fn(),
  fetchEnrichmentBatchWithMissing: jest.fn().mockResolvedValue({ enrichments: {}, missing: [] }),
  syncBeersToWorker: jest.fn().mockResolvedValue({ synced: 0, failed: 0, queued_for_cleanup: 0 }),
  mergeEnrichmentData: jest.fn().mockImplementation(beers => beers),
  recordFallback: jest.fn(),
  pollForEnrichmentUpdates: jest.fn().mockResolvedValue({}),
}));

jest.mock('../../utils/errorLogger', () => ({
  logError: jest.fn(),
  logWarning: jest.fn(),
}));

jest.mock('@/src/config', () => {
  const actual = jest.requireActual('@/src/config');
  return {
    ...actual,
    config: {
      ...actual.config,
      enrichment: {
        ...actual.config.enrichment,
        isConfigured: jest.fn().mockReturnValue(false),
      },
    },
  };
});

// Suppress console.log in tests
const originalConsoleLog = console.log;
beforeEach(() => {
  console.log = jest.fn();
});
afterEach(() => {
  console.log = originalConsoleLog;
});

describe('fetchTaplistFromProxyOrDirect', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (config.enrichment.isConfigured as jest.Mock).mockReturnValue(false);
  });

  it('calls fetchBeersFromProxy when enrichment is configured and storeId is provided', async () => {
    (config.enrichment.isConfigured as jest.Mock).mockReturnValue(true);
    (fetchBeersFromProxy as jest.Mock).mockResolvedValue({
      beers: [
        {
          id: 'beer-1',
          brew_name: 'Test IPA',
          brewer: 'Brewery 1',
          brewer_loc: 'TX',
          brew_style: 'IPA',
          brew_container: 'pint',
          review_count: '5',
          review_rating: '4.2',
          brew_description: 'A hoppy IPA',
          added_date: '2024-01-01',
          enriched_abv: 6.5,
          enrichment_confidence: 0.9,
          enrichment_source: 'perplexity' as const,
          has_cleaned_description: true,
        },
      ],
      source: 'live',
    });

    const result = await fetchTaplistFromProxyOrDirect('13885');

    expect(fetchBeersFromProxy).toHaveBeenCalledWith('13885', undefined);
    expect(result.usedProxy).toBe(true);
    expect(result.beers).toHaveLength(1);
    expect(result.beers[0].id).toBe('beer-1');
    expect(result.beers[0].abv).toBe(6.5);
  });

  it('maps enriched beer response to app Beer via mapEnrichedBeerToAppBeer', async () => {
    (config.enrichment.isConfigured as jest.Mock).mockReturnValue(true);
    (fetchBeersFromProxy as jest.Mock).mockResolvedValue({
      beers: [
        {
          id: 'beer-1',
          brew_name: 'Test IPA',
          brewer: 'Brewery 1',
          brewer_loc: 'TX',
          brew_style: 'IPA',
          brew_container: 'pint',
          review_count: '5',
          review_rating: '4.2',
          brew_description: 'A hoppy IPA',
          added_date: '2024-01-01',
          enriched_abv: 7.0,
          enrichment_confidence: 0.95,
          enrichment_source: 'perplexity' as const,
          has_cleaned_description: true,
        },
      ],
      source: 'cache',
    });

    const result = await fetchTaplistFromProxyOrDirect('13885');

    expect(result.beers[0]).toEqual(
      expect.objectContaining({
        id: 'beer-1',
        brew_name: 'Test IPA',
        brewer: 'Brewery 1',
        abv: 7.0,
        enrichment_confidence: 0.95,
        enrichment_source: 'perplexity',
      })
    );
  });

  it('falls back to fetchBeersFromAPI when proxy fails', async () => {
    (config.enrichment.isConfigured as jest.Mock).mockReturnValue(true);
    (fetchBeersFromProxy as jest.Mock).mockRejectedValue(new Error('proxy down'));
    const mockBeers = [{ id: 'beer-1', brew_name: 'Test IPA', brewer: 'Brewery 1' }];
    (fetchBeersFromAPI as jest.Mock).mockResolvedValue(fetchedRows(mockBeers));

    const result = await fetchTaplistFromProxyOrDirect('13885');

    expect(fetchBeersFromProxy).toHaveBeenCalledWith('13885', undefined);
    expect(fetchBeersFromAPI).toHaveBeenCalled();
    expect(result.usedProxy).toBe(false);
    expect(result.beers).toEqual(mockBeers);
  });

  it('calls recordFallback when falling back to direct fetch', async () => {
    (config.enrichment.isConfigured as jest.Mock).mockReturnValue(true);
    (fetchBeersFromProxy as jest.Mock).mockRejectedValue(new Error('proxy down'));
    (fetchBeersFromAPI as jest.Mock).mockResolvedValue(
      fetchedRows([{ id: 'beer-1', brew_name: 'Test', brewer: 'B' }])
    );

    await fetchTaplistFromProxyOrDirect('13885');

    expect(recordFallback).toHaveBeenCalled();
  });

  it('calls fetchBeersFromAPI directly when enrichment is NOT configured', async () => {
    (config.enrichment.isConfigured as jest.Mock).mockReturnValue(false);
    const mockBeers = [{ id: 'beer-1', brew_name: 'Test', brewer: 'B' }];
    (fetchBeersFromAPI as jest.Mock).mockResolvedValue(fetchedRows(mockBeers));

    const result = await fetchTaplistFromProxyOrDirect('13885');

    expect(fetchBeersFromProxy).not.toHaveBeenCalled();
    expect(fetchBeersFromAPI).toHaveBeenCalled();
    expect(result.usedProxy).toBe(false);
    expect(result.beers).toEqual(mockBeers);
  });

  it('calls recordFallback when enrichment is not configured', async () => {
    (config.enrichment.isConfigured as jest.Mock).mockReturnValue(false);
    (fetchBeersFromAPI as jest.Mock).mockResolvedValue(
      fetchedRows([{ id: 'beer-1', brew_name: 'Test', brewer: 'B' }])
    );

    await fetchTaplistFromProxyOrDirect('13885');

    expect(recordFallback).toHaveBeenCalled();
  });

  it('calls fetchBeersFromAPI directly when storeId is null', async () => {
    (config.enrichment.isConfigured as jest.Mock).mockReturnValue(true);
    const mockBeers = [{ id: 'beer-1', brew_name: 'Test', brewer: 'B' }];
    (fetchBeersFromAPI as jest.Mock).mockResolvedValue(fetchedRows(mockBeers));

    const result = await fetchTaplistFromProxyOrDirect(null);

    expect(fetchBeersFromProxy).not.toHaveBeenCalled();
    expect(fetchBeersFromAPI).toHaveBeenCalled();
    expect(result.usedProxy).toBe(false);
  });

  it('throws when both proxy and direct fetch fail', async () => {
    (config.enrichment.isConfigured as jest.Mock).mockReturnValue(true);
    (fetchBeersFromProxy as jest.Mock).mockRejectedValue(new Error('proxy down'));
    (fetchBeersFromAPI as jest.Mock).mockRejectedValue(new Error('direct fetch failed'));

    await expect(fetchTaplistFromProxyOrDirect('13885')).rejects.toThrow('direct fetch failed');
  });

  it('throws when direct fetch fails (no proxy configured)', async () => {
    (config.enrichment.isConfigured as jest.Mock).mockReturnValue(false);
    (fetchBeersFromAPI as jest.Mock).mockRejectedValue(new Error('network error'));

    await expect(fetchTaplistFromProxyOrDirect('13885')).rejects.toThrow('network error');
  });

  describe('classification of non-data outcomes from the direct fetch', () => {
    // `requireRows` threw a plain `Error` for `unavailable` and `malformed`,
    // and `createErrorResponse` has no rule that recovers a type from a
    // message — so both arrived at the user as UNKNOWN_ERROR. The sibling
    // paths already report the same conditions as typed errors
    // (`fetchAndUpdateAllBeers` returns VALIDATION_ERROR for a missing
    // `all_beers_api_url`; `decideRewards` returns MALFORMED_RESPONSE_ERROR),
    // so the same condition read differently depending on which entry point
    // the user happened to trigger.
    //
    // These assert the classification a caller can act on, not the message —
    // the message is what the old code forced callers to parse.
    it('preserves a validation error when the taplist URL is not configured', async () => {
      (fetchBeersFromAPI as jest.Mock).mockResolvedValue(unavailable('not-configured'));

      const error = await fetchTaplistFromProxyOrDirect('13885').catch(e => e);

      expect(createErrorResponse(error).type).toBe(ApiErrorType.VALIDATION_ERROR);
    });

    it('preserves a validation error when the taplist source is not applicable', async () => {
      (fetchBeersFromAPI as jest.Mock).mockResolvedValue(unavailable('not-applicable'));

      const error = await fetchTaplistFromProxyOrDirect('13885').catch(e => e);

      expect(createErrorResponse(error).type).toBe(ApiErrorType.VALIDATION_ERROR);
    });

    it('preserves a malformed-response error when the body cannot be used', async () => {
      (fetchBeersFromAPI as jest.Mock).mockResolvedValue(malformed('brewInStock was not an array'));

      const error = await fetchTaplistFromProxyOrDirect('13885').catch(e => e);

      expect(createErrorResponse(error).type).toBe(ApiErrorType.MALFORMED_RESPONSE_ERROR);
    });

    it('still returns no rows for a confirmed-empty taplist, leaving the verdict downstream', async () => {
      // Deliberately NOT an error here. `fetchAndUpdateAllBeers` rejects an
      // empty taplist as a VALIDATION_ERROR with a message about beer data,
      // which is a better answer than anything this helper could give.
      (fetchBeersFromAPI as jest.Mock).mockResolvedValue(confirmedEmpty());

      await expect(fetchTaplistFromProxyOrDirect('13885')).resolves.toEqual(
        expect.objectContaining({ beers: [], usedProxy: false })
      );
    });
  });

  it('returns etag as null when proxy does not return one', async () => {
    (config.enrichment.isConfigured as jest.Mock).mockReturnValue(true);
    (fetchBeersFromProxy as jest.Mock).mockResolvedValue({
      beers: [
        {
          id: 'beer-1',
          brew_name: 'Test IPA',
          brewer: 'Brewery 1',
          brewer_loc: 'TX',
          brew_style: 'IPA',
          brew_container: 'pint',
          review_count: '5',
          review_rating: '4.2',
          brew_description: null,
          added_date: '2024-01-01',
          enriched_abv: null,
          enrichment_confidence: null,
          enrichment_source: null,
          has_cleaned_description: false,
        },
      ],
      source: 'live',
    });

    const result = await fetchTaplistFromProxyOrDirect('13885');

    expect(result.etag).toBeNull();
  });

  it('returns etag from proxy response when present', async () => {
    (config.enrichment.isConfigured as jest.Mock).mockReturnValue(true);
    (fetchBeersFromProxy as jest.Mock).mockResolvedValue({
      beers: [
        {
          id: 'beer-1',
          brew_name: 'Test IPA',
          brewer: 'Brewery 1',
          brewer_loc: 'TX',
          brew_style: 'IPA',
          brew_container: 'pint',
          review_count: '5',
          review_rating: '4.2',
          brew_description: null,
          added_date: '2024-01-01',
          enriched_abv: null,
          enrichment_confidence: null,
          enrichment_source: null,
          has_cleaned_description: false,
        },
      ],
      source: 'cache',
      etag: '"abc123"',
    });

    const result = await fetchTaplistFromProxyOrDirect('13885');

    expect(result.etag).toBe('"abc123"');
  });

  it('returns etag as null on fallback path', async () => {
    (config.enrichment.isConfigured as jest.Mock).mockReturnValue(false);
    (fetchBeersFromAPI as jest.Mock).mockResolvedValue(
      fetchedRows([{ id: 'beer-1', brew_name: 'Test', brewer: 'B' }])
    );

    const result = await fetchTaplistFromProxyOrDirect('13885');

    expect(result.etag).toBeNull();
  });
});
