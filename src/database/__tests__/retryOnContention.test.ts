/**
 * Tests for retryOnContention
 *
 * The exclusive taplist import holds SQLite's write lock at the FILE level for
 * its whole duration, so any writer that does not hold the app's master lock
 * aborts for that window. Extending the master lock to cover them is not an
 * option: dataUpdateService calls setPreference at eight sites while already
 * holding it, so every one of those would self-deadlock.
 *
 * That leaves bounded retry, which is what `retryable` on DatabaseContentionError
 * was put there for.
 */

import { describe, it, expect } from 'vitest';
import { DatabaseContentionError, retryOnContention } from '../errors';

function noSleep() {
  const waited: number[] = [];
  return {
    waited,
    sleep: async (ms: number) => {
      waited.push(ms);
    },
  };
}

describe('retryOnContention', () => {
  it('returns the value when the task succeeds first time', async () => {
    const { sleep, waited } = noSleep();

    await expect(retryOnContention('w', async () => 'ok', { sleep })).resolves.toBe('ok');

    expect(waited).toEqual([]);
  });

  it('retries a contention abort and returns the eventual success', async () => {
    const { sleep } = noSleep();
    let calls = 0;
    const task = async () => {
      calls += 1;
      if (calls < 3) throw new DatabaseContentionError('locked');
      return 'ok';
    };

    await expect(retryOnContention('w', task, { sleep })).resolves.toBe('ok');

    expect(calls).toBe(3);
  });

  it('backs off exponentially between attempts', async () => {
    const { sleep, waited } = noSleep();
    const task = async () => {
      throw new DatabaseContentionError('locked');
    };

    await expect(
      retryOnContention('w', task, { sleep, attempts: 4, initialDelayMs: 100 })
    ).rejects.toBeInstanceOf(DatabaseContentionError);

    // Three waits for four attempts — no point sleeping after the last one.
    expect(waited).toEqual([100, 200, 400]);
  });

  it('caps the backoff so a long import cannot produce an unbounded wait', async () => {
    const { sleep, waited } = noSleep();
    const task = async () => {
      throw new DatabaseContentionError('locked');
    };

    await expect(
      retryOnContention('w', task, { sleep, attempts: 5, initialDelayMs: 100, maxDelayMs: 250 })
    ).rejects.toBeInstanceOf(DatabaseContentionError);

    expect(waited).toEqual([100, 200, 250, 250]);
  });

  it('rethrows the contention error once the budget is exhausted', async () => {
    const { sleep } = noSleep();
    let calls = 0;
    const task = async () => {
      calls += 1;
      throw new DatabaseContentionError('locked');
    };

    // Still a DatabaseContentionError, so the caller can still tell it apart
    // from a hard failure and the UI can still say "try again in a moment".
    await expect(retryOnContention('w', task, { sleep, attempts: 3 })).rejects.toBeInstanceOf(
      DatabaseContentionError
    );
    expect(calls).toBe(3);
  });

  it('does not retry anything that is not a contention error', async () => {
    const { sleep } = noSleep();
    let calls = 0;
    const task = async () => {
      calls += 1;
      throw new Error('no such table: preferences');
    };

    // Retrying a real error just delays the report.
    await expect(retryOnContention('w', task, { sleep })).rejects.toThrow(/no such table/);
    expect(calls).toBe(1);
  });
});
