import type { BeerWithContainerType, BeerfinderWithContainerType } from '@/src/types/beer';

/**
 * Beerfinder set difference: All Beers minus Tasted Beers minus already-queued
 * beers (to prevent double check-ins). See the "200 Beer Challenge" rule in
 * CLAUDE.md — Beerfinder count = All Beers - Tasted Beers.
 *
 * The tasted-id lookup is built once here rather than per beer, so callers can
 * memoize the result on the (stable) source references instead of recomputing
 * an O(allBeers × tastedBeers) scan on every render.
 */
export function selectUntastedBeers(
  allBeers: readonly BeerWithContainerType[],
  tastedBeers: readonly BeerfinderWithContainerType[],
  queuedBeerIds: ReadonlySet<string>
): BeerWithContainerType[] {
  const tastedIds = new Set(tastedBeers.map(beer => beer.id));
  return allBeers.filter(beer => !tastedIds.has(beer.id) && !queuedBeerIds.has(beer.id));
}
