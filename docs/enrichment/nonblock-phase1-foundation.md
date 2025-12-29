# Non-Blocking Enrichment: Phase 1 - Foundation

> [!NOTE]
> This is Phase 1 of the non-blocking enrichment implementation. It focuses on the data layer foundations: types, repository update methods, and configuration preferences.
> **Scope:** Data Layer and Locking Mechanism

## Overview

Phase 1 establishes the necessary types and database methods to support partial updates to beer records (ABV and metadata only) without triggering full record replacement.

## 1. Define EnrichmentUpdate Type

**File:** `src/types/enrichment.ts` (new file)

Repositories should not import from services (to avoid circular dependencies). Define this minimal type for enrichment updates.

```typescript
/**
 * Data structure for updating enrichment columns in beer tables.
 * Used by repository updateEnrichmentData() methods.
 */
export interface EnrichmentUpdate {
  enriched_abv: number | null;
  enrichment_confidence: number | null;
  enrichment_source: 'description' | 'perplexity' | 'manual' | null;
  brew_description: string | null;
}
```

## 2. Add `updateEnrichmentData()` Repository Methods

We need a method that only UPDATEs enrichment columns without deleting rows, unlike the current `insertMany()`.

### BeerRepository.ts

**File:** `src/database/repositories/BeerRepository.ts`

```typescript
import { EnrichmentUpdate } from '@/src/types/enrichment';
import { databaseLockManager } from '../locks';

/**
 * Update enrichment data for existing beers without deleting/re-inserting.
 */
async updateEnrichmentData(
  enrichments: Record<string, EnrichmentUpdate>
): Promise<number> {
  const ids = Object.keys(enrichments);
  if (ids.length === 0) return 0;

  if (!(await databaseLockManager.acquireLock('BeerRepository'))) {
    throw new Error('Could not acquire database lock for enrichment update');
  }

  try {
    const database = await getDatabase();
    let updatedCount = 0;

    await database.withTransactionAsync(async () => {
      const stmt = await database.prepareAsync(
        `UPDATE allbeers SET
          abv = COALESCE(?, abv),
          enrichment_confidence = ?,
          enrichment_source = ?,
          brew_description = COALESCE(?, brew_description)
         WHERE id = ?`
      );

      try {
        for (const [id, data] of Object.entries(enrichments)) {
          const result = await stmt.executeAsync([
            data.enriched_abv,
            data.enrichment_confidence ?? null,
            data.enrichment_source ?? null,
            data.brew_description ?? null,
            id
          ]);
          if (result.changes > 0) updatedCount++;
        }
      } finally {
        await stmt.finalizeAsync();
      }
    });

    console.log(`[BeerRepository] Updated enrichment for ${updatedCount} beers`);
    return updatedCount;
  } finally {
    databaseLockManager.releaseLock('BeerRepository');
  }
}
```

### MyBeersRepository.ts

**File:** `src/database/repositories/MyBeersRepository.ts`

```typescript
import { EnrichmentUpdate } from '@/src/types/enrichment';
import { databaseLockManager } from '../locks';
import { getDatabase } from '../connection';

/**
 * Update enrichment data for existing tasted beers without deleting/re-inserting.
 */
async updateEnrichmentData(
  enrichments: Record<string, EnrichmentUpdate>
): Promise<number> {
  const ids = Object.keys(enrichments);
  if (ids.length === 0) return 0;

  if (!(await databaseLockManager.acquireLock('MyBeersRepository'))) {
    throw new Error('Could not acquire database lock for enrichment update');
  }

  try {
    const database = await getDatabase();
    let updatedCount = 0;

    await database.withTransactionAsync(async () => {
      const stmt = await database.prepareAsync(
        `UPDATE tasted_brew_current_round SET
          abv = COALESCE(?, abv),
          enrichment_confidence = ?,
          enrichment_source = ?,
          brew_description = COALESCE(?, brew_description)
         WHERE id = ?`
      );

      try {
        for (const [id, data] of Object.entries(enrichments)) {
          const result = await stmt.executeAsync([
            data.enriched_abv,
            data.enrichment_confidence ?? null,
            data.enrichment_source ?? null,
            data.brew_description ?? null,
            id
          ]);
          if (result.changes > 0) updatedCount++;
        }
      } finally {
        await stmt.finalizeAsync();
      }
    });

    console.log(`[MyBeersRepository] Updated enrichment for ${updatedCount} beers`);
    return updatedCount;
  } finally {
    databaseLockManager.releaseLock('MyBeersRepository');
  }
}
```

## 3. Standardize Locking

Update existing `insertMany` methods in both repositories to use repository-level locks. This ensures `updateEnrichmentData` and `insertMany` coordinate properly.

### BeerRepository.ts - Update `insertMany` lock

**File:** `src/database/repositories/BeerRepository.ts`

```typescript
// Line 34 - Change FROM:
if (!(await databaseLockManager.acquireLock('BeerRepository.insertMany'))) {
// TO:
if (!(await databaseLockManager.acquireLock('BeerRepository'))) {

// Line 42 - Change FROM:
databaseLockManager.releaseLock('BeerRepository.insertMany');
// TO:
databaseLockManager.releaseLock('BeerRepository');
```

### MyBeersRepository.ts - Update `insertMany` lock

**File:** `src/database/repositories/MyBeersRepository.ts`

```typescript
// Line 44 - Change FROM:
if (!(await databaseLockManager.acquireLock('MyBeersRepository.insertMany'))) {
// TO:
if (!(await databaseLockManager.acquireLock('MyBeersRepository'))) {

// Line 172 - Change FROM:
databaseLockManager.releaseLock('MyBeersRepository.insertMany');
// TO:
databaseLockManager.releaseLock('MyBeersRepository');
```

## 4. Enrichment Timestamp Tracking

**File:** `src/database/preferences.ts`

Add a new preference key to track the last successful enrichment:

- `beers_last_enrichment` (ISO string timestamp)

---

> [!IMPORTANT]
> Once these changes are verified, proceed to **Phase 2: Implementation**.
