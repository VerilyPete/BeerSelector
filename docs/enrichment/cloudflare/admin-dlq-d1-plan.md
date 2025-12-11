# Admin DLQ Endpoints - Option B: D1 Storage Implementation Plan

This document outlines the implementation plan for fixing the `/admin/dlq` endpoints using a D1-based approach where a queue consumer stores failed messages to the database for inspection, management, and replay.

## Overview

Instead of using the Cloudflare REST API to pull messages from the DLQ (Option A), this approach:

1. Adds a regular Worker consumer for `beer-enrichment-dlq`
2. When messages arrive in the DLQ, stores them in a new `dlq_messages` D1 table
3. Admin endpoints read/manage messages from D1 instead of pulling from the queue
4. Replay sends messages back to the main enrichment queue using the existing producer binding

### Architecture Diagram

```
beer-enrichment (main queue)
       |
       | max_retries: 3
       | failure
       v
beer-enrichment-dlq (dead letter queue)
       |
       | Worker consumer (push-based)
       v
  dlq_messages (D1 table)
       |
       | Admin endpoints query D1
       v
/admin/dlq/* endpoints
       |
       | Replay sends to main queue
       v
beer-enrichment (main queue)
```

---

## 1. D1 Schema - `dlq_messages` Table

Add this table to the existing `schema.sql`:

```sql
-- ============================================================================
-- dlq_messages: Dead Letter Queue message storage for admin inspection
-- ============================================================================
-- Stores messages that failed enrichment after exhausting retries
-- Enables persistent history, filtering, and manual replay/acknowledgment
CREATE TABLE IF NOT EXISTS dlq_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Message identification
    message_id TEXT NOT NULL UNIQUE,       -- Original queue message ID

    -- Beer data from message body
    beer_id TEXT NOT NULL,
    beer_name TEXT,
    brewer TEXT,

    -- Failure metadata
    failed_at INTEGER NOT NULL,            -- Timestamp when message hit DLQ (ms)
    failure_count INTEGER DEFAULT 3,       -- Number of retries before DLQ (from message.attempts)
    failure_reason TEXT,                   -- Last error message if captured

    -- Source tracking
    source_queue TEXT NOT NULL DEFAULT 'beer-enrichment',  -- Queue that sent to DLQ

    -- Status tracking
    -- pending: awaiting action
    -- replaying: optimistic status during replay (prevents race conditions)
    -- replayed: successfully sent back to main queue
    -- acknowledged: manually dismissed
    status TEXT NOT NULL DEFAULT 'pending',

    -- Replay tracking
    replay_count INTEGER DEFAULT 0,        -- Number of times message has been replayed

    -- Action timestamps (NULL until action taken)
    replayed_at INTEGER,                   -- When message was replayed to main queue
    acknowledged_at INTEGER,               -- When message was acknowledged/dismissed

    -- Full message for debugging
    raw_message TEXT                       -- JSON stringified original message body
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_dlq_status ON dlq_messages(status);
CREATE INDEX IF NOT EXISTS idx_dlq_beer_id ON dlq_messages(beer_id);
CREATE INDEX IF NOT EXISTS idx_dlq_failed_at ON dlq_messages(failed_at);
CREATE INDEX IF NOT EXISTS idx_dlq_status_failed ON dlq_messages(status, failed_at);

-- Indexes for cleanup queries (important for efficient DELETE operations)
CREATE INDEX IF NOT EXISTS idx_dlq_acknowledged_at ON dlq_messages(acknowledged_at);
CREATE INDEX IF NOT EXISTS idx_dlq_replayed_at ON dlq_messages(replayed_at);

-- Index for cursor-based pagination
CREATE INDEX IF NOT EXISTS idx_dlq_status_failed_id ON dlq_messages(status, failed_at, id);
```

### Schema Notes

| Column            | Type          | Description                                                                     |
| ----------------- | ------------- | ------------------------------------------------------------------------------- |
| `id`              | INTEGER (PK)  | Auto-increment primary key                                                      |
| `message_id`      | TEXT (UNIQUE) | Original queue message ID for deduplication                                     |
| `beer_id`         | TEXT          | Beer ID from the enrichment message                                             |
| `beer_name`       | TEXT          | Beer name for display/filtering                                                 |
| `brewer`          | TEXT          | Brewer name for display/filtering                                               |
| `failed_at`       | INTEGER       | Timestamp when message entered DLQ (ms since epoch)                             |
| `failure_count`   | INTEGER       | Number of delivery attempts before DLQ (from `message.attempts`)                |
| `failure_reason`  | TEXT          | Error message from last failure (if available)                                  |
| `source_queue`    | TEXT          | The queue that produced the DLQ message (for multi-queue scenarios)             |
| `status`          | TEXT          | Current status: `pending`, `replaying`, `replayed`, `acknowledged`              |
| `replay_count`    | INTEGER       | Number of times this message has been replayed (for tracking repeated failures) |
| `replayed_at`     | INTEGER       | Timestamp when replayed (NULL if not replayed)                                  |
| `acknowledged_at` | INTEGER       | Timestamp when acknowledged (NULL if not acknowledged)                          |
| `raw_message`     | TEXT          | Full JSON message body for debugging                                            |

### Status Values

- **`pending`**: Message is in DLQ awaiting action
- **`replaying`**: Intermediate status during replay (prevents race conditions from concurrent replays)
- **`replayed`**: Message was successfully sent back to main queue for retry
- **`acknowledged`**: Message was manually dismissed (won't be retried)

### Important Notes

- **`failure_count`**: This value comes from `message.attempts` which Cloudflare Queues provides. It represents the total number of delivery attempts before the message was sent to the DLQ.
- **`replay_count`**: Tracks how many times a message has been replayed. Useful for identifying messages that repeatedly fail even after replay.

---

## 2. Wrangler Configuration Changes

### Remove HTTP Pull Consumer (Not Needed)

The REST API approach required an HTTP pull consumer. With the D1 approach, we use a regular Worker consumer instead.

**Remove from wrangler.jsonc** (if present):

```jsonc
// REMOVE this consumer configuration
{
  "queues": {
    "consumers": [
      {
        "queue": "beer-enrichment-dlq",
        "type": "http_pull", // <-- Remove this
      },
    ],
  },
}
```

### Add Regular Worker Consumer for DLQ

Update `wrangler.jsonc` to add a Worker consumer for the DLQ:

```jsonc
{
  "queues": {
    "producers": [
      {
        "binding": "ENRICHMENT_QUEUE",
        "queue": "beer-enrichment",
      },
    ],
    "consumers": [
      {
        "queue": "beer-enrichment",
        "max_batch_size": 1,
        "max_retries": 3,
        "dead_letter_queue": "beer-enrichment-dlq",
        "max_batch_timeout": 30,
        "max_concurrency": 1,
      },
      {
        "queue": "beer-enrichment-dlq",
        "max_batch_size": 10,
        "max_retries": 3,
        "max_batch_timeout": 60,
      },
    ],
  },
}
```

### Consumer Configuration Notes

| Setting             | Value | Rationale                                                                                                |
| ------------------- | ----- | -------------------------------------------------------------------------------------------------------- |
| `max_batch_size`    | 10    | Process multiple DLQ messages at once                                                                    |
| `max_retries`       | 3     | **CRITICAL**: Allow retries if D1 write fails. With retries, `message.retry()` will requeue the message. |
| `max_batch_timeout` | 60    | Allow time for batch processing                                                                          |

**IMPORTANT**: We use `max_retries: 3` (not 0) for the DLQ consumer because:

1. If D1 insert fails transiently (network issues, rate limits), the message will be retried
2. `message.retry()` will properly requeue the message for another attempt
3. Only after 3 failed attempts will the message be permanently lost
4. This is much safer than `max_retries: 0` where a single D1 failure loses the message

**Note**: The DLQ consumer itself does NOT have a dead_letter_queue configured. After max_retries are exhausted, messages are dropped. Consider adding alerting for consumer failures.

---

## 3. Code Changes

### 3.1 Update Env Interface

```typescript
export interface Env {
  // ... existing bindings ...

  // Database
  DB: D1Database;

  // Queue producer (for replay)
  ENRICHMENT_QUEUE: Queue<EnrichmentMessage>;

  // Secrets
  API_KEY: string;
  ADMIN_SECRET: string;

  // ... other existing bindings ...
}
```

**Note**: No additional secrets needed for DLQ access (unlike the REST API approach which required `CF_ACCOUNT_ID`, `CF_QUEUES_API_TOKEN`, `DLQ_QUEUE_ID`).

### 3.2 Add Error Response Helper

Standardize error responses across all admin endpoints:

```typescript
interface ErrorResponseOptions {
  requestId: string;
  headers: Record<string, string>;
  status?: number;
}

function errorResponse(message: string, code: string, options: ErrorResponseOptions): Response {
  return Response.json(
    {
      success: false,
      error: {
        message,
        code,
      },
      requestId: options.requestId,
    },
    {
      status: options.status || 400,
      headers: options.headers,
    }
  );
}

// Usage examples:
// return errorResponse('ids array required', 'INVALID_REQUEST', { requestId, headers, status: 400 });
// return errorResponse('Database error', 'DB_ERROR', { requestId, headers, status: 500 });
// return errorResponse('Unauthorized', 'AUTH_FAILED', { requestId, headers, status: 403 });
```

### 3.3 Add DLQ Queue Handler

**CRITICAL**: The queue handler must handle BOTH the main queue AND the DLQ. A single Worker can only have one `queue()` export.

```typescript
// Type for queue messages
interface QueueMessage {
  id: string; // Original message ID
  body: EnrichmentMessage;
  timestamp: Date;
  attempts: number;
}

export default {
  // ... existing fetch() handler ...

  // ... existing scheduled() handler ...

  // Handle ALL queue messages (main queue and DLQ)
  async queue(
    batch: MessageBatch<EnrichmentMessage>,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    const requestId = crypto.randomUUID();

    log(
      'info',
      'Queue batch received',
      {
        messageCount: batch.messages.length,
        queue: batch.queue,
      },
      requestId
    );

    // Route based on which queue the message came from
    if (batch.queue === 'beer-enrichment-dlq') {
      // DLQ messages - store to D1
      await handleDlqBatch(batch, env, requestId);
    } else if (batch.queue === 'beer-enrichment') {
      // Main queue messages - process enrichment
      await handleEnrichmentBatch(batch, env, requestId);
    } else {
      log('warn', 'Unknown queue', { queue: batch.queue }, requestId);
      // Ack unknown messages to prevent infinite loops
      for (const message of batch.messages) {
        message.ack();
      }
    }
  },
};

// Handle DLQ messages - store to D1
async function handleDlqBatch(
  batch: MessageBatch<EnrichmentMessage>,
  env: Env,
  requestId: string
): Promise<void> {
  for (const message of batch.messages) {
    try {
      await storeDlqMessage(env.DB, message, batch.queue, requestId);
      message.ack();

      // Analytics tracking for DLQ storage
      trackAnalytics(env, 'dlq_store', {
        beer_id: message.body?.beer_id,
        attempts: message.attempts,
      });

      log(
        'info',
        'DLQ message stored',
        {
          messageId: message.id,
          beerId: message.body?.beer_id,
          attempts: message.attempts,
        },
        requestId
      );
    } catch (error) {
      log(
        'error',
        'Failed to store DLQ message',
        {
          messageId: message.id,
          error: String(error),
        },
        requestId
      );

      // With max_retries: 3, retry() will requeue the message
      // After 3 failures, the message will be dropped
      message.retry();
    }
  }

  log(
    'info',
    'DLQ batch processed',
    {
      processedCount: batch.messages.length,
    },
    requestId
  );
}

// Handle main enrichment queue messages
async function handleEnrichmentBatch(
  batch: MessageBatch<EnrichmentMessage>,
  env: Env,
  requestId: string
): Promise<void> {
  // Existing enrichment processing logic goes here
  for (const message of batch.messages) {
    try {
      // ... enrichment logic ...
      message.ack();
    } catch (error) {
      log(
        'error',
        'Enrichment failed',
        {
          messageId: message.id,
          error: String(error),
        },
        requestId
      );
      // Retry will eventually send to DLQ after max_retries exhausted
      message.retry();
    }
  }
}

// Analytics tracking helper
function trackAnalytics(env: Env, operation: string, data: Record<string, unknown>): void {
  // Implement analytics tracking (e.g., to Analytics Engine, logging, etc.)
  // This is important for monitoring DLQ health
  log('debug', `Analytics: ${operation}`, data);
}
```

### 3.4 Add DLQ Storage Function

```typescript
async function storeDlqMessage(
  db: D1Database,
  message: Message<EnrichmentMessage>,
  sourceQueue: string,
  requestId: string
): Promise<void> {
  const body = message.body;
  const now = Date.now();

  // Note: failure_count comes from message.attempts
  // This is the number of delivery attempts Cloudflare made before sending to DLQ
  await db
    .prepare(
      `
    INSERT INTO dlq_messages (
      message_id, beer_id, beer_name, brewer,
      failed_at, failure_count, source_queue, raw_message, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    ON CONFLICT(message_id) DO UPDATE SET
      failed_at = excluded.failed_at,
      failure_count = excluded.failure_count,
      raw_message = excluded.raw_message,
      status = 'pending'
  `
    )
    .bind(
      message.id,
      body.beer_id,
      body.beer_name || null,
      body.brewer || null,
      now,
      message.attempts, // This is the actual attempt count from Cloudflare
      sourceQueue,
      JSON.stringify(body)
    )
    .run();
}
```

### 3.5 Update Admin Endpoint Handlers

Replace the REST API-based handlers with D1 queries:

#### GET /admin/dlq - List DLQ Messages (Cursor-Based Pagination)

```typescript
interface DlqListParams {
  status?: string; // Filter by status: pending, replayed, acknowledged
  beer_id?: string; // Filter by beer ID
  limit?: number; // Max results (default 50, max 100)
  cursor?: string; // Cursor for pagination (base64 encoded)
  include_raw?: boolean; // Include raw_message in response
}

interface PaginationCursor {
  failed_at: number;
  id: number;
}

async function handleDlqList(
  env: Env,
  headers: Record<string, string>,
  reqCtx: RequestContext,
  params: URLSearchParams
): Promise<Response> {
  const status = params.get('status') || 'pending';
  const beerId = params.get('beer_id');
  const limit = Math.min(parseInt(params.get('limit') || '50'), 100);
  const cursorParam = params.get('cursor');
  const includeRaw = params.get('include_raw') === 'true';

  // Decode cursor if provided
  let cursor: PaginationCursor | null = null;
  if (cursorParam) {
    try {
      cursor = JSON.parse(atob(cursorParam));
    } catch {
      return errorResponse('Invalid cursor format', 'INVALID_CURSOR', {
        requestId: reqCtx.requestId,
        headers,
        status: 400,
      });
    }
  }

  // Build query with cursor-based pagination
  // This is more efficient than OFFSET for large datasets
  let query = 'SELECT * FROM dlq_messages WHERE 1=1';
  const bindings: (string | number)[] = [];

  if (status && status !== 'all') {
    query += ' AND status = ?';
    bindings.push(status);
  }

  if (beerId) {
    query += ' AND beer_id = ?';
    bindings.push(beerId);
  }

  // Cursor-based pagination: get records after the cursor position
  if (cursor) {
    query += ' AND (failed_at < ? OR (failed_at = ? AND id < ?))';
    bindings.push(cursor.failed_at, cursor.failed_at, cursor.id);
  }

  // Order by failed_at DESC, id DESC for consistent pagination
  query += ' ORDER BY failed_at DESC, id DESC LIMIT ?';
  bindings.push(limit + 1); // Fetch one extra to check if there are more

  const { results } = await env.DB.prepare(query)
    .bind(...bindings)
    .all<DlqMessageRow>();

  // Check if there are more results
  const hasMore = results.length > limit;
  const pageResults = hasMore ? results.slice(0, limit) : results;

  // Generate next cursor from the last item
  let nextCursor: string | null = null;
  if (hasMore && pageResults.length > 0) {
    const lastItem = pageResults[pageResults.length - 1];
    const cursorData: PaginationCursor = {
      failed_at: lastItem.failed_at,
      id: lastItem.id,
    };
    nextCursor = btoa(JSON.stringify(cursorData));
  }

  // Get total count for the filtered status (for display purposes)
  let countQuery = 'SELECT COUNT(*) as count FROM dlq_messages WHERE 1=1';
  const countBindings: (string | number)[] = [];

  if (status && status !== 'all') {
    countQuery += ' AND status = ?';
    countBindings.push(status);
  }

  if (beerId) {
    countQuery += ' AND beer_id = ?';
    countBindings.push(beerId);
  }

  const countResult = await env.DB.prepare(countQuery)
    .bind(...countBindings)
    .first<{ count: number }>();

  const messages = pageResults.map(row => {
    const base = {
      id: row.id,
      message_id: row.message_id,
      beer_id: row.beer_id,
      beer_name: row.beer_name,
      brewer: row.brewer,
      failed_at: row.failed_at,
      failure_count: row.failure_count,
      failure_reason: row.failure_reason,
      source_queue: row.source_queue,
      status: row.status,
      replay_count: row.replay_count,
      replayed_at: row.replayed_at,
      acknowledged_at: row.acknowledged_at,
    };

    // Optionally include raw_message (can be large)
    if (includeRaw) {
      return { ...base, raw_message: row.raw_message };
    }
    return base;
  });

  return Response.json(
    {
      success: true,
      requestId: reqCtx.requestId,
      data: {
        messages,
        total_count: countResult?.count || 0,
        limit,
        next_cursor: nextCursor,
        has_more: hasMore,
      },
    },
    { headers }
  );
}

interface DlqMessageRow {
  id: number;
  message_id: string;
  beer_id: string;
  beer_name: string | null;
  brewer: string | null;
  failed_at: number;
  failure_count: number;
  failure_reason: string | null;
  source_queue: string;
  status: string;
  replay_count: number;
  replayed_at: number | null;
  acknowledged_at: number | null;
  raw_message: string | null;
}
```

#### POST /admin/dlq/replay - Replay Messages (With Race Condition Fix)

```typescript
interface ReplayRequest {
  ids: number[]; // D1 row IDs to replay
  delay_seconds?: number; // Delay before processing (default 0)
}

async function handleDlqReplay(
  request: Request,
  env: Env,
  headers: Record<string, string>,
  reqCtx: RequestContext
): Promise<Response> {
  const body = (await request.json()) as ReplayRequest;
  const { ids, delay_seconds = 0 } = body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return errorResponse('ids array required', 'INVALID_REQUEST', {
      requestId: reqCtx.requestId,
      headers,
      status: 400,
    });
  }

  // Limit batch size
  const limitedIds = ids.slice(0, 50);
  const now = Date.now();

  // STEP 1: Optimistically update status to 'replaying' to prevent race conditions
  // This ensures concurrent replay requests don't process the same messages
  const placeholders = limitedIds.map(() => '?').join(',');
  const updateResult = await env.DB.prepare(
    `UPDATE dlq_messages
     SET status = 'replaying'
     WHERE id IN (${placeholders}) AND status = 'pending'`
  )
    .bind(...limitedIds)
    .run();

  const claimedCount = updateResult.meta.changes;

  if (claimedCount === 0) {
    return Response.json(
      {
        success: true,
        requestId: reqCtx.requestId,
        data: {
          requested_count: limitedIds.length,
          replayed_count: 0,
          message: 'No pending messages found to replay',
        },
      },
      { headers }
    );
  }

  // STEP 2: Fetch the messages we just claimed
  const { results } = await env.DB.prepare(
    `SELECT id, raw_message, replay_count FROM dlq_messages
     WHERE id IN (${placeholders}) AND status = 'replaying'`
  )
    .bind(...limitedIds)
    .all<{ id: number; raw_message: string; replay_count: number }>();

  let replayedCount = 0;
  const replayedIds: number[] = [];
  const failedIds: number[] = [];

  // STEP 3: Send messages to queue
  for (const row of results) {
    try {
      const messageBody = JSON.parse(row.raw_message) as EnrichmentMessage;

      await env.ENRICHMENT_QUEUE.send(messageBody, {
        delaySeconds: delay_seconds,
      });

      replayedIds.push(row.id);
      replayedCount++;

      log(
        'info',
        'DLQ message replayed',
        {
          dlqId: row.id,
          beerId: messageBody.beer_id,
          replayCount: row.replay_count + 1,
        },
        reqCtx.requestId
      );
    } catch (error) {
      log(
        'error',
        'Failed to replay DLQ message',
        {
          dlqId: row.id,
          error: String(error),
        },
        reqCtx.requestId
      );
      failedIds.push(row.id);
    }
  }

  // STEP 4: Update successfully replayed messages
  if (replayedIds.length > 0) {
    const successPlaceholders = replayedIds.map(() => '?').join(',');
    await env.DB.prepare(
      `UPDATE dlq_messages
       SET status = 'replayed', replayed_at = ?, replay_count = replay_count + 1
       WHERE id IN (${successPlaceholders})`
    )
      .bind(now, ...replayedIds)
      .run();
  }

  // STEP 5: Rollback failed messages back to 'pending'
  if (failedIds.length > 0) {
    const failPlaceholders = failedIds.map(() => '?').join(',');
    await env.DB.prepare(
      `UPDATE dlq_messages
       SET status = 'pending'
       WHERE id IN (${failPlaceholders})`
    )
      .bind(...failedIds)
      .run();

    log(
      'warn',
      'Rolled back failed replay attempts',
      {
        failedIds,
      },
      reqCtx.requestId
    );
  }

  return Response.json(
    {
      success: true,
      requestId: reqCtx.requestId,
      data: {
        requested_count: limitedIds.length,
        claimed_count: claimedCount,
        replayed_count: replayedCount,
        failed_count: failedIds.length,
        queued_to: 'beer-enrichment',
      },
    },
    { headers }
  );
}
```

#### POST /admin/dlq/acknowledge - Acknowledge Messages

```typescript
interface AcknowledgeRequest {
  ids: number[]; // D1 row IDs to acknowledge
}

async function handleDlqAcknowledge(
  request: Request,
  env: Env,
  headers: Record<string, string>,
  reqCtx: RequestContext
): Promise<Response> {
  const body = (await request.json()) as AcknowledgeRequest;
  const { ids } = body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return errorResponse('ids array required', 'INVALID_REQUEST', {
      requestId: reqCtx.requestId,
      headers,
      status: 400,
    });
  }

  // Limit batch size
  const limitedIds = ids.slice(0, 100);
  const now = Date.now();

  const placeholders = limitedIds.map(() => '?').join(',');
  const result = await env.DB.prepare(
    `UPDATE dlq_messages
     SET status = 'acknowledged', acknowledged_at = ?
     WHERE id IN (${placeholders}) AND status = 'pending'`
  )
    .bind(now, ...limitedIds)
    .run();

  log(
    'info',
    'DLQ messages acknowledged',
    {
      requestedCount: limitedIds.length,
      acknowledgedCount: result.meta.changes,
    },
    reqCtx.requestId
  );

  return Response.json(
    {
      success: true,
      requestId: reqCtx.requestId,
      data: {
        acknowledged_count: result.meta.changes,
      },
    },
    { headers }
  );
}
```

#### GET /admin/dlq/stats - Get DLQ Statistics

```typescript
async function handleDlqStats(
  env: Env,
  headers: Record<string, string>,
  reqCtx: RequestContext
): Promise<Response> {
  // Get counts by status
  const { results: statusCounts } = await env.DB.prepare(
    `
    SELECT status, COUNT(*) as count
    FROM dlq_messages
    GROUP BY status
  `
  ).all<{ status: string; count: number }>();

  // Get oldest pending message
  const oldestPending = await env.DB.prepare(
    `
    SELECT failed_at
    FROM dlq_messages
    WHERE status = 'pending'
    ORDER BY failed_at ASC
    LIMIT 1
  `
  ).first<{ failed_at: number }>();

  // Get failure breakdown (top brewers with failures)
  const { results: topFailures } = await env.DB.prepare(
    `
    SELECT brewer, COUNT(*) as count
    FROM dlq_messages
    WHERE status = 'pending' AND brewer IS NOT NULL
    GROUP BY brewer
    ORDER BY count DESC
    LIMIT 10
  `
  ).all<{ brewer: string; count: number }>();

  // Get recent activity (last 24 hours)
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const recentActivity = await env.DB.prepare(
    `
    SELECT
      COUNT(CASE WHEN status = 'replayed' AND replayed_at > ? THEN 1 END) as replayed_24h,
      COUNT(CASE WHEN status = 'acknowledged' AND acknowledged_at > ? THEN 1 END) as acknowledged_24h,
      COUNT(CASE WHEN failed_at > ? THEN 1 END) as new_failures_24h
    FROM dlq_messages
  `
  )
    .bind(dayAgo, dayAgo, dayAgo)
    .first<{
      replayed_24h: number;
      acknowledged_24h: number;
      new_failures_24h: number;
    }>();

  // Get messages with multiple replays (indicates persistent issues)
  const { results: repeatFailures } = await env.DB.prepare(
    `
    SELECT beer_id, beer_name, replay_count
    FROM dlq_messages
    WHERE status = 'pending' AND replay_count > 0
    ORDER BY replay_count DESC
    LIMIT 10
  `
  ).all<{ beer_id: string; beer_name: string | null; replay_count: number }>();

  const stats: Record<string, number> = {};
  for (const row of statusCounts) {
    stats[row.status] = row.count;
  }

  const oldestAgeHours = oldestPending
    ? (Date.now() - oldestPending.failed_at) / (60 * 60 * 1000)
    : 0;

  return Response.json(
    {
      success: true,
      requestId: reqCtx.requestId,
      data: {
        by_status: {
          pending: stats['pending'] || 0,
          replaying: stats['replaying'] || 0,
          replayed: stats['replayed'] || 0,
          acknowledged: stats['acknowledged'] || 0,
        },
        oldest_pending_age_hours: Math.round(oldestAgeHours * 10) / 10,
        top_failing_brewers: topFailures,
        repeat_failures: repeatFailures,
        last_24h: recentActivity || {
          replayed_24h: 0,
          acknowledged_24h: 0,
          new_failures_24h: 0,
        },
      },
    },
    { headers }
  );
}
```

### 3.6 Add Routes to Main Fetch Handler

```typescript
// In the fetch handler, after API key authentication:

// Admin routes (require additional admin secret)
if (url.pathname.startsWith('/admin/')) {
  const adminAuth = await authorizeAdmin(request, env);
  if (!adminAuth.authorized) {
    return errorResponse(adminAuth.error || 'Unauthorized', 'AUTH_FAILED', {
      requestId: requestContext.requestId,
      headers: corsHeaders || {},
      status: 403,
    });
  }

  // Route: GET /admin/dlq
  if (url.pathname === '/admin/dlq' && request.method === 'GET') {
    return handleDlqList(
      env,
      { ...corsHeaders!, ...rateLimitHeaders },
      requestContext,
      url.searchParams
    );
  }

  // Route: GET /admin/dlq/stats
  if (url.pathname === '/admin/dlq/stats' && request.method === 'GET') {
    return handleDlqStats(env, { ...corsHeaders!, ...rateLimitHeaders }, requestContext);
  }

  // Route: POST /admin/dlq/replay
  if (url.pathname === '/admin/dlq/replay' && request.method === 'POST') {
    return handleDlqReplay(request, env, { ...corsHeaders!, ...rateLimitHeaders }, requestContext);
  }

  // Route: POST /admin/dlq/acknowledge
  if (url.pathname === '/admin/dlq/acknowledge' && request.method === 'POST') {
    return handleDlqAcknowledge(
      request,
      env,
      { ...corsHeaders!, ...rateLimitHeaders },
      requestContext
    );
  }
}
```

---

## 4. Advantages Over REST API Approach

| Aspect                 | REST API (Option A)                                   | D1 Storage (Option B)                              |
| ---------------------- | ----------------------------------------------------- | -------------------------------------------------- |
| **API Tokens**         | Requires separate CF API token with queue permissions | No additional tokens - uses existing D1 binding    |
| **Message History**    | Messages gone after acknowledge                       | Persistent history - can query old failures        |
| **Filtering**          | Must pull all messages, filter client-side            | SQL queries with indexes for efficient filtering   |
| **Visibility Timeout** | Must manage lease_ids and timeouts                    | No timeout concerns - messages stored persistently |
| **Message Replay**     | Complex: pull, decode base64, re-queue, ack           | Simple: read from D1, send to queue, update status |
| **Debugging**          | Limited to current queue contents                     | Full history with timestamps and status tracking   |
| **Complexity**         | HTTP calls to external API, token management          | Standard D1 operations already used elsewhere      |
| **Cost**               | API calls ($0.40/million pulls)                       | D1 storage (included in free tier up to limits)    |

### Additional Benefits

1. **Search and Filter**: Can search by beer name, brewer, date range, etc.
2. **Audit Trail**: Know exactly when messages were replayed or acknowledged
3. **Analytics**: Track failure patterns over time
4. **Batch Operations**: Efficient bulk replay/acknowledge with SQL
5. **No Rate Limits**: D1 has no per-second rate limits like queue pull API
6. **Repeat Failure Detection**: `replay_count` column tracks messages that fail repeatedly

---

## 5. Auto-Cleanup Strategy

Add automatic cleanup of old acknowledged/replayed messages to prevent table growth:

```typescript
// Add to scheduled() handler or a separate cron
async function cleanupOldDlqMessages(db: D1Database, requestId: string): Promise<void> {
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const batchLimit = 1000; // Limit deletions per iteration to avoid long-running queries

  // Delete acknowledged messages older than 30 days (in batches)
  let ackDeleted = 0;
  let ackResult;
  do {
    ackResult = await db
      .prepare(
        `
      DELETE FROM dlq_messages
      WHERE id IN (
        SELECT id FROM dlq_messages
        WHERE status = 'acknowledged'
          AND acknowledged_at < ?
        LIMIT ?
      )
    `
      )
      .bind(thirtyDaysAgo, batchLimit)
      .run();
    ackDeleted += ackResult.meta.changes;
  } while (ackResult.meta.changes === batchLimit);

  // Delete replayed messages older than 30 days (in batches)
  let replayDeleted = 0;
  let replayResult;
  do {
    replayResult = await db
      .prepare(
        `
      DELETE FROM dlq_messages
      WHERE id IN (
        SELECT id FROM dlq_messages
        WHERE status = 'replayed'
          AND replayed_at < ?
        LIMIT ?
      )
    `
      )
      .bind(thirtyDaysAgo, batchLimit)
      .run();
    replayDeleted += replayResult.meta.changes;
  } while (replayResult.meta.changes === batchLimit);

  if (ackDeleted > 0 || replayDeleted > 0) {
    log(
      'info',
      'DLQ cleanup completed',
      {
        acknowledged_deleted: ackDeleted,
        replayed_deleted: replayDeleted,
      },
      requestId
    );
  }
}
```

### Cleanup Configuration

| Status         | Retention Period  | Rationale                                                |
| -------------- | ----------------- | -------------------------------------------------------- |
| `pending`      | Never auto-delete | Requires manual action                                   |
| `replaying`    | Never auto-delete | Should transition quickly; if stuck, needs investigation |
| `replayed`     | 30 days           | Keep for debugging replay issues                         |
| `acknowledged` | 30 days           | Keep for audit trail                                     |

Add to wrangler.jsonc cron triggers:

```jsonc
{
  "triggers": {
    "crons": [
      "0 */12 * * *", // Existing: enrichment every 12 hours
      "0 3 * * *", // New: DLQ cleanup daily at 3 AM UTC
    ],
  },
}
```

---

## 6. Monitoring and Alerting Recommendations

### Key Metrics to Monitor

1. **DLQ Pending Count**: Alert when exceeds threshold (e.g., > 100 pending messages)
2. **Oldest Pending Message Age**: Alert when oldest message is > 24 hours old
3. **DLQ Consumer Failures**: Alert on any failures in the DLQ consumer (D1 write failures)
4. **Repeat Failures**: Alert when messages have `replay_count > 2` (persistent issues)

### Alerting Implementation

```typescript
// Add to scheduled handler or stats endpoint
async function checkDlqAlerts(db: D1Database, requestId: string): Promise<void> {
  // Check pending count
  const pendingCount = await db
    .prepare(`SELECT COUNT(*) as count FROM dlq_messages WHERE status = 'pending'`)
    .first<{ count: number }>();

  if (pendingCount && pendingCount.count > 100) {
    log(
      'warn',
      'DLQ alert: High pending count',
      {
        count: pendingCount.count,
        threshold: 100,
      },
      requestId
    );
    // TODO: Send to alerting system (PagerDuty, Slack, etc.)
  }

  // Check oldest message age
  const oldestPending = await db
    .prepare(
      `
    SELECT failed_at FROM dlq_messages
    WHERE status = 'pending'
    ORDER BY failed_at ASC LIMIT 1
  `
    )
    .first<{ failed_at: number }>();

  if (oldestPending) {
    const ageHours = (Date.now() - oldestPending.failed_at) / (60 * 60 * 1000);
    if (ageHours > 24) {
      log(
        'warn',
        'DLQ alert: Old pending message',
        {
          ageHours: Math.round(ageHours * 10) / 10,
          threshold: 24,
        },
        requestId
      );
      // TODO: Send to alerting system
    }
  }

  // Check for repeat failures
  const repeatFailures = await db
    .prepare(
      `
    SELECT COUNT(*) as count FROM dlq_messages
    WHERE status = 'pending' AND replay_count > 2
  `
    )
    .first<{ count: number }>();

  if (repeatFailures && repeatFailures.count > 0) {
    log(
      'warn',
      'DLQ alert: Repeat failures detected',
      {
        count: repeatFailures.count,
      },
      requestId
    );
    // TODO: Send to alerting system
  }
}
```

---

## 7. Testing Commands

```bash
# Deploy schema changes first
wrangler d1 execute beer-db --remote --file=schema.sql

# Deploy worker with queue consumer
wrangler deploy

# Set admin secret (if not already set)
wrangler secret put ADMIN_SECRET
# Enter: a secure random string (openssl rand -hex 32)

# Test: List pending DLQ messages
curl -H "X-API-Key: $API_KEY" -H "X-Admin-Secret: $ADMIN_SECRET" \
  "https://your-worker.workers.dev/admin/dlq?status=pending&limit=10"

# Test: List with raw_message included
curl -H "X-API-Key: $API_KEY" -H "X-Admin-Secret: $ADMIN_SECRET" \
  "https://your-worker.workers.dev/admin/dlq?status=pending&include_raw=true"

# Test: Get DLQ statistics
curl -H "X-API-Key: $API_KEY" -H "X-Admin-Secret: $ADMIN_SECRET" \
  "https://your-worker.workers.dev/admin/dlq/stats"

# Test: Filter by beer ID
curl -H "X-API-Key: $API_KEY" -H "X-Admin-Secret: $ADMIN_SECRET" \
  "https://your-worker.workers.dev/admin/dlq?beer_id=7239443"

# Test: Cursor-based pagination
curl -H "X-API-Key: $API_KEY" -H "X-Admin-Secret: $ADMIN_SECRET" \
  "https://your-worker.workers.dev/admin/dlq?limit=10"
# Use next_cursor from response for next page:
curl -H "X-API-Key: $API_KEY" -H "X-Admin-Secret: $ADMIN_SECRET" \
  "https://your-worker.workers.dev/admin/dlq?limit=10&cursor=<next_cursor_value>"

# Test: Replay specific messages (use IDs from list response)
curl -X POST \
  -H "X-API-Key: $API_KEY" \
  -H "X-Admin-Secret: $ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"ids": [1, 2, 3], "delay_seconds": 60}' \
  "https://your-worker.workers.dev/admin/dlq/replay"

# Test: Acknowledge (dismiss) messages
curl -X POST \
  -H "X-API-Key: $API_KEY" \
  -H "X-Admin-Secret: $ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"ids": [4, 5]}' \
  "https://your-worker.workers.dev/admin/dlq/acknowledge"

# Verify DLQ consumer is working (check logs)
wrangler tail --format=pretty

# Check D1 table directly
wrangler d1 execute beer-db --remote --command \
  "SELECT id, beer_id, beer_name, status, replay_count, failed_at FROM dlq_messages ORDER BY failed_at DESC LIMIT 10"
```

---

## 8. Implementation Checklist

### Phase 1: Schema and Configuration

- [ ] Add `dlq_messages` table to `schema.sql` with all columns:
  - [ ] `source_queue` column
  - [ ] `replay_count` column
  - [ ] Indexes for `acknowledged_at`, `replayed_at`
  - [ ] Composite index for cursor pagination
- [ ] Apply schema: `wrangler d1 execute beer-db --remote --file=schema.sql`
- [ ] Update `wrangler.jsonc` with DLQ consumer configuration (`max_retries: 3`)
- [ ] Remove HTTP pull consumer config (if present)

### Phase 2: Queue Handler

- [ ] Add `queue()` export to worker that handles BOTH main queue and DLQ
- [ ] Implement `handleDlqBatch()` for DLQ messages
- [ ] Implement `handleEnrichmentBatch()` for main queue messages
- [ ] Implement `storeDlqMessage()` function with `source_queue`
- [ ] Add analytics tracking for DLQ operations
- [ ] Add logging for DLQ message processing
- [ ] Test with a manually failed message

### Phase 3: Admin Endpoints

- [ ] Add `errorResponse()` helper for standardized errors
- [ ] Implement `handleDlqList()` with cursor-based pagination
- [ ] Add `include_raw` parameter support
- [ ] Implement `handleDlqStats()` for statistics (including `repeat_failures`)
- [ ] Implement `handleDlqReplay()` with optimistic status update:
  - [ ] Set status to `replaying` before queue send
  - [ ] Rollback to `pending` on failure
  - [ ] Increment `replay_count` on success
- [ ] Implement `handleDlqAcknowledge()` for message dismissal
- [ ] Add routes to main fetch handler

### Phase 4: Cleanup and Monitoring

- [ ] Implement `cleanupOldDlqMessages()` function with batch deletes
- [ ] Add cleanup to scheduled handler
- [ ] Implement `checkDlqAlerts()` for monitoring
- [ ] Set up alerting thresholds:
  - [ ] Pending count > 100
  - [ ] Oldest message > 24 hours
  - [ ] Repeat failures detected

### Phase 5: Deployment and Testing

- [ ] Deploy: `wrangler deploy`
- [ ] Test all endpoints
- [ ] Verify cursor pagination works correctly
- [ ] Test replay race condition handling
- [ ] Update operations documentation

---

## 9. API Reference

### GET /admin/dlq

List DLQ messages with optional filtering and cursor-based pagination.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `status` | string | `pending` | Filter by status: `pending`, `replaying`, `replayed`, `acknowledged`, `all` |
| `beer_id` | string | - | Filter by specific beer ID |
| `limit` | number | 50 | Max results (max 100) |
| `cursor` | string | - | Base64-encoded pagination cursor from previous response |
| `include_raw` | boolean | false | Include `raw_message` field in response |

**Response:**

```json
{
  "success": true,
  "requestId": "uuid",
  "data": {
    "messages": [
      {
        "id": 1,
        "message_id": "msg_abc123",
        "beer_id": "7239443",
        "beer_name": "Hop Stoopid",
        "brewer": "Lagunitas",
        "failed_at": 1702300000000,
        "failure_count": 3,
        "failure_reason": null,
        "source_queue": "beer-enrichment",
        "status": "pending",
        "replay_count": 0,
        "replayed_at": null,
        "acknowledged_at": null,
        "raw_message": "{...}"
      }
    ],
    "total_count": 15,
    "limit": 50,
    "next_cursor": "eyJmYWlsZWRfYXQiOjE3MDIzMDAwMDAwMDAsImlkIjoxfQ==",
    "has_more": true
  }
}
```

**Note:** `raw_message` is only included when `include_raw=true`.

### GET /admin/dlq/stats

Get DLQ statistics and failure analysis.

**Response:**

```json
{
  "success": true,
  "requestId": "uuid",
  "data": {
    "by_status": {
      "pending": 15,
      "replaying": 0,
      "replayed": 42,
      "acknowledged": 8
    },
    "oldest_pending_age_hours": 47.5,
    "top_failing_brewers": [
      { "brewer": "Unknown Brewery", "count": 5 },
      { "brewer": "Local Craft Co", "count": 3 }
    ],
    "repeat_failures": [{ "beer_id": "123", "beer_name": "Problem IPA", "replay_count": 3 }],
    "last_24h": {
      "replayed_24h": 12,
      "acknowledged_24h": 3,
      "new_failures_24h": 8
    }
  }
}
```

### POST /admin/dlq/replay

Replay messages back to the main enrichment queue.

**Request:**

```json
{
  "ids": [1, 2, 3],
  "delay_seconds": 60
}
```

**Response:**

```json
{
  "success": true,
  "requestId": "uuid",
  "data": {
    "requested_count": 3,
    "claimed_count": 3,
    "replayed_count": 3,
    "failed_count": 0,
    "queued_to": "beer-enrichment"
  }
}
```

**Race Condition Handling:**

- Messages are first updated to `replaying` status
- If queue send fails, status is rolled back to `pending`
- If queue send succeeds, status is updated to `replayed` and `replay_count` is incremented

### POST /admin/dlq/acknowledge

Acknowledge (dismiss) messages without replaying.

**Request:**

```json
{
  "ids": [4, 5]
}
```

**Response:**

```json
{
  "success": true,
  "requestId": "uuid",
  "data": {
    "acknowledged_count": 2
  }
}
```

---

## 10. Error Handling Considerations

### Queue Consumer Failures

With `max_retries: 3` configured for the DLQ consumer:

- If D1 insert fails, `message.retry()` will requeue the message
- After 3 failed attempts, the message is permanently lost
- **Recommendation**: Set up alerting on consumer errors to catch persistent D1 issues

### Replay Failures

The replay endpoint now handles failures gracefully:

1. Messages are claimed with `replaying` status (prevents concurrent replays)
2. If sending to main queue fails, status is rolled back to `pending`
3. Partial failures are logged with specific message IDs
4. `replay_count` tracks how many times a message has been replayed

### D1 Write Limits

- Free tier: 100,000 row writes/day
- DLQ storage adds minimal overhead (only failed messages)
- Monitor with `wrangler d1 info beer-db`

### Standardized Error Responses

All error responses follow a consistent format:

```json
{
  "success": false,
  "error": {
    "message": "Human-readable error message",
    "code": "ERROR_CODE"
  },
  "requestId": "uuid"
}
```

---

## 11. Migration from REST API Approach

If you previously implemented the REST API approach (Option A), follow these steps to migrate:

1. **Remove old secrets** (no longer needed):

   ```bash
   wrangler secret delete CF_ACCOUNT_ID
   wrangler secret delete CF_QUEUES_API_TOKEN
   wrangler secret delete DLQ_QUEUE_ID
   ```

2. **Remove HTTP pull consumer**:

   ```bash
   wrangler queues consumer http remove beer-enrichment-dlq
   ```

3. **Apply new schema** with `dlq_messages` table

4. **Deploy new worker** with queue consumer

5. **Note**: Messages already in the DLQ queue will be processed by the new consumer and stored in D1

---

## References

- [Cloudflare Queues - Worker Consumers](https://developers.cloudflare.com/queues/configuration/javascript-apis/#consumer)
- [Cloudflare D1 Documentation](https://developers.cloudflare.com/d1/)
- [Original DLQ Plan](./admin-dlq-plan.md)
- [REST API Approach (Option A)](./admin-dlq-rest-api-plan.md)
