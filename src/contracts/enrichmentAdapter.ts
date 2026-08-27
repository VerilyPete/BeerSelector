import type { Beer } from '../types/beer';
import type { EnrichedBeerResponse } from './enrichment';

/** Map a validated Worker beer response to the app's Beer domain type. */
export function mapEnrichedBeerToAppBeer(beer: EnrichedBeerResponse): Beer {
  return {
    id: beer.id,
    brew_name: beer.brew_name,
    brewer: beer.brewer,
    brewer_loc: beer.brewer_loc,
    brew_style: beer.brew_style,
    brew_container: beer.brew_container,
    // Review fields are nullable on the wire but optional in the app domain.
    review_count: beer.review_count ?? undefined,
    review_rating: beer.review_rating ?? undefined,
    brew_description: beer.brew_description,
    added_date: beer.added_date,
    abv: beer.enriched_abv,
    enrichment_confidence: beer.enrichment_confidence,
    enrichment_source: beer.enrichment_source,
  };
}
