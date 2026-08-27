import {
  batchEnrichmentResponseSchema,
  beersProxyResponseSchema,
  enrichedBeerResponseSchema,
  enrichmentDataSchema,
  healthResponseSchema,
  syncBeersRequestSchema,
  syncBeersResponseSchema,
} from '../enrichment';

const completeBeer = {
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
  enrichment_source: 'manual' as const,
};

const nullableBeer = {
  id: 'golden-nullable',
  brew_name: 'Null Island Lager',
  brewer: 'Schema Brewing',
  enriched_abv: null,
  enrichment_confidence: null,
  enrichment_source: null,
};

const proxyResponse = {
  storeId: '13879',
  beers: [completeBeer, nullableBeer],
  requestId: 'golden-request',
  source: 'live' as const,
  cached_at: '2026-08-27T12:00:00.000Z',
};

describe('mobile enrichment consumer contracts', () => {
  it.each(['description', 'perplexity', 'manual'] as const)(
    'accepts supported enrichment source %s',
    source => {
      expect(
        enrichmentDataSchema.safeParse({
          enriched_abv: 6.5,
          enrichment_confidence: 0.95,
          enrichment_source: source,
          brew_description: 'Citrus & pine.',
          has_cleaned_description: true,
        }).success
      ).toBe(true);
    }
  );

  it('accepts each valid Golden Taproom response shape', () => {
    expect(enrichedBeerResponseSchema.safeParse(completeBeer).success).toBe(true);
    expect(enrichedBeerResponseSchema.safeParse(nullableBeer).success).toBe(true);
    expect(beersProxyResponseSchema.safeParse(proxyResponse).success).toBe(true);
    expect(
      batchEnrichmentResponseSchema.safeParse({
        enrichments: {
          'golden-complete': {
            enriched_abv: 6.5,
            enrichment_confidence: 0.95,
            enrichment_source: 'manual',
            brew_description: 'Citrus & pine — “fresh”.',
            has_cleaned_description: false,
          },
          'golden-nullable': {
            enriched_abv: null,
            enrichment_confidence: null,
            enrichment_source: null,
            brew_description: null,
            has_cleaned_description: false,
          },
        },
        missing: [],
        requestId: 'golden-request',
      }).success
    ).toBe(true);
    expect(
      syncBeersResponseSchema.safeParse({
        synced: 2,
        queued_for_cleanup: 1,
        requestId: 'golden-request',
      }).success
    ).toBe(true);
    expect(
      healthResponseSchema.safeParse({
        status: 'ok',
        database: 'connected',
        enrichment: {
          enabled: true,
          daily: { used: 1, limit: 100, remaining: 99 },
          monthly: { used: 2, limit: 1000, remaining: 998 },
        },
      }).success
    ).toBe(true);
  });

  it('accepts additive server keys', () => {
    expect(
      beersProxyResponseSchema.safeParse({
        ...proxyResponse,
        future_server_metadata: { generation: 2 },
      }).success
    ).toBe(true);
  });

  it('rejects missing required keys', () => {
    const missingName = {
      ...proxyResponse,
      beers: [{ ...completeBeer, brew_name: undefined }, nullableBeer],
    };
    expect(beersProxyResponseSchema.safeParse(missingName).success).toBe(false);
  });

  it('rejects numeric strings for numeric enrichment fields', () => {
    expect(
      beersProxyResponseSchema.safeParse({
        ...proxyResponse,
        beers: [{ ...completeBeer, enriched_abv: '6.5' }, nullableBeer],
      }).success
    ).toBe(false);
  });

  it('rejects unknown proxy sources', () => {
    expect(
      beersProxyResponseSchema.safeParse({
        ...proxyResponse,
        source: 'edge-cache-v2',
      }).success
    ).toBe(false);
  });

  it('rejects unknown enrichment sources', () => {
    expect(
      enrichedBeerResponseSchema.safeParse({
        ...completeBeer,
        enrichment_source: 'future-ai',
      }).success
    ).toBe(false);
  });

  it('accepts null only for documented nullable enrichment fields', () => {
    expect(enrichedBeerResponseSchema.safeParse(nullableBeer).success).toBe(true);
    expect(enrichedBeerResponseSchema.safeParse({ ...completeBeer, brew_name: null }).success).toBe(
      false
    );
    expect(
      enrichmentDataSchema.safeParse({
        enriched_abv: null,
        enrichment_confidence: null,
        enrichment_source: null,
        brew_description: null,
        has_cleaned_description: false,
      }).success
    ).toBe(true);
  });

  it('accepts a sync request with 50 beers and rejects 51', () => {
    const beer = { id: 'golden-id', brew_name: 'Golden Beer' };
    expect(
      syncBeersRequestSchema.safeParse({ beers: Array.from({ length: 50 }, () => beer) }).success
    ).toBe(true);
    expect(
      syncBeersRequestSchema.safeParse({ beers: Array.from({ length: 51 }, () => beer) }).success
    ).toBe(false);
  });

  it('rejects sync beers with empty id or brew name', () => {
    expect(
      syncBeersRequestSchema.safeParse({ beers: [{ id: '', brew_name: 'Beer' }] }).success
    ).toBe(false);
    expect(
      syncBeersRequestSchema.safeParse({ beers: [{ id: 'golden-id', brew_name: '' }] }).success
    ).toBe(false);
  });
});
