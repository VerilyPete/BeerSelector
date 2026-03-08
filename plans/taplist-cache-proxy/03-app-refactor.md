# Phase 3: App — Extract Shared Taplist Fetch Helper

**Repo**: `/Users/pete/claude/BeerSelector/`
**Depends on**: Nothing (can be done in parallel with Worker phases)

## Overview

The proxy-then-fallback taplist fetch logic is duplicated in **three** places in `dataUpdateService.ts`. Extract a shared helper before adding ETag support.

## The Three Duplicated Paths

All three do the same thing: try Worker proxy, fall back to direct Flying Saucer, validate, calculate container types, insert into DB.

1. **`fetchAndUpdateAllBeers()`** (~line 166-422)
   - Called by `checkAndRefreshOnAppOpen` (auto-refresh with 12-hour gate)
   - Uses `beerRepository.insertMany()` (acquires its own lock)

2. **`sequentialRefreshAllData()`** (~line 792-870)
   - Called by `manualRefreshAllData` (manual pull-to-refresh)
   - Uses `beerRepository.insertManyUnsafe()` (caller holds master lock)

3. **`refreshAllDataFromAPI()`** (~line 1175-1248)
   - Another manual refresh path
   - Uses `beerRepository.insertManyUnsafe()` (caller holds master lock)

## Step 1: Extract `fetchTaplistFromProxyOrDirect()`

**Tests first:**

- When enrichment configured, calls `fetchBeersFromProxy` with store ID
- When proxy succeeds, returns proxy beers mapped via `mapEnrichedBeerToAppBeer`
- When proxy fails, falls back to `fetchBeersFromAPI`
- When enrichment NOT configured, calls `fetchBeersFromAPI` directly
- When both fail, throws error
- Calls `recordFallback()` on fallback path

**Implementation:**

```typescript
type TaplistFetchResult = {
  beers: Beer[];
  usedProxy: boolean;
  etag: string | null; // from response header (proxy only)
};

async function fetchTaplistFromProxyOrDirect(
  storeId: string | null,
  abortSignal?: AbortSignal
): Promise<TaplistFetchResult> {
  // Try proxy first if configured
  if (storeId && config.enrichment.isConfigured()) {
    try {
      const proxyResult = await fetchBeersFromProxyWithETag(storeId, abortSignal);
      return {
        beers: proxyResult.beers.map(mapEnrichedBeerToAppBeer),
        usedProxy: true,
        etag: proxyResult.etag,
      };
    } catch {
      // Fall through to direct fetch
    }
  }

  // Direct fetch (no ETag support)
  recordFallback();
  const beers = await fetchBeersFromAPI();
  return { beers, usedProxy: false, etag: null };
}
```

## Step 2: Update `fetchBeersFromProxy` to Return ETag

Currently `fetchBeersFromProxy()` in `enrichmentService.ts` returns `BeersProxyResponse` (parsed JSON). The raw `Response` object — and its headers — are discarded at line 472.

**Option A (minimal change)**: Add ETag extraction before discarding the response:

```typescript
// In fetchBeersFromProxy, after response.json():
const etag = response.headers.get('ETag');
return { ...data, etag }; // extend BeersProxyResponse
```

**Option B**: Create a new function `fetchBeersFromProxyWithETag` that wraps `fetchBeersFromProxy` and adds ETag + If-None-Match support. This keeps the existing function unchanged.

**Recommendation**: Option A — simpler, one change.

**Tests first:**

- `fetchBeersFromProxy` returns ETag from response header when present
- `fetchBeersFromProxy` returns null etag when header not present (old Worker)

**Implementation** — update `BeersProxyResponse` schema and `fetchBeersFromProxy`:

```typescript
// Extend the response type
type BeersProxyResponse = {
  beers: EnrichedBeer[];
  storeId: string;
  source: string;
  // ... existing fields
  etag: string | null; // NEW
};

// In fetchBeersFromProxy, before return:
const etag = response.headers.get('ETag');
return { ...data, etag };
```

Note: The Zod schema (`beersProxyResponseSchema`) parses the JSON body, not headers. The ETag comes from HTTP headers, so it's extracted separately and merged onto the parsed result.

## Step 3: Replace Duplicated Logic in All Three Callers

Each caller reduces to:

```typescript
const { beers, usedProxy, etag } = await fetchTaplistFromProxyOrDirect(storeId, signal);

const validationResult = validateBeerArray(beers);
// ... existing validation error handling ...

const beersWithContainerTypes = calculateContainerTypes(validationResult.validBeers);
await beerRepository.insertMany(beersWithContainerTypes); // or insertManyUnsafe
await setPreference('all_beers_last_update', new Date().toISOString());
await setPreference('all_beers_last_check', new Date().toISOString());
```

**Tests**: Existing tests for all three functions should continue passing after refactor (behavior unchanged, just extracted). Run the full test suite to verify.

## Important: Keep This a Pure Refactor

This phase does NOT add ETag/304 support. It only extracts shared logic. The three paths should behave identically before and after. ETag support is added in Phase 4.

This ordering is important for TDD:

1. Refactor (this phase) — all existing tests stay green
2. Add new behavior (Phase 4) — new failing tests drive ETag implementation
