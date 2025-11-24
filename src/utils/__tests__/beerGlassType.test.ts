import { extractABV, getGlassType } from '../beerGlassType';

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

    it('should return null for invalid ABV > 100', () => {
      expect(extractABV('Invalid 150% ABV')).toBeNull();
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
    it('should return pint for draft beer < 7.4% ABV', () => {
      expect(getGlassType('Draft', 'ABV 5.2')).toBe('pint');
      expect(getGlassType('draft', '6.5%')).toBe('pint');
      expect(getGlassType('Draught', 'ABV: 7.3')).toBe('pint');
      expect(getGlassType('Draft', '7.0%')).toBe('pint');
    });

    it('should return tulip for draft beer >= 7.4% ABV', () => {
      expect(getGlassType('Draft', 'ABV 7.4')).toBe('tulip');
      expect(getGlassType('draft', '8.0%')).toBe('tulip');
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
      const description = '<p>Strong pale ale. ABV 7.4</p>';
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
