# Plan: Manual Enrichment Trigger Admin Endpoint

## Overview

Add a new `POST /admin/enrich/trigger` endpoint to allow manual triggering of the beer enrichment process, which currently only runs via cron job every 12 hours.

## Background

The enrichment system:

- Queries beers with NULL ABV from D1 database
- Sends them to `beer-enrichment` Cloudflare Queue for processing
- Queue consumers call Perplexity API to enrich beer data
- Has rate limiting: 500 requests/day, 2000 requests/month
- Has kill switch via `ENRICHMENT_ENABLED` environment variable
- Admin endpoints use API key authentication via `X-API-Key` header
- **The queue consumer is the single source of truth for quota reservation**

## Requirements

1. **Manual Trigger**: Allow triggering enrichment without waiting for 12-hour cron
2. **Respect Existing Limits**: Honor daily/monthly limits and kill switch
3. **Useful Feedback**: Return beers queued, quota remaining, etc.
4. **Security**: Use existing API key + admin secret authentication pattern

---

## API Specification

### Endpoint

```
POST /admin/enrich/trigger
```

### Headers

| Header           | Required | Description                          |
| ---------------- | -------- | ------------------------------------ |
| `X-API-Key`      | Yes      | API key for authentication           |
| `X-Admin-Secret` | Yes      | Admin secret for elevated operations |
| `Content-Type`   | Yes      | `application/json`                   |

### Request Body

```typescript
interface TriggerEnrichmentRequest {
  /** Maximum number of beers to queue (default: 50, max: 100) */
  limit?: number;

  /** Only queue beers that have never been attempted (exclude DLQ failures) */
  exclude_failures?: boolean;
}
```

**Note**: `store_id` and `delay_seconds` parameters are reserved for future implementation.

### Response Body

```typescript
interface TriggerEnrichmentResponse {
  success: boolean;
  requestId: string;
  data?: {
    /** Number of beers queued for enrichment */
    beers_queued: number;

    /** Reason if no beers were queued */
    skip_reason?: 'kill_switch' | 'daily_limit' | 'monthly_limit' | 'no_eligible_beers';

    /** Current quota status (at time of trigger - consumer handles actual reservation) */
    quota: {
      daily: {
        used: number;
        limit: number;
        remaining: number;
      };
      monthly: {
        used: number;
        limit: number;
        remaining: number;
      };
    };

    /** Enrichment enabled status */
    enabled: boolean;

    /** Applied filters */
    filters: {
      exclude_failures: boolean;
    };
  };
  error?: {
    message: string;
    code: string;
  };
}
```

### Example Requests

**Trigger with defaults (up to 50 beers):**

```bash
curl -X POST \
  -H "X-API-Key: $API_KEY" \
  -H "X-Admin-Secret: $ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{}' \
  "https://ufobeer.app/admin/enrich/trigger"
```

**Trigger with custom limit:**

```bash
curl -X POST \
  -H "X-API-Key: $API_KEY" \
  -H "X-Admin-Secret: $ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"limit": 25}' \
  "https://ufobeer.app/admin/enrich/trigger"
```

**Trigger excluding failed beers:**

```bash
curl -X POST \
  -H "X-API-Key: $API_KEY" \
  -H "X-Admin-Secret: $ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"limit": 100, "exclude_failures": true}' \
  "https://ufobeer.app/admin/enrich/trigger"
```

### Example Responses

**Successful trigger:**

```json
{
  "success": true,
  "requestId": "abc123-def456",
  "data": {
    "beers_queued": 50,
    "quota": {
      "daily": {
        "used": 127,
        "limit": 500,
        "remaining": 373
      },
      "monthly": {
        "used": 842,
        "limit": 2000,
        "remaining": 1108
      }
    },
    "enabled": true,
    "filters": {
      "exclude_failures": false
    }
  }
}
```

**Blocked by daily limit:**

```json
{
  "success": true,
  "requestId": "abc123-def456",
  "data": {
    "beers_queued": 0,
    "skip_reason": "daily_limit",
    "quota": {
      "daily": {
        "used": 500,
        "limit": 500,
        "remaining": 0
      },
      "monthly": {
        "used": 1200,
        "limit": 2000,
        "remaining": 800
      }
    },
    "enabled": true,
    "filters": {
      "exclude_failures": false
    }
  }
}
```

**Kill switch active:**

```json
{
  "success": true,
  "requestId": "abc123-def456",
  "data": {
    "beers_queued": 0,
    "skip_reason": "kill_switch",
    "quota": {
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
    },
    "enabled": false,
    "filters": {
      "exclude_failures": false
    }
  }
}
```

**Invalid request:**

```json
{
  "success": false,
  "requestId": "abc123-def456",
  "error": {
    "message": "limit must be a number between 1 and 100",
    "code": "INVALID_LIMIT"
  }
}
```

**Missing admin secret:**

```json
{
  "success": false,
  "requestId": "abc123-def456",
  "error": {
    "message": "Admin authentication required",
    "code": "ADMIN_AUTH_REQUIRED"
  }
}
```

---

## Critical Design Decision: Quota Reservation

### Problem: Double-Counting Risk

The existing queue consumer (`handleEnrichmentBatch` in `src/index.ts`) **already reserves quota** when processing each message:

```typescript
// From src/index.ts line 1648
const reservation = await env.DB.prepare(...INSERT...ON CONFLICT DO UPDATE...).run();
```

If the trigger endpoint ALSO reserves quota, each beer would be counted twice against the daily limit.

### Solution: Trigger Only Checks, Consumer Reserves

The trigger endpoint will:

1. **CHECK** current quota status (read-only)
2. **CALCULATE** how many beers can be queued based on remaining quota
3. **QUEUE** messages to the enrichment queue
4. **NOT INCREMENT** the quota counter (consumer handles this)

This means the consumer remains the **single source of truth** for quota reservation.

### Trade-off

The trigger might report "queued 50 beers" but if the limit is hit between triggering and processing, some messages may be dropped by the consumer. This is acceptable because:

- It's a rare race condition (milliseconds window)
- It's preferable to double-counting
- The consumer logs dropped messages for visibility

---

## Prerequisites

### Verify `enrichment_limits` Table Exists

The quota tracking requires this table in D1. Verify it exists:

```sql
-- Check if table exists
SELECT name FROM sqlite_master WHERE type='table' AND name='enrichment_limits';

-- If not, create it:
CREATE TABLE IF NOT EXISTS enrichment_limits (
    date TEXT PRIMARY KEY,        -- YYYY-MM-DD format
    request_count INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_enrichment_limits_date ON enrichment_limits(date);
```

### Verify Env Interface

Ensure these bindings are in the `Env` interface:

```typescript
export interface Env {
  // ... existing bindings ...
  DB: D1Database;
  ENRICHMENT_QUEUE: Queue<EnrichmentMessage>;
  ADMIN_SECRET: string;
  DAILY_ENRICHMENT_LIMIT?: string;
  MONTHLY_ENRICHMENT_LIMIT?: string;
  ENRICHMENT_ENABLED?: string;
}
```

---

## Implementation Plan

### Phase 1: Request Validation

**File: `src/index.ts` (or appropriate handler file)**

```typescript
interface TriggerEnrichmentRequest {
  limit?: number;
  exclude_failures?: boolean;
}

function validateTriggerRequest(body: unknown): {
  valid: boolean;
  error?: string;
  errorCode?: string;
  request?: TriggerEnrichmentRequest;
} {
  if (body === null || typeof body !== 'object') {
    return { valid: true, request: {} }; // Empty body is valid
  }

  const req = body as TriggerEnrichmentRequest;

  // Validate limit (max 100 to stay within queue batch limits)
  if (req.limit !== undefined) {
    if (typeof req.limit !== 'number' || req.limit < 1 || req.limit > 100) {
      return {
        valid: false,
        error: 'limit must be a number between 1 and 100',
        errorCode: 'INVALID_LIMIT',
      };
    }
  }

  // Validate exclude_failures
  if (req.exclude_failures !== undefined) {
    if (typeof req.exclude_failures !== 'boolean') {
      return {
        valid: false,
        error: 'exclude_failures must be a boolean',
        errorCode: 'INVALID_EXCLUDE_FAILURES',
      };
    }
  }

  return { valid: true, request: req };
}
```

### Phase 2: Reuse Existing Admin Authentication

**Do NOT create a new `verifyAdminSecret` function.**

The existing `authorizeAdmin` function (lines 264-287 of `src/index.ts`) already handles admin authentication with proper error logging and formatting.

```typescript
// Existing function to reuse:
async function authorizeAdmin(request: Request, env: Env): Promise<AuthResult> {
  // ... existing implementation ...
}
```

### Phase 3: Quota Checking Helper (Read-Only)

Create a reusable helper for checking quotas. **This only reads the current status - it does NOT increment.**

```typescript
interface QuotaStatus {
  enabled: boolean;
  daily: {
    used: number;
    limit: number;
    remaining: number;
  };
  monthly: {
    used: number;
    limit: number;
    remaining: number;
  };
  canProcess: boolean;
  skipReason?: 'kill_switch' | 'daily_limit' | 'monthly_limit';
}

async function getEnrichmentQuotaStatus(db: D1Database, env: Env): Promise<QuotaStatus> {
  const enabled = env.ENRICHMENT_ENABLED !== 'false';
  const dailyLimit = parseInt(env.DAILY_ENRICHMENT_LIMIT || '500');
  const monthlyLimit = parseInt(env.MONTHLY_ENRICHMENT_LIMIT || '2000');

  const today = new Date().toISOString().split('T')[0];
  const monthPrefix = today.slice(0, 7); // e.g., "2024-12"

  // Get daily count (READ ONLY - no increment)
  const dailyCount = await db
    .prepare(`SELECT request_count FROM enrichment_limits WHERE date = ?`)
    .bind(today)
    .first<{ request_count: number }>();
  const dailyUsed = dailyCount?.request_count || 0;

  // Get monthly count (use LIKE for correct month range)
  const monthlyCount = await db
    .prepare(`SELECT SUM(request_count) as total FROM enrichment_limits WHERE date LIKE ?`)
    .bind(monthPrefix + '%')
    .first<{ total: number }>();
  const monthlyUsed = monthlyCount?.total || 0;

  const dailyRemaining = Math.max(0, dailyLimit - dailyUsed);
  const monthlyRemaining = Math.max(0, monthlyLimit - monthlyUsed);

  // Determine if processing is allowed
  let canProcess = true;
  let skipReason: QuotaStatus['skipReason'] = undefined;

  if (!enabled) {
    canProcess = false;
    skipReason = 'kill_switch';
  } else if (dailyRemaining <= 0) {
    canProcess = false;
    skipReason = 'daily_limit';
  } else if (monthlyRemaining <= 0) {
    canProcess = false;
    skipReason = 'monthly_limit';
  }

  return {
    enabled,
    daily: {
      used: dailyUsed,
      limit: dailyLimit,
      remaining: dailyRemaining,
    },
    monthly: {
      used: monthlyUsed,
      limit: monthlyLimit,
      remaining: monthlyRemaining,
    },
    canProcess,
    skipReason,
  };
}
```

### Phase 4: Beer Query Helper

```typescript
interface BeerToEnrich {
  id: string;
  brew_name: string;
  brewer: string | null;
}

async function queryBeersForEnrichment(
  db: D1Database,
  options: {
    limit: number;
    excludeFailures?: boolean;
  }
): Promise<BeerToEnrich[]> {
  let query = `
    SELECT id, brew_name, brewer
    FROM enriched_beers
    WHERE abv IS NULL
  `;
  const bindings: (string | number)[] = [];

  // Exclude beers that have pending DLQ entries
  if (options.excludeFailures) {
    query += ` AND id NOT IN (
      SELECT beer_id FROM dlq_messages WHERE status = 'pending'
    )`;
  }

  query += ` ORDER BY updated_at ASC LIMIT ?`;
  bindings.push(options.limit);

  const { results } = await db
    .prepare(query)
    .bind(...bindings)
    .all<BeerToEnrich>();
  return results || [];
}
```

### Phase 5: Handler Implementation

**Key change: NO quota reservation in the trigger. Just check + queue.**

```typescript
async function handleTriggerEnrichment(
  request: Request,
  env: Env,
  headers: Record<string, string>,
  reqCtx: RequestContext
): Promise<Response> {
  // Verify queue binding exists
  if (!env.ENRICHMENT_QUEUE) {
    log('error', 'ENRICHMENT_QUEUE not configured', {}, reqCtx.requestId);
    return Response.json(
      {
        success: false,
        requestId: reqCtx.requestId,
        error: {
          message: 'Queue not configured',
          code: 'QUEUE_NOT_CONFIGURED',
        },
      },
      { status: 500, headers }
    );
  }

  // Verify admin authentication (reuse existing authorizeAdmin)
  const adminAuth = await authorizeAdmin(request, env);
  if (!adminAuth.authorized) {
    return Response.json(
      {
        success: false,
        requestId: reqCtx.requestId,
        error: {
          message: 'Admin authentication required',
          code: 'ADMIN_AUTH_REQUIRED',
        },
      },
      { status: 401, headers }
    );
  }

  // Parse and validate request body
  let body: unknown = {};
  try {
    const text = await request.text();
    if (text.trim()) {
      body = JSON.parse(text);
    }
  } catch (e) {
    return Response.json(
      {
        success: false,
        requestId: reqCtx.requestId,
        error: {
          message: 'Invalid JSON in request body',
          code: 'INVALID_JSON',
        },
      },
      { status: 400, headers }
    );
  }

  const validation = validateTriggerRequest(body);
  if (!validation.valid) {
    return Response.json(
      {
        success: false,
        requestId: reqCtx.requestId,
        error: {
          message: validation.error,
          code: validation.errorCode,
        },
      },
      { status: 400, headers }
    );
  }

  const req = validation.request!;
  const requestedLimit = req.limit || 50;
  const excludeFailures = req.exclude_failures || false;

  // Get current quota status (READ ONLY - no reservation)
  const quota = await getEnrichmentQuotaStatus(env.DB, env);

  // Build response helper
  const buildResponse = (quotaStatus: QuotaStatus) => ({
    quota: {
      daily: quotaStatus.daily,
      monthly: quotaStatus.monthly,
    },
    enabled: quotaStatus.enabled,
    filters: {
      exclude_failures: excludeFailures,
    },
  });

  // Check if we can process
  if (!quota.canProcess) {
    log('info', 'Enrichment trigger blocked', { reason: quota.skipReason }, reqCtx.requestId);

    return Response.json(
      {
        success: true,
        requestId: reqCtx.requestId,
        data: {
          beers_queued: 0,
          skip_reason: quota.skipReason,
          ...buildResponse(quota),
        },
      },
      { headers }
    );
  }

  // Calculate effective limit based on remaining quota
  // Cap at remaining quota to avoid queuing more than can be processed
  const effectiveLimit = Math.min(
    requestedLimit,
    quota.daily.remaining,
    quota.monthly.remaining,
    100 // Hard cap at 100 for queue batch limit
  );

  // Query beers needing enrichment
  const beers = await queryBeersForEnrichment(env.DB, {
    limit: effectiveLimit,
    excludeFailures,
  });

  if (beers.length === 0) {
    log('info', 'No beers need enrichment', { excludeFailures }, reqCtx.requestId);

    return Response.json(
      {
        success: true,
        requestId: reqCtx.requestId,
        data: {
          beers_queued: 0,
          skip_reason: 'no_eligible_beers',
          ...buildResponse(quota),
        },
      },
      { headers }
    );
  }

  // Queue beers for enrichment
  // NOTE: We do NOT reserve quota here - the consumer handles that
  try {
    await env.ENRICHMENT_QUEUE.sendBatch(
      beers.map(beer => ({
        body: {
          beer_id: beer.id,
          beer_name: beer.brew_name,
          brewer: beer.brewer,
        },
      }))
    );

    log(
      'info',
      'Manually triggered enrichment',
      {
        beersQueued: beers.length,
        requestedLimit,
        effectiveLimit,
        excludeFailures,
        dailyRemaining: quota.daily.remaining,
        monthlyRemaining: quota.monthly.remaining,
      },
      reqCtx.requestId
    );

    // Track analytics
    if (env.ANALYTICS) {
      env.ANALYTICS.writeDataPoint({
        blobs: ['manual_enrich_trigger'],
        doubles: [beers.length, quota.daily.remaining, quota.monthly.remaining],
        indexes: ['manual_enrich_trigger'],
      });
    }

    return Response.json(
      {
        success: true,
        requestId: reqCtx.requestId,
        data: {
          beers_queued: beers.length,
          ...buildResponse(quota),
        },
      },
      { headers }
    );
  } catch (error) {
    log(
      'error',
      'Failed to queue beers for enrichment',
      { error: String(error) },
      reqCtx.requestId
    );

    return Response.json(
      {
        success: false,
        requestId: reqCtx.requestId,
        error: {
          message: 'Failed to queue beers for enrichment',
          code: 'QUEUE_ERROR',
        },
      },
      { status: 500, headers }
    );
  }
}
```

### Phase 6: Route Registration

Add the route to the main fetch handler:

```typescript
// In the fetch handler, within the admin routes section:

// Route: POST /admin/enrich/trigger
if (url.pathname === '/admin/enrich/trigger' && request.method === 'POST') {
  return handleTriggerEnrichment(
    request,
    env,
    { ...corsHeaders!, ...rateLimitHeaders },
    requestContext
  );
}
```

---

## Testing Plan

### Unit Tests

1. **Request Validation**
   - Empty body (should default to 50 limit)
   - Valid limit values (1, 50, 100)
   - Invalid limit values (0, -1, 101, "string")
   - Valid exclude_failures (true, false)
   - Invalid exclude_failures ("string", 123)

2. **Admin Authentication**
   - Missing X-Admin-Secret header (401)
   - Invalid admin secret (401)
   - Valid admin secret (passes)

3. **Quota Checking (Read-Only)**
   - Kill switch enabled vs disabled
   - Daily limit not reached
   - Daily limit exactly reached
   - Daily limit exceeded
   - Monthly limit not reached
   - Monthly limit exceeded

4. **Beer Querying**
   - Returns beers with NULL ABV
   - Respects limit parameter
   - Excludes DLQ failures when flag set
   - Orders by oldest first
   - Returns empty array when no beers match

5. **Edge Case: Near-Full Quota**
   - 499/500 daily used, trigger requests 10 → should queue only 1
   - Verify consumer drops extras if limit hit between trigger and processing

### Integration Tests

```bash
# Test 1: Basic trigger (requires ADMIN_SECRET)
curl -X POST \
  -H "X-API-Key: $API_KEY" \
  -H "X-Admin-Secret: $ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{}' \
  "https://ufobeer.app/admin/enrich/trigger"

# Test 2: With custom limit
curl -X POST \
  -H "X-API-Key: $API_KEY" \
  -H "X-Admin-Secret: $ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"limit": 10}' \
  "https://ufobeer.app/admin/enrich/trigger"

# Test 3: Exclude failures
curl -X POST \
  -H "X-API-Key: $API_KEY" \
  -H "X-Admin-Secret: $ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"exclude_failures": true}' \
  "https://ufobeer.app/admin/enrich/trigger"

# Test 4: Missing admin secret (expect 401)
curl -X POST \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}' \
  "https://ufobeer.app/admin/enrich/trigger"

# Test 5: Invalid limit (expect 400)
curl -X POST \
  -H "X-API-Key: $API_KEY" \
  -H "X-Admin-Secret: $ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"limit": 200}' \
  "https://ufobeer.app/admin/enrich/trigger"

# Test 6: Monitor processing
wrangler tail --format=pretty
```

---

## Deployment Steps

### 1. Verify Prerequisites

```bash
# Check enrichment_limits table exists
wrangler d1 execute beer-db --remote --command \
  "SELECT name FROM sqlite_master WHERE type='table' AND name='enrichment_limits'"

# If missing, create it
wrangler d1 execute beer-db --remote --command \
  "CREATE TABLE IF NOT EXISTS enrichment_limits (
    date TEXT PRIMARY KEY,
    request_count INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
  )"
```

### 2. Verify Admin Secret is Set

```bash
# Admin secret should already exist for DLQ endpoints
# If not, set it:
wrangler secret put ADMIN_SECRET
# Enter a strong random string
```

### 3. Update Worker Code

Add the new endpoint handler and helper functions to `src/index.ts`.

### 4. Deploy

```bash
cd ufobeer
wrangler deploy
```

### 5. Verify Deployment

```bash
# Check health endpoint still works
curl https://ufobeer.app/health | jq

# Test new endpoint
curl -X POST \
  -H "X-API-Key: $API_KEY" \
  -H "X-Admin-Secret: $ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"limit": 1}' \
  "https://ufobeer.app/admin/enrich/trigger"
```

### 6. Monitor

```bash
# Watch logs for trigger events
wrangler tail --format=pretty | grep -E "(manual|trigger|enrich)"
```

---

## Rollback Plan

If issues arise:

1. **Quick fix**: Activate kill switch

   ```bash
   wrangler secret put ENRICHMENT_ENABLED
   # Enter: false
   ```

2. **Full rollback**: Revert to previous Worker version

   ```bash
   wrangler rollback
   ```

3. **Queue drain**: If queue is backed up, messages will naturally process or fail to DLQ

---

## Security Considerations

1. **Rate Limiting**: The endpoint respects the existing rate limit (RATE_LIMIT_RPM) per client.

2. **Dual Authentication**: Requires both API key AND admin secret for defense-in-depth.

3. **Quota Constraints**: Limited by daily (500) and monthly (2000) enrichment limits (enforced by consumer).

4. **Audit Logging**: All requests are logged with request ID.

5. **Input Validation**: All parameters are strictly validated before use.

6. **Queue Binding Verification**: Fails fast if queue is not configured.

---

## Future Enhancements

1. **Store ID Filtering**: Add `store_beer_sightings` table to track which beers are at which stores, enabling store-specific enrichment triggers.

2. **Delay Support**: Add `delay_seconds` parameter for delayed queue processing.

3. **Dry Run Mode**: Add `dry_run: true` parameter that returns what would be queued without actually queuing.

4. **Webhook Notification**: Send webhook when manual enrichment completes.

5. **Status Endpoint**: Add `GET /admin/enrich/status` for quota-only queries without triggering.

---

## Files to Modify

| File                                   | Change                                  |
| -------------------------------------- | --------------------------------------- |
| `src/index.ts`                         | Add handler, validation, helpers, route |
| `docs/enrichment/cloudflare/worker.md` | Document new endpoint                   |
| `docs/enrichment/plan.md`              | Add to Phase 3 enhancements             |

---

## Checklist

- [ ] Verify `enrichment_limits` table exists in D1
- [ ] Verify `ADMIN_SECRET` is set (should exist for DLQ endpoints)
- [ ] Add `validateTriggerRequest()` function
- [ ] Add `getEnrichmentQuotaStatus()` helper (read-only)
- [ ] Add `queryBeersForEnrichment()` helper
- [ ] Add `handleTriggerEnrichment()` handler (uses existing `authorizeAdmin`)
- [ ] Register route in fetch handler
- [ ] Add analytics tracking
- [ ] Write unit tests
- [ ] Deploy to staging/dev
- [ ] Run integration tests
- [ ] Deploy to production
- [ ] Update documentation

---

## Review Changes Summary

### Initial Review (v1)

This plan was updated based on expert review to address:

**High Priority Fixes**

- Queue batch limit: Capped at 100 beers (Cloudflare Queue `sendBatch()` limit)
- Schema verification: Added prerequisite section for `enrichment_limits` table

**Medium Priority Fixes**

- Removed `store_id`: Not implemented, noted as future enhancement
- Added admin secret: Requires `X-Admin-Secret` header for defense-in-depth

**Low Priority Fixes**

- Fixed month query: Uses `LIKE` prefix match instead of invalid date range
- Queue binding check: Verifies `ENRICHMENT_QUEUE` exists before processing

**Simplifications**

- Removed `store_id` parameter (not implemented)
- Removed `delay_seconds` parameter (limited use case)
- Default limit changed to 50 (was 100)
- Max limit capped at 100 (was 500)

### Code Review (v2)

This plan was further updated based on code review feedback:

**Critical Fix: Quota Double-Counting**

- **Problem**: Original plan had trigger reserving quota AND consumer reserving quota → double-counting
- **Solution**: Removed all quota reservation from trigger. Consumer is single source of truth.
- Trigger now only: CHECK quota (read-only) → QUEUE messages → NO INCREMENT

**Minor Fix: Redundant Auth Helper**

- Removed new `verifyAdminSecret` function
- Reuse existing `authorizeAdmin` function (lines 264-287 of `src/index.ts`)

**Removed Functions (No Longer Needed)**

- ~~`reserveQuota()`~~ - Consumer handles this
- ~~`rollbackQuota()`~~ - Not needed since trigger doesn't reserve

**Added Documentation**

- "Critical Design Decision" section explaining why trigger doesn't reserve quota
- Trade-off explanation: trigger may report "queued X" but consumer may drop some if limit hit
