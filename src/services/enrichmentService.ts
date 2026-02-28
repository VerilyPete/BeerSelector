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

import { z } from 'zod';
import { config, assertEnrichmentConfigured } from '@/src/config';
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
// Zod Schemas (runtime validation at API trust boundaries)
// ============================================================================

const enrichmentDataSchema = z.object({
  enriched_abv: z.number().nullable(),
  enrichment_confidence: z.number().nullable(),
  enrichment_source: z.enum(['description', 'perplexity', 'manual']).nullable(),
  brew_description: z.string().nullable(),
  has_cleaned_description: z.boolean(),
});

const enrichedBeerResponseSchema = z.object({
  id: z.string(),
  brew_name: z.string(),
  brewer: z.string(),
  brewer_loc: z.string().optional(),
  brew_style: z.string().optional(),
  brew_container: z.string().optional(),
  review_count: z.string().optional(),
  review_rating: z.string().optional(),
  brew_description: z.string().optional(),
  added_date: z.string().optional(),
  enriched_abv: z.number().nullable(),
  enrichment_confidence: z.number().nullable(),
  enrichment_source: z.enum(['description', 'perplexity', 'manual']).nullable(),
});

const beersProxyResponseSchema = z.object({
  success: z.boolean(),
  storeId: z.string(),
  beers: z.array(enrichedBeerResponseSchema),
  total: z.number(),
  requestId: z.string().optional(),
  cached: z.boolean().optional(),
  cacheAge: z.number().optional(),
});

const batchEnrichmentResponseSchema = z.object({
  enrichments: z.record(z.string(), enrichmentDataSchema),
  missing: z.array(z.string()),
  requestId: z.string(),
});

const syncBeersResponseSchema = z.object({
  synced: z.number(),
  queued_for_cleanup: z.number(),
  requestId: z.string(),
  errors: z.array(z.string()).optional(),
});

const healthResponseSchema = z.object({
  status: z.enum(['ok', 'error']),
  database: z.string(),
  enrichment: z
    .object({
      enabled: z.boolean(),
      daily: z.object({ used: z.number(), limit: z.number(), remaining: z.number() }),
      monthly: z.object({ used: z.number(), limit: z.number(), remaining: z.number() }),
    })
    .optional(),
});

// ============================================================================
// Types
// ============================================================================

/**
 * Enrichment data returned by the Worker for a single beer
 * Note: Worker now returns merged description (consistent with GET /beers)
 */
export type EnrichmentData = z.infer<typeof enrichmentDataSchema>;

/**
 * Beer response from Worker's GET /beers endpoint
 */
export type EnrichedBeerResponse = z.infer<typeof enrichedBeerResponseSchema>;

/**
 * Response from GET /beers?sid={storeId}
 */
export type BeersProxyResponse = z.infer<typeof beersProxyResponseSchema>;

/**
 * Response from POST /beers/batch
 */
export type BatchEnrichmentResponse = z.infer<typeof batchEnrichmentResponseSchema>;

/**
 * Request body for POST /beers/sync
 * Accepts beer data from mobile client for syncing to enriched_beers table
 */
export type SyncBeersRequest = {
  beers: {
    id: string;
    brew_name: string;
    brewer?: string;
    brew_description?: string;
  }[];
};

/**
 * Response for POST /beers/sync
 * Returns counts of synced and queued beers
 */
export type SyncBeersResponse = z.infer<typeof syncBeersResponseSchema>;

/**
 * Response from GET /health
 */
export type HealthResponse = z.infer<typeof healthResponseSchema>;

// ============================================================================
// Metrics & Observability
// ============================================================================

/**
 * Metrics tracked for enrichment service operations
 */
export type EnrichmentMetrics = {
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
};

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

  assertEnrichmentConfigured(enrichment);

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
        'X-API-Key': enrichment.apiKey,
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

    const rawData: unknown = await response.json();
    const parseResult = beersProxyResponseSchema.safeParse(rawData);
    if (!parseResult.success) {
      metrics.proxyFailures++;
      throw new Error(
        `Enrichment service returned invalid response shape for store ${storeId}: ${parseResult.error.message}`
      );
    }
    const data = parseResult.data;

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

  assertEnrichmentConfigured(enrichment);

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
          'X-API-Key': enrichment.apiKey,
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

      const rawData: unknown = await response.json();
      const parseResult = batchEnrichmentResponseSchema.safeParse(rawData);
      if (!parseResult.success) {
        failureCount++;
        logWarning(`Batch enrichment chunk returned invalid response shape`, {
          operation: 'fetchEnrichmentBatch',
          component: 'enrichmentService',
          additionalData: { chunkIndex: successCount + failureCount, error: parseResult.error.message },
        });
        continue; // Try next chunk
      }
      const data = parseResult.data;
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

/**
 * Extended result from fetchEnrichmentBatchWithMissing
 * Includes both enrichment data and IDs not found in the Worker database
 */
export type EnrichmentBatchResult = {
  enrichments: Record<string, EnrichmentData>;
  missing: string[];
};

/**
 * Fetch enrichment data for a batch of beer IDs, including missing IDs.
 *
 * This is an extended version of fetchEnrichmentBatch that also returns
 * the IDs of beers that are not in the Worker's enriched_beers table.
 * These missing beers can then be synced to the Worker for enrichment.
 *
 * @param beerIds - Array of beer IDs to look up
 * @returns Object with enrichments map and array of missing IDs
 *
 * @example
 * ```typescript
 * const result = await fetchEnrichmentBatchWithMissing(['123', '456', '789']);
 * if (result.missing.length > 0) {
 *   // Sync missing beers to Worker
 *   const missingBeers = allBeers.filter(b => result.missing.includes(b.id));
 *   await syncBeersToWorker(missingBeers);
 * }
 * ```
 */
export async function fetchEnrichmentBatchWithMissing(
  beerIds: string[]
): Promise<EnrichmentBatchResult> {
  const { enrichment } = config;

  if (!enrichment.isConfigured() || beerIds.length === 0) {
    return { enrichments: {}, missing: [] };
  }

  assertEnrichmentConfigured(enrichment);

  // Chunk IDs into batches using config batch size
  const chunks: string[][] = [];
  for (let i = 0; i < beerIds.length; i += enrichment.batchSize) {
    chunks.push(beerIds.slice(i, i + enrichment.batchSize));
  }

  // Check if ALL chunks are allowed upfront
  if (!isRequestAllowed(chunks.length)) {
    metrics.rateLimitedRequests++;
    const waitTime = getTimeUntilNextRequest();
    logWarning(
      `Client rate limited while batch enriching ${beerIds.length} beers (${chunks.length} chunks). Try again in ${Math.ceil(waitTime / 1000)} seconds.`,
      {
        operation: 'fetchEnrichmentBatchWithMissing',
        component: 'enrichmentService',
        additionalData: { beerCount: beerIds.length, chunkCount: chunks.length },
      }
    );
    return { enrichments: {}, missing: [] };
  }

  const results: Record<string, EnrichmentData> = {};
  const allMissing: string[] = [];
  const clientId = await getClientId();
  let successCount = 0;
  let failureCount = 0;

  // Process chunks sequentially to avoid rate limiting
  for (const chunk of chunks) {
    metrics.proxyRequests++;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), enrichment.timeout);

    try {
      const response = await fetch(enrichment.getFullUrl('batch'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': enrichment.apiKey,
          'X-Client-ID': clientId,
        },
        body: JSON.stringify({ ids: chunk }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle server-side rate limiting
      if (response.status === 429) {
        metrics.rateLimitedRequests++;
        syncRateLimitFromServer();
        failureCount++;
        logWarning(
          `Batch enrichment rate limited at chunk ${successCount + failureCount}/${chunks.length}`,
          {
            operation: 'fetchEnrichmentBatchWithMissing',
            component: 'enrichmentService',
            additionalData: { processedChunks: successCount, totalChunks: chunks.length },
          }
        );
        break;
      }

      if (!response.ok) {
        failureCount++;
        logWarning(`Batch enrichment chunk failed: ${response.status}`, {
          operation: 'fetchEnrichmentBatchWithMissing',
          component: 'enrichmentService',
          additionalData: { chunkIndex: successCount + failureCount, status: response.status },
        });
        continue;
      }

      const rawData: unknown = await response.json();
      const parseResult = batchEnrichmentResponseSchema.safeParse(rawData);
      if (!parseResult.success) {
        failureCount++;
        logWarning(`Batch enrichment chunk returned invalid response shape`, {
          operation: 'fetchEnrichmentBatchWithMissing',
          component: 'enrichmentService',
          additionalData: { chunkIndex: successCount + failureCount, error: parseResult.error.message },
        });
        continue;
      }
      const data = parseResult.data;
      successCount++;

      // Merge results
      const enrichmentCount = Object.keys(data.enrichments || {}).length;
      metrics.enrichedBeerCount += enrichmentCount;
      metrics.unenrichedBeerCount += chunk.length - enrichmentCount;

      Object.assign(results, data.enrichments || {});

      // Collect missing IDs from this chunk
      if (data.missing && data.missing.length > 0) {
        allMissing.push(...data.missing);
      }
    } catch (error) {
      clearTimeout(timeoutId);
      failureCount++;

      if (error instanceof Error && error.name === 'AbortError') {
        logWarning(
          `Batch enrichment request timed out for chunk ${successCount + failureCount}/${chunks.length}`,
          {
            operation: 'fetchEnrichmentBatchWithMissing',
            component: 'enrichmentService',
            additionalData: { chunkIndex: successCount + failureCount },
          }
        );
        continue;
      }

      logWarning('Batch enrichment chunk failed', {
        operation: 'fetchEnrichmentBatchWithMissing',
        component: 'enrichmentService',
        additionalData: { error: String(error), chunkIndex: successCount + failureCount },
      });
      break;
    }
  }

  metrics.proxySuccesses += successCount;
  metrics.proxyFailures += failureCount;

  console.log(
    `[EnrichmentService] Batch enrichment complete: ${Object.keys(results).length} enriched, ${allMissing.length} missing`
  );

  return { enrichments: results, missing: allMissing };
}

/**
 * Sync missing beers to the Worker for enrichment.
 *
 * When batch enrichment returns missing IDs, the mobile client can sync
 * those beers to the Worker so they can be enriched (ABV lookup, description cleanup).
 *
 * @param beers - Array of beers to sync (should include id, brew_name, brewer, brew_description)
 * @returns SyncBeersResponse with sync counts, or null if sync failed
 *
 * @example
 * ```typescript
 * // After batch enrichment returns missing IDs
 * const missingBeers = allBeers.filter(b => missingIds.includes(b.id));
 * const syncResult = await syncBeersToWorker(missingBeers);
 * if (syncResult) {
 *   console.log(`Synced ${syncResult.synced} beers, ${syncResult.queued_for_cleanup} queued for cleanup`);
 * }
 * ```
 */
export async function syncBeersToWorker(
  beers: { id: string; brew_name: string; brewer?: string; brew_description?: string }[]
): Promise<SyncBeersResponse | null> {
  const { enrichment } = config;

  if (!enrichment.isConfigured() || beers.length === 0) {
    return null;
  }

  assertEnrichmentConfigured(enrichment);

  // Chunk beers into batches (sync endpoint has max 50 beers per request)
  const MAX_SYNC_BATCH_SIZE = 50;
  const chunks: (typeof beers)[] = [];
  for (let i = 0; i < beers.length; i += MAX_SYNC_BATCH_SIZE) {
    chunks.push(beers.slice(i, i + MAX_SYNC_BATCH_SIZE));
  }

  // Check client-side rate limit for all chunks upfront
  if (!isRequestAllowed(chunks.length)) {
    metrics.rateLimitedRequests++;
    const waitTime = getTimeUntilNextRequest();
    logWarning(
      `Client rate limited while syncing ${beers.length} beers (${chunks.length} chunks). Try again in ${Math.ceil(waitTime / 1000)} seconds.`,
      {
        operation: 'syncBeersToWorker',
        component: 'enrichmentService',
        additionalData: { beerCount: beers.length, chunkCount: chunks.length },
      }
    );
    return null;
  }

  const clientId = await getClientId();
  let totalSynced = 0;
  let totalQueuedForCleanup = 0;
  const allErrors: string[] = [];
  let lastRequestId = '';

  // Process chunks sequentially to avoid rate limiting
  for (const chunk of chunks) {
    metrics.proxyRequests++;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), enrichment.timeout);

    try {
      const requestBody: SyncBeersRequest = {
        beers: chunk.map(b => ({
          id: b.id,
          brew_name: b.brew_name,
          brewer: b.brewer,
          brew_description: b.brew_description,
        })),
      };

      const response = await fetch(enrichment.getFullUrl('sync'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': enrichment.apiKey,
          'X-Client-ID': clientId,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle server-side rate limiting - stop processing further chunks
      if (response.status === 429) {
        metrics.rateLimitedRequests++;
        syncRateLimitFromServer();
        logWarning('Sync rate limited, returning partial results', {
          operation: 'syncBeersToWorker',
          component: 'enrichmentService',
          additionalData: { syncedSoFar: totalSynced, totalBeers: beers.length },
        });
        break;
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        allErrors.push(`Sync failed: ${response.status} - ${errorText}`);
        logWarning(`Sync chunk failed: ${response.status}`, {
          operation: 'syncBeersToWorker',
          component: 'enrichmentService',
          additionalData: { status: response.status, error: errorText },
        });
        continue;
      }

      const rawData: unknown = await response.json();
      const parseResult = syncBeersResponseSchema.safeParse(rawData);
      if (!parseResult.success) {
        logWarning('Sync response has invalid shape, skipping chunk', {
          operation: 'syncBeersToWorker',
          component: 'enrichmentService',
          additionalData: { error: parseResult.error.message },
        });
        continue; // Graceful degradation: skip chunk with malformed response
      }
      const data = parseResult.data;
      totalSynced += data.synced;
      totalQueuedForCleanup += data.queued_for_cleanup;
      lastRequestId = data.requestId;

      if (data.errors && data.errors.length > 0) {
        allErrors.push(...data.errors);
      }

      metrics.proxySuccesses++;
    } catch (error) {
      clearTimeout(timeoutId);
      metrics.proxyFailures++;

      if (error instanceof Error && error.name === 'AbortError') {
        logWarning('Sync request timed out', {
          operation: 'syncBeersToWorker',
          component: 'enrichmentService',
        });
        allErrors.push('Sync request timed out');
        continue;
      }

      logWarning('Sync chunk failed', {
        operation: 'syncBeersToWorker',
        component: 'enrichmentService',
        additionalData: { error: String(error) },
      });
      allErrors.push(`Sync error: ${String(error)}`);
      break; // Stop on network errors
    }
  }

  console.log(
    `[EnrichmentService] Synced ${totalSynced} beers, ${totalQueuedForCleanup} queued for cleanup`
  );

  return {
    synced: totalSynced,
    queued_for_cleanup: totalQueuedForCleanup,
    requestId: lastRequestId,
    errors: allErrors.length > 0 ? allErrors : undefined,
  };
}

/**
 * Helper function to sleep for a given duration.
 * @param ms - Duration in milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Poll for enrichment updates with linear backoff with cap.
 *
 * After syncing beers to the Worker, this function polls the batch endpoint
 * to check when enrichment data becomes available (ABV lookup, description cleanup).
 *
 * Uses linear backoff with cap: 5s, 10s, 15s, 20s (max), repeating for up to 2 minutes.
 *
 * @param pendingIds - Beer IDs to poll for
 * @param maxDurationMs - Maximum polling duration (default: 120000ms = 2 minutes)
 * @returns Map of beer ID to enrichment data for beers that got enriched
 *
 * @example
 * ```typescript
 * // After syncing missing beers
 * const syncResult = await syncBeersToWorker(missingBeers);
 * if (syncResult && syncResult.queued_for_cleanup > 0) {
 *   const enrichedResults = await pollForEnrichmentUpdates(missingIds);
 *   // Update UI with enriched results
 * }
 * ```
 */
export async function pollForEnrichmentUpdates(
  pendingIds: string[],
  maxDurationMs: number = 120000
): Promise<Record<string, EnrichmentData>> {
  const { enrichment } = config;

  if (!enrichment.isConfigured() || pendingIds.length === 0) {
    return {};
  }

  const startTime = Date.now();
  const results: Record<string, EnrichmentData> = {};
  const remainingIds = new Set(pendingIds);

  // Linear backoff with cap: 5s, 10s, 15s, 20s, 20s, 20s...
  const baseDelay = 5000;
  const maxDelay = 20000;
  let attempt = 0;

  console.log(`[EnrichmentService] Starting polling for ${pendingIds.length} pending beers`);

  while (remainingIds.size > 0 && Date.now() - startTime < maxDurationMs) {
    // Calculate delay with linear backoff (capped at maxDelay)
    const delay = Math.min(baseDelay * (attempt + 1), maxDelay);
    await sleep(delay);
    attempt++;

    // Check if we've exceeded the time limit during sleep
    if (Date.now() - startTime >= maxDurationMs) {
      console.log(
        `[EnrichmentService] Polling timeout reached after ${attempt} attempts, ${remainingIds.size} IDs still pending`
      );
      break;
    }

    try {
      // Fetch current batch - use internal function to avoid rate limit overhead
      // since polling is already rate-limited by the backoff
      const response = await fetchEnrichmentBatchInternal(Array.from(remainingIds));

      // Update results and remove found IDs (those with actual enrichment data)
      for (const [id, data] of Object.entries(response)) {
        // Consider a beer "enriched" if it has ABV or description (Worker returns merged brew_description)
        if (data.enriched_abv !== null || data.brew_description !== null) {
          results[id] = data;
          remainingIds.delete(id);
        }
      }

      console.log(
        `[EnrichmentService] Polling attempt ${attempt}: ${Object.keys(results).length}/${pendingIds.length} complete, ${remainingIds.size} remaining`
      );

      // If all IDs are enriched, we're done
      if (remainingIds.size === 0) {
        console.log(`[EnrichmentService] All pending beers enriched after ${attempt} attempts`);
        break;
      }
    } catch (error) {
      logWarning(`Polling attempt ${attempt} failed`, {
        operation: 'pollForEnrichmentUpdates',
        component: 'enrichmentService',
        additionalData: { error: String(error), attempt },
      });
      // Continue polling despite errors
    }
  }

  console.log(
    `[EnrichmentService] Polling complete: ${Object.keys(results).length}/${pendingIds.length} beers enriched`
  );

  return results;
}

/**
 * Internal batch fetch function that bypasses rate limit checks.
 * Used by polling to avoid rate limit overhead since polling already
 * has linear backoff with cap built in.
 *
 * @param beerIds - Array of beer IDs to look up
 * @returns Map of beer ID to enrichment data
 */
async function fetchEnrichmentBatchInternal(
  beerIds: string[]
): Promise<Record<string, EnrichmentData>> {
  const { enrichment } = config;

  if (!enrichment.isConfigured() || beerIds.length === 0) {
    return {};
  }

  assertEnrichmentConfigured(enrichment);

  const clientId = await getClientId();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), enrichment.timeout);

  try {
    const response = await fetch(enrichment.getFullUrl('batch'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': enrichment.apiKey,
        'X-Client-ID': clientId,
      },
      body: JSON.stringify({ ids: beerIds }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {};
    }

    const rawData: unknown = await response.json();
    const parseResult = batchEnrichmentResponseSchema.safeParse(rawData);
    if (!parseResult.success) {
      return {};
    }
    return parseResult.data.enrichments || {};
  } catch {
    clearTimeout(timeoutId);
    return {};
  }
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
        // Worker now returns merged description (cleaned ?? original), fall back to beer's existing
        brew_description: enrichment.brew_description ?? beer.brew_description,
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

    const rawData: unknown = await response.json();
    const parseResult = healthResponseSchema.safeParse(rawData);
    if (!parseResult.success) {
      return false;
    }
    return parseResult.data.status === 'ok';
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

    const rawData: unknown = await response.json();
    const parseResult = healthResponseSchema.safeParse(rawData);
    if (!parseResult.success) {
      return null;
    }
    return parseResult.data;
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}
