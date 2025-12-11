/**
 * Database Schema Types with Zod Runtime Validation
 *
 * This module provides:
 * 1. TypeScript types for database table rows (matching SQL schema exactly)
 * 2. Zod schemas for runtime validation
 * 3. Type guards for type checking
 * 4. Conversion functions from database rows to domain models
 *
 * Each table has:
 * - A Row type (e.g., AllBeersRow) representing the exact database structure
 * - A Zod schema for validation (e.g., allBeersRowSchema)
 * - A type guard function (e.g., isAllBeersRow)
 * - A conversion function to domain model (e.g., allBeersRowToBeer)
 */

import { z } from 'zod';
import {
  Beer,
  Beerfinder,
  BeerWithContainerType,
  BeerfinderWithContainerType,
} from '../types/beer';
import { ContainerType } from '../utils/beerGlassType';
import { Reward, Preference } from '../types/database';

// ============================================================================
// AllBeers Table
// ============================================================================

/**
 * Zod schema for allbeers table rows
 *
 * Matches SQL schema (v7):
 * CREATE TABLE IF NOT EXISTS allbeers (
 *   id TEXT PRIMARY KEY,
 *   added_date TEXT,
 *   brew_name TEXT,
 *   brewer TEXT,
 *   brewer_loc TEXT,
 *   brew_style TEXT,
 *   brew_container TEXT,
 *   review_count TEXT,
 *   review_rating TEXT,
 *   brew_description TEXT,
 *   container_type TEXT,
 *   abv REAL,
 *   enrichment_confidence REAL,
 *   enrichment_source TEXT
 * )
 *
 * Required fields: id, brew_name (non-empty)
 * All fields are TEXT in SQLite, optional fields default to empty string
 */
export const allBeersRowSchema = z.object({
  id: z
    .union([z.string(), z.number()])
    .refine(val => val !== null && val !== undefined && val !== '', {
      message: 'id must not be empty',
    }),
  added_date: z.string().optional(),
  brew_name: z.string().min(1, 'brew_name must not be empty'),
  brewer: z.string().optional(),
  brewer_loc: z.string().optional(),
  brew_style: z.string().optional(),
  brew_container: z.string().optional(),
  review_count: z.string().optional(),
  review_rating: z.string().optional(),
  brew_description: z.string().optional(),
  container_type: z
    .union([
      z.literal('pint'),
      z.literal('tulip'),
      z.literal('can'),
      z.literal('bottle'),
      z.literal('flight'),
      z.null(),
    ])
    .optional(),
  abv: z.number().nullable().optional(),
  // Enrichment fields (added in schema v7)
  enrichment_confidence: z.number().nullable().optional(),
  enrichment_source: z.union([z.literal('perplexity'), z.literal('manual'), z.null()]).optional(),
});

/**
 * TypeScript type for allbeers table rows
 * Inferred from Zod schema to ensure consistency
 */
export type AllBeersRow = z.infer<typeof allBeersRowSchema>;

/**
 * Type guard to check if an object is a valid AllBeersRow
 * Uses Zod schema for runtime validation
 */
export function isAllBeersRow(obj: unknown): obj is AllBeersRow {
  return allBeersRowSchema.safeParse(obj).success;
}

/**
 * Convert AllBeersRow to Beer domain model
 * Currently they have the same structure, but this provides
 * a clear separation between database and domain layers
 *
 * Includes optional enrichment fields (added in schema v7)
 */
export function allBeersRowToBeer(row: AllBeersRow): Beer {
  return {
    id: typeof row.id === 'number' ? String(row.id) : row.id,
    added_date: row.added_date,
    brew_name: row.brew_name,
    brewer: row.brewer,
    brewer_loc: row.brewer_loc,
    brew_style: row.brew_style,
    brew_container: row.brew_container,
    review_count: row.review_count,
    review_rating: row.review_rating,
    brew_description: row.brew_description,
    abv: row.abv,
    // Enrichment fields (optional on Beer interface)
    enrichment_confidence: row.enrichment_confidence,
    enrichment_source: row.enrichment_source,
  };
}

/**
 * Convert AllBeersRow to BeerWithContainerType domain model
 * Used after schema v4 migration when container_type is guaranteed to be present
 *
 * Includes enrichment fields (added in schema v7)
 */
export function allBeersRowToBeerWithContainerType(row: AllBeersRow): BeerWithContainerType {
  return {
    id: typeof row.id === 'number' ? String(row.id) : row.id,
    added_date: row.added_date,
    brew_name: row.brew_name,
    brewer: row.brewer,
    brewer_loc: row.brewer_loc,
    brew_style: row.brew_style,
    brew_container: row.brew_container,
    review_count: row.review_count,
    review_rating: row.review_rating,
    brew_description: row.brew_description,
    container_type: (row.container_type ?? null) as ContainerType,
    abv: row.abv ?? null,
    // Enrichment fields (default to null if not present)
    enrichment_confidence: row.enrichment_confidence ?? null,
    enrichment_source: row.enrichment_source ?? null,
  };
}

// ============================================================================
// TastedBrew Table (tasted_brew_current_round)
// ============================================================================

/**
 * Zod schema for tasted_brew_current_round table rows
 *
 * Matches SQL schema (v7):
 * CREATE TABLE IF NOT EXISTS tasted_brew_current_round (
 *   id TEXT PRIMARY KEY,
 *   roh_lap TEXT,
 *   tasted_date TEXT,
 *   brew_name TEXT,
 *   brewer TEXT,
 *   brewer_loc TEXT,
 *   brew_style TEXT,
 *   brew_container TEXT,
 *   review_count TEXT,
 *   review_ratings TEXT,
 *   brew_description TEXT,
 *   chit_code TEXT,
 *   container_type TEXT,
 *   abv REAL,
 *   enrichment_confidence REAL,
 *   enrichment_source TEXT
 * )
 *
 * Required fields: id, brew_name (non-empty)
 * Note: Field is "review_ratings" (plural) in this table vs "review_rating" in allbeers
 */
export const tastedBrewRowSchema = z.object({
  id: z.string().min(1, 'id must not be empty'),
  roh_lap: z.string().optional(),
  tasted_date: z.string().optional(),
  brew_name: z.string().min(1, 'brew_name must not be empty'),
  brewer: z.string().optional(),
  brewer_loc: z.string().optional(),
  brew_style: z.string().optional(),
  brew_container: z.string().optional(),
  review_count: z.string().optional(),
  review_ratings: z.string().optional(),
  brew_description: z.string().optional(),
  chit_code: z.string().optional(),
  container_type: z
    .union([
      z.literal('pint'),
      z.literal('tulip'),
      z.literal('can'),
      z.literal('bottle'),
      z.literal('flight'),
      z.null(),
    ])
    .optional(),
  abv: z.number().nullable().optional(),
  // Enrichment fields (added in schema v7)
  enrichment_confidence: z.number().nullable().optional(),
  enrichment_source: z.union([z.literal('perplexity'), z.literal('manual'), z.null()]).optional(),
});

/**
 * TypeScript type for tasted_brew_current_round table rows
 */
export type TastedBrewRow = z.infer<typeof tastedBrewRowSchema>;

/**
 * Type guard to check if an object is a valid TastedBrewRow
 */
export function isTastedBrewRow(obj: unknown): obj is TastedBrewRow {
  return tastedBrewRowSchema.safeParse(obj).success;
}

/**
 * Convert TastedBrewRow to Beerfinder domain model
 *
 * Includes optional enrichment fields (added in schema v7)
 */
export function tastedBrewRowToBeerfinder(row: TastedBrewRow): Beerfinder {
  return {
    id: row.id,
    roh_lap: row.roh_lap,
    tasted_date: row.tasted_date,
    brew_name: row.brew_name,
    brewer: row.brewer,
    brewer_loc: row.brewer_loc,
    brew_style: row.brew_style,
    brew_container: row.brew_container,
    review_count: row.review_count,
    review_ratings: row.review_ratings,
    brew_description: row.brew_description,
    chit_code: row.chit_code,
    abv: row.abv,
    // Enrichment fields (optional on Beerfinder interface)
    enrichment_confidence: row.enrichment_confidence,
    enrichment_source: row.enrichment_source,
  };
}

/**
 * Convert TastedBrewRow to BeerfinderWithContainerType domain model
 * Used after schema v4 migration when container_type is guaranteed to be present
 *
 * Includes enrichment fields (added in schema v7)
 */
export function tastedBrewRowToBeerfinderWithContainerType(
  row: TastedBrewRow
): BeerfinderWithContainerType {
  return {
    id: row.id,
    roh_lap: row.roh_lap,
    tasted_date: row.tasted_date,
    brew_name: row.brew_name,
    brewer: row.brewer,
    brewer_loc: row.brewer_loc,
    brew_style: row.brew_style,
    brew_container: row.brew_container,
    review_count: row.review_count,
    review_ratings: row.review_ratings,
    brew_description: row.brew_description,
    chit_code: row.chit_code,
    container_type: (row.container_type ?? null) as ContainerType,
    abv: row.abv ?? null,
    // Enrichment fields (default to null if not present)
    enrichment_confidence: row.enrichment_confidence ?? null,
    enrichment_source: row.enrichment_source ?? null,
  };
}

// ============================================================================
// Rewards Table
// ============================================================================

/**
 * Zod schema for rewards table rows
 *
 * Matches SQL schema:
 * CREATE TABLE IF NOT EXISTS rewards (
 *   reward_id TEXT PRIMARY KEY,
 *   redeemed TEXT,
 *   reward_type TEXT
 * )
 *
 * Required fields: reward_id
 */
export const rewardRowSchema = z.object({
  reward_id: z.string().min(1, 'reward_id must not be empty'),
  redeemed: z.string().optional(),
  reward_type: z.string().optional(),
});

/**
 * TypeScript type for rewards table rows
 */
export type RewardRow = z.infer<typeof rewardRowSchema>;

/**
 * Type guard to check if an object is a valid RewardRow
 */
export function isRewardRow(obj: unknown): obj is RewardRow {
  return rewardRowSchema.safeParse(obj).success;
}

/**
 * Convert RewardRow to Reward domain model
 */
export function rewardRowToReward(row: RewardRow): Reward {
  return {
    reward_id: row.reward_id,
    redeemed: row.redeemed || '0',
    reward_type: row.reward_type || '',
  };
}

// ============================================================================
// Preferences Table
// ============================================================================

/**
 * Zod schema for preferences table rows
 *
 * Matches SQL schema:
 * CREATE TABLE IF NOT EXISTS preferences (
 *   key TEXT PRIMARY KEY,
 *   value TEXT,
 *   description TEXT
 * )
 *
 * Required fields: key, value
 */
export const preferenceRowSchema = z.object({
  key: z.string().min(1, 'key must not be empty'),
  value: z.string(),
  description: z.string().optional(),
});

/**
 * TypeScript type for preferences table rows
 */
export type PreferenceRow = z.infer<typeof preferenceRowSchema>;

/**
 * Type guard to check if an object is a valid PreferenceRow
 */
export function isPreferenceRow(obj: unknown): obj is PreferenceRow {
  return preferenceRowSchema.safeParse(obj).success;
}

/**
 * Convert PreferenceRow to Preference domain model
 */
export function preferenceRowToPreference(row: PreferenceRow): Preference {
  return {
    key: row.key,
    value: row.value,
    description: row.description || '',
  };
}

// ============================================================================
// Utility Types and Schemas
// ============================================================================

/**
 * Union type of all database row types
 */
export type DatabaseRow = AllBeersRow | TastedBrewRow | RewardRow | PreferenceRow;

/**
 * Schema for count query results
 */
export const countResultSchema = z.object({
  count: z.number().int().nonnegative(),
});

export type CountResult = z.infer<typeof countResultSchema>;

/**
 * Type guard for count results
 */
export function isCountResult(obj: unknown): obj is CountResult {
  return countResultSchema.safeParse(obj).success;
}

/**
 * Schema for table info query results (sqlite_master)
 */
export const tableInfoSchema = z.object({
  name: z.string(),
});

export type TableInfo = z.infer<typeof tableInfoSchema>;

/**
 * Schema for column info query results (PRAGMA table_info)
 */
export const columnInfoSchema = z.object({
  cid: z.number(),
  name: z.string(),
  type: z.string(),
  notnull: z.number(),
  dflt_value: z.unknown(),
  pk: z.number(),
});

export type ColumnInfo = z.infer<typeof columnInfoSchema>;

// ============================================================================
// Export convenience object with all schemas
// ============================================================================

/**
 * Convenience object containing all Zod schemas for easy import
 */
export const schemas = {
  allBeersRow: allBeersRowSchema,
  tastedBrewRow: tastedBrewRowSchema,
  rewardRow: rewardRowSchema,
  preferenceRow: preferenceRowSchema,
  countResult: countResultSchema,
  tableInfo: tableInfoSchema,
  columnInfo: columnInfoSchema,
} as const;

/**
 * Convenience object containing all type guards for easy import
 */
export const typeGuards = {
  isAllBeersRow,
  isTastedBrewRow,
  isRewardRow,
  isPreferenceRow,
  isCountResult,
} as const;

/**
 * Convenience object containing all conversion functions for easy import
 */
export const converters = {
  allBeersRowToBeer,
  tastedBrewRowToBeerfinder,
  rewardRowToReward,
  preferenceRowToPreference,
} as const;
