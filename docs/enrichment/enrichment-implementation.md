# Implementation Plan - Immediate Enrichment on Import

Refactoring the beer import process to automatically queue beers for Perplexity enrichment if ABV cannot be parsed from the description.

## Design Decisions

> [!NOTE]
> **Race Condition**: The consumer-side deduplication logic check (`SELECT abv FROM enriched_beers`) leaves a small window where concurrent requests could queue the same beer twice before the first one is processed. Given the safeguards (rate limiting, `max_concurrency: 1`, quota limits) and low probability of concurrent _new_ beer discovery, this is considered an acceptable trade-off.

> [!NOTE]
> **ABV Trust Model**: Description-parsed ABV (0.9 confidence) is trusted. If we have any ABV (`abv IS NOT NULL`), we skip Perplexity enrichment - no need to verify description-parsed values.

---

## Proposed Changes

### Database Layer

#### [MODIFY] `src/db/helpers.ts`

- **No changes needed** - `insertPlaceholders` already returns `InsertPlaceholdersResult` type (defined lines 10-18).
- The function already collects and returns beers that need enrichment (where ABV parsing failed).

```typescript
// Type is already defined in helpers.ts (lines 10-18)
export interface InsertPlaceholdersResult {
  totalSynced: number;
  withAbv: number;
  needsEnrichment: Array<{ id: string; brew_name: string; brewer: string }>;
}
```

#### [MODIFY] `src/db/index.ts`

- **Add export only** - Export the existing `InsertPlaceholdersResult` type.

```typescript
export type { InsertPlaceholdersResult } from './helpers';
```

---

### Queue Layer

#### [NEW] `src/queue/helpers.ts`

- Create `queueBeersForEnrichment` helper.
- Filter blocklisted items using `shouldSkipEnrichment`.
- **Batch messages in chunks of 100** (Cloudflare Queues `sendBatch` limit).
- Per-chunk error handling - continue on failure, log errors.
- **Structured JSON logging** for observability.

```typescript
import type { Env, EnrichmentMessage } from '../types';
import { shouldSkipEnrichment } from '../config';

const BATCH_SIZE = 100; // Cloudflare Queues sendBatch limit

export async function queueBeersForEnrichment(
  env: Env,
  beers: Array<{ id: string; brew_name: string; brewer: string }>,
  requestId: string
): Promise<{ queued: number; skipped: number }> {
  const eligible = beers.filter(b => !shouldSkipEnrichment(b.brew_name));
  const skipped = beers.length - eligible.length;

  if (eligible.length === 0) {
    console.log(
      JSON.stringify({
        event: 'queue_enrichment_skip',
        requestId,
        reason: 'no_eligible_beers',
        skipped,
      })
    );
    return { queued: 0, skipped };
  }

  let queued = 0;
  for (let i = 0; i < eligible.length; i += BATCH_SIZE) {
    const chunk = eligible.slice(i, i + BATCH_SIZE);
    const messages = chunk.map(beer => ({
      body: {
        beerId: beer.id,
        beerName: beer.brew_name,
        brewer: beer.brewer,
      } as EnrichmentMessage,
    }));

    try {
      await env.ENRICHMENT_QUEUE.sendBatch(messages);
      queued += chunk.length;
    } catch (error) {
      console.error(
        JSON.stringify({
          event: 'queue_enrichment_error',
          requestId,
          batchIndex: Math.floor(i / BATCH_SIZE) + 1,
          batchSize: chunk.length,
          error: error instanceof Error ? error.message : String(error),
        })
      );
      // Continue with next batch - partial success acceptable
    }
  }

  console.log(
    JSON.stringify({
      event: 'queue_enrichment_complete',
      requestId,
      queued,
      skipped,
      totalBeers: beers.length,
    })
  );

  return { queued, skipped };
}
```

#### [MODIFY] `src/queue/index.ts`

- Export `queueBeersForEnrichment`.

```typescript
export { queueBeersForEnrichment } from './helpers';
```

#### [MODIFY] `src/queue/enrichment.ts`

- Add consumer-side deduplication check before Perplexity API call.
- Check `abv IS NOT NULL` - any ABV (description or Perplexity) is trusted.
- **Placement**: Insert after line 85 (extracting `beerId`, `beerName`, `brewer`) and before line 89 (delay logic).

```typescript
// After line 85: const { beerId, beerName, brewer } = message.body;
// Insert this deduplication check:

// Check if beer already has ABV (from description parsing or previous enrichment)
const existing = await env.DB.prepare('SELECT abv FROM enriched_beers WHERE id = ?')
  .bind(beerId)
  .first<{ abv: number | null }>();

if (existing !== null && existing.abv !== null) {
  console.log(`[enrichment] Skipping ${beerId}: already has ABV`);
  message.ack();
  continue;
}

// Then continue with existing code at line 86:
// const enrichmentStartTime = Date.now();
```

---

### Handler Layer

#### [MODIFY] `src/handlers/beers.ts`

- Import `queueBeersForEnrichment` from queue.
- Update `ctx.waitUntil` to chain enrichment queuing after `insertPlaceholders`.
- **Add `.catch()` error boundary** - log but don't fail response.

```typescript
import { queueBeersForEnrichment } from '../queue';

// In handleBeerList:
ctx.waitUntil(
  insertPlaceholders(env.DB, beersForPlaceholders, reqCtx.requestId)
    .then(result => {
      if (result.needsEnrichment.length > 0) {
        return queueBeersForEnrichment(env, result.needsEnrichment, reqCtx.requestId);
      }
      return { queued: 0, skipped: 0 };
    })
    .catch(err => {
      console.error(
        JSON.stringify({
          event: 'background_enrichment_error',
          requestId: reqCtx.requestId,
          error: err instanceof Error ? err.message : String(err),
        })
      );
    })
);
```

---

## Optional Enhancements (Low Priority)

### Cron Overlap Prevention

Consider checking queue depth before cron triggers more enrichment:

```typescript
// In scheduled handler, before queuing
const queueDepth = await getApproximateQueueDepth(env);
if (queueDepth > 100) {
  console.log('Queue backlog exists, skipping cron enrichment trigger');
  return;
}
```

### Producer-Side Deduplication

Optional pre-queue DB check to reduce duplicate messages:

```typescript
// In queueBeersForEnrichment, before sendBatch
const existingIds = await env.DB.prepare(
  `
  SELECT id FROM enriched_beers
  WHERE id IN (${eligible.map(() => '?').join(',')})
  AND abv IS NOT NULL
`
)
  .bind(...eligible.map(b => b.id))
  .all<{ id: string }>();

const existingSet = new Set(existingIds.results.map(r => r.id));
const toQueue = eligible.filter(b => !existingSet.has(b.id));
```

This adds latency but reduces duplicate queue messages. Not strictly necessary given consumer-side deduplication.

---

## Verification Plan

### Automated Tests

- Run `npx tsc --noEmit` to verify type safety.
- Run `npx wrangler deploy --dry-run` to verify build integrity.

### Manual Verification

1. **Mock Import**:
   - Trigger `/beers?sid=13879` endpoint via curl.
   - Check logs for `queue_enrichment_complete` event.
   - Verify `queued` count matches beers without parseable ABV.

2. **Queue Processing**:
   - Verify consumer logs show processing.
   - Verify deduplication: re-import same beers, check for "already has ABV" skip messages.

3. **Error Handling**:
   - Simulate queue failure (e.g., disconnect queue binding temporarily).
   - Verify `background_enrichment_error` is logged but response still succeeds.

---

## Files Summary

| File                      | Change                                                | Priority |
| ------------------------- | ----------------------------------------------------- | -------- |
| `src/db/helpers.ts`       | No changes - already returns InsertPlaceholdersResult | N/A      |
| `src/db/index.ts`         | Export InsertPlaceholdersResult type                  | High     |
| `src/queue/helpers.ts`    | NEW - queueBeersForEnrichment with batching           | High     |
| `src/queue/index.ts`      | Export queueBeersForEnrichment                        | High     |
| `src/queue/enrichment.ts` | Add consumer-side deduplication after line 85         | High     |
| `src/handlers/beers.ts`   | Chain queuing in ctx.waitUntil with .catch()          | High     |
