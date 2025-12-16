# Force Re-Enrichment: Helper Functions

## Check Enrichment Quota (New Helper)

Extract the quota checking logic from `handleEnrichmentTrigger` into a reusable function to be used by both the trigger endpoint and the force re-enrichment endpoint.

```typescript
interface EnrichmentQuotaStatus {
  canProcess: boolean;
  skipReason?: 'kill_switch' | 'daily_limit' | 'monthly_limit';
  daily: { used: number; limit: number; remaining: number };
  monthly: { used: number; limit: number; remaining: number };
}

async function getEnrichmentQuotaStatus(db: D1Database, env: Env): Promise<EnrichmentQuotaStatus> {
  const dailyLimit = parseInt(env.DAILY_ENRICHMENT_LIMIT || '500');
  const monthlyLimit = parseInt(env.MONTHLY_ENRICHMENT_LIMIT || '2000');
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const monthStart = today.slice(0, 7) + '-01';
  // Calculate last day of current month
  const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const monthEnd = today.slice(0, 7) + '-' + String(lastDayOfMonth).padStart(2, '0');

  // Layer 3: Kill switch check
  if (env.ENRICHMENT_ENABLED === 'false') {
    return {
      canProcess: false,
      skipReason: 'kill_switch',
      daily: { used: 0, limit: dailyLimit, remaining: dailyLimit },
      monthly: { used: 0, limit: monthlyLimit, remaining: monthlyLimit },
    };
  }

  // Get current quota usage (read-only)
  let dailyUsed = 0;
  let monthlyUsed = 0;

  try {
    const dailyCount = await db
      .prepare(`SELECT request_count FROM enrichment_limits WHERE date = ?`)
      .bind(today)
      .first<{ request_count: number }>();
    dailyUsed = dailyCount?.request_count || 0;

    const monthlyCount = await db
      .prepare(
        `SELECT SUM(request_count) as total FROM enrichment_limits
       WHERE date >= ? AND date <= ?`
      )
      .bind(monthStart, monthEnd)
      .first<{ total: number }>();
    monthlyUsed = monthlyCount?.total || 0;
  } catch (dbError) {
    console.error(`[quota] D1 unavailable:`, dbError);
    // Fail closed if DB is down
    return {
      canProcess: false,
      skipReason: 'kill_switch', // Effectively a kill switch if DB is down
      daily: { used: 0, limit: dailyLimit, remaining: 0 },
      monthly: { used: 0, limit: monthlyLimit, remaining: 0 },
    };
  }

  // Layer 2: Monthly limit check
  if (monthlyUsed >= monthlyLimit) {
    return {
      canProcess: false,
      skipReason: 'monthly_limit',
      daily: { used: dailyUsed, limit: dailyLimit, remaining: Math.max(0, dailyLimit - dailyUsed) },
      monthly: { used: monthlyUsed, limit: monthlyLimit, remaining: 0 },
    };
  }

  // Layer 1: Daily limit check
  const dailyRemaining = dailyLimit - dailyUsed;
  if (dailyRemaining <= 0) {
    return {
      canProcess: false,
      skipReason: 'daily_limit',
      daily: { used: dailyUsed, limit: dailyLimit, remaining: 0 },
      monthly: {
        used: monthlyUsed,
        limit: monthlyLimit,
        remaining: Math.max(0, monthlyLimit - monthlyUsed),
      },
    };
  }

  return {
    canProcess: true,
    daily: { used: dailyUsed, limit: dailyLimit, remaining: dailyRemaining },
    monthly: {
      used: monthlyUsed,
      limit: monthlyLimit,
      remaining: Math.max(0, monthlyLimit - monthlyUsed),
    },
  };
}
```

## Query Beers for Re-Enrichment

```typescript
async function queryBeersForReEnrichment(
  db: D1Database,
  options: {
    beerIds?: string[];
    criteria?: ForceEnrichmentRequest['criteria'];
    limit: number;
  }
): Promise<{ beers: BeerToReEnrich[]; totalMatched: number; hasMore: boolean }> {
  if (options.beerIds && options.beerIds.length > 0) {
    // Mode 1: By specific IDs
    const placeholders = options.beerIds.map(() => '?').join(',');

    const countResult = await db
      .prepare(
        `SELECT COUNT(*) as total FROM enriched_beers
       WHERE id IN (${placeholders}) AND abv IS NOT NULL`
      )
      .bind(...options.beerIds)
      .first<{ total: number }>();

    const { results } = await db
      .prepare(
        `SELECT id, brew_name, brewer, abv, confidence, enrichment_source, updated_at
       FROM enriched_beers
       WHERE id IN (${placeholders}) AND abv IS NOT NULL
       ORDER BY updated_at ASC
       LIMIT ?`
      )
      .bind(...options.beerIds, options.limit + 1)
      .all<BeerToReEnrich>();

    const beers = results || [];
    const hasMore = beers.length > options.limit;
    if (hasMore) beers.pop();

    return { beers, totalMatched: countResult?.total || 0, hasMore };
  }

  // Mode 2: By criteria
  const conditions: string[] = ['abv IS NOT NULL'];
  const bindings: (string | number)[] = [];

  if (options.criteria?.confidence_below !== undefined) {
    conditions.push('confidence < ?');
    bindings.push(options.criteria.confidence_below);
  }

  if (options.criteria?.enrichment_older_than_days !== undefined) {
    const cutoffMs = Date.now() - options.criteria.enrichment_older_than_days * 24 * 60 * 60 * 1000;
    conditions.push('updated_at < ?');
    bindings.push(cutoffMs);
  }

  if (options.criteria?.enrichment_source !== undefined) {
    conditions.push('enrichment_source = ?');
    bindings.push(options.criteria.enrichment_source);
  }

  const whereClause = conditions.join(' AND ');

  const countResult = await db
    .prepare(`SELECT COUNT(*) as total FROM enriched_beers WHERE ${whereClause}`)
    .bind(...bindings)
    .first<{ total: number }>();

  const { results } = await db
    .prepare(
      `SELECT id, brew_name, brewer, abv, confidence, enrichment_source, updated_at
     FROM enriched_beers
     WHERE ${whereClause}
     ORDER BY updated_at ASC
     LIMIT ?`
    )
    .bind(...bindings, options.limit + 1)
    .all<BeerToReEnrich>();

  const beers = results || [];
  const hasMore = beers.length > options.limit;
  if (hasMore) beers.pop();

  return { beers, totalMatched: countResult?.total || 0, hasMore };
}
```

## Clear Enrichment Data (with Optimistic Locking)

```typescript
interface ClearResult {
  clearedCount: number;
  skippedCount: number;
  skippedIds: string[];
  clearedIds: string[];
}

async function clearEnrichmentData(
  db: D1Database,
  beers: BeerToReEnrich[],
  dryRun: boolean
): Promise<ClearResult> {
  if (dryRun) {
    return {
      clearedCount: beers.length,
      skippedCount: 0,
      skippedIds: [],
      clearedIds: beers.map(b => b.id),
    };
  }

  const clearedIds: string[] = [];
  const skippedIds: string[] = [];
  const now = Date.now();

  for (const beer of beers) {
    // Optimistic locking: only update if updated_at matches what we queried
    // This prevents overwriting concurrent imports
    const result = await db
      .prepare(
        `UPDATE enriched_beers
       SET abv = NULL, confidence = NULL, enrichment_source = NULL, updated_at = ?
       WHERE id = ? AND updated_at = ?`
      )
      .bind(now, beer.id, beer.updated_at)
      .run();

    if (result.meta.changes > 0) {
      clearedIds.push(beer.id);
    } else {
      // Beer was modified since we queried - skip it
      skippedIds.push(beer.id);
    }
  }

  return {
    clearedCount: clearedIds.length,
    skippedCount: skippedIds.length,
    skippedIds,
    clearedIds,
  };
}
```

## Audit Logging

Use the existing `writeAdminAuditLog()` function.

**Important Implementation Note:**
The existing `writeAdminAuditLog` function in `src/index.ts` attempts to `JSON.stringify` the `details` object but the underlying SQL INSERT statement does _not_ currently include a `details_json` column.
For this feature, we will use **Option 1 from the Schema plan** (No new tables/columns).

- **Cons**: We won't strictly persist the detailed list of cleared IDs in the DB audit log.
- **Mitigation**: We will continue to log these details to the Cloudflare Worker logs via `console.log`.
- **Action**: When calling `writeAdminAuditLog`, ensure we don't cause SQL errors by passing bound parameters that don't match the query placeholders. The current `writeAdminAuditLog` implementation in `src/index.ts` (lines 333-346) might need a quick fix to align the SQL string with the bound values if it's currently broken, or we should just pass `{}` for details if we want to be safe, while logging the real details to console.

```typescript
// In the handler, after completing the operation:
ctx.waitUntil(
  writeAdminAuditLog(
    env.DB,
    requestContext,
    'enrich_force',
    {
      queued_count: clearResult.clearedCount,
      skipped_count: clearResult.skippedCount,
      matched_count: queryResult.totalMatched,
      dry_run: dryRun,
      // Note: cleared_beer_ids logged to console, not stored (keep audit log small)
    },
    adminSecretHash
  )
);

// Also log details to console for debugging
console.log(`[force] requestId=${reqCtx.requestId} cleared=${clearResult.clearedIds.join(',')}`);
```
