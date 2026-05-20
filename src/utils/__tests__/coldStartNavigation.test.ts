import { resolveColdStartRoute } from '../coldStartNavigation';

describe('resolveColdStartRoute', () => {
  describe('when initial route is the tabs group', () => {
    it('routes the direct Live Activity deep link straight to the Beerfinder tab', () => {
      expect(resolveColdStartRoute('(tabs)', 'beerselector://mybeers')).toBe('/(tabs)/mybeers');
    });

    it('still honours the legacy /beerfinder redirect URL from in-flight activities', () => {
      expect(resolveColdStartRoute('(tabs)', 'beerselector://beerfinder')).toBe('/(tabs)/mybeers');
    });

    it('routes to the tabs root when there is no deep link', () => {
      expect(resolveColdStartRoute('(tabs)', null)).toBe('/(tabs)');
    });

    it('routes to the tabs root for an unrelated deep link', () => {
      expect(resolveColdStartRoute('(tabs)', 'beerselector://somewhere-else')).toBe('/(tabs)');
    });
  });

  describe('when initial route is settings (first launch / unconfigured API)', () => {
    it('always honours settings, even if a deep link is pending', () => {
      expect(resolveColdStartRoute('/settings', 'beerselector://beerfinder')).toBe('/settings');
    });

    it('routes to settings when there is no deep link', () => {
      expect(resolveColdStartRoute('/settings', null)).toBe('/settings');
    });
  });
});
