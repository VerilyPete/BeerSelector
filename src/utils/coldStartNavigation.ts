import type { Href } from 'expo-router';

/**
 * The initial route the app's bootstrap (`app/_layout.tsx`) has decided on after
 * database setup: either the tabs group or the settings screen (first launch /
 * unconfigured API).
 */
export type InitialRoute = '(tabs)' | '/settings';

/**
 * Resolve the single, deterministic route to navigate to on cold launch.
 *
 * On cold launch the root navigator mounts late (after async DB + network
 * prepare), so we cannot rely on Expo Router's automatic initial-URL resolution
 * or the `app/beerfinder.tsx` redirect — those race with the late mount and can
 * leave an invisible `/beerfinder` screen on top that absorbs all touches.
 * Instead we compute the destination here and perform exactly one navigation.
 *
 * A pending Live Activity deep link takes us straight to the Beerfinder tab,
 * but only when the bootstrap allows the tabs group — first launch /
 * unconfigured API always wins and goes to settings.
 *
 * The widget links directly at the tab (`beerselector://mybeers`); the legacy
 * `beerselector://beerfinder` redirect URL is still honoured for Live Activities
 * created by older builds that remain in flight after an update.
 */
export function resolveColdStartRoute(initialRoute: InitialRoute, deepLinkUrl: string | null): Href {
  if (initialRoute === '/settings') {
    return '/settings';
  }

  if (deepLinkUrl?.includes('mybeers') || deepLinkUrl?.includes('beerfinder')) {
    return '/(tabs)/mybeers';
  }

  return '/(tabs)';
}
