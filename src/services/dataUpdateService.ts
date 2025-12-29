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

/**
 * Result of a data update operation
 */
export interface DataUpdateResult {
  success: boolean;
  error?: ErrorResponse;
  dataUpdated: boolean;
  itemCount?: number;
}

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
          .then(enrichments => {
            const count = Object.keys(enrichments).length;
            if (count > 0) {
              console.log(`[${operation}] Polling completed: ${count} beers enriched`);
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

    let allBeers: Beer[] = [];
    let usedProxy = false;

    // =========================================================================
    // PRIMARY PATH: Try enrichment proxy first
    // =========================================================================
    if (storeId && config.enrichment.isConfigured()) {
      try {
        console.log(`[dataUpdateService] Attempting enrichment proxy for store ${storeId}...`);

        const proxyResponse = await fetchBeersFromProxy(storeId);

        // Map Worker response to Beer interface
        allBeers = proxyResponse.beers.map(mapEnrichedBeerToAppBeer);
        usedProxy = true;

        console.log(
          `[dataUpdateService] Fetched ${allBeers.length} beers via proxy${proxyResponse.cached ? ' (cached)' : ''}`
        );
      } catch (proxyError) {
        // Log but don't fail - fall through to direct fetch
        logWarning('Enrichment proxy failed, falling back to direct fetch', {
          operation: 'fetchAndUpdateAllBeers',
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

    // =========================================================================
    // FALLBACK PATH: Direct Flying Saucer fetch
    // =========================================================================
    if (!usedProxy) {
      console.log('[dataUpdateService] Using direct Flying Saucer fetch...');
      recordFallback(); // Track fallback for metrics

      let response;
      try {
        // Set a timeout for the fetch request
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

        response = await fetch(apiUrl, { signal: controller.signal });
        clearTimeout(timeoutId);
      } catch (fetchError) {
        logError(fetchError, {
          operation: 'fetchAndUpdateAllBeers',
          component: 'dataUpdateService',
          additionalData: { message: 'Network error fetching all beers data' },
        });

        // Check if it's an abort error (timeout)
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          return {
            success: false,
            dataUpdated: false,
            error: {
              type: ApiErrorType.NETWORK_ERROR,
              message: 'Network connection error: request timed out while fetching beer data.',
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
        logError(`Failed to fetch all beers data: ${response.status} ${response.statusText}`, {
          operation: 'fetchAndUpdateAllBeers',
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
          operation: 'fetchAndUpdateAllBeers',
          component: 'dataUpdateService',
          additionalData: { message: 'Error parsing all beers data' },
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

      // Validate the API response structure
      const responseValidation = validateBrewInStockResponse(data);
      if (!responseValidation.isValid) {
        logError('Invalid API response structure for all beers', {
          operation: 'fetchAndUpdateAllBeers',
          component: 'dataUpdateService',
          additionalData: {
            errors: responseValidation.errors,
          },
        });
        return {
          success: false,
          dataUpdated: false,
          error: {
            type: ApiErrorType.VALIDATION_ERROR,
            message: `Invalid data format received from server: ${responseValidation.errors.join(', ')}`,
          },
        };
      }

      // Extract the beers (no enrichment data in fallback path)
      if (!responseValidation.data || responseValidation.data.length === 0) {
        logError('No beers in validation data', {
          operation: 'fetchAndUpdateAllBeers',
          component: 'dataUpdateService',
        });
        return {
          success: false,
          dataUpdated: false,
          error: {
            type: ApiErrorType.VALIDATION_ERROR,
            message: 'No beer data received from server',
          },
        };
      }
      allBeers = responseValidation.data;
      console.log(
        `[dataUpdateService] Fetched ${allBeers.length} beers via direct fetch (no enrichment)`
      );
    }

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
    const beersWithContainerTypes = calculateContainerTypes(validationResult.validBeers as Beer[]);

    // Update the database with valid beers including container types
    await beerRepository.insertMany(beersWithContainerTypes);

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
      // Clear the database table since there are no beers
      await myBeersRepository.insertMany([]);

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
      console.log('No valid beers with IDs found, but API returned data - clearing database');
      // This means all beers in the response are invalid, so clear the database
      await myBeersRepository.insertMany([]);

      // Update the last update timestamp
      await setPreference('my_beers_last_update', new Date().toISOString());
      await setPreference('my_beers_last_check', new Date().toISOString());

      console.log('Updated my beers data with 0 beers (all invalid)');
      return {
        success: true,
        dataUpdated: true,
        itemCount: 0,
      };
    }

    // Calculate container types BEFORE insertion
    console.log('Calculating container types for tasted beers...');
    const beersWithContainerTypes = calculateContainerTypes(validBeers as Beer[]);

    // =========================================================================
    // ENRICHMENT: Fetch enrichment data via batch lookup if proxy is configured
    // =========================================================================
    // Add batch enrichment for tasted beers if proxy is configured
    let enrichedBeers = beersWithContainerTypes;
    if (config.enrichment.isConfigured()) {
      try {
        const beerIds = beersWithContainerTypes.map(beer => beer.id);
        console.log(
          `[dataUpdateService] Fetching enrichment for ${beerIds.length} tasted beers...`
        );

        // Use fetchEnrichmentBatchWithMissing to also get IDs not in Worker database
        const { enrichments: enrichmentData, missing: missingIds } =
          await fetchEnrichmentBatchWithMissing(beerIds);
        const enrichedCount = Object.keys(enrichmentData).length;

        if (enrichedCount > 0) {
          console.log(`[dataUpdateService] Got enrichment data for ${enrichedCount} beers`);
          enrichedBeers = mergeEnrichmentData(beersWithContainerTypes, enrichmentData);
        }

        // Sync missing beers to Worker for enrichment (in background)
        syncMissingBeersInBackground(missingIds, beersWithContainerTypes, 'dataUpdateService');
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

    // Update the database with the valid beers including container types and enrichment
    await myBeersRepository.insertMany(enrichedBeers);

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
export interface ManualRefreshResult {
  allBeersResult: DataUpdateResult;
  myBeersResult: DataUpdateResult;
  rewardsResult: DataUpdateResult;
  hasErrors: boolean;
  allNetworkErrors: boolean;
}

/**
 * Result of an automatic refresh operation
 */
export interface AutoRefreshResult {
  updated: boolean;
  errors: ErrorResponse[];
}

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
    const rewards = await fetchRewardsFromAPI();
    await rewardsRepository.insertMany(rewards);

    console.log(`Updated rewards data successfully: ${rewards.length} rewards`);
    return {
      success: true,
      dataUpdated: true,
      itemCount: rewards.length,
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

// NOTE: These implementation variables and override function are currently unused.
// They were intended for test injection but never fully implemented.
// Keeping them for potential future use.
// @ts-expect-error - Unused variable kept for future test injection
let _fetchAllImpl = fetchAndUpdateAllBeers;
// @ts-expect-error - Unused variable kept for future test injection
let _fetchMyImpl = fetchAndUpdateMyBeers;
// @ts-expect-error - Unused variable kept for future test injection
let _fetchRewardsImpl = fetchAndUpdateRewards;

export function __setRefreshImplementations(overrides: {
  fetchAll?: typeof fetchAndUpdateAllBeers;
  fetchMy?: typeof fetchAndUpdateMyBeers;
  fetchRewards?: typeof fetchAndUpdateRewards;
}) {
  if (overrides.fetchAll) _fetchAllImpl = overrides.fetchAll;
  if (overrides.fetchMy) _fetchMyImpl = overrides.fetchMy;
  if (overrides.fetchRewards) _fetchRewardsImpl = overrides.fetchRewards;
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

  // Acquire master lock ONCE for entire sequence
  await databaseLockManager.acquireLock('refresh-all-data-sequential');

  try {
    // Execute operations sequentially using unsafe repository methods
    // Since we hold the master lock, nested lock acquisition is unnecessary
    console.log('Sequential refresh: starting all beers fetch');
    let allBeersResult: DataUpdateResult;
    try {
      // Get API URL to extract store ID for proxy
      const apiUrl = await getPreference('all_beers_api_url');
      const storeId = apiUrl ? extractStoreIdFromUrl(apiUrl) : null;

      let allBeers: Beer[] = [];
      let usedProxy = false;

      // Try proxy first if configured
      if (storeId && config.enrichment.isConfigured()) {
        try {
          console.log(`[sequentialRefresh] Attempting proxy for store ${storeId}...`);
          const proxyResponse = await fetchBeersFromProxy(storeId);
          allBeers = proxyResponse.beers.map(mapEnrichedBeerToAppBeer);
          usedProxy = true;
          console.log(`[sequentialRefresh] Got ${allBeers.length} beers from proxy`);
        } catch (proxyError) {
          logWarning('Proxy failed in sequential refresh, falling back to direct fetch', {
            operation: 'sequentialRefreshAllData',
            component: 'dataUpdateService',
            additionalData: {
              error: proxyError instanceof Error ? proxyError.message : String(proxyError),
            },
          });
        }
      }

      // Fall back to direct fetch if proxy not used
      if (!usedProxy) {
        recordFallback(); // Track fallback for metrics
        allBeers = await fetchBeersFromAPI();
      }

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
      const beersWithContainerTypes = calculateContainerTypes(
        validationResult.validBeers as Beer[]
      );

      await beerRepository.insertManyUnsafe(beersWithContainerTypes);
      await setPreference('all_beers_last_update', new Date().toISOString());
      await setPreference('all_beers_last_check', new Date().toISOString());
      allBeersResult = {
        success: true,
        dataUpdated: true,
        itemCount: validationResult.validBeers.length,
      };
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
      const myBeers = await fetchMyBeersFromAPI();

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

      // Calculate container types BEFORE insertion
      console.log('Sequential refresh: calculating container types for my beers...');
      const myBeersWithContainerTypes = calculateContainerTypes(
        validationResult.validBeers as Beer[]
      );

      // Add batch enrichment for my beers if proxy is configured
      let enrichedMyBeers = myBeersWithContainerTypes;
      if (config.enrichment.isConfigured() && myBeersWithContainerTypes.length > 0) {
        try {
          const beerIds = myBeersWithContainerTypes.map(beer => beer.id);
          console.log(
            `[sequentialRefresh] Fetching enrichment for ${beerIds.length} tasted beers...`
          );

          // Use fetchEnrichmentBatchWithMissing to also get IDs not in Worker database
          const { enrichments: enrichmentData, missing: missingIds } =
            await fetchEnrichmentBatchWithMissing(beerIds);
          const enrichedCount = Object.keys(enrichmentData).length;

          if (enrichedCount > 0) {
            console.log(`[sequentialRefresh] Got enrichment for ${enrichedCount} tasted beers`);
            enrichedMyBeers = mergeEnrichmentData(myBeersWithContainerTypes, enrichmentData);
          }

          // Sync missing beers to Worker for enrichment (in background)
          syncMissingBeersInBackground(missingIds, myBeersWithContainerTypes, 'sequentialRefresh');
        } catch (enrichmentError) {
          logWarning('Batch enrichment failed in sequential refresh, continuing without', {
            operation: 'sequentialRefreshAllData',
            component: 'dataUpdateService',
          });
        }
      }

      // Allow empty myBeers array (user may have no tasted beers)
      await myBeersRepository.insertManyUnsafe(enrichedMyBeers);
      await setPreference('my_beers_last_update', new Date().toISOString());
      await setPreference('my_beers_last_check', new Date().toISOString());
      myBeersResult = {
        success: true,
        dataUpdated: true,
        itemCount: validationResult.validBeers.length,
      };
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
      const rewards = await fetchRewardsFromAPI();
      await rewardsRepository.insertManyUnsafe(rewards);
      rewardsResult = {
        success: true,
        dataUpdated: true,
        itemCount: rewards.length,
      };
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
          result => result.error!.type === 'NETWORK_ERROR' || result.error!.type === 'TIMEOUT_ERROR'
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
  } finally {
    // Always release the master lock
    databaseLockManager.releaseLock('refresh-all-data-sequential');
  }
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
  myBeers: BeerfinderWithContainerType[];
  rewards: Reward[];
}> => {
  console.log('Refreshing all data from API...');

  // Check that API URLs are configured
  const apiUrlsConfigured = await areApiUrlsConfigured();
  if (!apiUrlsConfigured) {
    throw new Error('API URLs not configured. Please log in to set up API URLs.');
  }

  // Acquire master lock for entire sequence to avoid lock contention (CI-5 fix)
  await databaseLockManager.acquireLock('refresh-all-from-api');

  try {
    // Execute sequentially to avoid lock contention
    // Use unsafe repository methods since we already hold master lock

    // Get API URL to extract store ID for proxy
    const apiUrl = await getPreference('all_beers_api_url');
    const storeId = apiUrl ? extractStoreIdFromUrl(apiUrl) : null;

    // =========================================================================
    // ALL BEERS: Try proxy first, fall back to direct fetch
    // =========================================================================
    console.log('Fetching all beers from API...');
    let allBeersRaw: Beer[] = [];
    let usedProxy = false;

    if (storeId && config.enrichment.isConfigured()) {
      try {
        console.log(`[refreshAllDataFromAPI] Attempting proxy for store ${storeId}...`);
        const proxyResponse = await fetchBeersFromProxy(storeId);
        allBeersRaw = proxyResponse.beers.map(mapEnrichedBeerToAppBeer);
        usedProxy = true;
        console.log(`[refreshAllDataFromAPI] Got ${allBeersRaw.length} beers from proxy`);
      } catch (proxyError) {
        logWarning('Proxy failed in refreshAllDataFromAPI, falling back to direct fetch', {
          operation: 'refreshAllDataFromAPI',
          component: 'dataUpdateService',
          additionalData: {
            error: proxyError instanceof Error ? proxyError.message : String(proxyError),
          },
        });
      }
    }

    if (!usedProxy) {
      recordFallback(); // Track fallback for metrics (matches sequentialRefreshAllData pattern)
      allBeersRaw = await fetchBeersFromAPI();
    }

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
    const allBeersWithContainerTypes = calculateContainerTypes(
      allBeersValidation.validBeers as Beer[]
    );

    await beerRepository.insertManyUnsafe(allBeersWithContainerTypes);

    // =========================================================================
    // MY BEERS: Fetch from FS, then batch enrichment
    // =========================================================================
    console.log('Fetching my beers from API...');
    const myBeersRaw = await fetchMyBeersFromAPI();
    const myBeersValidation = validateBeerArray(myBeersRaw);

    if (myBeersValidation.invalidBeers.length > 0) {
      logWarning(`Skipping ${myBeersValidation.invalidBeers.length} invalid my beers`, {
        operation: 'refreshAllDataFromAPI',
        component: 'dataUpdateService',
        additionalData: { summary: myBeersValidation.summary },
      });
    }

    // Calculate container types for my beers BEFORE insertion
    console.log('Calculating container types for my beers...');
    const myBeersWithContainerTypes = calculateContainerTypes(
      myBeersValidation.validBeers as Beer[]
    );

    // Add batch enrichment for my beers if proxy is configured
    let enrichedMyBeers = myBeersWithContainerTypes;
    if (config.enrichment.isConfigured() && myBeersWithContainerTypes.length > 0) {
      try {
        const beerIds = myBeersWithContainerTypes.map(beer => beer.id);
        console.log(
          `[refreshAllDataFromAPI] Fetching enrichment for ${beerIds.length} tasted beers...`
        );

        // Use fetchEnrichmentBatchWithMissing to also get IDs not in Worker database
        const { enrichments: enrichmentData, missing: missingIds } =
          await fetchEnrichmentBatchWithMissing(beerIds);
        const enrichedCount = Object.keys(enrichmentData).length;

        if (enrichedCount > 0) {
          console.log(`[refreshAllDataFromAPI] Got enrichment for ${enrichedCount} tasted beers`);
          enrichedMyBeers = mergeEnrichmentData(myBeersWithContainerTypes, enrichmentData);
        }

        // Sync missing beers to Worker for enrichment (in background)
        syncMissingBeersInBackground(
          missingIds,
          myBeersWithContainerTypes,
          'refreshAllDataFromAPI'
        );
      } catch (enrichmentError) {
        logWarning('Batch enrichment failed in refreshAllDataFromAPI, continuing without', {
          operation: 'refreshAllDataFromAPI',
          component: 'dataUpdateService',
        });
      }
    }

    await myBeersRepository.insertManyUnsafe(enrichedMyBeers);

    console.log('Fetching rewards from API...');
    const rewards = await fetchRewardsFromAPI();
    await rewardsRepository.insertManyUnsafe(rewards);

    console.log(
      `Refreshed all data: ${allBeersWithContainerTypes.length} beers, ${enrichedMyBeers.length} tasted beers, ${rewards.length} rewards`
    );

    return {
      allBeers: allBeersWithContainerTypes,
      myBeers: enrichedMyBeers as BeerfinderWithContainerType[],
      rewards,
    };
  } finally {
    // Always release the master lock
    databaseLockManager.releaseLock('refresh-all-from-api');
  }
};
