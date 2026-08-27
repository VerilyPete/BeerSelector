/**
 * Tests for shouldReloadAfterFocusRefresh
 *
 * Plan 03 Phase 1.
 *
 * The three tab screens await a focus refresh and then do nothing with the
 * result but console.log it. The refresh writes SQLite, but
 * AppContext.loadBeerDataFromDatabase only runs from the mount effect, so
 * nothing re-reads and the Beerfinder count keeps showing the pre-refresh
 * snapshot. This predicate is the decision those screens are missing.
 */

import { describe, it, expect } from 'vitest';
import { shouldReloadAfterFocusRefresh } from '../focusRefreshOutcome';
import type { RefreshOutcome } from '../focusRefreshOutcome';
import { ApiErrorType } from '../notificationUtils';
import type { ErrorResponse } from '../notificationUtils';

// Uses the real ErrorResponse rather than redefining it — a local copy would
// drift from the shape production actually passes.
function networkError(): ErrorResponse {
  return {
    type: ApiErrorType.NETWORK_ERROR,
    message: 'Network connection error',
  };
}

describe('shouldReloadAfterFocusRefresh', () => {
  it('reloads when the refresh reported that it wrote data', () => {
    expect(shouldReloadAfterFocusRefresh({ updated: true }, false)).toBe(true);
  });

  it('does not reload when the refresh wrote nothing', () => {
    expect(shouldReloadAfterFocusRefresh({ updated: false }, false)).toBe(false);
  });

  it('reloads when data was written even though some sources errored', () => {
    // Bound to a variable rather than passed as a literal, because that is how
    // production calls it: the real AutoRefreshResult carries more fields, and
    // structural assignability — not excess-property checking on a fresh
    // literal — is what has to hold.
    const partialSuccess: RefreshOutcome & { errors: ErrorResponse[] } = {
      updated: true,
      errors: [networkError()],
    };

    // Partial success still changed the table, so the screen is stale until it
    // re-reads. Keying off errors instead of `updated` would skip the repaint.
    expect(shouldReloadAfterFocusRefresh(partialSuccess, false)).toBe(true);
  });

  it('does not reload when every source failed and nothing was written', () => {
    const totalFailure: RefreshOutcome & { errors: ErrorResponse[] } = {
      updated: false,
      errors: [networkError()],
    };

    expect(shouldReloadAfterFocusRefresh(totalFailure, false)).toBe(false);
  });

  it('does not reload once the screen has been cancelled', () => {
    // The screen unmounted or lost focus mid-refresh. Reloading now would set
    // state on something nobody is looking at.
    expect(shouldReloadAfterFocusRefresh({ updated: true }, true)).toBe(false);
  });

  it('does not reload when the refresh produced no result', () => {
    expect(shouldReloadAfterFocusRefresh(null, false)).toBe(false);
  });
});
