import { getPreference, setPreference, areApiUrlsConfigured } from '../database/preferences';
import { fetchBeersFromAPI, fetchMyBeersFromAPI, fetchRewardsFromAPI } from '../api/beerApi';
import { Beer, Beerfinder } from '../types/beer';
import { Reward } from '../types/database';
import { ApiErrorType, ErrorResponse, createErrorResponse } from '../utils/notificationUtils';
import { beerRepository } from '../database/repositories/BeerRepository';
import { myBeersRepository } from '../database/repositories/MyBeersRepository';
import { rewardsRepository } from '../database/repositories/RewardsRepository';

/**
 * Result of a data update operation
 */
export interface DataUpdateResult {
  success: boolean;
  error?: ErrorResponse;
  dataUpdated: boolean;
  itemCount?: number;
}

/**
 * Fetch and update all beers data
 * @returns DataUpdateResult with success status and error information if applicable
 */
export async function fetchAndUpdateAllBeers(): Promise<DataUpdateResult> {
  try {
    // Get the API URL from preferences
    const apiUrl = await getPreference('all_beers_api_url');
    if (!apiUrl) {
      console.error('All beers API URL not set');
      return {
        success: false,
        dataUpdated: false,
        error: {
          type: ApiErrorType.VALIDATION_ERROR,
          message: 'All beers API URL not set. Please log in to configure API URLs.'
        }
      };
    }

    // Make the request
    console.log('Fetching all beers data...');
    let response;
    try {
      // Set a timeout for the fetch request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

      response = await fetch(apiUrl, { signal: controller.signal });
      clearTimeout(timeoutId);
    } catch (fetchError) {
      console.error('Network error fetching all beers data:', fetchError);

      // Check if it's an abort error (timeout) - treat as network error for consolidated messaging
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        return {
          success: false,
          dataUpdated: false,
          error: {
            type: ApiErrorType.NETWORK_ERROR, // Changed from TIMEOUT_ERROR to NETWORK_ERROR
            message: 'Network connection error: request timed out while fetching beer data.',
            originalError: fetchError
          }
        };
      }

      // Handle other network errors
      return {
        success: false,
        dataUpdated: false,
        error: createErrorResponse(fetchError)
      };
    }

    // If the response is not OK, something went wrong
    if (!response.ok) {
      console.error(`Failed to fetch all beers data: ${response.status} ${response.statusText}`);
      return {
        success: false,
        dataUpdated: false,
        error: {
          type: ApiErrorType.SERVER_ERROR,
          message: `Server error: ${response.statusText || 'Unknown error'}`,
          statusCode: response.status
        }
      };
    }

    // Parse the response
    let data;
    try {
      data = await response.json();
    } catch (parseError) {
      console.error('Error parsing all beers data:', parseError);
      return {
        success: false,
        dataUpdated: false,
        error: {
          type: ApiErrorType.PARSE_ERROR,
          message: 'Failed to parse server response',
          originalError: parseError
        }
      };
    }

    // Log the structure of the response for debugging
    console.log('All beers API response structure:', typeof data);
    if (Array.isArray(data)) {
      console.log(`All beers API response is an array with ${data.length} items`);
    }

    // Extract the brewInStock array from the response
    let allBeers: Beer[] = [];
    if (data && Array.isArray(data) && data.length >= 2 && data[1] && data[1].brewInStock) {
      allBeers = data[1].brewInStock;
      console.log(`Found brewInStock with ${allBeers.length} beers`);
    } else {
      console.error('Invalid all beers data format: missing brewInStock');
      return {
        success: false,
        dataUpdated: false,
        error: {
          type: ApiErrorType.VALIDATION_ERROR,
          message: 'Invalid data format received from server: missing beer data'
        }
      };
    }

    // Update the database
    await beerRepository.insertMany(allBeers);

    // Update the last update timestamp
    await setPreference('all_beers_last_update', new Date().toISOString());
    await setPreference('all_beers_last_check', new Date().toISOString());

    console.log(`Updated all beers data with ${allBeers.length} beers`);
    return {
      success: true,
      dataUpdated: true,
      itemCount: allBeers.length
    };
  } catch (error) {
    console.error('Error updating all beers data:', error);
    return {
      success: false,
      dataUpdated: false,
      error: createErrorResponse(error)
    };
  }
}

/**
 * Fetch and update my beers data
 * @returns DataUpdateResult with success status and error information if applicable
 */
export async function fetchAndUpdateMyBeers(): Promise<DataUpdateResult> {
  try {
    // Check if in visitor mode
    const isVisitor = await getPreference('is_visitor_mode') === 'true';
    if (isVisitor) {
      console.log('In visitor mode, my beers functionality not available');
      
      // Update the last check timestamp still to prevent repeated checks
      await setPreference('my_beers_last_check', new Date().toISOString());
      
      return {
        success: true,
        dataUpdated: false,
        error: {
          type: ApiErrorType.INFO,
          message: 'My beers not available in visitor mode.'
        }
      };
    }
    
    // Get the API URL from preferences
    const apiUrl = await getPreference('my_beers_api_url');
    if (!apiUrl) {
      console.error('My beers API URL not set');
      return {
        success: false,
        dataUpdated: false,
        error: {
          type: ApiErrorType.VALIDATION_ERROR,
          message: 'My beers API URL not set. Please log in to configure API URLs.'
        }
      };
    }

    // Make the request
    console.log('Fetching my beers data...');
    let response;
    try {
      // Set a timeout for the fetch request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

      response = await fetch(apiUrl, { signal: controller.signal });
      clearTimeout(timeoutId);
    } catch (fetchError) {
      console.error('Network error fetching my beers data:', fetchError);

      // Check if it's an abort error (timeout) - treat as network error for consolidated messaging
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        return {
          success: false,
          dataUpdated: false,
          error: {
            type: ApiErrorType.NETWORK_ERROR, // Changed from TIMEOUT_ERROR to NETWORK_ERROR
            message: 'Network connection error: request timed out while fetching tasted beer data.',
            originalError: fetchError
          }
        };
      }

      // Handle other network errors
      return {
        success: false,
        dataUpdated: false,
        error: createErrorResponse(fetchError)
      };
    }

    // If the response is not OK, something went wrong
    if (!response.ok) {
      console.error(`Failed to fetch my beers data: ${response.status} ${response.statusText}`);
      return {
        success: false,
        dataUpdated: false,
        error: {
          type: ApiErrorType.SERVER_ERROR,
          message: `Server error: ${response.statusText || 'Unknown error'}`,
          statusCode: response.status
        }
      };
    }

    // Parse the response
    let data;
    try {
      data = await response.json();
    } catch (parseError) {
      console.error('Error parsing my beers data:', parseError);
      return {
        success: false,
        dataUpdated: false,
        error: {
          type: ApiErrorType.PARSE_ERROR,
          message: 'Failed to parse server response',
          originalError: parseError
        }
      };
    }

    // Log the structure of the response for debugging
    console.log('API response structure:', typeof data);
    if (Array.isArray(data)) {
      console.log(`API response is an array with ${data.length} items`);
    }

    // Extract the tasted_brew_current_round array from the response
    let myBeers: Beerfinder[] = [];
    if (data && Array.isArray(data) && data.length >= 2 && data[1] && data[1].tasted_brew_current_round) {
      myBeers = data[1].tasted_brew_current_round;
      console.log(`Found tasted_brew_current_round with ${myBeers.length} beers`);
    } else {
      console.error('Invalid my beers data format: missing tasted_brew_current_round');
      return {
        success: false,
        dataUpdated: false,
        error: {
          type: ApiErrorType.VALIDATION_ERROR,
          message: 'Invalid data format received from server: missing tasted beer data'
        }
      };
    }

    // Handle empty array as a valid state (user has no tasted beers or round has rolled over)
    if (myBeers.length === 0) {
      console.log('Empty tasted beers array - user has no tasted beers in current round (new user or round rollover at 200 beers), clearing database');
      // Clear the database table since there are no beers
      await myBeersRepository.insertMany([]);

      // Update the last update timestamp
      await setPreference('my_beers_last_update', new Date().toISOString());
      await setPreference('my_beers_last_check', new Date().toISOString());

      console.log('Updated my beers data with 0 beers (empty state)');
      return {
        success: true,
        dataUpdated: true,
        itemCount: 0
      };
    }

    // Validate that we have beers with IDs
    const validBeers = myBeers.filter(beer => beer && beer.id);
    console.log(`Found ${validBeers.length} valid beers with IDs out of ${myBeers.length} total beers`);

    if (validBeers.length === 0) {
      console.log('No valid beers with IDs found, but API returned data - clearing database');
      // This means all beers in the response are invalid, so clear the database
      await myBeersRepository.insertMany([]);

      // Update the last update timestamp
      await setPreference('my_beers_last_update', new Date().toISOString());
      await setPreference('my_beers_last_check', new Date().toISOString());

      console.log('Updated my beers data with 0 beers (all invalid)');
      return {
        success: true,
        dataUpdated: true,
        itemCount: 0
      };
    }

    // Update the database with the valid beers
    await myBeersRepository.insertMany(validBeers);

    // Update the last update timestamp
    await setPreference('my_beers_last_update', new Date().toISOString());
    await setPreference('my_beers_last_check', new Date().toISOString());

    console.log(`Updated my beers data with ${validBeers.length} valid beers`);
    return {
      success: true,
      dataUpdated: true,
      itemCount: validBeers.length
    };
  } catch (error) {
    console.error('Error updating my beers data:', error);
    return {
      success: false,
      dataUpdated: false,
      error: createErrorResponse(error)
    };
  }
}

/**
 * Check if data should be refreshed based on time interval
 * @param lastCheckKey Preference key for last check timestamp
 * @param intervalHours Minimum hours between checks (default: 12)
 * @returns true if data should be refreshed, false otherwise
 */
export async function shouldRefreshData(lastCheckKey: string, intervalHours: number = 12): Promise<boolean> {
  try {
    const lastCheck = await getPreference(lastCheckKey);
    if (!lastCheck) {
      return true; // No previous check, should refresh
    }

    const lastCheckDate = new Date(lastCheck);
    const now = new Date();
    const hoursSinceLastCheck = (now.getTime() - lastCheckDate.getTime()) / (1000 * 60 * 60);

    return hoursSinceLastCheck >= intervalHours;
  } catch (error) {
    console.error(`Error checking if data should be refreshed (${lastCheckKey}):`, error);
    return true; // If there's an error, refresh to be safe
  }
}

/**
 * Result of a manual refresh operation
 */
export interface ManualRefreshResult {
  allBeersResult: DataUpdateResult;
  myBeersResult: DataUpdateResult;
  rewardsResult: DataUpdateResult;
  hasErrors: boolean;
  allNetworkErrors: boolean;
}


/**
 * Result of an automatic refresh operation
 */
export interface AutoRefreshResult {
  updated: boolean;
  errors: ErrorResponse[];
}

/**
 * Check and refresh data on app open if needed
 * @param minIntervalHours Minimum hours between checks (default: 12)
 * @returns Object with update status and any errors encountered
 */
// Create a simple wrapper for rewards update
export async function fetchAndUpdateRewards(): Promise<DataUpdateResult> {
  try {
    // Check if in visitor mode
    const isVisitor = await getPreference('is_visitor_mode') === 'true';

    if (isVisitor) {
      console.log('In visitor mode, skipping rewards refresh');
      return { success: true, dataUpdated: false };
    }

    // Fetch and populate rewards if not in visitor mode
    console.log('Refreshing rewards data');
    const rewards = await fetchRewardsFromAPI();
    await rewardsRepository.insertMany(rewards);

    console.log(`Updated rewards data successfully: ${rewards.length} rewards`);
    return {
      success: true,
      dataUpdated: true,
      itemCount: rewards.length
    };
  } catch (error) {
    console.error('Error updating rewards data:', error);
    return {
      success: false,
      dataUpdated: false,
      error: createErrorResponse(error)
    };
  }
}

// Unified manual refresh function that refreshes all data types (all beers, my beers, and rewards)
// Allow tests to override the internal implementations used for refresh
let fetchAllImpl = fetchAndUpdateAllBeers;
let fetchMyImpl = fetchAndUpdateMyBeers;
let fetchRewardsImpl = fetchAndUpdateRewards;

export function __setRefreshImplementations(overrides: {
  fetchAll?: typeof fetchAndUpdateAllBeers;
  fetchMy?: typeof fetchAndUpdateMyBeers;
  fetchRewards?: typeof fetchAndUpdateRewards;
}) {
  if (overrides.fetchAll) fetchAllImpl = overrides.fetchAll;
  if (overrides.fetchMy) fetchMyImpl = overrides.fetchMy;
  if (overrides.fetchRewards) fetchRewardsImpl = overrides.fetchRewards;
}

export async function manualRefreshAllData(): Promise<ManualRefreshResult> {
  console.log('Starting unified manual refresh for all data types...');

  try {
    // Check if API URLs are configured
    const apiUrl = await getPreference('all_beers_api_url');
    const myBeersApiUrl = await getPreference('my_beers_api_url');

    if (!apiUrl && !myBeersApiUrl) {
      console.log('No API URLs configured for manual refresh');
      return {
        allBeersResult: { success: false, dataUpdated: false, error: { type: ApiErrorType.VALIDATION_ERROR, message: 'No API URLs configured' } },
        myBeersResult: { success: false, dataUpdated: false, error: { type: ApiErrorType.VALIDATION_ERROR, message: 'No API URLs configured' } },
        rewardsResult: { success: false, dataUpdated: false, error: { type: ApiErrorType.VALIDATION_ERROR, message: 'No API URLs configured' } },
        hasErrors: true,
        allNetworkErrors: false
      };
    }

    // Force fresh data by clearing relevant timestamps
    console.log('Clearing timestamp checks for manual refresh (all data)');
    await setPreference('all_beers_last_update', '');
    await setPreference('all_beers_last_check', '');
    await setPreference('my_beers_last_update', '');
    await setPreference('my_beers_last_check', '');

    // Refresh all data in parallel for better performance
    const [allBeersResult, myBeersResult, rewardsResult] = await Promise.allSettled([
      apiUrl ? fetchAllImpl() : Promise.resolve({ success: true, dataUpdated: false }),
      myBeersApiUrl ? fetchMyImpl() : Promise.resolve({ success: true, dataUpdated: false }),
      myBeersApiUrl ? fetchRewardsImpl() : Promise.resolve({ success: true, dataUpdated: false })
    ]);

    // Process results
    const processResult = (result: PromiseSettledResult<DataUpdateResult>): DataUpdateResult => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        console.error('Manual refresh promise rejected:', result.reason);
        return {
          success: false,
          dataUpdated: false,
          error: createErrorResponse(result.reason)
        };
      }
    };

    const finalAllBeersResult = processResult(allBeersResult);
    const finalMyBeersResult = processResult(myBeersResult);
    const finalRewardsResult = processResult(rewardsResult);

    // Check if there were any errors
    const hasErrors = !finalAllBeersResult.success || !finalMyBeersResult.success || !finalRewardsResult.success;

    // Check if all errors are network-related
    const allNetworkErrors = hasErrors && [finalAllBeersResult, finalMyBeersResult, finalRewardsResult]
      .filter(result => !result.success && result.error)
      .every(result => result.error!.type === 'NETWORK_ERROR' || result.error!.type === 'TIMEOUT_ERROR');

    console.log('Manual refresh completed:', {
      allBeers: finalAllBeersResult.success,
      myBeers: finalMyBeersResult.success,
      rewards: finalRewardsResult.success,
      hasErrors,
      allNetworkErrors
    });

    return {
      allBeersResult: finalAllBeersResult,
      myBeersResult: finalMyBeersResult,
      rewardsResult: finalRewardsResult,
      hasErrors,
      allNetworkErrors
    };
  } catch (error) {
    console.error('Error in unified manual refresh:', error);
    const errorResponse = createErrorResponse(error);

    return {
      allBeersResult: { success: false, dataUpdated: false, error: errorResponse },
      myBeersResult: { success: false, dataUpdated: false, error: errorResponse },
      rewardsResult: { success: false, dataUpdated: false, error: errorResponse },
      hasErrors: true,
      allNetworkErrors: errorResponse.type === 'NETWORK_ERROR' || errorResponse.type === 'TIMEOUT_ERROR'
    };
  }
}

export async function checkAndRefreshOnAppOpen(minIntervalHours: number = 12): Promise<AutoRefreshResult> {
  try {
    // First check if API URLs are actually configured
    const allBeersApiUrl = await getPreference('all_beers_api_url');
    const myBeersApiUrl = await getPreference('my_beers_api_url');
    const isVisitor = await getPreference('is_visitor_mode') === 'true';
    
    // If URLs are not set yet, skip the refresh entirely without treating it as an error
    if (!allBeersApiUrl && !myBeersApiUrl) {
      console.log('API URLs not configured yet, skipping automatic data refresh');
      return { updated: false, errors: [] };
    }

    const shouldRefreshAllBeers = await shouldRefreshData('all_beers_last_check', minIntervalHours);
    const shouldRefreshMyBeers = await shouldRefreshData('my_beers_last_check', minIntervalHours);

    let updated = false;
    const errors: ErrorResponse[] = [];

    if (shouldRefreshAllBeers && allBeersApiUrl) {
      console.log(`More than ${minIntervalHours} hours since last all beers check, refreshing data`);
      const allBeersResult = await fetchAndUpdateAllBeers();

      updated = updated || allBeersResult.dataUpdated;

      if (!allBeersResult.success && allBeersResult.error) {
        console.error('Error refreshing all beers data:', allBeersResult.error);
        errors.push(allBeersResult.error);
      }
    } else {
      console.log(`All beers data is less than ${minIntervalHours} hours old or API URL not set, skipping refresh`);
    }

    // Only try to refresh my beers if not in visitor mode and the URL is configured
    if (shouldRefreshMyBeers && myBeersApiUrl && !isVisitor) {
      console.log(`More than ${minIntervalHours} hours since last my beers check, refreshing data`);
      const myBeersResult = await fetchAndUpdateMyBeers();

      updated = updated || myBeersResult.dataUpdated;

      if (!myBeersResult.success && myBeersResult.error) {
        console.error('Error refreshing my beers data:', myBeersResult.error);
        errors.push(myBeersResult.error);
      }
    } else {
      if (isVisitor) {
        console.log('In visitor mode, skipping my beers refresh');
      } else {
        console.log(`My beers data is less than ${minIntervalHours} hours old or API URL not set, skipping refresh`);
      }
    }

    if (errors.length > 0) {
      console.error('Errors during automatic data refresh:', errors);
    }

    return { updated, errors };
  } catch (error) {
    console.error('Error checking for refresh on app open:', error);
    const errorResponse = createErrorResponse(error);
    return {
      updated: false,
      errors: [errorResponse]
    };
  }
}

/**
 * Refresh all data from API (all beers, my beers, and rewards)
 *
 * This is the main entry point for fetching fresh data from the Flying Saucer API.
 * It fetches all three data types in parallel for better performance.
 *
 * @returns Object containing arrays of fetched data
 * @throws Error if API URLs are not configured
 */
export const refreshAllDataFromAPI = async (): Promise<{
  allBeers: Beer[];
  myBeers: Beerfinder[];
  rewards: Reward[];
}> => {
  console.log('Refreshing all data from API...');

  // Check that API URLs are configured
  const apiUrlsConfigured = await areApiUrlsConfigured();
  if (!apiUrlsConfigured) {
    throw new Error('API URLs not configured. Please log in to set up API URLs.');
  }

  // Fetch all data in parallel for better performance
  const [allBeers, myBeers, rewards] = await Promise.all([
    // Fetch and populate all beers
    fetchBeersFromAPI().then(async (beers) => {
      await beerRepository.insertMany(beers);
      return beers;
    }),

    // Fetch and populate my beers (tasted beers)
    fetchMyBeersFromAPI().then(async (beers) => {
      await myBeersRepository.insertMany(beers);
      return beers;
    }),

    // Fetch and populate rewards
    fetchRewardsFromAPI().then(async (rewards) => {
      await rewardsRepository.insertMany(rewards);
      return rewards;
    })
  ]);

  console.log(`Refreshed all data: ${allBeers.length} beers, ${myBeers.length} tasted beers, ${rewards.length} rewards`);

  return { allBeers, myBeers, rewards };
};
