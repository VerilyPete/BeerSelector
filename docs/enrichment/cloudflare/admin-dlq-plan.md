# Admin DLQ Endpoint Implementation Plan

This document outlines the plan for implementing an `/admin/dlq` endpoint to inspect and manage failed enrichment messages in the dead letter queue (DLQ).

## Overview

The beer enrichment system uses Cloudflare Queues with a dead letter queue (`beer-enrichment-dlq`) to capture failed enrichment attempts. Messages land in the DLQ after exhausting 3 retry attempts.

### Current Architecture

```
beer-enrichment (main queue)
       │
       │ max_retries: 3
       │ max_batch_size: 1
       ▼
beer-enrichment-dlq (dead letter queue)
       │
       │ Holds failed messages for 4 days
       │ (unless consumed)
       ▼
[Currently not consumed]
```

## DLQ Capabilities Research

### How Cloudflare Queues DLQ Works

1. **What is a DLQ?** A Dead Letter Queue is where messages are sent after delivery failures exceed `max_retries` (default: 3).

2. **Message Retention**: Messages in a DLQ without an active consumer persist for **4 days** before automatic deletion.

3. **DLQ is a Regular Queue**: A DLQ functions identically to any other queue - it can be produced to and consumed from independently.

4. **No Special API**: There is no special "DLQ inspection" API. To read from a DLQ, you must use the same methods as any queue:
   - Worker consumer (push-based)
   - HTTP pull consumer (REST API)

### Options for Inspecting DLQ Messages

| Method                     | Pros                                     | Cons                                                  | Suitability                |
| -------------------------- | ---------------------------------------- | ----------------------------------------------------- | -------------------------- |
| **Cloudflare Dashboard**   | No code required, visual interface       | Manual only, no programmatic access                   | Good for ad-hoc inspection |
| **Wrangler CLI**           | Quick queries, no deployment             | No message inspection commands, only queue management | Not suitable               |
| **REST API Pull Consumer** | Full programmatic access, can build UI   | Requires API token with elevated permissions          | Best for `/admin/dlq`      |
| **Worker Consumer**        | Native integration, automatic processing | Push-based, harder to "inspect without consuming"     | Best for auto-replay       |

### REST API Endpoints for Queues

The Cloudflare REST API provides these message operations:

| Operation         | Method | Endpoint                                                  |
| ----------------- | ------ | --------------------------------------------------------- |
| Push message      | POST   | `/accounts/{account_id}/queues/{queue_id}/messages`       |
| Pull messages     | POST   | `/accounts/{account_id}/queues/{queue_id}/messages/pull`  |
| Acknowledge/Retry | POST   | `/accounts/{account_id}/queues/{queue_id}/messages/ack`   |
| Push batch        | POST   | `/accounts/{account_id}/queues/{queue_id}/messages/batch` |

**Authentication**: Requires API token with `queues_read` and `queues_write` permissions.

**Rate Limits**: Pull consumers support up to 5,000 messages/second per queue (as of April 2025).

### Dashboard Capabilities

The Cloudflare dashboard Messages tab allows:

- **List messages**: Preview without affecting queue position or triggering retries
- **View details**: Message body, timestamp, retry count, producer source
- **Acknowledge messages**: Permanently remove selected messages
- Non-destructive preview (does not increment retry counts)

## Proposed Endpoint Design

### Option A: Direct REST API Proxy (Recommended)

The Worker acts as a proxy to the Cloudflare Queues REST API, providing:

- Authenticated access through existing API key
- Filtered/formatted responses
- Admin-specific operations

#### Routes

| Method | Path                     | Description                        |
| ------ | ------------------------ | ---------------------------------- |
| GET    | `/admin/dlq`             | List failed messages from DLQ      |
| GET    | `/admin/dlq/:messageId`  | Get single message details         |
| POST   | `/admin/dlq/replay`      | Replay messages back to main queue |
| POST   | `/admin/dlq/acknowledge` | Acknowledge (delete) messages      |
| GET    | `/admin/dlq/stats`       | Get DLQ statistics                 |

#### Request/Response Formats

**GET /admin/dlq**

Request:

```http
GET /admin/dlq?limit=10&visibility_timeout_ms=30000
X-API-Key: <api_key>
X-Admin-Secret: <admin_secret>
```

Response:

```json
{
  "success": true,
  "requestId": "uuid",
  "data": {
    "backlog_count": 15,
    "messages": [
      {
        "id": "msg_abc123",
        "lease_id": "lease_xyz789",
        "timestamp_ms": 1702300000000,
        "attempts": 3,
        "body": {
          "beer_id": "7239443",
          "beer_name": "Hop Stoopid",
          "brewer": "Lagunitas",
          "queued_at": 1702290000000
        },
        "metadata": {
          "failure_reason": "Perplexity API timeout"
        }
      }
    ]
  }
}
```

**POST /admin/dlq/replay**

Request:

```json
{
  "lease_ids": ["lease_xyz789", "lease_abc456"],
  "delay_seconds": 60
}
```

Response:

```json
{
  "success": true,
  "requestId": "uuid",
  "data": {
    "replayed_count": 2,
    "acknowledged_count": 2,
    "queued_to": "beer-enrichment"
  }
}
```

**POST /admin/dlq/acknowledge**

Request:

```json
{
  "lease_ids": ["lease_xyz789"]
}
```

Response:

```json
{
  "success": true,
  "requestId": "uuid",
  "data": {
    "acknowledged_count": 1
  }
}
```

**GET /admin/dlq/stats**

Response:

```json
{
  "success": true,
  "requestId": "uuid",
  "data": {
    "backlog_count": 15,
    "oldest_message_age_hours": 47.5,
    "failure_reasons": {
      "Perplexity API timeout": 8,
      "Rate limited": 4,
      "Parse error": 3
    }
  }
}
```

### Option B: Worker Consumer with Storage

Alternative approach where a Worker consumer processes DLQ messages and stores them in D1 for inspection.

#### Additional Schema

```sql
CREATE TABLE IF NOT EXISTS dlq_failures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id TEXT NOT NULL,
    beer_id TEXT NOT NULL,
    beer_name TEXT,
    brewer TEXT,
    failure_reason TEXT,
    attempts INTEGER DEFAULT 3,
    failed_at INTEGER NOT NULL,
    acknowledged_at INTEGER,
    replayed_at INTEGER,
    raw_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_dlq_beer_id ON dlq_failures(beer_id);
CREATE INDEX IF NOT EXISTS idx_dlq_failed_at ON dlq_failures(failed_at);
CREATE INDEX IF NOT EXISTS idx_dlq_acknowledged ON dlq_failures(acknowledged_at);
```

**Pros**: Persistent storage, queryable history, no visibility timeout concerns
**Cons**: Adds complexity, requires consumer worker, storage costs

## Security Requirements

### Authentication Layers

1. **API Key (existing)**: Required for all `/admin/*` routes (same as existing endpoints)

2. **Admin Secret (new)**: Additional secret for admin-only operations

   ```bash
   wrangler secret put ADMIN_SECRET
   ```

3. **IP Allowlist (optional)**: Restrict admin endpoints to specific IPs
   ```typescript
   const ADMIN_ALLOWED_IPS = ['1.2.3.4', '5.6.7.8'];
   ```

### Authorization Checks

```typescript
async function authorizeAdmin(
  request: Request,
  env: Env,
  reqCtx: RequestContext
): Promise<{ authorized: boolean; error?: string }> {
  // 1. Existing API key check (already done in main handler)

  // 2. Admin secret check
  const adminSecret = request.headers.get('X-Admin-Secret');
  if (!adminSecret || !(await timingSafeCompare(adminSecret, env.ADMIN_SECRET))) {
    return { authorized: false, error: 'Invalid admin credentials' };
  }

  // 3. Optional: IP allowlist
  const clientIp = request.headers.get('CF-Connecting-IP');
  if (ADMIN_ALLOWED_IPS.length > 0 && !ADMIN_ALLOWED_IPS.includes(clientIp || '')) {
    return { authorized: false, error: 'IP not authorized for admin access' };
  }

  return { authorized: true };
}
```

### Audit Logging

All admin operations must be logged with:

- Admin secret hash (not the actual secret)
- Operation type
- Affected message IDs
- Result (success/failure)

```typescript
await writeAdminAuditLog(db, {
  requestId: reqCtx.requestId,
  operation: 'dlq_replay',
  messageIds: lease_ids,
  result: 'success',
  adminKeyHash: await hashApiKey(adminSecret),
});
```

## Implementation Steps

### Phase 1: Infrastructure Setup

1. **Enable HTTP Pull Consumer for DLQ**

   ```bash
   wrangler queues consumer http add beer-enrichment-dlq
   ```

2. **Create API Token for Queue Access**
   - Permissions: `queues_read`, `queues_write`
   - Scope: Account-level or specific queue
   - Store as secret: `wrangler secret put CF_QUEUES_API_TOKEN`

3. **Set Admin Secret**

   ```bash
   wrangler secret put ADMIN_SECRET
   # Generate: openssl rand -hex 32
   ```

4. **Update Env Interface**
   ```typescript
   export interface Env {
     // ... existing ...
     ADMIN_SECRET: string;
     CF_QUEUES_API_TOKEN: string;
     CF_ACCOUNT_ID: string;
     DLQ_QUEUE_ID: string; // Queue ID for beer-enrichment-dlq
   }
   ```

### Phase 2: Core Implementation

1. **Create Admin Route Handler** (`/admin/*`)
   - Route prefix check
   - Admin authentication
   - Dispatch to sub-handlers

2. **Implement DLQ List Handler**

   ```typescript
   async function handleDlqList(
     env: Env,
     headers: Record<string, string>,
     reqCtx: RequestContext,
     params: { limit?: number; visibility_timeout_ms?: number }
   ): Promise<Response>;
   ```

3. **Implement DLQ Replay Handler**
   - Pull messages from DLQ (with visibility timeout)
   - Re-queue to main queue
   - Acknowledge from DLQ

4. **Implement DLQ Acknowledge Handler**
   - Acknowledge messages (permanent deletion)

5. **Implement DLQ Stats Handler**
   - Aggregate message data
   - Calculate failure reasons

### Phase 3: Testing

1. **Manual Testing**

   ```bash
   # List DLQ messages
   curl -H "X-API-Key: $API_KEY" -H "X-Admin-Secret: $ADMIN_SECRET" \
     "https://ufobeer.app/admin/dlq?limit=5"

   # Replay specific messages
   curl -X POST \
     -H "X-API-Key: $API_KEY" \
     -H "X-Admin-Secret: $ADMIN_SECRET" \
     -H "Content-Type: application/json" \
     -d '{"lease_ids": ["lease_xyz789"]}' \
     "https://ufobeer.app/admin/dlq/replay"
   ```

2. **Integration Testing**
   - Create test message that will fail enrichment
   - Wait for DLQ routing (after 3 retries)
   - Verify message appears in `/admin/dlq`
   - Test replay and acknowledge operations

### Phase 4: Documentation & Monitoring

1. **Add to Operations Documentation**
   - DLQ inspection procedures
   - Common failure reasons and remediation
   - Replay best practices

2. **Add Analytics Events**
   - Track DLQ message counts
   - Track replay success/failure rates
   - Alert on DLQ growth

## Limitations and Considerations

### Cloudflare Queues Limitations

1. **No Persistent History**: Once acknowledged, messages are gone. Consider Option B (D1 storage) if you need historical analysis.

2. **Visibility Timeout**: When pulling messages, they become invisible to other consumers for the timeout period. If not acknowledged, they return to the queue.

3. **4-Day TTL**: Messages in DLQ without consumers expire after 4 days. Critical failures may be lost if not addressed promptly.

4. **No Message Filtering**: Cannot query messages by content (e.g., "show all messages for beer ID X"). Must pull and filter client-side.

5. **API Token Requirements**: The Worker needs elevated permissions (queue read/write) to access the REST API. This token must be stored securely.

### Operational Considerations

1. **Replay Rate Limiting**: Replaying too many messages at once could overwhelm Perplexity API. Consider adding delays.

2. **Circular Failures**: Messages that always fail will cycle between main queue and DLQ if replayed without fixing the root cause.

3. **Monitoring**: Set up alerts for DLQ message count growth.

### Alternative: Hybrid Approach

Combine both options:

1. Worker consumer writes all DLQ messages to D1 (for history)
2. Admin endpoints query D1 for historical data
3. Replay creates new messages to main queue (rather than moving)

This provides the best of both worlds but adds complexity.

## Recommended Implementation Priority

1. **Immediate (Quick Win)**: Use Cloudflare Dashboard for ad-hoc DLQ inspection
   - No code changes required
   - Good for initial troubleshooting

2. **Short Term**: Implement `/admin/dlq` with REST API proxy (Option A)
   - Enables programmatic access
   - Supports automation and tooling

3. **Future Enhancement**: Add D1 storage for failure history (Option B hybrid)
   - Only if historical analysis becomes important
   - Consider cost/complexity tradeoffs

## Source References

- [Cloudflare Queues Dead Letter Queues](https://developers.cloudflare.com/queues/configuration/dead-letter-queues/)
- [Cloudflare Queues Pull Consumers](https://developers.cloudflare.com/queues/configuration/pull-consumers/)
- [Debug Queues from Dashboard](https://blog.cloudflare.com/debug-queues-from-dash/)
- [Cloudflare Queues REST API - Messages](https://developers.cloudflare.com/api/resources/queues/subresources/messages/)
- [Wrangler Queues Commands](https://developers.cloudflare.com/queues/reference/wrangler-commands/)
- [Pull Consumer Rate Limits (April 2025)](https://developers.cloudflare.com/changelog/2025-04-17-pull-consumer-limits/)
