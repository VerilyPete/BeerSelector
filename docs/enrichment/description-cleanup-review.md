# Review: Beer Description Cleanup Pipeline

## Overall Assessment

The plan is well-reasoned and addresses a real quality issue (messy descriptions) with a cost-effective solution (Workers AI Llama 3). The decision to place cleanup _before_ ABV extraction is correct.

However, there are a few critical integration points with the existing pipeline that need to be explicitly handled to avoid race conditions and wasted resources.

## Critical Issues & Gaps

### 1. Pipeline Coordination (Race Condition)

By default, `handleBeerList` calls `insertPlaceholders` -> `queueBeersForEnrichment`.
If we add the cleanup queue, we must ensure we don't **double queue** a beer for both "Description Cleanup" and "Perplexity Enrichment" simultaneously.

**Risk**:

1. Beer arrives with messy description (no ABV extracted).
2. `insertPlaceholders` recognizes no ABV.
3. We queue for cleanup.
4. We _also_ queue for Perplexity (because ABV is null).
5. Perplexity runs ($$$) while Cleanup runs ($).
6. Cleanup finishes, extracts ABV. Perplexity result comes in later and might overwrite or be wasted.

**Fix**:
Modify `handleBeerList` / `insertPlaceholders` logic:

- If a beer is queued for cleanup, **DO NOT** queue for Perplexity yet.
- The **Cleanup Consumer** becomes responsible for fallback:
  - After cleanup, run `extractABV`.
  - If match found: Update DB, done.
  - If NO match found: **NOW** queue for Perplexity enrichment.

### 2. Data Persistence in `insertPlaceholders`

Currently, `insertPlaceholders` (in `src/db/helpers.ts`) **does not store** the beer description. It only uses it to try to extract ABV on the fly, then discards the text updates (it only updates `last_seen_at` and `abv` if null).

**Fix**:
You must update `insertPlaceholders` to:

1. Save `brew_description` to the new `brew_description_original` column.
2. Compute and save `description_hash`.
3. Only trigger the "Needs Cleanup" signal if the hash has changed (or is new).

### 3. Responsibility Separation

The plan suggests `src/db/helpers.ts` will "trigger cleanup queue".
It is cleaner design to keep `src/db/helpers.ts` focused on DB operations.

- **Change**: Make `insertPlaceholders` return a specific list: `needsCleanup: Array<{...}>`.
- **Change**: Let `src/handlers/beers.ts` handle the actual `env.CLEANUP_QUEUE.sendBatch()` call, just like it handles `env.ENRICHMENT_QUEUE`.

## Minor Clarifications / Suggestions

### 4. Schema Updates

- Ensure `brew_description_cleaned` is nullable.
- When `insertPlaceholders` runs, if the hash changes, should we null out `brew_description_cleaned`? Yes, to invalidate old cleanups.

### 5. ABV Extraction Logic

- The `cleanDescriptionSafely` function proposes running `extractABV` on the cleaned text.
- Ensure we write the **newly extracted ABV** to the `enriched_beers.abv` column in the consumer.

### 6. Quota Table

- The plan defines `cleanup_limits`. Ensure this is actually checked in the consumer before calling the AI.
- If limit is hit, just fallback to original description and extract ABV from that (or keep existing).

## Revised Flow Recommendation

```mermaid
graph TD
    A[Request /beers] --> B[Fetch Flying Saucer]
    B --> C[insertPlaceholders]
    C --> D{Description Changed?}
    D -- Yes --> E[Update DB & Return needsCleanup]
    D -- No --> F[Check ABV Status]

    E --> G[Queue: description-cleanup]
    F -- Missing ABV & Not Queued for Cleanup --> H[Queue: beer-enrichment]

    subgraph "Cleanup Consumer"
    I[Receive Message] --> J[Call Llama 3]
    J --> K[Extract ABV from Cleaned]
    K --> L{ABV Found?}
    L -- Yes --> M[Update DB (ABV + Cleaned Desc)]
    L -- No --> N[Update DB (Cleaned Desc) & Queue: beer-enrichment]
    end
```
