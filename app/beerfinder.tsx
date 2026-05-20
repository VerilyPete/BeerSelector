import { Redirect } from 'expo-router';

/**
 * Legacy deep-link fallback for the Live Activity.
 *
 * The widget now links directly at the Beerfinder tab (beerselector://mybeers),
 * which avoids the cold-launch (tabs) navigator duplication this redirect caused.
 * This route is kept only so Live Activities created by older builds — which
 * still emit beerselector://beerfinder — resolve to the right tab while in flight.
 */
export default function BeerfinderRedirect() {
  return <Redirect href="/(tabs)/mybeers" />;
}
