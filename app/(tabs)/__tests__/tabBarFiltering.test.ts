import { filterVisibleRoutes } from '../tabBarFiltering';

type Route = { name: string; key: string };

const HOME: Route = { name: 'index', key: 'index-key' };
const BEERS: Route = { name: 'beerlist', key: 'beerlist-key' };
const FINDER: Route = { name: 'mybeers', key: 'mybeers-key' };
const TASTED: Route = { name: 'tastedbrews', key: 'tastedbrews-key' };

const ALL_ROUTES: readonly Route[] = [HOME, BEERS, FINDER, TASTED];

const tabConfigs: Record<string, { memberOnly?: boolean }> = {
  index: {},
  beerlist: {},
  mybeers: { memberOnly: true },
  tastedbrews: { memberOnly: true },
};

function makeDescriptors(routes: readonly Route[], nullRoutes: string[] = []): Record<string, { options: { href?: string | null } }> {
  return Object.fromEntries(
    routes.map((r) => [
      r.key,
      { options: { href: nullRoutes.includes(r.name) ? null : undefined } },
    ])
  );
}

describe('filterVisibleRoutes', () => {
  test('member sees all 4 tabs', () => {
    const descriptors = makeDescriptors(ALL_ROUTES);
    const result = filterVisibleRoutes(ALL_ROUTES, descriptors, false, tabConfigs);
    expect(result.map((r) => r.name)).toEqual(['index', 'beerlist', 'mybeers', 'tastedbrews']);
  });

  test('visitor sees only non-memberOnly tabs (HOME and BEERS)', () => {
    const descriptors = makeDescriptors(ALL_ROUTES);
    const result = filterVisibleRoutes(ALL_ROUTES, descriptors, true, tabConfigs);
    expect(result.map((r) => r.name)).toEqual(['index', 'beerlist']);
  });

  test('non-memberOnly routes always visible regardless of visitor status', () => {
    const descriptors = makeDescriptors(ALL_ROUTES);
    const memberResult = filterVisibleRoutes(ALL_ROUTES, descriptors, false, tabConfigs);
    const visitorResult = filterVisibleRoutes(ALL_ROUTES, descriptors, true, tabConfigs);

    const memberNames = memberResult.map((r) => r.name);
    const visitorNames = visitorResult.map((r) => r.name);

    expect(memberNames).toContain('index');
    expect(memberNames).toContain('beerlist');
    expect(visitorNames).toContain('index');
    expect(visitorNames).toContain('beerlist');
  });

  test('routes with href === null are hidden', () => {
    const descriptors = makeDescriptors(ALL_ROUTES, ['mybeers', 'tastedbrews']);
    const result = filterVisibleRoutes(ALL_ROUTES, descriptors, false, tabConfigs);
    expect(result.map((r) => r.name)).toEqual(['index', 'beerlist']);
  });

  test('routes not in tabConfigs are hidden', () => {
    const unknownRoute: Route = { name: 'unknown', key: 'unknown-key' };
    const routes: readonly Route[] = [HOME, unknownRoute];
    const descriptors = makeDescriptors(routes);
    const result = filterVisibleRoutes(routes, descriptors, false, tabConfigs);
    expect(result.map((r) => r.name)).toEqual(['index']);
  });
});
