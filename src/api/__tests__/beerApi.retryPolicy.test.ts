import { vi, type Mock } from 'vitest';
/**
 * What `fetchWithRetry` retries, and how long the whole chain may take.
 *
 * Plan 05 Phase 5.4a. Sibling to `beerApi.timeout.test.ts`, which owns a single
 * attempt's deadline; this file owns the chain.
 *
 * Two defects, both recorded as still-open at the end of Phase 5.3:
 *
 * 1. **Every error was retried.** `createErrorResponse` now records that a 4xx is
 *    a client fault — the request was rejected on its merits and the identical
 *    request will be rejected again — yet the retry loop burned three attempts on
 *    it anyway. That is 4.75s of a weak link's refresh budget spent proving a
 *    point the classifier had already conceded.
 *
 * 2. **The deadline bounded each attempt, not the chain.** Three stalled attempts
 *    at 15s apiece plus backoff is ≈47.5s. Phase 5.0's comment claims the bound
 *    exists so a refresh cannot outlive the master lock's 15s hold; a bound that
 *    multiplies by the retry count does not deliver that, it only makes the
 *    overrun arrive in instalments.
 */

import { fetchWithRetry, fetchMyBeersFromAPI, MIN_ATTEMPT_MS } from '../beerApi';
import * as preferences from '../../database/preferences';
import { TransportAbortedError, UnreadableBodyError } from '../fetchOutcome';
import { config } from '@/src/config';

vi.mock('../../database/preferences');

global.fetch = vi.fn();

const abortError = (): Error => {
  const error = new Error('The operation was aborted');
  error.name = 'AbortError';
  return error;
};

/**
 * A 200 whose body is not JSON, parsed by the real parser.
 *
 * A fresh object per call so `mockResolvedValueOnce` chains read naturally.
 */
const unreadableBody = () => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  json: async () => JSON.parse('<html>Sign in to continue</html>'),
});

const serverError = () => ({ ok: false, status: 500, statusText: 'Internal Server Error' });

/**
 * `getPreference` for the two tests that drive a whole fetcher.
 *
 * There is no `src/database/__mocks__/preferences.ts`, so the bare `jest.mock`
 * above automocks it to `undefined`, and the suite's `resetAllMocks` in
 * `beforeEach` would discard anything installed at module scope.
 */
const installMemberPrefs = (): void => {
  (preferences.getPreference as Mock).mockImplementation((key: string) => {
    if (key === 'is_visitor_mode') return Promise.resolve('false');
    if (key === 'my_beers_api_url') return Promise.resolve('https://example.com/my.json');
    return Promise.resolve(null);
  });
};

/**
 * Record every attempt's signal, and never settle on our own.
 *
 * Asserting on the signal is what lets a test distinguish per-attempt from
 * per-chain: both implementations leave the promise pending at the same instant,
 * and differ only in whose deadline has fired.
 */
const capturedSignals = (): AbortSignal[] => {
  const signals: AbortSignal[] = [];
  (global.fetch as Mock).mockImplementation((_url: string, options: { signal: AbortSignal }) => {
    signals.push(options.signal);
    return new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(abortError()));
    });
  });
  return signals;
};

describe('fetchWithRetry retry policy', () => {
  beforeEach(() => {
    // `resetAllMocks`, NOT `clearAllMocks`. The latter clears call records and
    // leaves the `mockResolvedValueOnce` queue intact, so a test that makes
    // fewer attempts than it queued responses — which is precisely what the
    // no-retry cases below do — hands its leftovers to whichever test runs next.
    // That is how the 404 case came to be served the 200 the 400 case never
    // used, and it is the same leak `beerApi.test.ts` was found carrying in
    // Phase 5.2, reached from the other direction.
    vi.resetAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('which failures are worth a second attempt', () => {
    /**
     * Both sides of the cut, and the two statuses that sit on it.
     *
     * Driven as a table because a single 502 example leaves the boundary
     * unpinned: mutating the policy to `<= 500` — which stops retrying the most
     * common server error there is — kept a 502-only test green. The 400/500
     * pair is what makes the comparison itself load-bearing rather than just the
     * hundreds digit.
     */
    const STATUSES: readonly {
      status: number;
      statusText: string;
      attempts: number;
      why: string;
    }[] = [
      { status: 400, statusText: 'Bad Request', attempts: 1, why: 'rejected on its merits' },
      { status: 404, statusText: 'Not Found', attempts: 1, why: 'rejected on its merits' },
      { status: 500, statusText: 'Internal Server Error', attempts: 2, why: 'may be transient' },
      { status: 502, statusText: 'Bad Gateway', attempts: 2, why: 'may be transient' },
    ];

    it.each(STATUSES)(
      'makes $attempts attempt(s) for a $status — $why',
      async ({ status, statusText, attempts }) => {
        const payload = { brewInStock: [] };
        (global.fetch as Mock)
          .mockResolvedValueOnce({ ok: false, status, statusText })
          .mockResolvedValueOnce({ ok: true, json: async () => payload });

        const result = fetchWithRetry(config.api.baseUrl, 3, 10);
        // Attached before advancing: a non-retried status rejects, and an
        // unhandled rejection would be reported instead of the assertion.
        const settled = result.then(
          () => 'resolved',
          () => 'rejected'
        );

        // Past every backoff a retrying implementation would have taken, so the
        // call count below is the finished total rather than a snapshot.
        await vi.advanceTimersByTimeAsync(1000);

        expect(global.fetch).toHaveBeenCalledTimes(attempts);
        expect(await settled).toBe(attempts === 1 ? 'rejected' : 'resolved');
      }
    );

    it('retries a body that will not parse exactly once', async () => {
      // INVERTED. The old policy read the body the way it reads a 4xx: the same
      // request returns the same unusable answer, so do not ask twice. That is
      // true of a captive-portal login page and false of a truncation — and
      // `attemptFetch` cannot tell them apart, so it was choosing the answer
      // that is wrong for a weak link, which is the case this whole file exists
      // for. One retry, inside the deadline already computed.
      const payload = { brewInStock: [] };
      (global.fetch as Mock)
        .mockResolvedValueOnce(unreadableBody())
        .mockResolvedValueOnce({ ok: true, json: async () => payload });

      const result = fetchWithRetry(config.api.baseUrl, 3, 10);
      await vi.advanceTimersByTimeAsync(1000);

      await expect(result).resolves.toEqual(payload);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('spends at most two requests on a body that never parses', async () => {
      // The cap, and the ONLY test that pins it: nothing else in this suite
      // reaches a second unreadable attempt, so both "cap 1 -> 2" and "cap not
      // decremented" survive the rest of the set. A captive portal is still a
      // captive portal on the second ask; the retry buys one chance at a
      // truncation, not a loop.
      (global.fetch as Mock).mockResolvedValue(unreadableBody());

      const result = fetchWithRetry(config.api.baseUrl, 3, 10);
      const rejection = expect(result).rejects.toThrow(UnreadableBodyError);

      await vi.advanceTimersByTimeAsync(1000);

      expect(global.fetch).toHaveBeenCalledTimes(2);
      await rejection;
    });

    it('does not renew the chain deadline for the retried attempt', async () => {
      // The retry must not lengthen the per-source bound. Attempt 2 inherits
      // whatever attempt 1 and the backoff left, so at exactly T=timeout it is
      // already aborted; a renewed deadline would leave it `backoff` still to
      // run and this single assertion is the whole difference.
      //
      // `signals[1]`, NOT `signals[0]`: attempt 1's own `finally` clears its
      // timer, so its signal reads `false` forever. The length assertion is what
      // stops this quietly becoming an assertion about attempt 1.
      const signals: AbortSignal[] = [];
      let calls = 0;
      (global.fetch as Mock).mockImplementation(
        (_url: string, options: { signal: AbortSignal }) => {
          signals.push(options.signal);
          calls += 1;
          if (calls === 1) return Promise.resolve(unreadableBody());
          return new Promise((_resolve, reject) => {
            options.signal.addEventListener('abort', () => reject(abortError()));
          });
        }
      );

      const backoff = 1000;
      const result = fetchWithRetry(config.api.baseUrl, 3, backoff);
      const rejection = expect(result).rejects.toThrow(TransportAbortedError);

      await vi.advanceTimersByTimeAsync(config.network.timeout);

      expect(signals).toHaveLength(2);
      expect(signals[1].aborted).toBe(true);
      await rejection;
    });

    it('cannot exceed the total attempt budget when unreadable follows a 500', async () => {
      // 500, unreadable, 500 against a budget of 3. The unreadable retry spends
      // one of the SAME attempts the ordinary retry spends; it does not open a
      // second budget beside it.
      //
      // Kills "`retries` not decremented" and "the ordinary retry DECREMENTS the
      // unreadable cap" — the latter would stop at 2, because attempt 2 would
      // find the cap already spent by attempt 1's ordinary retry.
      (global.fetch as Mock)
        .mockResolvedValueOnce(serverError())
        .mockResolvedValueOnce(unreadableBody())
        .mockResolvedValueOnce(serverError());

      const result = fetchWithRetry(config.api.baseUrl, 3, 10);
      const rejection = expect(result).rejects.toThrow('HTTP 500 Internal Server Error');

      await vi.advanceTimersByTimeAsync(1000);

      expect(global.fetch).toHaveBeenCalledTimes(3);
      await rejection;
    });

    it('does not refill the unreadable cap when an ordinary retry passes through', async () => {
      // unreadable, 500, unreadable against a budget of 4. The cap is spent by
      // attempt 1 and must still read as spent at attempt 3, with an ordinary
      // retry in between.
      //
      // SEPARATE from the test above, and it has to be: at 500/unreadable/500
      // the mutant "the ordinary retry RESETS the cap to 1" produces the same
      // three calls as the correct code, because the cap is not yet spent when
      // the reset happens. Only a sequence whose unreadable attempt comes FIRST
      // can see the difference. (The plan claimed one test killed both; it does
      // not.)
      (global.fetch as Mock)
        .mockResolvedValueOnce(unreadableBody())
        .mockResolvedValueOnce(serverError())
        .mockResolvedValueOnce(unreadableBody());

      const result = fetchWithRetry(config.api.baseUrl, 4, 10);
      const rejection = expect(result).rejects.toThrow(UnreadableBodyError);

      await vi.advanceTimersByTimeAsync(1000);

      expect(global.fetch).toHaveBeenCalledTimes(3);
      await rejection;
    });

    it('does not spend an unreadable retry once the overall cap is nearly gone', async () => {
      // 500, 500, unreadable. The `retries > 1` condition must be re-checked in
      // the unreadable branch, because that branch is evaluated BEFORE the
      // shared `retries <= 1` exit further down. Without the re-check this makes
      // a fourth request the budget does not have.
      (global.fetch as Mock)
        .mockResolvedValueOnce(serverError())
        .mockResolvedValueOnce(serverError())
        .mockResolvedValueOnce(unreadableBody());

      const result = fetchWithRetry(config.api.baseUrl, 3, 10);
      const rejection = expect(result).rejects.toThrow(UnreadableBodyError);

      await vi.advanceTimersByTimeAsync(1000);

      expect(global.fetch).toHaveBeenCalledTimes(3);
      await rejection;
    });

    it('does not retry past the original deadline boundary', async () => {
      // The deadline guard is re-checked in this branch for the same reason as
      // `retries`: the unreadable exit is evaluated before the shared one.
      (global.fetch as Mock).mockResolvedValue(unreadableBody());

      const result = fetchWithRetry(config.api.baseUrl, 3, config.network.timeout);
      const rejection = expect(result).rejects.toThrow(UnreadableBodyError);

      await vi.advanceTimersByTimeAsync(config.network.timeout + 1);

      expect(global.fetch).toHaveBeenCalledTimes(1);
      await rejection;
    });

    it('does not start an attempt that cannot plausibly complete', async () => {
      // `MIN_ATTEMPT_MS` reserves enough budget for the attempt to be worth
      // making. Without it the guard permits a recursion that arms
      // `setTimeout(abort, deadline - Date.now())` with a few milliseconds left
      // — an attempt born dead that still costs the server a request.
      //
      // SEPARATE from the test above, and it has to be: at the obvious
      // `delay = timeout` the sleep already ends at the deadline, so removing
      // `MIN_ATTEMPT_MS` leaves that test green. This delay sits INSIDE the old
      // window and outside the new one, which is the only place the term is
      // observable.
      //
      // Pinned against the exported constant rather than a hard-coded 1000, so
      // changing the value does not silently make this test about nothing.
      (global.fetch as Mock).mockResolvedValue(unreadableBody());

      const result = fetchWithRetry(config.api.baseUrl, 3, config.network.timeout - MIN_ATTEMPT_MS);
      const rejection = expect(result).rejects.toThrow(UnreadableBodyError);

      await vi.advanceTimersByTimeAsync(config.network.timeout + 1);

      expect(global.fetch).toHaveBeenCalledTimes(1);
      await rejection;
    });

    it.each([
      // Absolute offsets, NOT expressed in terms of MIN_ATTEMPT_MS. The
      // boundary test above computes its delay as `timeout - MIN_ATTEMPT_MS`,
      // so input and guard move together and it is structurally blind to the
      // constant's VALUE: mutation showed both `MIN_ATTEMPT_MS = 0` and
      // `= 2000` survive it. Zero is the degenerate case the constant exists to
      // prevent — a backoff of `timeout - 500` again arms the abort with 500ms
      // left, an attempt born dead that still costs the server a request.
      //
      // These two bracket the value from both sides. With `delay = timeout - h`
      // and `Date.now()` still at the start (fake timers, first attempt settles
      // without advancing), the guard reduces to `MIN_ATTEMPT_MS < h` — so
      // refusing h=500 requires `>= 500` and allowing h=1500 requires `< 1500`.
      // The pair passes for exactly `[500, 1500)`: closed at the low end, open
      // at the high end. Confirmed by running the constant at 500, 1499 and
      // 1500 — the first two pass and the third fails.
      ['refuses to start an attempt with only 500ms of budget left', 500, 1],
      ['still starts an attempt with 1500ms of budget left', 1500, 2],
    ])('%s', async (_label, headroom, expectedCalls) => {
      (global.fetch as Mock).mockResolvedValue(unreadableBody());

      const result = fetchWithRetry(config.api.baseUrl, 3, config.network.timeout - headroom);
      const rejection = expect(result).rejects.toThrow(UnreadableBodyError);

      await vi.advanceTimersByTimeAsync(config.network.timeout + 1);

      expect(global.fetch).toHaveBeenCalledTimes(expectedCalls);
      await rejection;
    });

    it('waits the full backoff before the unreadable retry', async () => {
      // WHEN, not just whether. The suite pinned how many attempts happen and
      // whether the chain stays inside its deadline, and nothing pinned the
      // sleep at all — mutation showed `setTimeout(resolve, 0)` survives the
      // entire API set. With the sleep at zero the retry fires immediately at a
      // link that is truncating bodies, and the log line it emits
      // ("retrying once in ${delay}ms") becomes a lie.
      const payload = { brewInStock: [] };
      const backoff = 1000;
      (global.fetch as Mock)
        .mockResolvedValueOnce(unreadableBody())
        .mockResolvedValueOnce({ ok: true, json: async () => payload });

      const result = fetchWithRetry(config.api.baseUrl, 3, backoff);

      await vi.advanceTimersByTimeAsync(backoff - 1);
      expect(global.fetch).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(2);
      expect(global.fetch).toHaveBeenCalledTimes(2);
      await expect(result).resolves.toEqual(payload);
    });

    it('does not log a member identifier from the retried URL', async () => {
      const memberId = 'SENTINEL_MEMBER_12345';
      const memberUrl = `https://fsbs.beerknurd.com/bk-member-json.php?uid=${memberId}`;
      const payload = { brewInStock: [] };
      (global.fetch as Mock)
        .mockResolvedValueOnce(unreadableBody())
        .mockResolvedValueOnce({ ok: true, json: async () => payload });

      const result = fetchWithRetry(memberUrl, 3, 10);
      await vi.advanceTimersByTimeAsync(1000);
      await expect(result).resolves.toEqual(payload);

      const logged = JSON.stringify((console.log as Mock).mock.calls);
      expect(logged).toContain('2 retries left');
      expect(logged).not.toContain(memberId);
    });

    it.each([
      // Both recursion sites multiply the delay, and neither multiplication was
      // pinned: `delay * 1.5 -> delay` survived the whole API set at both. The
      // third attempt's START TIME is the only thing that distinguishes them.
      // At backoff 1000: correct is 0 -> 1000 -> 2500; flat is 0 -> 1000 -> 2000.
      ['across an unreadable retry', () => unreadableBody()],
      ['on the ordinary retry', () => serverError()],
    ])('grows the backoff %s', async (_label, first) => {
      (global.fetch as Mock)
        .mockResolvedValueOnce(first())
        .mockResolvedValueOnce(serverError())
        .mockResolvedValueOnce({ ok: true, json: async () => ({ brewInStock: [] }) });

      const result = fetchWithRetry(config.api.baseUrl, 3, 1000);
      const settled = result.then(
        () => 'resolved',
        () => 'rejected'
      );

      // Past a flat-backoff third attempt (2000) and short of a growing one (2500).
      await vi.advanceTimersByTimeAsync(2400);
      expect(global.fetch).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(200);
      expect(global.fetch).toHaveBeenCalledTimes(3);
      await settled;
    });

    it('reports the deadline abort, not the earlier unreadable body', async () => {
      // An `UnreadableBodyError` never BECOMES an `earlierFailure`. It is not
      // evidence of what the server is doing — that is the whole reason this
      // patch stopped filing it as the server's fault — so carrying it forward
      // would report the least informative thing that happened.
      let calls = 0;
      (global.fetch as Mock).mockImplementation(
        (_url: string, options: { signal: AbortSignal }) => {
          calls += 1;
          if (calls === 1) return Promise.resolve(unreadableBody());
          return new Promise((_resolve, reject) => {
            options.signal.addEventListener('abort', () => reject(abortError()));
          });
        }
      );

      const result = fetchWithRetry(config.api.baseUrl, 3, 1000);
      const rejection = expect(result).rejects.toThrow(TransportAbortedError);
      const notUnreadable = expect(result).rejects.not.toThrow(UnreadableBodyError);

      await vi.advanceTimersByTimeAsync(config.network.timeout + 1);

      await rejection;
      await notUnreadable;
    });

    it('preserves an earlier server error across an unreadable retry', async () => {
      // The unreadable retry passes the INCOMING `earlierFailure` through
      // unchanged. Passing `undefined` instead destroys an earlier `HttpError`
      // and reintroduces verbatim the defect the abort exit exists to prevent:
      // a server that answered 500 and then stalled would tell the user to check
      // a connection that demonstrably worked.
      //
      // Nothing else in the suite distinguishes pass-through from `undefined`.
      let calls = 0;
      (global.fetch as Mock).mockImplementation(
        (_url: string, options: { signal: AbortSignal }) => {
          calls += 1;
          if (calls === 1) return Promise.resolve(serverError());
          if (calls === 2) return Promise.resolve(unreadableBody());
          return new Promise((_resolve, reject) => {
            options.signal.addEventListener('abort', () => reject(abortError()));
          });
        }
      );

      const result = fetchWithRetry(config.api.baseUrl, 3, 1000);
      const rejection = expect(result).rejects.toThrow('HTTP 500 Internal Server Error');

      await vi.advanceTimersByTimeAsync(config.network.timeout + 1);

      expect(calls).toBe(3);
      await rejection;
    });

    it('never manufactures confirmed-empty from a body it could not read', async () => {
      // The retry must not turn "we could not read it" into "the server said
      // none" — `confirmed-empty` is the one outcome that authorises wiping the
      // local tasted table.
      //
      // In THIS suite rather than a service one: the service suites mock
      // `../../api/beerApi` wholesale, so they cannot be handed a raw body at
      // all, which is the same construct that disqualifies them for the tests
      // above.
      installMemberPrefs();
      (global.fetch as Mock).mockResolvedValue(unreadableBody());

      const pending = fetchMyBeersFromAPI();
      await vi.advanceTimersByTimeAsync(config.network.timeout + 1);
      const outcome = await pending;

      expect(outcome.status).toBe('failed');
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('does not retry a body that parsed but has the wrong shape', async () => {
      // A STRUCTURAL INVARIANT, not retry-policy coverage: the shape decision is
      // made by the fetcher AFTER `fetchWithRetry` has returned, so
      // `attemptFetch` cannot see shape and no change to it could make this
      // retry. Stated as a test because "cannot" is worth pinning, and the
      // mutation it guards lives in `fetchMyBeersFromAPI`.
      installMemberPrefs();
      (global.fetch as Mock).mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ nothing: 'recognisable' }),
      });

      const pending = fetchMyBeersFromAPI();
      await vi.advanceTimersByTimeAsync(config.network.timeout + 1);
      const outcome = await pending;

      expect(outcome.status).toBe('fetched');
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('still retries a transport failure, which carries no status at all', async () => {
      // GUARD. The 4xx exit must key on the status, not on "it threw" — routing
      // every rejection to the non-retry path would silently delete backoff for
      // the dropped-connection case this whole plan exists for.
      const payload = { brewInStock: [] };
      (global.fetch as Mock)
        .mockRejectedValueOnce(new TypeError('Network request failed'))
        .mockResolvedValueOnce({ ok: true, json: async () => payload });

      const result = fetchWithRetry(config.api.baseUrl, 3, 10);
      await vi.advanceTimersByTimeAsync(15);

      await expect(result).resolves.toEqual(payload);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('the deadline bounds the chain, not the attempt', () => {
    it('does not give an attempt more than one configured timeout after the clock moves backward', async () => {
      const signals = capturedSignals();
      (global.fetch as Mock).mockRejectedValueOnce(new TypeError('Network request failed'));

      const backoff = 1000;
      const result = fetchWithRetry(config.api.baseUrl, 3, backoff);
      const rejection = expect(result).rejects.toThrow('Network request failed');

      // The chain deadline was computed before this adjustment. The old
      // `deadline - Date.now()` timer treated the backward minute as new budget
      // and let attempt 2 wait 60 seconds longer than any configured attempt.
      vi.setSystemTime(Date.now() - 60_000);
      await vi.advanceTimersByTimeAsync(backoff);
      expect(signals).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(config.network.timeout);

      expect(signals[0].aborted).toBe(true);
      await rejection;
    });

    it('gives a later attempt only the budget the earlier ones left', async () => {
      // `mockRejectedValueOnce` takes precedence over the implementation and
      // does NOT run it, so attempt 1 records no signal and `signals` holds the
      // stalled attempt 2 alone. The length assertion below pins that, so this
      // does not quietly become an assertion about attempt 1.
      const signals = capturedSignals();
      (global.fetch as Mock).mockRejectedValueOnce(new TypeError('Network request failed'));

      const backoff = 1000;
      const result = fetchWithRetry(config.api.baseUrl, 3, backoff);
      // The rejection is the earlier transport failure, not the abort — see
      // 'reports what actually failed…' below, which owns that property. Kept
      // handled here only so an unhandled rejection does not mask the
      // assertion this test exists for.
      const rejection = expect(result).rejects.toThrow('Network request failed');

      // Attempt 1 fails at once; the backoff carries us to T=backoff, where
      // attempt 2 starts.
      await vi.advanceTimersByTimeAsync(backoff);
      expect(signals).toHaveLength(1);

      // Now to T=timeout exactly — the chain's whole budget, spent.
      await vi.advanceTimersByTimeAsync(config.network.timeout - backoff);

      // Per-chain: attempt 2 inherited `timeout - backoff` and is done.
      // Per-attempt: attempt 2 got a fresh `timeout` and has `backoff` still to
      // run. This single assertion is the entire difference between them.
      expect(signals[0].aborted).toBe(true);
      await rejection;
    });

    it('reports what actually failed when the budget runs out mid-chain', async () => {
      // The chain's deadline is how we STOP waiting; it is not what went wrong.
      // A server that answered 500 twice and then stalled is a server fault,
      // and saying so is the difference between "the service is having
      // trouble" and "check your internet connection" — which is the advice
      // the user gets for an AbortError, since notificationUtils maps it to
      // NETWORK_ERROR, and NETWORK_ERROR is what selects the offline alert.
      //
      // This is the exact defect class 30f9d90's review round caught at the
      // fetcher layer. It came back one layer down, via the deadline.
      // The two slow answers DIFFER, and that is load-bearing. With both at 500
      // the assertion cannot tell "carry the most recent failure" from "carry
      // the first" — and carrying the first survived the entire api suite.
      // 503 then 500 pins the policy the recursion comment states.
      const answers = [
        { ok: false, status: 503, statusText: 'Service Unavailable' },
        { ok: false, status: 500, statusText: 'Internal Server Error' },
      ];
      let attempts = 0;
      (global.fetch as Mock).mockImplementation(
        (_url: string, options: { signal: AbortSignal }) =>
          new Promise((resolve, reject) => {
            attempts += 1;
            const answer = answers[attempts - 1];
            options.signal.addEventListener('abort', () => reject(abortError()));
            if (answer !== undefined) {
              setTimeout(() => resolve(answer), 6000);
            }
          })
      );

      const result = fetchWithRetry(config.api.baseUrl);
      const rejection = expect(result).rejects.toThrow('HTTP 500 Internal Server Error');

      await vi.advanceTimersByTimeAsync(config.network.timeout + 1);

      // Three attempts: two real 500s, then one armed with the sliver of
      // budget left, which aborts. The abort must not become the answer.
      expect(attempts).toBe(3);
      await rejection;
    });

    it('does not sleep past its own deadline', async () => {
      // A backoff longer than the remaining budget buys nothing: the sleep ends
      // after the deadline, so the attempt it schedules is born already aborted.
      // Reporting the failure that actually happened beats spending the wait to
      // manufacture an AbortError that describes nothing.
      (global.fetch as Mock).mockRejectedValue(new TypeError('Network request failed'));

      const result = fetchWithRetry(config.api.baseUrl, 3, config.network.timeout);
      const rejection = expect(result).rejects.toThrow('Network request failed');

      await vi.advanceTimersByTimeAsync(config.network.timeout + 1);

      expect(global.fetch).toHaveBeenCalledTimes(1);
      await rejection;
    });
  });
});
