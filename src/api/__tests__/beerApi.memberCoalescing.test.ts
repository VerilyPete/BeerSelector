import { vi, type Mock } from 'vitest';
/**
 * My-beers and rewards are two halves of ONE body, and cost one request.
 *
 * Plan refresh-failure-classification, deferred item D2, taken before shipping
 * Phase 2's cost.
 *
 * `resolveMemberApiUrl` reads `my_beers_api_url` for both sources, so
 * `fetchMyBeersFromAPI` and `fetchRewardsFromAPI` have always sent the SAME
 * request to the SAME URL, back to back, and thrown away half of each answer:
 * my-beers reads `data[1].tasted_brew_current_round` and rewards reads
 * `data[2].reward`, out of one array the server sends whole. Two of the four
 * member requests in a refresh were pure duplication.
 *
 * Phase 2 made that duplication cost more, not less: one unreadable retry per
 * source is TWO extra requests on the same URL, both spent re-asking a question
 * already answered by the body the other half just read.
 *
 * The saving is bounded and stated: one request in the happy path, two when the
 * body comes back unreadable.
 *
 * **Shared fate is the trade, and it is deliberate.** One request means one
 * outcome for both halves: a transient failure that today could take out
 * my-beers while rewards succeeded will now take out both. Two requests to one
 * URL a second apart disagreeing is a transient artifact rather than
 * information, so agreeing is the more honest answer — but it IS a behaviour
 * change and the test below pins it rather than leaving it to be discovered.
 */

import { fetchMemberDataFromAPI, fetchMyBeersFromAPI, fetchRewardsFromAPI } from '../beerApi';
import * as preferences from '../../database/preferences';
import { ApiErrorType } from '../../utils/notificationUtils';
import type { FetchOutcome, UnconditionalSource } from '../fetchOutcome';

vi.mock('../../database/preferences');

global.fetch = vi.fn();

/**
 * Drive a call to completion.
 *
 * `src/__vitest__/setup.ts` calls `vi.useFakeTimers()` for every suite, so the backoff
 * `setTimeout` inside `fetchWithRetry` never fires on its own and the promise
 * simply never settles.
 */
const settle = async <T>(pending: Promise<T>): Promise<T> => {
  await vi.advanceTimersByTimeAsync(60_000);
  return pending;
};

const memberPrefs = (key: string) => {
  if (key === 'is_visitor_mode') return Promise.resolve('false');
  if (key === 'my_beers_api_url') return Promise.resolve('https://example.com/member.json');
  return Promise.resolve(null);
};

/** The real server shape: one array, my-beers at [1] and rewards at [2]. */
const MEMBER_BODY = [
  {},
  { tasted_brew_current_round: [{ id: 't1', brew_name: 'Tasted', brewer: 'X' }] },
  // The three fields the server actually sends. An earlier version of this fixture
  // omitted `redeemed` and the rewards half came back `malformed` — which is the
  // element validation doing its job on a hand-written row that did not match
  // what the server actually sends.
  { reward: [{ reward_id: 'r1', redeemed: '0', reward_type: '$5 Credit' }] },
];

const respondWith = (body: unknown): void => {
  (global.fetch as Mock).mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => body,
  });
};

describe('fetchMemberDataFromAPI', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    (preferences.getPreference as Mock).mockImplementation(memberPrefs);
  });

  it('answers both sources from a single request', async () => {
    respondWith(MEMBER_BODY);

    const member = await settle(fetchMemberDataFromAPI());

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(member.myBeers.status).toBe('fetched');
    expect(member.rewards.status).toBe('fetched');
    if (member.myBeers.status === 'fetched') expect(member.myBeers.data.kind).toBe('data');
    if (member.rewards.status === 'fetched') expect(member.rewards.data.kind).toBe('data');
  });

  it('costs one request where the two separate fetchers cost two', async () => {
    // THE SAVING, measured rather than asserted in prose. Both arrangements ask
    // the same URL for the same body; only the request count differs.
    respondWith(MEMBER_BODY);

    await settle(fetchMyBeersFromAPI());
    await settle(fetchRewardsFromAPI());
    const separately = (global.fetch as Mock).mock.calls.length;

    (global.fetch as Mock).mockClear();
    await settle(fetchMemberDataFromAPI());
    const coalesced = (global.fetch as Mock).mock.calls.length;

    expect(separately).toBe(2);
    expect(coalesced).toBe(1);
  });

  it('extracts the two halves independently of each other', async () => {
    // The halves are NOT one outcome returned twice. My-beers needs `data[1]`
    // and rewards needs `data[2]`, so a two-element body answers one and not the
    // other — exactly what two separate requests for this body would have
    // produced, which is the property that makes the coalescing a pure saving
    // rather than a change of meaning.
    respondWith([{}, { tasted_brew_current_round: [{ id: 't1', brew_name: 'T', brewer: 'X' }] }]);

    const member = await settle(fetchMemberDataFromAPI());

    expect(member.myBeers.status).toBe('fetched');
    if (member.myBeers.status === 'fetched') expect(member.myBeers.data.kind).toBe('data');
    expect(member.rewards.status).toBe('fetched');
    if (member.rewards.status === 'fetched') expect(member.rewards.data.kind).toBe('malformed');
  });

  it('spends the unreadable retry once for the pair, not once per source', async () => {
    // Phase 2's cost, halved on this path. Two separate fetchers against a body
    // that never parses spend two attempts EACH — four requests to one URL to
    // learn one thing twice.
    (global.fetch as Mock).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => JSON.parse('<html>Sign in to continue</html>'),
    });

    const member = await settle(fetchMemberDataFromAPI());

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(member.myBeers.status).toBe('failed');
    expect(member.rewards.status).toBe('failed');
  });

  it('gives both halves the same failure when the request fails', async () => {
    // SHARED FATE, pinned. One request, one verdict.
    (global.fetch as Mock).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({}),
    });

    const member = await settle(fetchMemberDataFromAPI());

    expect(member.myBeers.status).toBe('failed');
    expect(member.rewards.status).toBe('failed');
    if (member.myBeers.status === 'failed' && member.rewards.status === 'failed') {
      expect(member.myBeers.error.type).toBe(ApiErrorType.SERVER_ERROR);
      expect(member.rewards.error.type).toBe(ApiErrorType.SERVER_ERROR);
    }
  });

  it('reports both halves failed when resolving the URL throws', async () => {
    // `resolveMemberApiUrl` awaits `getPreference` twice, so a database fault
    // raises here rather than in `fetch`. This function is called OUTSIDE the
    // service's per-source catch, so anything escaping it takes out the whole
    // refresh instead of the two sources it concerns — which is what happened
    // when an earlier draft of this change hoisted the resolve out of the try.
    (preferences.getPreference as Mock).mockRejectedValue(new Error('database is locked'));

    const member = await settle(fetchMemberDataFromAPI());

    expect(member.myBeers.status).toBe('failed');
    expect(member.rewards.status).toBe('failed');
  });

  // Widened to `unknown` so the two fetchers share one signature, exactly as
  // `beerApi.failureOutcome.test.ts` does for its table — every assertion here is
  // on `status`, which is the point.
  const SINGLE_SOURCE: readonly [
    string,
    () => Promise<UnconditionalSource<FetchOutcome<unknown>>>,
  ][] = [
    ['fetchMyBeersFromAPI', fetchMyBeersFromAPI],
    ['fetchRewardsFromAPI', fetchRewardsFromAPI],
  ];

  it.each(SINGLE_SOURCE)(
    '%s also reports failed rather than throwing when resolving throws',
    async (_l, call) => {
      // The same contract on the two single-source fetchers, which had it before
      // this change and must keep it.
      (preferences.getPreference as Mock).mockRejectedValue(new Error('database is locked'));

      await expect(settle(call())).resolves.toMatchObject({ status: 'failed' });
    }
  );

  it.each([
    ['visitor mode', (key: string) => Promise.resolve(key === 'is_visitor_mode' ? 'true' : null)],
    [
      'a none:// placeholder',
      (key: string) =>
        Promise.resolve(
          key === 'is_visitor_mode' ? 'false' : key === 'my_beers_api_url' ? 'none://x' : null
        ),
    ],
    [
      'no configured URL',
      (key: string) => Promise.resolve(key === 'is_visitor_mode' ? 'false' : null),
    ],
  ])('reports both halves unavailable without a request for %s', async (_label, prefs) => {
    // The URL is resolved ONCE for the pair, so the three conditions that mean
    // "do not ask" cannot now be answered differently for the two sources — the
    // divergence that let rewards keep sending a none:// placeholder to fetch()
    // after my-beers had been taught not to.
    (preferences.getPreference as Mock).mockImplementation(prefs);

    const member = await settle(fetchMemberDataFromAPI());

    expect(global.fetch).not.toHaveBeenCalled();
    expect(member.myBeers.status).toBe('unavailable');
    expect(member.rewards.status).toBe('unavailable');
    if (member.myBeers.status === 'unavailable' && member.rewards.status === 'unavailable') {
      expect(member.rewards.reason.code).toBe(member.myBeers.reason.code);
    }
  });
});

/**
 * The real server body, extracted by the layer that now owns extraction.
 *
 * `dataUpdateService.integration.test.ts` used to drive `mybeers.json` through
 * `fetchAndUpdateMyBeers`, because that function carried its own parse and its
 * own extraction. D3 retired that copy, so the "a real server body still
 * extracts" half of those tests lives here — against a real `global.fetch`,
 * which is the only place it can actually be shown.
 */
describe('extracting the real mybeers.json fixture', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    (preferences.getPreference as Mock).mockImplementation(memberPrefs);
  });

  // The COMMITTED fixture. This read `process.cwd() + '/mybeers.json'`, which is
  // wrong twice over: the repo-root copy is gitignored and untracked, so a fresh
  // checkout does not have it (`.gitignore:103`, and the note there records CI
  // losing a whole suite to ENOENT for exactly this), and `process.cwd()`
  // depends on where jest was invoked from rather than on `rootDir`.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fixture = async (): Promise<unknown> =>
    (await import('../../services/__tests__/fixtures/mybeers.json')).default;

  it('returns every tasted row the fixture carries', async () => {
    const body = (await fixture()) as [unknown, { tasted_brew_current_round: unknown[] }];
    respondWith(body);

    const outcome = await settle(fetchMyBeersFromAPI());

    expect(outcome.status).toBe('fetched');
    if (outcome.status === 'fetched' && outcome.data.kind === 'data') {
      expect(outcome.data.items).toHaveLength(body[1].tasted_brew_current_round.length);
      // The fields the tasted list and the glass icon are built from. Asserted
      // against the real body rather than a hand-written row, which is the whole
      // reason this fixture is in the repo.
      for (const field of ['id', 'brew_name', 'brewer', 'brew_style', 'tasted_date', 'chit_code']) {
        expect(outcome.data.items[0]).toHaveProperty(field);
      }
    } else {
      throw new Error(`expected data, got ${JSON.stringify(outcome).slice(0, 120)}`);
    }
  });

  it('reads the rewards half of the same fixture independently', async () => {
    // The fixture is a member body, so it exercises the coalesced path on real
    // data: whatever `data[2]` holds, my-beers is unaffected by it.
    respondWith(await fixture());

    const member = await settle(fetchMemberDataFromAPI());

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(member.myBeers.status).toBe('fetched');
    if (member.myBeers.status === 'fetched') expect(member.myBeers.data.kind).toBe('data');
  });
});
