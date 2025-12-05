import * as svc from '../../services/dataUpdateService';

// Import mocked functions
import { fetchBeersFromAPI, fetchMyBeersFromAPI, fetchRewardsFromAPI } from '../../api/beerApi';

// Mock dependencies
jest.mock('../../database/preferences', () => ({
  getPreference: jest.fn(async (k: string) => {
    if (k === 'all_beers_api_url') return 'https://example.com/allbeers.json';
    if (k === 'my_beers_api_url') return 'https://example.com/mybeers.json';
    return '';
  }),
  setPreference: jest.fn(async () => {}),
}));

jest.mock('../../api/beerApi', () => ({
  fetchBeersFromAPI: jest.fn(),
  fetchMyBeersFromAPI: jest.fn(),
  fetchRewardsFromAPI: jest.fn(),
}));

jest.mock('../../database/repositories/BeerRepository', () => ({
  beerRepository: {
    insertManyUnsafe: jest.fn(async () => {}),
  },
}));

jest.mock('../../database/repositories/MyBeersRepository', () => ({
  myBeersRepository: {
    insertManyUnsafe: jest.fn(async () => {}),
  },
}));

jest.mock('../../database/repositories/RewardsRepository', () => ({
  rewardsRepository: {
    insertManyUnsafe: jest.fn(async () => {}),
  },
}));

jest.mock('../../database/DatabaseLockManager', () => ({
  databaseLockManager: {
    acquireLock: jest.fn(async () => {}),
    releaseLock: jest.fn(),
  },
}));

describe('manualRefreshAllData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('refreshes core endpoints and returns no errors when all succeed', async () => {
    // Mock successful API responses
    (fetchBeersFromAPI as jest.Mock).mockResolvedValue([
      { id: 'beer-1', brew_name: 'Test Beer 1', brewer: 'Test Brewery' },
      { id: 'beer-2', brew_name: 'Test Beer 2', brewer: 'Test Brewery' },
      { id: 'beer-3', brew_name: 'Test Beer 3', brewer: 'Test Brewery' },
    ]);
    (fetchMyBeersFromAPI as jest.Mock).mockResolvedValue([
      { id: 'beer-1', brew_name: 'Test Beer 1', brewer: 'Test Brewery', tasted_date: '2023-01-01' },
      { id: 'beer-2', brew_name: 'Test Beer 2', brewer: 'Test Brewery', tasted_date: '2023-01-02' },
    ]);
    (fetchRewardsFromAPI as jest.Mock).mockResolvedValue([
      { reward_id: 'reward-1', reward_type: 'badge' },
      { reward_id: 'reward-2', reward_type: 'badge' },
      { reward_id: 'reward-3', reward_type: 'badge' },
      { reward_id: 'reward-4', reward_type: 'badge' },
      { reward_id: 'reward-5', reward_type: 'badge' },
    ]);

    const result = await svc.manualRefreshAllData();

    expect(result.hasErrors).toBe(false);
    expect(result.allBeersResult.success).toBe(true);
    expect(result.myBeersResult.success).toBe(true);
    expect(result.rewardsResult.success).toBe(true);
  });

  it('handles partial failure and sets hasErrors', async () => {
    // Mock: all beers fails, others succeed
    (fetchBeersFromAPI as jest.Mock).mockRejectedValue(new Error('Server error'));
    (fetchMyBeersFromAPI as jest.Mock).mockResolvedValue([
      { id: 'beer-1', brew_name: 'Test Beer 1', brewer: 'Test Brewery', tasted_date: '2023-01-01' },
      { id: 'beer-2', brew_name: 'Test Beer 2', brewer: 'Test Brewery', tasted_date: '2023-01-02' },
    ]);
    (fetchRewardsFromAPI as jest.Mock).mockResolvedValue([
      { reward_id: 'reward-1', reward_type: 'badge' },
      { reward_id: 'reward-2', reward_type: 'badge' },
      { reward_id: 'reward-3', reward_type: 'badge' },
      { reward_id: 'reward-4', reward_type: 'badge' },
      { reward_id: 'reward-5', reward_type: 'badge' },
    ]);

    const result = await svc.manualRefreshAllData();

    expect(result.hasErrors).toBe(true);
    expect(result.allBeersResult.success).toBe(false);
    expect(result.myBeersResult.success).toBe(true);
    expect(result.rewardsResult.success).toBe(true);
  });
});
