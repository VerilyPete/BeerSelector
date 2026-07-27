/**
 * Tests for selectBeerListViewState
 *
 * Plan 03 Phase 3.
 *
 * The three list components gate their skeleton on
 * `isLoadingBeers && allBeers.length === 0`. `isLoadingBeers` starts false, so
 * the first render falls straight through to the list branch with an empty
 * array — "0 to discover" plus BeerList's empty message — and every failed
 * retry resets the flag in its finally while the error is only set after all
 * retries exhaust. This selector replaces that gate.
 *
 * Ordering matters more than any individual case here: `error` is checked
 * before the first-load guard, so a set error can never render a loader. Review
 * round 1 found the earlier ordering rendered a PERMANENT skeleton on terminal
 * failure — the exact outcome the selector exists to prevent.
 */

import { selectBeerListViewState } from '../beerListViewState';

describe('selectBeerListViewState', () => {
  it('shows the loader until the first load settles — covers the first render and every retry backoff window', () => {
    // One test, not two: the first-render and mid-backoff inputs are identical
    // by construction, because isLoading is deliberately not an input.
    expect(
      selectBeerListViewState({ hasCompletedFirstLoad: false, error: null, itemCount: 0 })
    ).toBe('loading');
  });

  it('shows the error state when the first load settles having failed', () => {
    expect(
      selectBeerListViewState({ hasCompletedFirstLoad: true, error: 'Failed…', itemCount: 0 })
    ).toBe('error');
  });

  it('shows the error state rather than a stuck loader if an error arrives before settlement', () => {
    // Unreachable by construction once Phase 4 sets the flag on settlement
    // rather than success. Pinned anyway so the ordering can never regress into
    // the permanent skeleton, whatever Phase 4 later does with the flag.
    expect(
      selectBeerListViewState({ hasCompletedFirstLoad: false, error: 'Failed…', itemCount: 0 })
    ).toBe('error');
  });

  it('shows the empty state only after a successful load returned nothing', () => {
    expect(
      selectBeerListViewState({ hasCompletedFirstLoad: true, error: null, itemCount: 0 })
    ).toBe('empty');
  });

  it('shows the list when data is present', () => {
    expect(
      selectBeerListViewState({ hasCompletedFirstLoad: true, error: null, itemCount: 12 })
    ).toBe('list');
  });

  it('shows the list with a stale-data indicator when a refresh failed but data is cached', () => {
    // The user's decision: cached data stays visible, and the failure is
    // surfaced alongside it rather than swallowed or replaced by an error page.
    expect(
      selectBeerListViewState({ hasCompletedFirstLoad: true, error: 'Failed…', itemCount: 12 })
    ).toBe('list-with-error');
  });

  it('still shows cached data rather than a loader before the first load settles', () => {
    expect(
      selectBeerListViewState({ hasCompletedFirstLoad: false, error: null, itemCount: 12 })
    ).toBe('list');
  });
});
