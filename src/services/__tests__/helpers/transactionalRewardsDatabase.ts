import type { SQLiteDatabase } from 'expo-sqlite';
import type { Reward } from '../../../types/database';

type RunResult = { changes: number; lastInsertRowId: number };

export type TransactionalRewardsDatabase = {
  readonly database: SQLiteDatabase;
  readonly committedRewards: () => readonly Reward[];
};

/**
 * Minimal SQLiteDatabase model for exercising the real RewardsRepository.
 *
 * DELETE and INSERT mutate a staged snapshot while `withTransactionAsync` is
 * open. The snapshot becomes visible only when the callback resolves; a throw
 * discards it. Bind values are checked against Expo SQLite's primitive bind
 * contract so this does not silently accept values iOS would reject.
 */
export function createTransactionalRewardsDatabase(
  seeded: readonly Reward[] = []
): TransactionalRewardsDatabase {
  let committed = seeded.map(reward => ({ ...reward }));
  let staged: Reward[] | null = null;

  const target = (): Reward[] => staged ?? committed;

  const runAsync = async (sql: string, params: readonly unknown[] = []): Promise<RunResult> => {
    if (/^\s*DELETE FROM rewards/i.test(sql)) {
      const changes = target().length;
      target().length = 0;
      return { changes, lastInsertRowId: 0 };
    }

    if (/^\s*INSERT OR REPLACE INTO rewards/i.test(sql)) {
      for (const value of params) {
        if (
          value !== null &&
          typeof value !== 'string' &&
          typeof value !== 'number' &&
          typeof value !== 'boolean' &&
          !(value instanceof Uint8Array)
        ) {
          throw new Error(`Unsupported parameter type: ${typeof value}`);
        }
      }

      for (let index = 0; index < params.length; index += 3) {
        const reward: Reward = {
          reward_id: String(params[index]),
          redeemed: String(params[index + 1]),
          reward_type: String(params[index + 2]),
        };
        const previous = target().findIndex(row => row.reward_id === reward.reward_id);
        if (previous === -1) target().push(reward);
        else target()[previous] = reward;
      }
      return { changes: params.length / 3, lastInsertRowId: target().length };
    }

    return { changes: 0, lastInsertRowId: 0 };
  };

  const database = {
    runAsync,
    withTransactionAsync: async (task: () => Promise<void>): Promise<void> => {
      staged = committed.map(reward => ({ ...reward }));
      try {
        await task();
        committed = staged;
      } finally {
        staged = null;
      }
    },
    getAllAsync: async <T>(sql: string): Promise<T[]> =>
      (/SELECT \* FROM rewards/i.test(sql) ? committed.map(reward => ({ ...reward })) : []) as T[],
    getFirstAsync: async () => null,
  } as unknown as SQLiteDatabase;

  return {
    database,
    committedRewards: () => committed.map(reward => ({ ...reward })),
  };
}
