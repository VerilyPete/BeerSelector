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

import { fetchWithRetry } from '../beerApi';
import { config } from '@/src/config';

jest.mock('../../database/preferences');

global.fetch = jest.fn();

const abortError = (): Error => {
  const error = new Error('The operation was aborted');
  error.name = 'AbortError';
  return error;
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
  (global.fetch as jest.Mock).mockImplementation(
    (_url: string, options: { signal: AbortSignal }) => {
      signals.push(options.signal);
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(abortError()));
      });
    }
  );
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
    jest.resetAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
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
        (global.fetch as jest.Mock)
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
        await jest.advanceTimersByTimeAsync(1000);

        expect(global.fetch).toHaveBeenCalledTimes(attempts);
        expect(await settled).toBe(attempts === 1 ? 'rejected' : 'resolved');
      }
    );

    it('still retries a transport failure, which carries no status at all', async () => {
      // GUARD. The 4xx exit must key on the status, not on "it threw" — routing
      // every rejection to the non-retry path would silently delete backoff for
      // the dropped-connection case this whole plan exists for.
      const payload = { brewInStock: [] };
      (global.fetch as jest.Mock)
        .mockRejectedValueOnce(new TypeError('Network request failed'))
        .mockResolvedValueOnce({ ok: true, json: async () => payload });

      const result = fetchWithRetry(config.api.baseUrl, 3, 10);
      await jest.advanceTimersByTimeAsync(15);

      await expect(result).resolves.toEqual(payload);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('the deadline bounds the chain, not the attempt', () => {
    it('gives a later attempt only the budget the earlier ones left', async () => {
      // `mockRejectedValueOnce` takes precedence over the implementation and
      // does NOT run it, so attempt 1 records no signal and `signals` holds the
      // stalled attempt 2 alone. The length assertion below pins that, so this
      // does not quietly become an assertion about attempt 1.
      const signals = capturedSignals();
      (global.fetch as jest.Mock).mockRejectedValueOnce(new TypeError('Network request failed'));

      const backoff = 1000;
      const result = fetchWithRetry(config.api.baseUrl, 3, backoff);
      // The rejection is the earlier transport failure, not the abort — see
      // 'reports what actually failed…' below, which owns that property. Kept
      // handled here only so an unhandled rejection does not mask the
      // assertion this test exists for.
      const rejection = expect(result).rejects.toThrow('Network request failed');

      // Attempt 1 fails at once; the backoff carries us to T=backoff, where
      // attempt 2 starts.
      await jest.advanceTimersByTimeAsync(backoff);
      expect(signals).toHaveLength(1);

      // Now to T=timeout exactly — the chain's whole budget, spent.
      await jest.advanceTimersByTimeAsync(config.network.timeout - backoff);

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
      const serverError = { ok: false, status: 500, statusText: 'Internal Server Error' };
      let attempts = 0;
      (global.fetch as jest.Mock).mockImplementation(
        (_url: string, options: { signal: AbortSignal }) =>
          new Promise((resolve, reject) => {
            attempts += 1;
            const answersSlowly = attempts <= 2;
            options.signal.addEventListener('abort', () => reject(abortError()));
            if (answersSlowly) {
              setTimeout(() => resolve(serverError), 6000);
            }
          })
      );

      const result = fetchWithRetry(config.api.baseUrl);
      const rejection = expect(result).rejects.toThrow('HTTP 500 Internal Server Error');

      await jest.advanceTimersByTimeAsync(config.network.timeout + 1);

      // Three attempts: two real 500s, then one armed with the sliver of
      // budget left, which aborts. The abort must not become the answer.
      expect(attempts).toBe(3);
      await rejection;
    });

    it('still reports the abort when nothing else has gone wrong', async () => {
      // GUARD, and the reason the fix is "prefer the earlier real error"
      // rather than "never report an abort". A single request that stalls has
      // produced no other error, and a timeout is the honest description.
      const signals = capturedSignals();

      const result = fetchWithRetry(config.api.baseUrl, 1);
      const rejection = expect(result).rejects.toMatchObject({ name: 'AbortError' });

      await jest.advanceTimersByTimeAsync(config.network.timeout + 1);

      expect(signals[0].aborted).toBe(true);
      await rejection;
    });

    it('does not sleep past its own deadline', async () => {
      // A backoff longer than the remaining budget buys nothing: the sleep ends
      // after the deadline, so the attempt it schedules is born already aborted.
      // Reporting the failure that actually happened beats spending the wait to
      // manufacture an AbortError that describes nothing.
      (global.fetch as jest.Mock).mockRejectedValue(new TypeError('Network request failed'));

      const result = fetchWithRetry(config.api.baseUrl, 3, config.network.timeout);
      const rejection = expect(result).rejects.toThrow('Network request failed');

      await jest.advanceTimersByTimeAsync(config.network.timeout + 1);

      expect(global.fetch).toHaveBeenCalledTimes(1);
      await rejection;
    });
  });
});
