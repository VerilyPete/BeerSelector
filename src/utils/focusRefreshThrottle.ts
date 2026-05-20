/**
 * In-memory throttle for the per-tab "refresh data on focus" check.
 *
 * Every tab screen runs `checkAndRefreshOnAppOpen` in a `useFocusEffect`, which
 * performs several awaited SQLite reads before deciding (almost always) that the
 * data is still fresh. Without a guard that work repeats on every single tab
 * switch. This throttle lets at most one focus-check run per window across all
 * tabs — the underlying data window is hours wide, so a few minutes of
 * coalescing is harmless and keeps tab switching cheap.
 */
const DEFAULT_THROTTLE_MS = 5 * 60 * 1000;

let lastRunAt = 0;

/** Pure decision: has the throttle window elapsed since the last run? */
export function shouldRunFocusCheck(lastRunAt: number, now: number, throttleMs: number): boolean {
  return now - lastRunAt >= throttleMs;
}

/**
 * Stateful gate for focus effects. Returns true (and records the run) when the
 * window has elapsed; false while throttled. `now` is injectable for testing.
 */
export function shouldRunFocusRefresh(
  now: number = Date.now(),
  throttleMs: number = DEFAULT_THROTTLE_MS
): boolean {
  if (shouldRunFocusCheck(lastRunAt, now, throttleMs)) {
    lastRunAt = now;
    return true;
  }
  return false;
}

/** Reset the throttle (test isolation only). */
export function resetFocusRefreshThrottle(): void {
  lastRunAt = 0;
}
