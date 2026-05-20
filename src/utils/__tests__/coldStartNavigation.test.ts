import { resolveColdStartRoute, deepLinkSegment } from '../coldStartNavigation';

describe('deepLinkSegment', () => {
  it('reads the host segment of a host-style link', () => {
    expect(deepLinkSegment('beerselector://mybeers')).toBe('mybeers');
    expect(deepLinkSegment('beerselector://beerfinder')).toBe('beerfinder');
  });

  it('reads the first path segment of a path-style link', () => {
    expect(deepLinkSegment('beerselector:///mybeers')).toBe('mybeers');
    expect(deepLinkSegment('beerselector:///beerfinder')).toBe('beerfinder');
  });

  it('ignores trailing path, query, and fragment', () => {
    expect(deepLinkSegment('beerselector://mybeers/extra')).toBe('mybeers');
    expect(deepLinkSegment('beerselector://beerfinder?session=abc')).toBe('beerfinder');
    expect(deepLinkSegment('beerselector://mybeers#frag')).toBe('mybeers');
  });

  it('does not let a query parameter leak into the segment', () => {
    expect(deepLinkSegment('beerselector://home?ref=mybeers')).toBe('home');
  });

  it('does not collapse an extended host word to the target', () => {
    expect(deepLinkSegment('beerselector://mybeersplus')).toBe('mybeersplus');
  });

  it('is case-insensitive', () => {
    expect(deepLinkSegment('beerselector://MYBEERS')).toBe('mybeers');
  });

  it('returns an empty string for an empty url', () => {
    expect(deepLinkSegment('')).toBe('');
  });
});

describe('resolveColdStartRoute', () => {
  describe('when the bootstrap chose the tabs group', () => {
    it('routes the direct Live Activity link to the Beerfinder tab', () => {
      expect(resolveColdStartRoute('(tabs)', 'beerselector://mybeers')).toBe('/(tabs)/mybeers');
    });

    it('routes a path-style Live Activity link to the Beerfinder tab', () => {
      expect(resolveColdStartRoute('(tabs)', 'beerselector:///mybeers')).toBe('/(tabs)/mybeers');
    });

    it('honours the legacy /beerfinder link in host and path style', () => {
      expect(resolveColdStartRoute('(tabs)', 'beerselector://beerfinder')).toBe('/(tabs)/mybeers');
      expect(resolveColdStartRoute('(tabs)', 'beerselector:///beerfinder')).toBe('/(tabs)/mybeers');
    });

    it('routes to the tabs root when there is no pending deep link', () => {
      expect(resolveColdStartRoute('(tabs)', null)).toBe('/(tabs)');
    });

    it('defers (returns null) for a pending deep link it does not own, so Expo Router resolves it', () => {
      expect(resolveColdStartRoute('(tabs)', 'beerselector://settings')).toBeNull();
      expect(resolveColdStartRoute('(tabs)', 'beerselector://home?ref=mybeers')).toBeNull();
      expect(resolveColdStartRoute('(tabs)', 'beerselector://mybeersplus')).toBeNull();
    });
  });

  describe('when the bootstrap chose settings (first launch / unconfigured API)', () => {
    it('always honours settings, even with a Live Activity link pending', () => {
      expect(resolveColdStartRoute('/settings', 'beerselector://mybeers')).toBe('/settings');
    });

    it('honours settings over any other pending deep link', () => {
      expect(resolveColdStartRoute('/settings', 'beerselector://home')).toBe('/settings');
    });

    it('routes to settings when there is no deep link', () => {
      expect(resolveColdStartRoute('/settings', null)).toBe('/settings');
    });
  });
});
