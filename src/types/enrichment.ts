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
