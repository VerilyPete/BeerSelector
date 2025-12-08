import { getContainerType, extractABV, ContainerType } from '@/src/utils/beerGlassType';
import { Beer, BeerWithContainerType } from '@/src/types/beer';

/**
 * Calculate and assign container type and ABV to a beer object
 * Returns new object with container_type and abv properties
 */
export function calculateContainerType(
  beer: Beer
): Beer & { container_type: ContainerType; abv: number | null } {
  // Extract ABV from description
  const abv = extractABV(beer.brew_description);

  // Calculate container type with ABV
  const containerType = getContainerType(
    beer.brew_container,
    beer.brew_description,
    beer.brew_style,
    beer.brew_name,
    abv
  );

  return {
    ...beer,
    container_type: containerType,
    abv: abv,
  };
}

/**
 * Calculate container types and ABV for an array of beers
 * Used in data sync to pre-compute before insertion
 *
 * Returns BeerWithContainerType[] to match repository type signatures
 */
export function calculateContainerTypes(beers: Beer[]): BeerWithContainerType[] {
  return beers.map(beer => {
    // Extract ABV from description
    const abv = extractABV(beer.brew_description);

    // Calculate container type with ABV
    const containerType = getContainerType(
      beer.brew_container,
      beer.brew_description,
      beer.brew_style,
      beer.brew_name,
      abv
    );

    return {
      ...beer,
      container_type: containerType,
      abv: abv,
    };
  }) as BeerWithContainerType[];
}
