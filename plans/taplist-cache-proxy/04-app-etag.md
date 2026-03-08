# Phase 4: App — ETag Storage and 304 Handling

**Repo**: `/Users/pete/claude/BeerSelector/`
**Depends on**: [03-app-refactor.md](03-app-refactor.md) (shared fetch helper must exist)

## Overview

Add If-None-Match header to proxy requests and handle 304 responses to skip DB writes when the taplist hasn't changed.

## Step 1: Send `If-None-Match` Header

**Tests first:**

- When `all_beers_etag` preference exists, proxy request includes `If-None-Match` header
- When no stored ETag, proxy request does NOT include `If-None-Match`
- Direct Flying Saucer fallback NEVER sends `If-None-Match`

**Implementation** — update `fetchBeersFromProxy` in `enrichmentService.ts`:

```typescript
export async function fetchBeersFromProxy(
  storeId: string,
  etag?: string // NEW optional parameter
): Promise<BeersProxyResponse> {
  // ... existing setup ...
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'X-API-Key': enrichment.apiKey,
      'X-Client-ID': clientId,
      Accept: 'application/json',
      ...(etag ? { 'If-None-Match': etag } : {}), // NEW
    },
    signal: controller.signal,
  });
  // ...
}
```

Update `fetchTaplistFromProxyOrDirect` (from Phase 3) to read stored ETag and pass it:

```typescript
const storedEtag = await getPreference('all_beers_etag');
const proxyResult = await fetchBeersFromProxy(storeId, storedEtag ?? undefined);
```

## Step 2: Handle 304 in `fetchBeersFromProxy`

**Tests first:**

- 304 response returns a sentinel result (not an error)
- 304 response does NOT call `response.json()` (empty body would error)
- 304 is not treated as `!response.ok` error

**Implementation** — in `fetchBeersFromProxy`, add 304 check BEFORE the `!response.ok` check:

```typescript
// After fetch(), before error handling:
if (response.status === 304) {
  metrics.cacheHits++;
  return {
    beers: [],       // sentinel: empty array
    storeId,
    source: 'not_modified',  // sentinel: indicates 304
    requestId: response.headers.get('X-Request-ID') ?? '',
    etag: response.headers.get('ETag'),  // echo back (unchanged)
    notModified: true,  // explicit flag
  };
}

// Existing !response.ok check (handles 4xx, 5xx)
if (response.status === 429) { ... }
if (response.status === 401) { ... }
if (!response.ok) { ... }
```

## Step 3: Handle 304 in Shared Fetch Helper

**Tests first:**

- `fetchTaplistFromProxyOrDirect` returns `{ notModified: true }` on 304
- Caller receives the signal and skips DB writes
- `all_beers_last_check` IS updated on 304
- `all_beers_etag` is NOT updated on 304 (value unchanged)
- `beerRepository.insertMany` is NOT called on 304

**Implementation** — update `TaplistFetchResult` and the shared helper:

```typescript
type TaplistFetchResult = {
  beers: Beer[];
  usedProxy: boolean;
  etag: string | null;
  notModified: boolean; // NEW
};

// In fetchTaplistFromProxyOrDirect:
if (proxyResult.notModified) {
  return {
    beers: [],
    usedProxy: true,
    etag: proxyResult.etag,
    notModified: true,
  };
}
```

Update all three callers to check `notModified`:

```typescript
const result = await fetchTaplistFromProxyOrDirect(storeId, signal);

if (result.notModified) {
  await setPreference('all_beers_last_check', new Date().toISOString());
  console.log('[dataUpdateService] 304 Not Modified — taplist unchanged');
  return { success: true, dataUpdated: false };
}

// Existing flow: validate, calculate container types, insert...
```

## Step 4: Store ETag After Successful 200

**Tests first:**

- After 200 from proxy with ETag header, `all_beers_etag` preference is set
- After 200 from proxy with no ETag header, `all_beers_etag` is NOT written
- After 200 from direct Flying Saucer (no proxy), `all_beers_etag` is NOT written

**Implementation** — after successful DB insert:

```typescript
if (result.etag) {
  await setPreference('all_beers_etag', result.etag);
}
```

## Step 5: Clear ETag on Store Change

When the user switches stores (changes `all_beers_api_url`), the stored ETag is for the old store's taplist and must be cleared.

**Tests first:**

- When `all_beers_api_url` changes, `all_beers_etag` is cleared

**Implementation** — find where store change happens (likely in auth/settings flow where `all_beers_api_url` is set) and add:

```typescript
await setPreference('all_beers_etag', ''); // or null/delete
```

## Refresh Window Interaction (no code change, just documentation)

- **Auto-refresh (12-hour gate)**: If `all_beers_last_check` < 12 hours old, skip entirely. No network call, no ETag sent. Existing behavior unchanged.
- **Manual pull-to-refresh**: Bypasses 12-hour gate, sends fetch with `If-None-Match`. This is where ETags help most — 304 in ~100ms vs 200KB download + DB churn.
- 304 updates `all_beers_last_check`, so the 12-hour window resets even when data didn't change.

## Out of Scope

- My Beers / Rewards endpoints (different API, different auth, no Worker proxy)
- Reducing the 12-hour window (separate product decision)
