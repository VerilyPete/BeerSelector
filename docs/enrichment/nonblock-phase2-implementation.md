# Non-Blocking Enrichment: Phase 2 - Implementation

> [!NOTE]
> This is Phase 2 of the non-blocking enrichment implementation. It covers the core orchestration logic for background enrichment and the refactoring of the app startup flow.
> **Scope:** Business Logic and Application Lifecycle

## Overview

Phase 2 implements the "fire-and-forget" enrichment mechanism that runs after the primary beer data has been successfully persisted.

## 1. Create Unified Background Enrichment Function

**File:** `src/database/db.ts`

Combine IDs from All Beers and My Beers, deduplicate, and fetch enrichment once.

**Required imports:**

```typescript
import { BeerWithContainerType, BeerfinderWithContainerType } from '@/src/types/beer';
import { EnrichmentUpdate } from '@/src/types/enrichment';
import {
  fetchEnrichmentBatchWithMissing,
  syncBeersToWorker,
} from '@/src/services/enrichmentService';
import { setPreference } from './preferences';
import { beerRepository } from './repositories/BeerRepository';
import { myBeersRepository } from './repositories/MyBeersRepository';
import { config } from '@/src/config';
```

**Implementation:**

```typescript
const ENRICHMENT_RETRY_DELAY_MS = 5000;
const ENRICHMENT_MAX_ATTEMPTS = 2;

/**
 * Perform unified background enrichment.
 * Fire-and-forget with single retry - errors are logged but don't block.
 *
 * Note: BeerfinderWithContainerType extends BeerWithContainerType.
 * We accept the base type for myBeers since we only use id/abv fields.
 */
async function enrichBeersInBackground(
  allBeers: BeerWithContainerType[],
  myBeers: BeerfinderWithContainerType[]
): Promise<void> {
  if (!config.enrichment.isConfigured()) return;

  const allBeersNeedingEnrichment = allBeers.filter(b => !b.abv);
  const myBeersNeedingEnrichment = myBeers.filter(b => !b.abv);
  const allBeerIds = new Set(allBeersNeedingEnrichment.map(b => b.id));
  const myBeerIds = new Set(myBeersNeedingEnrichment.map(b => b.id));
  const uniqueIds = [...new Set([...allBeerIds, ...myBeerIds])];

  if (uniqueIds.length === 0) {
    console.log('[db] All beers already have ABV, skipping enrichment');
    return;
  }

  console.log(
    `[db] Fetching enrichment for ${uniqueIds.length} unique beers ` +
      `(${allBeerIds.size} from All Beers, ${myBeerIds.size} from My Beers, ` +
      `${allBeerIds.size + myBeerIds.size - uniqueIds.length} overlap)`
  );

  for (let attempt = 1; attempt <= ENRICHMENT_MAX_ATTEMPTS; attempt++) {
    try {
      const { enrichments: enrichmentData, missing: missingIds } =
        await fetchEnrichmentBatchWithMissing(uniqueIds);

      if (Object.keys(enrichmentData).length > 0) {
        const allBeersEnrichments: Record<string, EnrichmentUpdate> = {};
        const myBeersEnrichments: Record<string, EnrichmentUpdate> = {};

        for (const [id, data] of Object.entries(enrichmentData)) {
          const update: EnrichmentUpdate = {
            enriched_abv: data.enriched_abv,
            enrichment_confidence: data.enrichment_confidence,
            enrichment_source: data.enrichment_source,
            brew_description: data.brew_description,
          };
          if (allBeerIds.has(id)) allBeersEnrichments[id] = update;
          if (myBeerIds.has(id)) myBeersEnrichments[id] = update;
        }

        if (Object.keys(allBeersEnrichments).length > 0) {
          await beerRepository.updateEnrichmentData(allBeersEnrichments);
        }
        if (Object.keys(myBeersEnrichments).length > 0) {
          await myBeersRepository.updateEnrichmentData(myBeersEnrichments);
        }

        await setPreference('beers_last_enrichment', new Date().toISOString());
        console.log('[db] Both tables updated with enriched beer data');
      }

      // Sync missing beers to Worker (fire-and-forget)
      if (missingIds.length > 0) {
        const allMissingBeers = [
          ...allBeersNeedingEnrichment.filter(b => missingIds.includes(b.id)),
          ...myBeersNeedingEnrichment.filter(b => missingIds.includes(b.id)),
        ];
        const uniqueMissingBeers = Array.from(
          new Map(allMissingBeers.map(b => [b.id, b])).values()
        );
        syncBeersToWorker(uniqueMissingBeers).catch(err =>
          console.error('[db] Failed to sync missing beers:', err)
        );
      }

      return; // Success - exit retry loop
    } catch (error) {
      console.error(`[db] Background enrichment attempt ${attempt} failed:`, error);
      if (attempt < ENRICHMENT_MAX_ATTEMPTS) {
        console.log(`[db] Retrying enrichment in ${ENRICHMENT_RETRY_DELAY_MS / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, ENRICHMENT_RETRY_DELAY_MS));
      }
    }
  }

  // All retries exhausted
  console.error('[db] Background enrichment failed after all retry attempts');
}
```

## 2. Refactor Initialization Flow

**File:** `src/database/db.ts`

Change the `initializeBeerDatabase` flow to insert data immediately and trigger enrichment in the background.

```typescript
export const initializeBeerDatabase = async (): Promise<void> => {
  console.log('Initializing beer database...');

  try {
    await setupDatabase();

    const apiUrlsConfigured = await areApiUrlsConfigured();
    if (!apiUrlsConfigured) {
      console.log('API URLs not configured, database initialization will be limited');
      return;
    }

    const isVisitorMode = (await getPreference('is_visitor_mode')) === 'true';

    // Track data for unified enrichment
    let allBeersData: BeerWithContainerType[] = [];
    let myBeersData: BeerfinderWithContainerType[] = [];

    // 1. Fetch and Insert All Beers Immediately (blocking - needed for UI)
    try {
      const beers = await fetchBeersFromAPI();
      allBeersData = calculateContainerTypes(beers);
      await beerRepository.insertMany(allBeersData);
      console.log('[db] All beers inserted');
    } catch (error) {
      console.error('Error fetching and populating all beers:', error);
    }

    // 2. Fetch and Insert My Beers/Rewards Immediately (for members only)
    if (!isVisitorMode) {
      try {
        const myBeers = await fetchMyBeersFromAPI();
        myBeersData = calculateContainerTypes(myBeers) as BeerfinderWithContainerType[];
        await myBeersRepository.insertMany(myBeersData);
        console.log('[db] My beers inserted');
      } catch (error) {
        console.error('Error fetching and populating my beers:', error);
      }

      // Fetch and insert Rewards
      try {
        const rewards = await fetchRewardsFromAPI();
        await rewardsRepository.insertMany(rewards);
        console.log('[db] Rewards inserted');
      } catch (error) {
        console.error('Error fetching and populating rewards:', error);
      }
    }

    // 3. Trigger Unified Background Enrichment (fire-and-forget)
    // Note: For visitors, myBeersData will be empty, which is fine
    enrichBeersInBackground(allBeersData, myBeersData);

    console.log('Beer database initialization completed');
  } catch (error) {
    console.error('Error initializing beer database:', error);
    throw error;
  }
};
```

---

> [!IMPORTANT]
> This phase significantly improves app responsiveness by removing (~300-500ms) of blocking network calls from the startup path. Proceed to **Phase 3: Advanced & Testing** for polish and verification steps.
