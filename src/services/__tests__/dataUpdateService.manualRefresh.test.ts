import * as svc from '../../services/dataUpdateService';

// Import mocked functions
import {
  fetchBeersFromAPI,
  fetchMemberDataFromAPI,
  fetchMyBeersFromAPI,
  fetchRewardsFromAPI,
} from '../../api/beerApi';
import { setPreference } from '../../database/preferences';
import { myBeersRepository } from '../../database/repositories/MyBeersRepository';
import { rewardsRepository } from '../../database/repositories/RewardsRepository';
import {
  fetchedRows,
  confirmedEmpty,
  failed,
  malformed,
  unavailable,
} from '../../api/__tests__/helpers/fetchOutcomeFixtures';
import { ApiErrorType } from '../../utils/notificationUtils';
import { buildRefreshErrorMessages } from '../../utils/refreshErrorMessages';
import { UnreadableBodyError } from '../../api/fetchOutcome';

// Mock dependencies
jest.mock('../../database/preferences', () => ({
  getPreference: jest.fn(async (k: string) => {
    if (k === 'all_beers_api_url') return 'https://example.com/allbeers.json';
    if (k === 'my_beers_api_url') return 'https://example.com/mybeers.json';
    return '';
  }),
  setPreference: jest.fn(async () => {}),
}));

jest.mock('../../api/beerApi', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('../../api/__tests__/helpers/beerApiMock').beerApiMockFactory()
);

jest.mock('../../database/repositories/BeerRepository', () => ({
  beerRepository: {
    count: jest.fn(async () => 12),
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

  it('does not clear the ETag before fetching on a first manual refresh', async () => {
    // The complement of the test above, and the guard on the 30-second window
    // itself. Deleting `if (now - lastManualRefreshTime < RAPID_REFRESH_WINDOW_MS)`
    // made every manual refresh force a full download, and the whole suite
    // stayed green — the sibling tests all expect *a* clear, because the
    // fallback write produces one too. Only the rapid-refresh clear runs before
    // the taplist is fetched, so its absence there is what distinguishes them.
    svc.resetLastManualRefreshTime();
    (fetchBeersFromAPI as jest.Mock).mockResolvedValue(
      fetchedRows([{ id: 'beer-1', brew_name: 'Test Beer', brewer: 'Brewery' }])
    );
    (fetchMyBeersFromAPI as jest.Mock).mockResolvedValue(fetchedRows([]));
    (fetchRewardsFromAPI as jest.Mock).mockResolvedValue(fetchedRows([]));

    await svc.manualRefreshAllData();

    const setPreferenceMock = setPreference as jest.Mock;
    expect(fetchBeersFromAPI).toHaveBeenCalled();
    const firstFetchOrder = (fetchBeersFromAPI as jest.Mock).mock.invocationCallOrder[0];
    const clearOrders = setPreferenceMock.mock.calls
      .map((call: unknown[], index: number) => ({
        call,
        order: setPreferenceMock.mock.invocationCallOrder[index],
      }))
      .filter(({ call }: { call: unknown[] }) => call[0] === 'all_beers_etag')
      .map(({ order }: { order: number }) => order);

    expect(clearOrders.every((order: number) => order > firstFetchOrder)).toBe(true);
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

/**
 * Which failures select the whole-refresh "check your internet connection" alert.
 *
 * Plan refresh-failure-classification Phase 1.
 *
 * `allNetworkErrors` decides between ONE line — "Unable to connect… check your
 * internet connection" — and the per-source list from `buildRefreshErrorMessages`.
 * It was decided twice by hand in string literals, at the `sequentialRefreshAllData`
 * site and again in `manualRefreshAllData`'s outer catch, so the decision for a
 * newly added type was made by accident at both.
 *
 * Most of what follows is a DECISION FENCE rather than RED: a string comparison
 * cannot match an enum member that did not exist, so these verdicts hold on
 * arrival either way. Their job is to make the decision observable, which it was
 * not, and to kill the live mutant "widen `isTransportFault` to include
 * UNREADABLE_BODY_ERROR". The one genuinely red assertion is the copy.
 */
describe('allNetworkErrors and an unreadable body', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const unreadable = <T>() => failed<T>(ApiErrorType.UNREADABLE_BODY_ERROR, 'unreadable body');

  const ROWS: readonly {
    readonly name: string;
    readonly allBeers: () => ReturnType<typeof failed>;
    readonly myBeers: () => ReturnType<typeof failed>;
    readonly rewards: () => ReturnType<typeof failed>;
    readonly expected: boolean;
  }[] = [
    {
      name: 'every source unreadable',
      allBeers: unreadable,
      myBeers: unreadable,
      rewards: unreadable,
      // Not the offline alert. Bytes arriving proves nothing about the link, so
      // the connection advice would be a guess presented as a diagnosis; the
      // per-source list is more verbose and never false.
      expected: false,
    },
    {
      name: 'every source a network failure',
      allBeers: () => failed(ApiErrorType.NETWORK_ERROR),
      myBeers: () => failed(ApiErrorType.NETWORK_ERROR),
      rewards: () => failed(ApiErrorType.NETWORK_ERROR),
      expected: true,
    },
    {
      name: 'unreadable mixed with a network failure',
      allBeers: unreadable,
      myBeers: () => failed(ApiErrorType.NETWORK_ERROR),
      rewards: () => failed(ApiErrorType.NETWORK_ERROR),
      // `.every(...)`, so ONE unreadable source suppresses the offline alert for
      // the whole refresh. That is the cost of the decision, stated rather than
      // discovered.
      expected: false,
    },
    {
      name: 'unreadable mixed with a server error',
      allBeers: unreadable,
      myBeers: () => failed(ApiErrorType.SERVER_ERROR),
      rewards: unreadable,
      expected: false,
    },
  ];

  it.each(ROWS)(
    '$name → allNetworkErrors=$expected',
    async ({ allBeers, myBeers, rewards, expected }) => {
      (fetchBeersFromAPI as jest.Mock).mockResolvedValue(allBeers());
      (fetchMyBeersFromAPI as jest.Mock).mockResolvedValue(myBeers());
      (fetchRewardsFromAPI as jest.Mock).mockResolvedValue(rewards());

      const result = await svc.sequentialRefreshAllData();

      expect(result.hasErrors).toBe(true);
      expect(result.allNetworkErrors).toBe(expected);
    }
  );

  it('reaches the same verdict in the manual-refresh outer catch', async () => {
    // THE TWIN SITE. `sequentialRefreshAllData` is the only site the rows above
    // reach, so "wire one, leave the other's string literals" survives all of
    // them — the guard-in-two-places-tested-in-one pattern the shared predicate
    // exists to eliminate. This enters `manualRefreshAllData`'s outer catch,
    // whose `try` spans four `setPreference` calls, by failing one of them.
    (setPreference as jest.Mock).mockRejectedValueOnce(
      new UnreadableBodyError(new SyntaxError('Unexpected token'))
    );

    const result = await svc.manualRefreshAllData();

    expect(result.hasErrors).toBe(true);
    expect(result.allNetworkErrors).toBe(false);
  });

  it('sets allNetworkErrors in the outer catch when the fault IS transport', async () => {
    // THE OTHER DIRECTION at the twin site, and without it the site is not
    // pinned at all: mutation showed `allNetworkErrors: false` hard-coded there
    // survives all 15 service suites, because the only test at that site drives
    // an unreadable body and asserts `false`. Hard-coding satisfies it.
    //
    // What shipped green under that mutant is the mirror image of the defect
    // `isTransportFault` was extracted to prevent — a genuine transport fault
    // reaching this catch would show the per-source list instead of the "check
    // your internet connection" alert. The sibling site was already pinned both
    // ways; this one was not.
    (setPreference as jest.Mock).mockRejectedValueOnce(new TypeError('Network request failed'));

    const result = await svc.manualRefreshAllData();

    expect(result.hasErrors).toBe(true);
    expect(result.allNetworkErrors).toBe(true);
  });

  it('renders the unreadable-body copy in the per-source list', async () => {
    // GENUINELY RED, and the only assertion tying the decision to what a user
    // reads. Excluding the type from `allNetworkErrors` is only defensible
    // because the per-source list then carries a sentence worth reading; if the
    // copy arm is missing, `getUserFriendlyErrorMessage` falls through to
    // `case UNKNOWN_ERROR: default:` and renders `error.message` verbatim.
    (fetchBeersFromAPI as jest.Mock).mockResolvedValue(unreadable());
    (fetchMyBeersFromAPI as jest.Mock).mockResolvedValue(failed(ApiErrorType.NETWORK_ERROR));
    (fetchRewardsFromAPI as jest.Mock).mockResolvedValue(
      fetchedRows([{ reward_id: 'r1', reward_type: 'badge' }])
    );

    const result = await svc.manualRefreshAllData();

    expect(buildRefreshErrorMessages(result)).toContain(
      'All Beer data: Could not read the beer data — your network may be interfering with the connection. Your existing data has been kept.'
    );
  });
});

/**
 * Two extra attempts per source means two extra chances to wipe the tasted table.
 *
 * Plan refresh-failure-classification Phase 2. The retry does not change WHICH
 * outcomes authorise a clear — `confirmed-empty` alone — but it doubles the
 * exposure, so the boundary gets a test with a positive control rather than a
 * pair of negatives that would pass just as well against a function that never
 * clears anything at all.
 */
describe('only a confirmed-empty round clears the tasted table', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fetchBeersFromAPI as jest.Mock).mockResolvedValue(
      fetchedRows([{ id: 'b1', brew_name: 'Beer', brewer: 'X' }])
    );
    (fetchRewardsFromAPI as jest.Mock).mockResolvedValue(fetchedRows([]));
  });

  it.each([
    ['a body of the wrong shape', () => malformed()],
    ['a body that could not be read', () => failed(ApiErrorType.UNREADABLE_BODY_ERROR)],
    ['a transport failure', () => failed(ApiErrorType.NETWORK_ERROR)],
  ])('preserves the tasted table and its timestamps for %s', async (_label, outcome) => {
    (fetchMyBeersFromAPI as jest.Mock).mockResolvedValue(outcome());

    await svc.sequentialRefreshAllData();

    expect(myBeersRepository.replaceAllWithEmptyUnsafe).not.toHaveBeenCalled();
    // No timestamp either. Stamping after a non-answer told the 12-hour window
    // the data was current, which is what made a wipe survive half a day.
    expect(setPreference).not.toHaveBeenCalledWith('my_beers_last_update', expect.any(String));
    expect(setPreference).not.toHaveBeenCalledWith('my_beers_last_check', expect.any(String));
  });

  it('clears and stamps when the server genuinely reports an empty round', async () => {
    // THE POSITIVE CONTROL. Without it the three negatives above hold against a
    // `sequentialRefreshAllData` that never clears and never stamps — which is
    // to say they would pass against the bug of refusing to clear a real
    // rollover at 200, and would have told nobody.
    (fetchMyBeersFromAPI as jest.Mock).mockResolvedValue(confirmedEmpty());

    await svc.sequentialRefreshAllData();

    expect(myBeersRepository.replaceAllWithEmptyUnsafe).toHaveBeenCalled();
    expect(setPreference).toHaveBeenCalledWith('my_beers_last_update', expect.any(String));
  });
});

describe('the member body is fetched once for both sources', () => {
  // My-beers and rewards read the SAME `my_beers_api_url`, so preparing them
  // separately sent two identical requests and threw away half of each answer.
  // The bounded unreadable retry doubled the cost of that duplication.
  beforeEach(() => {
    jest.clearAllMocks();
    (fetchBeersFromAPI as jest.Mock).mockResolvedValue(
      fetchedRows([{ id: 'b1', brew_name: 'Beer', brewer: 'X' }])
    );
    (fetchMyBeersFromAPI as jest.Mock).mockResolvedValue(
      fetchedRows([{ id: 't1', brew_name: 'Tasted', brewer: 'X', tasted_date: '2026-01-01' }])
    );
    (fetchRewardsFromAPI as jest.Mock).mockResolvedValue(
      fetchedRows([{ reward_id: 'r1', reward_type: 'badge' }])
    );
  });

  it('asks for member data once during a sequential refresh', async () => {
    const result = await svc.sequentialRefreshAllData();

    expect(fetchMemberDataFromAPI).toHaveBeenCalledTimes(1);
    // Both halves still land, from the one answer.
    expect(result.myBeersResult.success).toBe(true);
    expect(result.rewardsResult.success).toBe(true);
  });

  // The OTHER site that prepares both sources back to back —
  // `refreshAllDataFromAPI` — is pinned in `refreshAllDataFromAPI.locking.test.ts`,
  // which already has the `areApiUrlsConfigured` stub that entry point needs.
  // Wiring one site and leaving the other is the failure the pair guards.
});

/**
 * What clearing the timestamp preferences before a manual refresh actually does.
 *
 * Plan refresh-failure-classification, deferred item D6.
 *
 * `manualRefreshAllData` cleared four preferences and logged "Clearing timestamp
 * checks for manual refresh", which reads as though it were gating the refresh
 * it precedes. It is not: `sequentialRefreshAllData` fetches unconditionally and
 * never consults a timestamp. Verified across the repo — the ONLY reader of
 * `*_last_check` is `shouldRefreshData`, reached only from
 * `checkAndRefreshOnAppOpen`, and `*_last_update` is written in four places and
 * read nowhere at all.
 *
 * So the clears have exactly one effect, on a LATER refresh rather than this
 * one: a source this refresh fails to update is left with an empty
 * `*_last_check`, and the next app open therefore refreshes it instead of
 * skipping it inside the 12-hour window. That is worth keeping and was worth
 * nobody having to reverse-engineer. Nothing asserted it before.
 */
describe('what a manual refresh does to the freshness timestamps', () => {
  const stampsFor = (key: string): unknown[] =>
    (setPreference as jest.Mock).mock.calls.filter((c: unknown[]) => c[0] === key).map(c => c[1]);

  beforeEach(() => {
    jest.clearAllMocks();
    (fetchBeersFromAPI as jest.Mock).mockResolvedValue(
      fetchedRows([{ id: 'b1', brew_name: 'Beer', brewer: 'X' }])
    );
  });

  it('leaves my_beers_last_check empty when the source failed', async () => {
    // The one real effect. Without it the next app open sees a stale-but-recent
    // timestamp, decides the data is fresh, and skips the source this refresh
    // just failed to update.
    (fetchMyBeersFromAPI as jest.Mock).mockResolvedValue(failed(ApiErrorType.NETWORK_ERROR));
    (fetchRewardsFromAPI as jest.Mock).mockResolvedValue(fetchedRows([]));

    await svc.manualRefreshAllData();

    expect(stampsFor('my_beers_last_check')).toEqual(['']);
  });

  it('ends with a fresh my_beers_last_check when the source succeeded', async () => {
    // THE POSITIVE CONTROL. Without it the assertion above holds just as well
    // against a refresh that never stamps anything — which would suppress
    // nothing and force a full refresh on every single app open.
    (fetchMyBeersFromAPI as jest.Mock).mockResolvedValue(
      fetchedRows([{ id: 't1', brew_name: 'Tasted', brewer: 'X', tasted_date: '2026-01-01' }])
    );
    (fetchRewardsFromAPI as jest.Mock).mockResolvedValue(fetchedRows([]));

    await svc.manualRefreshAllData();

    const stamps = stampsFor('my_beers_last_check');
    expect(stamps[stamps.length - 1]).toEqual(expect.stringMatching(/^\d{4}-/));
  });
});

/**
 * Shared fate, driven through the service — the one thing the shared mock cannot show.
 *
 * `beerApiMock.beerApiMockFactory` has `fetchMemberDataFromAPI` delegate to the
 * two per-source mocks, so every other suite in the repo can still stage
 * `myBeers: failed, rewards: fetched` — a pairing production can no longer
 * produce for anything upstream of the extractors. One request means one
 * `resolveMemberApiUrl`, one verdict, both halves.
 *
 * That is a deliberate trade — converting ~160 per-source stubs would be a far
 * larger change than the one under test. These two tests OVERRIDE that mock for
 * this describe only, with a hand-built both-failed pair.
 *
 * What they are and are not: they show what shared fate costs a user, which
 * nothing else states. They do NOT prove production produces a both-failed pair
 * — they stub the output — and mutation testing found no defect that only they
 * catch. The production property lives in `beerApi.memberCoalescing.test.ts`,
 * where a real `global.fetch` exists.
 */
describe('one member request means one verdict for both halves', () => {
  const bothHalvesFail = (type: ApiErrorType, message: string): void => {
    // Overrides the delegating factory implementation for this test. Production
    // builds both halves from ONE `createErrorResponse(error)`, so they are the
    // same classification and the same message by construction.
    // `…Once`, not `mockResolvedValue`. `clearAllMocks` does not remove a mock
    // IMPLEMENTATION, so a persistent override here outlives this describe and
    // is served to whichever block someone appends next — the exact leak that
    // broke an ETag test twelve hundred lines away in the sibling suite. This
    // describe happens to be last today; that is luck, not a design.
    (fetchMemberDataFromAPI as jest.Mock).mockResolvedValueOnce({
      myBeers: failed(type, message),
      rewards: failed(type, message),
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (fetchBeersFromAPI as jest.Mock).mockResolvedValue(
      fetchedRows([{ id: 'b1', brew_name: 'Beer', brewer: 'X' }])
    );
  });

  it('fails both sources together when the single member request fails', async () => {
    bothHalvesFail(ApiErrorType.UNREADABLE_BODY_ERROR, 'Response body could not be read as JSON');

    const result = await svc.sequentialRefreshAllData();

    expect(result.myBeersResult.success).toBe(false);
    expect(result.rewardsResult.success).toBe(false);
    // The taplist is a different URL with its own fetch, so it is untouched —
    // shared fate is scoped to the two sources that share a request, not to the
    // refresh.
    expect(result.allBeersResult.success).toBe(true);
  });

  it('renders the same sentence twice, which is the cost of the trade', async () => {
    // Stated rather than discovered. `buildRefreshErrorMessages` emits one line
    // per failed source, so a member failure now always produces two lines
    // carrying identical copy under different labels. That is what the user
    // sees, and it is the price of not asking the same URL twice.
    //
    // It also re-prices the `isTransportFault` exclusion argument, which was
    // written before coalescing: "a mixed refresh drops to the per-source list —
    // more verbose, strictly more informative" now buys one distinct sentence
    // and one duplicate rather than two distinct ones. Still more informative
    // than the single offline line, and still never false; just less of a margin
    // than the docstring claims.
    bothHalvesFail(ApiErrorType.UNREADABLE_BODY_ERROR, 'Response body could not be read as JSON');

    const messages = buildRefreshErrorMessages(await svc.manualRefreshAllData());
    const copy =
      'Could not read the beer data — your network may be interfering with the connection. Your existing data has been kept.';

    expect(messages).toContain(`Beerfinder data: ${copy}`);
    expect(messages).toContain(`Rewards data: ${copy}`);
  });
});
