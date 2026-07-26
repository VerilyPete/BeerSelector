/**
 * Test-only shim for the retired name-based lock API.
 *
 * `DatabaseLockManager.test.ts` and `locks.test.ts` predate lock tokens. What
 * they cover — FIFO ordering, acquisition and hold timeouts, queue metrics,
 * shutdown — is orthogonal to ownership, and every one of those tests
 * identifies an operation by name because the name is what they are asserting
 * about. Rewriting ~170 call sites to thread tokens through would churn the
 * lock manager's own safety net without testing anything new.
 *
 * So this shim keeps a name -> token map and nothing else. It is deliberately
 * NOT exported from production code: `withDatabaseLock` is the only supported
 * way to take the lock, precisely because a name cannot prove ownership.
 * Ownership itself is covered against the real API in
 * `DatabaseLockManager.ownership.test.ts`.
 */

import { DatabaseLockManager, LockToken } from '../../DatabaseLockManager';

export type NameKeyedLock = {
  acquireLock: (operationName: string, timeoutMs?: number) => Promise<boolean>;
  releaseLock: (operationName: string) => void;
};

export function nameKeyedLock(manager: DatabaseLockManager): NameKeyedLock {
  const held = new Map<string, LockToken>();

  return {
    acquireLock: async (operationName: string, timeoutMs?: number): Promise<boolean> => {
      held.set(operationName, await manager.acquire(operationName, timeoutMs));
      return true;
    },

    releaseLock: (operationName: string): void => {
      const token = held.get(operationName);
      if (!token) {
        // Mirrors the old API's tolerance of a release for an operation that
        // never held the lock.
        return;
      }
      held.delete(operationName);
      manager.release(token);
    },
  };
}
