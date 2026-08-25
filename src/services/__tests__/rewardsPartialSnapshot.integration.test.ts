import { fetchAndUpdateRewards } from '../dataUpdateService';
import * as preferences from '../../database/preferences';
import { rewardsRepository } from '../../database/repositories/RewardsRepository';
import { logWarning } from '../../utils/errorLogger';
import type { Reward } from '../../types/database';

jest.mock('../../database/preferences');
jest.mock('../../database/repositories/RewardsRepository');
jest.mock('../../utils/errorLogger', () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ...jest.requireActual('../../utils/errorLogger'),
  logWarning: jest.fn(),
}));

global.fetch = jest.fn();

describe('mixed rewards snapshots', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (preferences.getPreference as jest.Mock).mockImplementation((key: string) => {
      if (key === 'is_visitor_mode') return Promise.resolve('false');
      if (key === 'my_beers_api_url') return Promise.resolve('https://example.com/member.json');
      return Promise.resolve(null);
    });
  });

  it('replaces the old snapshot with survivors and emits a structured collateral-delete warning', async () => {
    let stored: Reward[] = [
      { reward_id: 'old-redeemable', redeemed: '0', reward_type: 'Free Plate' },
    ];
    const survivor: Reward = {
      reward_id: 'new-valid',
      redeemed: '0',
      reward_type: '$5 Credit',
    };

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => [{}, {}, { reward: [{ redeemed: '0', reward_type: 'No id' }, survivor] }],
    });
    (rewardsRepository.insertMany as jest.Mock).mockImplementation(async (rows: Reward[]) => {
      // Model the repository's DELETE-then-insert replacement semantics so the
      // assertion describes what the member sees, not merely a mock call.
      stored = [...rows];
    });

    await expect(fetchAndUpdateRewards()).resolves.toEqual({
      success: true,
      dataUpdated: true,
      itemCount: 1,
    });

    expect(stored).toEqual([survivor]);
    expect(stored).not.toContainEqual(expect.objectContaining({ reward_id: 'old-redeemable' }));
    expect(logWarning).toHaveBeenCalledWith(
      'Rewards: dropped 1 of 2 rows without a usable reward_id; replacing the stored snapshot with 1 survivor',
      {
        operation: 'extractRewards',
        component: 'beerApi',
        additionalData: { droppedRows: 1, receivedRows: 2, survivingRows: 1 },
      }
    );
  });
});
