import { calculateContainerTypes } from '../glassTypeCalculator';
import { Beer } from '@/src/types/beer';

function createBeer(overrides: Partial<Beer> = {}): Beer {
  return {
    id: '1',
    brew_name: 'Test Beer',
    brewer: 'Test Brewery',
    brew_style: 'IPA',
    brew_description: 'A test beer',
    brew_container: 'Draft',
    abv: null,
    enrichment_confidence: null,
    enrichment_source: null,
    ...overrides,
  };
}

describe('calculateContainerTypes', () => {
  it('should not persist regex-extracted ABV for any beer in batch', () => {
    const beers = [
      createBeer({
        id: '1',
        abv: null,
        brew_description: 'Brewed with 100% Mosaic hops',
      }),
      createBeer({
        id: '2',
        abv: null,
        brew_description: 'A hoppy 6.5% IPA',
        brew_container: 'Draft',
      }),
    ];

    const results = calculateContainerTypes(beers);

    expect(results[0].abv).toBeNull();
    expect(results[1].abv).toBeNull();
    expect(results[1].container_type).toBe('pint');
  });

  it('should persist Worker-sourced ABV values in batch', () => {
    const beers = [
      createBeer({
        id: '1',
        abv: 8.5,
        brew_container: 'Draft',
      }),
      createBeer({
        id: '2',
        abv: 5.0,
        brew_container: 'Draft',
      }),
    ];

    const results = calculateContainerTypes(beers);

    expect(results[0].container_type).toBe('tulip');
    expect(results[0].abv).toBe(8.5);
    expect(results[1].container_type).toBe('pint');
    expect(results[1].abv).toBe(5.0);
  });
});
