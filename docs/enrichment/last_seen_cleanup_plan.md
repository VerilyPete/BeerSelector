# Last Seen Tracking & Cleanup Plan

## Overview

Track when beers are last seen on Flying Saucer taplists and implement cleanup logic to purge stale description-parsed enrichment data while preserving Perplexity-enriched beers forever.

## Business Rules

1. **Perplexity-enriched beers**: Keep forever (cost money to obtain)
2. **Description-parsed beers**: Can be purged after 1 year of not being seen
3. **Mobile app display**: Only shows beers currently on FS taplist (already works this way)

## Current State (Already Implemented)

The following is already in place:

- `extractABV()` function parses ABV from `brew_description` HTML
- `insertPlaceholders()` is called for ALL beers from Flying Saucer response
- `enrichment_source = 'description'` is set when ABV is parsed from description
- `enrichment_source = 'perplexity'` is set by the queue consumer

**Current limitation**: Using `INSERT OR IGNORE` means existing records don't get updated, so `last_seen_at` won't be tracked for beers already in the database.

## Implementation Plan

### Phase 1: Schema Migration

**Add `last_seen_at` column to `enriched_beers` table**

```sql
-- Migration: Add last_seen_at column
ALTER TABLE enriched_beers ADD COLUMN last_seen_at INTEGER;

-- Backfill existing records with updated_at value
UPDATE enriched_beers SET last_seen_at = updated_at WHERE last_seen_at IS NULL;

-- Create index for efficient cleanup queries
-- Note: enrichment_source FIRST for equality filter, then last_seen_at for range scan
CREATE INDEX IF NOT EXISTS idx_source_last_seen
ON enriched_beers(enrichment_source, last_seen_at);
```

**File**: `/workspace/ufobeer/migrations/0002_add_last_seen_at.sql`

### Phase 2: Update insertPlaceholders()

Change from `INSERT OR IGNORE` to `INSERT ... ON CONFLICT UPDATE` to track last seen:

```typescript
// Current (INSERT OR IGNORE - never updates existing records)
const stmt = db.prepare(
  'INSERT OR IGNORE INTO enriched_beers (id, brew_name, brewer, abv, confidence, enrichment_source, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
);

// New (INSERT ... ON CONFLICT UPDATE last_seen_at)
const stmt = db.prepare(`
  INSERT INTO enriched_beers (id, brew_name, brewer, abv, confidence, enrichment_source, updated_at, last_seen_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    last_seen_at = excluded.last_seen_at,
    -- Only update ABV if currently NULL (don't overwrite Perplexity data)
    abv = COALESCE(enriched_beers.abv, excluded.abv),
    confidence = COALESCE(enriched_beers.confidence, excluded.confidence),
    enrichment_source = COALESCE(enriched_beers.enrichment_source, excluded.enrichment_source)
`);
```

**Key behavior**:

- Always update `last_seen_at` when beer is seen
- Only set ABV/confidence/source if currently NULL (preserve Perplexity data)
- `updated_at` stays as original insert time

**File**: `/workspace/ufobeer/src/index.ts` - `insertPlaceholders()` function

### Source Priority Rules

When a beer exists with one source and gets data from another:

| Existing Source | New Data From     | Result                                       |
| --------------- | ----------------- | -------------------------------------------- |
| `description`   | Perplexity API    | Update to `perplexity` (higher quality)      |
| `perplexity`    | Description parse | Keep `perplexity` (already have better data) |
| NULL            | Either            | Set to whichever provides data               |

The ON CONFLICT UPDATE handles this:

```sql
-- If existing ABV is NULL, use new data and source
-- If existing ABV is NOT NULL and source is 'perplexity', keep it
-- If existing ABV is NOT NULL and source is 'description', allow Perplexity to upgrade
enrichment_source = CASE
  WHEN enriched_beers.enrichment_source = 'perplexity' THEN 'perplexity'
  ELSE COALESCE(excluded.enrichment_source, enriched_beers.enrichment_source)
END
```

**Perplexity consumer also needs update** to allow upgrading description sources:

```typescript
// In handleEnrichmentBatch, change the UPDATE to:
await env.DB.prepare(
  `
  UPDATE enriched_beers
  SET abv = ?, confidence = 0.7, enrichment_source = 'perplexity', updated_at = ?
  WHERE id = ?
`
)
  .bind(abv, Date.now(), beerId)
  .run();
```

### Phase 3: Add Cleanup Cron Job

Add cleanup logic to existing `scheduled()` handler with **batch deletion** to avoid D1 limits:

```typescript
// In scheduled() handler, after existing cleanup tasks:

// Cleanup old description-parsed beers (not seen in 1 year)
// Use batched deletion to avoid D1 query limits
const oneYearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000;
const CLEANUP_BATCH_SIZE = 500;
let totalDeleted = 0;
let batchDeleted = 0;

do {
  const result = await env.DB.prepare(
    `
    DELETE FROM enriched_beers
    WHERE id IN (
      SELECT id FROM enriched_beers
      WHERE enrichment_source = 'description'
        AND last_seen_at < ?
        AND last_seen_at IS NOT NULL
      LIMIT ?
    )
  `
  )
    .bind(oneYearAgo, CLEANUP_BATCH_SIZE)
    .run();

  batchDeleted = result.meta.changes;
  totalDeleted += batchDeleted;
} while (batchDeleted === CLEANUP_BATCH_SIZE);

if (totalDeleted > 0) {
  console.log(
    `[cron] Purged ${totalDeleted} stale description-parsed beers (not seen since ${new Date(oneYearAgo).toISOString()})`
  );
}
```

**Schedule**: Run with existing daily cron (already runs twice daily for enrichment)

### Phase 4: Add Analytics Tracking

Track cleanup metrics in Analytics Engine:

```typescript
interface CleanupMetrics {
  descriptionPurged: number;
  totalRemaining: number;
  oldestDescriptionDays: number;
}

function trackCleanup(
  analytics: AnalyticsEngineDataset | undefined,
  metrics: CleanupMetrics
): void {
  // ... implementation
}
```

## Database Schema After Migration

```sql
CREATE TABLE enriched_beers (
    id TEXT PRIMARY KEY,
    brew_name TEXT NOT NULL,
    brewer TEXT,
    abv REAL,
    confidence REAL DEFAULT 0.5,
    enrichment_source TEXT DEFAULT 'perplexity',  -- 'description' | 'perplexity'
    updated_at INTEGER NOT NULL,                   -- When record was created
    last_seen_at INTEGER,                          -- When beer was last on a taplist
    last_verified_at INTEGER DEFAULT NULL,
    is_verified INTEGER DEFAULT 0
);

-- Indexes
CREATE INDEX idx_needs_enrichment ON enriched_beers(abv) WHERE abv IS NULL;
CREATE INDEX idx_source_last_seen ON enriched_beers(enrichment_source, last_seen_at);
```

## Data Flow After Implementation

```
GET /beers?sid=13879
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  1. Fetch from Flying Saucer                                │
│  2. For each beer in response:                              │
│     - INSERT if new (set abv from description if found)     │
│     - UPDATE last_seen_at if exists                         │
│     - Preserve existing Perplexity ABV (COALESCE)           │
│  3. Return merged data to client                            │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
Daily Cron (scheduled)
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  DELETE FROM enriched_beers                                 │
│  WHERE enrichment_source = 'description'                    │
│    AND last_seen_at < (now - 1 year)                        │
└─────────────────────────────────────────────────────────────┘
```

## Observability Queries

```sql
-- Count by source and age
SELECT
  enrichment_source,
  CASE
    WHEN last_seen_at > strftime('%s', 'now') * 1000 - 30*24*60*60*1000 THEN 'last_30_days'
    WHEN last_seen_at > strftime('%s', 'now') * 1000 - 90*24*60*60*1000 THEN 'last_90_days'
    WHEN last_seen_at > strftime('%s', 'now') * 1000 - 365*24*60*60*1000 THEN 'last_year'
    ELSE 'older_than_year'
  END as age_bucket,
  COUNT(*) as count
FROM enriched_beers
GROUP BY enrichment_source, age_bucket;

-- Beers at risk of purge (description, not seen in 11+ months)
SELECT id, brew_name, last_seen_at,
  (strftime('%s', 'now') * 1000 - last_seen_at) / (24*60*60*1000) as days_since_seen
FROM enriched_beers
WHERE enrichment_source = 'description'
  AND last_seen_at < strftime('%s', 'now') * 1000 - 330*24*60*60*1000
ORDER BY last_seen_at ASC;
```

## Migration Steps

1. **Deploy schema migration** (run manually or via wrangler)

   ```bash
   npx wrangler d1 execute ufobeer-db --remote --file=migrations/0002_add_last_seen_at.sql
   ```

2. **Deploy updated Worker code** with new `insertPlaceholders()` and cleanup cron

3. **Verify** by calling `/beers` and checking `last_seen_at` is populated:
   ```bash
   npx wrangler d1 execute ufobeer-db --remote --command "
     SELECT id, brew_name, last_seen_at, enrichment_source
     FROM enriched_beers LIMIT 5;
   "
   ```

## Rollback Plan

If issues occur:

1. Revert Worker code to previous version
2. Column can remain (harmless if unused)
3. Or drop column: `ALTER TABLE enriched_beers DROP COLUMN last_seen_at;`

## Staged Rollout (Recommended)

Based on code review feedback, deploy in stages:

### Stage 1: Schema + Upsert (Week 1)

- Deploy migration to add `last_seen_at` column
- Deploy updated `insertPlaceholders()` with ON CONFLICT UPDATE
- Let it run for a week to accumulate data

### Stage 2: Validate (Week 2)

Run observability queries to verify:

```sql
-- Check last_seen_at is being populated
SELECT COUNT(*) as total,
  SUM(CASE WHEN last_seen_at IS NOT NULL THEN 1 ELSE 0 END) as has_last_seen
FROM enriched_beers;

-- Check source distribution
SELECT enrichment_source, COUNT(*) FROM enriched_beers GROUP BY enrichment_source;
```

### Stage 3: Cleanup (Week 3+)

- Deploy cleanup cron job
- Consider starting with 2-year retention, tightening to 1 year later

## Pre-Cleanup Dry Run

Before enabling cleanup, run this to see what would be deleted:

```sql
SELECT COUNT(*) as will_delete,
  MIN(datetime(last_seen_at/1000, 'unixepoch')) as oldest,
  MAX(datetime(last_seen_at/1000, 'unixepoch')) as newest
FROM enriched_beers
WHERE enrichment_source = 'description'
  AND last_seen_at < (strftime('%s', 'now') * 1000 - 365*24*60*60*1000);
```

## Timeline Estimate

- Phase 1 (Schema): Create migration file (~15 min)
- Phase 2 (insertPlaceholders): Update upsert logic (~30 min)
- Phase 3 (Cleanup): Add cron cleanup (~30 min)
- Phase 4 (Analytics): Add tracking (~15 min)

Total: ~1.5 hours implementation + staged rollout over 2-3 weeks
