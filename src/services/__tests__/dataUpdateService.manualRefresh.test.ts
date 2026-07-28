import * as svc from '../../services/dataUpdateService';

// Import mocked functions
import { fetchBeersFromAPI, fetchMyBeersFromAPI, fetchRewardsFromAPI } from '../../api/beerApi';
import { setPreference } from '../../database/preferences';
import { myBeersRepository } from '../../database/repositories/MyBeersRepository';
import { rewardsRepository } from '../../database/repositories/RewardsRepository';
import {
  fetchedRows,
  confirmedEmpty,
  unavailable,
} from '../../api/__tests__/helpers/fetchOutcomeFixtures';

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
    replaceAllWithEmptyUnsafe: jest.fn(async () => {}),
  },
}));

jest.mock('../../database/repositories/RewardsRepository', () => ({
  rewardsRepository: {
    replaceAllWithEmpty: jest.fn(async () => {}),
    replaceAllWithEmptyUnsafe: jest.fn(async () => {}),
    insertManyUnsafe: jest.fn(async () => {}),
  },
}));

jest.mock('../../database/DatabaseLockManager', () => ({
  databaseLockManager: {
    withDatabaseLock: jest.fn(async (_name: string, task: () => Promise<unknown>) => task()),
  },
}));

describe('manualRefreshAllData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('refreshes core endpoints and returns no errors when all succeed', async () => {
    // Mock successful API responses
    (fetchBeersFromAPI as jest.Mock).mockResolvedValue(
      fetchedRows([
        { id: 'beer-1', brew_name: 'Test Beer 1', brewer: 'Test Brewery' },
        { id: 'beer-2', brew_name: 'Test Beer 2', brewer: 'Test Brewery' },
        { id: 'beer-3', brew_name: 'Test Beer 3', brewer: 'Test Brewery' },
      ])
    );
    (fetchMyBeersFromAPI as jest.Mock).mockResolvedValue(
      fetchedRows([
        {
          id: 'beer-1',
          brew_name: 'Test Beer 1',
          brewer: 'Test Brewery',
          tasted_date: '2023-01-01',
        },
        {
          id: 'beer-2',
          brew_name: 'Test Beer 2',
          brewer: 'Test Brewery',
          tasted_date: '2023-01-02',
        },
      ])
    );
    (fetchRewardsFromAPI as jest.Mock).mockResolvedValue(
      fetchedRows([
        { reward_id: 'reward-1', reward_type: 'badge' },
        { reward_id: 'reward-2', reward_type: 'badge' },
        { reward_id: 'reward-3', reward_type: 'badge' },
        { reward_id: 'reward-4', reward_type: 'badge' },
        { reward_id: 'reward-5', reward_type: 'badge' },
      ])
    );

    const result = await svc.manualRefreshAllData();

    expect(result.hasErrors).toBe(false);
    expect(result.allBeersResult.success).toBe(true);
    expect(result.myBeersResult.success).toBe(true);
    expect(result.rewardsResult.success).toBe(true);
  });

  it('clears the rewards table when the server confirms zero rewards', async () => {
    // The sequentialRefreshAllData site. `fetchAndUpdateRewards` and
    // `refreshAllDataFromAPI` have their own tests for the same property, and
    // they are separate on purpose: the three sites carried three copies of
    // `decision.action === 'clear' ? [] : rows` and routing two of them through
    // a real clear while one kept the empty insert is indistinguishable, from
    // the outside, from fixing none of them. Removing the clear here leaves the
    // other two tests green.
    (fetchBeersFromAPI as jest.Mock).mockResolvedValue(
      fetchedRows([{ id: 'beer-1', brew_name: 'Test Beer 1', brewer: 'Test Brewery' }])
    );
    (fetchMyBeersFromAPI as jest.Mock).mockResolvedValue(
      fetchedRows([
        {
          id: 'beer-1',
          brew_name: 'Test Beer 1',
          brewer: 'Test Brewery',
          tasted_date: '2026-01-01',
        },
      ])
    );
    (fetchRewardsFromAPI as jest.Mock).mockResolvedValue(confirmedEmpty());

    const result = await svc.manualRefreshAllData();

    expect(rewardsRepository.replaceAllWithEmptyUnsafe).toHaveBeenCalled();
    expect(rewardsRepository.insertManyUnsafe).not.toHaveBeenCalled();
    expect(result.rewardsResult).toEqual({ success: true, dataUpdated: true, itemCount: 0 });
  });

  it('handles partial failure and sets hasErrors', async () => {
    // Mock: all beers fails, others succeed
    (fetchBeersFromAPI as jest.Mock).mockRejectedValue(new Error('Server error'));
    (fetchMyBeersFromAPI as jest.Mock).mockResolvedValue(
      fetchedRows([
        {
          id: 'beer-1',
          brew_name: 'Test Beer 1',
          brewer: 'Test Brewery',
          tasted_date: '2023-01-01',
        },
        {
          id: 'beer-2',
          brew_name: 'Test Beer 2',
          brewer: 'Test Brewery',
          tasted_date: '2023-01-02',
        },
      ])
    );
    (fetchRewardsFromAPI as jest.Mock).mockResolvedValue(
      fetchedRows([
        { reward_id: 'reward-1', reward_type: 'badge' },
        { reward_id: 'reward-2', reward_type: 'badge' },
        { reward_id: 'reward-3', reward_type: 'badge' },
        { reward_id: 'reward-4', reward_type: 'badge' },
        { reward_id: 'reward-5', reward_type: 'badge' },
      ])
    );

    const result = await svc.manualRefreshAllData();

    expect(result.hasErrors).toBe(true);
    expect(result.allBeersResult.success).toBe(false);
    expect(result.myBeersResult.success).toBe(true);
    expect(result.rewardsResult.success).toBe(true);
  });

  // INVERTED by plan 04 Phase 2. The arrangement mocks `fetchBeersFromAPI` —
  // the FALLBACK path — and a fallback write must clear the ETag, whether or
  // not the rapid-refresh window also wanted it cleared. The rapid-refresh
  // clear is a separate mechanism, asserted by the test below.
  it('clears the ETag on the first manual refresh when the taplist came from the fallback', async () => {
    svc.resetLastManualRefreshTime();
    (fetchBeersFromAPI as jest.Mock).mockResolvedValue(
      fetchedRows([{ id: 'beer-1', brew_name: 'Test Beer', brewer: 'Brewery' }])
    );
    (fetchMyBeersFromAPI as jest.Mock).mockResolvedValue(fetchedRows([]));
    (fetchRewardsFromAPI as jest.Mock).mockResolvedValue(fetchedRows([]));

    await svc.manualRefreshAllData();

    const etagClears = (setPreference as jest.Mock).mock.calls.filter(
      (c: unknown[]) => c[0] === 'all_beers_etag'
    );
    expect(etagClears).not.toHaveLength(0);
    expect(etagClears.every((c: unknown[]) => c[1] === '')).toBe(true);
  });

  it('clears ETag on rapid second manual refresh within 30s', async () => {
    svc.resetLastManualRefreshTime();
    (fetchBeersFromAPI as jest.Mock).mockResolvedValue(
      fetchedRows([{ id: 'beer-1', brew_name: 'Test Beer', brewer: 'Brewery' }])
    );
    (fetchMyBeersFromAPI as jest.Mock).mockResolvedValue(fetchedRows([]));
    (fetchRewardsFromAPI as jest.Mock).mockResolvedValue(fetchedRows([]));

    await svc.manualRefreshAllData();
    jest.clearAllMocks();

    // Re-setup mocks after clear
    (fetchBeersFromAPI as jest.Mock).mockResolvedValue(
      fetchedRows([{ id: 'beer-1', brew_name: 'Test Beer', brewer: 'Brewery' }])
    );
    (fetchMyBeersFromAPI as jest.Mock).mockResolvedValue(fetchedRows([]));
    (fetchRewardsFromAPI as jest.Mock).mockResolvedValue(fetchedRows([]));

    await svc.manualRefreshAllData();

    const setPreferenceMock = setPreference as jest.Mock;
    const etagClears = setPreferenceMock.mock.calls.filter(
      (c: unknown[]) => c[0] === 'all_beers_etag'
    );
    expect(etagClears.every((c: unknown[]) => c[1] === '')).toBe(true);

    // Two clears happen, and both are correct: the rapid-refresh window clears
    // to force a full fetch, and the fallback write clears because the rows it
    // stored carry no ETag. Counting them pinned an implementation detail — but
    // asserting only "at least one" meant the FALLBACK clear satisfied this test
    // on its own, and deleting the rapid-refresh clear entirely left the whole
    // suite green. Order is what separates them: only the rapid-refresh clear
    // runs before the taplist is fetched.
    expect(fetchBeersFromAPI).toHaveBeenCalled();
    const firstFetchOrder = (fetchBeersFromAPI as jest.Mock).mock.invocationCallOrder[0];
    const clearOrders = setPreferenceMock.mock.calls
      .map((call: unknown[], index: number) => ({
        call,
        order: setPreferenceMock.mock.invocationCallOrder[index],
      }))
      .filter(({ call }: { call: unknown[] }) => call[0] === 'all_beers_etag')
      .map(({ order }: { order: number }) => order);

    expect(clearOrders.some((order: number) => order < firstFetchOrder)).toBe(true);
  });
});

describe('sequentialRefreshAllData: empty vs malformed tasted beers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fetchBeersFromAPI as jest.Mock).mockResolvedValue(
      fetchedRows([{ id: 'beer-1', brew_name: 'Test Beer 1', brewer: 'Test Brewery' }])
    );
    (fetchRewardsFromAPI as jest.Mock).mockResolvedValue(fetchedRows([]));
  });

  it('clears the tasted table when the server reports a genuinely empty round', async () => {
    // The rollover at 200, or a new user. This arm previously had NO coverage
    // at all on this path — deleting the clear call left the whole suite green.
    (fetchMyBeersFromAPI as jest.Mock).mockResolvedValue(fetchedRows([]));

    const result = await svc.sequentialRefreshAllData();

    expect(myBeersRepository.replaceAllWithEmptyUnsafe).toHaveBeenCalledTimes(1);
    expect(myBeersRepository.insertManyUnsafe).not.toHaveBeenCalled();
    expect(result.myBeersResult.success).toBe(true);
  });

  it('does not clear the tasted table when every row fails validation', async () => {
    // THIS is the test that covers the `else` arm. Rows carrying ids — so
    // beerApi's own filter passes them through — that fail validateBeer on
    // brew_name. A value the real function genuinely can return.
    //
    // The rejection test below covers a DIFFERENT path: beerApi throwing, which
    // is caught by the outer per-source catch and never reaches this branch.
    // Rewriting the original test to use a rejection fixed its motivation and
    // silently moved it off the branch it was covering, leaving the malformed
    // arm with no test at all.
    (fetchMyBeersFromAPI as jest.Mock).mockResolvedValue(
      fetchedRows([
        { id: 'm1', brew_name: '', brewer: 'X' },
        { id: 'm2', brew_name: '', brewer: 'Y' },
      ])
    );

    const result = await svc.sequentialRefreshAllData();

    expect(myBeersRepository.replaceAllWithEmptyUnsafe).not.toHaveBeenCalled();
    expect(myBeersRepository.insertManyUnsafe).not.toHaveBeenCalled();
    expect(result.myBeersResult.success).toBe(false);
    expect(setPreference).not.toHaveBeenCalledWith('my_beers_last_update', expect.any(String));
  });

  it('does not clear the tasted table when the fetch reports malformed rows', async () => {
    // The FIRST version of this test mocked fetchMyBeersFromAPI resolving
    // [{brew_name:'no id'}] — a value the real function CANNOT return, because
    // it filtered for id itself and returned [] when nothing survived. The test
    // was green while production still wiped the table. beerApi now throws,
    // which is what makes this case reachable at all; this drives that real
    // contract instead of an invented one.
    (fetchMyBeersFromAPI as jest.Mock).mockRejectedValue(
      new Error('My Beers response contained 2 rows and all lack an id')
    );

    const result = await svc.sequentialRefreshAllData();

    expect(myBeersRepository.replaceAllWithEmptyUnsafe).not.toHaveBeenCalled();
    expect(myBeersRepository.insertManyUnsafe).not.toHaveBeenCalled();
    expect(result.myBeersResult.success).toBe(false);
    // And no timestamp, which is what made the wipe persist for 12 hours.
    expect(setPreference).not.toHaveBeenCalledWith('my_beers_last_update', expect.any(String));
  });
});

describe('sequentialRefreshAllData: FetchOutcome semantics (plan 02 Phase 3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fetchBeersFromAPI as jest.Mock).mockResolvedValue(
      fetchedRows([{ id: 'b1', brew_name: 'Beer', brewer: 'X' }])
    );
    (fetchRewardsFromAPI as jest.Mock).mockResolvedValue(fetchedRows([]));
  });

  it('does not clear the tasted table when my beers are unavailable', async () => {
    // Visitor mode, an unconfigured URL, a none:// placeholder — none of these
    // are "the server said you have none". Before FetchOutcome they all arrived
    // as the same empty array and cleared a populated tasted list.
    (fetchMyBeersFromAPI as jest.Mock).mockResolvedValue(unavailable('not-applicable', 'visitor'));

    await svc.sequentialRefreshAllData();

    expect(myBeersRepository.replaceAllWithEmptyUnsafe).not.toHaveBeenCalled();
    expect(myBeersRepository.insertManyUnsafe).not.toHaveBeenCalled();
  });

  it('does not stamp my_beers_last_check when my beers are unavailable', async () => {
    // THE 12-HOUR SUPPRESSION REGRESSION TEST. Stamping the timestamp after a
    // non-answer told the 12-hour refresh window that the data was current, so
    // the app would not try again until the window elapsed — turning a
    // transient condition into half a day of wrong data.
    (fetchMyBeersFromAPI as jest.Mock).mockResolvedValue(unavailable('not-configured', 'no url'));

    await svc.sequentialRefreshAllData();

    expect(setPreference).not.toHaveBeenCalledWith('my_beers_last_check', expect.any(String));
    expect(setPreference).not.toHaveBeenCalledWith('my_beers_last_update', expect.any(String));
  });

  it('clears the tasted table when the server confirms an empty round', async () => {
    // The one case where clearing IS correct: a new user, or the rollover at
    // 200. Distinguishing this from the case above is the entire point.
    (fetchMyBeersFromAPI as jest.Mock).mockResolvedValue(confirmedEmpty());

    const result = await svc.sequentialRefreshAllData();

    expect(myBeersRepository.replaceAllWithEmptyUnsafe).toHaveBeenCalled();
    expect(setPreference).toHaveBeenCalledWith('my_beers_last_check', expect.any(String));
    expect(result.myBeersResult.success).toBe(true);
  });
});
