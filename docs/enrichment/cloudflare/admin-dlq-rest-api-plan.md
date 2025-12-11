# Admin DLQ REST API Fix Plan

## Problem

The current `/admin/dlq` implementation attempts to use HTTP pull consumer bindings directly from Worker code. This does not work because HTTP pull consumers are accessed via the Cloudflare REST API, not through Worker bindings.

## Solution

Use the Cloudflare REST API directly from the Worker to pull, acknowledge, and manage DLQ messages.

---

## 1. Required API Token Permissions

Create an API token with these permissions:

- `Account.Queues:Read` (`com.cloudflare.api.account.queues_read`)
- `Account.Queues:Write` (`com.cloudflare.api.account.queues_write`)

Both read AND write are required because acknowledging messages requires write access.

**Token Creation Steps:**

1. Go to Cloudflare Dashboard > My Profile > API Tokens
2. Create Token > Custom Token
3. Permissions: Account > Queues > Edit (includes both read and write)
4. Account Resources: Include your specific account
5. Copy the token immediately (shown only once)

---

## 2. Required Secrets

Add these secrets via Wrangler:

```bash
# Your Cloudflare Account ID (visible in dashboard URL or Workers overview)
wrangler secret put CF_ACCOUNT_ID
# Enter: your-account-id (e.g., a1b2c3d4e5f6...)

# The API token with Queues read/write permissions
wrangler secret put CF_QUEUES_API_TOKEN
# Enter: the token created above

# The Queue ID for the DLQ (NOT the queue name)
# Get this by running: wrangler queues list
wrangler secret put DLQ_QUEUE_ID
# Enter: queue ID like a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

**Getting the Queue ID:**

```bash
wrangler queues list
# Output shows queue_id for each queue - use the ID for beer-enrichment-dlq
```

---

## 3. REST API Endpoints

Base URL: `https://api.cloudflare.com/client/v4`

### Pull Messages

```
POST /accounts/{account_id}/queues/{queue_id}/messages/pull
Authorization: Bearer {CF_QUEUES_API_TOKEN}
Content-Type: application/json

{
  "batch_size": 10,           // max: 100, default: 5
  "visibility_timeout_ms": 30000  // max: 12 hours, default: 30s
}
```

**Response:**

```json
{
  "success": true,
  "result": {
    "message_backlog_count": 15,
    "messages": [
      {
        "id": "msg_abc123",
        "lease_id": "lease_xyz789",
        "timestamp_ms": 1702300000000,
        "attempts": 3,
        "body": "base64-encoded-json-string",
        "metadata": {}
      }
    ]
  }
}
```

**Note:** Message bodies with `json` content type are base64-encoded (RFC 4648). Decode before parsing.

### Acknowledge Messages

```
POST /accounts/{account_id}/queues/{queue_id}/messages/ack
Authorization: Bearer {CF_QUEUES_API_TOKEN}
Content-Type: application/json

{
  "acks": [
    { "lease_id": "lease_xyz789" }
  ],
  "retries": [
    { "lease_id": "lease_abc456", "delay_seconds": 60 }
  ]
}
```

**Response:**

```json
{
  "success": true,
  "result": {
    "ackCount": 1,
    "retryCount": 1,
    "warnings": []
  }
}
```

---

## 4. Code Changes to index.ts

### 4.1 Update Env Interface

```typescript
export interface Env {
  // ... existing ...

  // DLQ REST API access
  CF_ACCOUNT_ID: string;
  CF_QUEUES_API_TOKEN: string;
  DLQ_QUEUE_ID: string;

  // Admin authentication
  ADMIN_SECRET: string;

  // Main queue binding (for replay - send messages back to main queue)
  ENRICHMENT_QUEUE: Queue<EnrichmentMessage>;
}
```

### 4.2 Add DLQ API Helper Functions

```typescript
interface DlqMessage {
  id: string;
  lease_id: string;
  timestamp_ms: number;
  attempts: number;
  body: string; // base64 encoded
  metadata: Record<string, unknown>;
}

interface DlqPullResponse {
  success: boolean;
  result: {
    message_backlog_count: number;
    messages: DlqMessage[];
  };
  errors?: Array<{ message: string }>;
}

async function pullDlqMessages(
  env: Env,
  batchSize: number = 10,
  visibilityTimeoutMs: number = 30000
): Promise<DlqPullResponse> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/queues/${env.DLQ_QUEUE_ID}/messages/pull`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.CF_QUEUES_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      batch_size: batchSize,
      visibility_timeout_ms: visibilityTimeoutMs,
    }),
  });

  return response.json() as Promise<DlqPullResponse>;
}

async function acknowledgeDlqMessages(
  env: Env,
  acks: string[], // lease_ids to acknowledge (delete)
  retries?: Array<{ lease_id: string; delay_seconds?: number }>
): Promise<{ ackCount: number; retryCount: number }> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/queues/${env.DLQ_QUEUE_ID}/messages/ack`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.CF_QUEUES_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      acks: acks.map(lease_id => ({ lease_id })),
      retries: retries || [],
    }),
  });

  const data = (await response.json()) as { result: { ackCount: number; retryCount: number } };
  return data.result;
}

function decodeMessageBody(base64Body: string): unknown {
  const decoded = atob(base64Body);
  return JSON.parse(decoded);
}
```

### 4.3 Implement Admin Route Handlers

```typescript
// GET /admin/dlq - List DLQ messages
async function handleDlqList(
  env: Env,
  headers: Record<string, string>,
  reqCtx: RequestContext,
  params: URLSearchParams
): Promise<Response> {
  const limit = Math.min(parseInt(params.get('limit') || '10'), 100);
  const visibilityMs = parseInt(params.get('visibility_timeout_ms') || '30000');

  const result = await pullDlqMessages(env, limit, visibilityMs);

  if (!result.success) {
    return Response.json(
      {
        success: false,
        error: result.errors?.[0]?.message || 'Failed to pull messages',
        requestId: reqCtx.requestId,
      },
      { status: 502, headers }
    );
  }

  // Decode message bodies
  const messages = result.result.messages.map(msg => ({
    id: msg.id,
    lease_id: msg.lease_id,
    timestamp_ms: msg.timestamp_ms,
    attempts: msg.attempts,
    body: decodeMessageBody(msg.body),
    metadata: msg.metadata,
  }));

  return Response.json(
    {
      success: true,
      requestId: reqCtx.requestId,
      data: {
        backlog_count: result.result.message_backlog_count,
        messages,
      },
    },
    { headers }
  );
}

// POST /admin/dlq/replay - Replay messages to main queue
async function handleDlqReplay(
  request: Request,
  env: Env,
  headers: Record<string, string>,
  reqCtx: RequestContext
): Promise<Response> {
  const body = (await request.json()) as { lease_ids: string[]; delay_seconds?: number };
  const { lease_ids, delay_seconds = 0 } = body;

  if (!Array.isArray(lease_ids) || lease_ids.length === 0) {
    return Response.json(
      {
        success: false,
        error: 'lease_ids array required',
        requestId: reqCtx.requestId,
      },
      { status: 400, headers }
    );
  }

  // First, pull the actual messages to get their content
  // (We need the message bodies to re-queue them)
  const pullResult = await pullDlqMessages(env, lease_ids.length, 60000);

  if (!pullResult.success) {
    return Response.json(
      {
        success: false,
        error: 'Failed to pull messages for replay',
        requestId: reqCtx.requestId,
      },
      { status: 502, headers }
    );
  }

  // Filter to only messages with matching lease_ids
  const messagesToReplay = pullResult.result.messages.filter(msg =>
    lease_ids.includes(msg.lease_id)
  );

  // Re-queue to main enrichment queue
  let replayedCount = 0;
  for (const msg of messagesToReplay) {
    try {
      const messageBody = decodeMessageBody(msg.body) as EnrichmentMessage;
      await env.ENRICHMENT_QUEUE.send(messageBody, {
        delaySeconds: delay_seconds,
      });
      replayedCount++;
    } catch (e) {
      log(
        'error',
        'Failed to replay message',
        { lease_id: msg.lease_id, error: String(e) },
        reqCtx.requestId
      );
    }
  }

  // Acknowledge the replayed messages from DLQ
  const ackResult = await acknowledgeDlqMessages(
    env,
    messagesToReplay.map(m => m.lease_id)
  );

  return Response.json(
    {
      success: true,
      requestId: reqCtx.requestId,
      data: {
        replayed_count: replayedCount,
        acknowledged_count: ackResult.ackCount,
        queued_to: 'beer-enrichment',
      },
    },
    { headers }
  );
}

// POST /admin/dlq/acknowledge - Delete messages from DLQ
async function handleDlqAcknowledge(
  request: Request,
  env: Env,
  headers: Record<string, string>,
  reqCtx: RequestContext
): Promise<Response> {
  const body = (await request.json()) as { lease_ids: string[] };
  const { lease_ids } = body;

  if (!Array.isArray(lease_ids) || lease_ids.length === 0) {
    return Response.json(
      {
        success: false,
        error: 'lease_ids array required',
        requestId: reqCtx.requestId,
      },
      { status: 400, headers }
    );
  }

  const result = await acknowledgeDlqMessages(env, lease_ids);

  return Response.json(
    {
      success: true,
      requestId: reqCtx.requestId,
      data: {
        acknowledged_count: result.ackCount,
      },
    },
    { headers }
  );
}
```

### 4.4 Add Admin Authentication Check

```typescript
async function authorizeAdmin(
  request: Request,
  env: Env
): Promise<{ authorized: boolean; error?: string }> {
  const adminSecret = request.headers.get('X-Admin-Secret');

  if (!adminSecret) {
    return { authorized: false, error: 'Missing X-Admin-Secret header' };
  }

  if (!(await timingSafeCompare(adminSecret, env.ADMIN_SECRET))) {
    return { authorized: false, error: 'Invalid admin credentials' };
  }

  return { authorized: true };
}
```

### 4.5 Add Routes to Main Fetch Handler

```typescript
// In the fetch handler, after API key authentication:

// Admin routes (require additional admin secret)
if (url.pathname.startsWith('/admin/')) {
  const adminAuth = await authorizeAdmin(request, env);
  if (!adminAuth.authorized) {
    return respond({ error: adminAuth.error }, 403, corsHeaders || {}, adminAuth.error);
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

## 5. Wrangler Configuration

### Keep HTTP Pull Consumer Config

The HTTP pull consumer configuration in wrangler.jsonc should be **kept** (or added if missing). It enables HTTP pull access for the queue:

```jsonc
// In wrangler.jsonc - add if not present
{
  "queues": {
    "consumers": [
      {
        "queue": "beer-enrichment-dlq",
        "type": "http_pull",
      },
    ],
  },
}
```

Or via CLI:

```bash
wrangler queues consumer http add beer-enrichment-dlq
```

This enables the REST API pull endpoints for the queue. Without this, the REST API pull will fail.

### Keep Producer Binding for Main Queue

The producer binding to the main queue is still needed for replay functionality:

```jsonc
{
  "queues": {
    "producers": [
      {
        "binding": "ENRICHMENT_QUEUE",
        "queue": "beer-enrichment",
      },
    ],
  },
}
```

---

## 6. Rate Limits

As of April 2025, pull consumers support up to **5,000 messages/second per queue**. This is sufficient for admin operations.

Pull operations are billed at $0.40/million operations.

---

## 7. Testing Commands

```bash
# Set admin secret first
wrangler secret put ADMIN_SECRET
# Enter: a secure random string (openssl rand -hex 32)

# List DLQ messages
curl -H "X-API-Key: $API_KEY" -H "X-Admin-Secret: $ADMIN_SECRET" \
  "https://your-worker.workers.dev/admin/dlq?limit=5"

# Replay specific messages
curl -X POST \
  -H "X-API-Key: $API_KEY" \
  -H "X-Admin-Secret: $ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"lease_ids": ["lease_xyz789"], "delay_seconds": 60}' \
  "https://your-worker.workers.dev/admin/dlq/replay"

# Acknowledge (delete) messages
curl -X POST \
  -H "X-API-Key: $API_KEY" \
  -H "X-Admin-Secret: $ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"lease_ids": ["lease_xyz789"]}' \
  "https://your-worker.workers.dev/admin/dlq/acknowledge"
```

---

## 8. Implementation Checklist

- [ ] Create API token with Queues read/write permissions
- [ ] Add secrets: `CF_ACCOUNT_ID`, `CF_QUEUES_API_TOKEN`, `DLQ_QUEUE_ID`, `ADMIN_SECRET`
- [ ] Enable HTTP pull consumer for DLQ: `wrangler queues consumer http add beer-enrichment-dlq`
- [ ] Update `Env` interface with new secrets
- [ ] Implement `pullDlqMessages()` helper
- [ ] Implement `acknowledgeDlqMessages()` helper
- [ ] Implement `decodeMessageBody()` helper
- [ ] Implement `authorizeAdmin()` check
- [ ] Implement `handleDlqList()` route handler
- [ ] Implement `handleDlqReplay()` route handler
- [ ] Implement `handleDlqAcknowledge()` route handler
- [ ] Add admin routes to main fetch handler
- [ ] Deploy and test

---

## References

- [Cloudflare Queues Pull Consumers](https://developers.cloudflare.com/queues/configuration/pull-consumers/)
- [Cloudflare Queues REST API - Messages](https://developers.cloudflare.com/api/resources/queues/subresources/messages/)
- [Pull Consumer Rate Limits (April 2025)](https://developers.cloudflare.com/changelog/2025-04-17-pull-consumer-limits/)
- [Queues List API](https://developers.cloudflare.com/api/resources/queues/methods/list/)
