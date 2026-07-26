/**
 * Atomicity tests for BeerRepository's allbeers replacement write
 *
 * Plan 01 Phase 1.
 *
 * Today the DELETE at the top of _insertManyInternal commits in its own
 * transaction before any insert runs, so from that instant until the batches
 * finish a concurrent reader observes zero rows and then a partial table. That
 * is a fourth independent path to the reported "count is wrong or empty"
 * symptom, needing no lock bug and no network failure.
 *
 * These tests use a transaction-modelling fake rather than the repository
 * suite's `withTransactionAsync: cb => cb()` mock, which passes identically for
 * buggy and fixed code. The fake models three behaviours the real engine
 * exhibits and a naive fake would not:
 *
 *   1. A query issued on the closure handle while an EXCLUSIVE transaction is
 *      open contends across connections. Writes abort with `database is
 *      locked`; reads succeed against the pre-transaction snapshot.
 *   2. The same query under a PLAIN transaction is absorbed into it, and is
 *      rolled back with it — the interleave expo-sqlite documents.
 *   3. Neither happens before the transaction's first write, because the
 *      transaction opens with a deferred BEGIN and takes the write lock lazily.
 *
 * Honest limit: this proves our code routes every query through `txn`. It does
 * not prove expo-sqlite's native exclusivity works — that is a device question.
 */

import { SQLiteDatabase } from 'expo-sqlite';
import { BeerRepository } from '../BeerRepository';
import { BeerWithContainerType } from '../../../types/beer';
import * as connection from '../../connection';
import { withAtomicWrite } from '../../transactions';

jest.mock('../../connection');
jest.mock('../../locks', () => ({
  databaseLockManager: {
    // Must run the task. A mock missing this method makes the locked-entry-point
    // test pass on a TypeError rather than on atomicity.
    withDatabaseLock: jest.fn(async (_name: string, task: () => Promise<unknown>) => task()),
  },
}));

type RunResult = { changes: number; lastInsertRowId: number };
type CountRow = { count: number };

type TransactionalFake = {
  /**
   * Stands in for an SQLiteDatabase. Cast at the call site because the fake
   * implements only the handful of methods the repository actually uses.
   */
  readonly db: SQLiteDatabase;
  readonly committedIds: () => readonly string[];
  readonly commitCount: () => number;
  readonly escapedQueries: () => number;
  readonly escapedWrites: () => number;
  readonly failOnInsertNumber: (n: number) => void;
};

/**
 * Build a fake that models commit/rollback and cross-connection contention.
 *
 * @param seeded - Ids already committed before the import starts
 * @param options.webBuild - Model expo-sqlite's web build, where
 *   `withExclusiveTransactionAsync` hard-throws as its first statement rather
 *   than degrading to the non-exclusive path
 */
function createTransactionalFake(
  seeded: readonly string[] = [],
  options: { webBuild?: boolean } = {}
): TransactionalFake {
  let committed: string[] = [...seeded];
  let staged: string[] | null = null;
  let openMode: 'exclusive' | 'plain' | null = null;
  let sawFirstWrite = false;
  let commits = 0;
  let escaped = 0;
  let escapedWriteCount = 0;
  let insertsSeen = 0;
  let failAtInsert: number | null = null;

  const isWrite = (sql: string): boolean => /^\s*(DELETE|INSERT|UPDATE)/i.test(sql);

  // Applies a statement to whichever id list the caller is allowed to touch.
  const apply = (target: string[], sql: string, params: readonly unknown[]): RunResult => {
    if (/^\s*DELETE/i.test(sql)) {
      const removed = target.length;
      target.length = 0;
      return { changes: removed, lastInsertRowId: 0 };
    }

    if (/^\s*INSERT/i.test(sql)) {
      insertsSeen += 1;
      if (failAtInsert !== null && insertsSeen === failAtInsert) {
        throw new Error('SQLITE_CONSTRAINT: simulated insert failure');
      }
      const id = String(params[0]);
      if (!target.includes(id)) target.push(id);
      return { changes: 1, lastInsertRowId: target.length };
    }

    return { changes: 0, lastInsertRowId: 0 };
  };

  const read = (source: readonly string[], sql: string): CountRow | null =>
    /COUNT\(\*\)/i.test(sql) ? { count: source.length } : null;

  // --- the closure handle: what a miswritten transaction body reaches for ---

  const runAsync = async (sql: string, params: readonly unknown[] = []): Promise<RunResult> => {
    if (openMode !== null) {
      escaped += 1;
      if (isWrite(sql)) escapedWriteCount += 1;

      // Deferred BEGIN: the write lock is not held until the first write, so an
      // escaped write before that point succeeds. This is what makes the bug
      // look intermittent.
      if (openMode === 'exclusive' && sawFirstWrite) {
        throw new Error('database is locked');
      }

      // A plain transaction absorbs the query — and rolls it back with itself.
      if (openMode === 'plain' && staged !== null) {
        return apply(staged, sql, params);
      }
    }

    return apply(committed, sql, params);
  };

  const getFirstAsync = async <T>(sql: string): Promise<T | null> => {
    if (openMode !== null) {
      // Under WAL a read never blocks and never throws. It quietly returns the
      // last committed state — i.e. not the open transaction's own writes.
      escaped += 1;
      return read(committed, sql) as T | null;
    }
    return read(committed, sql) as T | null;
  };

  const txn = {
    runAsync: async (sql: string, params: readonly unknown[] = []): Promise<RunResult> => {
      if (staged === null) throw new Error('fake: txn used outside a transaction');
      if (isWrite(sql)) sawFirstWrite = true;
      return apply(staged, sql, params);
    },
    getFirstAsync: async <T>(sql: string): Promise<T | null> => {
      if (staged === null) throw new Error('fake: txn used outside a transaction');
      return read(staged, sql) as T | null;
    },
  };

  const runTransaction = async (
    mode: 'exclusive' | 'plain',
    task: () => Promise<void>
  ): Promise<void> => {
    staged = [...committed];
    openMode = mode;
    sawFirstWrite = false;
    try {
      await task();
      committed = staged;
      commits += 1;
    } finally {
      staged = null;
      openMode = null;
      sawFirstWrite = false;
    }
  };

  const db = {
    runAsync,
    getFirstAsync,
    getAllAsync: jest.fn(),
    withTransactionAsync: (task: () => Promise<void>) => runTransaction('plain', task),
    withExclusiveTransactionAsync: (task: (t: typeof txn) => Promise<void>) => {
      if (options.webBuild) {
        // SQLiteDatabase.js:150-153 — not "degrades to non-exclusive", throws.
        throw new Error('withExclusiveTransactionAsync is not supported on web');
      }
      return runTransaction('exclusive', () => task(txn));
    },
  } as unknown as SQLiteDatabase;

  return {
    db,
    committedIds: () => [...committed],
    commitCount: () => commits,
    escapedQueries: () => escaped,
    escapedWrites: () => escapedWriteCount,
    failOnInsertNumber: (n: number) => {
      failAtInsert = n;
    },
  };
}

function makeBeers(count: number, prefix = 'new'): BeerWithContainerType[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${index + 1}`,
    brew_name: `Beer ${index + 1}`,
    brewer: 'Test Brewery',
    brew_style: 'IPA',
    added_date: '2026-01-01',
    container_type: 'pint' as const,
    abv: null,
    enrichment_confidence: null,
    enrichment_source: null,
  }));
}

describe('BeerRepository insert atomicity', () => {
  it('leaves the previously committed beers intact when an insert fails partway through', async () => {
    const fake = createTransactionalFake(['old-1', 'old-2', 'old-3']);
    (connection.getDatabase as jest.Mock).mockResolvedValue(fake.db);
    fake.failOnInsertNumber(2);

    await expect(new BeerRepository().insertManyUnsafe(makeBeers(5))).rejects.toThrow();

    expect(fake.committedIds()).toEqual(['old-1', 'old-2', 'old-3']);
  });

  it('publishes the cleared table and the full replacement set at a single commit point', async () => {
    const fake = createTransactionalFake(['old-1']);
    (connection.getDatabase as jest.Mock).mockResolvedValue(fake.db);
    const beers = makeBeers(120);

    await new BeerRepository().insertManyUnsafe(beers);

    expect(fake.committedIds()).toEqual(beers.map(beer => beer.id));
    expect(fake.commitCount()).toBe(1);
  });

  it('applies the same atomicity to the locked entry point', async () => {
    const fake = createTransactionalFake(['old-1', 'old-2', 'old-3']);
    (connection.getDatabase as jest.Mock).mockResolvedValue(fake.db);
    fake.failOnInsertNumber(2);

    await expect(new BeerRepository().insertMany(makeBeers(5))).rejects.toThrow();

    expect(fake.committedIds()).toEqual(['old-1', 'old-2', 'old-3']);
  });

  it('routes every query through the transaction object, not the database handle', async () => {
    const fake = createTransactionalFake(['old-1']);
    (connection.getDatabase as jest.Mock).mockResolvedValue(fake.db);

    await new BeerRepository().insertManyUnsafe(makeBeers(60));

    expect(fake.escapedQueries()).toBe(0);
  });
});

describe('withAtomicWrite', () => {
  it('fails loudly when a transaction body issues a write on the closure handle', async () => {
    const fake = createTransactionalFake(['old-1']);

    await expect(
      withAtomicWrite(fake.db, 'native', async txn => {
        // The probe must come after the transaction's first write: the deferred
        // BEGIN would let an earlier escaped write succeed, and the test would
        // pass for the wrong reason.
        await txn.runAsync('DELETE FROM allbeers');
        await fake.db.runAsync('INSERT OR REPLACE INTO allbeers (id) VALUES (?)', ['escapee']);
      })
    ).rejects.toThrow(/database is locked/);

    expect(fake.escapedWrites()).toBe(1);
  });

  it('records an escaped read on the closure handle even though it does not throw', async () => {
    const fake = createTransactionalFake(['old-1', 'old-2']);
    let observed: { count: number } | null = null;

    await withAtomicWrite(fake.db, 'native', async txn => {
      await txn.runAsync('DELETE FROM allbeers');
      observed = await fake.db.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) as count FROM allbeers'
      );
    });

    expect(fake.escapedQueries()).toBe(1);
    // No error was raised, and the read returned the pre-transaction snapshot
    // rather than the transaction's own DELETE. Silent, and wrong.
    expect(observed).toEqual({ count: 2 });
  });

  it('rejects a concurrent write under an exclusive transaction but absorbs it under a plain one', async () => {
    const exclusive = createTransactionalFake(['old-1']);
    await expect(
      withAtomicWrite(exclusive.db, 'native', async txn => {
        await txn.runAsync('DELETE FROM allbeers');
        await exclusive.db.runAsync('INSERT OR REPLACE INTO allbeers (id) VALUES (?)', ['other']);
      })
    ).rejects.toThrow(/database is locked/);

    const plain = createTransactionalFake(['old-1']);
    await expect(
      plain.db.withTransactionAsync(async () => {
        await plain.db.runAsync('DELETE FROM allbeers');
        await plain.db.runAsync('INSERT OR REPLACE INTO allbeers (id) VALUES (?)', ['other']);
      })
    ).resolves.toBeUndefined();
    expect(plain.committedIds()).toEqual(['other']);
  });

  it('falls back to the non-exclusive transaction on web without escaping the transaction', async () => {
    // The fake models the web build, so this test fails outright if the
    // platform branch is ever "simplified" away.
    const fake = createTransactionalFake(['old-1'], { webBuild: true });

    await withAtomicWrite(fake.db, 'web', async txn => {
      await txn.runAsync('DELETE FROM allbeers');
      await txn.runAsync('INSERT OR REPLACE INTO allbeers (id) VALUES (?)', ['web-1']);
    });

    expect(fake.committedIds()).toEqual(['web-1']);
    expect(fake.commitCount()).toBe(1);
  });
});
