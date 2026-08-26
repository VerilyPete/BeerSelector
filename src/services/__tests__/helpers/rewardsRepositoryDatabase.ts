import type { SQLiteDatabase } from 'expo-sqlite';
import type { Reward } from '../../../types/database';

type RunResult = { changes: number; lastInsertRowId: number };

export type RewardsRepositoryDatabase = {
  readonly database: SQLiteDatabase;
  readonly storedRewards: () => readonly Reward[];
};

/**
 * Minimal successful-write adapter for exercising the real RewardsRepository.
 *
 * It models only the DELETE and batched INSERT statements used by the partial
 * snapshot test. It deliberately makes no rollback or native-bind claim.
 */
export function createRewardsRepositoryDatabase(
  seeded: readonly Reward[] = []
): RewardsRepositoryDatabase {
  let stored = seeded.map(reward => ({ ...reward }));

  const runAsync = async (sql: string, params: readonly unknown[] = []): Promise<RunResult> => {
    if (/^\s*DELETE FROM rewards/i.test(sql)) {
      const changes = stored.length;
      stored = [];
      return { changes, lastInsertRowId: 0 };
    }

    if (/^\s*INSERT OR REPLACE INTO rewards/i.test(sql)) {
      for (let index = 0; index < params.length; index += 3) {
        const reward: Reward = {
          reward_id: String(params[index]),
          redeemed: String(params[index + 1]),
          reward_type: String(params[index + 2]),
        };
        const previous = stored.findIndex(row => row.reward_id === reward.reward_id);
        if (previous === -1) stored.push(reward);
        else stored[previous] = reward;
      }
      return { changes: params.length / 3, lastInsertRowId: stored.length };
    }

    return { changes: 0, lastInsertRowId: 0 };
  };

  const database = {
    runAsync,
    withTransactionAsync: async (task: () => Promise<void>): Promise<void> => task(),
  } as unknown as SQLiteDatabase;

  return {
    database,
    storedRewards: () => stored.map(reward => ({ ...reward })),
  };
}
