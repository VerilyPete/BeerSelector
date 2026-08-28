import { vi, type Mock, describe, it, expect, beforeEach } from 'vitest';
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
import { ApiErrorType, getUserFriendlyErrorMessage } from '../../utils/notificationUtils';
import type { FetchOutcome, UnconditionalSource } from '../fetchOutcome';

vi.mock('../../database/preferences');

global.fetch = vi.fn();

const memberPrefs = (urlKey: string) => (key: string) => {
  if (key === 'is_visitor_mode') return Promise.resolve('false');
  if (key === urlKey) return Promise.resolve('https://example.com/data.json');
  return Promise.resolve(null);
};

/**
 * Drive a fetcher to completion.
 *
 * `src/__vitest__/setup.ts` calls `vi.useFakeTimers()` for EVERY suite, so the backoff
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
  await vi.advanceTimersByTimeAsync(60_000);
  return pending;
};

const respondWith = (body: unknown, ok = true, status = 200): void => {
  (global.fetch as Mock).mockResolvedValue({
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
    vi.clearAllMocks();
    (preferences.getPreference as Mock).mockImplementation(memberPrefs(urlKey));
  });

  it('returns failed rather than throwing when the network is unavailable', async () => {
    (global.fetch as Mock).mockRejectedValue(new TypeError('Network request failed'));

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
    (global.fetch as Mock).mockRejectedValue(new TypeError('Network request failed'));

    await expect(settle(call())).resolves.toBeDefined();
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('reports a timed-out request as failed', async () => {
    // The commit claims "offline, HTTP-error and timeout"; the first two were
    // covered here and the third only against `fetchWithRetry` directly. This is
    // the timeout crossing a whole fetcher.
    (global.fetch as Mock).mockImplementation(
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

/**
 * A body that could not be READ is not the same fault as a body of the wrong SHAPE.
 *
 * Plan refresh-failure-classification Phase 1.
 *
 * `attemptFetch` filed every `response.json()` rejection as
 * `MalformedResponseError` and refused to retry it — so a body truncated or
 * replaced by a stuttering link was reported to the user as a deliberate act of
 * the server ("The server sent data this app could not read"), a classification
 * `allNetworkErrors` does not count. Because that check is an `.every(...)`, ONE
 * such source suppressed the connection advice for the entire refresh.
 *
 * Three causes remain indistinguishable and none is ranked here: a body
 * truncated by a stalling link, a transient non-JSON body from the origin, and
 * an interposed non-JSON body. `UNREADABLE_BODY_ERROR` therefore means "the body
 * could not be read, and one transient retry is warranted" — NOT "a transport
 * fault". It deliberately does not count toward `allNetworkErrors`; see the
 * table in `dataUpdateService.manualRefresh.test.ts`.
 */
describe('a body that could not be read', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (preferences.getPreference as Mock).mockImplementation(memberPrefs('my_beers_api_url'));
  });

  /**
   * A 200 whose body is not JSON, parsed by the real parser.
   *
   * Deliberately NOT a hand-thrown `SyntaxError` with invented text: the leak
   * fence below is about what V8 actually puts in that message, and inventing it
   * would let the fence pass against a message shape the runtime never produces.
   */
  const respondWithUnparseableBody = (body: string): void => {
    (global.fetch as Mock).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => JSON.parse(body),
    });
  };

  const abortError = (): Error => {
    const error = new Error('The operation was aborted');
    error.name = 'AbortError';
    return error;
  };

  it('is classified apart from a body of the wrong shape', async () => {
    respondWithUnparseableBody('<html>Sign in to continue</html>');

    const outcome = await settle(fetchMyBeersFromAPI());

    expect(outcome.status).toBe('failed');
    if (outcome.status === 'failed') {
      // Was MALFORMED_RESPONSE_ERROR, which asserts the SERVER chose to send
      // this. Nothing here knows that.
      expect(outcome.error.type).toBe(ApiErrorType.UNREADABLE_BODY_ERROR);
    }
  });

  it('describes the fault without carrying the body into the message', async () => {
    // THE LEAK FENCE. V8 embeds a body excerpt in the parser's own message —
    // `JSON.parse('<html>Sign in…')` yields
    // `Unexpected token '<', "<html>Sign"... is not valid JSON` on the pinned
    // Node — while Hermes does not. Interpolating it would put the response body
    // in `ErrorResponse.message`: caught in CI, silent on device. The cause is
    // carried as `cause`, never as text.
    //
    // `JSON.stringify` ALONE is insufficient — `Error.message` on
    // `originalError` is non-enumerable, so it inspects only the plain fields —
    // which is why the direct `message` check is here too. Nothing in this phase
    // puts a body anywhere; this is the forward fence for evidence capture.
    respondWithUnparseableBody('<html>Sign in to continue</html>');

    const outcome = await settle(fetchMyBeersFromAPI());

    expect(outcome.status).toBe('failed');
    if (outcome.status === 'failed') {
      expect(outcome.error.message).not.toContain('<html>');
      expect(JSON.stringify(outcome.error)).not.toContain('<html>');
      expect(getUserFriendlyErrorMessage(outcome.error)).not.toContain('<html>');
    }
  });

  it('tells the user their network may be interfering, not that the server is at fault', async () => {
    respondWithUnparseableBody('<html>Sign in to continue</html>');

    const outcome = await settle(fetchMyBeersFromAPI());

    expect(outcome.status).toBe('failed');
    if (outcome.status === 'failed') {
      expect(getUserFriendlyErrorMessage(outcome.error)).toBe(
        'Could not read the beer data — your network may be interfering with the connection. Check your connection and try refreshing again. Your existing data has been kept.'
      );
    }
  });

  it('reports an abort raised during the body read as a network fault, not an unreadable body', async () => {
    // The ORDER of the two checks in the catch, which is the whole property:
    // the deadline is asked about first, so a chain that has already timed out
    // cannot be mistaken for a body worth re-fetching and spend the budget it
    // no longer has. Swap the two and this dies.
    (global.fetch as Mock).mockImplementation((_url: string, options: { signal: AbortSignal }) =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () =>
          new Promise((_resolve, reject) => {
            options.signal.addEventListener('abort', () => reject(abortError()));
          }),
      })
    );

    const outcome = await settle(fetchMyBeersFromAPI());

    expect(outcome.status).toBe('failed');
    if (outcome.status === 'failed') {
      expect(outcome.error.type).toBe(ApiErrorType.NETWORK_ERROR);
    }
  });

  it('types an abort that is not an Error at all', async () => {
    // The abort route that actually fires is `fetch()` itself, and the value it
    // rejects with is not this function's to choose. A non-`Error` rejection
    // skips the whole `instanceof Error` block in `createErrorResponse` and
    // lands on UNKNOWN_ERROR with the literal 'An unknown error occurred' —
    // losing the classification AND the message. Asking the controller rather
    // than inspecting the value is what covers `Error`, `DOMException` and this
    // uniformly.
    //
    // Deliberately NOT the `abortError()` helper the sibling suites use: that
    // builds a real `Error` named 'AbortError', which passes through the name
    // route and gives a false green. The installed whatwg-fetch shim never
    // produces this shape, so treat it as a forward fence on the rule rather
    // than as the case the rule exists for.
    (global.fetch as Mock).mockImplementation(
      (_url: string, options: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () =>
            reject({ name: 'AbortError', message: 'Aborted' })
          );
        })
    );

    const outcome = await settle(fetchMyBeersFromAPI());

    expect(outcome.status).toBe('failed');
    if (outcome.status === 'failed') {
      expect(outcome.error.type).toBe(ApiErrorType.NETWORK_ERROR);
    }
  });

  it('types an Error-shaped abort of the request the same way', async () => {
    // A DUPLICATE, stated as one: 'reports a timed-out request as failed' above
    // already drives a deadline abort through a whole fetcher and asserts
    // NETWORK_ERROR. Kept because it fences the new typed exit locally, next to
    // the non-`Error` case it must agree with — not because it adds coverage.
    (global.fetch as Mock).mockImplementation(
      (_url: string, options: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => reject(abortError()));
        })
    );

    const outcome = await settle(fetchMyBeersFromAPI());

    expect(outcome.status).toBe('failed');
    if (outcome.status === 'failed') {
      expect(outcome.error.type).toBe(ApiErrorType.NETWORK_ERROR);
    }
  });
});
