import { z } from 'zod';

export const enrichmentDataSchema = z.object({
  enriched_abv: z.number().nullable(),
  enrichment_confidence: z.number().nullable(),
  enrichment_source: z.enum(['description', 'perplexity', 'manual']).nullable(),
  brew_description: z.string().nullable(),
  has_cleaned_description: z.boolean(),
});

export const enrichedBeerResponseSchema = z.object({
  id: z.string(),
  brew_name: z.string(),
  brewer: z.string(),
  brewer_loc: z.string().optional(),
  brew_style: z.string().optional(),
  brew_container: z.string().optional(),
  review_count: z.string().nullish(),
  review_rating: z.string().nullish(),
  brew_description: z.string().optional(),
  added_date: z.string().optional(),
  enriched_abv: z.number().nullable(),
  enrichment_confidence: z.number().nullable(),
  enrichment_source: z.enum(['description', 'perplexity', 'manual']).nullable(),
});

export const beersProxyResponseSchema = z.object({
  storeId: z.string(),
  beers: z.array(enrichedBeerResponseSchema),
  requestId: z.string().optional(),
  source: z.enum(['live', 'cache', 'stale']).optional(),
  cached_at: z.string().optional(),
});

export const batchEnrichmentResponseSchema = z.object({
  enrichments: z.record(z.string(), enrichmentDataSchema),
  missing: z.array(z.string()),
  requestId: z.string(),
});

export const syncBeerSchema = z.object({
  id: z.string().min(1).max(50),
  brew_name: z.string().min(1).max(200),
  brewer: z.string().optional(),
  brew_description: z.string().max(2000).optional(),
});

export const syncBeersRequestSchema = z.object({
  beers: z.array(syncBeerSchema).max(50),
});

export const syncBeersResponseSchema = z.object({
  synced: z.number(),
  queued_for_cleanup: z.number(),
  requestId: z.string(),
  errors: z.array(z.string()).optional(),
});

export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'error']),
  database: z.string(),
  enrichment: z
    .object({
      enabled: z.boolean(),
      daily: z.object({ used: z.number(), limit: z.number(), remaining: z.number() }),
      monthly: z.object({ used: z.number(), limit: z.number(), remaining: z.number() }),
    })
    .optional(),
});

export type EnrichmentData = z.infer<typeof enrichmentDataSchema>;
export type EnrichedBeerResponse = z.infer<typeof enrichedBeerResponseSchema>;
export type BeersProxyResponse = z.infer<typeof beersProxyResponseSchema>;
export type BatchEnrichmentResponse = z.infer<typeof batchEnrichmentResponseSchema>;
export type SyncBeer = z.infer<typeof syncBeerSchema>;
export type SyncBeersRequest = z.infer<typeof syncBeersRequestSchema>;
export type SyncBeersResponse = z.infer<typeof syncBeersResponseSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
