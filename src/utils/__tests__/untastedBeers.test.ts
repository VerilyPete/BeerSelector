import { selectUntastedBeers } from '../untastedBeers';
import type { BeerWithContainerType, BeerfinderWithContainerType } from '@/src/types/beer';

const makeBeer = (id: string): BeerWithContainerType => ({
  id,
  brew_name: `Beer ${id}`,
  container_type: null,
  enrichment_confidence: null,
  enrichment_source: null,
});

const makeTasted = (id: string): BeerfinderWithContainerType => ({
  ...makeBeer(id),
  tasted_date: '2026-01-01',
});

describe('selectUntastedBeers', () => {
  it('keeps beers that are neither tasted nor queued', () => {
    const result = selectUntastedBeers(
      [makeBeer('1'), makeBeer('2'), makeBeer('3')],
      [],
      new Set()
    );

    expect(result.map(beer => beer.id)).toEqual(['1', '2', '3']);
  });

  it('excludes beers the member has already tasted', () => {
    const result = selectUntastedBeers(
      [makeBeer('1'), makeBeer('2'), makeBeer('3')],
      [makeTasted('2')],
      new Set()
    );

    expect(result.map(beer => beer.id)).toEqual(['1', '3']);
  });

  it('excludes beers already in the queue to prevent double check-ins', () => {
    const result = selectUntastedBeers(
      [makeBeer('1'), makeBeer('2'), makeBeer('3')],
      [],
      new Set(['3'])
    );

    expect(result.map(beer => beer.id)).toEqual(['1', '2']);
  });

  it('excludes a beer that is both tasted and queued without duplicating it', () => {
    const result = selectUntastedBeers(
      [makeBeer('1'), makeBeer('2')],
      [makeTasted('2')],
      new Set(['2'])
    );

    expect(result.map(beer => beer.id)).toEqual(['1']);
  });
});
