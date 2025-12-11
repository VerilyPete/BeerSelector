# Phase 4: Mobile App Integration - Implementation Plan

## Overview

This document provides a step-by-step execution plan for integrating the BeerSelector mobile app with the Cloudflare Worker enrichment service. The goal is to switch the app from direct Flying Saucer API access to using the enrichment proxy, with graceful fallback if the Worker is unavailable.

**Worker URL:** `https://ufobeer.app`
**Current Schema Version:** v6
**Target Schema Version:** v7

## Architecture Summary

```
                       PRIMARY PATH                              FALLBACK PATH
                  +-----------------+                         +------------------+
                  |                 |                         |                  |
  Mobile App ---> | Cloudflare      | ---> Flying Saucer ---> | Mobile App       |
                  | Worker Proxy    |      API (upstream)     | Direct Fetch     |
                  |                 |                         |                  |
                  | + Enrichment    |                         | No enrichment    |
                  |   Data (D1)     |                         | (local ABV only) |
                  +-----------------+                         +------------------+
```

**Key Design Decisions:**

1. **Proxy pattern**: Worker fetches from Flying Saucer and merges enrichment data in response
2. **Graceful degradation**: App falls back to direct FS fetch if Worker unavailable
3. **Store-based fetching**: App must pass `sid` (store ID) to get location-specific taplist
4. **Persistent client ID**: For rate limiting tracking across sessions (stored in existing preferences table)
5. **No new dependencies**: Uses existing `getPreference`/`setPreference` for client ID storage instead of adding `@react-native-async-storage/async-storage`

---

## Prerequisites

Before starting implementation:

- [ ] Worker deployed to `https://ufobeer.app` (Phase 1-3 complete)
- [ ] API key generated for mobile app access
- [ ] Worker `/health` endpoint returns 200 OK

```bash
# Verify Worker is operational
curl https://ufobeer.app/health
# Expected: {"status":"ok","database":"connected","enrichment":{...}}
```

---

## Implementation Steps

### Step 1: Environment Variables

**File:** `/workspace/BeerSelector/.env.example`

Add these variables to the documentation template:

```bash
# =============================================================================
# Enrichment Service Configuration (Cloudflare Worker)
# =============================================================================

# Enrichment API Base URL
# Development: http://localhost:8787 (wrangler dev)
# Production: https://ufobeer.app
# EXPO_PUBLIC_ENRICHMENT_API_URL=https://ufobeer.app

# Enrichment API Key (required for authenticated requests)
# Get this from Cloudflare Worker secrets
# EXPO_PUBLIC_ENRICHMENT_API_KEY=your-api-key-here
```

**Create environment-specific files:**

```bash
# .env.development (for local development)
EXPO_PUBLIC_ENRICHMENT_API_URL=http://localhost:8787
EXPO_PUBLIC_ENRICHMENT_API_KEY=dev-api-key

# .env.production (for production builds)
EXPO_PUBLIC_ENRICHMENT_API_URL=https://ufobeer.app
EXPO_PUBLIC_ENRICHMENT_API_KEY=<production-api-key>
```

**Important:** Never commit `.env` files with actual API keys to version control.

---

### Step 2: Update Config Module

**File:** `/workspace/BeerSelector/src/config/config.ts`

**Changes needed:**

1. Add `EnrichmentConfig` interface
2. Add `enrichment` property to `AppConfig` interface
3. Add getter functions for enrichment configuration

**Code changes:**

Add after line ~58 (after `ExternalServices` interface):

```typescript
/**
 * Enrichment service configuration
 */
export interface EnrichmentConfig {
  apiUrl: string | undefined;
  apiKey: string | undefined;
  timeout: number;
  isConfigured: () => boolean;
  getFullUrl: (endpoint: 'beers' | 'batch' | 'health' | 'cache') => string;
}
```

Update `AppConfig` interface (around line ~77) to add enrichment property:

```typescript
export interface AppConfig {
  environment: AppEnvironment;
  api: ApiConfig;
  network: NetworkConfig;
  external: ExternalServices;
  enrichment: EnrichmentConfig; // Add this line
  getEnvironment: () => AppEnvironment;
  setEnvironment: (env: AppEnvironment) => void;
  setCustomApiUrl: (url: string) => void;
}
```

Add enrichment endpoint constants after `API_ENDPOINTS` (around line ~273):

```typescript
/**
 * Enrichment service endpoint paths
 */
const ENRICHMENT_ENDPOINTS = {
  beers: '/beers', // GET /beers?sid={storeId}
  batch: '/beers/batch', // POST /beers/batch
  health: '/health', // GET /health
  cache: '/cache', // DELETE /cache?sid={storeId}
} as const;

type EnrichmentEndpoint = keyof typeof ENRICHMENT_ENDPOINTS;
```

Add helper functions for enrichment configuration (around line ~310):

```typescript
/**
 * Gets enrichment configuration dynamically from environment variables
 * This allows tests to set env vars and have them picked up immediately
 * @returns EnrichmentConfig object
 */
function getEnrichmentConfig(): EnrichmentConfig {
  const apiUrl = process.env.EXPO_PUBLIC_ENRICHMENT_API_URL?.replace(/\/$/, '');
  const apiKey = process.env.EXPO_PUBLIC_ENRICHMENT_API_KEY;

  return {
    apiUrl,
    apiKey,
    timeout: getEnvNumber('EXPO_PUBLIC_ENRICHMENT_TIMEOUT', 15000),
    isConfigured: () => Boolean(apiUrl && apiKey),
    getFullUrl: (endpoint: EnrichmentEndpoint) => {
      if (!apiUrl) {
        throw new Error('Enrichment API URL not configured');
      }
      return `${apiUrl}${ENRICHMENT_ENDPOINTS[endpoint]}`;
    },
  };
}
```

Update the main `config` object (around line ~417) to add enrichment getter:

```typescript
export const config: AppConfig = {
  // ... existing properties ...

  /**
   * Enrichment service configuration (dynamic getter)
   */
  get enrichment(): EnrichmentConfig {
    return getEnrichmentConfig();
  },

  // ... rest of existing properties ...
};
```

---

### Step 3: Create Enrichment Service

**File:** `/workspace/BeerSelector/src/services/enrichmentService.ts` (NEW FILE)

This service handles communication with the Cloudflare Worker.

```typescript
/**
 * Enrichment Service
 *
 * Communicates with the Cloudflare Worker enrichment API.
 * Provides client ID management, batch lookups, health checks, and cache busting.
 */

import * as Application from 'expo-application';
import { config } from '@/src/config';
import { getPreference, setPreference } from '@/src/database/preferences';
import { logError, logWarning } from '@/src/utils/errorLogger';

// ============================================================================
// Types
// ============================================================================

/**
 * Enrichment data returned by the Worker for a single beer
 */
export interface EnrichmentData {
  enriched_abv: number | null;
  enrichment_confidence: number | null;
  enrichment_source: 'perplexity' | 'manual' | null;
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
  enrichment_source: 'perplexity' | 'manual' | null;
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

      const appId = Application.applicationId || 'beerselector';
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
 * @throws Error if request fails or returns non-200 status
 */
export async function fetchBeersFromProxy(storeId: string): Promise<BeersProxyResponse> {
  const { enrichment, network } = config;

  if (!enrichment.isConfigured()) {
    throw new Error('Enrichment service not configured');
  }

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

    // Handle rate limiting
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After') || '60';
      logWarning(`Rate limited by enrichment service. Retry after ${retryAfter}s`, {
        operation: 'fetchBeersFromProxy',
        component: 'enrichmentService',
        additionalData: { storeId, retryAfter },
      });
      throw new Error(`Rate limited. Retry after ${retryAfter} seconds.`);
    }

    // Handle authentication errors
    if (response.status === 401) {
      throw new Error('Invalid API key for enrichment service');
    }

    // Handle other errors
    if (!response.ok) {
      throw new Error(`Enrichment service error: ${response.status} ${response.statusText}`);
    }

    const data: BeersProxyResponse = await response.json();

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
 * Useful for looking up enrichment for beers already in the local database.
 * Automatically chunks requests to respect the Worker's 100 ID limit.
 *
 * @param beerIds - Array of beer IDs to look up
 * @returns Map of beer ID to enrichment data (missing IDs not included)
 */
export async function fetchEnrichmentBatch(
  beerIds: string[]
): Promise<Record<string, EnrichmentData>> {
  const { enrichment } = config;

  if (!enrichment.isConfigured() || beerIds.length === 0) {
    return {};
  }

  const BATCH_SIZE = 100; // Worker limit
  const results: Record<string, EnrichmentData> = {};

  // Chunk IDs into batches
  const chunks: string[][] = [];
  for (let i = 0; i < beerIds.length; i += BATCH_SIZE) {
    chunks.push(beerIds.slice(i, i + BATCH_SIZE));
  }

  const clientId = await getClientId();

  // Process chunks sequentially to avoid rate limiting
  for (const chunk of chunks) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

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

      // Handle rate limiting - stop processing further chunks
      if (response.status === 429) {
        logWarning('Batch enrichment rate limited, returning partial results', {
          operation: 'fetchEnrichmentBatch',
          component: 'enrichmentService',
        });
        break;
      }

      if (!response.ok) {
        logWarning(`Batch enrichment failed: ${response.status}`, {
          operation: 'fetchEnrichmentBatch',
          component: 'enrichmentService',
        });
        continue; // Try next chunk
      }

      const data: BatchEnrichmentResponse = await response.json();

      // Merge results
      Object.assign(results, data.enrichments || {});
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        logWarning('Batch enrichment request timed out', {
          operation: 'fetchEnrichmentBatch',
          component: 'enrichmentService',
        });
        continue;
      }

      logWarning('Batch enrichment chunk failed', {
        operation: 'fetchEnrichmentBatch',
        component: 'enrichmentService',
        additionalData: { error: String(error) },
      });
      break; // Stop on network errors
    }
  }

  return results;
}

/**
 * Check if the enrichment service is available.
 *
 * @returns true if healthy, false otherwise
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
 * @returns HealthResponse with enrichment limits, or null if unavailable
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
 * Useful when user wants to see newly tapped beers immediately.
 *
 * @param storeId - Flying Saucer store ID
 * @returns true if cache was cleared, false otherwise
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
```

---

### Step 4: Update Types (beer.ts)

**File:** `/workspace/BeerSelector/src/types/beer.ts`

Add enrichment fields to all beer-related interfaces and update type guards.

#### 4.1: Update Beer Interface

After line 21 (after `abv?: number | null;`), add enrichment fields:

```typescript
  // Enrichment fields (from Cloudflare Worker)
  enrichment_confidence?: number | null;
  enrichment_source?: 'perplexity' | 'manual' | null;
```

#### 4.2: Full Updated File

Replace the entire file with this complete, copy-pasteable code:

```typescript
/**
 * Types related to beer data in the application
 */

import { ContainerType } from '@/src/utils/beerGlassType';

/**
 * Valid enrichment source values
 */
export type EnrichmentSource = 'perplexity' | 'manual' | null;

/**
 * Base Beer interface representing a beer in the system
 */
export interface Beer {
  id: string;
  brew_name: string;
  brewer?: string;
  brewer_loc?: string;
  brew_style?: string;
  brew_container?: string;
  review_count?: string;
  review_rating?: string;
  brew_description?: string;
  added_date?: string;
  abv?: number | null;
  // Enrichment fields (from Cloudflare Worker)
  enrichment_confidence?: number | null;
  enrichment_source?: EnrichmentSource;
}

/**
 * Beer with container type property (after database fetch)
 * The container_type field is always present after schema v4 migration,
 * but its value can be null for beers where we can't determine the container:
 * - Draft beers without detectable ABV or 13oz/16oz size marker
 * - Container types we don't recognize
 *
 * Container types: 'pint', 'tulip', 'can', 'bottle', 'flight', or null (no icon shown)
 *
 * Enrichment fields are inherited from Beer and explicitly typed here for clarity.
 */
export interface BeerWithContainerType extends Beer {
  container_type: ContainerType; // Field present, value can be null
  // Enrichment fields explicitly typed (inherited from Beer, made required with nullable values)
  enrichment_confidence: number | null;
  enrichment_source: EnrichmentSource;
}

/**
 * Beerfinder interface representing a tasted beer with additional properties
 */
export interface Beerfinder extends Beer {
  roh_lap?: string;
  tasted_date?: string;
  review_ratings?: string;
  chit_code?: string;
}

/**
 * Beerfinder with container type (after database fetch)
 * Combines Beerfinder properties with container_type property
 * (container_type can be null for unrecognized container types)
 *
 * Enrichment fields are inherited and explicitly typed here for clarity.
 */
export interface BeerfinderWithContainerType extends BeerWithContainerType {
  roh_lap?: string;
  tasted_date?: string;
  review_ratings?: string;
  chit_code?: string;
}

/**
 * BeerDetails interface for detailed beer information
 * Note: abv is inherited from Beer as number | null, not overridden as string
 */
export interface BeerDetails extends Beer {
  ibu?: string;
  availability?: string;
  seasonal?: boolean;
  origin_country?: string;
  untappd_rating?: string;
  untappd_ratings_count?: number;
}

/**
 * CheckInRequestData interface for beer check-in requests
 */
export interface CheckInRequestData {
  chitCode: string;
  chitBrewId: string;
  chitBrewName: string;
  chitStoreName: string;
}

/**
 * CheckInResponse interface for beer check-in responses
 */
export interface CheckInResponse {
  success: boolean;
  message?: string;
  rawResponse?: string;
  error?: string;
}

/**
 * Type guard to check if an object is a Beer
 * @param obj The object to check
 * @returns True if the object is a Beer, false otherwise
 */
export function isBeer(obj: unknown): obj is Beer {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;

  // Required fields
  if (typeof o.id !== 'string' || typeof o.brew_name !== 'string') {
    return false;
  }

  // Validate enrichment_source if present
  if (o.enrichment_source !== undefined && o.enrichment_source !== null) {
    if (o.enrichment_source !== 'perplexity' && o.enrichment_source !== 'manual') {
      return false;
    }
  }

  // Validate enrichment_confidence if present (should be number or null)
  if (o.enrichment_confidence !== undefined && o.enrichment_confidence !== null) {
    if (typeof o.enrichment_confidence !== 'number') {
      return false;
    }
  }

  return true;
}

/**
 * Type guard to check if an object is a Beerfinder
 * @param obj The object to check
 * @returns True if the object is a Beerfinder, false otherwise
 */
export function isBeerfinder(obj: unknown): obj is Beerfinder {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Beer & Record<string, unknown>;
  return (
    isBeer(obj) &&
    (o.roh_lap !== undefined ||
      o.tasted_date !== undefined ||
      o.review_ratings !== undefined ||
      o.chit_code !== undefined)
  );
}

/**
 * Type guard to check if an object is a BeerDetails
 * @param obj The object to check
 * @returns True if the object is a BeerDetails, false otherwise
 */
export function isBeerDetails(obj: unknown): obj is BeerDetails {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Beer & Record<string, unknown>;
  return (
    isBeer(obj) &&
    (o.abv !== undefined ||
      o.ibu !== undefined ||
      o.availability !== undefined ||
      o.seasonal !== undefined ||
      o.origin_country !== undefined ||
      o.untappd_rating !== undefined ||
      o.untappd_ratings_count !== undefined)
  );
}

/**
 * Type guard to check if an object is a BeerWithContainerType
 * @param obj The object to check
 * @returns True if the object is a BeerWithContainerType, false otherwise
 */
export function isBeerWithContainerType(obj: unknown): obj is BeerWithContainerType {
  if (!isBeer(obj)) return false;

  const beer = obj as Record<string, unknown>;

  // container_type must be present and valid
  const validTypes = ['pint', 'tulip', 'can', 'bottle', 'flight', null];
  if (!validTypes.includes(beer.container_type as string | null)) {
    return false;
  }

  // For BeerWithContainerType, enrichment fields should be present (can be null)
  // They are inherited from Beer but made required with nullable values
  if (!('enrichment_confidence' in beer) || !('enrichment_source' in beer)) {
    return false;
  }

  // Validate enrichment_source value if not null
  if (beer.enrichment_source !== null) {
    if (beer.enrichment_source !== 'perplexity' && beer.enrichment_source !== 'manual') {
      return false;
    }
  }

  return true;
}

/**
 * Type guard to check if an object is a BeerfinderWithContainerType
 * @param obj The object to check
 * @returns True if the object is a BeerfinderWithContainerType, false otherwise
 */
export function isBeerfinderWithContainerType(obj: unknown): obj is BeerfinderWithContainerType {
  if (!isBeerWithContainerType(obj)) return false;
  if (!isBeerfinder(obj)) return false;
  return true;
}

/**
 * Type guard to check if an object is a CheckInResponse
 * @param obj The object to check
 * @returns True if the object is a CheckInResponse, false otherwise
 */
export function isCheckInResponse(obj: unknown): obj is CheckInResponse {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  return typeof o.success === 'boolean';
}
```

---

### Step 5: Database Schema Migration (v7)

#### 5.1: Update Schema Version

**File:** `/workspace/BeerSelector/src/database/schemaVersion.ts`

Change line 3:

```typescript
export const CURRENT_SCHEMA_VERSION = 7;
```

#### 5.2: Create Migration File

**File:** `/workspace/BeerSelector/src/database/migrations/migrateToV7.ts` (NEW FILE)

```typescript
import { SQLiteDatabase } from 'expo-sqlite';
import { recordMigration } from '../schemaVersion';
import { databaseLockManager } from '../DatabaseLockManager';

/**
 * Progress callback for migration (optional)
 */
export type MigrationProgressCallback = (current: number, total: number) => void;

/**
 * Migration to version 7: Add enrichment columns to beer tables
 *
 * Adds columns to store enrichment data from the Cloudflare Worker:
 * - enrichment_confidence: REAL (0.0 to 1.0, nullable)
 * - enrichment_source: TEXT ('perplexity', 'manual', or NULL)
 *
 * Note: is_enrichment_verified is NOT added - we track this via enrichment_source='manual'
 *
 * Changes to allbeers table only (tasted_brew_current_round inherits enrichment
 * from allbeers when beers are tasted).
 */
export async function migrateToVersion7(
  database: SQLiteDatabase,
  onProgress?: MigrationProgressCallback
): Promise<void> {
  console.log('[Migration v7] Starting migration to schema version 7...');

  // Acquire master lock to prevent concurrent data operations
  const lockId = 'schema-migration-v7';
  await databaseLockManager.acquireLock(lockId);

  try {
    // =========================================================================
    // IMPORTANT: All PRAGMA queries MUST be outside the transaction
    // PRAGMA statements don't work correctly inside transactions in SQLite
    // =========================================================================

    // Check if columns already exist in allbeers (for safety/idempotency)
    const tableInfo = await database.getAllAsync<{ name: string }>('PRAGMA table_info(allbeers)');
    const existingColumns = new Set(tableInfo.map(col => col.name));
    console.log('[Migration v7] Current allbeers columns:', Array.from(existingColumns));

    // Check if columns already exist in tasted_brew_current_round
    const tastedTableInfo = await database.getAllAsync<{ name: string }>(
      'PRAGMA table_info(tasted_brew_current_round)'
    );
    const tastedColumns = new Set(tastedTableInfo.map(col => col.name));
    console.log(
      '[Migration v7] Current tasted_brew_current_round columns:',
      Array.from(tastedColumns)
    );

    // =========================================================================
    // Now run the actual migration inside a transaction
    // =========================================================================
    await database.withTransactionAsync(async () => {
      // Add enrichment_confidence column to allbeers if not exists
      if (!existingColumns.has('enrichment_confidence')) {
        console.log('[Migration v7] Adding enrichment_confidence column to allbeers...');
        await database.execAsync(
          'ALTER TABLE allbeers ADD COLUMN enrichment_confidence REAL DEFAULT NULL'
        );
        console.log('[Migration v7] Added enrichment_confidence column');
      } else {
        console.log('[Migration v7] enrichment_confidence column already exists, skipping');
      }

      // Add enrichment_source column to allbeers if not exists
      if (!existingColumns.has('enrichment_source')) {
        console.log('[Migration v7] Adding enrichment_source column to allbeers...');
        await database.execAsync(
          'ALTER TABLE allbeers ADD COLUMN enrichment_source TEXT DEFAULT NULL'
        );
        console.log('[Migration v7] Added enrichment_source column');
      } else {
        console.log('[Migration v7] enrichment_source column already exists, skipping');
      }

      // Add enrichment_confidence column to tasted_brew_current_round if not exists
      if (!tastedColumns.has('enrichment_confidence')) {
        console.log(
          '[Migration v7] Adding enrichment_confidence column to tasted_brew_current_round...'
        );
        await database.execAsync(
          'ALTER TABLE tasted_brew_current_round ADD COLUMN enrichment_confidence REAL DEFAULT NULL'
        );
      }

      // Add enrichment_source column to tasted_brew_current_round if not exists
      if (!tastedColumns.has('enrichment_source')) {
        console.log(
          '[Migration v7] Adding enrichment_source column to tasted_brew_current_round...'
        );
        await database.execAsync(
          'ALTER TABLE tasted_brew_current_round ADD COLUMN enrichment_source TEXT DEFAULT NULL'
        );
      }

      // Record migration
      await recordMigration(database, 7);

      console.log('[Migration v7] Migration to version 7 complete');
    });

    // Call progress callback if provided (for UI feedback)
    if (onProgress) {
      onProgress(1, 1);
    }
  } finally {
    databaseLockManager.releaseLock(lockId);
  }
}
```

#### 5.3: Update Schema Runner

**File:** `/workspace/BeerSelector/src/database/schema.ts`

Add migration call in `runMigrations` function (after line 256, after v6 migration):

```typescript
// Run migration to v7 (add enrichment columns)
if (fromVersion < 7) {
  const { migrateToVersion7 } = await import('./migrations/migrateToV7');
  await migrateToVersion7(database);
  console.log('Migration to version 7 complete');
}
```

#### 5.4: Update Table Creation Schema

**File:** `/workspace/BeerSelector/src/database/schema.ts`

Update `CREATE_ALLBEERS_TABLE` (around line 21):

```typescript
export const CREATE_ALLBEERS_TABLE = `
  CREATE TABLE IF NOT EXISTS allbeers (
    id TEXT PRIMARY KEY,
    added_date TEXT,
    brew_name TEXT,
    brewer TEXT,
    brewer_loc TEXT,
    brew_style TEXT,
    brew_container TEXT,
    review_count TEXT,
    review_rating TEXT,
    brew_description TEXT,
    container_type TEXT,
    abv REAL,
    enrichment_confidence REAL,
    enrichment_source TEXT
  )
`;
```

Update `CREATE_TASTED_BREW_TABLE` (around line 47):

```typescript
export const CREATE_TASTED_BREW_TABLE = `
  CREATE TABLE IF NOT EXISTS tasted_brew_current_round (
    id TEXT PRIMARY KEY,
    roh_lap TEXT,
    tasted_date TEXT,
    brew_name TEXT,
    brewer TEXT,
    brewer_loc TEXT,
    brew_style TEXT,
    brew_container TEXT,
    review_count TEXT,
    review_ratings TEXT,
    brew_description TEXT,
    chit_code TEXT,
    container_type TEXT,
    abv REAL,
    enrichment_confidence REAL,
    enrichment_source TEXT
  )
`;
```

---

### Step 6: Update Schema Types (Zod Validation)

**File:** `/workspace/BeerSelector/src/database/schemaTypes.ts`

This step provides complete, copy-pasteable code for all schema changes including Zod schemas and conversion functions.

#### 6.1: Complete allBeersRowSchema with Enrichment Fields

Replace the existing `allBeersRowSchema` (around line 52) with this complete schema:

```typescript
/**
 * Zod schema for allbeers table rows
 *
 * Matches SQL schema (v7):
 * CREATE TABLE IF NOT EXISTS allbeers (
 *   id TEXT PRIMARY KEY,
 *   added_date TEXT,
 *   brew_name TEXT,
 *   brewer TEXT,
 *   brewer_loc TEXT,
 *   brew_style TEXT,
 *   brew_container TEXT,
 *   review_count TEXT,
 *   review_rating TEXT,
 *   brew_description TEXT,
 *   container_type TEXT,
 *   abv REAL,
 *   enrichment_confidence REAL,
 *   enrichment_source TEXT
 * )
 *
 * Required fields: id, brew_name (non-empty)
 * All fields are TEXT in SQLite, optional fields default to empty string
 */
export const allBeersRowSchema = z.object({
  id: z
    .union([z.string(), z.number()])
    .refine(val => val !== null && val !== undefined && val !== '', {
      message: 'id must not be empty',
    }),
  added_date: z.string().optional(),
  brew_name: z.string().min(1, 'brew_name must not be empty'),
  brewer: z.string().optional(),
  brewer_loc: z.string().optional(),
  brew_style: z.string().optional(),
  brew_container: z.string().optional(),
  review_count: z.string().optional(),
  review_rating: z.string().optional(),
  brew_description: z.string().optional(),
  container_type: z
    .union([
      z.literal('pint'),
      z.literal('tulip'),
      z.literal('can'),
      z.literal('bottle'),
      z.literal('flight'),
      z.null(),
    ])
    .optional(),
  abv: z.number().nullable().optional(),
  // Enrichment fields (added in schema v7)
  enrichment_confidence: z.number().nullable().optional(),
  enrichment_source: z.union([z.literal('perplexity'), z.literal('manual'), z.null()]).optional(),
});
```

#### 6.2: Complete allBeersRowToBeerWithContainerType Function

Replace the existing function (around line 119) with this complete version:

```typescript
/**
 * Convert AllBeersRow to BeerWithContainerType domain model
 * Used after schema v4 migration when container_type is guaranteed to be present
 *
 * Includes enrichment fields (added in schema v7)
 */
export function allBeersRowToBeerWithContainerType(row: AllBeersRow): BeerWithContainerType {
  return {
    id: typeof row.id === 'number' ? String(row.id) : row.id,
    added_date: row.added_date,
    brew_name: row.brew_name,
    brewer: row.brewer,
    brewer_loc: row.brewer_loc,
    brew_style: row.brew_style,
    brew_container: row.brew_container,
    review_count: row.review_count,
    review_rating: row.review_rating,
    brew_description: row.brew_description,
    container_type: (row.container_type ?? null) as ContainerType,
    abv: row.abv ?? null,
    // Enrichment fields (default to null if not present)
    enrichment_confidence: row.enrichment_confidence ?? null,
    enrichment_source: row.enrichment_source ?? null,
  };
}
```

#### 6.3: Complete tastedBrewRowSchema with Enrichment Fields

Replace the existing `tastedBrewRowSchema` (around line 163) with this complete schema:

```typescript
/**
 * Zod schema for tasted_brew_current_round table rows
 *
 * Matches SQL schema (v7):
 * CREATE TABLE IF NOT EXISTS tasted_brew_current_round (
 *   id TEXT PRIMARY KEY,
 *   roh_lap TEXT,
 *   tasted_date TEXT,
 *   brew_name TEXT,
 *   brewer TEXT,
 *   brewer_loc TEXT,
 *   brew_style TEXT,
 *   brew_container TEXT,
 *   review_count TEXT,
 *   review_ratings TEXT,
 *   brew_description TEXT,
 *   chit_code TEXT,
 *   container_type TEXT,
 *   abv REAL,
 *   enrichment_confidence REAL,
 *   enrichment_source TEXT
 * )
 *
 * Required fields: id, brew_name (non-empty)
 * Note: Field is "review_ratings" (plural) in this table vs "review_rating" in allbeers
 */
export const tastedBrewRowSchema = z.object({
  id: z.string().min(1, 'id must not be empty'),
  roh_lap: z.string().optional(),
  tasted_date: z.string().optional(),
  brew_name: z.string().min(1, 'brew_name must not be empty'),
  brewer: z.string().optional(),
  brewer_loc: z.string().optional(),
  brew_style: z.string().optional(),
  brew_container: z.string().optional(),
  review_count: z.string().optional(),
  review_ratings: z.string().optional(),
  brew_description: z.string().optional(),
  chit_code: z.string().optional(),
  container_type: z
    .union([
      z.literal('pint'),
      z.literal('tulip'),
      z.literal('can'),
      z.literal('bottle'),
      z.literal('flight'),
      z.null(),
    ])
    .optional(),
  abv: z.number().nullable().optional(),
  // Enrichment fields (added in schema v7)
  enrichment_confidence: z.number().nullable().optional(),
  enrichment_source: z.union([z.literal('perplexity'), z.literal('manual'), z.null()]).optional(),
});
```

#### 6.4: Complete tastedBrewRowToBeerfinderWithContainerType Function

Replace the existing function (around line 226) with this complete version:

```typescript
/**
 * Convert TastedBrewRow to BeerfinderWithContainerType domain model
 * Used after schema v4 migration when container_type is guaranteed to be present
 *
 * Includes enrichment fields (added in schema v7)
 */
export function tastedBrewRowToBeerfinderWithContainerType(
  row: TastedBrewRow
): BeerfinderWithContainerType {
  return {
    id: row.id,
    roh_lap: row.roh_lap,
    tasted_date: row.tasted_date,
    brew_name: row.brew_name,
    brewer: row.brewer,
    brewer_loc: row.brewer_loc,
    brew_style: row.brew_style,
    brew_container: row.brew_container,
    review_count: row.review_count,
    review_ratings: row.review_ratings,
    brew_description: row.brew_description,
    chit_code: row.chit_code,
    container_type: (row.container_type ?? null) as ContainerType,
    abv: row.abv ?? null,
    // Enrichment fields (default to null if not present)
    enrichment_confidence: row.enrichment_confidence ?? null,
    enrichment_source: row.enrichment_source ?? null,
  };
}
```

#### 6.5: Update allBeersRowToBeer Function (Optional)

If you want the base `allBeersRowToBeer` function to also include enrichment fields:

```typescript
/**
 * Convert AllBeersRow to Beer domain model
 * Currently they have the same structure, but this provides
 * a clear separation between database and domain layers
 *
 * Includes optional enrichment fields (added in schema v7)
 */
export function allBeersRowToBeer(row: AllBeersRow): Beer {
  return {
    id: typeof row.id === 'number' ? String(row.id) : row.id,
    added_date: row.added_date,
    brew_name: row.brew_name,
    brewer: row.brewer,
    brewer_loc: row.brewer_loc,
    brew_style: row.brew_style,
    brew_container: row.brew_container,
    review_count: row.review_count,
    review_rating: row.review_rating,
    brew_description: row.brew_description,
    abv: row.abv,
    // Enrichment fields (optional on Beer interface)
    enrichment_confidence: row.enrichment_confidence,
    enrichment_source: row.enrichment_source,
  };
}
```

#### 6.6: Update tastedBrewRowToBeerfinder Function (Optional)

```typescript
/**
 * Convert TastedBrewRow to Beerfinder domain model
 *
 * Includes optional enrichment fields (added in schema v7)
 */
export function tastedBrewRowToBeerfinder(row: TastedBrewRow): Beerfinder {
  return {
    id: row.id,
    roh_lap: row.roh_lap,
    tasted_date: row.tasted_date,
    brew_name: row.brew_name,
    brewer: row.brewer,
    brewer_loc: row.brewer_loc,
    brew_style: row.brew_style,
    brew_container: row.brew_container,
    review_count: row.review_count,
    review_ratings: row.review_ratings,
    brew_description: row.brew_description,
    chit_code: row.chit_code,
    abv: row.abv,
    // Enrichment fields (optional on Beerfinder interface)
    enrichment_confidence: row.enrichment_confidence,
    enrichment_source: row.enrichment_source,
  };
}
```

---

### Step 7: Update BeerRepository

**File:** `/workspace/BeerSelector/src/database/repositories/BeerRepository.ts`

Update `_insertManyInternal` method to include enrichment fields in the INSERT statement.

**Changes to INSERT statement (around line 89):**

```typescript
await database.runAsync(
  `INSERT OR REPLACE INTO allbeers (
    id, added_date, brew_name, brewer, brewer_loc,
    brew_style, brew_container, review_count, review_rating,
    brew_description, container_type, abv,
    enrichment_confidence, enrichment_source
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  [
    beer.id,
    beer.added_date || '',
    beer.brew_name || '',
    beer.brewer || '',
    beer.brewer_loc || '',
    beer.brew_style || '',
    beer.brew_container || '',
    beer.review_count || '',
    beer.review_rating || '',
    beer.brew_description || '',
    beer.container_type,
    beer.abv ?? null,
    beer.enrichment_confidence ?? null,
    beer.enrichment_source ?? null,
  ]
);
```

---

### Step 8: Update Glass Type Calculator

**File:** `/workspace/BeerSelector/src/database/utils/glassTypeCalculator.ts`

Update both functions to preserve enrichment fields from Worker response and use explicit return types.

#### 8.1: Complete Updated File

Replace the entire file with this complete, copy-pasteable code:

```typescript
import { getContainerType, extractABV, ContainerType } from '@/src/utils/beerGlassType';
import { Beer, BeerWithContainerType, EnrichmentSource } from '@/src/types/beer';

/**
 * Return type for calculateContainerType function
 * Explicitly includes all fields for type safety
 */
interface BeerWithContainerTypeAndEnrichment extends Beer {
  container_type: ContainerType;
  abv: number | null;
  enrichment_confidence: number | null;
  enrichment_source: EnrichmentSource;
}

/**
 * Calculate and assign container type and ABV to a beer object
 * Returns new object with container_type, abv, and enrichment properties
 *
 * If beer already has enriched ABV (from Worker), use that.
 * Otherwise, extract ABV from description.
 *
 * Enrichment fields are passed through if present.
 */
export function calculateContainerType(beer: Beer): BeerWithContainerTypeAndEnrichment {
  // Use enriched ABV from Worker if available, otherwise extract from description
  const abv = beer.abv ?? extractABV(beer.brew_description);

  // Calculate container type with ABV
  const containerType = getContainerType(
    beer.brew_container,
    beer.brew_description,
    beer.brew_style,
    beer.brew_name,
    abv
  );

  return {
    ...beer,
    container_type: containerType,
    abv: abv,
    // Pass through enrichment fields, defaulting to null if not present
    enrichment_confidence: beer.enrichment_confidence ?? null,
    enrichment_source: beer.enrichment_source ?? null,
  };
}

/**
 * Calculate container types and ABV for an array of beers
 * Used in data sync to pre-compute before insertion
 *
 * Returns BeerWithContainerType[] to match repository type signatures
 *
 * If beer already has enriched ABV (from Worker), use that.
 * Otherwise, extract ABV from description.
 *
 * Enrichment fields are passed through if present.
 */
export function calculateContainerTypes(beers: Beer[]): BeerWithContainerType[] {
  return beers.map((beer): BeerWithContainerType => {
    // Use enriched ABV from Worker if available, otherwise extract from description
    const abv = beer.abv ?? extractABV(beer.brew_description);

    // Calculate container type with ABV
    const containerType = getContainerType(
      beer.brew_container,
      beer.brew_description,
      beer.brew_style,
      beer.brew_name,
      abv
    );

    return {
      ...beer,
      container_type: containerType,
      abv: abv,
      // Pass through enrichment fields, defaulting to null if not present
      enrichment_confidence: beer.enrichment_confidence ?? null,
      enrichment_source: beer.enrichment_source ?? null,
    };
  });
}
```

**Key Changes:**

1. Added import for `EnrichmentSource` type from `@/src/types/beer`
2. Created explicit `BeerWithContainerTypeAndEnrichment` interface for single-beer function
3. Updated `calculateContainerType` to include enrichment fields with explicit return type
4. Updated `calculateContainerTypes` to include enrichment fields
5. Changed to explicit callback return type `(beer): BeerWithContainerType =>` instead of type assertion
6. Both functions now preserve enrichment data from Worker or default to `null`

---

### Step 9: Update Data Update Service

**File:** `/workspace/BeerSelector/src/services/dataUpdateService.ts`

This is the most significant change - implementing the proxy pattern with fallback.

#### 9.1: Add Imports

Add at the top of the file (after existing imports):

```typescript
import { config } from '@/src/config';
import { fetchBeersFromProxy, EnrichedBeerResponse } from './enrichmentService';
```

#### 9.2: Create Helper Function to Map Worker Response

Add new function (around line 20):

```typescript
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
```

#### 9.3: Update fetchAndUpdateAllBeers Function

Replace the existing `fetchAndUpdateAllBeers` function with this version that tries the proxy first:

```typescript
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
      allBeers = responseValidation.data!;
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
```

---

### Step 10: Update MyBeersRepository (if needed)

**File:** `/workspace/BeerSelector/src/database/repositories/MyBeersRepository.ts`

Update the INSERT statement similarly to BeerRepository to include enrichment columns:

```typescript
await database.runAsync(
  `INSERT OR REPLACE INTO tasted_brew_current_round (
    id, roh_lap, tasted_date, brew_name, brewer, brewer_loc,
    brew_style, brew_container, review_count, review_ratings,
    brew_description, chit_code, container_type, abv,
    enrichment_confidence, enrichment_source
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  [
    beer.id,
    beer.roh_lap || '',
    beer.tasted_date || '',
    beer.brew_name || '',
    beer.brewer || '',
    beer.brewer_loc || '',
    beer.brew_style || '',
    beer.brew_container || '',
    beer.review_count || '',
    beer.review_ratings || '',
    beer.brew_description || '',
    beer.chit_code || '',
    beer.container_type,
    beer.abv ?? null,
    beer.enrichment_confidence ?? null,
    beer.enrichment_source ?? null,
  ]
);
```

---

## Testing Plan

### Local Development Testing

1. **Start the Worker locally:**

   ```bash
   cd /path/to/ufobeer
   wrangler dev
   ```

2. **Configure development environment:**
   Create `/workspace/BeerSelector/.env.development`:

   ```bash
   EXPO_PUBLIC_ENRICHMENT_API_URL=http://localhost:8787
   EXPO_PUBLIC_ENRICHMENT_API_KEY=test-key
   ```

3. **Start the app:**
   ```bash
   cd /workspace/BeerSelector
   npm start
   ```

### Manual Test Cases

| Test                 | Steps                                                                  | Expected Result                                                   |
| -------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Proxy Success**    | 1. Ensure Worker is running locally<br>2. Open app and pull to refresh | Beers load with enrichment data visible in console logs           |
| **Proxy Fallback**   | 1. Stop Worker<br>2. Pull to refresh in app                            | Beers still load (from direct FS), console shows fallback message |
| **Rate Limiting**    | 1. Rapidly refresh 65+ times                                           | After 60 requests, see rate limit warning then fallback           |
| **Invalid API Key**  | 1. Change API key to wrong value<br>2. Pull to refresh                 | Falls back to direct fetch, logs auth error                       |
| **Cache Busting**    | 1. Call bustTaplistCache from settings<br>2. Refresh                   | Fresh data fetched from FS (not cached)                           |
| **Schema Migration** | 1. Clear app data<br>2. Install app<br>3. Open app                     | Migration runs, new columns exist (check with SQLite browser)     |

### Verify Enrichment Data

After successful fetch via proxy, verify enrichment data is stored:

```typescript
// In React Native Debugger console or test
import { beerRepository } from '@/src/database/repositories/BeerRepository';

const beers = await beerRepository.getAll();
const enrichedBeers = beers.filter(b => b.enrichment_confidence !== null);
console.log(`Enriched beers: ${enrichedBeers.length}/${beers.length}`);
console.log('Sample:', enrichedBeers[0]);
```

---

## Rollback Plan

If issues arise after deployment:

### Quick Disable (No Code Change)

Remove enrichment env vars from production build:

- Delete `EXPO_PUBLIC_ENRICHMENT_API_URL`
- Delete `EXPO_PUBLIC_ENRICHMENT_API_KEY`

The app will skip proxy and use direct Flying Saucer fetch.

### Code Rollback

If schema migration causes issues:

1. The migration is additive (only adds columns), so existing data is preserved
2. New columns will have NULL values if app uses direct fetch
3. App continues to work without enrichment data

### Database Reset (Last Resort)

If database is corrupted:

```typescript
// Clear all beer data (user will re-fetch on next refresh)
await beerRepository.clear();
await myBeersRepository.clear();
```

---

## Files Changed Summary

| File                                             | Change Type | Description                               |
| ------------------------------------------------ | ----------- | ----------------------------------------- |
| `.env.example`                                   | Modify      | Add enrichment env var documentation      |
| `src/config/config.ts`                           | Modify      | Add EnrichmentConfig interface and getter |
| `src/services/enrichmentService.ts`              | **Create**  | New service for Worker communication      |
| `src/types/beer.ts`                              | Modify      | Add enrichment fields to Beer interface   |
| `src/database/schemaVersion.ts`                  | Modify      | Bump version to 7                         |
| `src/database/migrations/migrateToV7.ts`         | **Create**  | New migration file                        |
| `src/database/schema.ts`                         | Modify      | Add migration call and update table DDL   |
| `src/database/schemaTypes.ts`                    | Modify      | Add enrichment fields to Zod schemas      |
| `src/database/repositories/BeerRepository.ts`    | Modify      | Add enrichment columns to INSERT          |
| `src/database/repositories/MyBeersRepository.ts` | Modify      | Add enrichment columns to INSERT          |
| `src/database/utils/glassTypeCalculator.ts`      | Modify      | Preserve enrichment fields                |
| `src/services/dataUpdateService.ts`              | Modify      | Add proxy-first fetch with fallback       |

---

## Post-Implementation Checklist

- [ ] All TypeScript compiles without errors (`npm run lint`)
- [ ] App starts without crashes
- [ ] Migration runs successfully on fresh install
- [ ] Migration runs successfully on upgrade from v6
- [ ] Proxy fetch works with local Worker
- [ ] Fallback to direct fetch works when Worker is down
- [ ] Enrichment data is visible in database after proxy fetch
- [ ] Rate limiting behavior is correct (falls back after limit)
- [ ] Dark mode compatibility verified (no UI changes in this phase)

---

## Next Steps (Phase 5)

After this integration is complete and tested:

1. Deploy Worker to production
2. Set production API key
3. Build TestFlight with production enrichment config
4. Internal testing (1-2 days)
5. Gradual rollout to users
6. Monitor Cloudflare dashboard for errors and usage
