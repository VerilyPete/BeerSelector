# Phase 2: Worker — Wire ETag into `handleBeerList`

**Repo**: `/Users/pete/claude/ufobeer/`
**Depends on**: [01-worker-etag.md](01-worker-etag.md)

## Overview

Integrate ETag generation and conditional request handling into the existing `GET /beers` endpoint. Hash the **raw** upstream response (pre-enrichment) so enrichment-only changes don't bust the ETag.

## Step 1: Update `handleBeerList` Signature

The handler needs the `request` object to read `If-None-Match` headers.

**Current** (beers.ts:207-213):

```typescript
export async function handleBeerList(env, ctx, headers, reqCtx, storeId, freshRequested);
```

**New**:

```typescript
export async function handleBeerList(
  request: Request, // NEW — for conditional request headers
  env,
  ctx,
  headers,
  reqCtx,
  storeId,
  freshRequested
);
```

Update call site in `src/index.ts:200` to pass `request`.

## Step 2: Add Conditional Check on Cache Hit Path

**Tests first:**

- Cache fresh + no `If-None-Match` -> 200 from cache (existing behavior)
- Cache fresh + matching `If-None-Match` -> 304 with ETag header
- Cache fresh + non-matching `If-None-Match` -> 200 with ETag header
- Cache fresh + `content_hash` is NULL (pre-migration row) -> 200, no ETag (backwards compat)
- 304 response includes CORS, rate limit, and `X-Request-ID` headers
- 304 response has `cacheOutcome: 'conditional'` in `GetBeersResult`
- 304 `GetBeersResult` has `beersReturned: 0`, `upstreamLatencyMs: 0`

**Implementation** — after the existing cache freshness check (beers.ts:244-260):

```typescript
if (cachedRow && Date.now() - cachedRow.cached_at < CACHE_TTL_MS) {
  // NEW: Check conditional request if we have a content hash
  if (cachedRow.content_hash) {
    const etag = `"${cachedRow.content_hash}"`;
    const conditionalResponse = checkConditionalRequest(request, etag);
    if (conditionalResponse) {
      // Copy CORS, rate limit, request ID headers onto the 304
      for (const [key, value] of Object.entries(headers)) {
        conditionalResponse.headers.set(key, value);
      }
      return {
        response: conditionalResponse,
        beersReturned: 0,
        upstreamLatencyMs: 0,
        cacheOutcome: 'conditional',
      };
    }
  }

  // Existing cache hit path — add ETag to response headers
  const cachedBeers = parseCachedBeers(cachedRow.response_json);
  if (cachedBeers) {
    const responseHeaders = { ...headers };
    if (cachedRow.content_hash) {
      responseHeaders['ETag'] = `"${cachedRow.content_hash}"`;
      responseHeaders['Cache-Control'] = 'private, max-age=300';
    }
    return {
      response: Response.json({ beers: cachedBeers, storeId, requestId: reqCtx.requestId, source: 'cache', cached_at: ... }, { headers: responseHeaders }),
      ...
    };
  }
}
```

## Step 3: Hash Raw Response and Update Cache on Upstream Fetch

**Key design**: Hash the **raw** Flying Saucer response body (pre-enrichment). This way, enrichment-only changes (new ABV data from Perplexity) don't change the ETag. The ETag answers "did the taplist change?", not "did enrichment change?"

**Tests first:**

- Upstream returns same raw data as stored hash -> `updateCacheTimestamp` called (not full `setCachedTaplist`)
- Upstream returns different raw data -> `setCachedTaplist` called with new hash
- First request (no stored hash) -> `setCachedTaplist` called with computed hash
- ETag on 200 response matches the hash of the raw response
- Old client without `If-None-Match` -> always gets 200 (backwards compatibility)

**Implementation** — in the upstream fetch path (beers.ts:263-374):

```typescript
// After fetching from Flying Saucer and before enrichment merge:
const fsData: unknown = await fsResp.json();
const rawResponseBody = JSON.stringify(fsData); // serialize for hashing
const rawHash = await hashDescription(rawResponseBody); // 32-char hex

// ... existing parsing, validation, enrichment merge ...

// Hash comparison for cache write decision
const contentChanged = shouldUpdateContent(rawHash, cachedRow?.content_hash ?? null);

if (contentChanged) {
  ctx.waitUntil(setCachedTaplist(env.DB, storeId, enrichedBeers, rawHash));
} else {
  ctx.waitUntil(updateCacheTimestamp(env.DB, storeId));
}

// Check conditional request against raw hash
const etag = `"${rawHash}"`;
const conditionalResponse = checkConditionalRequest(request, etag);
if (conditionalResponse) {
  for (const [key, value] of Object.entries(headers)) {
    conditionalResponse.headers.set(key, value);
  }
  return {
    response: conditionalResponse,
    beersReturned: 0,
    upstreamLatencyMs,
    cacheOutcome: 'conditional',
  };
}

// Serve full 200 with ETag
return {
  response: Response.json({ beers: enrichedBeers, ... }, {
    headers: { ...headers, 'ETag': etag, 'Cache-Control': 'private, max-age=300' }
  }),
  ...
};
```

## Step 4: Update `refreshTaplistForStore`

This function (beers.ts:126-193) is called by the cron job. It also calls `setCachedTaplist` and needs updating.

**Tests first:**

- Computes raw content hash and passes to `setCachedTaplist`
- When hash unchanged, calls `updateCacheTimestamp` instead

**Implementation**: Same pattern — hash `JSON.stringify(fsData)` before enrichment, compare to stored, decide whether to full-write or timestamp-only.

Note: `refreshTaplistForStore` doesn't handle conditional requests (no client request involved — it's server-side refresh). It just needs to maintain the hash correctly.

## Step 5: Stale Fallback with ETag

When upstream fails and stale data is served, include the stored ETag.

**Tests first:**

- Stale fallback response includes `ETag` header when `content_hash` is available
- Stale fallback + matching `If-None-Match` -> 304 (even for stale data)

**Implementation**: In `serveStaleFallback()`, add ETag header if `fallbackRow.content_hash` is present. Check conditional request before serving stale.

## Store ID Validation — No Change

`GET /beers` validates against `ENABLED_STORE_IDS` (Sugar Land only). **This stays as-is.** The Worker only accepts and serves requests for Sugar Land. All other stores are rejected with 400, same as today. When we're ready to expand to other stores, that's a separate decision.
