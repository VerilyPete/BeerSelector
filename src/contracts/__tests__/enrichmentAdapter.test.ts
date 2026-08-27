import { mapEnrichedBeerToAppBeer } from '../enrichmentAdapter';

describe('mapEnrichedBeerToAppBeer', () => {
  it('maps every field from a complete enriched beer', () => {
    expect(
      mapEnrichedBeerToAppBeer({
        id: 'golden-complete',
        brew_name: 'Contract IPA',
        brewer: 'Schema Brewing',
        brewer_loc: 'Austin, TX',
        brew_style: 'IPA',
        brew_container: 'Draft',
        review_count: '12',
        review_rating: '4.25',
        brew_description: 'Citrus & pine — “fresh”.',
        added_date: '2026-08-27',
        enriched_abv: 6.5,
        enrichment_confidence: 0.95,
        enrichment_source: 'manual',
      })
    ).toEqual({
      id: 'golden-complete',
      brew_name: 'Contract IPA',
      brewer: 'Schema Brewing',
      brewer_loc: 'Austin, TX',
      brew_style: 'IPA',
      brew_container: 'Draft',
      review_count: '12',
      review_rating: '4.25',
      brew_description: 'Citrus & pine — “fresh”.',
      added_date: '2026-08-27',
      abv: 6.5,
      enrichment_confidence: 0.95,
      enrichment_source: 'manual',
    });
  });

  it('normalizes nullable review fields to undefined', () => {
    const beer = mapEnrichedBeerToAppBeer({
      id: 'golden-nullable',
      brew_name: 'Null Island Lager',
      brewer: 'Schema Brewing',
      review_count: null,
      review_rating: null,
      enriched_abv: null,
      enrichment_confidence: null,
      enrichment_source: null,
    });

    expect(beer.review_count).toBeUndefined();
    expect(beer.review_rating).toBeUndefined();
    expect(beer.enrichment_source).toBeNull();
    expect(beer.abv).toBeNull();
  });
});
