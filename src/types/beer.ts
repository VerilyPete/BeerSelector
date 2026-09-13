/** Legacy consumer types retained for the ufobeer cross-repository contract. */

/**
 * Valid enrichment source values
 * - 'description': ABV parsed from brew_description HTML
 * - 'perplexity': ABV fetched from Perplexity API
 * - 'manual': ABV manually verified/entered
 * - null: Not yet enriched
 */
export type EnrichmentSource = 'description' | 'perplexity' | 'manual' | null;

/**
 * Base Beer type representing a beer in the system
 */
export type Beer = {
  id: string;
  brew_name: string;
  brewer?: string;
  brewer_loc?: string;
  brew_style?: string;
  brew_container?: string;
  review_count?: string;
  review_rating?: string;
  brew_description?: string;
  added_date?: string;
  abv?: number | null;
  // Enrichment fields (from Cloudflare Worker)
  enrichment_confidence?: number | null;
  enrichment_source?: EnrichmentSource;
};

