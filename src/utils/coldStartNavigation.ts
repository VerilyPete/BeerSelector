/**
 * The initial route the app's bootstrap (`app/_layout.tsx`) has decided on after
 * database setup: either the tabs group or the settings screen (first launch /
 * unconfigured API).
 */
export type InitialRoute = '(tabs)' | '/settings';

/**
 * Where cold-start navigation should send the user, or `null` to mean "a deep
 * link is pending that we don't own — do not override it; let Expo Router
 * resolve it." Kept as a narrow literal union (not `Href`) so callers stay
 * exhaustive and the `null` defer-path is enforced at compile time.
 */
export type ColdStartTarget = '/(tabs)/mybeers' | '/(tabs)' | '/settings' | null;

/**
 * Scheme-stripped first non-empty segment of a deep link, lower-cased. Handles
 * both host-style (`beerselector://mybeers`) and path-style
 * (`beerselector:///mybeers`) links, and never lets a trailing path, query
 * string, or fragment leak into the result:
 *   "beerselector://mybeers/x?y=1" -> "mybeers"
 *   "beerselector:///mybeers"      -> "mybeers"
 *   "beerselector://home?ref=mybeers" -> "home"
 *
 * String-only on purpose: no `new URL()` (not guaranteed under Hermes without a
 * polyfill) and no expo-linking dependency, so it stays pure and unit-testable.
 */
export function deepLinkSegment(url: string): string {
  const afterScheme = url.split('://')[1] ?? '';
  const [first = ''] = afterScheme.split(/[/?#]/).filter(Boolean);
  return first.toLowerCase();
}

/**
 * Resolve the single, deterministic route to navigate to on cold launch.
 *
 * On cold launch the root navigator mounts late (after async DB + network
 * prepare), so we drive the navigation for the routes we own. A pending Live
 * Activity deep link (`beerselector://mybeers`, or the legacy
 * `beerselector://beerfinder`) goes straight to the Beerfinder tab. First
 * launch / unconfigured API always wins and goes to settings. Any OTHER pending
 * deep link returns `null` so the caller leaves it for Expo Router to resolve,
 * rather than clobbering it to the tabs root.
 */
export function resolveColdStartRoute(
  initialRoute: InitialRoute,
  deepLinkUrl: string | null
): ColdStartTarget {
  if (initialRoute === '/settings') {
    return '/settings';
  }

  if (deepLinkUrl === null) {
    return '/(tabs)';
  }

  const segment = deepLinkSegment(deepLinkUrl);
  if (segment === 'mybeers' || segment === 'beerfinder') {
    return '/(tabs)/mybeers';
  }

  return null;
}
