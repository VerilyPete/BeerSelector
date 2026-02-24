# ABV Description Parsing Bug & Fix Plan

## Problem Summary

The in-app `extractABV()` function naively regex-matches the **first** `number%` pattern in a beer's HTML description. This produces incorrect ABV values when descriptions contain non-ABV percentages.

**Example:** A description like _"Brewed with 100% Mosaic hops, this 6.5% IPA..."_ returns `100` instead of `6.5`.

The parsed value is then persisted to the database and used for glass type selection — so a session IPA ends up with a tulip glass (the >= 8% ABV icon) instead of a pint.

---

## Root Cause Analysis

### The Regex (beerGlassType.ts:37)

```typescript
const percentageMatch = plainText.match(/(?<!-)\b(\d+(?:\.\d+)?)\s*%/);
```

This matches the **first** occurrence of `<number>%` in the text. It has no semantic awareness — it cannot distinguish between:
- `6.5%` (actual ABV)
- `100%` (hop variety percentage)
- `50/50` blend ratios that happen to include `%`

### The Range Check (beerGlassType.ts:40)

```typescript
if (!isNaN(abv) && abv >= 0 && abv <= 100) {
  return abv;
}
```

The upper bound of `100` is far too generous. The strongest beer ever made (Snake Venom) is 67.5% ABV. Most commercial beers top out around 15-20%. A 100% ABV value should never be accepted.

### Real-World False Positive Patterns

| Description Pattern | Extracted ABV | Actual ABV |
|---|---|---|
| "Brewed with 100% Mosaic hops" | 100 | Unknown |
| "100% Sierra Nevada estate hops" | 100 | Unknown |
| "50% wheat, 50% barley malt" | 50 | Unknown |
| "Aged in 100% new oak barrels" | 100 | Unknown |
| "Made with 30% rye malt, 5.4% ABV" | 30 | 5.4 |

---

## How Bad ABV Gets Persisted

The problem isn't just a display glitch — the bad value gets written to the database through multiple code paths:

### Path 1: Data Sync (Primary)

```
glassTypeCalculator.ts:26
  const abv = beer.abv ?? extractABV(beer.brew_description);
```

`calculateContainerTypes()` is called during every data sync in `dataUpdateService.ts`. If the beer doesn't already have a Worker-enriched ABV (`beer.abv` is null), it falls back to the regex parser. The result is spread into the beer object and inserted into the `allbeers` table, including the `abv` column.

**Affected files:**
- `src/database/utils/glassTypeCalculator.ts` — lines 26 and 61
- `src/services/dataUpdateService.ts` — calls `calculateContainerTypes()` before insert

### Path 2: V6 Migration (One-Time Backfill)

```
migrateToV6.ts:78
  abv: extractABV(beer.brew_description ?? undefined),
```

When users upgraded to schema v6, the migration backfilled ABV for all existing beers using `extractABV()`. Any beers with misleading descriptions had bad values written at migration time.

### Path 3: COALESCE Prevents Worker Corrections

```sql
-- BeerRepository.ts:343
UPDATE allbeers SET
  abv = COALESCE(?, abv),
  ...
WHERE id = ?
```

When the Worker enrichment service returns data, `updateEnrichmentData()` uses `COALESCE(?, abv)`. This means:
- If the Worker sends a non-null ABV → it overwrites (good)
- If the Worker sends null (beer not yet enriched) → the existing bad value is preserved (bad)
- If the Worker hasn't processed that beer yet → the regex-extracted value persists indefinitely

### Path 4: In-Memory Merge (enrichmentService.ts:1130)

```typescript
abv: enrichment.enriched_abv ?? beer.abv,
```

Even in the in-memory merge path (`mergeEnrichmentIntoBeers`), a null Worker ABV falls back to whatever's already on the beer object — which may be a bad regex-extracted value.

### The Cascade

```
Description contains "100% hops"
  → extractABV() returns 100
    → Written to DB as abv = 100
      → COALESCE(null, 100) preserves it
        → Container type = tulip (>= 8%)
          → User sees wrong glass icon
```

---

## Three Sources of ABV (No Clear Hierarchy)

| Source | Quality | Availability | Persistence |
|---|---|---|---|
| Worker enrichment (Untappd/Perplexity) | High | Partial — not all beers enriched | Written to DB via `updateEnrichmentData` |
| Description regex (`extractABV`) | Low — no semantic awareness | Always available if description has `%` | Written to DB via `calculateContainerTypes` |
| Existing DB value | Unknown — could be from either source | Always (after first write) | Protected by COALESCE |

The fundamental issue: there's no way to distinguish a Worker-sourced ABV from a regex-sourced ABV once it's in the database. COALESCE protects both equally.

---

## Proposed Fix

### Option A: Improve the Regex (Minimal Fix)

1. **Lower the upper bound** from 100 to a realistic max (e.g., 30% ABV):
   ```typescript
   if (!isNaN(abv) && abv >= 0 && abv <= 30) {
   ```

2. **Prefer ABV-keyword patterns over bare percentages** — check Pattern 2 (`"5.2 ABV"`, `"ABV: 5.2"`) before Pattern 1 (`"5.2%"`), since ABV-keyword matches are almost always correct.

3. **Skip common false-positive patterns** — if the text around the `%` match contains words like "hops", "malt", "wheat", "barley", "oak", skip that match and look for the next one.

**Pros:** Small change, easy to test, no architecture changes.
**Cons:** Whack-a-mole — new false positives will keep appearing. Still persists low-confidence values.

### Option B: Stop Persisting Regex ABV (Recommended)

1. **Only write ABV to the database from Worker enrichment** — remove the `extractABV` fallback from `calculateContainerTypes()` and the v6 migration backfill path (already ran, so this is just cleanup).

2. **Use `extractABV` only at display time** for container type calculation, never persisting it:
   ```typescript
   // glassTypeCalculator.ts
   // For DB writes: only use enriched ABV
   const abv = beer.abv; // No extractABV fallback

   // For display: can still use extractABV as transient fallback
   // in getContainerType() itself (already does this via line 147)
   ```

3. **Add `enrichment_source` tracking** to distinguish how ABV was obtained (already partially exists with `enrichment_source` column).

4. **Consider a one-time cleanup migration** to null out suspiciously high ABV values that lack Worker enrichment:
   ```sql
   UPDATE allbeers SET abv = NULL
   WHERE abv > 25
     AND (enrichment_source IS NULL OR enrichment_source = 'description');
   ```

**Pros:** Eliminates the bad-data-at-rest problem entirely. Worker data is authoritative. Regex only used transiently for display.
**Cons:** Slightly more work. Beers without Worker enrichment lose their persisted (potentially correct) regex ABV, falling back to live extraction at display time.

### Option C: Hybrid (Pragmatic)

Combine A and B:
1. Lower the upper bound to 30% (catches the worst false positives immediately)
2. Reorder patterns to prefer ABV-keyword matches
3. Separately, stop persisting regex-extracted ABV in new code paths
4. Let Worker enrichment gradually replace bad values over time

---

## Affected Files

| File | Role | Changes Needed |
|---|---|---|
| `src/utils/beerGlassType.ts` | `extractABV()` function | Fix regex, lower bound, reorder patterns |
| `src/database/utils/glassTypeCalculator.ts` | Calls `extractABV` for DB writes | Remove fallback (Option B) or keep with improved regex (Option A) |
| `src/database/repositories/BeerRepository.ts` | `updateEnrichmentData()` with COALESCE | No change needed (COALESCE is correct for Worker data) |
| `src/database/repositories/MyBeersRepository.ts` | Same COALESCE pattern | No change needed |
| `src/database/migrations/migrateToV6.ts` | Backfill used `extractABV` | Already ran; cleanup only |
| `src/services/enrichmentService.ts` | Worker data merge | No change needed |
| `src/utils/__tests__/beerGlassType.test.ts` | Tests for `extractABV` | Add false-positive test cases, update bounds |

---

## Test Cases to Add

```typescript
// False positives that should return null (or skip to find real ABV)
extractABV('Brewed with 100% Mosaic hops')        // → null (not 100)
extractABV('100% Sierra Nevada estate hops, 6.8%') // → 6.8 (not 100)
extractABV('50% wheat, 50% barley, 5.4% ABV')     // → 5.4 (not 50)
extractABV('Aged in 100% new oak barrels')         // → null (not 100)
extractABV('Made with 30% rye malt')               // → null (not 30)

// Upper bound enforcement
extractABV('This 45% spirit')                      // → null (too high for beer)
extractABV('ABV 67.5')                             // → null (even Snake Venom)

// Existing tests should still pass
extractABV('A delicious beer with 5.2% alcohol')   // → 5.2
extractABV('Strong beer at 8%')                    // → 8
extractABV('<p>Great IPA with 6.5% ABV</p>')       // → 6.5
```
