/**
 * Which of five states a beer list should render
 *
 * Plan 03 Phase 3.
 *
 * Replaces the `isLoadingBeers && allBeers.length === 0` gate duplicated across
 * Beerfinder, AllBeers and TastedBrewList. That gate has two failure modes:
 * `isLoadingBeers` starts false, so the very first render falls through to the
 * list branch with an empty array and shows "0 to discover"; and every failed
 * retry clears the flag in its finally while the error is only set once all
 * retries exhaust, so the same wrong state reappears during each backoff.
 */

export type BeerListViewState = 'loading' | 'error' | 'empty' | 'list' | 'list-with-error';

/**
 * Note what is NOT here: an `isLoading` flag.
 *
 * Once "has the first load settled?" is tracked explicitly, the in-flight flag
 * adds nothing — pull-to-refresh has its own spinner via BeerList's
 * `refreshing`/`onRefresh` props. Leaving it out means the selector cannot flap
 * mid-backoff, a background refresh over cached data renders the list instead
 * of flashing a skeleton, and a member who has tasted everything gets a stable
 * empty state rather than a skeleton on every refresh.
 */
export type BeerListViewInput = {
  readonly hasCompletedFirstLoad: boolean;
  readonly error: string | null;
  readonly itemCount: number;
};

/**
 * Pick the state to render.
 *
 * **The ordering is the point.** `error` is checked before the first-load
 * guard, so a set error can never render a loader. The earlier ordering checked
 * the loading guard first, which on the terminal-failure path — all retries
 * throw, the error is set, the flag was never set because the success handler
 * never ran — produced a skeleton that stayed on screen forever, with only an
 * Alert as a clue. That failure is now structurally impossible rather than
 * avoided by convention, and holds regardless of where the flag gets set.
 *
 * Cached data wins over everything: if there are rows to show, showing them
 * beats both a spinner and an error page. A failed refresh over cached data
 * surfaces as `list-with-error` so the staleness is visible rather than
 * swallowed.
 */
export function selectBeerListViewState(input: BeerListViewInput): BeerListViewState {
  if (input.itemCount > 0) {
    return input.error === null ? 'list' : 'list-with-error';
  }

  if (input.error !== null) {
    return 'error';
  }

  if (!input.hasCompletedFirstLoad) {
    return 'loading';
  }

  return 'empty';
}
