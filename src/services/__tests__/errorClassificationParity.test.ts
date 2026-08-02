/**
 * The same condition must classify the same way whichever entry point sees it.
 *
 * Written against a live defect, and kept as the thing that stops it returning.
 * The past tense below is deliberate: every step of this is fixed, and these
 * tests are what hold it fixed.
 *
 * `be4f6258` gave `requireRows` typed errors so that a missing URL or an
 * unusable body stopped arriving as UNKNOWN_ERROR — whose renderer returns
 * `error.message` verbatim, putting developer prose in a user-facing alert.
 * It fixed the helper and left the identical defect two functions away:
 * `prepareAllBeers` threw a plain `Error` for an empty taplist, so the
 * sequential/manual path produced UNKNOWN_ERROR for a condition the direct
 * path already reported as VALIDATION_ERROR.
 *
 * `43bd001a` then routed MORE traffic into it. An empty `brewInStock` used to
 * be `malformed`, which `be4f6258` types as MALFORMED_RESPONSE_ERROR with copy
 * written to suppress exactly this. Reclassifying it to `confirmed-empty` sent
 * it through `requireRows`' `[]` return and onto the untyped throw instead — so
 * the fix routed the case around its own improvement.
 *
 * `prepareAllBeers` now throws a typed `SourceFailureError` carrying
 * VALIDATION_ERROR, matching the direct path. Both writers classify the empty
 * taplist identically, and the three tests below are the only thing asserting
 * that they still do.
 *
 * These tests assert parity between entry points rather than a specific
 * message, because the message is the thing that leaks.
 */

import { fetchBeersFromAPI, fetchMyBeersFromAPI, fetchRewardsFromAPI } from '../../api/beerApi';
import { confirmedEmpty } from '../../api/__tests__/helpers/fetchOutcomeFixtures';
import { ApiErrorType } from '../../utils/notificationUtils';
import {
  sequentialRefreshAllData,
  fetchAndUpdateAllBeers,
  resetInFlightSequentialRefresh,
  dropInFlightTaplistFetch,
} from '../dataUpdateService';

jest.mock('../../database/preferences', () => ({
  getPreference: jest.fn(async (key: string) =>
    key === 'all_beers_api_url'
      ? 'https://fsbs.beerknurd.com/bk-store-json.php?sid=13885'
      : key === 'my_beers_api_url'
        ? 'https://example.com/mybeers.json'
        : null
  ),
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
    withDatabaseLock: jest.fn(async (_n: string, task: () => Promise<unknown>) => task()),
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

beforeEach(() => {
  jest.clearAllMocks();
  resetInFlightSequentialRefresh();
  dropInFlightTaplistFetch();
  (fetchMyBeersFromAPI as jest.Mock).mockResolvedValue(confirmedEmpty());
  (fetchRewardsFromAPI as jest.Mock).mockResolvedValue(confirmedEmpty());
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('an empty taplist', () => {
  beforeEach(() => {
    // A well-formed response from a store with nothing on tap.
    (fetchBeersFromAPI as jest.Mock).mockResolvedValue(confirmedEmpty());
  });

  it('is a validation error on the direct path', async () => {
    const result = await fetchAndUpdateAllBeers();

    expect(result.success).toBe(false);
    expect(result.error?.type).toBe(ApiErrorType.VALIDATION_ERROR);
  });

  it('is the same validation error on the manual/focus path', async () => {
    // This is the arm that carried the defect. The sequential path threw a
    // plain Error, which `createErrorResponse` maps to UNKNOWN_ERROR, whose
    // renderer returns the message verbatim — so the user read "No valid beers
    // found in API response" in an alert. It throws a typed error now; this
    // assertion is what stops it going back.
    const result = await sequentialRefreshAllData();

    expect(result.allBeersResult.success).toBe(false);
    expect(result.allBeersResult.error?.type).toBe(ApiErrorType.VALIDATION_ERROR);
  });

  it('never reports an unclassified error on either path', async () => {
    // Stated separately and negatively: UNKNOWN_ERROR is the one classification
    // that leaks internal prose to the user, so it is worth forbidding by name
    // rather than only asserting the positive case.
    const direct = await fetchAndUpdateAllBeers();
    const sequential = await sequentialRefreshAllData();

    expect(direct.error?.type).not.toBe(ApiErrorType.UNKNOWN_ERROR);
    expect(sequential.allBeersResult.error?.type).not.toBe(ApiErrorType.UNKNOWN_ERROR);
  });
});
