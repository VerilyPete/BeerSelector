import { fetchAndUpdateRewards } from '../dataUpdateService';
import * as preferences from '../../database/preferences';
import * as connection from '../../database/connection';
import { ApiErrorType } from '../../utils/notificationUtils';
import { createTransactionalRewardsDatabase } from './helpers/transactionalRewardsDatabase';

jest.mock('../../database/preferences');
jest.mock('../../database/connection');
jest.mock('../../database/locks', () => ({
  databaseLockManager: {
    withDatabaseLock: jest.fn(async (_name: string, task: () => Promise<unknown>) => task()),
  },
}));

global.fetch = jest.fn();

const STORED_REWARD = {
  reward_id: 'stored-redeemable',
  redeemed: '0',
  reward_type: 'Free Plate',
};

describe('compound fields in a rewards snapshot', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (preferences.getPreference as jest.Mock).mockImplementation((key: string) => {
      if (key === 'is_visitor_mode') return Promise.resolve('false');
      if (key === 'my_beers_api_url') return Promise.resolve('https://example.com/member.json');
      return Promise.resolve(null);
    });
  });

  it.each([
    ['object redeemed', { redeemed: { value: 1 }, reward_type: '$5 Credit' }],
    ['array redeemed', { redeemed: [1], reward_type: '$5 Credit' }],
    ['object reward_type', { redeemed: '0', reward_type: { name: '$5 Credit' } }],
    ['array reward_type', { redeemed: '0', reward_type: ['$5 Credit'] }],
  ])('keeps the stored snapshot when the server sends an %s value', async (_label, fields) => {
    const transaction = createTransactionalRewardsDatabase([STORED_REWARD]);
    (connection.getDatabase as jest.Mock).mockResolvedValue(transaction.database);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => [{}, {}, { reward: [{ reward_id: 'incoming', ...fields }] }],
    });

    const result = await fetchAndUpdateRewards();

    expect(result).toMatchObject({
      success: false,
      dataUpdated: false,
      error: { type: ApiErrorType.MALFORMED_RESPONSE_ERROR },
    });
    expect(transaction.committedRewards()).toEqual([STORED_REWARD]);
  });
});
