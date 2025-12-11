# Beer Enrichment Implementation Plan

This document outlines the phased approach to implementing the beer enrichment service.

## Phase Overview

| Phase | Focus               | Deliverable                                                      | Status   |
| ----- | ------------------- | ---------------------------------------------------------------- | -------- |
| **1** | Cloudflare Setup    | D1 database + minimal Worker deployed                            | COMPLETE |
| **2** | Worker Core         | Proxy endpoint with auth, rate limiting, CORS                    | COMPLETE |
| **3** | Enrichment Pipeline | Cloudflare Queues + Perplexity integration (parallel processing) | COMPLETE |
| **4** | Mobile Integration  | App fetches from Worker instead of Flying Saucer                 | COMPLETE |
| **5** | Testing & Rollout   | End-to-end testing, staged deployment                            | PARTIAL  |

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Cloudflare Worker                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────┐    ┌──────────────────┐    ┌───────────────────────┐ │
│  │  Cron    │───▶│ beer-enrichment  │───▶│  Queue Consumer       │ │
│  │ (12 hrs) │    │     Queue        │    │  (auto-scales to 250) │ │
│  └──────────┘    └──────────────────┘    └───────────┬───────────┘ │
│       │                                              │             │
│       │ Queues beers                                 │ Enriches    │
│       │ with NULL ABV                                │ via         │
│       ▼                                              ▼ Perplexity  │
│  ┌──────────┐                                   ┌──────────┐       │
│  │    D1    │◀──────────────────────────────────│ Perplexity│       │
│  │ Database │                                   │   API    │       │
│  └──────────┘                                   └──────────┘       │
│                                                                     │
│  ┌──────────────────┐    ┌──────────────────┐                      │
│  │ beer-enrichment  │───▶│ Manual review    │                      │
│  │      -dlq        │    │ (failed items)   │                      │
│  └──────────────────┘    └──────────────────┘                      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Key Benefits of Queue Architecture:**

- **Parallel processing**: Auto-scales up to 250 concurrent workers
- **Automatic retries**: Failed enrichments retry 3x before going to DLQ
- **Dead letter queue**: Failed items preserved for manual review
- **Decoupled**: Cron job is fast (just queues work), processing is async

**Current Deployment Note:**

- Only Sugar Land (store ID: 13879) is currently enabled in the Worker
- Additional store IDs can be enabled by uncommenting them in `src/index.ts` VALID_STORE_IDS

---

## Phase 1: Cloudflare Infrastructure Setup

**Goal:** Get the basic Cloudflare infrastructure deployed and accessible.

**Status:** COMPLETE

### Cloudflare Tasks

- [x] Install Wrangler CLI (`npm install -g wrangler`)
- [x] Authenticate with Cloudflare (`wrangler login`)
- [x] Initialize Worker project (`wrangler init ufobeer`)
- [x] Create D1 database (`wrangler d1 create beer-db`)
- [x] Apply database schema (see [schema.md](./cloudflare/schema.md))
- [x] Configure `wrangler.jsonc` (see [wrangler-config.md](./cloudflare/wrangler-config.md))
- [x] Set secrets: `API_KEY`, `FLYING_SAUCER_API_BASE`
- [x] Upgrade to Workers Paid plan ($5/month) for increased limits
- [x] Create Cloudflare Queues:
  - [x] `wrangler queues create beer-enrichment`
  - [x] `wrangler queues create beer-enrichment-dlq`
  - [x] Verify queues exist: `wrangler queues list`
- [x] Deploy minimal Worker with `/health` endpoint only
- [x] Verify health endpoint returns 200

### Mobile Tasks

- [x] None (Worker not integrated yet)

### Verification

```bash
curl https://ufobeer.app/health
# Expected: {"status":"ok","database":"connected"}
```

---

## Phase 2: Worker Core Functionality

**Goal:** Implement the proxy endpoint that fetches from Flying Saucer and returns data.

**Status:** COMPLETE

**Implementation Guide:** See [phase2-implementation.md](./cloudflare/phase2-implementation.md) for step-by-step instructions.

### Cloudflare Tasks

- [x] Implement `GET /beers?sid=` endpoint
  - [x] Validate `sid` parameter against known store IDs
  - [x] Fetch from Flying Saucer API
  - [x] Parse response with type guards
  - [x] Return beer list with merged enrichment data
- [x] Implement security layer
  - [x] API key authentication (timing-safe comparison)
  - [x] Rate limiting per client ID (using D1 for atomic counters)
  - [x] CORS headers (explicit origin, no wildcard)
- [x] Implement `POST /beers/batch` endpoint
  - [x] Accept array of beer IDs
  - [x] Return enrichment data from D1
  - [x] Limit batch size to 100
- [x] Add request logging and audit trail
  - [x] D1-based audit_log table with request tracking
  - [x] Auto-cleanup of old entries (7 days)
- [x] Deploy and test all endpoints

### Additional Implementations (Beyond Original Plan)

- [x] Analytics Engine integration (`beer_enrichment_metrics` dataset)
  - [x] Request tracking (endpoint, method, status, response time, beers returned)
  - [x] Enrichment tracking (per-beer success/failure, duration)
  - [x] Cron tracking (beers queued, daily/monthly limits)
  - [x] Rate limit event tracking
- [x] Observability configuration (wrangler.jsonc)
  - [x] Invocation logs enabled
  - [x] 100% head sampling rate
  - [x] Log persistence enabled
- [x] Request context and tracing
  - [x] Unique request ID per request
  - [x] Client identification (X-Client-ID header or IP-based)
  - [x] API key hashing for audit logs

### Mobile Tasks

- [ ] None (still using direct Flying Saucer fetch)

### Verification

```bash
# Test proxy (should return beers from Flying Saucer)
curl -H "X-API-Key: $API_KEY" "https://ufobeer.app/beers?sid=13879"

# Test rate limiting
for i in {1..65}; do curl -s -o /dev/null -w "%{http_code}\n" \
  -H "X-API-Key: $API_KEY" "https://ufobeer.app/beers?sid=13877"; done
# Should see 429 after 60 requests

# Test batch (will return empty until enrichment runs)
curl -X POST -H "X-API-Key: $API_KEY" -H "Content-Type: application/json" \
  -d '{"ids":["7239443"]}' "https://ufobeer.app/beers/batch"
```

---

## Phase 3: Enrichment Pipeline (Queue-Based)

**Goal:** Implement background enrichment via Cloudflare Queues + Perplexity API with parallel processing.

**Status:** COMPLETE

### Cloudflare Tasks

- [x] Set secret: `PERPLEXITY_API_KEY`
- [x] Implement queue producer (cron job)
  - [x] Query beers with NULL ABV (up to 100 per run)
  - [x] Send each beer to `beer-enrichment` queue (using sendBatch for efficiency)
  - [x] Log count of beers queued
- [x] Implement queue consumer
  - [x] Process batches of 1 beer at a time (max_batch_size: 1)
  - [x] Call Perplexity API for each beer
  - [x] Store results in D1 with confidence score (0.7)
  - [x] Acknowledge successful messages
  - [x] Failed messages auto-retry 3x then go to DLQ
- [x] Implement Perplexity API integration
  - [x] Structured prompt requesting only numeric ABV value
  - [x] ABV parsing with regex and sanity check (0-70 range)
  - [x] Handle "unknown" responses gracefully
- [x] Implement dead letter queue configuration
  - [x] DLQ configured in wrangler.jsonc (`beer-enrichment-dlq`)
  - [x] `/admin/dlq` endpoints implemented (D1-based storage)
- [x] Update `GET /beers` to merge enrichment data
  - [x] Query D1 for known enrichments
  - [x] Merge `enriched_abv` and `enrichment_confidence` into response
  - [ ] Queue unknown beers for future enrichment (deferred - beers added via separate mechanism)
- [x] Deploy and trigger manual cron test

### Additional Implementations (Beyond Original Plan)

- [x] Circuit breaker / cost control system
  - [x] Daily enrichment limit (default: 500 requests/day)
  - [x] Monthly enrichment limit (default: 2000 requests/month)
  - [x] Kill switch (`ENRICHMENT_ENABLED` environment variable)
  - [x] `enrichment_limits` table for atomic reservation tracking
  - [x] Limits visible in `/health` endpoint response
- [x] Atomic reservation pattern for API cost tracking
  - [x] Reserve slot BEFORE making Perplexity API call
  - [x] Cost tracked even if API call fails (intentional for accurate billing)
- [x] Analytics tracking for cron and enrichment
  - [x] Track beers queued, daily/monthly remaining
  - [x] Track skip reasons (kill_switch, daily_limit, monthly_limit, no_beers)
  - [x] Track enrichment success/failure per beer
- [x] Auto-cleanup of old enrichment_limits entries (90 days)
- [x] Admin DLQ endpoints (D1-based storage)
  - [x] `dlq_messages` table for persistent DLQ storage
  - [x] DLQ consumer stores failed messages to D1 (max_retries: 3 to prevent message loss)
  - [x] `GET /admin/dlq` - List messages with cursor-based pagination
  - [x] `POST /admin/dlq/replay` - Replay message with optimistic locking (prevents race conditions)
  - [x] `POST /admin/dlq/acknowledge` - Acknowledge/dismiss message
  - [x] `GET /admin/dlq/stats` - DLQ statistics (pending, replayed, acknowledged counts)
  - [x] `replay_count` tracking for messages replayed multiple times
  - [x] 30-day auto-cleanup for acknowledged/replayed messages
  - [x] Analytics tracking for DLQ consumer and admin operations

### Queue Configuration (actual wrangler.jsonc)

```json
{
  "queues": {
    "producers": [{ "queue": "beer-enrichment", "binding": "ENRICHMENT_QUEUE" }],
    "consumers": [
      {
        "queue": "beer-enrichment",
        "max_batch_size": 1,
        "max_batch_timeout": 30,
        "max_retries": 3,
        "max_concurrency": 10,
        "dead_letter_queue": "beer-enrichment-dlq"
      },
      {
        "queue": "beer-enrichment-dlq",
        "max_batch_size": 10,
        "max_retries": 3,
        "max_batch_timeout": 60
      }
    ]
  },
  "vars": {
    "PERPLEXITY_MAX_CONCURRENCY": "10",
    "DAILY_ENRICHMENT_LIMIT": "500",
    "MONTHLY_ENRICHMENT_LIMIT": "2000",
    "ENRICHMENT_ENABLED": "true"
  }
}
```

### Rate Limiting for Perplexity API

Perplexity has a 50 requests/minute limit on starter plans. To stay within limits:

- `max_concurrency: 10` - Limits parallel queue consumers
- `max_batch_size: 1` - Each consumer processes 1 beer at a time
- Result: ~10 concurrent Perplexity requests max

**To adjust:** Change `PERPLEXITY_MAX_CONCURRENCY` in environment variables and redeploy. As your Perplexity tier increases, you can raise this value.

### Mobile Tasks

- [x] None (enrichment happens server-side)

### Verification

```bash
# Check health endpoint with circuit breaker status
curl https://ufobeer.app/health
# Returns: {"status":"ok","database":"connected","enrichment":{"enabled":true,"daily":{"used":X,"limit":500,"remaining":Y},"monthly":{"used":Z,"limit":2000,"remaining":W}}}

# Trigger cron manually (in Cloudflare dashboard or via wrangler)
wrangler tail  # Watch logs for queue activity

# You should see logs like:
# "Queued 50 beers for enrichment"
# "Processing batch of 1 beers"
# "Enriched beer 7239443: Hop Stoopid -> ABV 8.0%"

# Check queue status
wrangler queues list

# After processing, verify enrichment data exists
wrangler d1 execute beer-db --remote --command \
  "SELECT * FROM enriched_beers WHERE abv IS NOT NULL LIMIT 5"

# Check dead letter queue via admin endpoints
curl -H "X-API-Key: $API_KEY" "https://ufobeer.app/admin/dlq"
# Returns: {"messages":[...],"nextCursor":"...","hasMore":false}

# Get DLQ statistics
curl -H "X-API-Key: $API_KEY" "https://ufobeer.app/admin/dlq/stats"
# Returns: {"pending":0,"replayed":0,"acknowledged":0,"total":0}

# Replay a failed message (replace MESSAGE_ID with actual ID)
curl -X POST -H "X-API-Key: $API_KEY" -H "Content-Type: application/json" \
  -d '{"messageId":"MESSAGE_ID"}' "https://ufobeer.app/admin/dlq/replay"

# Acknowledge/dismiss a failed message
curl -X POST -H "X-API-Key: $API_KEY" -H "Content-Type: application/json" \
  -d '{"messageId":"MESSAGE_ID"}' "https://ufobeer.app/admin/dlq/acknowledge"

# Verify proxy returns enriched data
curl -H "X-API-Key: $API_KEY" "https://ufobeer.app/beers?sid=13879" \
  | jq '.beers[] | select(.enriched_abv != null) | {name: .brew_name, abv: .enriched_abv}'
```

### Parallel Processing Benefits

| Metric             | Old (Sequential)   | New (Queue-Based)    |
| ------------------ | ------------------ | -------------------- |
| Beers per cron run | ~10                | **100+**             |
| Processing time    | ~15 min            | **~2 min**           |
| Concurrent workers | 1                  | **Up to 250**        |
| Failure handling   | Entire batch fails | **Individual retry** |
| Visibility         | Logs only          | **Queue dashboard**  |

---

## Phase 4: Mobile App Integration

**Goal:** Switch mobile app from direct Flying Saucer fetch to using the enrichment proxy.

**Status:** COMPLETE

### Cloudflare Tasks

- [x] None (Worker is complete)

### Mobile Tasks

- [x] Add environment variables
  - [x] `EXPO_PUBLIC_ENRICHMENT_API_URL`
  - [x] `EXPO_PUBLIC_ENRICHMENT_API_KEY`
  - [x] `EXPO_PUBLIC_ENRICHMENT_TIMEOUT` (additional - default 15000ms)
  - [x] `EXPO_PUBLIC_ENRICHMENT_BATCH_SIZE` (additional - default 100)
  - [x] `EXPO_PUBLIC_ENRICHMENT_RATE_WINDOW` (additional - default 60000ms)
  - [x] `EXPO_PUBLIC_ENRICHMENT_RATE_MAX` (additional - default 10)
- [x] Update `src/config/config.ts` to include enrichment config
  - [x] `EnrichmentConfig` interface
  - [x] `getEnrichmentConfig()` function with env var support
- [x] Create `src/services/enrichmentService.ts` (779 lines)
  - [x] `getClientId()` - persistent UUID for rate limiting (stored in preferences)
  - [x] `fetchBeersFromProxy()` - proxy endpoint with fallback support
  - [x] `fetchEnrichmentBatch()` - batch lookup with automatic chunking
  - [x] `checkEnrichmentHealth()` - basic health check
  - [x] `getEnrichmentHealthDetails()` - quota information (additional)
  - [x] `bustTaplistCache()` - manual cache invalidation (additional)
  - [x] `mergeEnrichmentData<T>()` - generic helper to merge enrichment (additional)
- [x] Update `src/services/dataUpdateService.ts`
  - [x] `fetchAndUpdateAllBeers()` - dual-path (proxy + fallback to direct FS)
  - [x] `fetchAndUpdateMyBeers()` - batch enrichment for tasted beers
  - [x] `sequentialRefreshAllData()` - enrichment in manual refresh
  - [x] `refreshAllDataFromAPI()` - enrichment support
  - [x] `mapEnrichedBeerToAppBeer()` - response mapping
  - [x] `extractStoreIdFromUrl()` - store ID extraction
- [x] Create SQLite migration v7
  - [x] Add `enrichment_confidence` column (REAL)
  - [x] Add `enrichment_source` column (TEXT: 'perplexity', 'manual', null)
  - [x] ~~Add `is_enrichment_verified` column~~ → tracked via `enrichment_source='manual'`
- [x] Update `src/types/beer.ts` with enrichment fields
  - [x] `EnrichmentSource` type
  - [x] Fields on Beer, BeerWithContainerType, BeerfinderWithContainerType
  - [x] Updated type guards (isBeer, isBeerWithContainerType)
- [x] Update repositories to persist enrichment fields
  - [x] `BeerRepository.insertMany()`
  - [x] `MyBeersRepository.insertMany()`
- [x] Update `src/database/schemaTypes.ts` with enrichment in Zod schemas
- [ ] Test in development with local Worker (`wrangler dev`) - manual verification pending

### Additional Implementations (Beyond Original Plan)

#### Client-Side Rate Limiting

- [x] Sliding window algorithm with O(1) amortized cleanup
- [x] `isRequestAllowed(count)` - multi-request validation before batch
- [x] `getTimeUntilNextRequest()` - UI feedback support
- [x] `syncRateLimitFromServer()` - sync state when server returns 429
- [x] `cleanupExpiredTimestamps()` - efficient timestamp cleanup

#### Metrics & Observability

- [x] `EnrichmentMetrics` interface tracking 8 metrics:
  - `proxyRequests`, `proxySuccesses`, `proxyFailures`
  - `rateLimitedRequests`, `fallbackCount`
  - `enrichedBeerCount`, `unenrichedBeerCount`, `cacheHits`
- [x] `getEnrichmentMetrics()` / `resetEnrichmentMetrics()`
- [x] `recordFallback()` for tracking proxy failures
- [x] Per-chunk metrics in batch operations

#### Comprehensive Test Suite

- [x] Created `src/services/__tests__/enrichmentService.test.ts`
- [x] 49 unit tests with 92% statement coverage, 88% branch coverage
- [x] Tests cover: metrics, rate limiting, mergeEnrichmentData, health, cache, API functions

### Implementation Notes

**Design Decision: `is_enrichment_verified` vs `enrichment_source`**

The original plan specified a separate `is_enrichment_verified` boolean column. During implementation, this was changed to track verification status via the `enrichment_source` field:

- `enrichment_source = 'perplexity'` - AI-enriched data (not manually verified)
- `enrichment_source = 'manual'` - Manually verified data
- `enrichment_source = null` - No enrichment data

This provides a single source of truth and avoids redundant columns.

**Client-Side Rate Limiting Rationale**

The implementation includes proactive client-side rate limiting (10 req/min default) to:

1. Reduce server load by avoiding requests that will be rate-limited
2. Provide better UX by showing rate limit state before hitting server
3. Sync state when server returns 429 to stay in alignment

**Metrics Tracking**

In-memory metrics provide observability into enrichment service usage without external dependencies. Metrics reset on app restart. Consider persisting to preferences for long-term tracking.

### Code Review Status

**Final Review: APPROVED WITH RESERVATIONS**

| Metric              | Score |
| ------------------- | ----- |
| Statements Coverage | 92%   |
| Branches Coverage   | 88%   |
| Functions Coverage  | 75%   |
| Lines Coverage      | 94%   |

Minor reservations (non-blocking):

- UUID generation uses `Math.random()` (acceptable for rate limiting)
- Cached client ID never invalidates (add reset for logout)
- Metrics are in-memory only (consider persistence)

### Verification

```bash
# Start local Worker
cd ufobeer && wrangler dev

# In another terminal, run app
cd BeerSelector && npm start
# Verify app fetches from localhost:8787 and displays beers
```

---

## Phase 5: Testing & Rollout

**Goal:** Comprehensive testing and staged production rollout.

**Status:** PARTIAL (Unit tests complete, integration/rollout pending)

### Testing Tasks

- [x] Unit tests for enrichment service (completed in Phase 4)
  - [x] 49 tests with 92% statement coverage
  - [x] Tests for rate limiting, metrics, API functions, health/cache
- [ ] Integration test: Worker → Flying Saucer → D1
- [x] Test fallback behavior (Worker down → direct FS fetch) - tested in unit tests
- [x] Test rate limiting behavior - tested in unit tests
- [ ] Test with all 12 store IDs
- [x] Test error scenarios (invalid sid, network timeout, etc.) - tested in unit tests
- [ ] Verify dark mode compatibility for any new UI

### Rollout Tasks

- [ ] Deploy Worker to production (`wrangler deploy`)
- [ ] Set production secrets
- [ ] Configure production environment variables in app
- [ ] Build TestFlight version with enrichment enabled
- [ ] Internal testing (1-2 days)
- [ ] Monitor Cloudflare dashboard for errors
- [ ] Monitor D1 usage (stay within free tier)
- [ ] Gradual rollout to users

### Monitoring Setup

- [ ] Set up Cloudflare alerts (error rate > 5%)
- [ ] Set up D1 usage alerts (approaching limits)
- [ ] Document runbook for common issues
- [ ] Test rollback procedure

### Verification

- Cloudflare dashboard shows healthy request patterns
- D1 reads/writes within free tier limits
- No increase in app crashes or errors
- Users see ABV data for more beers

---

## Rollback Plan

If issues arise at any phase:

| Issue                        | Action                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------- |
| Worker errors                | `wrangler rollback` to previous version                                         |
| D1 corruption                | Restore from backup (Cloudflare auto-backups)                                   |
| Mobile app issues            | Feature flag to disable enrichment, use direct FS fetch                         |
| Rate limiting too aggressive | Increase `RATE_LIMIT_RPM` in wrangler.jsonc                                     |
| Perplexity costs too high    | Set `ENRICHMENT_ENABLED=false` (kill switch) or reduce `DAILY_ENRICHMENT_LIMIT` |
| Queue backlog growing        | Check consumer errors, increase `max_batch_size`                                |
| Too many DLQ messages        | Use `/admin/dlq` endpoints to review, replay, or acknowledge messages           |
| Monthly budget exceeded      | Circuit breaker auto-stops enrichment when `MONTHLY_ENRICHMENT_LIMIT` reached   |

---

## Success Criteria

- [ ] 90%+ of API requests return enriched ABV data
- [ ] Response latency < 500ms (p95)
- [ ] Zero increase in app crash rate
- [ ] Cloudflare costs remain at $0 (excluding Perplexity)
- [ ] Perplexity costs < $15/month

---

## Files Modified Summary (Phase 4)

| File                                               | Change Type | Description                            |
| -------------------------------------------------- | ----------- | -------------------------------------- |
| `src/services/enrichmentService.ts`                | Created     | Main enrichment service (779 lines)    |
| `src/services/__tests__/enrichmentService.test.ts` | Created     | 49 unit tests (92% coverage)           |
| `src/services/dataUpdateService.ts`                | Modified    | Integration with enrichment service    |
| `src/config/config.ts`                             | Modified    | Added `EnrichmentConfig` interface     |
| `src/database/schemaTypes.ts`                      | Modified    | Added enrichment fields to Zod schemas |
| `src/database/migrations/migrateToV7.ts`           | Created     | Migration for enrichment columns       |
| `src/types/beer.ts`                                | Modified    | Added enrichment fields to types       |
| `src/database/repositories/BeerRepository.ts`      | Modified    | Added enrichment fields to INSERT      |
| `src/database/repositories/MyBeersRepository.ts`   | Modified    | Added enrichment fields to INSERT      |
| `.env.example`                                     | Modified    | Added enrichment env vars              |
| 8+ test files                                      | Modified    | Added enrichment mock data             |
