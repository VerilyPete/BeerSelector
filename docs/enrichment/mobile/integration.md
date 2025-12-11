# Mobile App Integration

This document covers integrating the enrichment service into the React Native mobile app.

## Overview

The app uses the **Proxy pattern**: all beer data flows through the Cloudflare Worker, which fetches from Flying Saucer, merges enrichment data, and returns a unified response. If the Worker is unavailable, the app falls back to direct Flying Saucer API access.

## Configuration

### Environment Variables

Add to your `.env` files:

```bash
# .env.development
EXPO_PUBLIC_ENRICHMENT_API_URL=http://localhost:8787
EXPO_PUBLIC_ENRICHMENT_API_KEY=dev-api-key

# .env.production
EXPO_PUBLIC_ENRICHMENT_API_URL=https://ufobeer.ufobeer.workers.dev
EXPO_PUBLIC_ENRICHMENT_API_KEY=your-secure-api-key
```

### Config Module Update

Update `src/config/config.ts` to include enrichment configuration:

```typescript
export const config = {
  // ... existing config ...

  enrichment: {
    apiUrl: process.env.EXPO_PUBLIC_ENRICHMENT_API_URL,
    apiKey: process.env.EXPO_PUBLIC_ENRICHMENT_API_KEY,
  },
};
```

## Enrichment Service

Create `src/services/enrichmentService.ts`:

```typescript
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';

interface EnrichmentData {
  abv: number | null;
  confidence: number;
  is_verified: boolean;
}

type EnrichmentMap = Record<string, EnrichmentData>;

// Support both Expo Constants and EXPO_PUBLIC_ env vars
const ENRICHMENT_API_URL =
  Constants.expoConfig?.extra?.enrichmentApiUrl ?? process.env.EXPO_PUBLIC_ENRICHMENT_API_URL;

const ENRICHMENT_API_KEY =
  Constants.expoConfig?.extra?.enrichmentApiKey ?? process.env.EXPO_PUBLIC_ENRICHMENT_API_KEY;

const CLIENT_ID_KEY = 'enrichment_client_id';

/**
 * Get or create a persistent client ID for rate limiting.
 * This replaces the deprecated Constants.installationId.
 */
let cachedClientId: string | null = null;
export async function getClientId(): Promise<string> {
  if (cachedClientId) return cachedClientId;

  try {
    let clientId = await AsyncStorage.getItem(CLIENT_ID_KEY);
    if (!clientId) {
      // Generate a UUID v4
      const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
      const appId = Application.applicationId || 'app';
      clientId = `${appId}-${uuid}`;
      await AsyncStorage.setItem(CLIENT_ID_KEY, clientId);
    }
    cachedClientId = clientId;
    return clientId;
  } catch {
    // Fallback if AsyncStorage fails
    return 'unknown-client';
  }
}

/**
 * Fetch enrichment data for a batch of beer IDs.
 * Automatically chunks large requests to respect Worker's 100 ID limit.
 * Returns empty object if service is unavailable (graceful degradation).
 */
export async function fetchEnrichmentData(beerIds: string[]): Promise<EnrichmentMap> {
  if (!ENRICHMENT_API_URL || !ENRICHMENT_API_KEY || beerIds.length === 0) {
    return {};
  }

  const BATCH_SIZE = 100; // Worker limit
  const results: EnrichmentMap = {};

  // Chunk IDs into batches of 100
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
      const response = await fetch(`${ENRICHMENT_API_URL}/beers/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': ENRICHMENT_API_KEY,
          'X-Client-ID': clientId,
        },
        body: JSON.stringify({ ids: chunk }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Log request ID for debugging
      const requestId = response.headers.get('X-Request-ID');
      if (requestId) {
        console.debug(`Enrichment request ID: ${requestId}`);
      }

      // Handle rate limiting - stop processing further chunks
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        console.warn(`Enrichment rate limited. Retry after ${retryAfter}s`);
        break; // Return partial results
      }

      if (!response.ok) {
        console.warn(`Enrichment service returned ${response.status}`);
        continue; // Try next chunk
      }

      const data = (await response.json()) as {
        enrichments: EnrichmentMap;
        requestId: string;
      };

      // Merge chunk results
      Object.assign(results, data.enrichments || {});
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        console.warn('Enrichment service request timed out');
        continue; // Try next chunk
      }

      console.warn('Enrichment service unavailable:', error);
      break; // Stop on network errors
    }
  }

  return results;
}

/**
 * Check if enrichment service is available.
 */
export async function checkEnrichmentHealth(): Promise<boolean> {
  if (!ENRICHMENT_API_URL) return false;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    const response = await fetch(`${ENRICHMENT_API_URL}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    clearTimeout(timeoutId);
    return false;
  }
}

/**
 * Bust the cache for a specific store's taplist.
 * Call this before refreshing to ensure fresh data from Flying Saucer.
 *
 * @param storeId - The Flying Saucer store ID
 * @returns true if cache was cleared, false otherwise
 */
export async function bustTaplistCache(storeId: string): Promise<boolean> {
  if (!ENRICHMENT_API_URL || !ENRICHMENT_API_KEY) {
    return false;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const clientId = await getClientId();
    const response = await fetch(`${ENRICHMENT_API_URL}/cache?sid=${storeId}`, {
      method: 'DELETE',
      headers: {
        'X-API-Key': ENRICHMENT_API_KEY,
        'X-Client-ID': clientId,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = (await response.json()) as { cacheCleared: boolean };
      console.debug(`Cache bust for store ${storeId}: ${data.cacheCleared}`);
      return data.cacheCleared;
    }

    return false;
  } catch (error) {
    clearTimeout(timeoutId);
    console.warn('Failed to bust cache:', error);
    return false;
  }
}
```

## Data Update Service Changes

Update `src/services/dataUpdateService.ts` to use the proxy pattern:

```typescript
import { config } from '@/src/config';
import { getClientId } from './enrichmentService';
import type { Beer } from '@/src/types/beer';

const ENRICHMENT_API_URL = config.enrichment?.apiUrl;
const ENRICHMENT_API_KEY = config.enrichment?.apiKey;

/**
 * Fetch all beers from the enrichment proxy for a specific store.
 * The Worker fetches from Flying Saucer, merges enrichment data, and returns unified results.
 * Falls back to direct Flying Saucer fetch if enrichment service is unavailable.
 *
 * @param storeId - The Flying Saucer store ID (e.g., '13877' for Raleigh)
 */
export async function fetchAllBeers(storeId: string): Promise<Beer[]> {
  // Try the enrichment proxy first (preferred path)
  if (ENRICHMENT_API_URL && ENRICHMENT_API_KEY) {
    try {
      const clientId = await getClientId();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(`${ENRICHMENT_API_URL}/beers?sid=${storeId}`, {
        headers: {
          'X-API-Key': ENRICHMENT_API_KEY,
          'X-Client-ID': clientId,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = (await response.json()) as {
          beers: EnrichedBeerResponse[];
          storeId: string;
          requestId: string;
        };

        console.debug(
          `Fetched ${data.beers.length} beers for store ${data.storeId} via proxy (requestId: ${data.requestId})`
        );

        // Map Worker response to app's Beer interface
        return data.beers.map(mapWorkerBeerToAppBeer);
      }

      // Log but don't throw - fall through to direct fetch
      console.warn(`Enrichment proxy returned ${response.status}, falling back to direct fetch`);
    } catch (error) {
      console.warn('Enrichment proxy unavailable, falling back to direct fetch:', error);
    }
  }

  // Fallback: Direct Flying Saucer fetch (no enrichment)
  return fetchBeersDirectFromFlyingSaucer(storeId);
}

interface EnrichedBeerResponse {
  id: string;
  brew_name: string;
  brewer: string;
  container_type?: string;
  enriched_abv: number | null;
  enrichment_confidence: number | null;
  // ... other Flying Saucer fields pass through
}

/**
 * Map Worker's enriched beer response to app's Beer interface.
 */
function mapWorkerBeerToAppBeer(beer: EnrichedBeerResponse): Beer {
  return {
    id: beer.id,
    brew_name: beer.brew_name,
    brewer: beer.brewer,
    container_type: beer.container_type ?? null,
    // Prefer enriched ABV if available
    abv: beer.enriched_abv ?? null,
    enrichment_confidence: beer.enrichment_confidence ?? null,
    is_enrichment_verified: false, // Worker returns this separately if needed
    enrichment_source: beer.enriched_abv !== null ? 'perplexity' : null,
    // ... map other fields
  };
}
```

## Type Updates

Update `src/types/beer.ts` to include enrichment fields:

```typescript
export interface Beer {
  id: string;
  brew_name: string;
  brewer: string;
  container_type: string | null;
  abv: number | null;
  // ... existing fields ...

  // Enrichment fields (from Cloudflare Worker)
  enrichment_confidence: number | null;
  is_enrichment_verified: boolean;
  enrichment_source: 'perplexity' | 'manual' | null;
}
```

## Repository Updates

Update `src/database/repositories/BeerRepository.ts` to persist enrichment fields:

```typescript
async insertMany(beers: Beer[]): Promise<void> {
  const CHUNK_SIZE = 25;
  const now = Date.now();

  for (let i = 0; i < beers.length; i += CHUNK_SIZE) {
    const chunk = beers.slice(i, i + CHUNK_SIZE);

    await this.db.withTransactionAsync(async () => {
      for (const beer of chunk) {
        await this.db.runAsync(
          `INSERT OR REPLACE INTO allbeers (
            id, brew_name, brewer, container_type, abv,
            enrichment_confidence, is_enrichment_verified, enrichment_source,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            beer.id,
            beer.brew_name,
            beer.brewer,
            beer.container_type,
            beer.abv,
            beer.enrichment_confidence,
            beer.is_enrichment_verified ? 1 : 0,
            beer.enrichment_source,
            now,
          ]
        );
      }
    });
  }
}
```

## Fallback Behavior

The integration includes graceful degradation:

1. **Worker available**: App fetches from `GET /beers?sid=` → gets enriched data
2. **Worker down**: App falls back to direct Flying Saucer fetch → no enrichment
3. **Rate limited**: App gets partial data from Worker, rest unenriched
4. **Network error**: App falls back to cached local data

This ensures the app remains functional even if the enrichment service is unavailable.

## Testing

### Local Development

1. Start the Worker locally:

   ```bash
   cd ufobeer
   wrangler dev
   ```

2. Update `.env.development`:

   ```bash
   EXPO_PUBLIC_ENRICHMENT_API_URL=http://localhost:8787
   EXPO_PUBLIC_ENRICHMENT_API_KEY=test-key
   ```

3. Start the app:
   ```bash
   cd BeerSelector
   npm start
   ```

### Verify Integration

```typescript
// In app console or debug view
import { checkEnrichmentHealth } from './services/enrichmentService';

const isHealthy = await checkEnrichmentHealth();
console.log('Enrichment service healthy:', isHealthy);
```

## Settings Integration: Force Refresh

Add a "Refresh All Data" button in Settings that busts the cache and refreshes data.

### Settings Screen Changes

In `app/settings.tsx`, add a refresh button:

```typescript
import { bustTaplistCache } from '@/src/services/enrichmentService';
import { fetchAllBeers } from '@/src/services/dataUpdateService';
import { getPreference } from '@/src/database/preferences';

const [isRefreshing, setIsRefreshing] = useState(false);

async function handleForceRefresh() {
  setIsRefreshing(true);
  try {
    // Get current store ID from preferences
    const storeId = (await getPreference('current_store_id')) || '13877'; // Default to Raleigh

    // 1. Bust the cache to ensure fresh data
    await bustTaplistCache(storeId);

    // 2. Fetch fresh data (will now get uncached response)
    await fetchAllBeers(storeId);

    // 3. Show success feedback
    Alert.alert('Success', 'Beer list refreshed with latest data.');
  } catch (error) {
    console.error('Force refresh failed:', error);
    Alert.alert('Error', 'Failed to refresh data. Please try again.');
  } finally {
    setIsRefreshing(false);
  }
}
```

### UI Component

```tsx
<TouchableOpacity
  style={styles.settingsButton}
  onPress={handleForceRefresh}
  disabled={isRefreshing}
>
  <ThemedText style={styles.buttonText}>
    {isRefreshing ? 'Refreshing...' : 'Force Refresh All Data'}
  </ThemedText>
  <ThemedText style={styles.buttonSubtext}>Clear cache and fetch latest taplist</ThemedText>
</TouchableOpacity>
```

### Behavior

1. User taps "Force Refresh All Data" in Settings
2. App calls `DELETE /cache?sid=` to bust the Worker cache
3. App calls `GET /beers?sid=` which now fetches fresh from Flying Saucer
4. Fresh data is cached for next 30 minutes
5. User sees updated beer list

This is useful when:

- A new beer was just tapped and user wants to see it immediately
- Data seems stale or incorrect
- Debugging issues
