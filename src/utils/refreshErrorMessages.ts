/**
 * Turns a manual refresh result into the lines of its error alert.
 *
 * Plan 05, review remediation.
 *
 * **The bug this exists to prevent.** `hasErrors` is computed from all three
 * sources, but both refresh hooks built the alert body from all-beers and
 * my-beers only — `rewardsResult` was read nowhere in `hooks/`, `components/`
 * or `app/`. A rewards-only failure therefore raised
 * `Alert.alert('Data Refresh Error', 'There were problems refreshing beer data:\n\n')`:
 * an error dialog with an empty body.
 *
 * That state was unreachable until plan 05 Phase 5.1, because rewards always
 * reported `success: true` no matter what came back. Making rewards able to fail
 * is what exposed the gap, so closing it belongs with that change.
 *
 * A pure function rather than a fix inside the hooks, for two reasons: TESTING.md
 * forbids Jest tests that drive React Native hooks (they hang), so logic that
 * lives in a hook cannot be pinned by a test; and the two hooks carried
 * byte-identical copies of this block, which is how one of them would have been
 * fixed and the other missed.
 */

import { getUserFriendlyErrorMessage } from './notificationUtils';
import type { DataUpdateResult, ManualRefreshResult } from '../services/dataUpdateService';

/**
 * Label shown to the user for each source, in the order they appear.
 *
 * "Beerfinder" rather than "My beers" because that is the tab name the user
 * sees; the internal name appears nowhere in the UI.
 */
const SOURCE_LABELS = ['All Beer data', 'Beerfinder data', 'Rewards data'] as const;

/**
 * Shown when a source failed but carried no error to describe.
 *
 * Reachable whenever a `DataUpdateResult` has `success: false` and no `error`.
 * The old per-source guards (`!success && result.X.error`) contributed nothing
 * in that case and silently shortened the list — which, for the last remaining
 * failure, produced the blank dialog. Naming it is worse than a specific message
 * and better than an empty one.
 */
const UNDESCRIBED_FAILURE = 'An unexpected problem occurred.';

/**
 * The per-source lines for a refresh error alert.
 *
 * Guarantees a non-empty list whenever any source failed, so a caller cannot
 * render a heading with nothing under it.
 *
 * @param result - The completed manual refresh
 * @returns One line per failed source; empty only when nothing failed
 */
export function buildRefreshErrorMessages(result: ManualRefreshResult): readonly string[] {
  const sources: readonly DataUpdateResult[] = [
    result.allBeersResult,
    result.myBeersResult,
    result.rewardsResult,
  ];

  return sources.flatMap((source, index) =>
    source.success
      ? []
      : [
          `${SOURCE_LABELS[index]}: ${
            source.error ? getUserFriendlyErrorMessage(source.error) : UNDESCRIBED_FAILURE
          }`,
        ]
  );
}
