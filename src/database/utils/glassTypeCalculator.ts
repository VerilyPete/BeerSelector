import { getGlassType } from '@/src/utils/beerGlassType';
import { Beer, BeerWithGlassType } from '@/src/types/beer';
import { SQLiteDatabase } from 'expo-sqlite';
import { BeerRow } from '@/src/database/schemaTypes';

/**
 * Calculate and assign glass type to a beer object
 * Returns new object with glass_type property
 */
export function calculateGlassType(beer: Beer): Beer & { glass_type: 'pint' | 'tulip' | null } {
  const glassType = getGlassType(
    beer.brew_container,
    beer.brew_description,
    beer.brew_style
  );

  return {
    ...beer,
    glass_type: glassType,
  };
}

/**
 * Calculate glass types for an array of beers
 * Used in data sync to pre-compute before insertion
 *
 * Returns BeerWithGlassType[] to match repository type signatures
 */
export function calculateGlassTypes(beers: Beer[]): BeerWithGlassType[] {
  return beers.map(beer => ({
    ...beer,
    glass_type: getGlassType(
      beer.brew_container,
      beer.brew_description,
      beer.brew_style
    ),
  })) as BeerWithGlassType[];
}

/**
 * Progress callback for migration
 */
export type MigrationProgressCallback = (current: number, total: number) => void;

/**
 * Backfill glass types for existing database records
 * Called during schema migration
 * Uses optimized bulk update with SQL CASE statements
 */
export async function backfillGlassTypes(
  database: SQLiteDatabase,
  onProgress?: MigrationProgressCallback
): Promise<void> {
  console.log('Backfilling glass types for existing beers...');

  // Process allbeers table
  await backfillTable(database, 'allbeers', onProgress);

  // Process tasted_brew_current_round table
  await backfillTable(database, 'tasted_brew_current_round', onProgress);

  console.log('✅ Glass type backfill complete');
}

/**
 * Backfill a specific table with optimized batch updates
 */
async function backfillTable(
  database: SQLiteDatabase,
  tableName: string,
  onProgress?: MigrationProgressCallback
): Promise<void> {
  // Get all beers without glass_type
  const beers = await database.getAllAsync<BeerRow>(
    `SELECT * FROM ${tableName} WHERE glass_type IS NULL`
  );

  const total = beers.length;
  console.log(`Found ${total} beers in ${tableName} to process`);

  if (total === 0) return;

  // Calculate glass types in memory (fast)
  const updates = beers.map(beer => ({
    id: beer.id,
    glassType: getGlassType(beer.brew_container, beer.brew_description, beer.brew_style),
  }));

  // Use SQL CASE statement for bulk update (10-20x faster than individual UPDATEs)
  // Process in batches to avoid SQLite expression tree limits
  // Note: No transaction here - caller (migrateToV3) already has one
  const batchSize = 100;
  let processed = 0;

  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, i + batchSize);

    // Build CASE statement
    const caseStatements = batch
      .map(u => `WHEN id = ? THEN ?`)
      .join(' ');

    // Flatten parameters: [id1, glassType1, id2, glassType2, ...]
    const params: (string | null)[] = [];
    batch.forEach(u => {
      params.push(u.id, u.glassType);
    });

    // Add IDs for WHERE clause
    const ids = batch.map(u => u.id);
    params.push(...ids);

    // Execute bulk update
    await database.runAsync(
      `UPDATE ${tableName}
       SET glass_type = CASE
         ${caseStatements}
         ELSE glass_type
       END
       WHERE id IN (${ids.map(() => '?').join(',')})`,
      params
    );

    processed += batch.length;
    console.log(`Processed ${processed}/${total} beers in ${tableName}`);

    if (onProgress) {
      onProgress(processed, total);
    }
  }

  console.log(`✅ Backfilled ${total} beers in ${tableName}`);
}
