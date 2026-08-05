/**
 * `fetchWithRetry` must bound every request it makes.
 *
 * Plan 05 Phase 5.0 (promoted from 02 Phase 8, which had it as optional).
 *
 * `beerApi.fetchWithRetry` was the one network await in this codebase with no
 * timeout — the apiClient has an AbortController, the enrichment paths have
 * 5s and 15s bounds, and this one had nothing. That matters far beyond a slow
 * refresh: both full refresh paths call it from inside the master database lock,
 * so a request that never settles holds that lock past its 15s hold timeout, the
 * grant is abandoned, and `DatabaseLockManager` then blocks every subsequent
 * writer until the stalled request returns. Plan 01 lists this path as the
 * exception to its claim that every network await inside a locked body is
 * bounded.
 *
 * A timeout is deliberately NOT retried. Three rounds of backoff after a request
 * already burned the full timeout is the opposite of what a weak link needs, and
 * it is the behaviour that turns one stalled request into a multi-minute hold.
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
 * A fetch that never settles on its own — it resolves only if its signal fires.
 *
 * This is the shape the timeout exists for: not a rejection, not a slow success,
 * but a request the network never answers.
 */
const neverSettlingFetch = (): jest.Mock =>
  (global.fetch as jest.Mock).mockImplementation(
    (_url: string, options: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(abortError()));
      })
  );

/**
 * As `neverSettlingFetch`, but exposes each attempt's signal.
 *
 * Lets a test assert on the deadline directly — whether it has fired, and
 * whether it has NOT fired yet — instead of inferring it from a promise that
 * settles only when the implementation is already correct.
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

describe('fetchWithRetry timeout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('aborts a request that exceeds the configured timeout', async () => {
    const signals = capturedSignals();

    // `retries = 1` so this test is about the deadline ALONE. With the default
    // 3, an implementation that aborts but then retries leaves the returned
    // promise pending, and this test dies by Jest's 30s timeout instead of by
    // an assertion — reporting a retry defect as an unexplained hang, in the
    // test that does not own retry behaviour. The test below owns it.
    const result = fetchWithRetry(config.api.baseUrl, 1);
    const rejection = expect(result).rejects.toMatchObject({ name: 'AbortError' });

    await jest.advanceTimersByTimeAsync(config.network.timeout + 1);

    // Asserted before awaiting the rejection: this line names the defect in 1ms
    // where awaiting first would report it as a generic timeout.
    expect(signals[0]?.aborted).toBe(true);
    await rejection;
  });

  it('does not abort a request that is still inside the timeout', async () => {
    // Without this, the deadline VALUE is unpinned: every other test advances
    // past it, so `setTimeout(abort, 1)` would satisfy the whole suite. This is
    // what catches a wrong constant, a wrong unit, or `timeout` swapped for
    // `retryDelay`.
    const signals = capturedSignals();

    void fetchWithRetry(config.api.baseUrl);
    await jest.advanceTimersByTimeAsync(config.network.timeout - 1);

    expect(signals[0]?.aborted).toBe(false);
  });

  it('does not retry an aborted request', async () => {
    neverSettlingFetch();

    const result = fetchWithRetry(config.api.baseUrl, 3, 10);
    const rejection = expect(result).rejects.toMatchObject({ name: 'AbortError' });

    // Past the timeout, then past every retry delay that would follow it.
    await jest.advanceTimersByTimeAsync(config.network.timeout + 1);
    await jest.advanceTimersByTimeAsync(1000);

    // Call count BEFORE the rejection, for the same reason as above: a retried
    // request also never settles, so awaiting first turns "it retried" — this
    // test's entire subject — into an unexplained 30s hang.
    expect(global.fetch).toHaveBeenCalledTimes(1);
    await rejection;
  });

  it('still retries a request that fails for a reason other than the timeout', async () => {
    const payload = { brewInStock: [] };
    (global.fetch as jest.Mock)
      .mockRejectedValueOnce(new Error('Network request failed'))
      .mockResolvedValueOnce({ ok: true, json: async () => payload });

    const result = fetchWithRetry(config.api.baseUrl, 2, 10);
    await jest.advanceTimersByTimeAsync(15);

    await expect(result).resolves.toEqual(payload);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('disarms the timeout once the request succeeds', async () => {
    // Asserts the cleanup through its observable consequence — the signal never
    // fires — rather than by spying on clearTimeout. A leaked timer is only a
    // bug because of what it goes on to abort.
    let captured: AbortSignal | undefined;
    (global.fetch as jest.Mock).mockImplementation(
      (_url: string, options: { signal: AbortSignal }) => {
        captured = options.signal;
        return Promise.resolve({ ok: true, json: async () => ({ brewInStock: [] }) });
      }
    );

    await fetchWithRetry(config.api.baseUrl);
    await jest.advanceTimersByTimeAsync(config.network.timeout + 1);

    expect(captured?.aborted).toBe(false);
  });

  it('disarms the timeout when the request fails', async () => {
    const signals: AbortSignal[] = [];
    (global.fetch as jest.Mock).mockImplementation(
      (_url: string, options: { signal: AbortSignal }) => {
        signals.push(options.signal);
        return Promise.reject(new Error('Network request failed'));
      }
    );

    await expect(fetchWithRetry(config.api.baseUrl, 1, 10)).rejects.toThrow(
      'Network request failed'
    );
    await jest.advanceTimersByTimeAsync(config.network.timeout + 1);

    expect(signals).toHaveLength(1);
    expect(signals[0].aborted).toBe(false);
  });
});
