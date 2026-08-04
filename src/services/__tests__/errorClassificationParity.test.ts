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
import {
  confirmedEmpty,
  malformed,
  unavailable,
} from '../../api/__tests__/helpers/fetchOutcomeFixtures';
import { ApiErrorType, getUserFriendlyErrorMessage } from '../../utils/notificationUtils';
import { getPreference } from '../../database/preferences';
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

/**
 * Type parity was never the whole job.
 *
 * The block above deliberately asserts type rather than message, and says so.
 * That is right for UNKNOWN_ERROR and MALFORMED_RESPONSE_ERROR, whose renderers
 * discard `error.message` — reaching them IS the fix. It is not right for
 * VALIDATION_ERROR: `getUserFriendlyErrorMessage` returns its message verbatim
 * (`notificationUtils.ts:275`), so for that one type the message is not a
 * developer detail behind the classification, it is the classification's entire
 * user-visible output. A suite that forbids UNKNOWN_ERROR and then lets
 * VALIDATION_ERROR carry `not-configured: all_beers_api_url is not set` has
 * moved the leak, not closed it.
 *
 * These tests therefore assert what a person reads, and they assert it
 * negatively — no reason code, no snake_case preference name — because the
 * failure mode is prose nobody meant to publish rather than any specific wrong
 * sentence.
 */
describe('the message a user actually reads', () => {
  // Every internal identifier that has reached, or could reach, an alert
  // through the VALIDATION_ERROR renderer. Kept as one list so a new leak of
  // the same shape fails here rather than needing a new test.
  const developerProse = /_api_url|not-configured|not-applicable|unavailable \(/;

  // An unconfigured taplist, stated coherently: the preference really is unset,
  // AND the fetcher reports what it reports when the preference is unset. An
  // earlier draft mocked only the fetcher and left the preference reading as
  // configured — which put the DIRECT path into `requireRows` too and made both
  // paths leak identically, hiding the asymmetry behind a passing parity test.
  //
  // The asymmetry is real: `fetchAndUpdateAllBeers:906` returns authored copy on
  // `!apiUrl` before it fetches; `prepareAllBeers:1692` reads the same value,
  // takes `storeId = null` from it, and carries on into the fetch.
  const taplistUrlUnset = () => {
    (getPreference as jest.Mock).mockImplementation(async (key: string) =>
      key === 'all_beers_api_url' ? null : key === 'my_beers_api_url' ? 'https://x/my.json' : null
    );
    (fetchBeersFromAPI as jest.Mock).mockResolvedValue(
      unavailable('not-configured', 'all_beers_api_url is not set')
    );
  };

  it('names no internal identifier when the taplist URL is unset, on either path', async () => {
    taplistUrlUnset();

    const direct = await fetchAndUpdateAllBeers();
    const sequential = await sequentialRefreshAllData();

    // The direct path already has authored copy. It is asserted first as the
    // reference, so a regression THERE cannot be mistaken for parity here.
    expect(getUserFriendlyErrorMessage(direct.error!)).not.toMatch(developerProse);
    expect(getUserFriendlyErrorMessage(sequential.allBeersResult.error!)).not.toMatch(
      developerProse
    );
  });

  it('reads the same on both taplist paths, not merely the same type', async () => {
    taplistUrlUnset();

    const direct = await fetchAndUpdateAllBeers();
    const sequential = await sequentialRefreshAllData();

    expect(getUserFriendlyErrorMessage(sequential.allBeersResult.error!)).toBe(
      getUserFriendlyErrorMessage(direct.error!)
    );
  });

  it('names no internal identifier when a member has no my-beers URL', async () => {
    // `prepareMyBeers` routes `not-applicable` to a quiet success, so the arm
    // that still throws is `not-configured` — a member whose my_beers_api_url
    // never got written. It threw a plain Error, which is UNKNOWN_ERROR, whose
    // renderer also returns the message verbatim.
    (fetchMyBeersFromAPI as jest.Mock).mockResolvedValue(
      unavailable('not-configured', 'my_beers_api_url is not set')
    );

    const result = await sequentialRefreshAllData();

    expect(result.myBeersResult.success).toBe(false);
    expect(result.myBeersResult.error?.type).not.toBe(ApiErrorType.UNKNOWN_ERROR);
    expect(getUserFriendlyErrorMessage(result.myBeersResult.error!)).not.toMatch(developerProse);
  });

  it('keeps parser text out of the alert when my beers arrives unusable', async () => {
    // The third instance of the same defect, one line from the second:
    // `requireRows` types a malformed body as MALFORMED_RESPONSE_ERROR
    // precisely so its copy can suppress the detail, and this path threw a
    // plain Error carrying that detail instead.
    (fetchMyBeersFromAPI as jest.Mock).mockResolvedValue(
      malformed('rows returned and none carried an id')
    );

    const result = await sequentialRefreshAllData();

    expect(result.myBeersResult.success).toBe(false);
    expect(result.myBeersResult.error?.type).toBe(ApiErrorType.MALFORMED_RESPONSE_ERROR);
    expect(getUserFriendlyErrorMessage(result.myBeersResult.error!)).not.toMatch(/carried an id/);
  });
});
