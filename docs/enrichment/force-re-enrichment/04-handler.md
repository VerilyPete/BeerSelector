# Force Re-Enrichment: Main Handler

## Handler Implementation

Add to `src/index.ts`:

```typescript
async function handleForceEnrichment(
  request: Request,
  env: Env,
  headers: Record<string, string>,
  reqCtx: RequestContext
): Promise<Response> {
  // 1. Verify queue binding
  if (!env.ENRICHMENT_QUEUE) {
    return Response.json(
      {
        success: false,
        requestId: reqCtx.requestId,
        error: { message: 'Queue not configured', code: 'QUEUE_NOT_CONFIGURED' },
      },
      { status: 500, headers }
    );
  }

  // 2. Parse and validate request body
  let body: unknown;
  try {
    const text = await request.text();
    // Empty body is now converted to null to fail validation (strict requirement for beer_ids OR criteria)
    body = text.trim() ? JSON.parse(text) : null;
  } catch {
    return Response.json(
      {
        success: false,
        requestId: reqCtx.requestId,
        error: { message: 'Invalid JSON', code: 'INVALID_JSON' },
      },
      { status: 400, headers }
    );
  }

  const validation = validateForceEnrichmentRequest(body);
  if (!validation.valid) {
    return Response.json(
      {
        success: false,
        requestId: reqCtx.requestId,
        error: { message: validation.error!, code: validation.errorCode! },
      },
      { status: 400, headers }
    );
  }

  const req = body as ForceEnrichmentRequest;
  const dryRun = req.dry_run ?? false;
  const requestedLimit = req.limit ?? 50;

  // 3. Check quota BEFORE any modifications
  const quota = await getEnrichmentQuotaStatus(env.DB, env);

  if (!quota.canProcess && !dryRun) {
    return Response.json(
      {
        success: false,
        requestId: reqCtx.requestId,
        error: {
          message: `Quota exhausted: ${quota.skipReason}`,
          code: `QUOTA_${quota.skipReason?.toUpperCase()}`,
        },
        // Include quota info in error response for client retry logic
        data: { quota: { daily: quota.daily, monthly: quota.monthly } },
      },
      { status: 429, headers }
    );
  }

  // 4. Calculate effective limit based on remaining quota
  const effectiveLimit = dryRun
    ? requestedLimit
    : Math.min(requestedLimit, quota.daily.remaining, quota.monthly.remaining, 100);

  // 5. Query beers to re-enrich
  // Note: validation guaranteed either beer_ids OR criteria is set
  const queryResult = await queryBeersForReEnrichment(env.DB, {
    beerIds: req.beer_ids,
    criteria: req.criteria,
    limit: effectiveLimit,
  });

  if (queryResult.beers.length === 0) {
    return Response.json(
      {
        success: true,
        requestId: reqCtx.requestId,
        data: {
          matched_count: queryResult.totalMatched,
          queued_count: 0,
          skipped_count: 0,
          dry_run: dryRun,
          applied_criteria: req.criteria,
          quota: { daily: quota.daily, monthly: quota.monthly },
        },
      },
      { headers }
    );
  }

  // 6. Filter blocklisted items using existing shouldSkipEnrichment() function
  const eligibleBeers = queryResult.beers.filter(b => !shouldSkipEnrichment(b.brew_name));
  const blocklistedCount = queryResult.beers.length - eligibleBeers.length;

  if (eligibleBeers.length === 0) {
    return Response.json(
      {
        success: true,
        requestId: reqCtx.requestId,
        data: {
          matched_count: queryResult.totalMatched,
          queued_count: 0,
          skipped_count: blocklistedCount,
          dry_run: dryRun,
          applied_criteria: req.criteria,
          quota: { daily: quota.daily, monthly: quota.monthly },
        },
      },
      { headers }
    );
  }

  // 7. Clear enrichment data (with optimistic locking)
  const clearResult = await clearEnrichmentData(env.DB, eligibleBeers, dryRun);

  // 8. Queue cleared beers for re-enrichment
  if (!dryRun && clearResult.clearedIds.length > 0) {
    const beersToQueue = eligibleBeers.filter(b => clearResult.clearedIds.includes(b.id));

    try {
      await env.ENRICHMENT_QUEUE.sendBatch(
        beersToQueue.map(beer => ({
          body: { beerId: beer.id, beerName: beer.brew_name, brewer: beer.brewer },
        }))
      );
    } catch (queueError) {
      // Log error but don't fail - beers are cleared and will be picked up by cron
      console.error(`[force] Queue sendBatch failed, beers will be picked up by cron:`, queueError);
    }

    console.log(
      `[force] Queued ${clearResult.clearedIds.length} beers, skipped ${clearResult.skippedCount}, requestId=${reqCtx.requestId}, ids=${clearResult.clearedIds.join(',')}`
    );
  }

  // 9. Build response
  const response = {
    success: true,
    requestId: reqCtx.requestId,
    data: {
      matched_count: queryResult.totalMatched,
      queued_count: clearResult.clearedCount,
      skipped_count: clearResult.skippedCount + blocklistedCount,
      skipped_ids: clearResult.skippedIds.length <= 50 ? clearResult.skippedIds : undefined,
      queued_ids: clearResult.clearedIds.length <= 50 ? clearResult.clearedIds : undefined,
      dry_run: dryRun,
      applied_criteria: req.criteria,
      quota: { daily: quota.daily, monthly: quota.monthly },
    },
  };

  return Response.json(response, { headers });
}
```

## Route Registration

Add to the admin routes section in the fetch handler (after the `enrich_trigger` route).

**Note:** `adminSecretHash` comes from the `authorizeAdmin()` call that happens earlier in the admin routes block.

```typescript
// Route: POST /admin/enrich/force - Force re-enrichment of existing beers
if (url.pathname === '/admin/enrich/force' && request.method === 'POST') {
  const operationStart = Date.now();
  const result = await handleForceEnrichment(
    request,
    env,
    { ...corsHeaders!, ...rateLimitHeaders },
    requestContext
  );

  // Parse response for audit log
  let queuedCount = 0;
  let skippedCount = 0;
  let matchedCount = 0;
  let dryRun = false;
  try {
    const responseBody = (await result.clone().json()) as {
      data?: {
        queued_count?: number;
        skipped_count?: number;
        matched_count?: number;
        dry_run?: boolean;
      };
    };
    queuedCount = responseBody.data?.queued_count || 0;
    skippedCount = responseBody.data?.skipped_count || 0;
    matchedCount = responseBody.data?.matched_count || 0;
    dryRun = responseBody.data?.dry_run || false;
  } catch {
    /* ignore parse errors */
  }

  // Write audit log using existing function
  // Note: details are passed but logged to console only (not stored in DB)
  ctx.waitUntil(
    writeAdminAuditLog(
      env.DB,
      requestContext,
      'enrich_force',
      {
        queued_count: queuedCount,
        skipped_count: skippedCount,
        matched_count: matchedCount,
        dry_run: dryRun,
        duration_ms: Date.now() - operationStart,
      },
      adminSecretHash
    )
  );

  console.log(
    `[admin] enrich_force completed: matched=${matchedCount}, queued=${queuedCount}, skipped=${skippedCount}, dryRun=${dryRun}, durationMs=${Date.now() - operationStart}, requestId=${requestContext.requestId}`
  );

  return result;
}
```
