import { getPreference, setPreference, populateBeersTable, populateMyBeersTable } from '../database/db';
import { Beer, Beerfinder } from '../types/beer';

/**
 * Fetch and update all beers data
 * @returns true if data was updated, false otherwise
 */
export async function fetchAndUpdateAllBeers(): Promise<boolean> {
  try {
    // Get the API URL from preferences
    const apiUrl = await getPreference('all_beers_api_url');
    if (!apiUrl) {
      console.error('All beers API URL not set');
      return false;
    }

    // Make the request
    console.log('Fetching all beers data...');
    const response = await fetch(apiUrl);

    // If the response is not OK, something went wrong
    if (!response.ok) {
      console.error(`Failed to fetch all beers data: ${response.status} ${response.statusText}`);
      return false;
    }

    // Parse the response
    const data = await response.json();

    // Validate the data
    if (!Array.isArray(data)) {
      console.error('Invalid all beers data format: not an array');
      return false;
    }

    // Update the database
    await populateBeersTable(data as Beer[]);

    // Update the last update timestamp
    await setPreference('all_beers_last_update', new Date().toISOString());
    await setPreference('all_beers_last_check', new Date().toISOString());

    console.log(`Updated all beers data with ${data.length} beers`);
    return true;
  } catch (error) {
    console.error('Error updating all beers data:', error);
    return false;
  }
}

/**
 * Fetch and update my beers data
 * @returns true if data was updated, false otherwise
 */
export async function fetchAndUpdateMyBeers(): Promise<boolean> {
  try {
    // Get the API URL from preferences
    const apiUrl = await getPreference('my_beers_api_url');
    if (!apiUrl) {
      console.error('My beers API URL not set');
      return false;
    }

    // Make the request
    console.log('Fetching my beers data...');
    const response = await fetch(apiUrl);

    // If the response is not OK, something went wrong
    if (!response.ok) {
      console.error(`Failed to fetch my beers data: ${response.status} ${response.statusText}`);
      return false;
    }

    // Parse the response
    const data = await response.json();

    // Validate the data
    if (!Array.isArray(data)) {
      console.error('Invalid my beers data format: not an array');
      return false;
    }

    // Update the database
    await populateMyBeersTable(data as Beerfinder[]);

    // Update the last update timestamp
    await setPreference('my_beers_last_update', new Date().toISOString());
    await setPreference('my_beers_last_check', new Date().toISOString());

    console.log(`Updated my beers data with ${data.length} beers`);
    return true;
  } catch (error) {
    console.error('Error updating my beers data:', error);
    return false;
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
 * Perform a manual refresh of all beer data
 * @returns Object with update status for both data types
 */
export async function manualRefreshAllData(): Promise<{
  allBeersUpdated: boolean;
  myBeersUpdated: boolean;
}> {
  // Fetch and update both data sources
  const allBeersUpdated = await fetchAndUpdateAllBeers();
  const myBeersUpdated = await fetchAndUpdateMyBeers();

  return { allBeersUpdated, myBeersUpdated };
}

/**
 * Check and refresh data on app open if needed
 * @param minIntervalHours Minimum hours between checks (default: 12)
 */
export async function checkAndRefreshOnAppOpen(minIntervalHours: number = 12): Promise<boolean> {
  try {
    const shouldRefreshAllBeers = await shouldRefreshData('all_beers_last_check', minIntervalHours);
    const shouldRefreshMyBeers = await shouldRefreshData('my_beers_last_check', minIntervalHours);

    let updated = false;

    if (shouldRefreshAllBeers) {
      console.log(`More than ${minIntervalHours} hours since last all beers check, refreshing data`);
      const allBeersUpdated = await fetchAndUpdateAllBeers();
      updated = updated || allBeersUpdated;
    } else {
      console.log(`All beers data is less than ${minIntervalHours} hours old, skipping refresh`);
    }

    if (shouldRefreshMyBeers) {
      console.log(`More than ${minIntervalHours} hours since last my beers check, refreshing data`);
      const myBeersUpdated = await fetchAndUpdateMyBeers();
      updated = updated || myBeersUpdated;
    } else {
      console.log(`My beers data is less than ${minIntervalHours} hours old, skipping refresh`);
    }

    return updated;
  } catch (error) {
    console.error('Error checking for refresh on app open:', error);
    return false;
  }
}
