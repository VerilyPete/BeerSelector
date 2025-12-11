# Cloudflare Worker Code

This is the complete Worker source code for `src/index.ts`.

## Endpoints

| Method  | Path           | Auth | Description                                                   |
| ------- | -------------- | ---- | ------------------------------------------------------------- |
| GET     | `/health`      | No   | Health check with DB status                                   |
| GET     | `/beers?sid=`  | Yes  | Fetch beers for store, merged with enrichment (cached 30 min) |
| POST    | `/beers/batch` | Yes  | Batch lookup enrichment by beer IDs                           |
| DELETE  | `/cache?sid=`  | Yes  | Bust cache for a specific store                               |
| OPTIONS | `*`            | No   | CORS preflight                                                |

## Source Code

````typescript
// Types
export interface Env {
  DB: D1Database;
  FLYING_SAUCER_API_BASE: string; // Base URL, sid added as query param
  PERPLEXITY_API_KEY: string;
  API_KEY: string;
  ALLOWED_ORIGIN: string;
  RATE_LIMIT_RPM: string;
}

// Valid Flying Saucer store IDs
const VALID_STORE_IDS = new Set([
  '13885', // Little Rock
  '13888', // Charlotte
  '13877', // Raleigh
  '13883', // Cordova
  '13881', // Memphis
  '18686214', // Cypress Waters
  '13891', // Fort Worth
  '13884', // The Lake
  '18262641', // DFW Airport
  '13880', // Houston
  '13882', // San Antonio
  '13879', // Sugar Land
]);

// Cache TTL for Flying Saucer taplist data (30 minutes)
const TAPLIST_CACHE_TTL_SECONDS = 30 * 60;

/**
 * Generate a cache key for a store's taplist.
 */
function getTaplistCacheKey(storeId: string): Request {
  return new Request(`https://internal-cache/taplist/${storeId}`);
}

interface EnrichedBeerRow {
  id: string;
  brew_name: string;
  brewer: string | null;
  abv: number | null;
  confidence: number;
  updated_at: number;
  is_verified: number; // SQLite stores booleans as 0/1
}

interface FlyingSaucerBeer {
  id: string;
  brew_name: string;
  brewer: string;
  container_type?: string;
  [key: string]: unknown;
}

interface RequestContext {
  requestId: string;
  startTime: number;
  clientIdentifier: string; // UUID from header or IP fallback
  apiKeyHash: string | null;
  clientIp: string | null;
  userAgent: string | null;
}

// ============================================================================
// Security Helpers
// ============================================================================

/**
 * Timing-safe string comparison to prevent timing attacks on API key validation.
 * Uses crypto.subtle.timingSafeEqual which is constant-time.
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

/**
 * Sanitize user input before including in LLM prompts to prevent prompt injection.
 */
function sanitizeForPrompt(input: string): string {
  return input
    .replace(/["\n\r\t\\]/g, ' ') // Remove quotes, newlines, escapes
    .replace(/\s+/g, ' ') // Collapse whitespace
    .substring(0, 200) // Limit length
    .trim();
}

/**
 * Type guard: Validates that an object is a valid FlyingSaucerBeer.
 * @param beer - Unknown object to validate
 * @returns True if the object has required beer properties
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
 * Used for parsing the Flying Saucer API response.
 * @param item - Unknown object from the API response array
 * @returns True if the object has a brewInStock array property
 */
function hasBeerStock(item: unknown): item is { brewInStock: unknown[] } {
  return (
    item !== null &&
    typeof item === 'object' &&
    'brewInStock' in item &&
    Array.isArray((item as { brewInStock?: unknown }).brewInStock)
  );
}

// ============================================================================
// Logging with Request ID Correlation
// ============================================================================

function log(
  level: 'info' | 'warn' | 'error',
  message: string,
  data?: Record<string, unknown>,
  requestId?: string
) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    requestId,
    ...data,
  };
  console[level](JSON.stringify(entry));
}

// ============================================================================
// Rate Limiting
// ============================================================================

/**
 * Check and update rate limit for a client.
 * Returns true if request is allowed, false if rate limited.
 */
async function checkRateLimit(
  db: D1Database,
  clientIdentifier: string,
  limitPerMinute: number,
  requestId: string
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const now = Date.now();
  const minuteBucket = Math.floor(now / 60000); // Current minute
  const resetAt = (minuteBucket + 1) * 60000; // Start of next minute

  try {
    // Increment counter (upsert) safely using SQLite grammar
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

    // Check the new count
    const { results: newCountResults } = await db
      .prepare(
        'SELECT request_count FROM rate_limits WHERE client_identifier = ? AND minute_bucket = ?'
      )
      .bind(clientIdentifier, minuteBucket)
      .all<{ request_count: number }>();

    const newCount = newCountResults.length > 0 ? newCountResults[0].request_count : 1;

    if (newCount > limitPerMinute) {
      log(
        'warn',
        'Rate limit exceeded',
        { clientIdentifier, currentCount: newCount, limit: limitPerMinute },
        requestId
      );
      return { allowed: false, remaining: 0, resetAt };
    }

    // Cleanup old entries (older than 1 hour) - do this occasionally
    if (Math.random() < 0.01) {
      // 1% of requests trigger cleanup
      await db
        .prepare('DELETE FROM rate_limits WHERE minute_bucket < ?')
        .bind(minuteBucket - 60)
        .run();
    }

    return { allowed: true, remaining: Math.max(0, limitPerMinute - newCount), resetAt };
  } catch (error) {
    // On error, allow the request but log the issue
    log('error', 'Rate limit check failed', { error: String(error) }, requestId);
    return { allowed: true, remaining: limitPerMinute, resetAt };
  }
}

// ============================================================================
// Audit Logging
// ============================================================================

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

    // Cleanup old audit entries (older than 7 days) - do this occasionally
    if (Math.random() < 0.001) {
      // 0.1% of requests trigger cleanup
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      await db.prepare('DELETE FROM audit_log WHERE timestamp < ?').bind(sevenDaysAgo).run();
    }
  } catch (error) {
    log('error', 'Failed to write audit log', { error: String(error) }, ctx.requestId);
  }
}

// ============================================================================
// Cron Job Locking
// ============================================================================

/**
 * Acquire a lock for cron job execution using atomic database operations.
 * Returns true if lock acquired.
 */
async function acquireCronLock(
  db: D1Database,
  lockName: string,
  maxAgeMs: number
): Promise<boolean> {
  const now = Date.now();
  const expiresAt = now - maxAgeMs;

  try {
    // Attempt 1: Insert new lock (works if key doesn't exist)
    try {
      await db
        .prepare('INSERT INTO system_state (key, value, updated_at) VALUES (?, ?, ?)')
        .bind(lockName, 'locked', now)
        .run();

      log('info', 'Cron lock acquired (new)', { lockName });
      return true;
    } catch (e) {
      // Key exists, ignore error and try update
    }

    // Attempt 2: Hijack lock ONLY IF it is expired (Atomic check-and-set)
    const result = await db
      .prepare(
        `
      UPDATE system_state
      SET updated_at = ?
      WHERE key = ? AND updated_at < ?
    `
      )
      .bind(now, lockName, expiresAt)
      .run();

    if (result.meta.changes > 0) {
      log('info', 'Cron lock acquired (expired overwrite)', { lockName });
      return true;
    }

    log('info', 'Cron lock already held and valid', { lockName });
    return false;
  } catch (error) {
    log('error', 'Failed to acquire cron lock', { lockName, error: String(error) });
    return false;
  }
}

/**
 * Release a cron job lock.
 */
async function releaseCronLock(db: D1Database, lockName: string): Promise<void> {
  try {
    await db.prepare('DELETE FROM system_state WHERE key = ?').bind(lockName).run();
    log('info', 'Cron lock released', { lockName });
  } catch (error) {
    log('error', 'Failed to release cron lock', { lockName, error: String(error) });
  }
}

// ============================================================================
// CORS
// ============================================================================

/**
 * Get CORS headers. Fails explicitly if ALLOWED_ORIGIN is not configured.
 */
function getCorsHeaders(env: Env): Record<string, string> | null {
  if (!env.ALLOWED_ORIGIN) {
    log('error', 'ALLOWED_ORIGIN not configured - CORS will be blocked');
    return null;
  }
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, X-Client-ID',
    'Access-Control-Max-Age': '86400',
  };
}

// ============================================================================
// Main Worker
// ============================================================================

export default {
  // Handle HTTP Requests
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const corsHeaders = getCorsHeaders(env);

    // Create request context for logging and audit
    const clientIp =
      request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For');
    // Prefer X-Client-ID (UUID from app), fallback to IP
    const clientIdentifier = request.headers.get('X-Client-ID') || clientIp || 'unknown';

    const requestContext: RequestContext = {
      requestId: crypto.randomUUID(),
      startTime: Date.now(),
      clientIdentifier: clientIdentifier.substring(0, 64), // Prevent giant headers
      apiKeyHash: null,
      clientIp,
      userAgent: request.headers.get('User-Agent'),
    };

    log(
      'info',
      'Request received',
      {
        method: request.method,
        path: url.pathname,
        clientIdentifier: requestContext.clientIdentifier,
      },
      requestContext.requestId
    );

    // Helper to create response and log audit
    const respond = async (
      body: string | object | null,
      status: number,
      headers: Record<string, string>,
      error?: string
    ): Promise<Response> => {
      // Write audit log (non-blocking)
      ctx.waitUntil(
        writeAuditLog(env.DB, requestContext, request.method, url.pathname, status, error)
      );

      if (body === null) {
        return new Response(null, { status, headers });
      }
      if (typeof body === 'object') {
        return Response.json(body, { status, headers });
      }
      return new Response(body, { status, headers });
    };

    // If CORS is not configured, only allow health checks
    if (!corsHeaders && url.pathname !== '/health') {
      return respond(
        'Server misconfigured: ALLOWED_ORIGIN not set',
        500,
        {},
        'CORS not configured'
      );
    }

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return respond(null, 204, corsHeaders || {});
    }

    // Health check endpoint (no auth required)
    if (url.pathname === '/health') {
      try {
        const { results } = await env.DB.prepare('SELECT 1 as test').all();
        const dbOk = results.length === 1;

        return respond(
          {
            status: dbOk ? 'ok' : 'degraded',
            timestamp: new Date().toISOString(),
            database: dbOk ? 'connected' : 'error',
            requestId: requestContext.requestId,
          },
          dbOk ? 200 : 503,
          corsHeaders || {}
        );
      } catch (error) {
        return respond(
          {
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            database: 'error',
            requestId: requestContext.requestId,
          },
          503,
          corsHeaders || {},
          String(error)
        );
      }
    }

    // Authenticate all other requests using timing-safe comparison
    const apiKey = request.headers.get('X-API-Key');
    if (!apiKey || !(await timingSafeCompare(apiKey, env.API_KEY))) {
      return respond('Unauthorized', 401, corsHeaders || {}, 'Invalid API key');
    }

    // Hash API key for logging (don't log actual keys)
    requestContext.apiKeyHash = await hashApiKey(apiKey);

    // Check rate limit (per Client ID/IP, NOT per API key)
    const rateLimit = parseInt(env.RATE_LIMIT_RPM, 10) || 60;
    const rateLimitResult = await checkRateLimit(
      env.DB,
      requestContext.clientIdentifier,
      rateLimit,
      requestContext.requestId
    );

    if (!rateLimitResult.allowed) {
      const headers = {
        ...corsHeaders!,
        'X-RateLimit-Limit': String(rateLimit),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(Math.floor(rateLimitResult.resetAt / 1000)),
        'Retry-After': String(Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000)),
      };
      return respond({ error: 'Rate limit exceeded' }, 429, headers, 'Rate limited');
    }

    // Add rate limit headers to all responses
    const rateLimitHeaders = {
      'X-RateLimit-Limit': String(rateLimit),
      'X-RateLimit-Remaining': String(rateLimitResult.remaining),
      'X-RateLimit-Reset': String(Math.floor(rateLimitResult.resetAt / 1000)),
      'X-Request-ID': requestContext.requestId,
    };

    // Route: GET /beers - Fetch and enrich beer list for a specific store
    if (url.pathname === '/beers' && request.method === 'GET') {
      const storeId = url.searchParams.get('sid');

      if (!storeId) {
        return respond(
          {
            error: 'Missing required parameter: sid (store ID)',
            requestId: requestContext.requestId,
          },
          400,
          { ...corsHeaders!, ...rateLimitHeaders },
          'Missing sid parameter'
        );
      }

      if (!VALID_STORE_IDS.has(storeId)) {
        return respond(
          { error: 'Invalid store ID', requestId: requestContext.requestId },
          400,
          { ...corsHeaders!, ...rateLimitHeaders },
          'Invalid sid parameter'
        );
      }

      return handleGetBeers(
        env,
        ctx,
        { ...corsHeaders!, ...rateLimitHeaders },
        requestContext,
        storeId
      );
    }

    // Route: POST /beers/batch - Get enrichment data for specific beer IDs
    if (url.pathname === '/beers/batch' && request.method === 'POST') {
      return handleBatchLookup(
        request,
        env,
        { ...corsHeaders!, ...rateLimitHeaders },
        requestContext
      );
    }

    // Route: DELETE /cache - Bust cache for a specific store
    if (url.pathname === '/cache' && request.method === 'DELETE') {
      const storeId = url.searchParams.get('sid');

      if (!storeId) {
        return respond(
          {
            error: 'Missing required parameter: sid (store ID)',
            requestId: requestContext.requestId,
          },
          400,
          { ...corsHeaders!, ...rateLimitHeaders },
          'Missing sid parameter'
        );
      }

      if (!VALID_STORE_IDS.has(storeId)) {
        return respond(
          { error: 'Invalid store ID', requestId: requestContext.requestId },
          400,
          { ...corsHeaders!, ...rateLimitHeaders },
          'Invalid sid parameter'
        );
      }

      return handleCacheBust(storeId, { ...corsHeaders!, ...rateLimitHeaders }, requestContext);
    }

    return respond('Not Found', 404, { ...corsHeaders!, ...rateLimitHeaders }, 'Route not found');
  },

  // Handle Cron Triggers (Background Enrichment)
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const cronRequestId = crypto.randomUUID();
    const LOCK_NAME = 'enrichment_cron_lock';
    const LOCK_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

    log('info', 'Cron trigger received', { scheduledTime: event.scheduledTime }, cronRequestId);

    // Try to acquire lock to prevent concurrent runs
    const lockAcquired = await acquireCronLock(env.DB, LOCK_NAME, LOCK_MAX_AGE_MS);
    if (!lockAcquired) {
      log('info', 'Skipping enrichment - another job is running', {}, cronRequestId);
      return;
    }

    try {
      log('info', 'Starting scheduled enrichment job', {}, cronRequestId);

      // Find beers with NULL abv, oldest first
      const { results } = await env.DB.prepare(
        `SELECT id, brew_name, brewer FROM enriched_beers
         WHERE abv IS NULL
         ORDER BY updated_at ASC
         LIMIT 10`
      ).all<EnrichedBeerRow>();

      let enrichedCount = 0;
      let failedCount = 0;

      for (const row of results) {
        const startTime = Date.now();
        const abv = await fetchAbvFromSource(row.brew_name, row.brewer, env, cronRequestId);

        if (abv !== null) {
          await env.DB.prepare(
            `UPDATE enriched_beers
             SET abv = ?, confidence = 0.7, updated_at = ?, last_verified_at = ?
             WHERE id = ?`
          )
            .bind(abv, Date.now(), Date.now(), row.id)
            .run();

          log(
            'info',
            'Beer enriched',
            {
              id: row.id,
              brew_name: row.brew_name,
              abv,
              durationMs: Date.now() - startTime,
            },
            cronRequestId
          );
          enrichedCount++;
        } else {
          failedCount++;
        }

        // Rate limit: wait between requests to avoid hitting Perplexity limits
        await new Promise(r => setTimeout(r, 1500));
      }

      log(
        'info',
        'Enrichment job completed',
        { enrichedCount, failedCount, total: results.length },
        cronRequestId
      );
    } finally {
      // Always release lock
      await releaseCronLock(env.DB, LOCK_NAME);
    }
  },
};

// ============================================================================
// Request Handlers
// ============================================================================

async function handleGetBeers(
  env: Env,
  ctx: ExecutionContext,
  headers: Record<string, string>,
  reqCtx: RequestContext,
  storeId: string
): Promise<Response> {
  try {
    const cache = caches.default;
    const cacheKey = getTaplistCacheKey(storeId);
    let fsData: unknown[];
    let cacheHit = false;

    // 1. Check cache first
    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      fsData = (await cachedResponse.json()) as unknown[];
      cacheHit = true;
      log('info', 'Cache hit for taplist', { storeId }, reqCtx.requestId);
    } else {
      // 2. Cache miss - fetch from Flying Saucer
      log(
        'info',
        'Cache miss for taplist, fetching from Flying Saucer',
        { storeId },
        reqCtx.requestId
      );
      const fsUrl = `${env.FLYING_SAUCER_API_BASE}?sid=${storeId}`;
      const fsResp = await fetch(fsUrl, {
        headers: { 'User-Agent': 'BeerSelector/1.0' },
      });

      if (!fsResp.ok) {
        log('error', 'Flying Saucer API error', { status: fsResp.status }, reqCtx.requestId);
        return new Response('Upstream Error', {
          status: 502,
          headers: { ...headers, 'Cache-Control': 'no-store' },
        });
      }

      fsData = (await fsResp.json()) as unknown[];

      // 3. Cache the response for future requests
      const cacheResponse = new Response(JSON.stringify(fsData), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': `public, max-age=${TAPLIST_CACHE_TTL_SECONDS}`,
        },
      });
      ctx.waitUntil(cache.put(cacheKey, cacheResponse));
    }

    // Flying Saucer API returns: [{...}, {brewInStock: [...]}]
    // Use type guard to safely find the brewInStock array
    let rawBeersUnvalidated: unknown[] = [];

    if (Array.isArray(fsData)) {
      const stockObject = fsData.find(hasBeerStock);
      if (stockObject) {
        rawBeersUnvalidated = stockObject.brewInStock;
      }
    }

    // Filter to only valid beer objects
    const rawBeers = rawBeersUnvalidated.filter(isValidBeer);

    if (rawBeers.length === 0) {
      log('warn', 'No valid beers returned from Flying Saucer API', {}, reqCtx.requestId);
    }

    // 2. Fetch all known enrichment data from D1
    const { results } = await env.DB.prepare(
      'SELECT id, abv, confidence FROM enriched_beers'
    ).all<EnrichedBeerRow>();

    const enrichmentMap = new Map(
      results.map(r => [r.id, { abv: r.abv, confidence: r.confidence }])
    );

    const beersToEnrich: Array<{ id: string; brew_name: string; brewer: string }> = [];

    // 3. Merge Data
    const enrichedBeers = rawBeers.map(beer => {
      const enrichment = enrichmentMap.get(beer.id);

      // If we don't have this beer in our enrichment DB, queue it
      if (!enrichment) {
        beersToEnrich.push({
          id: beer.id,
          brew_name: beer.brew_name,
          brewer: beer.brewer,
        });
      }

      return {
        ...beer,
        enriched_abv: enrichment?.abv ?? null,
        enrichment_confidence: enrichment?.confidence ?? null,
      };
    });

    // 4. Queue missing beers for enrichment (non-blocking)
    if (beersToEnrich.length > 0) {
      ctx.waitUntil(insertPlaceholders(env.DB, beersToEnrich, reqCtx.requestId));
      log('info', 'Queued beers for enrichment', { count: beersToEnrich.length }, reqCtx.requestId);
    }

    log(
      'info',
      'GET /beers completed',
      { storeId, beerCount: enrichedBeers.length, cacheHit },
      reqCtx.requestId
    );

    return Response.json(
      {
        beers: enrichedBeers,
        storeId,
        cached: cacheHit,
        requestId: reqCtx.requestId,
      },
      {
        headers: {
          ...headers,
          'Cache-Control': 'public, max-age=60, s-maxage=60',
        },
      }
    );
  } catch (error) {
    log('error', 'Error in handleGetBeers', { error: String(error) }, reqCtx.requestId);
    return new Response('Internal Server Error', {
      status: 500,
      headers: { ...headers, 'Cache-Control': 'no-store' },
    });
  }
}

async function handleBatchLookup(
  request: Request,
  env: Env,
  headers: Record<string, string>,
  reqCtx: RequestContext
): Promise<Response> {
  try {
    const body = (await request.json()) as { ids?: string[] };
    const ids = body.ids;

    if (!Array.isArray(ids) || ids.length === 0) {
      return Response.json(
        { error: 'ids array required', requestId: reqCtx.requestId },
        { status: 400, headers: { ...headers, 'Cache-Control': 'no-store' } }
      );
    }

    // Limit batch size to prevent abuse
    const limitedIds = ids.slice(0, 100);

    // Build parameterized query
    const placeholders = limitedIds.map(() => '?').join(',');
    const { results } = await env.DB.prepare(
      `SELECT id, abv, confidence, is_verified FROM enriched_beers WHERE id IN (${placeholders})`
    )
      .bind(...limitedIds)
      .all<EnrichedBeerRow>();

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

    log(
      'info',
      'POST /beers/batch completed',
      {
        requestedCount: limitedIds.length,
        foundCount: results.length,
      },
      reqCtx.requestId
    );

    // Wrap response to avoid collision if a beer ever has id === "requestId"
    return Response.json(
      {
        enrichments: enrichmentData,
        requestId: reqCtx.requestId,
      },
      { headers }
    );
  } catch (error) {
    log('error', 'Error in handleBatchLookup', { error: String(error) }, reqCtx.requestId);
    return new Response('Internal Server Error', {
      status: 500,
      headers: { ...headers, 'Cache-Control': 'no-store' },
    });
  }
}

/**
 * Handle cache bust request - invalidate cached taplist for a store.
 */
async function handleCacheBust(
  storeId: string,
  headers: Record<string, string>,
  reqCtx: RequestContext
): Promise<Response> {
  try {
    const cache = caches.default;
    const cacheKey = getTaplistCacheKey(storeId);

    const deleted = await cache.delete(cacheKey);

    log('info', 'Cache bust requested', { storeId, deleted }, reqCtx.requestId);

    return Response.json(
      {
        success: true,
        storeId,
        cacheCleared: deleted,
        requestId: reqCtx.requestId,
      },
      { headers }
    );
  } catch (error) {
    log('error', 'Error in handleCacheBust', { error: String(error) }, reqCtx.requestId);
    return new Response('Internal Server Error', {
      status: 500,
      headers: { ...headers, 'Cache-Control': 'no-store' },
    });
  }
}

// ============================================================================
// Database Helpers
// ============================================================================

/**
 * Insert placeholder records for beers that need enrichment.
 * Uses chunking to respect D1's parameter limits.
 */
async function insertPlaceholders(
  db: D1Database,
  beers: Array<{ id: string; brew_name: string; brewer: string }>,
  requestId: string
) {
  const CHUNK_SIZE = 25;
  const now = Date.now();

  for (let i = 0; i < beers.length; i += CHUNK_SIZE) {
    const chunk = beers.slice(i, i + CHUNK_SIZE);
    const stmt = db.prepare(
      'INSERT OR IGNORE INTO enriched_beers (id, brew_name, brewer, updated_at) VALUES (?, ?, ?, ?)'
    );
    const batch = chunk.map(b => stmt.bind(b.id, b.brew_name, b.brewer, now));

    try {
      await db.batch(batch);
    } catch (error) {
      log(
        'error',
        'Error inserting placeholder chunk',
        {
          error: String(error),
          chunkIndex: i,
          chunkSize: chunk.length,
        },
        requestId
      );
    }
  }
}

// ============================================================================
// Perplexity API Integration
// ============================================================================

/**
 * Fetch ABV from Perplexity API using structured output for reliable JSON responses.
 */
async function fetchAbvFromSource(
  brew_name: string,
  brewer: string | null,
  env: Env,
  requestId: string,
  retries = 3
): Promise<number | null> {
  if (!env.PERPLEXITY_API_KEY) {
    log('warn', 'No PERPLEXITY_API_KEY provided, skipping enrichment', {}, requestId);
    return null;
  }

  // Sanitize inputs to prevent prompt injection
  const safeName = sanitizeForPrompt(brew_name);
  const safeBrewer = brewer ? sanitizeForPrompt(brewer) : null;
  const brewerContext = safeBrewer ? ` by ${safeBrewer}` : '';

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.PERPLEXITY_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'sonar',
          messages: [
            {
              role: 'system',
              content: 'You are a beer database assistant that searches for beer ABV information.',
            },
            {
              role: 'user',
              content: `Find the ABV percentage for the beer "${safeName}"${brewerContext}. Search for this specific beer.`,
            },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              schema: {
                type: 'object',
                properties: {
                  abv: {
                    type: ['number', 'null'],
                    description: 'ABV percentage as a number (e.g., 5.2), or null if not found',
                  },
                  source: {
                    type: 'string',
                    description: 'Where the ABV data was found',
                  },
                },
                required: ['abv'],
              },
            },
          },
        }),
      });

      if (response.status === 429) {
        const waitTime = Math.pow(2, attempt) * 1000;
        log(
          'warn',
          'Rate limited by Perplexity, backing off',
          { attempt, waitTimeMs: waitTime },
          requestId
        );
        await new Promise(r => setTimeout(r, waitTime));
        continue;
      }

      if (!response.ok) {
        throw new Error(`Perplexity API returned ${response.status}`);
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };

      if (!data?.choices?.[0]?.message?.content) {
        log(
          'error',
          'Unexpected Perplexity response structure',
          {
            data: JSON.stringify(data).substring(0, 500),
          },
          requestId
        );
        return null;
      }

      const content = data.choices[0].message.content;
      let json: { abv?: unknown };

      try {
        let cleanContent = content
          .replace(/```(?:json)?\s*/gi, '')
          .replace(/```/g, '')
          .trim();

        const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          log(
            'warn',
            'No JSON object found in Perplexity response',
            {
              content: content.substring(0, 200),
            },
            requestId
          );
          return null;
        }

        json = JSON.parse(jsonMatch[0]);
      } catch (parseError) {
        log(
          'error',
          'Failed to parse Perplexity JSON response',
          {
            content: content.substring(0, 200),
            error: String(parseError),
          },
          requestId
        );
        return null;
      }

      if (typeof json.abv === 'number' && json.abv >= 0 && json.abv <= 100) {
        return Math.round(json.abv * 10) / 10;
      }

      return null;
    } catch (error) {
      if (attempt === retries - 1) {
        log(
          'error',
          `Failed to enrich after ${retries} attempts`,
          {
            name: safeName,
            error: String(error),
          },
          requestId
        );
        return null;
      }
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }

  return null;
}
````

## Local Development

```bash
# Start local development server
wrangler dev

# Test the health endpoint
curl http://localhost:8787/health

# Test with API key (requires sid parameter)
curl -H "X-API-Key: your-api-key" "http://localhost:8787/beers?sid=13877"  # Raleigh

# Test other stores
curl -H "X-API-Key: your-api-key" "http://localhost:8787/beers?sid=13879"  # Sugar Land
curl -H "X-API-Key: your-api-key" "http://localhost:8787/beers?sid=13888"  # Charlotte

# Check rate limit headers in response
curl -v -H "X-API-Key: your-api-key" "http://localhost:8787/beers?sid=13877" 2>&1 | grep -i "x-ratelimit"

# Test caching - second request should show "cached": true
curl -H "X-API-Key: your-api-key" "http://localhost:8787/beers?sid=13877" | jq '.cached'
# First request: false (cache miss)
# Second request: true (cache hit)

# Test cache bust
curl -X DELETE -H "X-API-Key: your-api-key" "http://localhost:8787/cache?sid=13877"
# Response: {"success":true,"storeId":"13877","cacheCleared":true}

# Next request will be a cache miss again
curl -H "X-API-Key: your-api-key" "http://localhost:8787/beers?sid=13877" | jq '.cached'
# Returns: false

# Test missing/invalid sid (should return 400)
curl -H "X-API-Key: your-api-key" http://localhost:8787/beers
curl -H "X-API-Key: your-api-key" "http://localhost:8787/beers?sid=99999"
```
