import { getPreference, setPreference, populateBeersTable, populateMyBeersTable } from '../database/db';
import { Beer, Beerfinder } from '../types/beer';
import { ApiErrorType, ErrorResponse, createErrorResponse } from '../utils/notificationUtils';

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
    await populateBeersTable(allBeers);

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

    // Validate that we have beers with IDs
    const validBeers = myBeers.filter(beer => beer && beer.id);
    console.log(`Found ${validBeers.length} valid beers with IDs out of ${myBeers.length} total beers`);

    if (validBeers.length === 0) {
      console.error('No valid beers with IDs found, aborting database update');
      return {
        success: false,
        dataUpdated: false,
        error: {
          type: ApiErrorType.VALIDATION_ERROR,
          message: 'No valid tasted beers found in server response'
        }
      };
    }

    // Update the database with the valid beers
    await populateMyBeersTable(validBeers);

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
  hasErrors: boolean;
  allNetworkErrors: boolean;
}

/**
 * Perform a manual refresh of all beer data
 * @returns Object with update status and error information for both data types
 */
export async function manualRefreshAllData(): Promise<ManualRefreshResult> {
  // Fetch and update both data sources
  const allBeersResult = await fetchAndUpdateAllBeers();
  const myBeersResult = await fetchAndUpdateMyBeers();

  // Check if either operation had errors
  const hasErrors = !allBeersResult.success || !myBeersResult.success;

  // Check if all errors are network-related
  const allNetworkErrors = (
    // Both endpoints failed
    (!allBeersResult.success && !myBeersResult.success) &&
    // Both failures are network-related
    allBeersResult.error?.type === 'NETWORK_ERROR' &&
    myBeersResult.error?.type === 'NETWORK_ERROR'
  ) || (
    // Only All Beers failed with network error
    (!allBeersResult.success && myBeersResult.success) &&
    allBeersResult.error?.type === 'NETWORK_ERROR'
  ) || (
    // Only My Beers failed with network error
    (allBeersResult.success && !myBeersResult.success) &&
    myBeersResult.error?.type === 'NETWORK_ERROR'
  );

  return {
    allBeersResult,
    myBeersResult,
    hasErrors,
    allNetworkErrors
  };
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
