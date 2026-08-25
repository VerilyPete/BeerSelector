/**
 * The `jest.mock` factory for `src/api/beerApi`, shared by every suite that
 * mocks it.
 *
 * Plan refresh-failure-classification, D2. My-beers and rewards read the same
 * `my_beers_api_url` and take different slices of the same array, so the service
 * now asks for both with ONE call to `fetchMemberDataFromAPI` instead of two.
 *
 * **`fetchMemberDataFromAPI` delegates to the two per-source mocks** rather than
 * being stubbed on its own. About 160 stub setups across ten suites are written
 * per-source, and converting them would be a far larger and riskier change than
 * the one under test — every existing test's arrangement silently altered to
 * prove a saving none of them can observe. Delegation also keeps the four
 * `expect(fetchMyBeersFromAPI).toHaveBeenCalledTimes(1)` assertions meaningful.
 *
 * The consequence, stated because it is a real limit: this factory UN-DOES the
 * coalescing, so no suite using it can see the request saving. That property is
 * counted against a real `global.fetch` in `beerApi.memberCoalescing.test.ts`,
 * which is the only layer where requests exist at all. What the service suites
 * pin is that the service asks ONCE.
 *
 * **Rejections are absorbed, because production never rejects.** The real
 * `fetchMemberDataFromAPI` catches internally and returns `failed` for both
 * halves; it is also called OUTSIDE the service's per-source handling, so a
 * delegate that let a `mockRejectedValue` escape would fail the whole refresh
 * where the old per-source call failed one source. Converting to `failed` here
 * reproduces the old path exactly: `prepareMyBeers` rethrows it as a
 * `SourceFailureError`, and `createErrorResponse` unwraps that back to the same
 * `ErrorResponse` the old catch built directly.
 *
 * Not a `.test.ts` file, so Jest's testMatch does not collect it.
 */

/** One half of the member body, with a rejection turned into a `failed` outcome. */
async function settleHalf(fetcher: jest.Mock): Promise<unknown> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createErrorResponse } = require('../../../utils/notificationUtils');
  try {
    return await fetcher();
  } catch (error) {
    return { status: 'failed', error: createErrorResponse(error) };
  }
}

/**
 * Build the mock module.
 *
 * Called from inside a `jest.mock` factory, which may not close over
 * out-of-scope variables — hence `require` at the call site.
 */
export function beerApiMockFactory() {
  const fetchMyBeersFromAPI = jest.fn();
  const fetchRewardsFromAPI = jest.fn();

  return {
    fetchBeersFromAPI: jest.fn(),
    fetchMyBeersFromAPI,
    fetchRewardsFromAPI,
    fetchMemberDataFromAPI: jest.fn(async () => ({
      myBeers: await settleHalf(fetchMyBeersFromAPI),
      rewards: await settleHalf(fetchRewardsFromAPI),
    })),
  };
}
