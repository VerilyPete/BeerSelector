import { Beer, Beerfinder } from '../database/types';
import { isBeer } from '../types/beer';
import { Reward } from '../types/database';
import { getPreference } from '../database/preferences';
import { config } from '../config';
import { toNonEmpty } from './fetchOutcome';
import type { FetchOutcome, FetchedSource, UnavailableReason } from './fetchOutcome';

/**
 * Helper function to retry fetch operations with exponential backoff
 * @param url - The URL to fetch
 * @param retries - Number of retry attempts (default: 3)
 * @param delay - Initial delay between retries in ms (default from config)
 * @returns Promise with the JSON response
 */
export const fetchWithRetry = async (
  url: string,
  retries = 3,
  delay = config.network.retryDelay
): Promise<unknown> => {
  // The none:// synthesis that used to live here is GONE. It fabricated
  // `[null, { tasted_brew_current_round: [] }]` — a server response that never
  // existed — which every downstream parser then read as a legitimate empty
  // round. Callers now reject none:// URLs before calling, and return
  // `unavailable/not-applicable` instead.

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    if (retries <= 1) {
      throw error;
    }

    console.log(`Fetch failed, retrying in ${delay}ms... (${retries - 1} retries left)`);
    await new Promise(resolve => setTimeout(resolve, delay));
    return fetchWithRetry(url, retries - 1, delay * 1.5);
  }
};

/**
 * Build an `unavailable` outcome.
 *
 * These are the conditions that used to collapse into a bare `[]` — the whole
 * reason a caller could not tell "we never asked" from "the server said none".
 */
const unavailable = <T>(
  code: UnavailableReason['code'],
  detail: string
): FetchedSource<FetchOutcome<T>> => ({ status: 'unavailable', reason: { code, detail } });

/**
 * Classify a parsed array into `data` or `confirmed-empty`.
 *
 * `confirmed-empty` means the server genuinely reported none — the only case in
 * which clearing a local table is correct. Anything that arrived but could not
 * be used is `malformed`, and the caller decides what that means.
 */
const fromArray = <T>(
  items: readonly T[],
  malformedDetail: string
): FetchedSource<FetchOutcome<T>> =>
  fetched(
    toNonEmpty(items) === null
      ? { kind: 'malformed', detail: malformedDetail }
      : { kind: 'data', items: toNonEmpty(items)! }
  );

/**
 * Wrap a payload outcome as a completed request.
 *
 * `etag: null` because only the all-beers proxy path carries ETags, and it
 * handles them separately — these three functions never produce one.
 */
const fetched = <T>(data: FetchOutcome<T>): FetchedSource<FetchOutcome<T>> => ({
  status: 'fetched',
  data,
  etag: null,
});

/**
 * Fetch all beers from the Flying Saucer API
 * @returns Promise with array of Beer objects
 */
export const fetchBeersFromAPI = async (): Promise<FetchedSource<FetchOutcome<Beer>>> => {
  try {
    // Get the API endpoint from preferences
    const apiUrl = await getPreference('all_beers_api_url');

    if (!apiUrl) {
      console.log('All beers API URL not found in preferences');
      return unavailable('not-configured', 'all_beers_api_url is not set');
    }

    console.log('Fetching beers from API URL:', apiUrl);
    const data = await fetchWithRetry(apiUrl);

    // Log the structure to help debug
    console.log('API response type:', typeof data);
    if (typeof data === 'object' && data !== null) {
      console.log('API response keys:', Object.keys(data as object));
    }

    // Handle different response formats based on API endpoint
    // 1. Regular format: Array with brewInStock in second element
    if (data && Array.isArray(data) && data.length >= 2 && data[1] && data[1].brewInStock) {
      console.log(
        `Found regular format with brewInStock array (${data[1].brewInStock.length} beers)`
      );
      return fromArray(data[1].brewInStock, 'brewInStock array contained no usable beers');
    }

    // 2. Visitor API format: may have different structure
    // Check for common beer properties in the response at different levels
    if (data) {
      // Try to find any array that looks like it contains beer objects
      const findBeersArray = (obj: unknown): Beer[] | null => {
        // If we have an array, check if it looks like beers
        if (Array.isArray(obj)) {
          // Check if this looks like an array of beers
          if (
            obj.length > 0 &&
            obj[0] &&
            typeof obj[0] === 'object' &&
            ('brew_name' in obj[0] || 'id' in obj[0] || 'brewer' in obj[0])
          ) {
            console.log(`Found potential beer array with ${obj.length} items`);
            return obj.filter(isBeer);
          }

          // If not, check each element if it's an object that might contain beers
          for (const item of obj) {
            const result = findBeersArray(item);
            if (result) return result;
          }
        }
        // If we have an object, check each property
        else if (typeof obj === 'object' && obj !== null) {
          const objRecord = obj as Record<string, unknown>;
          // Check direct properties first
          for (const key of Object.keys(objRecord)) {
            if (key === 'brewInStock' || key === 'beers' || key === 'beer_list') {
              const value = objRecord[key];
              if (Array.isArray(value)) {
                console.log(`Found beer array at key "${key}" with ${value.length} items`);
                return value.filter(isBeer);
              }
            }

            // Then recursively check nested objects
            const result = findBeersArray(objRecord[key]);
            if (result) return result;
          }
        }

        return null;
      };

      const beersArray = findBeersArray(data);
      if (beersArray && beersArray.length > 0) {
        return fromArray(beersArray, 'discovered beer array contained no usable beers');
      }
    }

    console.error('Could not find beer data in API response');
    throw new Error('Invalid response format from API');
  } catch (error) {
    console.error('Error fetching beers from API:', error);
    throw error;
  }
};

/**
 * Fetch user's tasted beers (My Beers) from the Flying Saucer API
 *
 * Note: The tasted_brew_current_round array can be legitimately empty in two scenarios:
 * 1. New user who hasn't tasted any beers yet
 * 2. Experienced user whose "round" has rolled over after reaching 200 tasted beers
 *
 * Business rules:
 * - Users can only log max 3 beers per day, so round rollover from 197→200 takes minimum 24 hours
 * - This gives users predictable timing and prevents sudden empty states during active sessions
 *
 * Both scenarios should be handled as valid states, not errors.
 *
 * @returns Promise with array of Beerfinder (tasted beer) objects
 */
export const fetchMyBeersFromAPI = async (): Promise<FetchedSource<FetchOutcome<Beerfinder>>> => {
  try {
    // First check if in visitor mode to immediately return empty array
    const isVisitorMode = (await getPreference('is_visitor_mode')) === 'true';
    if (isVisitorMode) {
      console.log('DB: In visitor mode - my beers is not applicable');
      return unavailable('not-applicable', 'visitor mode has no tasted beers');
    }

    // Get the API endpoint from preferences
    const apiUrl = await getPreference('my_beers_api_url');
    console.log('DB: Fetching My Beers from API URL:', apiUrl);

    if (!apiUrl) {
      console.log('DB: My beers API URL not found in preferences');
      return unavailable('not-configured', 'my_beers_api_url is not set');
    }

    // Special handling for none:// protocol to avoid network errors
    if (apiUrl.startsWith('none://')) {
      // Rejected HERE, before any request. fetchWithRetry no longer synthesises
      // a fake empty response for none://, so without this guard the URL would
      // fall through to fetch() and burn three retries with backoff.
      console.log('DB: none:// placeholder in my_beers_api_url - not applicable');
      return unavailable('not-applicable', 'my_beers_api_url is a none:// placeholder');
    }

    console.log('DB: Making API request to fetch My Beers data...');
    const data = await fetchWithRetry(apiUrl);
    console.log('DB: Received response from My Beers API');

    // Log the structure of the response
    if (data) {
      console.log('DB: API response type:', typeof data);
      if (Array.isArray(data)) {
        console.log(`DB: API response is an array with ${data.length} items`);
        for (let i = 0; i < data.length; i++) {
          console.log(`DB: data[${i}] type:`, typeof data[i]);
          if (data[i] && typeof data[i] === 'object') {
            console.log(`DB: data[${i}] keys:`, Object.keys(data[i]));
          }
        }
      } else if (typeof data === 'object') {
        console.log('DB: API response keys:', Object.keys(data));
      }
    } else {
      console.log('DB: API response is null or undefined');
    }

    // Extract the tasted_brew_current_round array from the response
    if (
      data &&
      Array.isArray(data) &&
      data.length >= 2 &&
      data[1] &&
      data[1].tasted_brew_current_round
    ) {
      const beers = data[1].tasted_brew_current_round;
      console.log(`DB: Found tasted_brew_current_round with ${beers.length} beers`);

      // Handle empty array as a valid state (user has no tasted beers or round has rolled over)
      if (beers.length === 0) {
        console.log(
          'DB: Empty tasted beers array - user has no tasted beers in current round (new user or round rollover at 200 beers)'
        );
        // The server genuinely reported none. This is the ONLY case in which
        // clearing the local tasted table is correct.
        return fetched({ kind: 'confirmed-empty' });
      }

      // Validate the beers array - check for missing IDs
      const validBeers = beers.filter(
        (beer: unknown): beer is Beerfinder =>
          typeof beer === 'object' &&
          beer !== null &&
          'id' in beer &&
          beer.id !== null &&
          beer.id !== undefined
      );
      const invalidBeers = beers.filter(
        (beer: unknown) =>
          !beer ||
          typeof beer !== 'object' ||
          !('id' in beer) ||
          beer.id === null ||
          beer.id === undefined
      );

      console.log(
        `DB: Found ${validBeers.length} valid beers with IDs and ${invalidBeers.length} invalid beers without IDs`
      );

      // Log details about invalid beers for debugging
      if (invalidBeers.length > 0) {
        console.log('DB: Invalid beers details:');
        invalidBeers.forEach((beer: unknown, index: number) => {
          console.log(`DB: Invalid beer ${index}:`, JSON.stringify(beer));
        });
      }

      if (validBeers.length > 0) {
        return fromArray(validBeers, 'no tasted beers survived id validation');
      }

      // Rows arrived and none carried an id: MALFORMED, not an empty round.
      // Phase 2 bridged this with a throw because there was no way to say it in
      // the return type; `malformed` is that way, and it lets each caller
      // decide instead of forcing all of them to catch.
      return fetched({
        kind: 'malformed',
        detail: `${invalidBeers.length} rows returned and none carried an id`,
      });
    }

    console.error('DB: Invalid response format from My Beers API');
    throw new Error('Invalid response format from My Beers API');
  } catch (error) {
    console.error('DB: Error fetching My Beers from API:', error);
    throw error;
  }
};

/**
 * Fetch user's rewards from the Flying Saucer API
 * @returns Promise with array of Reward objects
 */
export const fetchRewardsFromAPI = async (): Promise<FetchedSource<FetchOutcome<Reward>>> => {
  try {
    // Check if in visitor mode first
    const isVisitorMode = (await getPreference('is_visitor_mode')) === 'true';
    if (isVisitorMode) {
      console.log('In visitor mode - rewards not applicable');
      return unavailable('not-applicable', 'visitor mode has no rewards');
    }

    // Get the API endpoint from preferences
    const apiUrl = await getPreference('my_beers_api_url');

    if (!apiUrl) {
      console.log('My beers API URL not found in preferences');
      return unavailable('not-configured', 'my_beers_api_url is not set');
    }

    const data = await fetchWithRetry(apiUrl);

    // Extract the reward array from the response
    if (data && Array.isArray(data) && data.length >= 3 && data[2] && data[2].reward) {
      // An empty reward list is a real state — a member with none earned yet —
      // so it is confirmed-empty rather than malformed.
      const rewards = data[2].reward as Reward[];
      return fetched(
        rewards.length === 0
          ? { kind: 'confirmed-empty' }
          : { kind: 'data', items: toNonEmpty(rewards)! }
      );
    }

    throw new Error('Invalid response format from Rewards API');
  } catch (error) {
    console.error('Error fetching Rewards from API:', error);
    throw error;
  }
};
