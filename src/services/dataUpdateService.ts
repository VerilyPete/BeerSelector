import { getPreference, setPreference, areApiUrlsConfigured } from '../database/preferences';
import { fetchBeersFromAPI, fetchMyBeersFromAPI, fetchRewardsFromAPI } from '../api/beerApi';
import {
  Beer,
  Beerfinder,
  BeerWithContainerType,
  BeerfinderWithContainerType,
} from '../types/beer';
import { Reward } from '../types/database';
import { ApiErrorType, ErrorResponse, createErrorResponse } from '../utils/notificationUtils';
import { beerRepository } from '../database/repositories/BeerRepository';
import { myBeersRepository } from '../database/repositories/MyBeersRepository';
import { rewardsRepository } from '../database/repositories/RewardsRepository';
import { databaseLockManager } from '../database/DatabaseLockManager';
import { toNonEmpty } from '../api/fetchOutcome';
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
  if (storeId && config.enrichment.isConfigured()) {
    try {
      console.log(`[dataUpdateService] Attempting enrichment proxy for store ${storeId}...`);
      const storedEtag = await getPreference('all_beers_etag');
      const proxyResponse = await fetchBeersFromProxy(storeId, storedEtag ?? undefined);

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
    throw new Error(`${label} unavailable (${source.reason.code}): ${source.reason.detail}`);
  }
  if (source.status === 'failed') {
    throw new Error(`${label} failed: ${source.error.message}`);
  }
  if (source.data.kind === 'malformed') {
    throw new Error(`${label} malformed: ${source.data.detail}`);
  }
  if (source.data.kind === 'confirmed-empty') {
    // Returns empty rather than throwing: the taplist path already has
    // validation downstream that rejects an empty store and reports it as a
    // VALIDATION_ERROR, which is a better categorisation than anything this
    // helper could produce. The distinction that matters here — data versus
    // "we never asked" — is still enforced above.
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
    // Get the API URL from preferences
    const apiUrl = await getPreference('all_beers_api_url');
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
      console.log('All beers data not modified (304), skipping DB update');
      await setPreference('all_beers_last_check', new Date().toISOString());
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
    await beerRepository.insertMany(beersToInsert);

    // Store ETag for future conditional requests
    if (etag) {
      await setPreference('all_beers_etag', etag);
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

    const rows = decision.action === 'clear' ? [] : [...decision.rows];
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
export async function sequentialRefreshAllData(): Promise<ManualRefreshResult> {
  console.log('Starting sequential refresh with master lock coordination...');

  // Hold the master lock ONCE for the entire sequence
  return databaseLockManager.withDatabaseLock('refresh-all-data-sequential', async () => {
    // Execute operations sequentially using unsafe repository methods
    // Since we hold the master lock, nested lock acquisition is unnecessary
    console.log('Sequential refresh: starting all beers fetch');
    let allBeersResult: DataUpdateResult;
    try {
      // Get API URL to extract store ID for proxy
      const apiUrl = await getPreference('all_beers_api_url');
      const storeId = apiUrl ? extractStoreIdFromUrl(apiUrl) : null;

      const taplistResult = await fetchTaplistFromProxyOrDirect(storeId);

      // Handle 304 Not Modified
      if (taplistResult.notModified) {
        console.log('Sequential refresh: all beers not modified (304), skipping DB update');
        await setPreference('all_beers_last_check', new Date().toISOString());
        allBeersResult = { success: true, dataUpdated: false };
      } else {
        const { beers: allBeers, etag } = taplistResult;

        // Validate beers before insertion
        const validationResult = validateBeerArray(allBeers);

        if (validationResult.invalidBeers.length > 0) {
          logWarning(
            `Sequential refresh: Skipping ${validationResult.invalidBeers.length} invalid beers`,
            {
              operation: 'sequentialRefreshAllData',
              component: 'dataUpdateService',
              additionalData: { summary: validationResult.summary },
            }
          );
        }

        if (validationResult.validBeers.length === 0) {
          throw new Error('No valid beers found in API response');
        }

        // Calculate container types BEFORE insertion
        console.log('Sequential refresh: calculating container types for beers...');
        const beersWithContainerTypes = calculateContainerTypes(validationResult.validBeers);

        const sequentialBeers = toNonEmpty(beersWithContainerTypes);
        if (sequentialBeers === null) {
          throw new Error('No valid beers to insert after container-type calculation');
        }
        await beerRepository.insertManyUnsafe(sequentialBeers);

        // Store ETag for future conditional requests
        if (etag) {
          await setPreference('all_beers_etag', etag);
        }

        await setPreference('all_beers_last_update', new Date().toISOString());
        await setPreference('all_beers_last_check', new Date().toISOString());
        allBeersResult = {
          success: true,
          dataUpdated: true,
          itemCount: validationResult.validBeers.length,
        };
      }
    } catch (error) {
      logError(error, {
        operation: 'sequentialRefreshAllData - all beers',
        component: 'dataUpdateService',
      });
      allBeersResult = {
        success: false,
        dataUpdated: false,
        error: createErrorResponse(error),
      };
    }

    console.log('Sequential refresh: starting my beers fetch');
    let myBeersResult: DataUpdateResult;
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
      if (
        myBeersSource.status === 'unavailable' &&
        myBeersSource.reason.code === 'not-applicable'
      ) {
        console.log(`Sequential refresh: my beers not applicable — ${myBeersSource.reason.detail}`);
        myBeersResult = { success: true, dataUpdated: false };
      } else {
        if (myBeersSource.status !== 'fetched') {
          throw new Error(
            myBeersSource.status === 'unavailable'
              ? `My beers unavailable (${myBeersSource.reason.code}): ${myBeersSource.reason.detail}`
              : `My beers could not be fetched (${myBeersSource.status})`
          );
        }
        if (myBeersSource.data.kind === 'malformed') {
          throw new Error(`My beers malformed: ${myBeersSource.data.detail}`);
        }
        const emptyRound = myBeersSource.data.kind === 'confirmed-empty';
        if (emptyRound) {
          // NOT an early return: this block lives inside the withDatabaseLock
          // callback, so returning here would exit the whole refresh and skip the
          // rewards source entirely.
          await myBeersRepository.replaceAllWithEmptyUnsafe();
          await setPreference('my_beers_last_update', new Date().toISOString());
          await setPreference('my_beers_last_check', new Date().toISOString());
        }

        const myBeers = emptyRound ? [] : [...myBeersSource.data.items];

        // Validate myBeers before insertion
        const validationResult = validateBeerArray(myBeers);

        if (validationResult.invalidBeers.length > 0) {
          logWarning(
            `Sequential refresh: Skipping ${validationResult.invalidBeers.length} invalid my beers`,
            {
              operation: 'sequentialRefreshAllData',
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
            console.log(
              `[sequentialRefresh] Fetching enrichment for ${beerIds.length} tasted beers...`
            );

            const { enrichments: enrichmentData, missing: missingIds } =
              await fetchEnrichmentBatchWithMissing(beerIds);
            const enrichedCount = Object.keys(enrichmentData).length;

            if (enrichedCount > 0) {
              console.log(`[sequentialRefresh] Got enrichment for ${enrichedCount} tasted beers`);
              beersForContainerCalc = mergeEnrichmentData(
                validationResult.validBeers,
                enrichmentData
              );
            }

            // Sync missing beers to Worker for enrichment (in background)
            syncMissingBeersInBackground(
              missingIds,
              validationResult.validBeers,
              'sequentialRefresh'
            );
          } catch (enrichmentError) {
            logWarning('Batch enrichment failed in sequential refresh, continuing without', {
              operation: 'sequentialRefreshAllData',
              component: 'dataUpdateService',
            });
          }
        }

        // Calculate container types AFTER enrichment so ABV is available for glass selection
        console.log('Sequential refresh: calculating container types for my beers...');
        const myBeersWithContainerTypes = calculateContainerTypes(beersForContainerCalc);

        // Two DIFFERENT conditions, which a bare [] cannot tell apart.
        // fetchMyBeersFromAPI still returns a bare [] for FOUR conditions —
        // visitor mode, no URL, a none:// URL, and a genuine empty round. The
        // fifth, rows that all lack an id, now throws upstream instead, which is
        // what makes the split below meaningful. Of the four remaining, only the
        // empty round should clear; 02 Phase 3's `unavailable` retires the other
        // three, which still reach the clear arm today.
        const sequentialMyBeers = toNonEmpty(
          myBeersWithContainerTypes as BeerfinderWithContainerType[]
        );
        if (!emptyRound) {
          if (sequentialMyBeers === null) {
            // Rows arrived and none survived local validation. confirmed-empty is
            // handled above, so this can only be malformed — leave the table
            // alone rather than wiping a populated list.
            throw new Error(
              `All ${myBeers.length} tasted beers from the API failed validation; refusing to write`
            );
          }
          await myBeersRepository.insertManyUnsafe(sequentialMyBeers);
          await setPreference('my_beers_last_update', new Date().toISOString());
          await setPreference('my_beers_last_check', new Date().toISOString());
        }
        myBeersResult = {
          success: true,
          dataUpdated: true,
          itemCount: validationResult.validBeers.length,
        };
      }
    } catch (error) {
      logError(error, {
        operation: 'sequentialRefreshAllData - my beers',
        component: 'dataUpdateService',
      });
      myBeersResult = {
        success: false,
        dataUpdated: false,
        error: createErrorResponse(error),
      };
    }

    console.log('Sequential refresh: starting rewards fetch');
    let rewardsResult: DataUpdateResult;
    try {
      const decision = decideRewards(await fetchRewardsFromAPI());

      if (decision.action === 'fail') {
        rewardsResult = { success: false, dataUpdated: false, error: decision.error };
      } else if (decision.action === 'skip') {
        console.log(`Sequential refresh: rewards not applicable — ${decision.reason.detail}`);
        rewardsResult = { success: true, dataUpdated: false };
      } else {
        const rows = decision.action === 'clear' ? [] : [...decision.rows];
        await rewardsRepository.insertManyUnsafe(rows);
        rewardsResult = {
          success: true,
          dataUpdated: true,
          itemCount: rows.length,
        };
      }
    } catch (error) {
      logError(error, {
        operation: 'sequentialRefreshAllData - rewards',
        component: 'dataUpdateService',
      });
      rewardsResult = {
        success: false,
        dataUpdated: false,
        error: createErrorResponse(error),
      };
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
    });

    return {
      allBeersResult,
      myBeersResult,
      rewardsResult,
      hasErrors,
      allNetworkErrors,
    };
  });
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

    // Force fresh data by clearing relevant timestamps
    console.log('Clearing timestamp checks for manual refresh (all data)');
    const now = Date.now();
    if (now - lastManualRefreshTime < RAPID_REFRESH_WINDOW_MS) {
      console.log('Rapid double-refresh detected, clearing ETag to force full fetch');
      await setPreference('all_beers_etag', '');
    }
    lastManualRefreshTime = now;
    await setPreference('all_beers_last_update', '');
    await setPreference('all_beers_last_check', '');
    await setPreference('my_beers_last_update', '');
    await setPreference('my_beers_last_check', '');

    // Delegate to sequential refresh for proper lock coordination (CI-4 fix)
    // This avoids the lock contention that occurred with parallel Promise.allSettled()
    return await sequentialRefreshAllData();
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

    // If URLs are not set yet, skip the refresh entirely without treating it as an error
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

  // Hold the master lock for the entire sequence to avoid lock contention (CI-5 fix)
  return databaseLockManager.withDatabaseLock('refresh-all-from-api', async () => {
    // Execute sequentially to avoid lock contention
    // Use unsafe repository methods since we already hold master lock

    // Get API URL to extract store ID for proxy
    const apiUrl = await getPreference('all_beers_api_url');
    const storeId = apiUrl ? extractStoreIdFromUrl(apiUrl) : null;

    // Hoisted so a failing source leaves the others intact rather than
    // taking their results down with it. Each stays at its empty default,
    // which is what the caller then sees for that source.
    let allBeersWithContainerTypes: BeerWithContainerType[] = [];
    let myBeersWithContainerTypes: BeerfinderWithContainerType[] = [];
    let rewards: Reward[] = [];

    // Each source is isolated, mirroring sequentialRefreshAllData. This is the
    // only one of the three refresh entry points that had no per-source catch,
    // so a single failure aborted the remainder — and the live path is a
    // CHECK IN with an expired session on a weak link: checkInBeer ->
    // autoLogin -> here. The taplist write would land, the my-beers fetch would
    // throw, and BOTH the my-beers and rewards writes were skipped, leaving a
    // fresh taplist beside a stale tasted list: a wrong-high Beerfinder count.
    //
    // Deliberately does NOT reorder fetch versus write. Today the taplist is
    // written before my-beers is fetched, so a my-beers failure still leaves
    // the taplist written — the property 01 Phase 4 is protecting. This adds
    // isolation WITHIN that order rather than changing it.
    try {
      // =========================================================================
      // ALL BEERS: Try proxy first, fall back to direct fetch
      // =========================================================================
      console.log('Fetching all beers from API...');
      const taplistResult = await fetchTaplistFromProxyOrDirect(storeId);

      allBeersWithContainerTypes = [];

      if (taplistResult.notModified) {
        console.log('All beers data not modified (304), skipping DB update');
        await setPreference('all_beers_last_check', new Date().toISOString());
        // Load existing beers from database for return value
        // Note: We return empty array here; callers should handle accordingly
      } else {
        const { beers: allBeersRaw, etag } = taplistResult;

        const allBeersValidation = validateBeerArray(allBeersRaw);

        if (allBeersValidation.invalidBeers.length > 0) {
          logWarning(`Skipping ${allBeersValidation.invalidBeers.length} invalid all beers`, {
            operation: 'refreshAllDataFromAPI',
            component: 'dataUpdateService',
            additionalData: { summary: allBeersValidation.summary },
          });
        }

        if (allBeersValidation.validBeers.length === 0) {
          throw new Error('No valid all beers found in API response');
        }

        // Calculate container types BEFORE insertion
        console.log('Calculating container types for all beers...');
        allBeersWithContainerTypes = calculateContainerTypes(allBeersValidation.validBeers);

        const apiBeersToInsert = toNonEmpty(allBeersWithContainerTypes);
        if (apiBeersToInsert === null) {
          throw new Error('No valid all beers to insert after container-type calculation');
        }
        await beerRepository.insertManyUnsafe(apiBeersToInsert);

        // Store ETag for future conditional requests
        if (etag) {
          await setPreference('all_beers_etag', etag);
        }
      }
    } catch (error) {
      logError(error, {
        operation: 'refreshAllDataFromAPI - all beers',
        component: 'dataUpdateService',
      });
    }

    try {
      // =========================================================================
      // MY BEERS: Fetch from FS, then batch enrichment
      // =========================================================================
      console.log('Fetching my beers from API...');
      const myBeersSource = await fetchMyBeersFromAPI();

      // Same three-way split as sequentialRefreshAllData. Handled up front so
      // the confirmed-empty case is unmistakable and every other case leaves
      // the tasted table alone.
      // `not-applicable` is not a failure: it means this source does not
      // apply to this user, which is what visitor mode and a none://
      // placeholder ARE. Throwing here logged an error on every visitor
      // login, since this is the autoLogin -> checkInBeer path. Leaves
      // `myBeersWithContainerTypes` at its hoisted [] and writes nothing,
      // which is the same outcome minus the false error.
      if (
        myBeersSource.status === 'unavailable' &&
        myBeersSource.reason.code === 'not-applicable'
      ) {
        console.log(`My beers not applicable: ${myBeersSource.reason.detail}`);
      } else {
        if (myBeersSource.status !== 'fetched') {
          throw new Error(
            myBeersSource.status === 'unavailable'
              ? `My beers unavailable (${myBeersSource.reason.code}): ${myBeersSource.reason.detail}`
              : `My beers could not be fetched (${myBeersSource.status})`
          );
        }
        if (myBeersSource.data.kind === 'malformed') {
          throw new Error(`My beers malformed: ${myBeersSource.data.detail}`);
        }
        const myBeersRaw =
          myBeersSource.data.kind === 'confirmed-empty' ? [] : [...myBeersSource.data.items];
        const confirmedEmptyRound = myBeersSource.data.kind === 'confirmed-empty';
        const myBeersValidation = validateBeerArray(myBeersRaw);

        if (myBeersValidation.invalidBeers.length > 0) {
          logWarning(`Skipping ${myBeersValidation.invalidBeers.length} invalid my beers`, {
            operation: 'refreshAllDataFromAPI',
            component: 'dataUpdateService',
            additionalData: { summary: myBeersValidation.summary },
          });
        }

        // Enrich BEFORE container type calculation so ABV is available for glass selection
        let myBeersForContainerCalc = myBeersValidation.validBeers;
        if (config.enrichment.isConfigured() && myBeersValidation.validBeers.length > 0) {
          try {
            const beerIds = myBeersValidation.validBeers.map(beer => beer.id);
            console.log(
              `[refreshAllDataFromAPI] Fetching enrichment for ${beerIds.length} tasted beers...`
            );

            const { enrichments: enrichmentData, missing: missingIds } =
              await fetchEnrichmentBatchWithMissing(beerIds);
            const enrichedCount = Object.keys(enrichmentData).length;

            if (enrichedCount > 0) {
              console.log(
                `[refreshAllDataFromAPI] Got enrichment for ${enrichedCount} tasted beers`
              );
              myBeersForContainerCalc = mergeEnrichmentData(
                myBeersValidation.validBeers,
                enrichmentData
              );
            }

            // Sync missing beers to Worker for enrichment (in background)
            syncMissingBeersInBackground(
              missingIds,
              myBeersValidation.validBeers,
              'refreshAllDataFromAPI'
            );
          } catch (enrichmentError) {
            logWarning('Batch enrichment failed in refreshAllDataFromAPI, continuing without', {
              operation: 'refreshAllDataFromAPI',
              component: 'dataUpdateService',
            });
          }
        }

        // Calculate container types AFTER enrichment so ABV is available for glass selection
        console.log('Calculating container types for my beers...');
        myBeersWithContainerTypes = calculateContainerTypes(myBeersForContainerCalc);

        // Same split as sequentialRefreshAllData: only the RAW length can tell a
        // genuine empty round from a response whose every row lacked an id.
        const apiMyBeers = toNonEmpty(myBeersWithContainerTypes as BeerfinderWithContainerType[]);
        if (apiMyBeers !== null) {
          await myBeersRepository.insertManyUnsafe(apiMyBeers);
        } else if (confirmedEmptyRound) {
          // The server said zero, so clearing is correct. Keyed off the outcome
          // rather than a length, which is what could not tell these apart.
          await myBeersRepository.replaceAllWithEmptyUnsafe();
        } else {
          // This is the autoLogin -> CHECK IN path, so aborting here would fail a
          // check-in. Skipping the write is the lesser harm: a stale tasted list
          // beats a wiped one. Per-source reporting is 02 Phase 2.5's job.
          console.error(
            `Refusing to write my beers: all ${myBeersRaw.length} rows failed validation`
          );
        }
      }
    } catch (error) {
      logError(error, {
        operation: 'refreshAllDataFromAPI - my beers',
        component: 'dataUpdateService',
      });
    }

    try {
      console.log('Fetching rewards from API...');
      const decision = decideRewards(await fetchRewardsFromAPI());

      // This entry point returns rows and has no per-source success channel, so
      // a rewards failure is not reportable to the caller here — it can only be
      // logged, and `rewards` stays at its hoisted `[]`. Callers that need the
      // outcome use fetchAndUpdateRewards or sequentialRefreshAllData.
      //
      // Logged rather than thrown. The earlier `throw new Error(error.message)`
      // reached the catch nine lines below purely for its logging, and paid for
      // it by discarding `type` and `originalError` from an ErrorResponse one
      // line after decideRewards built it — control flow by exception, and the
      // re-parseable-message failure mode the outcome types exist to remove.
      if (decision.action === 'fail') {
        logWarning(`Rewards refresh failed: ${decision.error.message}`, {
          operation: 'refreshAllDataFromAPI - rewards',
          component: 'dataUpdateService',
          additionalData: { errorType: decision.error.type },
        });
      } else if (decision.action === 'skip') {
        console.log(`Rewards not applicable: ${decision.reason.detail}`);
      } else {
        rewards = decision.action === 'clear' ? [] : [...decision.rows];
        await rewardsRepository.insertManyUnsafe(rewards);
      }
    } catch (error) {
      logError(error, {
        operation: 'refreshAllDataFromAPI - rewards',
        component: 'dataUpdateService',
      });
    }

    console.log(
      `Refreshed all data: ${allBeersWithContainerTypes.length} beers, ${myBeersWithContainerTypes.length} tasted beers, ${rewards.length} rewards`
    );

    return {
      allBeers: allBeersWithContainerTypes,
      myBeers: myBeersWithContainerTypes as BeerfinderWithContainerType[],
      rewards,
    };
  });
};
