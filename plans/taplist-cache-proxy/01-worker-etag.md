# Phase 1: Worker — ETag Utilities and Cache Schema

**Repo**: `/Users/pete/claude/ufobeer/`
**Depends on**: Nothing
**Blocked by**: Nothing

## Overview

Add pure utility functions for ETag generation and conditional request handling, plus a D1 migration to store content hashes in the cache table.

## Step 1: ETag Generation (extend existing `src/utils/hash.ts`)

The existing `hashDescription()` already does SHA-256 -> 32 hex chars. Wrap it with RFC 7232 quoting.

**Tests first:**

- `generateETag` with known input produces expected quoted 32-char hex output
- `generateETag` with different inputs produces different outputs
- `generateETag` output is always wrapped in double quotes
- `generateETag` with empty string returns valid format

**Implementation:**

```typescript
// Add to src/utils/hash.ts
export async function generateETag(body: string): Promise<string> {
  const hash = await hashDescription(body);
  return `"${hash}"`;
}
```

## Step 2: Conditional Request Handler (new `src/utils/conditional.ts`)

Pure function — no D1, no fetch, no side effects.

**Tests first:**

- Returns null when no conditional headers present
- Returns 304 when `If-None-Match` matches current ETag
- Returns null when `If-None-Match` does NOT match
- Returns 304 for wildcard `If-None-Match: *`
- Returns 304 when current ETag is in comma-separated list
- Returns null when current ETag is NOT in comma-separated list
- Does NOT match unquoted ETag values (quotes are part of the opaque value)
- 304 response includes `ETag` and `Cache-Control: private, max-age=300` headers
- 304 response has null body

**Implementation:**

```typescript
export function checkConditionalRequest(request: Request, currentETag: string): Response | null {
  const ifNoneMatch = request.headers.get('If-None-Match');
  if (!ifNoneMatch) return null;

  const clientETags = ifNoneMatch === '*' ? ['*'] : ifNoneMatch.split(',').map(e => e.trim());

  if (clientETags.includes('*') || clientETags.includes(currentETag)) {
    return new Response(null, {
      status: 304,
      headers: {
        ETag: currentETag,
        'Cache-Control': 'private, max-age=300',
      },
    });
  }

  return null;
}
```

Note: No `If-Modified-Since` / `Last-Modified` support in v1. ETag is sufficient.

## Step 3: Cache Helper Pure Functions

**Tests first:**

- `shouldUpdateContent` returns true when hashes differ
- `shouldUpdateContent` returns false when hashes match
- `shouldUpdateContent` returns true when stored hash is null (first time / pre-migration)

**Implementation:**

```typescript
// src/utils/cache-helpers.ts or add to src/db/cache.ts
export function shouldUpdateContent(newHash: string, storedHash: string | null): boolean {
  return storedHash === null || newHash !== storedHash;
}
```

## Step 4: D1 Migration

Create `migrations/0008_add_cache_etag_columns.sql`:

**Tests first:**

- After migration, `store_taplist_cache` accepts `content_hash` TEXT
- Existing rows have NULL for `content_hash` (no data loss)

**Migration:**

```sql
ALTER TABLE store_taplist_cache ADD COLUMN content_hash TEXT;
```

Only one new column (no `last_modified` — dropped from v1 scope).

## Step 5: Update Cache DB Functions (`src/db/cache.ts`)

**Tests first:**

- `getCachedTaplist` returns `content_hash` when present
- `getCachedTaplist` returns null `content_hash` for pre-migration rows
- `setCachedTaplist` writes `content_hash` alongside `response_json`
- `updateCacheTimestamp` updates only `cached_at`

**Implementation changes:**

```typescript
export type CachedTaplistRow = {
  readonly store_id: string;
  readonly response_json: string;
  readonly cached_at: number;
  readonly content_hash: string | null; // NEW
};

// Update SELECT to include content_hash
export async function getCachedTaplist(...) {
  return db
    .prepare('SELECT store_id, response_json, cached_at, content_hash FROM ...')
    ...
}

// Add contentHash parameter
export async function setCachedTaplist(
  db: D1Database,
  storeId: string,
  beers: readonly Record<string, unknown>[],
  contentHash: string, // NEW
): Promise<void> {
  // UPSERT including content_hash
}

// NEW: timestamp-only update (content unchanged)
export async function updateCacheTimestamp(
  db: D1Database,
  storeId: string,
): Promise<void> {
  await db
    .prepare('UPDATE store_taplist_cache SET cached_at = ? WHERE store_id = ?')
    .bind(Date.now(), storeId)
    .run();
}
```

**Breaking change**: `setCachedTaplist` gains a required `contentHash` parameter. Both callers (`handleBeerList` line 343, `refreshTaplistForStore` line 173) must be updated in Phase 2.

## Step 6: Extend `CacheOutcome` type

In `src/types.ts`, add `'conditional'` to the `CacheOutcome` union type for analytics tracking of 304 responses.
