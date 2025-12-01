import { Redirect } from 'expo-router';

/**
 * Deep link redirect route for Live Activity.
 *
 * When user taps the Live Activity, it opens beerselector://beerfinder
 * Expo Router matches this to /beerfinder, which redirects to the actual tab.
 */
export default function BeerfinderRedirect() {
  return <Redirect href="/(tabs)/mybeers" />;
}
