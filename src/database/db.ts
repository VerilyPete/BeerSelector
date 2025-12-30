/**
 * Database Orchestration
 *
 * This file contains database initialization and orchestration (initializeBeerDatabase).
 *
 * For data access operations, use repositories directly:
 * - beerRepository (src/database/repositories/BeerRepository.ts)
 * - myBeersRepository (src/database/repositories/MyBeersRepository.ts)
 * - rewardsRepository (src/database/repositories/RewardsRepository.ts)
 * - preferences module (src/database/preferences.ts)
 */

import * as SQLite from 'expo-sqlite';
import { getDatabase } from './connection';
import { getPreference, setPreference, areApiUrlsConfigured } from './preferences';
import { setupTables } from './schema';
import { databaseInitializer } from './initializationState';
import { fetchBeersFromAPI, fetchMyBeersFromAPI, fetchRewardsFromAPI } from '../api/beerApi';
import { beerRepository } from './repositories/BeerRepository';
import { myBeersRepository } from './repositories/MyBeersRepository';
import { rewardsRepository } from './repositories/RewardsRepository';
import { calculateContainerTypes } from './utils/glassTypeCalculator';
import { config } from '../config';
import { BeerWithContainerType, BeerfinderWithContainerType } from '@/src/types/beer';
import { EnrichmentUpdate } from '@/src/types/enrichment';
import { fetchEnrichmentBatchWithMissing, syncBeersToWorker } from '../services/enrichmentService';

// ============================================================================
// DATABASE INITIALIZATION CONFIGURATION
// ============================================================================

/**
 * Maximum time to wait for database schema setup to complete.
 * Set to 30 seconds to account for slow devices or complex migrations.
 * If setup exceeds this timeout, the app will fail to initialize properly.
 */
const DATABASE_INITIALIZATION_TIMEOUT_MS = 30000;

/**
 * Delay before retrying enrichment after a failure.
 */
const ENRICHMENT_RETRY_DELAY_MS = 5000;

/**
 * Maximum number of enrichment fetch attempts.
 */
const ENRICHMENT_MAX_ATTEMPTS = 2;

// ============================================================================
// BACKGROUND ENRICHMENT
// ============================================================================

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
        console.log(`[db] Both tables updated with enriched beer data (attempt ${attempt})`);
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

// ============================================================================
// DATABASE INITIALIZATION
// ============================================================================

/**
 * Initialize database connection
 * @returns Database instance
 */
export const initDatabase = async (): Promise<SQLite.SQLiteDatabase> => {
  return await getDatabase();
};

/**
 * Create tables if they don't exist
 * Handles state management to prevent duplicate initialization
 */
export const setupDatabase = async (): Promise<void> => {
  // If already ready, return immediately
  if (databaseInitializer.isReady()) {
    console.log('Database already ready');
    return;
  }

  // If in ERROR state, throw the error immediately
  if (databaseInitializer.isError()) {
    throw new Error(`Database setup failed: ${databaseInitializer.getErrorMessage()}`);
  }

  // If initialization is in progress, wait for it to complete using event-based waiting
  if (databaseInitializer.isInitializing()) {
    console.log('Database setup already in progress, waiting...');
    try {
      await databaseInitializer.waitUntilReady(DATABASE_INITIALIZATION_TIMEOUT_MS);
      console.log('Database setup completed while waiting');
      return;
    } catch (error) {
      if (databaseInitializer.isError()) {
        throw new Error(`Database setup failed: ${databaseInitializer.getErrorMessage()}`);
      }
      throw error;
    }
  }

  // Transition to INITIALIZING state
  try {
    databaseInitializer.setInitializing();
  } catch (error) {
    // If we can't transition to INITIALIZING (e.g., already READY), return
    console.log('Cannot transition to INITIALIZING, database may already be ready');
    return;
  }

  try {
    const database = await initDatabase();

    // Use the setupTables function from schema module
    await setupTables(database);

    // Transition to READY state
    databaseInitializer.setReady();
    console.log('Database setup complete');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    databaseInitializer.setError(errorMessage);
    console.error('Error setting up database:', error);
    throw error;
  }
};

/**
 * Initialize the beer database on app startup
 * Orchestrates the complete database setup and initial data loading
 *
 * Flow:
 * 1. Setup database schema (tables, indexes)
 * 2. Check if API URLs are configured
 * 3. Fetch and insert All Beers immediately (blocking - needed for UI)
 * 4. Fetch and insert My Beers immediately (blocking, members only)
 * 5. Fetch and insert Rewards immediately (blocking, members only)
 * 6. Trigger unified background enrichment (fire-and-forget)
 */
export const initializeBeerDatabase = async (): Promise<void> => {
  console.log('Initializing beer database...');

  try {
    // First, make sure the database schema is set up
    await setupDatabase();

    // Check if API URLs are configured
    const apiUrlsConfigured = await areApiUrlsConfigured();
    if (!apiUrlsConfigured) {
      console.log('API URLs not configured, database initialization will be limited');
      return;
    }

    // Check for visitor mode to handle differently
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
      console.error('[db] Error fetching and populating all beers:', error);
    }

    // 2. Fetch and Insert My Beers/Rewards Immediately (for members only)
    if (!isVisitorMode) {
      try {
        const myBeers = await fetchMyBeersFromAPI();
        myBeersData = calculateContainerTypes(myBeers) as BeerfinderWithContainerType[];
        await myBeersRepository.insertMany(myBeersData);
        console.log('[db] My beers inserted');
      } catch (error) {
        console.error('[db] Error fetching and populating my beers:', error);
      }

      // Fetch and insert Rewards
      try {
        const rewards = await fetchRewardsFromAPI();
        await rewardsRepository.insertMany(rewards);
        console.log('[db] Rewards inserted');
      } catch (error) {
        console.error('[db] Error fetching and populating rewards:', error);
      }
    } else {
      console.log('[db] Visitor mode - skipping My Beers and Rewards import');
    }

    // 3. Trigger Unified Background Enrichment (fire-and-forget)
    // Note: For visitors, myBeersData will be empty, which is fine
    enrichBeersInBackground(allBeersData, myBeersData).catch(err =>
      console.error('[db] Unhandled error in background enrichment:', err)
    );

    console.log('[db] Beer database initialization completed');
  } catch (error) {
    console.error('[db] Error initializing beer database:', error);
    throw error;
  }
};

/**
 * Reset database initialization state
 * Used for manual refresh or testing scenarios
 */
export const resetDatabaseState = (): void => {
  databaseInitializer.reset();
  console.log('Database state reset');
};
