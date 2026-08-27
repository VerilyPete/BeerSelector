import { vi } from 'vitest';
import { fetchAndUpdateRewards } from '../dataUpdateService';
import * as preferences from '../../database/preferences';
import * as connection from '../../database/connection';
import { logWarning } from '../../utils/errorLogger';
import type { Reward } from '../../types/database';
import { createRewardsRepositoryDatabase } from './helpers/rewardsRepositoryDatabase';

vi.mock('../../database/preferences');
vi.mock('../../database/connection');
vi.mock('../../database/locks', async () => ({
  databaseLockManager: {
    withDatabaseLock: jest.fn(async (_name: string, task: () => Promise<unknown>) => task()),
  },
}));
vi.mock('../../utils/errorLogger', async () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ...(await vi.importActual<typeof import('../../utils/errorLogger')>('../../utils/errorLogger')),
  logWarning: jest.fn(),
}));

global.fetch = jest.fn();

describe('mixed rewards snapshots', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (preferences.getPreference as jest.Mock).mockImplementation((key: string) => {
      if (key === 'is_visitor_mode') return Promise.resolve('false');
      if (key === 'my_beers_api_url') return Promise.resolve('https://example.com/member.json');
      return Promise.resolve(null);
    });
  });

  it('replaces the old snapshot with survivors and emits a structured collateral-delete warning', async () => {
    const stored: Reward[] = [
      { reward_id: 'old-redeemable', redeemed: '0', reward_type: 'Free Plate' },
    ];
    const repositoryDatabase = createRewardsRepositoryDatabase(stored);
    (connection.getDatabase as jest.Mock).mockResolvedValue(repositoryDatabase.database);
    const survivor: Reward = {
      reward_id: 'new-valid',
      redeemed: '0',
      reward_type: '$5 Credit',
    };

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => [{}, {}, { reward: [{ redeemed: '0', reward_type: 'No id' }, survivor] }],
    });

    await expect(fetchAndUpdateRewards()).resolves.toEqual({
      success: true,
      dataUpdated: true,
      itemCount: 1,
    });

    expect(repositoryDatabase.storedRewards()).toEqual([survivor]);
    expect(repositoryDatabase.storedRewards()).not.toContainEqual(
      expect.objectContaining({ reward_id: 'old-redeemable' })
    );
    expect(logWarning).toHaveBeenCalledWith(
      expect.stringMatching(/^Rewards: dropped .* replacing the stored snapshot/),
      {
        operation: 'extractRewards',
        component: 'beerApi',
        additionalData: { droppedRows: 1, receivedRows: 2, survivingRows: 1 },
      }
    );
  });
});
