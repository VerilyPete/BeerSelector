# Circuit Breaker for Perplexity API Costs

This document describes the circuit breaker implementation to prevent runaway costs from Perplexity API usage.

## Problem Statement

Without safeguards, the enrichment system could accumulate unexpected costs:

| Risk            | Scenario                            | Potential Cost                     |
| --------------- | ----------------------------------- | ---------------------------------- |
| Runaway cron    | Bug causes cron to run continuously | Unlimited                          |
| Queue backlog   | Large backlog processes all at once | $0.005 × backlog size              |
| Retry storms    | Transient errors cause mass retries | 3× normal cost                     |
| Manual trigger  | Accidental bulk enrichment          | Unlimited                          |
| Race conditions | Concurrent workers exceed limits    | Limit + (concurrency × batch_size) |

At $0.005 per request, 10,000 uncontrolled requests = $50.

## Solution: Multi-Layer Circuit Breaker

### Layer 1: Daily Request Limit (Atomic Reservation)

Track daily Perplexity API calls using atomic reservation to prevent race conditions.

**Default limit:** 500 requests/day (~$2.50/day, ~$75/month max)

```typescript
// Atomic reservation pattern - prevents race conditions
// Attempts to reserve a slot BEFORE making the API call
const today = new Date().toISOString().split('T')[0];
const dailyLimit = parseInt(env.DAILY_ENRICHMENT_LIMIT || '500');

// Try to atomically increment and check limit in one operation
const reservation = await env.DB.prepare(
  `
  INSERT INTO enrichment_limits (date, request_count, last_updated)
  VALUES (?, 1, ?)
  ON CONFLICT(date) DO UPDATE SET
    request_count = CASE
      WHEN request_count < ? THEN request_count + 1
      ELSE request_count
    END,
    last_updated = ?
  RETURNING request_count, (request_count <= ?) as reserved
`
)
  .bind(today, Date.now(), dailyLimit, Date.now(), dailyLimit)
  .first<{ request_count: number; reserved: number }>();

if (!reservation || !reservation.reserved) {
  console.log(`Daily limit reached (${dailyLimit}), skipping enrichment`);
  message.ack();
  return;
}
// Slot reserved - safe to proceed with API call
```

**Why atomic reservation?**
Without it, multiple concurrent workers could all check the limit, see it's not exceeded, and proceed - collectively exceeding the limit. The atomic pattern reserves a slot before proceeding.

### Layer 2: Monthly Spend Cap

Hard stop when monthly spend approaches budget.

**Default limit:** 2,000 requests/month (~$10/month)

```typescript
// Use date range for efficient indexed query (not LIKE)
const today = new Date().toISOString().split('T')[0];
const monthStart = today.slice(0, 7) + '-01'; // "2025-01-01"
const monthEnd = today.slice(0, 7) + '-31'; // "2025-01-31"

const monthlyCount = await env.DB.prepare(
  `SELECT SUM(request_count) as total FROM enrichment_limits
   WHERE date >= ? AND date <= ?`
)
  .bind(monthStart, monthEnd)
  .first<{ total: number }>();

const monthlyLimit = parseInt(env.MONTHLY_ENRICHMENT_LIMIT || '2000');

if (monthlyCount && monthlyCount.total >= monthlyLimit) {
  console.log(`Monthly limit reached (${monthlyLimit}), enrichment disabled until next month`);
  message.ack();
  return;
}
```

### Layer 3: Kill Switch

Environment variable to instantly disable enrichment without redeploying.

```typescript
if (env.ENRICHMENT_ENABLED === 'false') {
  console.log('Enrichment disabled via kill switch');
  message.ack();
  return;
}
```

**To disable:**

```bash
wrangler secret put ENRICHMENT_ENABLED
# Enter: false

# Verify kill switch is active
curl https://ufobeer.app/health | jq '.enrichment.enabled'
# Should return: false
```

**To re-enable:**

```bash
wrangler secret put ENRICHMENT_ENABLED
# Enter: true
```

### Layer 4: Cron Pre-Check

Check limits BEFORE queuing beers, not just when processing.

```typescript
// In scheduled() handler - check limits before queuing
async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
  // Kill switch check
  if (env.ENRICHMENT_ENABLED === 'false') {
    console.log('Enrichment disabled, skipping cron');
    return;
  }

  // Monthly limit check
  const today = new Date().toISOString().split('T')[0];
  const monthStart = today.slice(0, 7) + '-01';
  const monthEnd = today.slice(0, 7) + '-31';

  const monthlyCount = await env.DB.prepare(
    `SELECT SUM(request_count) as total FROM enrichment_limits
     WHERE date >= ? AND date <= ?`
  ).bind(monthStart, monthEnd).first<{ total: number }>();

  const monthlyLimit = parseInt(env.MONTHLY_ENRICHMENT_LIMIT || '2000');
  if (monthlyCount && monthlyCount.total >= monthlyLimit) {
    console.log('Monthly limit reached, skipping cron');
    return;
  }

  // Daily limit check
  const dailyCount = await env.DB.prepare(
    `SELECT request_count FROM enrichment_limits WHERE date = ?`
  ).bind(today).first<{ request_count: number }>();

  const dailyLimit = parseInt(env.DAILY_ENRICHMENT_LIMIT || '500');
  const currentCount = dailyCount?.request_count || 0;
  const remainingToday = dailyLimit - currentCount;

  if (remainingToday <= 0) {
    console.log('Daily limit reached, skipping cron');
    return;
  }

  // Only queue as many as we can process today
  const batchSize = Math.min(100, remainingToday);

  const beersToEnrich = await env.DB.prepare(`
    SELECT id, brew_name, brewer
    FROM enriched_beers
    WHERE abv IS NULL
    LIMIT ?
  `).bind(batchSize).all();

  // ... queue beers
}
```

### Layer 5: Cron Batch Limit

Hard cap on beers queued per cron run.

```typescript
// In scheduled() handler
const beersToEnrich = await env.DB.prepare(
  `
  SELECT id, brew_name, brewer
  FROM enriched_beers
  WHERE abv IS NULL
  LIMIT 100  -- Hard cap per cron run
`
).all();
```

## Database Schema Addition

Add table to track enrichment requests:

```sql
-- Add to schema.sql
CREATE TABLE IF NOT EXISTS enrichment_limits (
    date TEXT PRIMARY KEY,  -- "2025-01-15" (PRIMARY KEY creates index automatically)
    request_count INTEGER NOT NULL DEFAULT 0,
    last_updated INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);
-- Note: No separate index needed - PRIMARY KEY already creates one
```

## Environment Variables

Add to `wrangler.jsonc`:

```jsonc
{
  "vars": {
    "DAILY_ENRICHMENT_LIMIT": "500",
    "MONTHLY_ENRICHMENT_LIMIT": "2000",
    "ENRICHMENT_ENABLED": "true",
  },
}
```

| Variable                   | Default | Description                           |
| -------------------------- | ------- | ------------------------------------- |
| `DAILY_ENRICHMENT_LIMIT`   | 500     | Max Perplexity requests per day       |
| `MONTHLY_ENRICHMENT_LIMIT` | 2000    | Max Perplexity requests per month     |
| `ENRICHMENT_ENABLED`       | true    | Kill switch to disable all enrichment |

## TypeScript Interface Update

Update `Env` interface in `src/index.ts`:

```typescript
export interface Env {
  DB: D1Database;
  ENRICHMENT_QUEUE: Queue<EnrichmentMessage>;
  ALLOWED_ORIGIN: string;
  RATE_LIMIT_RPM: string;
  PERPLEXITY_API_KEY?: string;
  // Circuit breaker variables
  DAILY_ENRICHMENT_LIMIT?: string;
  MONTHLY_ENRICHMENT_LIMIT?: string;
  ENRICHMENT_ENABLED?: string;
}
```

## Implementation

### Updated Queue Consumer

```typescript
async queue(
  batch: MessageBatch<EnrichmentMessage>,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  // Layer 3: Kill switch
  if (env.ENRICHMENT_ENABLED === 'false') {
    console.log('Enrichment disabled via kill switch');
    for (const message of batch.messages) {
      message.ack();
    }
    return;
  }

  const today = new Date().toISOString().split('T')[0];
  const monthStart = today.slice(0, 7) + '-01';
  const monthEnd = today.slice(0, 7) + '-31';
  const dailyLimit = parseInt(env.DAILY_ENRICHMENT_LIMIT || '500');
  const monthlyLimit = parseInt(env.MONTHLY_ENRICHMENT_LIMIT || '2000');

  // Layer 2: Monthly limit check (fail-safe on D1 error)
  let monthlyCount: { total: number } | null = null;
  try {
    monthlyCount = await env.DB.prepare(
      `SELECT SUM(request_count) as total FROM enrichment_limits
       WHERE date >= ? AND date <= ?`
    ).bind(monthStart, monthEnd).first<{ total: number }>();
  } catch (dbError) {
    console.error('D1 unavailable for monthly limit check:', dbError);
    // Fail-safe: retry later when D1 is available
    for (const message of batch.messages) {
      message.retry();
    }
    return;
  }

  if (monthlyCount && monthlyCount.total >= monthlyLimit) {
    console.log(`Monthly limit reached (${monthlyLimit})`);
    for (const message of batch.messages) {
      message.ack();
    }
    return;
  }

  // Process messages one at a time with atomic reservation
  for (const message of batch.messages) {
    const { beerId, beerName, brewer } = message.body;

    try {
      // Layer 1: Atomic reservation - reserve slot BEFORE API call
      const reservation = await env.DB.prepare(`
        INSERT INTO enrichment_limits (date, request_count, last_updated)
        VALUES (?, 1, ?)
        ON CONFLICT(date) DO UPDATE SET
          request_count = CASE
            WHEN request_count < ? THEN request_count + 1
            ELSE request_count
          END,
          last_updated = ?
        RETURNING request_count, (request_count <= ?) as reserved
      `).bind(today, Date.now(), dailyLimit, Date.now(), dailyLimit)
        .first<{ request_count: number; reserved: number }>();

      if (!reservation || !reservation.reserved) {
        console.log(`Daily limit reached, skipping ${beerId}`);
        message.ack();
        continue;
      }

      // Slot reserved - now make the API call
      // Counter is already incremented, so cost is tracked even if DB update fails
      const abv = await fetchAbvFromPerplexity(env, beerName, brewer);

      if (abv !== null) {
        await env.DB.prepare(`
          UPDATE enriched_beers
          SET abv = ?, confidence = 0.7, updated_at = ?
          WHERE id = ?
        `).bind(abv, Date.now(), beerId).run();

        console.log(`Enriched ${beerId}: ${beerName} -> ABV ${abv}%`);
      } else {
        console.log(`No ABV found for ${beerId}: ${beerName}`);
      }

      message.ack();
    } catch (error) {
      console.error(`Failed to enrich ${beerId}:`, error);
      // Note: Counter was already incremented via reservation
      // This is intentional - we want to track failed API calls too
      message.retry();
    }
  }
}
```

### Updated Scheduled Handler with Pre-Checks

```typescript
async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
  console.log('Cron triggered:', event.cron);

  // Layer 3: Kill switch
  if (env.ENRICHMENT_ENABLED === 'false') {
    console.log('Enrichment disabled via kill switch, skipping cron');
    return;
  }

  const today = new Date().toISOString().split('T')[0];
  const monthStart = today.slice(0, 7) + '-01';
  const monthEnd = today.slice(0, 7) + '-31';
  const dailyLimit = parseInt(env.DAILY_ENRICHMENT_LIMIT || '500');
  const monthlyLimit = parseInt(env.MONTHLY_ENRICHMENT_LIMIT || '2000');

  try {
    // Layer 2: Monthly limit check
    const monthlyCount = await env.DB.prepare(
      `SELECT SUM(request_count) as total FROM enrichment_limits
       WHERE date >= ? AND date <= ?`
    ).bind(monthStart, monthEnd).first<{ total: number }>();

    if (monthlyCount && monthlyCount.total >= monthlyLimit) {
      console.log(`Monthly limit reached (${monthlyLimit}), skipping cron`);
      return;
    }

    // Layer 1: Daily limit check
    const dailyCount = await env.DB.prepare(
      `SELECT request_count FROM enrichment_limits WHERE date = ?`
    ).bind(today).first<{ request_count: number }>();

    const currentCount = dailyCount?.request_count || 0;
    const remainingToday = dailyLimit - currentCount;

    if (remainingToday <= 0) {
      console.log(`Daily limit reached (${dailyLimit}), skipping cron`);
      return;
    }

    // Only queue as many as we can process today (max 100)
    const batchSize = Math.min(100, remainingToday);

    const beersToEnrich = await env.DB.prepare(`
      SELECT id, brew_name, brewer
      FROM enriched_beers
      WHERE abv IS NULL
      LIMIT ?
    `).bind(batchSize).all<{ id: string; brew_name: string; brewer: string }>();

    if (!beersToEnrich.results || beersToEnrich.results.length === 0) {
      console.log('No beers need enrichment');
      return;
    }

    await env.ENRICHMENT_QUEUE.sendBatch(
      beersToEnrich.results.map((beer) => ({
        body: {
          beerId: beer.id,
          beerName: beer.brew_name,
          brewer: beer.brewer,
        },
      }))
    );

    console.log(`Queued ${beersToEnrich.results.length} beers for enrichment (${remainingToday - beersToEnrich.results.length} slots remaining today)`);
  } catch (error) {
    console.error('Failed to queue beers for enrichment:', error);
  }
}
```

### Health Endpoint Enhancement

Add circuit breaker status to health check with error handling:

```typescript
async function handleHealth(env: Env): Promise<Response> {
  try {
    // Test D1 connection
    await env.DB.prepare('SELECT 1').first();

    const today = new Date().toISOString().split('T')[0];
    const monthStart = today.slice(0, 7) + '-01';
    const monthEnd = today.slice(0, 7) + '-31';

    // These queries might fail if table doesn't exist yet - that's ok
    let dailyUsed = 0;
    let monthlyUsed = 0;

    try {
      const dailyCount = await env.DB.prepare(
        `SELECT request_count FROM enrichment_limits WHERE date = ?`
      )
        .bind(today)
        .first<{ request_count: number }>();
      dailyUsed = dailyCount?.request_count || 0;

      const monthlyCount = await env.DB.prepare(
        `SELECT SUM(request_count) as total FROM enrichment_limits
         WHERE date >= ? AND date <= ?`
      )
        .bind(monthStart, monthEnd)
        .first<{ total: number }>();
      monthlyUsed = monthlyCount?.total || 0;
    } catch (limitError) {
      // Table might not exist yet - report as 0 usage
      console.warn('Could not query enrichment_limits:', limitError);
    }

    const dailyLimit = parseInt(env.DAILY_ENRICHMENT_LIMIT || '500');
    const monthlyLimit = parseInt(env.MONTHLY_ENRICHMENT_LIMIT || '2000');

    return Response.json({
      status: 'ok',
      database: 'connected',
      enrichment: {
        enabled: env.ENRICHMENT_ENABLED !== 'false',
        daily: {
          used: dailyUsed,
          limit: dailyLimit,
          remaining: Math.max(0, dailyLimit - dailyUsed),
        },
        monthly: {
          used: monthlyUsed,
          limit: monthlyLimit,
          remaining: Math.max(0, monthlyLimit - monthlyUsed),
        },
      },
    });
  } catch (error) {
    return Response.json(
      {
        status: 'error',
        database: 'disconnected',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 503 }
    );
  }
}
```

**Example health response:**

```json
{
  "status": "ok",
  "database": "connected",
  "enrichment": {
    "enabled": true,
    "daily": {
      "used": 127,
      "limit": 500,
      "remaining": 373
    },
    "monthly": {
      "used": 842,
      "limit": 2000,
      "remaining": 1158
    }
  }
}
```

## Race Condition Prevention

### The Problem

Without atomic operations, concurrent queue consumers could exceed limits:

```
Time    Worker A                    Worker B                    Counter
----    --------                    --------                    -------
T1      Check limit: 499/500        -                           499
T2      499 < 500, proceed          Check limit: 499/500        499
T3      Make API call               499 < 500, proceed          499
T4      -                           Make API call               499
T5      Increment: 499+1=500        -                           500
T6      -                           Increment: 500+1=501        501 ← EXCEEDED!
```

### The Solution

Atomic reservation increments the counter BEFORE proceeding:

```
Time    Worker A                    Worker B                    Counter
----    --------                    --------                    -------
T1      Atomic reserve: 499→500     -                           500
T2      reserved=true, proceed      Atomic reserve: 500→500     500
T3      Make API call               reserved=false, skip        500
T4      Done                        ACK message                 500 ← SAFE!
```

The key insight: We increment first, then check if we were within limits. If not, we skip processing but the counter doesn't over-increment because the CASE statement only increments when below limit.

## Monitoring & Alerts

### Recommended Alerts

Set up in Cloudflare dashboard or via external monitoring:

| Alert                   | Condition             | Action                                           |
| ----------------------- | --------------------- | ------------------------------------------------ |
| Daily limit approaching | daily.remaining < 50  | Review usage patterns                            |
| Daily limit reached     | daily.remaining = 0   | No action needed (by design)                     |
| Monthly limit at 80%    | monthly.used > 1600   | Consider increasing limit or reducing batch size |
| Monthly limit reached   | monthly.remaining = 0 | Enrichment stops until next month                |
| Kill switch activated   | enabled = false       | Investigate why it was disabled                  |

### Manual Queries

```sql
-- Check today's usage
SELECT * FROM enrichment_limits WHERE date = date('now');

-- Check this month's usage (efficient indexed query)
SELECT SUM(request_count) as total
FROM enrichment_limits
WHERE date >= strftime('%Y-%m', 'now') || '-01'
  AND date <= strftime('%Y-%m', 'now') || '-31';

-- Usage by day (last 30 days)
SELECT date, request_count
FROM enrichment_limits
WHERE date > date('now', '-30 days')
ORDER BY date DESC;

-- Reset daily counter (emergency)
UPDATE enrichment_limits SET request_count = 0 WHERE date = date('now');
```

## Cost Projections with Circuit Breaker

| Scenario         | Daily Limit | Monthly Limit | Max Monthly Cost |
| ---------------- | ----------- | ------------- | ---------------- |
| Conservative     | 100         | 500           | $2.50            |
| **Default**      | **500**     | **2000**      | **$10.00**       |
| Aggressive       | 1000        | 5000          | $25.00           |
| Initial backfill | 2000        | 10000         | $50.00           |

## Emergency Procedures

### 1. Immediately Stop All Enrichment

```bash
wrangler secret put ENRICHMENT_ENABLED
# Enter: false

# Verify kill switch is active
curl https://ufobeer.app/health | jq '.enrichment.enabled'
# Should return: false
```

### 2. Check Current Spend

```bash
curl https://ufobeer.app/health | jq '.enrichment'
```

Also check Perplexity dashboard for actual API usage:
https://www.perplexity.ai/settings/api

### 3. Clear Queue (if needed)

```bash
# View queue status
wrangler queues list

# Messages will naturally drain as they're ack'd without processing
# (kill switch causes immediate ack)
```

### 4. Reset Limits (if false positive)

```bash
wrangler d1 execute beer-db --remote --command \
  "UPDATE enrichment_limits SET request_count = 0 WHERE date = date('now')"
```

### 5. Re-enable Enrichment

```bash
wrangler secret put ENRICHMENT_ENABLED
# Enter: true

# Verify enrichment is active
curl https://ufobeer.app/health | jq '.enrichment.enabled'
# Should return: true
```

### 6. Rollback Worker (if circuit breaker code is buggy)

```bash
wrangler rollback
```

## Edge Cases

### Midnight UTC Date Rollover

If a batch starts at 23:59:59 and finishes at 00:00:01:

- The atomic reservation uses the date at reservation time
- Each message gets its own reservation with current date
- Minor accounting variation possible but no cost overrun

### D1 Database Unavailability

If D1 is unavailable when checking limits:

- Monthly check fails → messages retry (fail-safe)
- Atomic reservation fails → messages retry (fail-safe)
- This prevents processing when we can't track costs

### First Run - Table Doesn't Exist

The health endpoint handles missing table gracefully (returns 0 usage).
The queue consumer will fail on first reservation attempt, causing retry.
**Important:** Apply schema.sql before enabling enrichment.

### Queue Consumer Concurrency

With `max_concurrency: 10` and `max_batch_size: 1`:

- Maximum 10 concurrent workers, each processing 1 message
- Atomic reservation prevents all 10 from exceeding limit
- Worst case: 10 simultaneous reservations, all succeed if under limit

## Future Enhancements

1. **Cloudflare Analytics integration** - Track spend in real-time dashboard
2. **Slack/email alerts** - Notify when limits are approaching
3. **Automatic backoff** - Reduce batch size when approaching limits
4. **Cost attribution** - Track which beers/stores drive the most enrichment
5. **Perplexity billing API** - If available, check actual spend vs. request count
6. **Reserved vs completed tracking** - Separate columns for better accounting
