import { getPreference, setPreference, areApiUrlsConfigured } from '../database/preferences';
import { fetchBeersFromAPI, fetchMyBeersFromAPI, fetchRewardsFromAPI } from '../api/beerApi';
import {
  Beer,
  Beerfinder,
  BeerWithContainerType,
  BeerfinderWithContainerType,
} from '../types/beer';
import { Reward } from '../types/database';
import {
  ApiErrorType,
  ErrorResponse,
  SourceFailureError,
  createErrorResponse,
} from '../utils/notificationUtils';
import { beerRepository } from '../database/repositories/BeerRepository';
import { myBeersRepository } from '../database/repositories/MyBeersRepository';
import { rewardsRepository } from '../database/repositories/RewardsRepository';
import { databaseLockManager } from '../database/DatabaseLockManager';
import { toNonEmpty } from '../api/fetchOutcome';
import { commitTaplistWrite, readTaplistEtag, shouldTrustNotModified } from './taplistEtag';
import type { TaplistWriteSource } from './taplistEtag';
import type {
  FetchOutcome,
  NonEmptyArray,
  UnavailableReason,
  UnconditionalSource,
} from '../api/fetchOutcome';
import { validateBrewInStockResponse, validateBeerArray } from '../api/validators';
import { logError, logWarning } from '../utils/errorLogger';
import { calculateContainerTypes } from '../database/utils/glassTypeCalculator';
import { config } from '@/src/config';
import {
  fetchBeersFromProxy,
  fetchEnrichmentBatchWithMissing,
  syncBeersToWorker,
  mergeEnrichmentData,
  recordFallback,
  pollForEnrichmentUpdates,
  EnrichedBeerResponse,
} from './enrichmentService';
import { EnrichmentUpdate } from '../types/enrichment';

const RAPID_REFRESH_WINDOW_MS = 30_000;
let lastManualRefreshTime = 0;

export function resetLastManualRefreshTime(): void {
  lastManualRefreshTime = 0;
}

/**
 * Drop any in-flight refresh. **Tests only**, matching
 * `resetLastManualRefreshTime`.
 *
 * A test that starts a refresh without awaiting it parks the promise in the
 * module slot, and every later call in that file silently joins a run it never
 * started — which presents as an unrelated test hanging or asserting against
 * someone else's fetches.
 */
export function resetInFlightSequentialRefresh(): void {
  inFlightSequentialRefresh = null;
}

/**
 * Operation labels for the two entry points that share the `prepare*` phase.
 *
 * Threaded rather than hardcoded because they reach `logError`/`logWarning`, and
 * a login-path failure logged as `sequentialRefreshAllData` sends whoever reads
 * the log to the wrong function. Two tests assert on the
 * `refreshAllDataFromAPI - …` forms specifically, which is the shape that keeps
 * "skip" distinguishable from "fail" at an entry point with no success channel.
 */
const SEQUENTIAL_REFRESH = 'sequentialRefreshAllData';
const REFRESH_FROM_API = 'refreshAllDataFromAPI';

/**
 * The only two values the shared `prepare*` phase may be labelled with.
 *
 * A bare `string` let a caller pass anything, and the label is interpolated as
 * `${operation} - all beers` — so `prepareAllBeers('refreshAllDataFromAPI -
 * rewards')` compiled and produced `refreshAllDataFromAPI - rewards - all
 * beers`, and passing the wrong entry point's constant produced exactly the
 * misdirection this threading exists to prevent. Two tests pin two of six
 * emitting sites; the type covers all of them.
 */
type RefreshOperation = typeof SEQUENTIAL_REFRESH | typeof REFRESH_FROM_API;

/**
 * How a caller wants to be treated when a refresh is already running.
 */
type SequentialRefreshOptions = {
  /**
   * Accept the running refresh's result instead of starting one (default), or
   * wait for it to finish and then run fresh.
   *
   * `01` Phase 4 chose joining outright — "a caller wanting fresh data
   * mid-refresh is served correctly by the in-flight result". That holds for
   * automatic refreshes, which is what it was reasoned about. It does not hold
   * for a caller that has already changed state the running refresh cannot see,
   * and there are three of those:
   *
   * - `manualRefreshAllData` clears `all_beers_etag` on a rapid second refresh
   *   so the user can force a full fetch. Joining hands back the result of a run
   *   that read the OLD ETag, so the escape hatch becomes a silent no-op.
   * - It also clears the four timestamp preferences. Joining a run that already
   *   stamped them leaves them at `''`, and `shouldRefreshData` then forces a
   *   redundant full refresh on the next app open.
   * - The post-login refresh (`useLoginFlow` → `onRefreshData`) runs the moment
   *   a visitor becomes a member. Joining a visitor-mode run returns
   *   `my beers not applicable` as a success, with `silent: true` so nothing is
   *   shown, and the tasted list is never fetched with the new credentials.
   *
   * Waiting costs a second serialised download for two explicit taps — which is
   * what shipped before 5.4, so it is not a regression against any released
   * behaviour. De-duplication keeps doing its job for the automatic refreshes it
   * was added for.
   */
  readonly join?: boolean;
};

/**
 * Wait until no refresh is running.
 *
 * Loops rather than awaiting once: another caller can start a run while we are
 * waiting on this one, and returning then would defeat the point. A rejection is
 * swallowed because we are waiting for the slot to clear, not for the outcome —
 * and `runSequentialRefresh` reports failures in its result rather than throwing
 * anyway.
 */
async function settleInFlightRefresh(): Promise<void> {
  while (inFlightSequentialRefresh !== null) {
    await inFlightSequentialRefresh.catch(() => undefined);
  }
}

/**
 * The refresh currently running, if any, so a second caller joins it instead of
 * starting a competing one.
 *
 * Plan 01 Phase 4. Until that phase the master lock was the *only* thing
 * serialising concurrent refreshes — nothing else de-duplicates them:
 * `useDataRefresh`'s `refreshing` flag is per-component
 * (`hooks/useDataRefresh.ts`), and `shouldRunFocusRefresh` is a five-minute
 * throttle rather than a mutex (`src/utils/focusRefreshThrottle.ts`). Moving the
 * fetches out from under that lock therefore removes the serialisation as a
 * side effect, and without this replacement the result is two concurrent full
 * taplist downloads on precisely the weak link this work targets.
 *
 * Deliberately not a queue. A caller arriving mid-refresh wants fresh data, and
 * the refresh already in flight is fresh data; making it wait for a second round
 * trip to learn the same thing is the cost this exists to avoid.
 *
 * Write ordering, stated rather than left implicit: overlapping refreshes of the
 * same source are now impossible, and a refresh overlapping some *other* writer
 * is last-writer-wins. That is acceptable and self-healing — both writers
 * replace the whole table from the same upstream, so the loser's rows are not
 * partial, only seconds older, and the next refresh reconciles.
 */
let inFlightSequentialRefresh: Promise<ManualRefreshResult> | null = null;

/**
 * What a source's unlocked phase concluded.
 *
 * Either the source is already done — it failed, or it had nothing to store —
 * or it has a write waiting for the lock. Splitting it this way is what lets the
 * caller answer "does anything need the lock at all?" with one predicate over
 * the three plans, instead of a hand-maintained condition per source that drifts
 * away from what the write functions actually do.
 */
type SourcePlan<TWrite> =
  | { readonly kind: 'settled'; readonly result: SettledResult }
  | { readonly kind: 'write'; readonly write: TWrite };

/**
 * What a source that reached its conclusion without a write may report.
 *
 * Narrower than `DataUpdateResult`, which is a plain record and would let a
 * `settled` plan claim `dataUpdated: true` with an `itemCount` — a completed
 * write in a run that may not even take the lock. It would equally admit a
 * failure with no `error`, which `allNetworkErrors` filters out before its
 * `.every`, making the offline alert fire vacuously for a non-network fault.
 *
 * Neither is reachable today; both are the defect class `FetchedSource` and
 * `RewardsDecision` were shaped to make unrepresentable, so this says it in the
 * type rather than relying on all six construction sites staying disciplined.
 */
type SettledResult =
  | { readonly success: true; readonly dataUpdated: false }
  | {
      readonly success: false;
      readonly dataUpdated: false;
      readonly error: ErrorResponse;
    };

/**
 * A taplist write.
 *
 * `not-modified` is a write: a 304 stamps `all_beers_last_check` so the 12-hour
 * window advances even though no rows changed.
 */
type AllBeersWrite =
  | { readonly kind: 'not-modified'; readonly fetchedFor: TaplistConfiguration }
  | {
      readonly kind: 'replace';
      readonly beers: NonEmptyArray<BeerWithContainerType>;
      /**
       * Which store's configuration these rows were fetched against.
       *
       * Carried on both arms because both are wrong to apply after a switch:
       * `replace` would write the old store's rows and validator, and
       * `not-modified` would stamp `all_beers_last_check` for a store it never
       * checked — suppressing the new store's refresh for the next 12 hours.
       */
      readonly fetchedFor: TaplistConfiguration;
      /**
       * What produced these rows, so the writer can record the ETag they imply.
       *
       * The raw `etag` used to live here and each writer applied its own
       * `if (etag)` — which is the defect: three sites deciding independently
       * all kept the PREVIOUS ETag after a fallback write, leaving it naming
       * proxy-enriched rows the table no longer held. `taplistEtag.ts` owns the
       * decision now; the plan carries it and the writer only commits it.
       */
      readonly taplistSource: TaplistWriteSource;
    };

/** A tasted-list write. `clear` is reachable only from `confirmed-empty`. */
type MyBeersWrite =
  | { readonly kind: 'clear' }
  | {
      readonly kind: 'replace';
      readonly beers: NonEmptyArray<BeerfinderWithContainerType>;
    };

/** A rewards write, mirroring the two writing arms of `RewardsDecision`. */
type RewardsWrite =
  | { readonly kind: 'clear' }
  | { readonly kind: 'replace'; readonly rows: NonEmptyArray<Reward> };

/**
 * Beers the Worker has never seen, to be handed to it once the writes are done.
 */
type PendingWorkerSync = {
  readonly missingIds: string[];
  readonly beers: BeerWithContainerType[];
};

/**
 * The my-beers plan, plus a Worker sync that must not start yet.
 *
 * The sync is the one part of `prepareMyBeers` that is not pure with respect to
 * the database: it polls the Worker and then writes enrichment straight into
 * `allbeers` and `tasted_brew_current_round`, taking the master lock itself to
 * do it (`BeerRepository.updateEnrichmentData`,
 * `MyBeersRepository.updateEnrichmentData`).
 *
 * While the refresh held one lock end to end, that write could only ever queue
 * BEHIND the refresh's own writes. Hoisting the fetches freed the lock during
 * the fetch phase, so a poll returning while the rewards fetch is still running
 * could acquire it first, persist enrichment, log success — and then have the
 * clear-and-reinsert throw it away. The poll's first sleep is 5s
 * (`enrichmentService.ts`), so the window opens on exactly the slow links this
 * work targets, and the data lost is exactly the enrichment the sync was
 * started to obtain.
 *
 * Carried as data rather than a closure so a test can see it, and so the
 * decision about *when* to fire lives with the code that knows when the writes
 * finished.
 */
type MyBeersPreparation = {
  readonly plan: SourcePlan<MyBeersWrite>;
  readonly pendingWorkerSync: PendingWorkerSync | null;
};

/**
 * Result of a data update operation
 */
export type DataUpdateResult = {
  success: boolean;
  error?: ErrorResponse;
  dataUpdated: boolean;
  itemCount?: number;
};

/**
 * Sync missing beers to Worker in background (fire-and-forget pattern).
 *
 * When batch enrichment returns IDs not found in the Worker database,
 * this helper syncs those beers to the Worker for enrichment processing.
 * Runs asynchronously without blocking the caller.
 *
 * @param missingIds - Array of beer IDs missing from Worker database
 * @param allBeers - Array of beers to filter from (must include beers with missingIds)
 * @param operation - Name of calling operation for logging context
 */
async function syncMissingBeersInBackground(
  missingIds: string[],
  allBeers: BeerWithContainerType[],
  operation: string
): Promise<void> {
  if (missingIds.length === 0) return;

  console.log(`[${operation}] Found ${missingIds.length} beers missing from Worker, syncing...`);
  const missingBeers = allBeers.filter(b => missingIds.includes(b.id));

  syncBeersToWorker(missingBeers)
    .then(syncResult => {
      if (syncResult && syncResult.queued_for_cleanup > 0) {
        console.log(
          `[${operation}] Synced ${syncResult.synced} beers, ${syncResult.queued_for_cleanup} queued for cleanup`
        );

        // Start polling in background (fire-and-forget)
        // Results logged but UI updates on next manual refresh
        pollForEnrichmentUpdates(missingIds)
          .then(async enrichments => {
            const count = Object.keys(enrichments).length;
            if (count > 0) {
              try {
                const updates: Record<string, EnrichmentUpdate> = {};
                for (const [id, data] of Object.entries(enrichments)) {
                  updates[id] = {
                    enriched_abv: data.enriched_abv,
                    enrichment_confidence: data.enrichment_confidence,
                    enrichment_source: data.enrichment_source,
                    brew_description: data.brew_description,
                  };
                }
                // Persist to both tables — IDs not present in a table are no-ops
                await beerRepository.updateEnrichmentData(updates);
                await myBeersRepository.updateEnrichmentData(updates);
                console.log(`[${operation}] Persisted ${count} enrichment results from polling`);
              } catch (persistError) {
                logWarning('Failed to persist polling enrichment results', {
                  operation,
                  component: 'dataUpdateService',
                  additionalData: { error: String(persistError) },
                });
              }
            }
          })
          .catch(pollError => {
            logWarning('Polling for enrichment updates failed', {
              operation,
              component: 'dataUpdateService',
              additionalData: { error: String(pollError) },
            });
          });
      }
    })
    .catch(syncError => {
      logWarning('Background sync of missing beers failed', {
        operation,
        component: 'dataUpdateService',
        additionalData: { error: String(syncError) },
      });
    });
}

/**
 * Map Worker's enriched beer response to app's Beer interface
 */
function mapEnrichedBeerToAppBeer(beer: EnrichedBeerResponse): Beer {
  return {
    id: beer.id,
    brew_name: beer.brew_name,
    brewer: beer.brewer,
    brewer_loc: beer.brewer_loc,
    brew_style: beer.brew_style,
    brew_container: beer.brew_container,
    review_count: beer.review_count,
    review_rating: beer.review_rating,
    brew_description: beer.brew_description,
    added_date: beer.added_date,
    // Use enriched ABV from Worker
    abv: beer.enriched_abv,
    enrichment_confidence: beer.enrichment_confidence,
    enrichment_source: beer.enrichment_source,
  };
}

/**
 * Which store the app is currently configured for.
 *
 * A branded string rather than a bare one so it cannot be passed where any
 * other URL-shaped value is expected, and so the comparison below reads as a
 * comparison of configurations rather than of strings.
 */
type TaplistConfiguration = string & { readonly __brand: 'TaplistConfiguration' };

/**
 * Read the configuration a taplist fetch is being made against.
 *
 * `all_beers_api_url` IS the store identity — it carries the `sid` — so it is
 * used directly rather than through a separate epoch counter. A counter would
 * be a second piece of state that every writer of the configuration has to
 * remember to bump, and the failure mode of forgetting is silent. This cannot
 * drift from the thing it describes, because it *is* the thing it describes.
 *
 * `null` and `''` both collapse to `''`: the login clears this key to shut the
 * configuration gate, so an in-flight refresh that captured a real URL must
 * treat the cleared state as a change. It is not "unknown, so allow".
 */
async function readTaplistConfiguration(): Promise<TaplistConfiguration> {
  // KNOWN LIMITATION, stated because the previous version of this comment
  // addressed only one of the two producers of `null`.
  //
  // `getPreference` swallows read errors and returns `null`, which collapses
  // here to `''` and reads as "the store changed". A read that FAILED —
  // contention from the exclusive taplist import is the documented cause — is
  // therefore indistinguishable from a login clearing the key, and a correct
  // taplist is discarded while the refresh reports success.
  //
  // The obvious fix, a non-swallowing `getPreferenceStrict`, was built and
  // reverted: every test that stubs `getPreference` at runtime must then stub
  // both, and forgetting is silent — six suites went green-to-red on the split
  // and two more would have passed for the wrong reason. That is a two-place
  // invariant across ~20 files, which is the same objection that ruled out a
  // generation counter. Fixing this properly means making `getPreference` stop
  // swallowing and updating the callers that want a default, which is a
  // separate change with its own blast radius.
  //
  // Impact is bounded: no timestamp is stamped on the abandon path, so the next
  // refresh retries rather than being suppressed for twelve hours.
  return ((await getPreference('all_beers_api_url')) ?? '') as TaplistConfiguration;
}

/**
 * Whether rows fetched against `fetchedFor` may still be committed.
 *
 * MUST be called under the write lock — but that alone does not make the
 * check-then-write atomic. It's only sound because `LoginWebView.tsx`'s
 * gate-open bursts (the writes of a NEW, non-empty `all_beers_api_url`) take
 * the SAME `databaseLockManager` lock. `setPreference` itself still takes no
 * lock — it can't; ~8 sites in this file call it from inside a held lock and
 * would self-deadlock if it did — so any future writer of a real store URL
 * that doesn't explicitly join this lock reopens the exact race this guard
 * exists to close, silently.
 *
 * EVERY writer of this key joins the lock, including writes of `''`. An earlier
 * version of this docstring exempted them — "racing to `''` unlocked only ever
 * causes a safe, cheap abandon, never a bad commit" — and that was false. It is
 * true only of a `''` that lands BEFORE a writer's guard read, where the guard
 * reads "changed" and abandons. A `''` landing AFTER the guard read and BEFORE
 * the commit is the window this lock exists to close: the writer reads store A,
 * the guard passes, the `''` lands, and the writer then commits A's rows, A's
 * validator and a fresh `all_beers_last_check` under a configuration that no
 * longer names A. The reasoning covered one interleaving and was stated as if
 * it covered both.
 *
 * The three sites are `LoginWebView.tsx`'s member and visitor gate-close writes
 * and `DeveloperSection.tsx`'s reset; all three now take the lock, so a `''`
 * lands either before the guard or after the commit and never between them.
 * Proven by a test that stages exactly that interleaving
 * (`LoginWebView.test.tsx`, "does not clear the store URL while a taplist
 * writer holds the lock"), which was written red against the unlocked writes.
 */
async function taplistConfigurationHeld(fetchedFor: TaplistConfiguration): Promise<boolean> {
  return (await readTaplistConfiguration()) === fetchedFor;
}

/**
 * What a writer returns when it discards rows fetched for a store the app has
 * since left.
 *
 * `success: true` deliberately, matching the `skip` arm of `decideRewards`:
 * nothing failed, and the user is not the person to tell. The refresh did its
 * job and correctly threw the answer away because a login moved the app
 * somewhere else.
 *
 * That login does start its own refresh for the new store — `useLoginFlow`
 * awaits `onRefreshData` (`useLoginFlow.ts:241`), which `app/settings.tsx:40`
 * supplies as the only production caller. The prop is optional, so this is a
 * property of that one call site rather than of the hook; if a second caller
 * ever omits it, the recovery below is the next scheduled refresh instead.
 *
 * `dataUpdated: false` is the load-bearing half. It keeps the caller from
 * stamping a freshness timestamp, so the new store's refresh still runs instead
 * of being suppressed by the 12-hour window.
 */
function abandonedAfterStoreSwitch(operation: string): DataUpdateResult {
  logWarning(`[${operation}] taplist discarded: store changed between fetch and write`, {
    operation,
    component: 'dataUpdateService',
  });
  return { success: true, dataUpdated: false };
}

/**
 * Extract store ID from the all_beers_api_url preference.
 *
 * The URL format is: https://fsbs.beerknurd.com/bk-store-json.php?sid={storeId}
 * We need to extract the sid parameter.
 *
 * @param apiUrl - The full API URL
 * @returns Store ID string or null if not found
 */
function extractStoreIdFromUrl(apiUrl: string): string | null {
  try {
    const url = new URL(apiUrl);
    return url.searchParams.get('sid');
  } catch {
    // Try regex as fallback for malformed URLs
    const match = apiUrl.match(/sid=(\d+)/);
    return match ? match[1] : null;
  }
}

/**
 * Result of fetching taplist data via proxy or direct API
 */
export type TaplistFetchResult = {
  beers: Beer[];
  usedProxy: boolean;
  etag: string | null;
  notModified: boolean;
};

/**
 * The result of disbelieving a 304 because the table it describes is empty.
 *
 * NOT `SERVER_ERROR`. The server behaved correctly — it answered a conditional
 * request this client chose to send — and the fault is local state. Classifying
 * it by the server was the same mistake, in reverse, that typing the lock
 * timeout fixed: describing a condition by where it surfaced rather than by
 * what it is.
 *
 * The concrete gain is exactly one thing: `getUserFriendlyErrorMessage` returns
 * a fixed string for `SERVER_ERROR` and ignores `message`, so the wording below
 * could never reach anyone. An earlier version of this comment also claimed the
 * change protected `allNetworkErrors` — it does not. That predicate accepts only
 * NETWORK_ERROR and TIMEOUT_ERROR, so VALIDATION_ERROR fails it exactly as
 * SERVER_ERROR did, and a genuinely offline user still gets the per-source alert
 * rather than the offline one.
 *
 * The message no longer promises a retry. Nothing retries in this call — the
 * ETag has been dropped and `all_beers_last_check` deliberately not stamped, so
 * the NEXT refresh fetches in full.
 */
function emptyTableNotModifiedFailure(verdict: NotModifiedVerdict): DataUpdateResult {
  return {
    success: false,
    dataUpdated: false,
    error: {
      type: ApiErrorType.VALIDATION_ERROR,
      message:
        verdict === 'empty'
          ? 'The server reported no changes, but no beers are stored. The next refresh will download the full list.'
          : 'The server reported no changes, but the stored beers could not be read. The next refresh will download the full list.',
    },
  };
}

/**
 * What a 304 is worth, given what the table actually holds.
 *
 * `unknown` exists because "cannot read the count" is not "the table is empty",
 * and the two demand opposite handling. Treating unknown as empty destroys a
 * valid validator; treating it as trusted stamps `all_beers_last_check` and
 * reports success, which suppresses the next refresh for hours — and the most
 * likely cause of an unreadable count is a missing or corrupt `allbeers` table,
 * i.e. the very state the backstop exists for. Both wrong answers are silent;
 * this one is neither, and leaves the next refresh free to retry.
 */
type NotModifiedVerdict = 'trusted' | 'empty' | 'unknown';

/**
 * Decide whether to believe a 304. MUST be called while holding the write lock:
 * the count and any action taken on it have to be atomic, or a concurrent
 * writer can fill the table between them and have its fresh ETag cleared.
 */
async function verifyNotModified(): Promise<NotModifiedVerdict> {
  const storedRows = await beerRepository.count();

  if (storedRows === null) {
    console.warn(
      '[dataUpdateService] 304 received but the beer count could not be read — keeping the stored ETag and retrying next refresh'
    );
    return 'unknown';
  }

  if (shouldTrustNotModified(storedRows)) return 'trusted';

  console.warn(
    '[dataUpdateService] 304 received but allbeers is empty — discarding the stored ETag'
  );
  await commitTaplistWrite({ kind: 'cleared' });
  return 'empty';
}

/**
 * Shared helper that encapsulates the proxy-then-fallback taplist fetch logic.
 *
 * Tries the enrichment proxy first (if configured and storeId available),
 * falls back to the direct Flying Saucer API on failure or when proxy is unavailable.
 *
 * @param storeId - Flying Saucer store ID, or null if not extractable from URL
 * @returns TaplistFetchResult with beers, proxy usage flag, and optional ETag
 * @throws Error if both proxy and direct fetch fail, or if direct fetch fails when proxy is not configured
 */
export async function fetchTaplistFromProxyOrDirect(
  storeId: string | null
): Promise<TaplistFetchResult> {
  // Keyed by store, so a second caller for the SAME taplist joins the fetch
  // already running instead of starting a competing download.
  //
  // `sequentialRefreshAllData` de-duplicates itself, but two readers bypass
  // that: `checkAndRefreshOnAppOpen`, fired from `useFocusEffect` on three tab
  // screens behind a throttle that is explicitly not a mutex, and
  // `refreshAllDataFromAPI` via `autoLogin`. Either could start a second full
  // taplist download while the first was in flight.
  //
  // This is a bandwidth optimisation, not a correctness fix, and the
  // distinction matters: because the proxy keys its validator to the requested
  // store's own cached payload, a cross-store ETag simply misses and costs a
  // full 200 rather than serving wrong rows. Keying by `storeId` keeps it that
  // way — joining across stores is the one thing here that could return the
  // wrong location's beers.
  // A null storeId does NOT join. It means the URL carried no `sid`, which is a
  // wildcard rather than a store: an earlier comment here called two null
  // callers "the same unidentified store, which is correct", and that is only
  // defensible for the proxy path. The direct fallback calls
  // `fetchBeersFromAPI`, which re-reads `all_beers_api_url` itself at fetch
  // time, decoupled from the key the callers joined on — so one promise can
  // resolve with whichever store's rows the preference happened to name at that
  // instant, and the guard would hand them to every joined caller instead of
  // one. Sharing is only safe when the key actually identifies the payload.
  if (
    storeId !== null &&
    inFlightTaplistFetch !== null &&
    inFlightTaplistFetch.storeId === storeId
  ) {
    return inFlightTaplistFetch.promise;
  }

  const run = runTaplistFetch(storeId).finally(() => {
    if (inFlightTaplistFetch?.promise === run) {
      inFlightTaplistFetch = null;
    }
  });
  inFlightTaplistFetch = { storeId, promise: run };
  return run;
}

/**
 * The taplist fetch currently running, if any, keyed by the store it is for.
 */
let inFlightTaplistFetch: {
  readonly storeId: string | null;
  readonly promise: Promise<TaplistFetchResult>;
} | null = null;

/**
 * Stop the next caller joining the taplist fetch currently in flight.
 *
 * Not a test seam. `manualRefreshAllData` needs this for the same reason it
 * passes `join: false`: a fetch already running read the OLD ETag, so serving
 * its result back makes the user's forced refresh a silent no-op. `join: false`
 * only opts out of the SEQUENTIAL join — `settleInFlightRefresh` knows nothing
 * about this one — so without dropping the entry the escape hatch is defeated
 * one layer below where it is expressed.
 *
 * Dropping the entry does not cancel the running fetch, and the consequence is
 * larger than it sounds: the caller that started it not only receives its
 * result, it goes on to WRITE that result — rows and ETag — to the database.
 * So the forced refresh and the abandoned one both write, and the on-disk
 * winner is whichever finishes last rather than whichever is fresher.
 *
 * That is acceptable, and better than what it replaces. Each writer commits its
 * rows and its ETag inside one lock hold, so a late-landing older fetch leaves a
 * CONSISTENT pair that revalidates correctly and self-heals on the next refresh
 * — the cost is seconds of freshness and one duplicated download. The behaviour
 * it replaces was the forced refresh being answered from the validator the user
 * had just discarded, which discarded their request entirely and said nothing.
 */
export function dropInFlightTaplistFetch(): void {
  inFlightTaplistFetch = null;
}

async function runTaplistFetch(storeId: string | null): Promise<TaplistFetchResult> {
  if (storeId && config.enrichment.isConfigured()) {
    try {
      console.log(`[dataUpdateService] Attempting enrichment proxy for store ${storeId}...`);
      // Via the module, not the raw preference. This is defensive, not
      // corrective: an earlier comment here claimed reading the preference
      // directly sent a cleared ETag as an empty `If-None-Match`, which is
      // false — `fetchBeersFromProxy` guards with `if (etag)`, and `''` is
      // falsy, so the header was already omitted. What routing through
      // `readTaplistEtag` actually buys is that the decision no longer depends
      // on a falsiness check in another module, and `normalizeStoredEtag` trims,
      // so a whitespace-only value omits the header instead of sending
      // `If-None-Match:   `. No current writer produces that value.
      const proxyResponse = await fetchBeersFromProxy(storeId, await readTaplistEtag());

      if (proxyResponse.notModified) {
        console.log(`[dataUpdateService] 304 Not Modified for store ${storeId}`);
        return { beers: [], usedProxy: true, etag: proxyResponse.etag ?? null, notModified: true };
      }

      const beers = proxyResponse.beers.map(mapEnrichedBeerToAppBeer);
      console.log(
        `[dataUpdateService] Fetched ${beers.length} beers via proxy (${proxyResponse.source ?? 'unknown'})`
      );
      return {
        beers,
        usedProxy: true,
        etag: proxyResponse.etag ?? null,
        notModified: false,
      };
    } catch (proxyError) {
      logWarning('Enrichment proxy failed, falling back to direct fetch', {
        operation: 'fetchTaplistFromProxyOrDirect',
        component: 'dataUpdateService',
        additionalData: {
          storeId,
          error: proxyError instanceof Error ? proxyError.message : String(proxyError),
        },
      });
    }
  } else if (!config.enrichment.isConfigured()) {
    console.log('[dataUpdateService] Enrichment not configured, using direct fetch');
  } else if (!storeId) {
    console.log('[dataUpdateService] Could not extract store ID from URL, using direct fetch');
  }

  console.log('[dataUpdateService] Using direct Flying Saucer fetch...');
  recordFallback();
  const beers = requireRows(await fetchBeersFromAPI(), 'All beers');
  return { beers: [...beers], usedProxy: false, etag: null, notModified: false };
}

/**
 * Unwrap a completed fetch into its rows, or throw with the reason.
 *
 * For sources where nothing but rows is a usable answer — the taplist, where a
 * store with zero beers is not a real state. Every non-data case names itself,
 * which is what the old bare `[]` could not do.
 */
function requireRows<T>(source: UnconditionalSource<FetchOutcome<T>>, label: string): readonly T[] {
  if (source.status === 'unavailable') {
    // VALIDATION_ERROR for both codes, matching `fetchAndUpdateAllBeers`, which
    // already reports a missing `all_beers_api_url` that way. The plain Error
    // this replaces became UNKNOWN_ERROR at the enclosing catch, so the same
    // unconfigured device got a typed, actionable error down one entry point
    // and developer prose down the other. `not-applicable` joins it rather than
    // being skipped as it is for rewards: there is no taplist-less mode, so a
    // taplist that reports itself inapplicable is a misconfiguration too.
    throw new SourceFailureError(
      {
        type: ApiErrorType.VALIDATION_ERROR,
        message: `${label} unavailable (${source.reason.code}): ${source.reason.detail}`,
      },
      label
    );
  }
  if (source.status === 'failed') {
    // Carries the ErrorResponse rather than its message. Stringifying here sent
    // a typed NETWORK_ERROR to the enclosing catch as UNKNOWN_ERROR, which
    // flipped `allNetworkErrors` off and put developer prose in the alert.
    throw new SourceFailureError(source.error, label);
  }
  if (source.data.kind === 'malformed') {
    // Same defect as the `unavailable` branch above, one line apart and missed
    // when that one was found: `decideRewards` already classifies an unusable
    // body as MALFORMED_RESPONSE_ERROR, whose user-facing copy exists precisely
    // to keep parser text out of an alert.
    throw new SourceFailureError(
      {
        type: ApiErrorType.MALFORMED_RESPONSE_ERROR,
        message: `${label} malformed: ${source.data.detail}`,
      },
      label
    );
  }
  if (source.data.kind === 'confirmed-empty') {
    // Returns empty rather than throwing: both taplist writers downstream —
    // `fetchAndUpdateAllBeers` and `prepareAllBeers` — reject an empty store
    // and report it as a VALIDATION_ERROR, which is a better categorisation
    // than anything this helper could produce. "Both" is load-bearing and was
    // not true when this comment was written: `prepareAllBeers` threw a plain
    // Error, so returning `[]` here handed the sequential/manual path a
    // condition it surfaced as UNKNOWN_ERROR. Delegating downstream is only
    // correct while every downstream classifies it, which
    // `errorClassificationParity.test.ts` now enforces. The distinction that
    // matters here — data versus "we never asked" — is still enforced above.
    return [];
  }
  return source.data.items;
}

/**
 * What a completed rewards fetch means for the caller.
 *
 * Replaced `rowsOrNone`, which flattened every non-data case to `[]`. The two
 * callers that report a result then said `success: true, dataUpdated: true,
 * itemCount: 0`, making "no rewards URL configured" and "the rewards fetch
 * failed" indistinguishable from "you have no rewards"; the third silently
 * returned `[]`. That is the defect plan 02 exists to remove, reintroduced one
 * layer above the layer 02 fixed.
 *
 * A decision type rather than a list, because there is now no value a caller can
 * pass through without first saying what it means. `rowsOrNone` was safe to
 * misuse precisely because its return type had nowhere to put "why".
 */
type RewardsDecision =
  | { readonly action: 'write'; readonly rows: NonEmptyArray<Reward> }
  | { readonly action: 'clear' }
  | { readonly action: 'skip'; readonly reason: UnavailableReason }
  | { readonly action: 'fail'; readonly error: ErrorResponse };

/**
 * Classify a completed rewards fetch.
 *
 * The two `unavailable` codes are treated differently on purpose.
 *
 * `not-applicable` is NOT a failure: visitor mode and a `none://` placeholder are
 * normal states, and reporting them as errors is what drives a user-facing alert
 * via `hasErrors`. It is still not an update — `dataUpdated: false` is the half
 * that was broken, and the half that stops stale rewards being marked fresh.
 *
 * `not-configured` IS a failure, because `fetchAndUpdateAllBeers` already returns
 * a VALIDATION_ERROR for a missing `all_beers_api_url`; the sibling path set that
 * precedent and diverging from it would be the surprise. Note this is a
 * deliberate departure from `fetchOutcome.ts`'s framing, which groups both codes
 * as non-errors — that grouping is about the transport layer, where neither is a
 * fault. What counts as a failure *for this consumer* is a different question,
 * and this is the right place to answer it.
 *
 * @param source - The completed fetch
 */
function decideRewards(source: UnconditionalSource<FetchOutcome<Reward>>): RewardsDecision {
  if (source.status === 'unavailable') {
    return source.reason.code === 'not-applicable'
      ? { action: 'skip', reason: source.reason }
      : {
          action: 'fail',
          error: {
            type: ApiErrorType.VALIDATION_ERROR,
            message: `Rewards unavailable: ${source.reason.detail}`,
          },
        };
  }

  if (source.status === 'failed') {
    return { action: 'fail', error: source.error };
  }

  if (source.data.kind === 'malformed') {
    return {
      action: 'fail',
      error: {
        type: ApiErrorType.MALFORMED_RESPONSE_ERROR,
        message: `Rewards response was unusable: ${source.data.detail}`,
      },
    };
  }

  // `clear` is separate from `write` deliberately. Collapsing them into one arm
  // keyed on `rows.length` would make the type depend on a fact about a
  // DIFFERENT module — that `RewardsRepository.insertMany` early-returns on an
  // empty array — which the type cannot state and which is exactly the kind of
  // cross-module assumption that goes stale. If the repository is ever changed
  // to genuinely clear on an empty write (the semantics my-beers already has via
  // `replaceAllWithEmptyUnsafe`), `{action:'write', rows: []}` becomes a table
  // wipe with nothing distinguishing it from a construction mistake.
  return source.data.kind === 'confirmed-empty'
    ? { action: 'clear' }
    : { action: 'write', rows: source.data.items };
}

/**
 * Fetch and update all beers data
 *
 * Uses a dual-path strategy:
 * 1. PRIMARY: Try enrichment proxy (Worker) which returns enriched data
 * 2. FALLBACK: Direct Flying Saucer fetch if proxy unavailable
 *
 * @returns DataUpdateResult with success status and error information if applicable
 */
export async function fetchAndUpdateAllBeers(): Promise<DataUpdateResult> {
  try {
    // Get the API URL from preferences. This one read serves as both the store
    // to fetch and the configuration this refresh is bound to; see
    // `readTaplistConfiguration`.
    const fetchedFor = await readTaplistConfiguration();
    const apiUrl = fetchedFor;
    if (!apiUrl) {
      logError('All beers API URL not set', {
        operation: 'fetchAndUpdateAllBeers',
        component: 'dataUpdateService',
      });
      return {
        success: false,
        dataUpdated: false,
        error: {
          type: ApiErrorType.VALIDATION_ERROR,
          message: 'All beers API URL not set. Please log in to configure API URLs.',
        },
      };
    }

    // Extract store ID from URL for proxy calls
    const storeId = extractStoreIdFromUrl(apiUrl);

    // Fetch beers via proxy or direct API
    const result = await fetchTaplistFromProxyOrDirect(storeId);

    // Handle 304 Not Modified — data hasn't changed, skip DB writes
    if (result.notModified) {
      // ...unless the table it claims to describe is empty, in which case the
      // assertion is false and honouring it strands the user looking at nothing
      // while the app reports itself up to date. Dropping the validator is what
      // breaks the loop: without it last_check is stamped and the next refresh
      // 304s again, forever.
      // Count AND clear inside one lock hold. Taking the lock around the clear
      // alone was worse than taking none: it left the count outside, so the
      // window between deciding "the table is empty" and acting on it grew from
      // one await to a 30s lock acquisition — spent waiting on precisely the
      // writer most likely to fill the table. A concurrent refresh could commit
      // a full taplist and a valid ETag in that gap, and this path would then
      // clear that just-committed validator and report "no beers are stored"
      // with thousands stored. `writeAllBeers` and `writeAllBeersOnLogin` read
      // and clear inside their caller's lock already; this now matches them.
      // The store-switch guard belongs here too, and the stamp belongs INSIDE
      // the hold with it.
      //
      // This arm writes no rows, which is why the guard was originally applied
      // only to the replace path. That reasoning was wrong: it stamps
      // `all_beers_last_check`, and stamping that for a store the app has left
      // suppresses the NEW store's refresh for the next twelve hours — the user
      // sits on the old store's taplist with automatic recovery switched off.
      // The `AllBeersWrite` doc states this as the reason `fetchedFor` is
      // carried on the `not-modified` arm; this is the path that ignored it.
      //
      // The stamp moved inside the lock because leaving it outside reintroduces
      // the same window one statement later: the guard would pass, the login
      // would land, and the stamp would commit under the new configuration.
      const outcome = await databaseLockManager.withDatabaseLock(
        'all-beers-etag-invalidate',
        async () => {
          if (!(await taplistConfigurationHeld(fetchedFor))) {
            return { kind: 'store-changed' } as const;
          }

          const verdict = await verifyNotModified();
          if (verdict !== 'trusted') {
            return { kind: 'untrusted', verdict } as const;
          }

          await setPreference('all_beers_last_check', new Date().toISOString());
          return { kind: 'stamped' } as const;
        }
      );

      if (outcome.kind === 'store-changed') {
        return abandonedAfterStoreSwitch('fetchAndUpdateAllBeers');
      }
      if (outcome.kind === 'untrusted') {
        return emptyTableNotModifiedFailure(outcome.verdict);
      }

      console.log('All beers data not modified (304), skipping DB update');
      return { success: true, dataUpdated: false };
    }

    const { beers: allBeers, usedProxy, etag } = result;

    // Log the source of data
    console.log(
      `All beers fetch complete: ${allBeers.length} beers ${usedProxy ? '(with enrichment)' : '(no enrichment)'}`
    );

    // Validate individual beer records before insertion
    const validationResult = validateBeerArray(allBeers);

    if (validationResult.invalidBeers.length > 0) {
      logWarning(
        `Skipping ${validationResult.invalidBeers.length} invalid beers out of ${validationResult.summary.total}`,
        {
          operation: 'fetchAndUpdateAllBeers',
          component: 'dataUpdateService',
          additionalData: {
            summary: validationResult.summary,
            sampleInvalidBeer: validationResult.invalidBeers[0],
          },
        }
      );
    }

    // Only insert valid beers
    if (validationResult.validBeers.length === 0) {
      logError('No valid beers found in API response', {
        operation: 'fetchAndUpdateAllBeers',
        component: 'dataUpdateService',
        additionalData: {
          totalRecords: allBeers.length,
          invalidCount: validationResult.invalidBeers.length,
        },
      });
      return {
        success: false,
        dataUpdated: false,
        error: {
          type: ApiErrorType.VALIDATION_ERROR,
          message: 'No valid beer data received from server',
        },
      };
    }

    // Calculate container types BEFORE insertion
    // Note: calculateContainerTypes preserves enrichment fields if present
    console.log('Calculating container types for beers...');
    const beersWithContainerTypes = calculateContainerTypes(validationResult.validBeers);

    // Upstream validation has already rejected an empty taplist, so a null
    // here would be a logic error rather than a server condition.
    const beersToInsert = toNonEmpty(beersWithContainerTypes);
    if (beersToInsert === null) {
      throw new Error('No valid beers to insert after container-type calculation');
    }
    // The lock excludes other lock-taking writers — and it is a single global
    // mutex, not one per operation name, so the three write bursts cannot
    // interleave at all. It does NOT make these one write: `insertManyUnsafe`
    // commits its own transaction and the ETag write is a separate one.
    //
    // Ordering is what makes that safe. The guarantee is that no interruption
    // can leave a validator that outlives the rows it describes — NOT, as an
    // earlier version of this comment claimed, that every interruption leaves a
    // cleared validator. If the pre-clear is itself the interruption, the old
    // validator survives against the old, unreplaced rows, which is consistent
    // and costs nothing. The reverse order is what strands a validator against
    // replaced rows, and every later request then 304s forever.
    //
    // The cost, stated because the first version of this change did not: the
    // pre-clear can throw after ~700ms of contention backoff, and it now runs
    // BEFORE the rows land, so contention at that instant aborts the whole
    // write. The user keeps stale rows and is told the app was busy, where
    // previously they would have got fresh rows and a bad ETag record. That is
    // the trade, and it is worth it — the bad ETag record is permanent and
    // silent, the stale rows are neither.
    const committed = await databaseLockManager.withDatabaseLock('all-beers-write', async () => {
      // Under the lock, as on the two plan-based writers: `apiUrl` was read
      // before the fetch, and a login can have switched stores since. Committing
      // then writes the old store's rows AND its validator under the new store's
      // configuration, which no later conditional request corrects — the row
      // count is non-zero, so `shouldTrustNotModified` believes the 304.
      if (!(await taplistConfigurationHeld(fetchedFor))) {
        return false;
      }

      await commitTaplistWrite({ kind: 'cleared' });
      await beerRepository.insertManyUnsafe(beersToInsert);
      await commitTaplistWrite(usedProxy ? { kind: 'proxy', etag } : { kind: 'fallback' });
      return true;
    });

    if (!committed) {
      return abandonedAfterStoreSwitch('fetchAndUpdateAllBeers');
    }

    // Update the last update timestamp
    await setPreference('all_beers_last_update', new Date().toISOString());
    await setPreference('all_beers_last_check', new Date().toISOString());

    console.log(
      `Updated all beers data with ${validationResult.validBeers.length} valid beers (skipped ${validationResult.invalidBeers.length} invalid)`
    );
    return {
      success: true,
      dataUpdated: true,
      itemCount: validationResult.validBeers.length,
    };
  } catch (error) {
    logError(error, {
      operation: 'fetchAndUpdateAllBeers',
      component: 'dataUpdateService',
      additionalData: { message: 'Error updating all beers data' },
    });
    return {
      success: false,
      dataUpdated: false,
      error: createErrorResponse(error),
    };
  }
}

/**
 * Fetch and update my beers data
 * @returns DataUpdateResult with success status and error information if applicable
 */
export async function fetchAndUpdateMyBeers(): Promise<DataUpdateResult> {
  try {
    // Check if in visitor mode
    const isVisitor = (await getPreference('is_visitor_mode')) === 'true';
    if (isVisitor) {
      console.log('In visitor mode, my beers functionality not available');

      // Update the last check timestamp still to prevent repeated checks
      await setPreference('my_beers_last_check', new Date().toISOString());

      return {
        success: true,
        dataUpdated: false,
        error: {
          type: ApiErrorType.INFO,
          message: 'My beers not available in visitor mode.',
        },
      };
    }

    // Get the API URL from preferences
    const apiUrl = await getPreference('my_beers_api_url');
    if (!apiUrl) {
      logError('My beers API URL not set', {
        operation: 'fetchAndUpdateMyBeers',
        component: 'dataUpdateService',
      });
      return {
        success: false,
        dataUpdated: false,
        error: {
          type: ApiErrorType.VALIDATION_ERROR,
          message: 'My beers API URL not set. Please log in to configure API URLs.',
        },
      };
    }

    // Make the request
    console.log('Fetching my beers data...');
    let response;
    try {
      // Set a timeout for the fetch request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

      response = await fetch(apiUrl, { signal: controller.signal });
      clearTimeout(timeoutId);
    } catch (fetchError) {
      logError(fetchError, {
        operation: 'fetchAndUpdateMyBeers',
        component: 'dataUpdateService',
        additionalData: { message: 'Network error fetching my beers data' },
      });

      // Check if it's an abort error (timeout) - treat as network error for consolidated messaging
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        return {
          success: false,
          dataUpdated: false,
          error: {
            type: ApiErrorType.NETWORK_ERROR, // Changed from TIMEOUT_ERROR to NETWORK_ERROR
            message: 'Network connection error: request timed out while fetching tasted beer data.',
            originalError: fetchError,
          },
        };
      }

      // Handle other network errors
      return {
        success: false,
        dataUpdated: false,
        error: createErrorResponse(fetchError),
      };
    }

    // If the response is not OK, something went wrong
    if (!response.ok) {
      logError(`Failed to fetch my beers data: ${response.status} ${response.statusText}`, {
        operation: 'fetchAndUpdateMyBeers',
        component: 'dataUpdateService',
        additionalData: { status: response.status, statusText: response.statusText },
      });
      return {
        success: false,
        dataUpdated: false,
        error: {
          type: ApiErrorType.SERVER_ERROR,
          message: `Server error: ${response.statusText || 'Unknown error'}`,
          statusCode: response.status,
        },
      };
    }

    // Parse the response
    let data;
    try {
      data = await response.json();
    } catch (parseError) {
      logError(parseError, {
        operation: 'fetchAndUpdateMyBeers',
        component: 'dataUpdateService',
        additionalData: { message: 'Error parsing my beers data' },
      });
      return {
        success: false,
        dataUpdated: false,
        error: {
          type: ApiErrorType.PARSE_ERROR,
          message: 'Failed to parse server response',
          originalError: parseError,
        },
      };
    }

    // Log the structure of the response for debugging
    console.log('API response structure:', typeof data);
    if (Array.isArray(data)) {
      console.log(`API response is an array with ${data.length} items`);
    }

    // Extract the tasted_brew_current_round array from the response
    let myBeers: Beerfinder[] = [];
    if (
      data &&
      Array.isArray(data) &&
      data.length >= 2 &&
      data[1] &&
      data[1].tasted_brew_current_round
    ) {
      myBeers = data[1].tasted_brew_current_round;
      console.log(`Found tasted_brew_current_round with ${myBeers.length} beers`);
    } else {
      logError('Invalid my beers data format: missing tasted_brew_current_round', {
        operation: 'fetchAndUpdateMyBeers',
        component: 'dataUpdateService',
      });
      return {
        success: false,
        dataUpdated: false,
        error: {
          type: ApiErrorType.VALIDATION_ERROR,
          message: 'Invalid data format received from server: missing tasted beer data',
        },
      };
    }

    // Handle empty array as a valid state (user has no tasted beers or round has rolled over)
    if (myBeers.length === 0) {
      console.log(
        'Empty tasted beers array - user has no tasted beers in current round (new user or round rollover at 200 beers), clearing database'
      );
      // A confirmed-empty round: the server really did report zero tasted
      // beers. Emptying is correct here, and now says so explicitly.
      await myBeersRepository.replaceAllWithEmpty();

      // Update the last update timestamp
      await setPreference('my_beers_last_update', new Date().toISOString());
      await setPreference('my_beers_last_check', new Date().toISOString());

      console.log('Updated my beers data with 0 beers (empty state)');
      return {
        success: true,
        dataUpdated: true,
        itemCount: 0,
      };
    }

    // Validate that we have beers with IDs
    const validBeers = myBeers.filter(beer => beer && beer.id);
    console.log(
      `Found ${validBeers.length} valid beers with IDs out of ${myBeers.length} total beers`
    );

    if (validBeers.length === 0) {
      // The API returned rows and every one lacked an id — malformed, NOT an
      // empty round. Leave the table alone and report failure. Writing here is
      // what wiped a populated tasted list; stamping the timestamps then hid it
      // for 12 hours. Phase 4 owns the surrounding semantics.
      console.error(
        `Refusing to write my beers: all ${myBeers.length} rows from the API lack an id`
      );
      return {
        success: false,
        dataUpdated: false,
        itemCount: 0,
        error: createErrorResponse(
          new Error(`All ${myBeers.length} tasted beers from the API lack an id`)
        ),
      };
    }

    // =========================================================================
    // ENRICHMENT: Fetch enrichment data BEFORE container type calculation
    // so that ABV from enrichment is available for glass type selection.
    // Without this ordering, draft beers without ABV in their description
    // would get container_type=null (question mark icon) even when the
    // Worker has enriched ABV data.
    // =========================================================================
    let beersForContainerCalc: Beerfinder[] = validBeers;
    if (config.enrichment.isConfigured()) {
      try {
        const beerIds = validBeers.map(beer => beer.id);
        console.log(
          `[dataUpdateService] Fetching enrichment for ${beerIds.length} tasted beers...`
        );

        const { enrichments: enrichmentData, missing: missingIds } =
          await fetchEnrichmentBatchWithMissing(beerIds);
        const enrichedCount = Object.keys(enrichmentData).length;

        if (enrichedCount > 0) {
          console.log(`[dataUpdateService] Got enrichment data for ${enrichedCount} beers`);
          beersForContainerCalc = mergeEnrichmentData(validBeers, enrichmentData);
        }

        // Sync missing beers to Worker for enrichment (in background)
        syncMissingBeersInBackground(missingIds, validBeers, 'dataUpdateService');
      } catch (enrichmentError) {
        // Log but don't fail - enrichment is optional enhancement
        logWarning('Failed to fetch enrichment for tasted beers, continuing without', {
          operation: 'fetchAndUpdateMyBeers',
          component: 'dataUpdateService',
          additionalData: {
            error:
              enrichmentError instanceof Error ? enrichmentError.message : String(enrichmentError),
          },
        });
      }
    }

    // Calculate container types AFTER enrichment so ABV is available for glass selection
    console.log('Calculating container types for tasted beers...');
    const beersWithContainerTypes = calculateContainerTypes(beersForContainerCalc);

    // toNonEmpty replaces a type assertion here, and validBeers.length was
    // already checked above, so null means the container-type step dropped
    // everything — a logic error worth surfacing rather than a silent clear.
    const myBeersToInsert = toNonEmpty(beersWithContainerTypes as BeerfinderWithContainerType[]);
    if (myBeersToInsert === null) {
      throw new Error('No valid tasted beers to insert after container-type calculation');
    }
    await myBeersRepository.insertMany(myBeersToInsert);

    // Update the last update timestamp
    await setPreference('my_beers_last_update', new Date().toISOString());
    await setPreference('my_beers_last_check', new Date().toISOString());

    console.log(`Updated my beers data with ${validBeers.length} valid beers`);
    return {
      success: true,
      dataUpdated: true,
      itemCount: validBeers.length,
    };
  } catch (error) {
    logError(error, {
      operation: 'fetchAndUpdateMyBeers',
      component: 'dataUpdateService',
      additionalData: { message: 'Error updating my beers data' },
    });
    return {
      success: false,
      dataUpdated: false,
      error: createErrorResponse(error),
    };
  }
}

/**
 * Check if data should be refreshed based on time interval
 * @param lastCheckKey Preference key for last check timestamp
 * @param intervalHours Minimum hours between checks (default: 12)
 * @returns true if data should be refreshed, false otherwise
 */
export async function shouldRefreshData(
  lastCheckKey: string,
  intervalHours: number = 12
): Promise<boolean> {
  try {
    const lastCheck = await getPreference(lastCheckKey);
    if (!lastCheck) {
      return true; // No previous check, should refresh
    }

    const lastCheckDate = new Date(lastCheck);
    const now = new Date();
    const hoursSinceLastCheck = (now.getTime() - lastCheckDate.getTime()) / (1000 * 60 * 60);

    return hoursSinceLastCheck >= intervalHours;
  } catch (error) {
    logError(error, {
      operation: 'shouldRefreshData',
      component: 'dataUpdateService',
      additionalData: { lastCheckKey, message: 'Error checking if data should be refreshed' },
    });
    return true; // If there's an error, refresh to be safe
  }
}

/**
 * Result of a manual refresh operation
 */
export type ManualRefreshResult = {
  allBeersResult: DataUpdateResult;
  myBeersResult: DataUpdateResult;
  rewardsResult: DataUpdateResult;
  hasErrors: boolean;
  allNetworkErrors: boolean;
};

/**
 * Result of an automatic refresh operation
 */
export type AutoRefreshResult = {
  updated: boolean;
  errors: ErrorResponse[];
};

/**
 * Check and refresh data on app open if needed
 * @param minIntervalHours Minimum hours between checks (default: 12)
 * @returns Object with update status and any errors encountered
 */
// Create a simple wrapper for rewards update
export async function fetchAndUpdateRewards(): Promise<DataUpdateResult> {
  try {
    // Check if in visitor mode
    const isVisitor = (await getPreference('is_visitor_mode')) === 'true';

    if (isVisitor) {
      console.log('In visitor mode, skipping rewards refresh');
      return { success: true, dataUpdated: false };
    }

    // Fetch and populate rewards if not in visitor mode
    console.log('Refreshing rewards data');
    const decision = decideRewards(await fetchRewardsFromAPI());

    if (decision.action === 'fail') {
      logWarning(`Rewards refresh did not produce data: ${decision.error.message}`, {
        operation: 'fetchAndUpdateRewards',
        component: 'dataUpdateService',
      });
      return { success: false, dataUpdated: false, error: decision.error };
    }

    if (decision.action === 'skip') {
      console.log(`Rewards not applicable: ${decision.reason.detail}`);
      return { success: true, dataUpdated: false };
    }

    // `clear` goes through the clear, not through an empty insert. insertMany
    // early-returns on `[]`, so this reported a successful update having done
    // nothing — the server confirmed zero rewards and the stale ones stayed.
    if (decision.action === 'clear') {
      await rewardsRepository.replaceAllWithEmpty();
      console.log('Updated rewards data successfully: 0 rewards (server confirmed none)');
      return { success: true, dataUpdated: true, itemCount: 0 };
    }

    const rows = [...decision.rows];
    await rewardsRepository.insertMany(rows);

    console.log(`Updated rewards data successfully: ${rows.length} rewards`);
    return {
      success: true,
      dataUpdated: true,
      itemCount: rows.length,
    };
  } catch (error) {
    logError(error, {
      operation: 'fetchAndUpdateRewards',
      component: 'dataUpdateService',
      additionalData: { message: 'Error updating rewards data' },
    });
    return {
      success: false,
      dataUpdated: false,
      error: createErrorResponse(error),
    };
  }
}

/**
 * Sequential refresh with master lock coordination to prevent lock contention
 *
 * HP-2 Step 5c: This function solves CI-2 (parallel refresh lock contention) by:
 * - Acquiring a single master lock for the entire refresh sequence
 * - Executing operations sequentially (not in parallel)
 * - Using safe repository methods under master lock protection
 * - Avoiding lock queueing overhead from parallel Promise execution
 *
 * Performance: ~3x faster than parallel execution with lock contention
 * - Parallel with contention: ~4.5s (operations queue at lock manager)
 * - Sequential with master lock: ~1.5s (no queueing overhead)
 */
export async function sequentialRefreshAllData({
  join = true,
}: SequentialRefreshOptions = {}): Promise<ManualRefreshResult> {
  if (join) {
    if (inFlightSequentialRefresh !== null) {
      console.log('Sequential refresh already in flight; joining it rather than starting another');
      return inFlightSequentialRefresh;
    }
  } else {
    await settleInFlightRefresh();
  }

  const run = runSequentialRefresh().finally(() => {
    // Guarded rather than a bare `null` assignment so a late `finally` can only
    // ever clear its OWN entry. Cheap insurance against a future edit that
    // reorders the assignment below.
    if (inFlightSequentialRefresh === run) {
      inFlightSequentialRefresh = null;
    }
  });
  inFlightSequentialRefresh = run;
  return run;
}

/**
 * The refresh itself: fetch everything with no lock held, then write everything
 * under one.
 */
async function runSequentialRefresh(): Promise<ManualRefreshResult> {
  console.log('Sequential refresh: fetching all sources with no lock held');
  const allBeers = await prepareAllBeers(SEQUENTIAL_REFRESH);
  const { plan: myBeers, pendingWorkerSync } = await prepareMyBeers(SEQUENTIAL_REFRESH);
  const rewards = await prepareRewards(SEQUENTIAL_REFRESH);

  /**
   * Applying all three, in order.
   *
   * A single expression rather than a long callback body, which retires the
   * trap the old code carried a comment about: a `return` placed mid-callback
   * exited the entire refresh and silently skipped the sources after it. There
   * is no longer a mid-callback position to put one in.
   */
  const applyAll = async (): Promise<
    readonly [DataUpdateResult, DataUpdateResult, DataUpdateResult]
  > => [
    await applyPlan(allBeers, writeAllBeers, `${SEQUENTIAL_REFRESH} - all beers`),
    await applyPlan(myBeers, writeMyBeers, `${SEQUENTIAL_REFRESH} - my beers`),
    await applyPlan(rewards, writeRewards, `${SEQUENTIAL_REFRESH} - rewards`),
  ];

  // No write, no lock. Every plan being `settled` means all three sources
  // either failed or had nothing to store — taking the lock then would be a
  // pointless acquisition on a connection that just proved itself dead, at the
  // moment other retries are most likely to be contending for it.
  const needsLock = [allBeers, myBeers, rewards].some(plan => plan.kind === 'write');

  const [allBeersResult, myBeersResult, rewardsResult] = needsLock
    ? await databaseLockManager.withDatabaseLock('refresh-all-data-write', applyAll)
    : await applyAll();

  // Fire-and-forget, and deliberately here rather than where it was discovered:
  // this sync polls the Worker and then writes enrichment into both tables
  // under its own lock, so starting it during the fetch phase lets it land
  // BEFORE the burst above and be wiped by the clear-and-reinsert. See
  // `MyBeersPreparation`.
  if (pendingWorkerSync !== null) {
    syncMissingBeersInBackground(
      pendingWorkerSync.missingIds,
      pendingWorkerSync.beers,
      SEQUENTIAL_REFRESH
    );
  }

  // Check for errors
  const hasErrors = !allBeersResult.success || !myBeersResult.success || !rewardsResult.success;

  // Check if all errors are network-related
  const allNetworkErrors =
    hasErrors &&
    [allBeersResult, myBeersResult, rewardsResult]
      .filter(result => !result.success && result.error)
      .every(
        result => result.error?.type === 'NETWORK_ERROR' || result.error?.type === 'TIMEOUT_ERROR'
      );

  console.log('Sequential refresh completed:', {
    allBeers: allBeersResult.success,
    myBeers: myBeersResult.success,
    rewards: rewardsResult.success,
    hasErrors,
    allNetworkErrors,
    tookLock: needsLock,
  });

  return {
    allBeersResult,
    myBeersResult,
    rewardsResult,
    hasErrors,
    allNetworkErrors,
  };
}

/**
 * Carry out one source's planned write, or pass through a conclusion already
 * reached without one.
 *
 * The write gets its own `try`/`catch` so per-source isolation survives the
 * split: a repository throwing for one source must not suppress the other two,
 * exactly as a failing fetch does not. Written once rather than three times
 * because hand-repeating this isolation is how `refreshAllDataFromAPI` came to
 * be missing it entirely until 02 Phase 2.5.
 */
async function applyPlan<TWrite>(
  plan: SourcePlan<TWrite>,
  write: (target: TWrite) => Promise<DataUpdateResult>,
  operation: string
): Promise<DataUpdateResult> {
  if (plan.kind === 'settled') {
    return plan.result;
  }

  try {
    return await write(plan.write);
  } catch (error) {
    logError(error, { operation, component: 'dataUpdateService' });
    return { success: false, dataUpdated: false, error: createErrorResponse(error) };
  }
}

/**
 * Fetch, validate and shape the taplist. No database access.
 */
async function prepareAllBeers(operation: RefreshOperation): Promise<SourcePlan<AllBeersWrite>> {
  console.log(`[${operation}] fetching all beers`);
  try {
    // Get API URL to extract store ID for proxy. The same read also fixes which
    // store this plan is for: everything below was fetched against THIS value,
    // and the writer refuses to commit it under any other.
    const fetchedFor = await readTaplistConfiguration();
    const storeId = fetchedFor ? extractStoreIdFromUrl(fetchedFor) : null;

    const taplistResult = await fetchTaplistFromProxyOrDirect(storeId);

    // Handle 304 Not Modified
    if (taplistResult.notModified) {
      console.log(`[${operation}] all beers not modified (304), skipping table write`);
      return { kind: 'write', write: { kind: 'not-modified', fetchedFor } };
    }

    const { beers: allBeers, etag } = taplistResult;

    // Validate beers before insertion
    const validationResult = validateBeerArray(allBeers);

    if (validationResult.invalidBeers.length > 0) {
      logWarning(`[${operation}] skipping ${validationResult.invalidBeers.length} invalid beers`, {
        operation,
        component: 'dataUpdateService',
        additionalData: { summary: validationResult.summary },
      });
    }

    if (validationResult.validBeers.length === 0) {
      // Typed, for the reason `requireRows` is: a plain Error becomes
      // UNKNOWN_ERROR, whose renderer returns `error.message` verbatim, so this
      // string went straight into a user-facing alert. `fetchAndUpdateAllBeers`
      // reports the same condition as a VALIDATION_ERROR with copy written for
      // a person to read; this path contradicted it. The empty-taplist case
      // reaches here specifically because 43bd001a reclassified it away from
      // `malformed`, which be4f6258 had just given a typed error — so the two
      // fixes together routed this case around both of them.
      throw new SourceFailureError(
        {
          type: ApiErrorType.VALIDATION_ERROR,
          message: 'No valid beer data received from server',
        },
        `${operation} - all beers`
      );
    }

    // Calculate container types BEFORE insertion
    console.log(`[${operation}] calculating container types for all beers`);
    const beersWithContainerTypes = calculateContainerTypes(validationResult.validBeers);

    const sequentialBeers = toNonEmpty(beersWithContainerTypes);
    if (sequentialBeers === null) {
      // Same treatment, though this arm looks unreachable: container-type
      // calculation is 1:1 and a non-empty input was established above. Typed
      // anyway rather than argued about — an unreachable plain Error is one
      // refactor away from being a reachable UNKNOWN_ERROR.
      throw new SourceFailureError(
        {
          type: ApiErrorType.VALIDATION_ERROR,
          message: 'No valid beer data received from server',
        },
        `${operation} - all beers`
      );
    }

    return {
      kind: 'write',
      write: {
        kind: 'replace',
        beers: sequentialBeers,
        taplistSource: taplistResult.usedProxy ? { kind: 'proxy', etag } : { kind: 'fallback' },
        fetchedFor,
      },
    };
  } catch (error) {
    logError(error, {
      operation: `${operation} - all beers`,
      component: 'dataUpdateService',
    });
    return {
      kind: 'settled',
      result: { success: false, dataUpdated: false, error: createErrorResponse(error) },
    };
  }
}

/** Store the taplist. Runs under the write lock; makes no network request. */
async function writeAllBeers(write: AllBeersWrite): Promise<DataUpdateResult> {
  // First statement in the writer, before the 304 branch as well as the replace
  // one, and under the caller's lock — see `taplistConfigurationHeld`.
  if (!(await taplistConfigurationHeld(write.fetchedFor))) {
    return abandonedAfterStoreSwitch(SEQUENTIAL_REFRESH);
  }

  if (write.kind === 'not-modified') {
    // Already under the caller's lock, so the count and the clear are atomic.
    const verdict = await verifyNotModified();
    if (verdict !== 'trusted') {
      return emptyTableNotModifiedFailure(verdict);
    }
    await setPreference('all_beers_last_check', new Date().toISOString());
    return { success: true, dataUpdated: false };
  }

  // Invalidate before replacing, commit after. See the same sequence in
  // `fetchAndUpdateAllBeers`: the caller's lock excludes other writers but does
  // not make these one transaction, so an interruption must leave a cleared
  // ETag rather than the previous one against replaced rows.
  await commitTaplistWrite({ kind: 'cleared' });
  await beerRepository.insertManyUnsafe(write.beers);
  await commitTaplistWrite(write.taplistSource);

  await setPreference('all_beers_last_update', new Date().toISOString());
  await setPreference('all_beers_last_check', new Date().toISOString());
  // Derived, not carried. Container-type calculation and enrichment merge are
  // both 1:1 maps, so a separate count could only ever agree — or drift.
  return { success: true, dataUpdated: true, itemCount: write.beers.length };
}

/**
 * Fetch, validate, enrich and shape the tasted list. No database access.
 *
 * The enrichment batch is a network round trip and belongs here for the same
 * reason the three `beerApi` calls do — leaving it behind would keep an HTTP
 * request inside the lock and forfeit most of this phase's benefit, since it is
 * the request over the largest id list.
 */
async function prepareMyBeers(operation: RefreshOperation): Promise<MyBeersPreparation> {
  console.log(`[${operation}] fetching my beers`);
  let workerSync: PendingWorkerSync | null = null;
  try {
    const myBeersSource = await fetchMyBeersFromAPI();

    // The three outcomes diverge here, and this is the divergence the whole
    // plan exists for. `unavailable` must NOT touch the table and must NOT
    // stamp a timestamp — stamping is what suppressed a retry for 12 hours.
    // `confirmed-empty` is the ONLY case in which clearing is correct.
    //
    // `not-applicable` is separated from the other unavailable codes for the
    // same reason rewards separates them: it means "this source does not apply
    // to you", which is what visitor mode and a none:// placeholder ARE. This
    // block used to throw on every `unavailable`, so every visitor refresh
    // failed with UNKNOWN_ERROR — and UNKNOWN_ERROR returns error.message
    // verbatim, putting "My beers unavailable (not-applicable): …" in an
    // Alert. Not an update either: no table write, no timestamp.
    if (myBeersSource.status === 'unavailable' && myBeersSource.reason.code === 'not-applicable') {
      console.log(`[${operation}] my beers not applicable — ${myBeersSource.reason.detail}`);
      return {
        plan: { kind: 'settled', result: { success: true, dataUpdated: false } },
        pendingWorkerSync: null,
      };
    }
    if (myBeersSource.status === 'failed') {
      // Carries the ErrorResponse rather than its message. Stringifying here
      // discarded a typed NETWORK_ERROR and flipped `allNetworkErrors` off.
      throw new SourceFailureError(myBeersSource.error, 'My beers');
    }
    if (myBeersSource.status !== 'fetched') {
      throw new Error(
        `My beers unavailable (${myBeersSource.reason.code}): ${myBeersSource.reason.detail}`
      );
    }
    if (myBeersSource.data.kind === 'malformed') {
      throw new Error(`My beers malformed: ${myBeersSource.data.detail}`);
    }
    if (myBeersSource.data.kind === 'confirmed-empty') {
      // The one case in which emptying the table is correct: the server was
      // asked and answered zero. Every other route to an empty list — visitor
      // mode, no URL, a none:// placeholder, an unusable body — is handled
      // above and leaves the table alone.
      return { plan: { kind: 'write', write: { kind: 'clear' } }, pendingWorkerSync: null };
    }

    const myBeers = [...myBeersSource.data.items];

    // Validate myBeers before insertion
    const validationResult = validateBeerArray(myBeers);

    if (validationResult.invalidBeers.length > 0) {
      logWarning(
        `[${operation}] skipping ${validationResult.invalidBeers.length} invalid my beers`,
        {
          operation,
          component: 'dataUpdateService',
          additionalData: { summary: validationResult.summary },
        }
      );
    }

    // Enrich BEFORE container type calculation so ABV is available for glass selection
    let beersForContainerCalc = validationResult.validBeers;
    if (config.enrichment.isConfigured() && validationResult.validBeers.length > 0) {
      try {
        const beerIds = validationResult.validBeers.map(beer => beer.id);
        console.log(`[${operation}] fetching enrichment for ${beerIds.length} tasted beers`);

        const { enrichments: enrichmentData, missing: missingIds } =
          await fetchEnrichmentBatchWithMissing(beerIds);
        const enrichedCount = Object.keys(enrichmentData).length;

        if (enrichedCount > 0) {
          console.log(`[${operation}] got enrichment for ${enrichedCount} tasted beers`);
          beersForContainerCalc = mergeEnrichmentData(validationResult.validBeers, enrichmentData);
        }

        // Deferred until after the write burst — see `pendingWorkerSync`.
        workerSync = { missingIds, beers: validationResult.validBeers };
      } catch (enrichmentError) {
        // The cause is carried, matching the sibling handler in this file. Without
        // it a 500, a DNS failure and a parse error are indistinguishable in the
        // logs, and this is an optional enrichment that fails silently by design
        // — so the log line is the only evidence there will ever be.
        logWarning(`[${operation}] batch enrichment failed, continuing without it`, {
          operation,
          component: 'dataUpdateService',
          additionalData: { error: String(enrichmentError) },
        });
      }
    }

    // Calculate container types AFTER enrichment so ABV is available for glass selection
    console.log(`[${operation}] calculating container types for my beers`);
    const myBeersWithContainerTypes = calculateContainerTypes(beersForContainerCalc);

    const sequentialMyBeers = toNonEmpty(
      myBeersWithContainerTypes as BeerfinderWithContainerType[]
    );
    if (sequentialMyBeers === null) {
      // Rows arrived and none survived local validation. confirmed-empty is
      // handled above, so this can only be malformed — leave the table alone
      // rather than wiping a populated list.
      throw new Error(
        `All ${myBeers.length} tasted beers from the API failed validation; refusing to write`
      );
    }

    return {
      plan: {
        kind: 'write',
        write: { kind: 'replace', beers: sequentialMyBeers },
      },
      pendingWorkerSync: workerSync,
    };
  } catch (error) {
    logError(error, {
      operation: `${operation} - my beers`,
      component: 'dataUpdateService',
    });
    return {
      plan: {
        kind: 'settled',
        result: { success: false, dataUpdated: false, error: createErrorResponse(error) },
      },
      pendingWorkerSync: null,
    };
  }
}

/** Store the tasted list. Runs under the write lock; makes no network request. */
async function writeMyBeers(write: MyBeersWrite): Promise<DataUpdateResult> {
  if (write.kind === 'clear') {
    await myBeersRepository.replaceAllWithEmptyUnsafe();
    await setPreference('my_beers_last_update', new Date().toISOString());
    await setPreference('my_beers_last_check', new Date().toISOString());
    return { success: true, dataUpdated: true, itemCount: 0 };
  }

  await myBeersRepository.insertManyUnsafe(write.beers);
  await setPreference('my_beers_last_update', new Date().toISOString());
  await setPreference('my_beers_last_check', new Date().toISOString());
  return { success: true, dataUpdated: true, itemCount: write.beers.length };
}

/** Fetch and classify rewards. No database access. */
async function prepareRewards(operation: RefreshOperation): Promise<SourcePlan<RewardsWrite>> {
  console.log(`[${operation}] fetching rewards`);
  try {
    const decision = decideRewards(await fetchRewardsFromAPI());

    if (decision.action === 'fail') {
      // Logged here rather than left to the caller, because one of the two
      // callers has nowhere to put it. `sequentialRefreshAllData` carries the
      // error out in `rewardsResult` and turns it into a user-facing alert;
      // `refreshAllDataFromAPI` returns rows and nothing else, so `rewards: []`
      // is indistinguishable from "you have no rewards" to everyone downstream.
      //
      // Its old inline block carried exactly this call, and routing it through
      // this shared function deleted the only trace a rewards fetch had failed
      // at all — a non-answer laundered into a successful-looking empty one,
      // which is the failure mode this whole plan exists to remove.
      //
      // `logWarning`, not `logError`: skip and fail must stay distinguishable,
      // and two tests assert that a skip reaches neither.
      logWarning(`Rewards refresh failed: ${decision.error.message}`, {
        operation: `${operation} - rewards`,
        component: 'dataUpdateService',
        additionalData: { errorType: decision.error.type },
      });
      return {
        kind: 'settled',
        result: { success: false, dataUpdated: false, error: decision.error },
      };
    }
    if (decision.action === 'skip') {
      console.log(`[${operation}] rewards not applicable — ${decision.reason.detail}`);
      return { kind: 'settled', result: { success: true, dataUpdated: false } };
    }
    return decision.action === 'clear'
      ? { kind: 'write', write: { kind: 'clear' } }
      : { kind: 'write', write: { kind: 'replace', rows: decision.rows } };
  } catch (error) {
    logError(error, {
      operation: `${operation} - rewards`,
      component: 'dataUpdateService',
    });
    return {
      kind: 'settled',
      result: { success: false, dataUpdated: false, error: createErrorResponse(error) },
    };
  }
}

/** Store rewards. Runs under the write lock; makes no network request. */
async function writeRewards(write: RewardsWrite): Promise<DataUpdateResult> {
  // The two arms are different operations, not one operation with an empty
  // argument. `insertManyUnsafe([])` early-returns without clearing, so routing
  // `clear` through it left stale rewards behind and still reported an update.
  if (write.kind === 'clear') {
    await rewardsRepository.replaceAllWithEmptyUnsafe();
    return { success: true, dataUpdated: true, itemCount: 0 };
  }

  const rows = [...write.rows];
  await rewardsRepository.insertManyUnsafe(rows);
  return { success: true, dataUpdated: true, itemCount: rows.length };
}

/**
 * Manual refresh of all data types (all beers, my beers, rewards)
 *
 * FIXED CI-4: Now delegates to sequentialRefreshAllData() to use master lock coordination
 * and avoid lock contention. This provides 3x better performance (~1.5s vs ~4.5s).
 *
 * @returns Promise<ManualRefreshResult> with results for all three refresh operations
 */
export async function manualRefreshAllData(): Promise<ManualRefreshResult> {
  console.log('Starting unified manual refresh for all data types...');

  try {
    // Check if API URLs are configured
    const apiUrl = await getPreference('all_beers_api_url');
    const myBeersApiUrl = await getPreference('my_beers_api_url');

    if (!apiUrl && !myBeersApiUrl) {
      console.log('No API URLs configured for manual refresh');
      return {
        allBeersResult: {
          success: false,
          dataUpdated: false,
          error: { type: ApiErrorType.VALIDATION_ERROR, message: 'No API URLs configured' },
        },
        myBeersResult: {
          success: false,
          dataUpdated: false,
          error: { type: ApiErrorType.VALIDATION_ERROR, message: 'No API URLs configured' },
        },
        rewardsResult: {
          success: false,
          dataUpdated: false,
          error: { type: ApiErrorType.VALIDATION_ERROR, message: 'No API URLs configured' },
        },
        hasErrors: true,
        allNetworkErrors: false,
      };
    }

    // Wait out any running refresh BEFORE clearing anything. The clears below
    // are this function's whole mechanism for forcing a full fetch, and a
    // refresh already in flight has read the old values and will write its own
    // over the top of ours the moment it reaches its write burst. Clearing
    // first and then waiting would put our invalidation underneath its results.
    await settleInFlightRefresh();

    // Force fresh data by clearing relevant timestamps
    console.log('Clearing timestamp checks for manual refresh (all data)');
    const now = Date.now();
    if (now - lastManualRefreshTime < RAPID_REFRESH_WINDOW_MS) {
      console.log('Rapid double-refresh detected, clearing ETag to force full fetch');
      await commitTaplistWrite({ kind: 'cleared' });
    }
    lastManualRefreshTime = now;

    // The taplist-level twin of `join: false` below. A fetch already in flight
    // read the preferences this function has just changed — including the ETag
    // it may have cleared a few lines up — so joining it would hand the user
    // back a result computed from the state they explicitly asked to discard.
    // Opting out of the sequential join is not enough, because
    // `settleInFlightRefresh` does not know this join point exists.
    dropInFlightTaplistFetch();

    await setPreference('all_beers_last_update', '');
    await setPreference('all_beers_last_check', '');
    await setPreference('my_beers_last_update', '');
    await setPreference('my_beers_last_check', '');

    // Delegate to sequential refresh for proper lock coordination (CI-4 fix)
    // This avoids the lock contention that occurred with parallel Promise.allSettled()
    //
    // `join: false` because the clears above are state a running refresh cannot
    // see. See `SequentialRefreshOptions.join`.
    return await sequentialRefreshAllData({ join: false });
  } catch (error) {
    logError(error, {
      operation: 'manualRefreshAllData',
      component: 'dataUpdateService',
      additionalData: { message: 'Error in unified manual refresh' },
    });
    const errorResponse = createErrorResponse(error);

    return {
      allBeersResult: { success: false, dataUpdated: false, error: errorResponse },
      myBeersResult: { success: false, dataUpdated: false, error: errorResponse },
      rewardsResult: { success: false, dataUpdated: false, error: errorResponse },
      hasErrors: true,
      allNetworkErrors:
        errorResponse.type === 'NETWORK_ERROR' || errorResponse.type === 'TIMEOUT_ERROR',
    };
  }
}

export async function checkAndRefreshOnAppOpen(
  minIntervalHours: number = 12
): Promise<AutoRefreshResult> {
  try {
    // First check if API URLs are actually configured
    const allBeersApiUrl = await getPreference('all_beers_api_url');
    const myBeersApiUrl = await getPreference('my_beers_api_url');
    const isVisitor = (await getPreference('is_visitor_mode')) === 'true';

    // Deliberately NOT `areApiUrlsConfigured()`, which is the routing gate —
    // "should the app show tabs or send the user to Settings". This is a
    // different question: which individual sources are worth fetching. A member
    // with only the taplist URL set is not "configured" for routing, but their
    // taplist is still worth refreshing, and each source is gated separately
    // below for that reason. Keeping the two questions distinct is the point;
    // what was wrong was `useSettingsState` reimplementing the ROUTING one.
    if (!allBeersApiUrl && !myBeersApiUrl) {
      console.log('API URLs not configured yet, skipping automatic data refresh');
      return { updated: false, errors: [] };
    }

    const shouldRefreshAllBeers = await shouldRefreshData('all_beers_last_check', minIntervalHours);
    const shouldRefreshMyBeers = await shouldRefreshData('my_beers_last_check', minIntervalHours);

    let updated = false;
    const errors: ErrorResponse[] = [];

    if (shouldRefreshAllBeers && allBeersApiUrl) {
      console.log(
        `More than ${minIntervalHours} hours since last all beers check, refreshing data`
      );
      const allBeersResult = await fetchAndUpdateAllBeers();

      updated = updated || allBeersResult.dataUpdated;

      if (!allBeersResult.success && allBeersResult.error) {
        logError(allBeersResult.error, {
          operation: 'checkAndRefreshOnAppOpen',
          component: 'dataUpdateService',
          additionalData: { message: 'Error refreshing all beers data' },
        });
        errors.push(allBeersResult.error);
      }
    } else {
      console.log(
        `All beers data is less than ${minIntervalHours} hours old or API URL not set, skipping refresh`
      );
    }

    // Only try to refresh my beers if not in visitor mode and the URL is configured
    if (shouldRefreshMyBeers && myBeersApiUrl && !isVisitor) {
      console.log(`More than ${minIntervalHours} hours since last my beers check, refreshing data`);
      const myBeersResult = await fetchAndUpdateMyBeers();

      updated = updated || myBeersResult.dataUpdated;

      if (!myBeersResult.success && myBeersResult.error) {
        logError(myBeersResult.error, {
          operation: 'checkAndRefreshOnAppOpen',
          component: 'dataUpdateService',
          additionalData: { message: 'Error refreshing my beers data' },
        });
        errors.push(myBeersResult.error);
      }
    } else {
      if (isVisitor) {
        console.log('In visitor mode, skipping my beers refresh');
      } else {
        console.log(
          `My beers data is less than ${minIntervalHours} hours old or API URL not set, skipping refresh`
        );
      }
    }

    if (errors.length > 0) {
      logError('Errors during automatic data refresh', {
        operation: 'checkAndRefreshOnAppOpen',
        component: 'dataUpdateService',
        additionalData: { errorCount: errors.length, errors },
      });
    }

    return { updated, errors };
  } catch (error) {
    logError(error, {
      operation: 'checkAndRefreshOnAppOpen',
      component: 'dataUpdateService',
      additionalData: { message: 'Error checking for refresh on app open' },
    });
    const errorResponse = createErrorResponse(error);
    return {
      updated: false,
      errors: [errorResponse],
    };
  }
}

/**
 * Refresh all data from API (all beers, my beers, and rewards)
 *
 * FIXED CI-5: Now uses sequential execution with master lock to avoid lock contention.
 * This is the main entry point for fetching fresh data from the Flying Saucer API.
 *
 * @returns Object containing arrays of fetched data
 * @throws Error if API URLs are not configured
 */
export const refreshAllDataFromAPI = async (): Promise<{
  allBeers: BeerWithContainerType[];
  myBeers: BeerWithContainerType[];
  rewards: Reward[];
}> => {
  console.log('Refreshing all data from API...');

  // Check that API URLs are configured
  const apiUrlsConfigured = await areApiUrlsConfigured();
  if (!apiUrlsConfigured) {
    throw new Error('API URLs not configured. Please log in to set up API URLs.');
  }

  // Fetch phase, no lock held. `01` Phase 4 left this function alone and gave a
  // reason: it had no per-source try/catch, so hoisting the fetches above the
  // writes would let one failing source suppress the others — "exactly the
  // weak-link case this plan exists to fix". `02` Phase 2.5 supplied that
  // isolation at `3f1d556`, which retires the blocker but not the concern; the
  // concern is now a test, in refreshAllDataFromAPI.locking.test.ts.
  //
  // The comment that used to sit here recorded the OPPOSITE decision
  // ("Deliberately does NOT reorder fetch versus write"). It was correct when
  // written and is now the thing being changed, so it is gone rather than
  // stale — the next reader would otherwise restore the coupling on purpose.
  //
  // This is the autoLogin -> checkInBeer path: a lock held across a stalled
  // fetch here blocks a user trying to check a beer in.
  const allBeersPlan = await prepareAllBeers(REFRESH_FROM_API);
  const { plan: myBeersPlan, pendingWorkerSync } = await prepareMyBeers(REFRESH_FROM_API);
  const rewardsPlan = await prepareRewards(REFRESH_FROM_API);

  // These are the rows the writes were PLANNED to store — not confirmation that
  // they were stored. They are derived from the same plans, so the two cannot
  // describe different decisions; they can still describe a decision that then
  // failed, because `applyPlan` turns a throwing write into a result this
  // function discards. A rejected taplist insert therefore still returns its
  // rows. That is pre-existing behaviour, not something the plan derivation
  // introduced, and an earlier version of this comment claiming the two "cannot
  // disagree" was overstating it.
  //
  // That same earlier version also claimed "autoLogin -> checkInBeer consumes
  // them". It does not: both production callers (`authService.ts:44`, `:399`)
  // are a bare `await refreshAllDataFromAPI();` and discard the object. Only
  // tests read it — which is why the logs are this function's real output
  // channel, and why a source failing silently here mattered enough to fix.
  const allBeers = plannedRows(allBeersPlan, allBeersRows);
  const myBeers = plannedRows(myBeersPlan, myBeersRows);
  const rewards = plannedRows(rewardsPlan, rewardsRows);

  const needsLock = [allBeersPlan, myBeersPlan, rewardsPlan].some(plan => plan.kind === 'write');

  if (needsLock) {
    await databaseLockManager.withDatabaseLock('refresh-all-from-api-write', async () => {
      // Each write is isolated, as each fetch is. Failures are logged and not
      // reported: this entry point returns rows and has no channel to carry a
      // per-source outcome. Callers needing one use fetchAndUpdateRewards or
      // sequentialRefreshAllData.
      await applyPlan(allBeersPlan, writeAllBeersOnLogin, `${REFRESH_FROM_API} - all beers`);
      await applyPlan(myBeersPlan, writeMyBeersOnLogin, `${REFRESH_FROM_API} - my beers`);
      await applyPlan(rewardsPlan, writeRewards, `${REFRESH_FROM_API} - rewards`);
    });
  }

  // After the burst, for the reason `MyBeersPreparation` gives: this sync polls
  // and then writes enrichment into both tables under its own lock, so starting
  // it during the fetch phase lets it land first and be wiped by the
  // clear-and-reinsert.
  if (pendingWorkerSync !== null) {
    syncMissingBeersInBackground(
      pendingWorkerSync.missingIds,
      pendingWorkerSync.beers,
      REFRESH_FROM_API
    );
  }

  console.log(
    `Refreshed all data: ${allBeers.length} beers, ${myBeers.length} tasted beers, ${rewards.length} rewards`
  );

  return { allBeers, myBeers, rewards };
};

/**
 * The rows each source's write will store.
 *
 * Exhaustive switches, and named per source rather than written as ternaries at
 * the call site. A ternary with a catch-all `else []` answers "is this the
 * replace arm?"; a switch answers "what does each arm mean?" — and the
 * difference shows the moment an arm is added. With the ternary, giving
 * `AllBeersWrite` a third arm made `writeAllBeersOnLogin` fail loudly on
 * `write.beers` while the row derivation silently returned `[]`: the
 * "wrote correctly, returned the wrong rows" split these exist to prevent.
 *
 * They do NOT make the pairing safe. Both `replace` arms name their field
 * `beers`, and `BeerfinderWithContainerType` is `BeerWithContainerType` plus
 * optional fields, so handing the my-beers plan to `allBeersRows` still
 * typechecks. That one is caught by `dataRefresh.integration.test.ts`'s row
 * counts, not by the compiler.
 */
function allBeersRows(write: AllBeersWrite): BeerWithContainerType[] {
  switch (write.kind) {
    case 'replace':
      return [...write.beers];
    case 'not-modified':
      return [];
  }
}

function myBeersRows(write: MyBeersWrite): BeerfinderWithContainerType[] {
  switch (write.kind) {
    case 'replace':
      return [...write.beers];
    case 'clear':
      return [];
  }
}

function rewardsRows(write: RewardsWrite): Reward[] {
  switch (write.kind) {
    case 'replace':
      return [...write.rows];
    case 'clear':
      return [];
  }
}

/**
 * The rows a plan will write, or none.
 *
 * Shared by the three derivations above so "what gets returned" is answered in
 * one place from the same value "what gets written" is answered from.
 */
function plannedRows<TWrite, TRow>(
  plan: SourcePlan<TWrite>,
  rowsOf: (write: TWrite) => TRow[]
): TRow[] {
  return plan.kind === 'write' ? rowsOf(plan.write) : [];
}

/**
 * Store the taplist on the login path.
 *
 * Deliberately NOT `writeAllBeers`. That one also stamps `all_beers_last_update`
 * and `all_beers_last_check` on a successful write; this path never has, and
 * adding them here would change when `checkAndRefreshOnAppOpen` considers the
 * data fresh — a behaviour change with nothing to do with moving a lock. The
 * asymmetry is odd (a 304 advances `all_beers_last_check` here but a successful
 * fetch does not) and it is recorded in plan 05 rather than fixed in passing.
 */
async function writeAllBeersOnLogin(write: AllBeersWrite): Promise<DataUpdateResult> {
  // Same guard as `writeAllBeers`, and needed here despite this being the login
  // path's own writer: a second login (or a settings change) can land while
  // this one is still fetching.
  if (!(await taplistConfigurationHeld(write.fetchedFor))) {
    return abandonedAfterStoreSwitch(REFRESH_FROM_API);
  }

  if (write.kind === 'not-modified') {
    // Already under the caller's lock, so the count and the clear are atomic.
    const verdict = await verifyNotModified();
    if (verdict !== 'trusted') {
      return emptyTableNotModifiedFailure(verdict);
    }
    await setPreference('all_beers_last_check', new Date().toISOString());
    return { success: true, dataUpdated: false };
  }

  // Same invalidate-then-commit sequence as the other two writers.
  await commitTaplistWrite({ kind: 'cleared' });
  await beerRepository.insertManyUnsafe(write.beers);
  await commitTaplistWrite(write.taplistSource);
  return { success: true, dataUpdated: true, itemCount: write.beers.length };
}

/**
 * Store the tasted list on the login path.
 *
 * As above: no timestamps, because this path has never written them.
 */
async function writeMyBeersOnLogin(write: MyBeersWrite): Promise<DataUpdateResult> {
  if (write.kind === 'clear') {
    await myBeersRepository.replaceAllWithEmptyUnsafe();
    return { success: true, dataUpdated: true, itemCount: 0 };
  }

  await myBeersRepository.insertManyUnsafe(write.beers);
  return { success: true, dataUpdated: true, itemCount: write.beers.length };
}
