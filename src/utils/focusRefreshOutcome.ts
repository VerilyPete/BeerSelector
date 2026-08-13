/**
 * Whether a completed focus refresh should trigger a re-read from SQLite
 *
 * Plan 03 Phase 1.
 *
 * The three tab screens await `checkAndRefreshOnAppOpen` and then do nothing
 * with the result but log it. The refresh writes `allbeers` and
 * `tasted_brew_current_round`, but nothing on the focus path calls
 * `refreshBeerData` — the only other caller of `loadBeerDataFromDatabase` — so
 * nothing re-reads afterwards and the
 * Beerfinder count keeps rendering the pre-refresh snapshot. That is one of the
 * paths to the reported "count is wrong or empty".
 */

/**
 * The part of a refresh result this decision depends on.
 *
 * Structural on purpose. `AutoRefreshResult` in `dataUpdateService` is
 * assignable to it, so call sites compile unchanged — but this module does not
 * import that type, which keeps it free of plan 02's reshaping. If `updated`
 * ever stops existing there, the breakage is a compile error at one call site
 * rather than a cross-plan interface negotiation.
 */
export type RefreshOutcome = {
  readonly updated: boolean;
};

/**
 * Decide whether the screen needs to re-read the database.
 *
 * Keys off `updated` alone, not on whether any source errored: a partial
 * refresh that wrote something still leaves the screen stale, and treating
 * errors as "don't repaint" would skip exactly that case.
 *
 * @param result - What the refresh reported, or null if it produced nothing
 * @param cancelled - True once the screen unmounted or lost focus mid-refresh
 */
export function shouldReloadAfterFocusRefresh(
  result: RefreshOutcome | null,
  cancelled: boolean
): boolean {
  if (cancelled || result === null) {
    return false;
  }

  return result.updated;
}
