import { vi } from 'vitest';
/**
 * Grant-ownership tests for DatabaseLockManager
 *
 * Plan 01 Phase 2.
 *
 * Two defects, both of which let a second writer run while a first may still
 * be mid-write:
 *
 *   1. `_forceRelease` hands the lock to a queued waiter after the 15s hold
 *      timeout fires, even though the timed-out holder has not returned and may
 *      still be writing. Granting to B while A may be alive is strictly worse
 *      than leaving the lock held — a wedged app is diagnosable, interleaved
 *      writers are silent data loss. Liveness is covered by the separate 30s
 *      acquisition timeout, which rejects waiters with a real message.
 *   2. `releaseLock` has no ownership check, so a late release from an
 *      abandoned holder frees somebody else's grant.
 *
 * Two identifiers are needed and must not be conflated. A grant serial is
 * stamped when the lock is GRANTED, and answers "is this releaser still the
 * owner?". A request serial is stamped when a waiter is ENQUEUED, and answers
 * "which queued request timed out?" — `_timeoutAcquisition` operates on the
 * queue, where no grant exists, so a grant serial is unimplementable there.
 */

import { DatabaseLockManager } from '../DatabaseLockManager';

function createLockManager(
  options: { holdTimeoutMs?: number; acquisitionTimeoutMs?: number } = {}
): DatabaseLockManager {
  return new DatabaseLockManager(options);
}

/**
 * Assert a promise has not settled, without sleeping.
 *
 * Deliberately not `Promise.race` against a resolved sentinel: when the promise
 * under test has ALREADY settled, the race can still report the sentinel first
 * depending on microtask ordering, which would make this helper pass for the
 * exact bug it exists to catch. Flushing the queue and reading a flag instead
 * has no such hole.
 */
async function expectPending(promise: Promise<unknown>): Promise<void> {
  let settled = false;
  promise.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    }
  );

  for (let tick = 0; tick < 5; tick += 1) {
    await Promise.resolve();
  }

  expect(settled).toBe(false);
}

describe('DatabaseLockManager grant ownership', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not grant the lock to a queued waiter when a hold is forcibly released', async () => {
    const lockManager = createLockManager({ holdTimeoutMs: 50 });
    await lockManager.acquire('slow-op');
    const pendingB = lockManager.acquire('waiter-b');

    vi.advanceTimersByTime(50);

    expect(lockManager.getCurrentOperation()).toBeNull();
    expect(lockManager.isLocked()).toBe(false);
    // The abandoned holder may still be mid-write. B must stay queued.
    await expectPending(pendingB);
  });

  it('does not grant a brand-new acquirer while a hold is abandoned', async () => {
    const lockManager = createLockManager({ holdTimeoutMs: 50 });
    await lockManager.acquire('slow-op');

    vi.advanceTimersByTime(50);

    // Skipping _processQueue only protects callers already in the queue. A
    // caller arriving AFTER the force release hits the `!lockHeld` fast path,
    // so it would be granted the lock while the abandoned holder is still
    // mid-write — the exact interleaving this phase exists to prevent.
    const newcomer = lockManager.acquire('newcomer-c');

    await expectPending(newcomer);
    expect(lockManager.getCurrentOperation()).toBeNull();
  });

  // Regresses by TIMEOUT rather than assertion — the awaited promise simply
  // never resolves — so this caps well under the 30s default to keep a
  // regression legible in seconds instead of looking like a hung suite.
  it('grants a waiter once the abandoned holder finally releases', async () => {
    const lockManager = createLockManager({ holdTimeoutMs: 50 });
    const tokenA = await lockManager.acquire('slow-op');

    vi.advanceTimersByTime(50);
    const newcomer = lockManager.acquire('newcomer-c');
    await expectPending(newcomer);

    // The abandoned writer returns at last. That is the signal that no writer
    // is in flight any more, so the lock becomes grantable again without
    // waiting for anyone's acquisition timeout.
    lockManager.release(tokenA);

    await expect(newcomer).resolves.toEqual(
      expect.objectContaining({ operationName: 'newcomer-c' })
    );
    expect(lockManager.getCurrentOperation()).toBe('newcomer-c');
  }, 3000);

  it('reports an abandoned hold distinctly from an idle lock', async () => {
    const lockManager = createLockManager({ holdTimeoutMs: 50 });
    expect(lockManager.hasAbandonedHolder()).toBe(false);

    await lockManager.acquire('slow-op');
    vi.advanceTimersByTime(50);

    // isLocked() is false either way, so without this an abandoned hold is
    // indistinguishable from an idle one to anyone reading logs or metrics.
    expect(lockManager.isLocked()).toBe(false);
    expect(lockManager.hasAbandonedHolder()).toBe(true);
    expect(lockManager.getLockMetrics().abandonedHolder).toBe('slow-op');
  });

  it('ignores a release when no grant is live, even if the serial matches', async () => {
    const lockManager = createLockManager({ holdTimeoutMs: 50 });
    const tokenA = await lockManager.acquire('slow-op');

    vi.advanceTimersByTime(50);
    const pendingB = lockManager.acquire('waiter-b');
    await expectPending(pendingB);

    // _forceRelease bumps the grant serial WITHOUT minting a token, so this
    // value belongs to no holder that ever existed. release() inferred "this
    // is the live holder" from the serial alone, so a token carrying it would
    // free a lock nobody held and hand it to a waiter mid-write. Unreachable
    // while tokens only come from _grantLock — but the invariant should rest
    // on a check, not on the arithmetic happening to skip a value.
    lockManager.release({ operationName: 'forged', serial: tokenA.serial + 1 });

    await expectPending(pendingB);
    expect(lockManager.isLocked()).toBe(false);
    expect(lockManager.hasAbandonedHolder()).toBe(true);
  });

  it('does not accept a recovery release for a different operation', async () => {
    const lockManager = createLockManager({ holdTimeoutMs: 50 });
    const tokenA = await lockManager.acquire('slow-op');

    vi.advanceTimersByTime(50);
    const pendingB = lockManager.acquire('waiter-b');

    // Same serial, wrong operation. Only the actual abandoned holder returning
    // is evidence that the writer stopped.
    lockManager.release({ operationName: 'not-the-abandoned-op', serial: tokenA.serial });

    await expectPending(pendingB);
    expect(lockManager.hasAbandonedHolder()).toBe(true);
  });

  it('does not report shutdown-safe while a hold is abandoned', async () => {
    const lockManager = createLockManager({ holdTimeoutMs: 50 });
    await lockManager.acquire('slow-op');

    vi.advanceTimersByTime(50);

    // connection.ts calls prepareForShutdown before closing the database. It
    // waits on lockHeld, which a force release clears — so an abandoned hold
    // reads as safe and the connection closes under a writer that may still
    // be running. Same blind spot as the acquire fast path.
    await expect(lockManager.prepareForShutdown(0)).resolves.toBe(false);
  });

  it('clears an abandoned hold on resetForTesting so suites do not wedge each other', async () => {
    const lockManager = createLockManager({ holdTimeoutMs: 50 });
    await lockManager.acquire('slow-op');
    vi.advanceTimersByTime(50);
    expect(lockManager.hasAbandonedHolder()).toBe(true);

    lockManager.resetForTesting();

    expect(lockManager.hasAbandonedHolder()).toBe(false);
    await expect(lockManager.acquire('next-test')).resolves.toEqual(
      expect.objectContaining({ operationName: 'next-test' })
    );
  });

  it('never lets a late release free a different holder grant', async () => {
    const lockManager = createLockManager({ holdTimeoutMs: 50 });
    const tokenA = await lockManager.acquire('slow-op');
    const pendingB = lockManager.acquire('waiter-b');

    vi.advanceTimersByTime(50);

    // A's first release is the recovery signal and hands the lock to B.
    lockManager.release(tokenA);
    await pendingB;
    expect(lockManager.getCurrentOperation()).toBe('waiter-b');

    // A releasing a second time — a double release, or a stale `finally` on a
    // retry path — must not free B. This exercises the real release path; the
    // name-keyed shim used by the older suites short-circuits before reaching
    // it, so this is the only place the double release is genuinely covered.
    lockManager.release(tokenA);

    expect(lockManager.isLocked()).toBe(true);
    expect(lockManager.getCurrentOperation()).toBe('waiter-b');
  }, 3000);

  it('increments the grant serial on every grant, not only on forced release', async () => {
    const lockManager = createLockManager();

    const first = await lockManager.acquire('op');
    lockManager.release(first);
    const second = await lockManager.acquire('op');
    lockManager.release(second);

    // If the serial only moved in _forceRelease, the normal
    // release -> _processQueue -> _grantLock path would re-stamp the same
    // serial, and a double release would free someone else's grant.
    expect(second.serial).not.toBe(first.serial);
  });

  it('rejects the correct queued request when two waiters share an operation name', async () => {
    const lockManager = createLockManager();
    await lockManager.acquire('holder');

    const patient = lockManager.acquire('X', 100);
    const impatient = lockManager.acquire('X', 50);
    patient.catch(() => undefined);

    expect(lockManager.getQueueLength()).toBe(2);

    vi.advanceTimersByTime(50);

    // Matching by operation name would reject `patient`, the first entry found.
    // Both BeerRepository and MyBeersRepository reuse a single name across two
    // call sites, so this collision is reachable in production.
    await expect(impatient).rejects.toThrow(/timeout/i);
    expect(lockManager.getQueueLength()).toBe(1);
    await expectPending(patient);
  });
});

describe('forced release reporting', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports a forced release through the error logger with the held operation and duration', async () => {
    const reportError = vi.fn();
    const lockManager = new DatabaseLockManager({ holdTimeoutMs: 5000, reportError });
    await lockManager.acquire('slow-op');

    vi.advanceTimersByTime(5000);

    // A forced release is no longer routine bookkeeping — it abandons a grant
    // and blocks every writer until the holder returns. A console.warn is
    // indistinguishable from ordinary chatter, so it goes to the error logger.
    expect(reportError).toHaveBeenCalledTimes(1);
    const [error, context] = reportError.mock.calls[0];
    expect(String((error as Error).message)).toContain('forcibly released');
    expect(context).toEqual(
      expect.objectContaining({
        operation: 'DatabaseLockManager.forceRelease',
        additionalData: expect.objectContaining({
          heldOperation: 'slow-op',
          heldForMs: 5000,
          holdTimeoutMs: 5000,
        }),
      })
    );
  });

  it('reports the number of writers left waiting on the abandoned hold', async () => {
    const reportError = vi.fn();
    const lockManager = new DatabaseLockManager({ holdTimeoutMs: 5000, reportError });
    await lockManager.acquire('slow-op');
    const waiter = lockManager.acquire('waiter-b');
    waiter.catch(() => undefined);

    vi.advanceTimersByTime(5000);

    // The queue length is what says whether this stalled anything, which is the
    // difference between a curiosity and an incident.
    const [, context] = reportError.mock.calls[0];
    expect(context.additionalData.queueLength).toBe(1);
  });

  it('still abandons the hold when the error reporter itself throws', async () => {
    const lockManager = new DatabaseLockManager({
      holdTimeoutMs: 100,
      reportError: () => {
        throw new Error('reporter blew up');
      },
    });
    await lockManager.acquire('op');

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.advanceTimersByTime(100);

    // withDatabaseLock already puts release in a finally so a throwing task
    // cannot skip the state transition. The hold timer must extend the same
    // guarantee to its own: reporting is observability, and it must not be able
    // to prevent the safety mechanism it is reporting on.
    expect(lockManager.isLocked()).toBe(false);
    expect(lockManager.hasAbandonedHolder()).toBe(true);
    // And the reporter's own failure is surfaced rather than lost.
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('error reporter threw'),
      expect.anything()
    );

    consoleSpy.mockRestore();
  });

  it('measures the real hold duration rather than echoing the configured timeout', async () => {
    const reportError = vi.fn();
    const lockManager = new DatabaseLockManager({ holdTimeoutMs: 100, reportError });
    await lockManager.acquire('op');

    // Under fake timers the timer fires at exactly holdTimeoutMs, so a
    // hard-coded `heldForMs = holdTimeoutMs` would satisfy every other test
    // here. Jumping the wall clock separates a measurement from a constant —
    // and this is also the iOS suspend/resume shape, where the app is frozen
    // and the timer fires late on resume.
    vi.setSystemTime(Date.now() + 3_600_000);
    vi.advanceTimersByTime(100);

    const [, context] = reportError.mock.calls[0];
    expect(context.additionalData.heldForMs).toBeGreaterThan(3_600_000);
    expect(context.additionalData.holdTimeoutMs).toBe(100);
    // Overshoot ratio is what lets triage separate a genuinely slow write
    // (overshoots by milliseconds) from a suspended app (overshoots by
    // minutes). Without it, Phase 5's production logs cannot answer the
    // question Phase 5 exists to answer.
    expect(context.additionalData.overshootRatio).toBeGreaterThan(1000);
  });

  it('does not report anything when the lock is released normally', async () => {
    const reportError = vi.fn();
    const lockManager = new DatabaseLockManager({ holdTimeoutMs: 5000, reportError });
    const token = await lockManager.acquire('quick-op');

    lockManager.release(token);
    vi.advanceTimersByTime(5000);

    expect(reportError).not.toHaveBeenCalled();
  });
});

describe('withDatabaseLock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('releases the lock when the task throws', async () => {
    const lockManager = createLockManager();

    await expect(
      lockManager.withDatabaseLock('failing-write', async () => {
        throw new Error('write failed');
      })
    ).rejects.toThrow('write failed');

    expect(lockManager.isLocked()).toBe(false);
  });

  it('releases the lock when the task succeeds, and returns its value', async () => {
    const lockManager = createLockManager();

    const result = await lockManager.withDatabaseLock('good-write', async () => 42);

    expect(result).toBe(42);
    expect(lockManager.isLocked()).toBe(false);
  });

  it('holds the lock for the duration of the task', async () => {
    const lockManager = createLockManager();
    let heldDuringTask = false;

    await lockManager.withDatabaseLock('slow-write', async () => {
      heldDuringTask = lockManager.isLocked();
    });

    expect(heldDuringTask).toBe(true);
  });

  it('grants a queued waiter once the first task finishes', async () => {
    const lockManager = createLockManager();
    const order: string[] = [];

    const first = lockManager.withDatabaseLock('first', async () => {
      order.push('first');
    });
    const second = lockManager.withDatabaseLock('second', async () => {
      order.push('second');
    });

    await Promise.all([first, second]);

    expect(order).toEqual(['first', 'second']);
    expect(lockManager.isLocked()).toBe(false);
  });

  it('releases the lock even when the task throws a non-Error value', async () => {
    const lockManager = createLockManager();

    await expect(
      lockManager.withDatabaseLock('odd-write', async () => {
        throw 'a string, not an Error';
      })
    ).rejects.toBe('a string, not an Error');

    expect(lockManager.isLocked()).toBe(false);
  });
});

describe('retired name-based lock API', () => {
  it('is no longer reachable', () => {
    const lockManager = createLockManager();

    // Compile-time is the real guard here; these assertions exist so the
    // removal is visible in the suite rather than only in tsc output.
    // @ts-expect-error acquireLock was removed in plan 01 Phase 3
    expect(lockManager.acquireLock).toBeUndefined();
    // @ts-expect-error releaseLock was removed in plan 01 Phase 3
    expect(lockManager.releaseLock).toBeUndefined();
  });
});
