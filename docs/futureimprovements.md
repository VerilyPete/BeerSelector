# Future Improvements

This document tracks potential enhancements that have been considered but deferred for future implementation.

---

## Enrichment Service

### Polling Error Boundary Strategy

**Priority**: Low
**Added**: 2025-12-28
**Context**: When `pollForEnrichmentUpdates()` fails completely, it currently logs a warning and continues silently.

**Current behavior**: Silent failure - user sees enrichment data on next manual refresh.

**Potential enhancement**:

- Track failed poll IDs and retry when app comes back to foreground
- Or show a subtle "pending enrichment" indicator in the UI

**Why deferred**: The fire-and-forget pattern means users aren't blocked. They can always pull-to-refresh to get updated data. The current behavior is acceptable.

---

### Cancel Polling on App Background

**Priority**: Low
**Added**: 2025-12-28
**Context**: `pollForEnrichmentUpdates()` continues polling even if the app is backgrounded.

**Current behavior**: Polling runs for up to 2 minutes with ~6 requests max, regardless of app state.

**Potential enhancement**:

- Use React Native's `AppState` listener to detect when app goes to background
- Abort polling via AbortController when backgrounded
- Optionally resume or restart polling when app returns to foreground

**Why deferred**: The polling timeout (2 min max) naturally limits impact. Low priority given the short duration and minimal network usage.

---

### Real-time UI Updates During Polling

**Priority**: Medium
**Added**: 2025-12-28
**Context**: After `pollForEnrichmentUpdates()` receives enrichment data, results are logged but not used to update the UI immediately.

**Current behavior**: Users must pull-to-refresh again to see enriched data (ABV, cleaned descriptions) after polling completes.

**Potential enhancement**:

- Pass a callback to `syncMissingBeersInBackground()` to persist enrichment results immediately
- Update individual beer cards in the UI as enrichment data arrives (no full list refresh needed)
- Requires state management changes to support partial updates

**Why deferred**: The fire-and-forget pattern keeps the implementation simple. Users can pull-to-refresh to see updated data. Adding real-time updates requires significant state management changes.

---

### Auto-Refresh UI After Background Enrichment

**Priority**: Low
**Added**: 2025-12-28
**Context**: When non-blocking enrichment completes in background (see `/docs/enrichment/nonblockenrich.md`), the UI doesn't automatically update.

**Current behavior**: User sees unenriched data until they navigate away and back, or pull to refresh.

**Potential enhancement**:

- **Option A (EventEmitter)**: Emit `enrichment-complete` event, components listen and re-read from database
- **Option B (AppContext callback)**: Pass `refreshBeerData` to init, call when enrichment completes

**Implementation sketch (Option A):**

```typescript
// In db.ts
import { EventEmitter } from 'events';
export const dbEvents = new EventEmitter();

// After enrichment completes
dbEvents.emit('enrichment-complete', { source: 'allbeers', count: enrichedCount });

// In component
useEffect(() => {
  const handler = () => refetch();
  dbEvents.on('enrichment-complete', handler);
  return () => dbEvents.off('enrichment-complete', handler);
}, []);
```

**Why deferred**: Enrichment typically completes within 1-2 seconds. Users scrolling or navigating will naturally see enriched data. Implement if user testing shows confusion.

---

## Testing

### Test File Organization

**Priority**: Low
**Added**: 2025-12-28
**Context**: `enrichmentService.test.ts` has grown to 1527 lines after adding tests for `syncBeersToWorker`, `fetchEnrichmentBatchWithMissing`, and `pollForEnrichmentUpdates`.

**Current behavior**: All enrichment service tests in a single file.

**Potential enhancement**:

- Extract sync-related tests into `enrichmentService.sync.test.ts`
- Extract polling tests into `enrichmentService.polling.test.ts`
- Keep core enrichment tests in the original file

**Why deferred**: Tests are well-organized with clear describe blocks. File size doesn't affect test execution. Can be split when further tests are added.

---

### Integration Tests for Enrichment Flow

**Priority**: Medium
**Added**: 2025-12-28
**Context**: Unit tests exist for individual functions, but no integration tests for the full enrichment flow.

**Current behavior**: Each function tested in isolation with mocks.

**Potential enhancement**:

- Add integration tests for: batch request → missing IDs → sync → cleanup queued → poll → enriched data returned
- Test `last_seen_at` updates on sync
- Test full flow with mocked Worker responses

**Why deferred**: Unit tests provide good coverage of individual functions. Integration testing requires more complex test setup with coordinated mocks.

---

## Worker (Cloudflare)

### Audit Logging for Sync Endpoint

**Priority**: Low
**Added**: 2025-12-28
**Context**: The batch endpoint enhancement plan mentioned audit logging for sync operations, but it was not implemented.

**Current behavior**: Sync endpoint logs to console but doesn't write audit records to D1.

**Potential enhancement**:

```typescript
ctx.waitUntil(
  writeAuditLog(env.DB, requestContext, 'POST', '/beers/sync', 200, null, {
    beers_synced: result.synced,
    beers_queued: result.queued_for_cleanup,
  })
);
```

**Why deferred**: Sync operations are already logged to console. Audit logging adds D1 write overhead. Can be added when compliance/debugging needs arise.

---
