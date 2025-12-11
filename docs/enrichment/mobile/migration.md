# SQLite Schema Migration

This document covers the SQLite migration needed to store enrichment data in the mobile app.

## Overview

Migration v7 adds three columns to the `allbeers` table to store enrichment data from the Cloudflare Worker:

| Column                   | Type    | Description                                         |
| ------------------------ | ------- | --------------------------------------------------- |
| `enrichment_confidence`  | REAL    | Confidence score 0.0-1.0                            |
| `is_enrichment_verified` | INTEGER | Boolean (0/1) for manual verification               |
| `enrichment_source`      | TEXT    | Source of enrichment ('perplexity', 'manual', null) |

## Migration File

Create `src/database/migrations/migrateToV7.ts`:

```typescript
import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Migration v7: Add enrichment columns to allbeers table.
 * These columns store data from the Cloudflare enrichment service.
 */
export async function migrateToV7(db: SQLiteDatabase): Promise<void> {
  console.log('[Migration] Running v7: Adding enrichment columns');

  // Add enrichment columns to allbeers table
  // SQLite doesn't support adding multiple columns in one ALTER, so we do them separately

  // Check if columns already exist (for safety)
  const tableInfo = await db.getAllAsync<{ name: string }>('PRAGMA table_info(allbeers)');
  const existingColumns = new Set(tableInfo.map(col => col.name));

  if (!existingColumns.has('enrichment_confidence')) {
    await db.execAsync(`
      ALTER TABLE allbeers ADD COLUMN enrichment_confidence REAL DEFAULT NULL;
    `);
    console.log('[Migration] Added enrichment_confidence column');
  }

  if (!existingColumns.has('is_enrichment_verified')) {
    await db.execAsync(`
      ALTER TABLE allbeers ADD COLUMN is_enrichment_verified INTEGER DEFAULT 0;
    `);
    console.log('[Migration] Added is_enrichment_verified column');
  }

  if (!existingColumns.has('enrichment_source')) {
    await db.execAsync(`
      ALTER TABLE allbeers ADD COLUMN enrichment_source TEXT DEFAULT NULL;
    `);
    console.log('[Migration] Added enrichment_source column');
  }

  console.log('[Migration] v7 complete: Enrichment columns added');
}
```

## Update Schema Version

Update `src/database/schema.ts`:

```typescript
import { migrateToV7 } from './migrations/migrateToV7';

// Update version number
export const CURRENT_SCHEMA_VERSION = 7;

// Add to migration chain
export async function runMigrations(db: SQLiteDatabase, fromVersion: number): Promise<void> {
  // ... existing migrations ...

  if (fromVersion < 7) {
    await migrateToV7(db);
  }

  // Update stored version
  await db.runAsync('INSERT OR REPLACE INTO preferences (key, value) VALUES (?, ?)', [
    'schema_version',
    String(CURRENT_SCHEMA_VERSION),
  ]);
}
```

## Column Details

### `enrichment_confidence`

- **Type**: REAL (floating point)
- **Range**: 0.0 to 1.0
- **Default**: NULL (no enrichment data)
- **Values**:
  - `NULL` - No enrichment attempted
  - `0.5` - Default/low confidence
  - `0.7` - LLM-sourced (Perplexity)
  - `1.0` - Manually verified

### `is_enrichment_verified`

- **Type**: INTEGER (SQLite boolean)
- **Values**: 0 (false) or 1 (true)
- **Default**: 0
- **Purpose**: Flag for manually verified ABV data

### `enrichment_source`

- **Type**: TEXT
- **Default**: NULL
- **Values**:
  - `NULL` - No enrichment
  - `'perplexity'` - From Perplexity API
  - `'manual'` - Manually entered

## Testing Migration

### Test Locally

```typescript
// In a test or debug script
import { openDatabase } from '@/src/database/connection';
import { migrateToV7 } from '@/src/database/migrations/migrateToV7';

async function testMigration() {
  const db = await openDatabase();

  // Check current columns
  const before = await db.getAllAsync('PRAGMA table_info(allbeers)');
  console.log(
    'Columns before:',
    before.map(c => c.name)
  );

  // Run migration
  await migrateToV7(db);

  // Check new columns
  const after = await db.getAllAsync('PRAGMA table_info(allbeers)');
  console.log(
    'Columns after:',
    after.map(c => c.name)
  );

  // Verify columns exist
  const hasConfidence = after.some(c => c.name === 'enrichment_confidence');
  const hasVerified = after.some(c => c.name === 'is_enrichment_verified');
  const hasSource = after.some(c => c.name === 'enrichment_source');

  console.log('Migration successful:', hasConfidence && hasVerified && hasSource);
}
```

### Verify Data

After migration, verify data can be written and read:

```typescript
// Write enrichment data
await db.runAsync(
  `UPDATE allbeers SET
    enrichment_confidence = ?,
    is_enrichment_verified = ?,
    enrichment_source = ?
   WHERE id = ?`,
  [0.7, 0, 'perplexity', 'test-beer-id']
);

// Read it back
const beer = await db.getFirstAsync<{
  id: string;
  enrichment_confidence: number | null;
  is_enrichment_verified: number;
  enrichment_source: string | null;
}>(
  'SELECT id, enrichment_confidence, is_enrichment_verified, enrichment_source FROM allbeers WHERE id = ?',
  ['test-beer-id']
);

console.log('Beer enrichment:', beer);
```

## Rollback

SQLite doesn't support dropping columns easily. If rollback is needed:

1. **Option A**: Keep columns but ignore them (they'll have NULL/default values)
2. **Option B**: Recreate table without columns (data loss for enrichment fields only)

```typescript
// Option B: Recreate table (last resort)
async function rollbackV7(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    -- Create new table without enrichment columns
    CREATE TABLE allbeers_new AS
    SELECT id, brew_name, brewer, container_type, abv, updated_at
    FROM allbeers;

    -- Drop old table
    DROP TABLE allbeers;

    -- Rename new table
    ALTER TABLE allbeers_new RENAME TO allbeers;
  `);
}
```

## Related Files

- `src/database/schema.ts` - Schema version and migration runner
- `src/database/repositories/BeerRepository.ts` - Repository that uses these columns
- `src/types/beer.ts` - TypeScript interface with enrichment fields
