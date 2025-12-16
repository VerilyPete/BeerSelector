# Force Re-Enrichment: Database Schema

## No New Tables Required

The existing `audit_log` table and `writeAdminAuditLog()` function can be reused.

The existing `writeAdminAuditLog()` already tracks:

- `request_id`, `timestamp`, `client_ip`, `user_agent`
- `method` = 'ADMIN'
- `path` = operation name (e.g., 'enrich_trigger')
- `api_key_hash` = admin secret hash

**Limitation**: The `details` parameter is passed but not stored. For force re-enrichment, we may want to log the beer IDs that were cleared.

**Option 1 (Simple)**: Just use existing audit logging as-is - operation is tracked, details available in console logs.

**Option 2 (Enhanced)**: Add a `details_json` column to `audit_log`:

```sql
-- Optional: Add details column for richer audit data
ALTER TABLE audit_log ADD COLUMN details_json TEXT;
```

Then update `writeAdminAuditLog()` to store the details:

```typescript
async function writeAdminAuditLog(
  db: D1Database,
  ctx: RequestContext,
  operation: string,
  details: Record<string, unknown>,
  adminSecretHash: string
): Promise<void> {
  try {
    await db
      .prepare(
        `
      INSERT INTO audit_log (request_id, timestamp, method, path, api_key_hash, client_ip, user_agent, status_code, response_time_ms, error, details_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .bind(
        ctx.requestId,
        ctx.startTime,
        'ADMIN',
        operation,
        adminSecretHash,
        ctx.clientIp,
        ctx.userAgent,
        200,
        Date.now() - ctx.startTime,
        null,
        JSON.stringify(details) // Store details as JSON
      )
      .run();
    // ... cleanup logic
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
}
```

## Recommendation

Start with **Option 1** (no schema changes). The console logs already capture the beer IDs. If more detailed audit trail is needed later, add the `details_json` column.

## Usage Pattern

Force re-enrichment will use the same pattern as other admin operations:

```typescript
ctx.waitUntil(
  writeAdminAuditLog(
    env.DB,
    requestContext,
    'enrich_force',
    {
      queued_count: clearResult.clearedCount,
      skipped_count: clearResult.skippedCount,
      cleared_beer_ids: clearResult.clearedIds,
      dry_run: dryRun,
    },
    adminSecretHash
  )
);
```
