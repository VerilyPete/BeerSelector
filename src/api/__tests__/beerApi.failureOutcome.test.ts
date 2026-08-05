/**
 * Transport failures must arrive as `failed`, not as a thrown error.
 *
 * Plan 05 Phase 5.3.
 *
 * `FetchedSource` has declared a `failed` arm since 02 Phase 1, and nothing has
 * ever constructed it: all three fetchers ended in `catch (error) { throw error }`,
 * so every offline, HTTP-error and timeout case left by the exception path. The
 * "exhaustive outcome handling" 02 Phase 3 gave the consumers was therefore
 * bypassed for the single most common real-world failure on a weak link.
 *
 * It was *safe* — the callers all have catches — but not *correct*: the caller
 * got a string to re-parse instead of the typed error the union exists to carry.
 * `createErrorResponse` classifies by message substring, so a 500's
 * "Failed to fetch: 500" matched the 'Failed to fetch' network test and was
 * reported to the user as "check your internet connection".
 *
 * The axis cut this must not blur (see fetchOutcome.ts): a body that ARRIVED and
 * could not be used is `fetched` + `malformed` — a statement about a body. Only
 * the request itself failing is `failed`. The third test in each group is what
 * pins that boundary.
 */

import { fetchBeersFromAPI, fetchMyBeersFromAPI, fetchRewardsFromAPI } from '../beerApi';
import * as preferences from '../../database/preferences';
import { ApiErrorType } from '../../utils/notificationUtils';
import type { FetchOutcome, UnconditionalSource } from '../fetchOutcome';

jest.mock('../../database/preferences');

global.fetch = jest.fn();

const memberPrefs = (urlKey: string) => (key: string) => {
  if (key === 'is_visitor_mode') return Promise.resolve('false');
  if (key === urlKey) return Promise.resolve('https://example.com/data.json');
  return Promise.resolve(null);
};

/**
 * Drive a fetcher to completion.
 *
 * `jest.setup.js` calls `jest.useFakeTimers()` for EVERY suite, so the backoff
 * `setTimeout` inside fetchWithRetry never fires on its own — the promise simply
 * never settles and the test dies by timeout with nothing to say. Advancing well
 * past the retry schedule is what makes these tests about outcomes rather than
 * about timers.
 *
 * Not every suite is affected: `beerApi.test.ts` restores real timers in an
 * `afterEach` on its `fetchWithRetry` block, so the rest of that file runs on
 * real timers and needs no advance. Do not assume fake timers are active
 * wherever you happen to be.
 */
const settle = async <T>(pending: Promise<T>): Promise<T> => {
  await jest.advanceTimersByTimeAsync(60_000);
  return pending;
};

const respondWith = (body: unknown, ok = true, status = 200): void => {
  (global.fetch as jest.Mock).mockResolvedValue({
    ok,
    status,
    statusText: ok ? 'OK' : 'Internal Server Error',
    json: async () => body,
  });
};

/**
 * Each fetcher, with the preference key it reads and a 200 body it cannot use.
 *
 * Driven as a table because the three fetchers must agree: a divergence here is
 * exactly how the empty-vs-missing distinction got lost the first time.
 */
type FetcherCase = {
  readonly name: string;
  readonly urlKey: string;
  /**
   * Rows widened to `unknown` so the three fetchers share one signature — every
   * assertion here is on `status` and `kind`, which is the point of the table.
   *
   * `UnconditionalSource`, NOT `FetchedSource`. Since the former is assignable
   * to the latter, declaring this wide would let a regression that widens a
   * fetcher's signature back to `FetchedSource` still typecheck — forfeiting the
   * narrowing at the one place it would be caught.
   */
  readonly call: () => Promise<UnconditionalSource<FetchOutcome<unknown>>>;
  readonly unusableBody: unknown;
};

const FETCHERS: readonly FetcherCase[] = [
  {
    name: 'fetchBeersFromAPI',
    urlKey: 'all_beers_api_url',
    call: fetchBeersFromAPI,
    unusableBody: { nothing: 'recognisable' },
  },
  {
    name: 'fetchMyBeersFromAPI',
    urlKey: 'my_beers_api_url',
    call: fetchMyBeersFromAPI,
    unusableBody: { nothing: 'recognisable' },
  },
  {
    name: 'fetchRewardsFromAPI',
    urlKey: 'my_beers_api_url',
    call: fetchRewardsFromAPI,
    unusableBody: { nothing: 'recognisable' },
  },
];

describe.each(FETCHERS)('$name failure outcomes', ({ urlKey, call, unusableBody }) => {
  beforeEach(() => {
    jest.clearAllMocks();
    (preferences.getPreference as jest.Mock).mockImplementation(memberPrefs(urlKey));
  });

  it('returns failed rather than throwing when the network is unavailable', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new TypeError('Network request failed'));

    const outcome = await settle(call());

    expect(outcome.status).toBe('failed');
    if (outcome.status === 'failed') {
      expect(outcome.error.type).toBe(ApiErrorType.NETWORK_ERROR);
    }
  });

  it('classifies a non-ok HTTP response as a server error, not a network error', async () => {
    respondWith({}, false, 500);

    const outcome = await settle(call());

    expect(outcome.status).toBe('failed');
    if (outcome.status === 'failed') {
      // Before HttpError, fetchWithRetry threw "Failed to fetch: 500 …", which
      // createErrorResponse's 'Failed to fetch' substring test read as a network
      // error — so a server fault told the user to check their connection and
      // counted toward allNetworkErrors, which picks the offline alert.
      expect(outcome.error.type).toBe(ApiErrorType.SERVER_ERROR);
    }
  });

  it('returns fetched/malformed — not failed — for a 200 with an unusable body', async () => {
    // The axis cut. A body arrived; that it was unusable is a fact about the
    // BODY, and collapsing it into `failed` would undo what 02 spent five phases
    // establishing — and would let a caller "retry" a request that will return
    // the identical unusable body every time.
    respondWith(unusableBody);

    const outcome = await settle(call());

    expect(outcome.status).toBe('fetched');
    if (outcome.status === 'fetched') {
      expect(outcome.data.kind).toBe('malformed');
    }
  });

  it('exhausts the retry budget before reporting failure, and still does not reject', async () => {
    // The `resolves` half alone was strictly dominated by the first test, which
    // awaits the same call with the same mock — no mutation existed that this
    // caught and that one did not. The call count is the assertion only this
    // test can make, and nothing else in the suite pins the default retry
    // budget: `settle` advances 60s of virtual time, so raising `retries` from
    // 3 to 8 would otherwise pass unnoticed.
    (global.fetch as jest.Mock).mockRejectedValue(new TypeError('Network request failed'));

    await expect(settle(call())).resolves.toBeDefined();
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('reports a timed-out request as failed', async () => {
    // The commit claims "offline, HTTP-error and timeout"; the first two were
    // covered here and the third only against `fetchWithRetry` directly. This is
    // the timeout crossing a whole fetcher.
    (global.fetch as jest.Mock).mockImplementation(
      (_url: string, options: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => {
            const abort = new Error('The operation was aborted');
            abort.name = 'AbortError';
            reject(abort);
          });
        })
    );

    const outcome = await settle(call());

    expect(outcome.status).toBe('failed');
    if (outcome.status === 'failed') {
      expect(outcome.error.type).toBe(ApiErrorType.NETWORK_ERROR);
    }
  });
});
