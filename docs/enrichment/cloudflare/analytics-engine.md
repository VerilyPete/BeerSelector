# Cloudflare Workers Analytics Engine Implementation Plan

This document outlines the implementation plan for adding custom analytics to the Beer Enrichment Worker using Cloudflare Workers Analytics Engine.

## Table of Contents

1. [Overview](#overview)
2. [Pricing and Quotas](#pricing-and-quotas)
3. [Schema Design](#schema-design)
4. [Implementation Guide](#implementation-guide)
5. [Querying Data](#querying-data)
6. [Visualization with Grafana](#visualization-with-grafana)
7. [Best Practices](#best-practices)
8. [References](#references)

---

## Overview

### What is Workers Analytics Engine?

Workers Analytics Engine is a time-series analytics database optimized for high-cardinality data at the edge. It allows you to:

- Track custom metrics from your Workers with minimal performance impact
- Build usage-based billing systems
- Monitor service health on a per-customer or per-endpoint basis
- Instrument frequently called code paths without overwhelming external systems

### Key Characteristics

| Feature             | Description                                                   |
| ------------------- | ------------------------------------------------------------- |
| **Data Model**      | Time-series events with blobs (strings) and doubles (numbers) |
| **Sampling**        | Automatic equitable sampling for high-volume workloads        |
| **Retention**       | 3 months                                                      |
| **Query Interface** | SQL API and GraphQL API                                       |
| **Performance**     | Non-blocking writes; runtime handles data in background       |

### Why Use Analytics Engine for UFO Beer?

Our current worker already logs to D1 via the `audit_log` table, but Analytics Engine offers advantages:

1. **Purpose-built for time-series**: Optimized for aggregation queries over time
2. **No D1 load**: Reduces read/write pressure on our D1 database
3. **Automatic sampling**: Handles traffic spikes gracefully
4. **SQL queries**: Familiar interface for ad-hoc analysis
5. **Grafana integration**: Native support for dashboarding

---

## Pricing and Quotas

### Current Status (December 2025)

> **Note**: As of December 2025, Cloudflare is not actively billing for Workers Analytics Engine usage. Pricing information is published in advance so you can estimate future costs.

### Workers Paid Plan ($5/month) Includes

| Metric              | Included Amount  | Overage Cost      |
| ------------------- | ---------------- | ----------------- |
| Data points written | 10 million/month | $0.25 per million |
| Read queries        | 1 million/month  | $1.00 per million |

### Estimated Usage for UFO Beer Worker

Based on our expected traffic:

| Metric                | Estimate | Monthly Usage       |
| --------------------- | -------- | ------------------- |
| API requests/day      | ~1,000   | ~30,000 data points |
| Enrichment jobs/day   | ~100     | ~3,000 data points  |
| Cron executions/day   | 2        | ~60 data points     |
| Dashboard queries/day | ~20      | ~600 queries        |

**Total estimated monthly usage**: ~100,000 data points, ~600 queries

This is well within the included 10M data points and 1M queries on the Workers Paid plan.

### Limits

| Limit                             | Value    |
| --------------------------------- | -------- |
| Max blobs per data point          | 20       |
| Max doubles per data point        | 20       |
| Max indexes per data point        | 1        |
| Total blob size per data point    | 16 KB    |
| Index size                        | 96 bytes |
| Data points per Worker invocation | 25       |
| Data retention                    | 3 months |

---

## Schema Design

### Dataset: `beer_enrichment_metrics`

We will use a single dataset with a well-designed schema to capture all our metrics.

### Blob Fields (Dimensions)

| Field               | Blob Index | Description                | Example Values                                         |
| ------------------- | ---------- | -------------------------- | ------------------------------------------------------ |
| `endpoint`          | blob1      | API endpoint path          | `/beers`, `/beers/batch`, `/health`                    |
| `method`            | blob2      | HTTP method                | `GET`, `POST`                                          |
| `store_id`          | blob3      | Flying Saucer store ID     | `13879`, `13885`                                       |
| `status_category`   | blob4      | HTTP status category       | `2xx`, `4xx`, `5xx`                                    |
| `error_type`        | blob5      | Error classification       | `rate_limit`, `auth_fail`, `upstream_error`, `success` |
| `client_id`         | blob6      | Client identifier (hashed) | `abc123`                                               |
| `event_type`        | blob7      | Type of event              | `request`, `enrichment`, `cache`, `cron`               |
| `enrichment_source` | blob8      | For enrichment events      | `perplexity`, `cache`                                  |

### Double Fields (Metrics)

| Field                  | Double Index | Description                 | Units        |
| ---------------------- | ------------ | --------------------------- | ------------ |
| `response_time_ms`     | double1      | Request duration            | milliseconds |
| `request_count`        | double2      | Always 1 for counting       | count        |
| `beers_returned`       | double3      | Number of beers in response | count        |
| `enrichment_count`     | double4      | Beers enriched in batch     | count        |
| `cache_hit`            | double5      | 1 if cache hit, 0 if miss   | boolean      |
| `error_count`          | double6      | 1 if error, 0 if success    | count        |
| `rate_limit_triggered` | double7      | 1 if rate limited           | count        |
| `upstream_latency_ms`  | double8      | Flying Saucer API latency   | milliseconds |

### Index Strategy

The index is crucial for sampling and query performance. Our strategy:

```
index = "{client_id}:{endpoint}"
```

**Rationale**:

- Groups by client AND endpoint for balanced sampling
- Allows per-customer analysis without sampling affecting small customers
- Enables endpoint-level performance monitoring

**Alternative indexes for different query patterns**:

- `{store_id}` - For per-location analysis
- `{endpoint}` - For service-wide endpoint metrics
- `{date}:{endpoint}` - For daily aggregations

---

## Implementation Guide

### Step 1: Update wrangler.jsonc

Add the Analytics Engine binding to `wrangler.jsonc`:

```jsonc
{
  // ... existing config ...
  "analytics_engine_datasets": [
    {
      "binding": "ANALYTICS",
      "dataset": "beer_enrichment_metrics",
    },
  ],
}
```

### Step 2: Update Environment Type

Add the binding to the `Env` interface in `/workspace/ufobeer/src/index.ts`:

```typescript
export interface Env {
  // ... existing bindings ...

  // Analytics Engine
  ANALYTICS: AnalyticsEngineDataset;
}
```

### Step 3: Create Analytics Helper Module

Create a new file `/workspace/ufobeer/src/analytics.ts`:

```typescript
/**
 * Analytics Engine helper functions for tracking worker metrics.
 *
 * Uses Cloudflare Workers Analytics Engine for time-series analytics.
 * Data is retained for 3 months and can be queried via SQL API.
 */

export interface AnalyticsEngineDataset {
  writeDataPoint(data: { blobs?: string[]; doubles?: number[]; indexes?: string[] }): void;
}

export interface RequestMetrics {
  endpoint: string;
  method: string;
  storeId?: string;
  statusCode: number;
  errorType?: string;
  clientId: string;
  responseTimeMs: number;
  beersReturned?: number;
  cacheHit?: boolean;
  upstreamLatencyMs?: number;
}

export interface EnrichmentMetrics {
  beerId: string;
  source: 'perplexity' | 'cache';
  success: boolean;
  durationMs: number;
}

export interface CronMetrics {
  beersQueued: number;
  dailyRemaining: number;
  monthlyRemaining: number;
  durationMs: number;
}

/**
 * Get HTTP status category (2xx, 3xx, 4xx, 5xx)
 */
function getStatusCategory(statusCode: number): string {
  if (statusCode >= 200 && statusCode < 300) return '2xx';
  if (statusCode >= 300 && statusCode < 400) return '3xx';
  if (statusCode >= 400 && statusCode < 500) return '4xx';
  return '5xx';
}

/**
 * Classify error type from status code and context
 */
function getErrorType(statusCode: number, errorType?: string): string {
  if (errorType) return errorType;
  if (statusCode === 429) return 'rate_limit';
  if (statusCode === 401) return 'auth_fail';
  if (statusCode === 502) return 'upstream_error';
  if (statusCode >= 400 && statusCode < 500) return 'client_error';
  if (statusCode >= 500) return 'server_error';
  return 'success';
}

/**
 * Track an HTTP request to the worker.
 * Call this at the end of each request handler.
 *
 * Note: writeDataPoint is non-blocking - it returns immediately
 * and the runtime handles writing in the background.
 */
export function trackRequest(analytics: AnalyticsEngineDataset, metrics: RequestMetrics): void {
  const statusCategory = getStatusCategory(metrics.statusCode);
  const errorType = getErrorType(metrics.statusCode, metrics.errorType);
  const isError = metrics.statusCode >= 400;
  const isRateLimited = metrics.statusCode === 429;

  analytics.writeDataPoint({
    indexes: [`${metrics.clientId}:${metrics.endpoint}`],
    blobs: [
      metrics.endpoint, // blob1: endpoint
      metrics.method, // blob2: method
      metrics.storeId || '', // blob3: store_id
      statusCategory, // blob4: status_category
      errorType, // blob5: error_type
      metrics.clientId, // blob6: client_id
      'request', // blob7: event_type
      '', // blob8: enrichment_source (N/A)
    ],
    doubles: [
      metrics.responseTimeMs, // double1: response_time_ms
      1, // double2: request_count
      metrics.beersReturned || 0, // double3: beers_returned
      0, // double4: enrichment_count
      metrics.cacheHit ? 1 : 0, // double5: cache_hit
      isError ? 1 : 0, // double6: error_count
      isRateLimited ? 1 : 0, // double7: rate_limit_triggered
      metrics.upstreamLatencyMs || 0, // double8: upstream_latency_ms
    ],
  });
}

/**
 * Track an enrichment operation (Perplexity API call or cache hit).
 */
export function trackEnrichment(
  analytics: AnalyticsEngineDataset,
  metrics: EnrichmentMetrics
): void {
  analytics.writeDataPoint({
    indexes: [`enrichment:${metrics.source}`],
    blobs: [
      '', // blob1: endpoint (N/A)
      '', // blob2: method (N/A)
      '', // blob3: store_id (N/A)
      metrics.success ? '2xx' : '5xx', // blob4: status_category
      metrics.success ? 'success' : 'enrichment_fail', // blob5: error_type
      '', // blob6: client_id (N/A)
      'enrichment', // blob7: event_type
      metrics.source, // blob8: enrichment_source
    ],
    doubles: [
      metrics.durationMs, // double1: response_time_ms
      1, // double2: request_count (event count)
      0, // double3: beers_returned (N/A)
      1, // double4: enrichment_count
      metrics.source === 'cache' ? 1 : 0, // double5: cache_hit
      metrics.success ? 0 : 1, // double6: error_count
      0, // double7: rate_limit_triggered
      0, // double8: upstream_latency_ms
    ],
  });
}

/**
 * Track a cron job execution.
 */
export function trackCron(analytics: AnalyticsEngineDataset, metrics: CronMetrics): void {
  analytics.writeDataPoint({
    indexes: ['cron:scheduled'],
    blobs: [
      'cron', // blob1: endpoint
      '', // blob2: method (N/A)
      '', // blob3: store_id (N/A)
      '2xx', // blob4: status_category
      'success', // blob5: error_type
      '', // blob6: client_id (N/A)
      'cron', // blob7: event_type
      '', // blob8: enrichment_source (N/A)
    ],
    doubles: [
      metrics.durationMs, // double1: response_time_ms
      1, // double2: request_count (execution count)
      0, // double3: beers_returned (N/A)
      metrics.beersQueued, // double4: enrichment_count (beers queued)
      0, // double5: cache_hit (N/A)
      0, // double6: error_count
      0, // double7: rate_limit_triggered
      0, // double8: upstream_latency_ms
    ],
  });
}
```

### Step 4: Integrate with Request Handler

Update the `respond` helper in `index.ts` to track requests:

```typescript
import { trackRequest, trackEnrichment, trackCron } from './analytics';

// In the fetch handler, update the respond helper:
const respond = async (
  body: string | object | null,
  status: number,
  headers: Record<string, string>,
  error?: string
): Promise<Response> => {
  // Existing audit log
  ctx.waitUntil(writeAuditLog(env.DB, requestContext, request.method, url.pathname, status, error));

  // NEW: Track in Analytics Engine
  if (env.ANALYTICS) {
    trackRequest(env.ANALYTICS, {
      endpoint: url.pathname,
      method: request.method,
      storeId: url.searchParams.get('sid') || undefined,
      statusCode: status,
      errorType: error,
      clientId: requestContext.clientIdentifier,
      responseTimeMs: Date.now() - requestContext.startTime,
      // Add beersReturned and upstreamLatencyMs where applicable
    });
  }

  if (body === null) return new Response(null, { status, headers });
  if (typeof body === 'object') return Response.json(body, { status, headers });
  return new Response(body, { status, headers });
};
```

### Step 5: Track Enrichment Operations

Update the queue handler to track enrichment metrics:

```typescript
// In the queue handler, after each enrichment:
if (env.ANALYTICS) {
  trackEnrichment(env.ANALYTICS, {
    beerId,
    source: 'perplexity',
    success: abv !== null,
    durationMs: Date.now() - enrichmentStartTime,
  });
}
```

### Step 6: Track Cron Executions

Update the scheduled handler:

```typescript
// At the end of the scheduled handler:
if (env.ANALYTICS) {
  trackCron(env.ANALYTICS, {
    beersQueued: beersToEnrich.results.length,
    dailyRemaining: remainingToday - beersToEnrich.results.length,
    monthlyRemaining: monthlyLimit - (monthlyCount?.total || 0),
    durationMs: Date.now() - cronStartTime,
  });
}
```

### Step 7: Deploy and Verify

```bash
# Deploy the updated worker
cd /workspace/ufobeer
npx wrangler deploy

# The dataset is created automatically on first write
# Verify by making a test request and checking the dashboard
```

---

## Querying Data

### SQL API Endpoint

```
POST https://api.cloudflare.com/client/v4/accounts/{account_id}/analytics_engine/sql
Authorization: Bearer {api_token}
```

### Create API Token

1. Go to Cloudflare Dashboard > My Profile > API Tokens
2. Create a custom token with: `Account | Account Analytics | Read`
3. Store securely for querying

### Example Queries

#### Total Requests by Endpoint (Last 24 Hours)

```sql
SELECT
  blob1 AS endpoint,
  SUM(_sample_interval * double2) AS total_requests,
  SUM(_sample_interval * double6) AS total_errors,
  AVG(double1) AS avg_response_time_ms
FROM beer_enrichment_metrics
WHERE
  timestamp > NOW() - INTERVAL '24' HOUR
  AND blob7 = 'request'
GROUP BY endpoint
ORDER BY total_requests DESC
```

#### Rate Limit Triggers by Client (Last Hour)

```sql
SELECT
  blob6 AS client_id,
  SUM(_sample_interval * double7) AS rate_limit_count
FROM beer_enrichment_metrics
WHERE
  timestamp > NOW() - INTERVAL '1' HOUR
  AND double7 = 1
GROUP BY client_id
ORDER BY rate_limit_count DESC
LIMIT 10
```

#### Enrichment Success Rate by Day

```sql
SELECT
  toStartOfDay(timestamp) AS day,
  SUM(_sample_interval * double4) AS total_enrichments,
  SUM(_sample_interval * double6) AS failed_enrichments,
  (1 - SUM(_sample_interval * double6) / SUM(_sample_interval * double4)) * 100 AS success_rate
FROM beer_enrichment_metrics
WHERE
  timestamp > NOW() - INTERVAL '7' DAY
  AND blob7 = 'enrichment'
GROUP BY day
ORDER BY day DESC
```

#### Cache Hit Ratio (Last 24 Hours)

```sql
SELECT
  SUM(_sample_interval * double5) AS cache_hits,
  SUM(_sample_interval * double2) AS total_requests,
  (SUM(_sample_interval * double5) / SUM(_sample_interval * double2)) * 100 AS cache_hit_ratio
FROM beer_enrichment_metrics
WHERE
  timestamp > NOW() - INTERVAL '24' HOUR
  AND blob7 = 'request'
```

#### P95 Response Time by Endpoint

```sql
SELECT
  blob1 AS endpoint,
  quantile(0.95)(double1) AS p95_response_time_ms
FROM beer_enrichment_metrics
WHERE
  timestamp > NOW() - INTERVAL '24' HOUR
  AND blob7 = 'request'
GROUP BY endpoint
ORDER BY p95_response_time_ms DESC
```

#### Requests by Store Location (Last 7 Days)

```sql
SELECT
  blob3 AS store_id,
  SUM(_sample_interval * double2) AS total_requests,
  AVG(double3) AS avg_beers_returned
FROM beer_enrichment_metrics
WHERE
  timestamp > NOW() - INTERVAL '7' DAY
  AND blob7 = 'request'
  AND blob1 = '/beers'
  AND blob3 != ''
GROUP BY store_id
ORDER BY total_requests DESC
```

### Using cURL to Query

```bash
# Set your credentials
ACCOUNT_ID="your-account-id"
API_TOKEN="your-api-token"

# Execute a query
curl -X POST \
  "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/analytics_engine/sql" \
  -H "Authorization: Bearer ${API_TOKEN}" \
  -H "Content-Type: text/plain" \
  -d "SELECT blob1, COUNT(*) as count FROM beer_enrichment_metrics GROUP BY blob1"
```

### Understanding \_sample_interval

Analytics Engine automatically samples high-volume data. When aggregating, multiply by `_sample_interval` to get accurate counts:

```sql
-- WRONG: Will undercount if sampling occurred
SELECT COUNT(*) FROM beer_enrichment_metrics

-- CORRECT: Accounts for sampling
SELECT SUM(_sample_interval) FROM beer_enrichment_metrics
```

---

## Visualization with Grafana

### Setup: Altinity ClickHouse Plugin

Analytics Engine is compatible with the Altinity plugin for ClickHouse in Grafana.

#### 1. Install the Plugin

In Grafana, go to Configuration > Plugins > Search for "Altinity plugin for ClickHouse"

#### 2. Configure Data Source

| Setting             | Value                                                                             |
| ------------------- | --------------------------------------------------------------------------------- |
| URL                 | `https://api.cloudflare.com/client/v4/accounts/{account_id}/analytics_engine/sql` |
| Basic auth          | Disabled                                                                          |
| Custom HTTP Headers | `Authorization: Bearer {api_token}`                                               |

#### 3. Create Dashboard Panels

**Requests Over Time (Time Series)**

```sql
SELECT
  $timeSeries AS time,
  blob1 AS endpoint,
  SUM(_sample_interval * double2) AS requests
FROM beer_enrichment_metrics
WHERE
  $timeFilter
  AND blob7 = 'request'
GROUP BY time, endpoint
ORDER BY time
```

**Error Rate Gauge**

```sql
SELECT
  (SUM(_sample_interval * double6) / SUM(_sample_interval * double2)) * 100 AS error_rate
FROM beer_enrichment_metrics
WHERE
  $timeFilter
  AND blob7 = 'request'
```

**Response Time Heatmap**

```sql
SELECT
  $timeSeries AS time,
  quantile(0.5)(double1) AS p50,
  quantile(0.95)(double1) AS p95,
  quantile(0.99)(double1) AS p99
FROM beer_enrichment_metrics
WHERE
  $timeFilter
  AND blob7 = 'request'
GROUP BY time
ORDER BY time
```

### Grafana Macros

The Altinity plugin provides helpful macros:

| Macro         | Description                                    |
| ------------- | ---------------------------------------------- |
| `$timeSeries` | Rounds timestamp based on dashboard zoom level |
| `$timeFilter` | Applies dashboard time range to WHERE clause   |

---

## Best Practices

### Index Selection

1. **Match your query patterns**: If you primarily query by endpoint, use endpoint in the index
2. **Concatenate for multi-dimensional grouping**: `"{client_id}:{endpoint}"` enables queries on both
3. **Avoid unique values per row**: Don't use UUIDs as indexes (slows aggregation queries)
4. **Consider double-writing for different access patterns**: Write the same event with different indexes if needed

### Data Point Design

1. **Be consistent**: Always provide fields in the same order
2. **Use doubles for anything you'll aggregate**: Counts, durations, sizes
3. **Use blobs for dimensions**: Things you GROUP BY or filter on
4. **Include request context**: Client ID, endpoint, method for debugging

### Performance

1. **Don't await writeDataPoint()**: It's non-blocking by design
2. **Stay under 25 data points per invocation**: The runtime limit
3. **Use sampling-aware aggregations**: Always multiply by `_sample_interval`

### Cost Optimization

1. **Batch related metrics**: One data point can have 20 doubles
2. **Use blobs efficiently**: Total size limit is 16KB per data point
3. **Sample awareness**: The system auto-samples high-volume indexes

---

## Implementation Checklist

- [ ] Add Analytics Engine binding to `wrangler.jsonc`
- [ ] Update `Env` interface with `ANALYTICS` binding
- [ ] Create `analytics.ts` helper module
- [ ] Update `trackRequest` call in response handler
- [ ] Add `trackEnrichment` to queue consumer
- [ ] Add `trackCron` to scheduled handler
- [ ] Deploy updated worker
- [ ] Verify data appears in Cloudflare dashboard
- [ ] Create API token for SQL queries
- [ ] Set up Grafana dashboard (optional)
- [ ] Document query patterns for team

---

## References

- [Workers Analytics Engine Documentation](https://developers.cloudflare.com/analytics/analytics-engine/)
- [Getting Started Guide](https://developers.cloudflare.com/analytics/analytics-engine/get-started/)
- [SQL Reference](https://developers.cloudflare.com/analytics/analytics-engine/sql-reference/)
- [Pricing Information](https://developers.cloudflare.com/analytics/analytics-engine/pricing/)
- [Limits](https://developers.cloudflare.com/analytics/analytics-engine/limits/)
- [Sampling Documentation](https://developers.cloudflare.com/analytics/analytics-engine/sampling/)
- [Grafana Integration](https://developers.cloudflare.com/analytics/analytics-engine/grafana/)
- [SQL API Reference](https://developers.cloudflare.com/analytics/analytics-engine/sql-api/)
- [What is Cloudflare Workers Analytics Engine? (Blog)](https://lord.technology/2025/02/04/what-is-cloudflare-workers-analytics-engine.html)
- [How Cloudflare Uses Analytics Engine (Blog)](https://blog.cloudflare.com/using-analytics-engine-to-improve-analytics-engine/)
