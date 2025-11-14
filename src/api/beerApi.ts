import { Beer, Beerfinder } from '../database/types';
import { Reward } from '../types/database';
import { getPreference } from '../database/preferences';

/**
 * Helper function to retry fetch operations with exponential backoff
 * @param url - The URL to fetch
 * @param retries - Number of retry attempts (default: 3)
 * @param delay - Initial delay between retries in ms (default: 1000)
 * @returns Promise with the JSON response
 */
export const fetchWithRetry = async (url: string, retries = 3, delay = 1000): Promise<unknown> => {
  // Special handling for none:// protocol which is used as a placeholder in visitor mode
  if (url.startsWith('none://')) {
    console.log(`Detected none:// protocol URL: ${url}. Returning empty data instead of making network request.`);
    // Return an empty array structure that matches the expected format
    return [null, { tasted_brew_current_round: [] }];
  }

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

    console.log(`Fetch failed, retrying in ${delay}ms... (${retries-1} retries left)`);
    await new Promise(resolve => setTimeout(resolve, delay));
    return fetchWithRetry(url, retries - 1, delay * 1.5);
  }
};

/**
 * Fetch all beers from the Flying Saucer API
 * @returns Promise with array of Beer objects
 */
export const fetchBeersFromAPI = async (): Promise<Beer[]> => {
  try {
    // Get the API endpoint from preferences
    const apiUrl = await getPreference('all_beers_api_url');

    if (!apiUrl) {
      console.log('All beers API URL not found in preferences');
      return []; // Return empty array instead of throwing an error
    }

    console.log('Fetching beers from API URL:', apiUrl);
    const data = await fetchWithRetry(apiUrl);

    // Log the structure to help debug
    console.log('API response type:', typeof data);
    if (typeof data === 'object') {
      console.log('API response keys:', Object.keys(data));
    }

    // Handle different response formats based on API endpoint
    // 1. Regular format: Array with brewInStock in second element
    if (data && Array.isArray(data) && data.length >= 2 && data[1] && data[1].brewInStock) {
      console.log(`Found regular format with brewInStock array (${data[1].brewInStock.length} beers)`);
      return data[1].brewInStock;
    }

    // 2. Visitor API format: may have different structure
    // Check for common beer properties in the response at different levels
    if (data) {
      // Try to find any array that looks like it contains beer objects
      const findBeersArray = (obj: unknown): Beer[] | null => {
        // If we have an array, check if it looks like beers
        if (Array.isArray(obj)) {
          // Check if this looks like an array of beers
          if (obj.length > 0 && obj[0] && typeof obj[0] === 'object' &&
              ('brew_name' in obj[0] || 'id' in obj[0] || 'brewer' in obj[0])) {
            console.log(`Found potential beer array with ${obj.length} items`);
            return obj as Beer[];
          }

          // If not, check each element if it's an object that might contain beers
          for (const item of obj) {
            const result = findBeersArray(item);
            if (result) return result;
          }
        }
        // If we have an object, check each property
        else if (typeof obj === 'object' && obj !== null) {
          // Check direct properties first
          for (const key of Object.keys(obj)) {
            if (key === 'brewInStock' || key === 'beers' || key === 'beer_list') {
              console.log(`Found beer array at key "${key}" with ${obj[key].length} items`);
              return obj[key] as Beer[];
            }

            // Then recursively check nested objects
            const result = findBeersArray(obj[key]);
            if (result) return result;
          }
        }

        return null;
      };

      const beersArray = findBeersArray(data);
      if (beersArray && beersArray.length > 0) {
        return beersArray;
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
export const fetchMyBeersFromAPI = async (): Promise<Beerfinder[]> => {
  try {
    // First check if in visitor mode to immediately return empty array
    const isVisitorMode = await getPreference('is_visitor_mode') === 'true';
    if (isVisitorMode) {
      console.log('DB: In visitor mode - fetchMyBeersFromAPI returning empty array without making network request');
      return [];
    }

    // Get the API endpoint from preferences
    const apiUrl = await getPreference('my_beers_api_url');
    console.log('DB: Fetching My Beers from API URL:', apiUrl);

    if (!apiUrl) {
      console.log('DB: My beers API URL not found in preferences');
      return []; // Return empty array instead of throwing an error
    }

    // Special handling for none:// protocol to avoid network errors
    if (apiUrl.startsWith('none://')) {
      console.log('DB: Detected none:// protocol in my_beers_api_url, returning empty array');
      return [];
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
    if (data && Array.isArray(data) && data.length >= 2 && data[1] && data[1].tasted_brew_current_round) {
      const beers = data[1].tasted_brew_current_round;
      console.log(`DB: Found tasted_brew_current_round with ${beers.length} beers`);

      // Handle empty array as a valid state (user has no tasted beers or round has rolled over)
      if (beers.length === 0) {
        console.log('DB: Empty tasted beers array - user has no tasted beers in current round (new user or round rollover at 200 beers)');
        return [];
      }

      // Validate the beers array - check for missing IDs
      const validBeers = beers.filter((beer: unknown): beer is Beerfinder =>
        typeof beer === 'object' && beer !== null && 'id' in beer && beer.id !== null && beer.id !== undefined
      );
      const invalidBeers = beers.filter((beer: unknown) =>
        !beer || typeof beer !== 'object' || !('id' in beer) || beer.id === null || beer.id === undefined
      );

      console.log(`DB: Found ${validBeers.length} valid beers with IDs and ${invalidBeers.length} invalid beers without IDs`);

      // Log details about invalid beers for debugging
      if (invalidBeers.length > 0) {
        console.log('DB: Invalid beers details:');
        invalidBeers.forEach((beer: unknown, index: number) => {
          console.log(`DB: Invalid beer ${index}:`, JSON.stringify(beer));
        });
      }

      // Return valid beers (could be empty if all beers are invalid)
      if (validBeers.length > 0) {
        return validBeers;
      } else {
        console.log('DB: No valid beers with IDs found in response, but returning empty array instead of error');
        return [];
      }
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
export const fetchRewardsFromAPI = async (): Promise<Reward[]> => {
  try {
    // Check if in visitor mode first
    const isVisitorMode = await getPreference('is_visitor_mode') === 'true';
    if (isVisitorMode) {
      console.log('In visitor mode - rewards not available, returning empty array');
      return [];
    }

    // Get the API endpoint from preferences
    const apiUrl = await getPreference('my_beers_api_url');

    if (!apiUrl) {
      console.log('My beers API URL not found in preferences');
      return []; // Return empty array instead of throwing an error
    }

    const data = await fetchWithRetry(apiUrl);

    // Extract the reward array from the response
    if (data && Array.isArray(data) && data.length >= 3 && data[2] && data[2].reward) {
      return data[2].reward;
    }

    throw new Error('Invalid response format from Rewards API');
  } catch (error) {
    console.error('Error fetching Rewards from API:', error);
    throw error;
  }
};
