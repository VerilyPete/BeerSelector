/**
 * Enrichment Service
 *
 * Communicates with the Cloudflare Worker enrichment API to fetch and merge
 * beer enrichment data (ABV, confidence scores, and source information).
 *
 * Features:
 * - Client ID management for per-device rate limiting
 * - Batch lookups with automatic chunking
 * - Client-side rate limiting to prevent API abuse
 * - Health checks and cache busting
 * - Metrics tracking for observability
 *
 * @module enrichmentService
 */

import { config } from '@/src/config';
import { getPreference, setPreference } from '@/src/database/preferences';
import { logWarning } from '@/src/utils/errorLogger';
import { BeerWithContainerType, BeerfinderWithContainerType } from '@/src/types/beer';

// Conditionally import expo-application only in React Native environment
let Application: { applicationId: string | null } | undefined;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Application = require('expo-application');
} catch {
  // expo-application not available (e.g., in Node.js tests)
  Application = undefined;
}

// ============================================================================
// Types
// ============================================================================

/**
 * Enrichment data returned by the Worker for a single beer
 */
export interface EnrichmentData {
  enriched_abv: number | null;
  enrichment_confidence: number | null;
  enrichment_source: 'description' | 'perplexity' | 'manual' | null;
}

/**
 * Beer response from Worker's GET /beers endpoint
 */
export interface EnrichedBeerResponse {
  id: string;
  brew_name: string;
  brewer: string;
  brewer_loc?: string;
  brew_style?: string;
  brew_container?: string;
  review_count?: string;
  review_rating?: string;
  brew_description?: string;
  added_date?: string;
  // Enrichment fields from Worker
  enriched_abv: number | null;
  enrichment_confidence: number | null;
  enrichment_source: 'description' | 'perplexity' | 'manual' | null;
}

/**
 * Response from GET /beers?sid={storeId}
 */
export interface BeersProxyResponse {
  success: boolean;
  storeId: string;
  beers: EnrichedBeerResponse[];
  total: number;
  requestId?: string;
  cached?: boolean;
  cacheAge?: number;
}

/**
 * Response from POST /beers/batch
 */
export interface BatchEnrichmentResponse {
  enrichments: Record<string, EnrichmentData>;
  requestId: string;
  found: number;
  notFound: number;
}

/**
 * Response from GET /health
 */
export interface HealthResponse {
  status: 'ok' | 'error';
  database: string;
  enrichment?: {
    enabled: boolean;
    daily: { used: number; limit: number; remaining: number };
    monthly: { used: number; limit: number; remaining: number };
  };
}

// ============================================================================
// Metrics & Observability
// ============================================================================

/**
 * Metrics tracked for enrichment service operations
 */
export interface EnrichmentMetrics {
  /** Total requests made to the proxy */
  proxyRequests: number;
  /** Successful proxy requests */
  proxySuccesses: number;
  /** Failed proxy requests (excluding rate limits) */
  proxyFailures: number;
  /** Rate limited requests */
  rateLimitedRequests: number;
  /** Fallback to direct API (when proxy fails) */
  fallbackCount: number;
  /** Total beers with enrichment data */
  enrichedBeerCount: number;
  /** Total beers without enrichment data */
  unenrichedBeerCount: number;
  /** Cache hits from proxy */
  cacheHits: number;
  /** Last reset timestamp */
  lastReset: number;
}

/** In-memory metrics storage */
let metrics: EnrichmentMetrics = {
  proxyRequests: 0,
  proxySuccesses: 0,
  proxyFailures: 0,
  rateLimitedRequests: 0,
  fallbackCount: 0,
  enrichedBeerCount: 0,
  unenrichedBeerCount: 0,
  cacheHits: 0,
  lastReset: Date.now(),
};

/**
 * Get current enrichment metrics for observability.
 *
 * @returns Current metrics snapshot
 * @example
 * ```typescript
 * const metrics = getEnrichmentMetrics();
 * console.log(`Success rate: ${metrics.proxySuccesses / metrics.proxyRequests * 100}%`);
 * ```
 */
export function getEnrichmentMetrics(): EnrichmentMetrics {
  return { ...metrics };
}

/**
 * Reset all enrichment metrics to zero.
 * Useful for starting fresh tracking periods.
 */
export function resetEnrichmentMetrics(): void {
  metrics = {
    proxyRequests: 0,
    proxySuccesses: 0,
    proxyFailures: 0,
    rateLimitedRequests: 0,
    fallbackCount: 0,
    enrichedBeerCount: 0,
    unenrichedBeerCount: 0,
    cacheHits: 0,
    lastReset: Date.now(),
  };
}

/**
 * Record that a fallback to direct API occurred.
 * Called by dataUpdateService when proxy fails and direct API is used.
 */
export function recordFallback(): void {
  metrics.fallbackCount++;
}

// ============================================================================
// Client-Side Rate Limiting
// ============================================================================

/**
 * Tracks request timestamps for rate limiting
 */
const requestTimestamps: number[] = [];

/**
 * Clean up expired timestamps from the rate limit window.
 * Uses O(1) amortized cleanup with findIndex + splice instead of O(n) shift loop.
 */
function cleanupExpiredTimestamps(): void {
  const { enrichment } = config;
  const now = Date.now();
  const windowStart = now - enrichment.rateLimitWindow;

  const firstValidIndex = requestTimestamps.findIndex(ts => ts >= windowStart);
  if (firstValidIndex > 0) {
    requestTimestamps.splice(0, firstValidIndex);
  } else if (firstValidIndex === -1) {
    requestTimestamps.length = 0;
  }
}

/**
 * Check if a specified number of requests are allowed under the client-side rate limit.
 *
 * @param count - Number of requests to check and record (default: 1)
 * @returns true if all requests are allowed, false if rate limited
 */
function isRequestAllowed(count: number = 1): boolean {
  const { enrichment } = config;

  // Clean up expired timestamps
  cleanupExpiredTimestamps();

  // Check if we have room for the requested number of operations
  if (requestTimestamps.length + count > enrichment.rateLimitMaxRequests) {
    return false;
  }

  // Record the requests
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    requestTimestamps.push(now);
  }
  return true;
}

/**
 * Sync client rate limit state when server returns 429.
 * Fills the rate limit window to prevent immediate retries.
 */
function syncRateLimitFromServer(): void {
  const { enrichment } = config;
  const now = Date.now();

  // Clean up first, then fill to max
  cleanupExpiredTimestamps();

  // Fill remaining slots to ensure we don't retry immediately
  while (requestTimestamps.length < enrichment.rateLimitMaxRequests) {
    requestTimestamps.push(now);
  }
}

/**
 * Get the time until the next request is allowed (in milliseconds).
 *
 * @returns Milliseconds until next allowed request, or 0 if allowed now
 */
export function getTimeUntilNextRequest(): number {
  const { enrichment } = config;

  // Clean up expired timestamps
  cleanupExpiredTimestamps();

  if (requestTimestamps.length < enrichment.rateLimitMaxRequests) {
    return 0;
  }

  // Return time until oldest request expires from window
  const now = Date.now();
  return requestTimestamps[0] + enrichment.rateLimitWindow - now;
}

/**
 * Reset the rate limit state for testing purposes.
 * Only exported for use in tests.
 */
export function __resetRateLimitStateForTests(): void {
  requestTimestamps.length = 0;
}

// ============================================================================
// Client ID Management
// ============================================================================

/**
 * Preference key for storing the client ID
 * Uses the existing preferences table via getPreference/setPreference
 */
const CLIENT_ID_PREFERENCE_KEY = 'enrichment_client_id';
let cachedClientId: string | null = null;

/**
 * Get or create a persistent client ID for rate limiting.
 *
 * Format: {appId}-{uuid}
 * Example: org.verily.FSbeerselector-a1b2c3d4-e5f6-7890-abcd-ef1234567890
 *
 * The client ID persists across app restarts and is used by the Worker
 * to track rate limits per device.
 *
 * Uses the existing preferences table (via getPreference/setPreference)
 * instead of adding a new AsyncStorage dependency.
 */
export async function getClientId(): Promise<string> {
  if (cachedClientId) {
    return cachedClientId;
  }

  try {
    let clientId = await getPreference(CLIENT_ID_PREFERENCE_KEY);

    if (!clientId) {
      // Generate UUID v4
      const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });

      const appId = Application?.applicationId || 'beerselector';
      clientId = `${appId}-${uuid}`;

      await setPreference(
        CLIENT_ID_PREFERENCE_KEY,
        clientId,
        'Unique client ID for enrichment service rate limiting'
      );
      console.log('[EnrichmentService] Generated new client ID');
    }

    cachedClientId = clientId;
    return clientId;
  } catch (error) {
    logWarning('Failed to get/create client ID, using fallback', {
      operation: 'getClientId',
      component: 'enrichmentService',
    });
    // Fallback if preferences access fails
    return `unknown-client-${Date.now()}`;
  }
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Fetch beers for a store from the enrichment proxy.
 *
 * The Worker fetches from Flying Saucer, merges enrichment data from D1,
 * and returns a unified response.
 *
 * @param storeId - Flying Saucer store ID (e.g., '13879' for Sugar Land)
 * @returns BeersProxyResponse with enriched beer data
 * @throws Error if request fails, rate limited, or returns non-200 status
 *
 * @example
 * ```typescript
 * const response = await fetchBeersFromProxy('13879');
 * console.log(`Got ${response.beers.length} beers, ${response.cached ? 'from cache' : 'fresh'}`);
 * ```
 */
export async function fetchBeersFromProxy(storeId: string): Promise<BeersProxyResponse> {
  const { enrichment } = config;

  if (!enrichment.isConfigured()) {
    throw new Error('Enrichment service not configured');
  }

  // Check client-side rate limit
  if (!isRequestAllowed()) {
    metrics.rateLimitedRequests++;
    const waitTime = getTimeUntilNextRequest();
    throw new Error(
      `Client rate limited while fetching beers for store ${storeId}. Try again in ${Math.ceil(waitTime / 1000)} seconds.`
    );
  }

  metrics.proxyRequests++;
  const clientId = await getClientId();
  const url = `${enrichment.getFullUrl('beers')}?sid=${storeId}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), enrichment.timeout);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-API-Key': enrichment.apiKey!,
        'X-Client-ID': clientId,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Log request ID for debugging
    const requestId = response.headers.get('X-Request-ID');
    if (requestId) {
      console.debug(`[EnrichmentService] Request ID: ${requestId}`);
    }

    // Handle server-side rate limiting
    if (response.status === 429) {
      metrics.rateLimitedRequests++;
      syncRateLimitFromServer(); // Sync client state to prevent immediate retries
      const retryAfter = response.headers.get('Retry-After') || '60';
      logWarning(
        `Rate limited by enrichment service while fetching beers for store ${storeId}. Retry after ${retryAfter}s`,
        {
          operation: 'fetchBeersFromProxy',
          component: 'enrichmentService',
          additionalData: { storeId, retryAfter },
        }
      );
      throw new Error(
        `Rate limited while fetching beers for store ${storeId}. Retry after ${retryAfter} seconds.`
      );
    }

    // Handle authentication errors
    if (response.status === 401) {
      metrics.proxyFailures++;
      throw new Error('Invalid API key for enrichment service');
    }

    // Handle other errors
    if (!response.ok) {
      metrics.proxyFailures++;
      throw new Error(`Enrichment service error: ${response.status} ${response.statusText}`);
    }

    const data: BeersProxyResponse = await response.json();

    // Track metrics
    metrics.proxySuccesses++;
    if (data.cached) {
      metrics.cacheHits++;
    }

    // Count enriched vs unenriched beers
    const enrichedCount = data.beers.filter(b => b.enriched_abv !== null).length;
    metrics.enrichedBeerCount += enrichedCount;
    metrics.unenrichedBeerCount += data.beers.length - enrichedCount;

    console.log(
      `[EnrichmentService] Fetched ${data.beers.length} beers for store ${storeId}${data.cached ? ' (cached)' : ''}`
    );

    return data;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Enrichment service request timed out');
    }

    throw error;
  }
}

/**
 * Fetch enrichment data for a batch of beer IDs.
 *
 * Useful for looking up enrichment for beers already in the local database
 * (e.g., tasted beers). Automatically chunks requests to respect the Worker's
 * batch size limit (default 100).
 *
 * @param beerIds - Array of beer IDs to look up
 * @returns Map of beer ID to enrichment data (missing IDs not included)
 *
 * @example
 * ```typescript
 * const enrichmentData = await fetchEnrichmentBatch(['123', '456', '789']);
 * const beer123Enrichment = enrichmentData['123'];
 * if (beer123Enrichment) {
 *   console.log(`ABV: ${beer123Enrichment.enriched_abv}`);
 * }
 * ```
 */
export async function fetchEnrichmentBatch(
  beerIds: string[]
): Promise<Record<string, EnrichmentData>> {
  const { enrichment } = config;

  if (!enrichment.isConfigured() || beerIds.length === 0) {
    return {};
  }

  // Chunk IDs into batches using config batch size
  const chunks: string[][] = [];
  for (let i = 0; i < beerIds.length; i += enrichment.batchSize) {
    chunks.push(beerIds.slice(i, i + enrichment.batchSize));
  }

  // FIX: Check if ALL chunks are allowed upfront to avoid race condition
  // where we check rate limit once but make multiple HTTP requests
  if (!isRequestAllowed(chunks.length)) {
    metrics.rateLimitedRequests++;
    const waitTime = getTimeUntilNextRequest();
    logWarning(
      `Client rate limited while batch enriching ${beerIds.length} beers (${chunks.length} chunks). Try again in ${Math.ceil(waitTime / 1000)} seconds.`,
      {
        operation: 'fetchEnrichmentBatch',
        component: 'enrichmentService',
        additionalData: { beerCount: beerIds.length, chunkCount: chunks.length },
      }
    );
    return {};
  }

  const results: Record<string, EnrichmentData> = {};
  const clientId = await getClientId();
  let successCount = 0;
  let failureCount = 0;

  // Process chunks sequentially to avoid rate limiting (Perplexity throttle)
  for (const chunk of chunks) {
    metrics.proxyRequests++; // Track per-chunk requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), enrichment.timeout);

    try {
      const response = await fetch(enrichment.getFullUrl('batch'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': enrichment.apiKey!,
          'X-Client-ID': clientId,
        },
        body: JSON.stringify({ ids: chunk }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle server-side rate limiting - stop processing further chunks
      if (response.status === 429) {
        metrics.rateLimitedRequests++;
        syncRateLimitFromServer(); // Sync client state to prevent immediate retries
        failureCount++;
        logWarning(
          `Batch enrichment rate limited at chunk ${successCount + failureCount}/${chunks.length}, returning partial results`,
          {
            operation: 'fetchEnrichmentBatch',
            component: 'enrichmentService',
            additionalData: { processedChunks: successCount, totalChunks: chunks.length },
          }
        );
        break;
      }

      if (!response.ok) {
        failureCount++;
        logWarning(`Batch enrichment chunk failed: ${response.status}`, {
          operation: 'fetchEnrichmentBatch',
          component: 'enrichmentService',
          additionalData: { chunkIndex: successCount + failureCount, status: response.status },
        });
        continue; // Try next chunk
      }

      const data: BatchEnrichmentResponse = await response.json();
      successCount++;

      // Merge results and track metrics
      const enrichmentCount = Object.keys(data.enrichments || {}).length;
      metrics.enrichedBeerCount += enrichmentCount;
      metrics.unenrichedBeerCount += chunk.length - enrichmentCount;

      Object.assign(results, data.enrichments || {});
    } catch (error) {
      clearTimeout(timeoutId);
      failureCount++;

      if (error instanceof Error && error.name === 'AbortError') {
        logWarning(
          `Batch enrichment request timed out for chunk ${successCount + failureCount}/${chunks.length}`,
          {
            operation: 'fetchEnrichmentBatch',
            component: 'enrichmentService',
            additionalData: { chunkIndex: successCount + failureCount },
          }
        );
        continue;
      }

      logWarning('Batch enrichment chunk failed', {
        operation: 'fetchEnrichmentBatch',
        component: 'enrichmentService',
        additionalData: { error: String(error), chunkIndex: successCount + failureCount },
      });
      break; // Stop on network errors
    }
  }

  // Track success/failure metrics per chunk processed
  metrics.proxySuccesses += successCount;
  metrics.proxyFailures += failureCount;

  return results;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Merge enrichment data into a list of beers.
 *
 * This is a helper function to avoid duplicating the enrichment merge logic
 * across different data update functions. It handles both BeerWithContainerType
 * and BeerfinderWithContainerType arrays.
 *
 * @param beers - Array of beers to enrich
 * @param enrichmentData - Map of beer ID to enrichment data
 * @returns New array with enrichment data merged in (original array unchanged)
 *
 * @example
 * ```typescript
 * const enrichmentData = await fetchEnrichmentBatch(beers.map(b => b.id));
 * const enrichedBeers = mergeEnrichmentData(beers, enrichmentData);
 * ```
 */
export function mergeEnrichmentData<T extends BeerWithContainerType | BeerfinderWithContainerType>(
  beers: T[],
  enrichmentData: Record<string, EnrichmentData>
): T[] {
  if (Object.keys(enrichmentData).length === 0) {
    return beers;
  }

  return beers.map(beer => {
    const enrichment = enrichmentData[beer.id];
    if (enrichment) {
      return {
        ...beer,
        abv: enrichment.enriched_abv ?? beer.abv,
        enrichment_confidence: enrichment.enrichment_confidence,
        enrichment_source: enrichment.enrichment_source,
      };
    }
    return beer;
  });
}

// ============================================================================
// Health & Cache Functions
// ============================================================================

/**
 * Check if the enrichment service is available.
 *
 * Performs a lightweight health check with a 3-second timeout.
 * Useful for checking service availability before making batch requests.
 *
 * @returns true if healthy, false otherwise
 *
 * @example
 * ```typescript
 * if (await checkEnrichmentHealth()) {
 *   const beers = await fetchBeersFromProxy(storeId);
 * }
 * ```
 */
export async function checkEnrichmentHealth(): Promise<boolean> {
  const { enrichment } = config;

  if (!enrichment.apiUrl) {
    return false;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    const response = await fetch(enrichment.getFullUrl('health'), {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return false;
    }

    const data: HealthResponse = await response.json();
    return data.status === 'ok';
  } catch {
    clearTimeout(timeoutId);
    return false;
  }
}

/**
 * Get detailed health information from the enrichment service.
 *
 * Returns quota information for Perplexity API usage (daily/monthly limits).
 * Useful for displaying service status in settings or diagnostics.
 *
 * @returns HealthResponse with enrichment limits, or null if unavailable
 *
 * @example
 * ```typescript
 * const health = await getEnrichmentHealthDetails();
 * if (health?.enrichment) {
 *   console.log(`Daily quota: ${health.enrichment.daily.remaining}/${health.enrichment.daily.limit}`);
 * }
 * ```
 */
export async function getEnrichmentHealthDetails(): Promise<HealthResponse | null> {
  const { enrichment } = config;

  if (!enrichment.apiUrl) {
    return null;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    const response = await fetch(enrichment.getFullUrl('health'), {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}

/**
 * Bust the cache for a specific store's taplist.
 *
 * Call this before refreshing to ensure fresh data from Flying Saucer.
 * Useful when user wants to see newly tapped beers immediately after
 * a known taplist update.
 *
 * @param storeId - Flying Saucer store ID (e.g., '13879' for Sugar Land)
 * @returns true if cache was cleared, false otherwise
 *
 * @example
 * ```typescript
 * // Before manual refresh, bust the cache to ensure fresh data
 * await bustTaplistCache('13879');
 * const beers = await fetchBeersFromProxy('13879');
 * ```
 */
export async function bustTaplistCache(storeId: string): Promise<boolean> {
  const { enrichment } = config;

  if (!enrichment.isConfigured()) {
    return false;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const clientId = await getClientId();
    const response = await fetch(`${enrichment.getFullUrl('cache')}?sid=${storeId}`, {
      method: 'DELETE',
      headers: {
        'X-API-Key': enrichment.apiKey!,
        'X-Client-ID': clientId,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = (await response.json()) as { cacheCleared: boolean };
      console.debug(`[EnrichmentService] Cache bust for store ${storeId}: ${data.cacheCleared}`);
      return data.cacheCleared;
    }

    return false;
  } catch (error) {
    clearTimeout(timeoutId);
    logWarning('Failed to bust cache', {
      operation: 'bustTaplistCache',
      component: 'enrichmentService',
      additionalData: { storeId, error: String(error) },
    });
    return false;
  }
}
