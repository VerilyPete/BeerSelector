import { getContainerType, ContainerType } from '@/src/utils/beerGlassType';
import { Beer, BeerWithContainerType } from '@/src/types/beer';

/**
 * Calculate and assign container type to a beer object
 * Returns new object with container_type property
 */
export function calculateContainerType(beer: Beer): Beer & { container_type: ContainerType } {
  const containerType = getContainerType(
    beer.brew_container,
    beer.brew_description,
    beer.brew_style
  );

  return {
    ...beer,
    container_type: containerType,
  };
}

/**
 * Calculate container types for an array of beers
 * Used in data sync to pre-compute before insertion
 *
 * Returns BeerWithContainerType[] to match repository type signatures
 */
export function calculateContainerTypes(beers: Beer[]): BeerWithContainerType[] {
  return beers.map(beer => ({
    ...beer,
    container_type: getContainerType(beer.brew_container, beer.brew_description, beer.brew_style),
  })) as BeerWithContainerType[];
}
