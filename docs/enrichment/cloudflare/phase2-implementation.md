# Phase 2: Worker Core Functionality - Implementation Guide

This guide walks through implementing the proxy endpoints, security layer, and audit logging for the ufobeer Cloudflare Worker.

## Prerequisites

Before starting Phase 2, ensure Phase 1 is complete:

- [x] Wrangler CLI installed and authenticated
- [x] D1 database created (`beer-db`)
- [x] Cloudflare Queues created (`beer-enrichment`, `beer-enrichment-dlq`)
- [x] Worker deployed with `/health` endpoint
- [x] Secrets set: `API_KEY`, `FLYING_SAUCER_API_BASE`

## Overview

Phase 2 implements:

1. `GET /beers?sid=` - Fetch beers from Flying Saucer, merge with enrichment data
2. `POST /beers/batch` - Batch lookup enrichment data by beer IDs
3. Security: API key auth, rate limiting, CORS
4. Audit logging for all requests

---

## Step 1: Set Required Secrets

Before implementing, set the secrets the worker will need:

```bash
cd /workspace/ufobeer

# API key for authenticating requests from the mobile app
wrangler secret put API_KEY
# Enter a strong random string (e.g., generate with: openssl rand -hex 32)

# Flying Saucer API base URL
wrangler secret put FLYING_SAUCER_API_BASE
# Enter: https://fsbs.beerknurd.com/bk-store-json.php

# Perplexity API key (for enrichment)
wrangler secret put PERPLEXITY_API_KEY
# Enter your Perplexity API key from https://www.perplexity.ai/settings/api
```

**Verify secrets are set:**

```bash
wrangler secret list
# Should show: API_KEY, FLYING_SAUCER_API_BASE, PERPLEXITY_API_KEY
```

---

## Step 2: Update the Env Interface

Update `/workspace/ufobeer/src/index.ts` to include all required environment bindings:

```typescript
export interface Env {
  // Database
  DB: D1Database;

  // Queue (from Phase 1)
  ENRICHMENT_QUEUE: Queue<EnrichmentMessage>;

  // Secrets (set via wrangler secret put)
  API_KEY: string;
  FLYING_SAUCER_API_BASE: string;
  PERPLEXITY_API_KEY?: string;

  // Environment variables (set in wrangler.jsonc vars)
  ALLOWED_ORIGIN: string;
  RATE_LIMIT_RPM: string;

  // Circuit breaker (from Phase 1)
  DAILY_ENRICHMENT_LIMIT?: string;
  MONTHLY_ENRICHMENT_LIMIT?: string;
  ENRICHMENT_ENABLED?: string;
}
```

---

## Step 3: Add Valid Store IDs

Add the constant at the top of `src/index.ts`:

```typescript
// Valid Flying Saucer store IDs
// Starting with Sugar Land only - add more locations as needed
const VALID_STORE_IDS = new Set([
  '13879', // Sugar Land
]);

// Future locations (uncomment when ready to expand):
// '13885',    // Little Rock
// '13888',    // Charlotte
// '13877',    // Raleigh
// '13883',    // Cordova
// '13881',    // Memphis
// '18686214', // Cypress Waters
// '13891',    // Fort Worth
// '13884',    // The Lake
// '18262641', // DFW Airport
// '13880',    // Houston
// '13882',    // San Antonio
```

---

## Step 4: Add Type Guards

Add type guards for parsing Flying Saucer API responses:

```typescript
interface FlyingSaucerBeer {
  id: string;
  brew_name: string;
  brewer: string;
  container_type?: string;
  [key: string]: unknown;
}

/**
 * Type guard: Validates that an object is a valid FlyingSaucerBeer.
 */
function isValidBeer(beer: unknown): beer is FlyingSaucerBeer {
  return (
    typeof beer === 'object' &&
    beer !== null &&
    'id' in beer &&
    typeof (beer as FlyingSaucerBeer).id === 'string' &&
    (beer as FlyingSaucerBeer).id.length > 0 &&
    'brew_name' in beer &&
    typeof (beer as FlyingSaucerBeer).brew_name === 'string'
  );
}

/**
 * Type guard: Checks if an object contains a brewInStock array.
 * Flying Saucer API returns: [{...}, {brewInStock: [...]}]
 */
function hasBeerStock(item: unknown): item is { brewInStock: unknown[] } {
  return (
    item !== null &&
    typeof item === 'object' &&
    'brewInStock' in item &&
    Array.isArray((item as { brewInStock?: unknown }).brewInStock)
  );
}
```

---

## Step 5: Implement Security Helpers

### 5.1 Timing-Safe API Key Comparison

```typescript
/**
 * Timing-safe string comparison to prevent timing attacks on API key validation.
 */
async function timingSafeCompare(a: string, b: string): Promise<boolean> {
  if (a.length !== b.length) {
    // Still do a comparison to avoid leaking length info via timing
    const encoder = new TextEncoder();
    const aEncoded = encoder.encode(a);
    const bEncoded = encoder.encode(a); // Compare a with itself
    await crypto.subtle.timingSafeEqual(aEncoded, bEncoded);
    return false;
  }
  const encoder = new TextEncoder();
  const aEncoded = encoder.encode(a);
  const bEncoded = encoder.encode(b);
  return crypto.subtle.timingSafeEqual(aEncoded, bEncoded);
}
```

### 5.2 API Key Hashing for Logs

```typescript
/**
 * Hash an API key for storage (we don't want to log actual keys).
 */
async function hashApiKey(apiKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray
    .slice(0, 8)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
```

### 5.3 CORS Headers

```typescript
/**
 * Get CORS headers. Fails explicitly if ALLOWED_ORIGIN is not configured.
 */
function getCorsHeaders(env: Env): Record<string, string> | null {
  if (!env.ALLOWED_ORIGIN) {
    console.error('ALLOWED_ORIGIN not configured - CORS will be blocked');
    return null;
  }
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, X-Client-ID',
    'Access-Control-Max-Age': '86400',
  };
}
```

---

## Step 6: Implement Rate Limiting

```typescript
/**
 * Check and update rate limit for a client.
 * Returns true if request is allowed, false if rate limited.
 */
async function checkRateLimit(
  db: D1Database,
  clientIdentifier: string,
  limitPerMinute: number
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const now = Date.now();
  const minuteBucket = Math.floor(now / 60000);
  const resetAt = (minuteBucket + 1) * 60000;

  try {
    // Atomic upsert - increment counter
    await db
      .prepare(
        `
      INSERT INTO rate_limits (client_identifier, minute_bucket, request_count)
      VALUES (?, ?, 1)
      ON CONFLICT(client_identifier, minute_bucket)
      DO UPDATE SET request_count = request_count + 1
    `
      )
      .bind(clientIdentifier, minuteBucket)
      .run();

    // Check new count
    const result = await db
      .prepare(
        'SELECT request_count FROM rate_limits WHERE client_identifier = ? AND minute_bucket = ?'
      )
      .bind(clientIdentifier, minuteBucket)
      .first<{ request_count: number }>();

    const count = result?.request_count || 1;

    if (count > limitPerMinute) {
      return { allowed: false, remaining: 0, resetAt };
    }

    // Occasional cleanup (1% of requests)
    if (Math.random() < 0.01) {
      await db
        .prepare('DELETE FROM rate_limits WHERE minute_bucket < ?')
        .bind(minuteBucket - 60)
        .run();
    }

    return { allowed: true, remaining: Math.max(0, limitPerMinute - count), resetAt };
  } catch (error) {
    // On error, allow request but log
    console.error('Rate limit check failed:', error);
    return { allowed: true, remaining: limitPerMinute, resetAt };
  }
}
```

---

## Step 7: Implement Audit Logging

```typescript
interface RequestContext {
  requestId: string;
  startTime: number;
  clientIdentifier: string;
  apiKeyHash: string | null;
  clientIp: string | null;
  userAgent: string | null;
}

/**
 * Write an audit log entry for a request.
 */
async function writeAuditLog(
  db: D1Database,
  ctx: RequestContext,
  method: string,
  path: string,
  statusCode: number,
  error?: string
): Promise<void> {
  const responseTimeMs = Date.now() - ctx.startTime;

  try {
    await db
      .prepare(
        `
      INSERT INTO audit_log (request_id, timestamp, method, path, api_key_hash, client_ip, user_agent, status_code, response_time_ms, error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .bind(
        ctx.requestId,
        ctx.startTime,
        method,
        path,
        ctx.apiKeyHash,
        ctx.clientIp,
        ctx.userAgent,
        statusCode,
        responseTimeMs,
        error || null
      )
      .run();

    // Cleanup old entries (older than 7 days) - 0.1% of requests
    if (Math.random() < 0.001) {
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      await db.prepare('DELETE FROM audit_log WHERE timestamp < ?').bind(sevenDaysAgo).run();
    }
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
}
```

---

## Step 8: Implement GET /beers Endpoint

```typescript
async function handleGetBeers(
  env: Env,
  ctx: ExecutionContext,
  headers: Record<string, string>,
  reqCtx: RequestContext,
  storeId: string
): Promise<Response> {
  try {
    // 1. Fetch from Flying Saucer
    const fsUrl = `${env.FLYING_SAUCER_API_BASE}?sid=${storeId}`;
    const fsResp = await fetch(fsUrl, {
      headers: { 'User-Agent': 'BeerSelector/1.0' },
    });

    if (!fsResp.ok) {
      console.error(`Flying Saucer API error: ${fsResp.status}`);
      return new Response('Upstream Error', { status: 502, headers });
    }

    const fsData = (await fsResp.json()) as unknown[];

    // 2. Parse response with type guards
    // Flying Saucer API returns: [{...}, {brewInStock: [...]}]
    let rawBeersUnvalidated: unknown[] = [];

    if (Array.isArray(fsData)) {
      const stockObject = fsData.find(hasBeerStock);
      if (stockObject) {
        rawBeersUnvalidated = stockObject.brewInStock;
      }
    }

    // Filter to only valid beer objects
    const rawBeers = rawBeersUnvalidated.filter(isValidBeer);

    // 3. Fetch enrichment data from D1
    const { results } = await env.DB.prepare('SELECT id, abv, confidence FROM enriched_beers').all<{
      id: string;
      abv: number | null;
      confidence: number;
    }>();

    const enrichmentMap = new Map(
      results.map(r => [r.id, { abv: r.abv, confidence: r.confidence }])
    );

    // 4. Merge data
    const enrichedBeers = rawBeers.map(beer => {
      const enrichment = enrichmentMap.get(beer.id);
      return {
        ...beer,
        enriched_abv: enrichment?.abv ?? null,
        enrichment_confidence: enrichment?.confidence ?? null,
      };
    });

    return Response.json(
      {
        beers: enrichedBeers,
        storeId,
        requestId: reqCtx.requestId,
      },
      { headers }
    );
  } catch (error) {
    console.error('Error in handleGetBeers:', error);
    return new Response('Internal Server Error', { status: 500, headers });
  }
}
```

---

## Step 9: Implement POST /beers/batch Endpoint

```typescript
async function handleBatchLookup(
  request: Request,
  env: Env,
  headers: Record<string, string>,
  reqCtx: RequestContext
): Promise<Response> {
  try {
    const body = (await request.json()) as { ids?: string[] };
    const ids = body.ids;

    // Validate input
    if (!Array.isArray(ids) || ids.length === 0) {
      return Response.json(
        { error: 'ids array required', requestId: reqCtx.requestId },
        { status: 400, headers }
      );
    }

    // Limit batch size to 100
    const limitedIds = ids.slice(0, 100);

    // Build parameterized query
    const placeholders = limitedIds.map(() => '?').join(',');
    const { results } = await env.DB.prepare(
      `SELECT id, abv, confidence, is_verified FROM enriched_beers WHERE id IN (${placeholders})`
    )
      .bind(...limitedIds)
      .all<{
        id: string;
        abv: number | null;
        confidence: number;
        is_verified: number;
      }>();

    // Format response
    const enrichmentData: Record<
      string,
      { abv: number | null; confidence: number; is_verified: boolean }
    > = {};
    for (const row of results) {
      enrichmentData[row.id] = {
        abv: row.abv,
        confidence: row.confidence,
        is_verified: Boolean(row.is_verified),
      };
    }

    return Response.json(
      {
        enrichments: enrichmentData,
        requestId: reqCtx.requestId,
      },
      { headers }
    );
  } catch (error) {
    console.error('Error in handleBatchLookup:', error);
    return new Response('Internal Server Error', { status: 500, headers });
  }
}
```

---

## Step 10: Update Main fetch() Handler

Replace the existing `fetch()` handler to wire everything together:

```typescript
async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const corsHeaders = getCorsHeaders(env);

  // Create request context
  const clientIp = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For');
  const clientIdentifier = request.headers.get('X-Client-ID') || clientIp || 'unknown';

  const requestContext: RequestContext = {
    requestId: crypto.randomUUID(),
    startTime: Date.now(),
    clientIdentifier: clientIdentifier.substring(0, 64),
    apiKeyHash: null,
    clientIp,
    userAgent: request.headers.get('User-Agent'),
  };

  // Helper to create response and log audit
  const respond = async (
    body: string | object | null,
    status: number,
    headers: Record<string, string>,
    error?: string
  ): Promise<Response> => {
    ctx.waitUntil(writeAuditLog(env.DB, requestContext, request.method, url.pathname, status, error));

    if (body === null) return new Response(null, { status, headers });
    if (typeof body === 'object') return Response.json(body, { status, headers });
    return new Response(body, { status, headers });
  };

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return respond(null, 204, corsHeaders || {});
  }

  // Health check (no auth required)
  if (url.pathname === '/health') {
    // ... existing health check code with enrichment status ...
  }

  // Require CORS config for all other routes
  if (!corsHeaders) {
    return respond('Server misconfigured: ALLOWED_ORIGIN not set', 500, {});
  }

  // Authenticate
  const apiKey = request.headers.get('X-API-Key');
  if (!apiKey || !(await timingSafeCompare(apiKey, env.API_KEY))) {
    return respond('Unauthorized', 401, corsHeaders, 'Invalid API key');
  }
  requestContext.apiKeyHash = await hashApiKey(apiKey);

  // Rate limit
  const rateLimit = parseInt(env.RATE_LIMIT_RPM, 10) || 60;
  const rateLimitResult = await checkRateLimit(env.DB, requestContext.clientIdentifier, rateLimit);

  if (!rateLimitResult.allowed) {
    return respond(
      { error: 'Rate limit exceeded' },
      429,
      {
        ...corsHeaders,
        'X-RateLimit-Limit': String(rateLimit),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(Math.floor(rateLimitResult.resetAt / 1000)),
        'Retry-After': String(Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000)),
      },
      'Rate limited'
    );
  }

  // Rate limit headers for all responses
  const rateLimitHeaders = {
    'X-RateLimit-Limit': String(rateLimit),
    'X-RateLimit-Remaining': String(rateLimitResult.remaining),
    'X-RateLimit-Reset': String(Math.floor(rateLimitResult.resetAt / 1000)),
    'X-Request-ID': requestContext.requestId,
  };

  // Route: GET /beers
  if (url.pathname === '/beers' && request.method === 'GET') {
    const storeId = url.searchParams.get('sid');

    if (!storeId) {
      return respond({ error: 'Missing required parameter: sid' }, 400, { ...corsHeaders, ...rateLimitHeaders });
    }

    if (!VALID_STORE_IDS.has(storeId)) {
      return respond({ error: 'Invalid store ID' }, 400, { ...corsHeaders, ...rateLimitHeaders });
    }

    return handleGetBeers(env, ctx, { ...corsHeaders, ...rateLimitHeaders }, requestContext, storeId);
  }

  // Route: POST /beers/batch
  if (url.pathname === '/beers/batch' && request.method === 'POST') {
    return handleBatchLookup(request, env, { ...corsHeaders, ...rateLimitHeaders }, requestContext);
  }

  return respond('Not Found', 404, { ...corsHeaders, ...rateLimitHeaders });
}
```

---

## Step 11: Deploy and Test

### Deploy

```bash
cd /workspace/ufobeer

# Deploy the updated worker
wrangler deploy
```

### Test Endpoints

```bash
# Set your API key (same value you used in wrangler secret put)
export API_KEY="your-api-key-here"

# 1. Health check (no auth)
curl https://ufobeer.app/health
# Expected: {"status":"ok","database":"connected","enrichment":{...}}

# 2. Test auth - should fail without API key
curl https://ufobeer.app/beers?sid=13877
# Expected: "Unauthorized" (401)

# 3. Test GET /beers with auth (Sugar Land)
curl -H "X-API-Key: $API_KEY" "https://ufobeer.app/beers?sid=13879"
# Expected: {"beers":[...],"storeId":"13879","requestId":"..."}

# 4. Test invalid store ID
curl -H "X-API-Key: $API_KEY" "https://ufobeer.app/beers?sid=99999"
# Expected: {"error":"Invalid store ID"} (400)

# 5. Test missing store ID
curl -H "X-API-Key: $API_KEY" "https://ufobeer.app/beers"
# Expected: {"error":"Missing required parameter: sid"} (400)

# 6. Test batch lookup
curl -X POST \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"ids":["7239443","7239444"]}' \
  "https://ufobeer.app/beers/batch"
# Expected: {"enrichments":{...},"requestId":"..."}

# 7. Test rate limiting (run 65+ times quickly)
for i in {1..65}; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -H "X-API-Key: $API_KEY" \
    "https://ufobeer.app/beers?sid=13879"
done
# Should see 429 after 60 requests

# 8. Check rate limit headers
curl -v -H "X-API-Key: $API_KEY" "https://ufobeer.app/beers?sid=13879" 2>&1 | grep -i "x-ratelimit"
# Expected: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
```

### Verify Audit Logs

```bash
# Check recent audit logs
wrangler d1 execute beer-db --remote --command \
  "SELECT request_id, method, path, status_code, response_time_ms FROM audit_log ORDER BY timestamp DESC LIMIT 10"
```

---

## Verification Checklist

- [ ] `GET /beers?sid=` returns beer list from Flying Saucer
- [ ] `GET /beers?sid=` validates store ID against known list
- [ ] `GET /beers` without `sid` returns 400 error
- [ ] `GET /beers?sid=99999` (invalid) returns 400 error
- [ ] `POST /beers/batch` returns enrichment data for given IDs
- [ ] `POST /beers/batch` limits to 100 IDs max
- [ ] Requests without `X-API-Key` return 401
- [ ] Requests with invalid `X-API-Key` return 401
- [ ] Rate limiting kicks in at 60 requests/minute (returns 429)
- [ ] Rate limit headers present on all authenticated responses
- [ ] CORS headers present on all responses
- [ ] Audit logs being written to D1
- [ ] Health endpoint shows enrichment status

---

## Troubleshooting

### "Unauthorized" on all requests

- Verify `API_KEY` secret is set: `wrangler secret list`
- Ensure header name is exactly `X-API-Key` (case-sensitive)

### "Server misconfigured: ALLOWED_ORIGIN not set"

- Check `ALLOWED_ORIGIN` is set in `wrangler.jsonc` vars section
- Redeploy after changes: `wrangler deploy`

### Flying Saucer API returning errors

- Check `FLYING_SAUCER_API_BASE` secret is set correctly
- Test the URL directly: `curl "https://fsbs.beerknurd.com/bk-store-json.php?sid=13877"`

### Rate limiting not working

- Check `rate_limits` table exists in schema
- Verify `RATE_LIMIT_RPM` is set in wrangler.jsonc

### Audit logs empty

- Check `audit_log` table exists in schema
- Ensure schema was applied: `wrangler d1 execute beer-db --remote --file=schema.sql`

---

## Next Steps

After Phase 2 is complete:

1. **Phase 3**: Implement enrichment pipeline (queue processing, Perplexity integration)
2. **Phase 4**: Mobile app integration (update BeerSelector to use the Worker)
3. **Phase 5**: Testing and rollout
