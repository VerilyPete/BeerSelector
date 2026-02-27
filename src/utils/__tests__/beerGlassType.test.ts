import { extractABV, getGlassType, getContainerType } from '../beerGlassType';

// extractABV is deprecated in favor of Worker LLM enrichment.
// It is only used as a transient fallback for container type icon display.
describe('extractABV', () => {
  describe('percentage format patterns', () => {
    it('should extract ABV from "5.2%" format', () => {
      expect(extractABV('A delicious beer with 5.2% alcohol')).toBe(5.2);
    });

    it('should extract ABV from "8%" format (integer)', () => {
      expect(extractABV('Strong beer at 8%')).toBe(8);
    });

    it('should extract ABV from HTML description with percentage', () => {
      expect(extractABV('<p>Great IPA with 6.5% ABV</p>')).toBe(6.5);
    });
  });

  describe('ABV keyword patterns', () => {
    it('should extract ABV from "5.2 ABV" format', () => {
      expect(extractABV('A delicious beer with 5.2 ABV')).toBe(5.2);
    });

    it('should extract ABV from "ABV 5.2" format', () => {
      expect(extractABV('ABV 5.2 imperial stout')).toBe(5.2);
    });

    it('should extract ABV from "ABV: 5.2" format', () => {
      expect(extractABV('Description here. ABV: 5.2')).toBe(5.2);
    });

    it('should extract ABV from "ABV:5.2" format (no space)', () => {
      expect(extractABV('ABV:7.8 strong ale')).toBe(7.8);
    });

    it('should be case insensitive for ABV keyword', () => {
      expect(extractABV('abv 6.2 pale ale')).toBe(6.2);
      expect(extractABV('Abv 6.2 pale ale')).toBe(6.2);
      expect(extractABV('aBv 6.2 pale ale')).toBe(6.2);
    });

    it('should extract ABV from HTML with ABV keyword', () => {
      expect(extractABV('<p>Imperial Stout ABV 10.5</p>')).toBe(10.5);
    });
  });

  describe('edge cases', () => {
    it('should return null for undefined description', () => {
      expect(extractABV(undefined)).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(extractABV('')).toBeNull();
    });

    it('should return null when no ABV found', () => {
      expect(extractABV('Just a plain description')).toBeNull();
    });

    it('should return null for invalid ABV > 30', () => {
      expect(extractABV('Invalid 35% ABV')).toBeNull();
    });

    // Known limitation: the 30% bound means descriptions with a high percentage
    // before a valid ABV (e.g., "100% hops, 6.5% IPA") return null because the
    // regex only matches the first `number%` pattern. This is acceptable — the
    // function is deprecated and only used for transient icon display; Worker LLM
    // provides the correct ABV for persistence.
    it('should return null for description with misleading percentage like "100% Mosaic hops"', () => {
      expect(extractABV('Brewed with 100% Mosaic hops')).toBeNull();
    });

    it('should return null for negative ABV', () => {
      expect(extractABV('Invalid -5% ABV')).toBeNull();
    });

    it('should prefer percentage format over ABV keyword', () => {
      // When both formats exist, percentage should be found first
      expect(extractABV('6.5% alcohol by volume, ABV 7.2')).toBe(6.5);
    });
  });
});

describe('getGlassType', () => {
  describe('container type checks', () => {
    it('should return null for undefined container', () => {
      expect(getGlassType(undefined, 'ABV 5.2')).toBeNull();
    });

    it('should return null for bottled beer', () => {
      expect(getGlassType('Bottled', 'ABV 5.2')).toBeNull();
      expect(getGlassType('bottled', 'ABV 5.2')).toBeNull();
      expect(getGlassType('BOTTLED', 'ABV 5.2')).toBeNull();
    });

    it('should return null for non-draft beer', () => {
      expect(getGlassType('Canned', 'ABV 5.2')).toBeNull();
    });
  });

  describe('container size overrides', () => {
    it('should return tulip for 13oz draft regardless of ABV', () => {
      expect(getGlassType('13oz draft', 'ABV 5.0')).toBe('tulip');
      expect(getGlassType('13oz Draft', 'ABV 6.5')).toBe('tulip');
      expect(getGlassType('13OZ DRAFT', '8.0%')).toBe('tulip');
      expect(getGlassType('13oz draft', 'No ABV in description')).toBe('tulip');
    });

    it('should return tulip for "13 oz draft" (with space) regardless of ABV', () => {
      expect(getGlassType('13 oz draft', 'ABV 5.0')).toBe('tulip');
      expect(getGlassType('13 oz Draft', 'ABV 6.5')).toBe('tulip');
      expect(getGlassType('13 OZ DRAFT', '8.0%')).toBe('tulip');
      expect(getGlassType('13 oz draft', 'No ABV in description')).toBe('tulip');
    });

    it('should return pint for 16oz draft regardless of ABV', () => {
      expect(getGlassType('16oz draft', 'ABV 8.0')).toBe('pint');
      expect(getGlassType('16oz Draft', 'ABV 10.5')).toBe('pint');
      expect(getGlassType('16OZ DRAFT', '12.0%')).toBe('pint');
      expect(getGlassType('16oz draft', 'No ABV in description')).toBe('pint');
    });

    it('should return pint for "16 oz draft" (with space) regardless of ABV', () => {
      expect(getGlassType('16 oz draft', 'ABV 8.0')).toBe('pint');
      expect(getGlassType('16 oz Draft', 'ABV 10.5')).toBe('pint');
      expect(getGlassType('16 OZ DRAFT', '12.0%')).toBe('pint');
      expect(getGlassType('16 oz draft', 'No ABV in description')).toBe('pint');
    });
  });

  describe('draft beer glass selection', () => {
    it('should return pint for draft beer < 8% ABV', () => {
      expect(getGlassType('Draft', 'ABV 5.2')).toBe('pint');
      expect(getGlassType('draft', '6.5%')).toBe('pint');
      expect(getGlassType('Draught', 'ABV: 7.3')).toBe('pint');
      expect(getGlassType('Draft', '7.9%')).toBe('pint');
    });

    it('should return tulip for draft beer >= 8% ABV', () => {
      expect(getGlassType('Draft', 'ABV 8.0')).toBe('tulip');
      expect(getGlassType('draft', '8.5%')).toBe('tulip');
      expect(getGlassType('Draught', 'ABV: 10.5')).toBe('tulip');
      expect(getGlassType('Draft', '18.0%')).toBe('tulip');
      expect(getGlassType('Draft', '25%')).toBe('tulip');
    });

    it('should return null when no ABV found and no style keywords', () => {
      expect(getGlassType('Draft', 'No ABV in description')).toBeNull();
      expect(getGlassType('Draft', 'No ABV in description', 'Pale Ale')).toBeNull();
    });
  });

  describe('beer style keyword fallback', () => {
    it('should return pint for "pilsner" in style when no ABV found', () => {
      expect(getGlassType('Draft', 'No ABV', 'German Pilsner')).toBe('pint');
      expect(getGlassType('Draft', 'No ABV', 'pilsner')).toBe('pint');
      expect(getGlassType('Draft', 'No ABV', 'PILSNER')).toBe('pint');
      expect(getGlassType('Draft', 'No ABV', 'Czech Pilsner')).toBe('pint');
    });

    it('should return pint for "lager" in style when no ABV found', () => {
      expect(getGlassType('Draft', 'No ABV', 'American Lager')).toBe('pint');
      expect(getGlassType('Draft', 'No ABV', 'lager')).toBe('pint');
      expect(getGlassType('Draft', 'No ABV', 'LAGER')).toBe('pint');
      expect(getGlassType('Draft', 'No ABV', 'Vienna Lager')).toBe('pint');
    });

    it('should return tulip for "imperial" in style when no ABV found', () => {
      expect(getGlassType('Draft', 'No ABV', 'Imperial IPA')).toBe('tulip');
      expect(getGlassType('Draft', 'No ABV', 'imperial stout')).toBe('tulip');
      expect(getGlassType('Draft', 'No ABV', 'IMPERIAL PORTER')).toBe('tulip');
    });

    it('should return tulip for "tripel" in style when no ABV found', () => {
      expect(getGlassType('Draft', 'No ABV', 'Belgian Tripel')).toBe('tulip');
      expect(getGlassType('Draft', 'No ABV', 'tripel ale')).toBe('tulip');
      expect(getGlassType('Draft', 'No ABV', 'TRIPEL')).toBe('tulip');
    });

    it('should return tulip for "quad" in style when no ABV found', () => {
      expect(getGlassType('Draft', 'No ABV', 'Belgian Quad')).toBe('tulip');
      expect(getGlassType('Draft', 'No ABV', 'quad ale')).toBe('tulip');
      expect(getGlassType('Draft', 'No ABV', 'Quadrupel')).toBe('tulip');
    });

    it('should return tulip for "barleywine" in style when no ABV found', () => {
      expect(getGlassType('Draft', 'No ABV', 'American Barleywine')).toBe('tulip');
      expect(getGlassType('Draft', 'No ABV', 'barleywine ale')).toBe('tulip');
      expect(getGlassType('Draft', 'No ABV', 'BARLEYWINE')).toBe('tulip');
    });

    it('should prioritize ABV detection over style keywords', () => {
      // Even with "imperial" in style, ABV should take precedence
      expect(getGlassType('Draft', 'ABV 5.0', 'Imperial IPA')).toBe('pint');
      expect(getGlassType('Draft', '6.5%', 'Barleywine')).toBe('pint');
      expect(getGlassType('Draft', 'ABV 8.0', 'Pilsner')).toBe('tulip');
    });

    it('should work for non-draft beers with style keywords', () => {
      // Non-draft beers should return null even with style keywords
      expect(getGlassType('Canned', 'No ABV', 'Imperial Stout')).toBeNull();
      expect(getGlassType('Bottled', 'No ABV', 'Belgian Tripel')).toBeNull();
      expect(getGlassType('Canned', 'No ABV', 'Pilsner')).toBeNull();
    });
  });

  describe('real-world patterns', () => {
    it('should handle typical beer description with ABV keyword below threshold', () => {
      const description = '<p>A hoppy IPA with citrus notes. ABV 6.8</p>';
      expect(getGlassType('Draft', description)).toBe('pint');
    });

    it('should handle typical beer description at threshold', () => {
      const description = '<p>Strong pale ale. ABV 8.0</p>';
      expect(getGlassType('Draft', description)).toBe('tulip');
    });

    it('should handle typical beer description with percentage above threshold', () => {
      const description = '<p>Rich imperial stout, 10.2% alcohol</p>';
      expect(getGlassType('Draft', description)).toBe('tulip');
    });

    it('should be case insensitive for container type', () => {
      expect(getGlassType('DRAFT', 'ABV 5.0')).toBe('pint');
      expect(getGlassType('Draft', 'ABV 5.0')).toBe('pint');
      expect(getGlassType('draft', 'ABV 5.0')).toBe('pint');
    });
  });
});

describe('getContainerType', () => {
  describe('flight detection', () => {
    it('returns flight for "Hop Head Flight" with draught container', () => {
      expect(getContainerType('Draught', undefined, undefined, 'Hop Head Flight')).toBe('flight');
    });

    it('returns flight for "Build Your Flight" with empty container', () => {
      expect(getContainerType('', undefined, undefined, 'Build Your Flight')).toBe('flight');
    });

    it('returns flight when brew_style is "Flight"', () => {
      expect(getContainerType('Draught', undefined, 'Flight', 'Sour Flight')).toBe('flight');
    });

    it('returns flight with null/undefined container', () => {
      expect(getContainerType(undefined, undefined, undefined, 'Texas Flight')).toBe('flight');
    });

    it('returns flight for draft container with "flight" in name', () => {
      expect(getContainerType('Draft', undefined, undefined, 'IPA Flight')).toBe('flight');
    });

    it('returns flight when brew_style is "Flight" (case insensitive)', () => {
      expect(getContainerType('Draft', undefined, 'flight', 'Some Beer')).toBe('flight');
      expect(getContainerType('Draft', undefined, 'FLIGHT', 'Some Beer')).toBe('flight');
    });

    it('returns flight when brew_container is "Flight"', () => {
      expect(getContainerType('Flight', undefined, 'Flight', 'Fall Favorites Flight SL 2025')).toBe(
        'flight'
      );
    });

    it('does NOT return flight for "Nightflight Stout" (no word boundary)', () => {
      expect(getContainerType('Draft', '5.2%', undefined, 'Nightflight Stout')).toBe('pint');
    });

    it('does NOT return flight for "Inflight IPA" (no word boundary)', () => {
      expect(getContainerType('Draft', '6.5%', undefined, 'Inflight IPA')).toBe('pint');
    });

    it('returns can for "Flight Pack" in cans (can takes precedence)', () => {
      expect(getContainerType('Can', undefined, undefined, 'Flight Pack')).toBe('can');
    });

    it('returns bottle for flight beer in bottle (bottle takes precedence)', () => {
      expect(getContainerType('Bottle', undefined, undefined, 'Flight of Fancy')).toBe('bottle');
    });
  });

  describe('can detection', () => {
    it('returns can for canned beer', () => {
      expect(getContainerType('Can', undefined, undefined, 'Test Beer')).toBe('can');
      expect(getContainerType('can', undefined, undefined, 'Test Beer')).toBe('can');
      expect(getContainerType('CAN', undefined, undefined, 'Test Beer')).toBe('can');
    });

    it('returns can for "16oz Can" container', () => {
      expect(getContainerType('16oz Can', '5.5%', undefined, 'Test Lager')).toBe('can');
    });
  });

  describe('bottle detection', () => {
    it('returns bottle for bottled beer', () => {
      expect(getContainerType('Bottle', undefined, undefined, 'Test Beer')).toBe('bottle');
      expect(getContainerType('bottle', undefined, undefined, 'Test Beer')).toBe('bottle');
      expect(getContainerType('Bottled', undefined, undefined, 'Test Beer')).toBe('bottle');
    });

    it('returns bottle for "22oz Bottle" container', () => {
      expect(getContainerType('22oz Bottle', '8.0%', undefined, 'Imperial Stout')).toBe('bottle');
    });
  });

  describe('draft glass selection', () => {
    it('returns pint for draft beer < 8% ABV', () => {
      expect(getContainerType('Draft', '5.2%', undefined, 'Session IPA')).toBe('pint');
      expect(getContainerType('Draught', 'ABV 6.5', undefined, 'Pale Ale')).toBe('pint');
    });

    it('returns tulip for draft beer >= 8% ABV', () => {
      expect(getContainerType('Draft', '8.0%', undefined, 'Double IPA')).toBe('tulip');
      expect(getContainerType('Draught', 'ABV 10.5', undefined, 'Imperial Stout')).toBe('tulip');
    });

    it('returns pint for 16oz draft regardless of ABV', () => {
      expect(getContainerType('16oz Draft', '10.0%', undefined, 'Strong Ale')).toBe('pint');
    });

    it('returns tulip for 13oz draft regardless of ABV', () => {
      expect(getContainerType('13oz Draft', '5.0%', undefined, 'Light Lager')).toBe('tulip');
    });
  });

  describe('null/unknown container', () => {
    it('returns null for unknown container with no flight indicators', () => {
      expect(getContainerType(undefined, '5.2%', undefined, 'Test Beer')).toBeNull();
    });

    it('returns null for non-draft, non-can, non-bottle container', () => {
      expect(getContainerType('Cask', '5.2%', undefined, 'Cask Ale')).toBeNull();
    });
  });

  describe('backward compatibility', () => {
    it('works without brewName parameter', () => {
      expect(getContainerType('Can', undefined)).toBe('can');
      expect(getContainerType('Bottle', undefined)).toBe('bottle');
      expect(getContainerType('Draft', '5.0%')).toBe('pint');
    });
  });
});
