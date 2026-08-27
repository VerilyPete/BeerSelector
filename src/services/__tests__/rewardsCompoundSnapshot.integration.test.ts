import { vi, type Mock } from 'vitest';
import { fetchAndUpdateRewards } from '../dataUpdateService';
import * as preferences from '../../database/preferences';
import * as connection from '../../database/connection';
import { ApiErrorType } from '../../utils/notificationUtils';

vi.mock('../../database/preferences');
vi.mock('../../database/connection');
vi.mock('../../database/locks', () => ({
  databaseLockManager: {
    withDatabaseLock: vi.fn(async (_name: string, task: () => Promise<unknown>) => task()),
  },
}));

global.fetch = vi.fn();

describe('compound fields in a rewards snapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (preferences.getPreference as Mock).mockImplementation((key: string) => {
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
  ])('rejects an %s value before opening a database transaction', async (_label, fields) => {
    (global.fetch as Mock).mockResolvedValue({
      ok: true,
      json: async () => [{}, {}, { reward: [{ reward_id: 'incoming', ...fields }] }],
    });

    const result = await fetchAndUpdateRewards();

    expect(connection.getDatabase).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: false,
      dataUpdated: false,
      error: { type: ApiErrorType.MALFORMED_RESPONSE_ERROR },
    });
  });
});
