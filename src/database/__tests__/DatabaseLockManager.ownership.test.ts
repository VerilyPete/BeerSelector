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
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not grant the lock to a queued waiter when a hold is forcibly released', async () => {
    const lockManager = createLockManager({ holdTimeoutMs: 50 });
    await lockManager.acquire('slow-op');
    const pendingB = lockManager.acquire('waiter-b');

    jest.advanceTimersByTime(50);

    expect(lockManager.getCurrentOperation()).toBeNull();
    expect(lockManager.isLocked()).toBe(false);
    // The abandoned holder may still be mid-write. B must stay queued.
    await expectPending(pendingB);
  });

  it('does not grant a brand-new acquirer while a hold is abandoned', async () => {
    const lockManager = createLockManager({ holdTimeoutMs: 50 });
    await lockManager.acquire('slow-op');

    jest.advanceTimersByTime(50);

    // Skipping _processQueue only protects callers already in the queue. A
    // caller arriving AFTER the force release hits the `!lockHeld` fast path,
    // so it would be granted the lock while the abandoned holder is still
    // mid-write — the exact interleaving this phase exists to prevent.
    const newcomer = lockManager.acquire('newcomer-c');

    await expectPending(newcomer);
    expect(lockManager.getCurrentOperation()).toBeNull();
  });

  it('grants a waiter once the abandoned holder finally releases', async () => {
    const lockManager = createLockManager({ holdTimeoutMs: 50 });
    const tokenA = await lockManager.acquire('slow-op');

    jest.advanceTimersByTime(50);
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
  });

  it('reports an abandoned hold distinctly from an idle lock', async () => {
    const lockManager = createLockManager({ holdTimeoutMs: 50 });
    expect(lockManager.hasAbandonedHolder()).toBe(false);

    await lockManager.acquire('slow-op');
    jest.advanceTimersByTime(50);

    // isLocked() is false either way, so without this an abandoned hold is
    // indistinguishable from an idle one to anyone reading logs or metrics.
    expect(lockManager.isLocked()).toBe(false);
    expect(lockManager.hasAbandonedHolder()).toBe(true);
    expect(lockManager.getLockMetrics().abandonedHolder).toBe('slow-op');
  });

  it('does not report shutdown-safe while a hold is abandoned', async () => {
    const lockManager = createLockManager({ holdTimeoutMs: 50 });
    await lockManager.acquire('slow-op');

    jest.advanceTimersByTime(50);

    // connection.ts calls prepareForShutdown before closing the database. It
    // waits on lockHeld, which a force release clears — so an abandoned hold
    // reads as safe and the connection closes under a writer that may still
    // be running. Same blind spot as the acquire fast path.
    await expect(lockManager.prepareForShutdown(0)).resolves.toBe(false);
  });

  it('clears an abandoned hold on resetForTesting so suites do not wedge each other', async () => {
    const lockManager = createLockManager({ holdTimeoutMs: 50 });
    await lockManager.acquire('slow-op');
    jest.advanceTimersByTime(50);
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

    jest.advanceTimersByTime(50);

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
  });

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

    jest.advanceTimersByTime(50);

    // Matching by operation name would reject `patient`, the first entry found.
    // Both BeerRepository and MyBeersRepository reuse a single name across two
    // call sites, so this collision is reachable in production.
    await expect(impatient).rejects.toThrow(/timeout/i);
    expect(lockManager.getQueueLength()).toBe(1);
    await expectPending(patient);
  });
});

describe('withDatabaseLock', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
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
