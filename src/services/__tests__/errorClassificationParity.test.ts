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
import { logError } from '../../utils/errorLogger';
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
  // `mockReset`, because `clearAllMocks` clears call data and NOT
  // implementations. `taplistUrlUnset()` installs an unset-URL implementation on
  // `getPreference`, which otherwise persists into every later test in the file
  // — passing today only because the tests that follow it happen not to care,
  // and silently handing the next test appended here an unconfigured taplist.
  // Same leak found and fixed in `migrationDispatch.test.ts`; this is its twin,
  // caught by a second reviewer after the first.
  (getPreference as jest.Mock).mockReset();
  (getPreference as jest.Mock).mockImplementation(async (key: string) =>
    key === 'all_beers_api_url'
      ? 'https://fsbs.beerknurd.com/bk-store-json.php?sid=13885'
      : key === 'my_beers_api_url'
        ? 'https://example.com/mybeers.json'
        : null
  );
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
 * That is right for MALFORMED_RESPONSE_ERROR, whose renderer discards
 * `error.message` — reaching it IS the fix. It is not right for
 * VALIDATION_ERROR: `getUserFriendlyErrorMessage` returns its message verbatim,
 * so for that type the message is not a developer detail behind the
 * classification, it is the classification's entire user-visible output. A
 * suite that forbids UNKNOWN_ERROR and then lets VALIDATION_ERROR carry
 * `not-configured: all_beers_api_url is not set` has moved the leak, not closed
 * it.
 *
 * An earlier version of this paragraph grouped UNKNOWN_ERROR with
 * MALFORMED_RESPONSE_ERROR as a renderer that discards the message. It does
 * not — it publishes it, which is the whole reason the tests below forbid it by
 * name, and which this same file states correctly twice elsewhere. Forbidding
 * UNKNOWN_ERROR is worth doing because its copy is unauthored, not because it
 * is silent. Corrected after review.
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
  // The asymmetry is real: `fetchAndUpdateAllBeers` returns authored copy on
  // `!apiUrl` before it fetches; `prepareAllBeers` reads the same value, takes
  // `storeId = null` from it, and carries on into the fetch. (By symbol — both
  // line numbers this originally cited were already wrong when written.)
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

  // RELATIVE PLUS ABSOLUTE. The parity assertion above is relative — it dies if
  // one side moves and survives if BOTH do. Mutation testing showed exactly
  // that: changing `unavailableCopy`'s not-configured arm AND the direct path's
  // string to "Bananas." passed all 418 service tests. The authored copy is the
  // entire deliverable of this work and had no positive assertion anywhere in
  // the repo.
  //
  // This is the same trap `migrationDispatch.test.ts` documents against itself
  // — a literal 7 rather than `CURRENT_SCHEMA_VERSION - 1`, because the
  // relative form is vacuous against the mutation that matters. The reasoning
  // was there to copy and was not copied.
  //
  // Both sentences are asserted verbatim, so a reworded alert is a deliberate
  // act with a test to update, not a silent edit.
  it('says the authored sentence, not merely a clean one, for the taplist', async () => {
    taplistUrlUnset();

    const direct = await fetchAndUpdateAllBeers();

    expect(getUserFriendlyErrorMessage(direct.error!)).toBe(
      'All beers API URL not set. Please log in to configure API URLs.'
    );
  });

  it('says the authored sentence, not merely a clean one, for my beers', async () => {
    // The anchor this suite was missing. `fetchAndUpdateMyBeers` hardcodes this
    // exact sentence, so it is the direct-path reference for my-beers in the
    // same way `fetchAndUpdateAllBeers` is for the taplist — and it makes the
    // my-beers copy positively pinned rather than guarded only by "contains no
    // developer prose", which any wrong-but-tidy sentence satisfies.
    (fetchMyBeersFromAPI as jest.Mock).mockResolvedValue(
      unavailable('not-configured', 'my_beers_api_url is not set')
    );

    const result = await sequentialRefreshAllData();

    expect(getUserFriendlyErrorMessage(result.myBeersResult.error!)).toBe(
      'My beers API URL not set. Please log in to configure API URLs.'
    );
  });

  it('keeps developer prose out of the not-applicable arm too', async () => {
    // `unavailableCopy`'s second arm had ZERO coverage: mutating it to leak
    // `unavailable (not-applicable)` survived all 418 service tests. Worse, the
    // `developerProse` regex above lists `not-applicable` specifically, so that
    // alternation was dead weight — the suite could not produce the string it
    // was written to catch.
    //
    // Reachability is why it was untested: `beerApi.ts:299` only ever emits
    // `not-configured`, and `prepareMyBeers` intercepts `not-applicable` before
    // it reaches a throw. So this arm is defensive code today. It is tested
    // rather than deleted because the guarantee is about what a user reads, and
    // the first producer that does emit `not-applicable` should not be the
    // thing that discovers the copy was never checked.
    (fetchMyBeersFromAPI as jest.Mock).mockResolvedValue(
      unavailable('not-applicable', 'my_beers_api_url is a none:// placeholder')
    );
    (fetchBeersFromAPI as jest.Mock).mockResolvedValue(
      unavailable('not-applicable', 'all_beers_api_url is a none:// placeholder')
    );

    const sequential = await sequentialRefreshAllData();

    expect(getUserFriendlyErrorMessage(sequential.allBeersResult.error!)).not.toMatch(
      developerProse
    );
    expect(getUserFriendlyErrorMessage(sequential.allBeersResult.error!)).toBe(
      'All beers is not available for this account.'
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

  it('still records the detail it took out of the alert', async () => {
    // The other half of every fix in this block, and the half nothing asserted:
    // deleting all three new `logError` calls survived 418/418 tests. "Off the
    // alert, but kept for diagnosis" was a claim in a comment with no test
    // behind it — which on this branch is the defect, not merely a gap.
    //
    // Asserted on the reason code and the preference key together, because
    // those are precisely the two things removed from the user-facing string;
    // if they are absent here as well, the information is simply gone.
    taplistUrlUnset();

    await sequentialRefreshAllData();

    expect(logError).toHaveBeenCalledWith(
      expect.stringContaining('not-configured'),
      // `anything()`, not `objectContaining({ component: 'dataUpdateService' })`
      // — the module name is not the behaviour under test, and pinning it makes
      // a rename fail this for no user-visible reason.
      expect.anything()
    );
    expect(logError).toHaveBeenCalledWith(
      expect.stringContaining('all_beers_api_url'),
      expect.anything()
    );
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
