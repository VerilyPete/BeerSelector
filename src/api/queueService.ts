/**
 * Queue Service
 *
 * This module provides API services for managing the user's beer queue on Flying Saucer.
 * Users can view their queued beers and delete beers from their queue.
 */

import { getSessionData } from './sessionManager';
import { parseQueuedBeersFromHtml, QueuedBeer } from '../utils/htmlParser';
import { ApiError } from '../types/api';

/**
 * Retrieves the user's queued beers from the Flying Saucer API.
 *
 * This function:
 * 1. Validates the user's session data
 * 2. Makes a GET request to memberQueues.php with session cookies
 * 3. Parses the HTML response to extract queued beer information
 * 4. Returns an array of queued beers
 *
 * @returns A promise that resolves to an array of QueuedBeer objects
 * @throws {ApiError} If session data is invalid or missing
 * @throws {Error} If the network request fails
 *
 * @example
 * ```typescript
 * try {
 *   const queues = await getQueuedBeers();
 *   console.log(`Found ${queues.length} beers in queue`);
 * } catch (error) {
 *   console.error('Failed to load queues:', error);
 * }
 * ```
 */
export async function getQueuedBeers(): Promise<QueuedBeer[]> {
  try {
    // Get and validate session data
    const sessionData = await getSessionData();

    if (!sessionData || !sessionData.memberId || !sessionData.storeId || !sessionData.storeName || !sessionData.sessionId) {
      console.log('Session data invalid or missing for queue retrieval');
      throw new ApiError('Your session has expired. Please log in again in the Settings tab.', 401, false, false);
    }

    const { memberId, storeId, storeName, sessionId, username, firstName, lastName, email, cardNum } = sessionData;

    console.log('Making queue API request with session data:', {
      memberId,
      storeId,
      storeName,
      sessionId: sessionId.substring(0, 5) + '...'
    });

    // Prepare headers with session cookies
    const headers = {
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'accept-language': 'en-US,en;q=0.9',
      'cache-control': 'max-age=0',
      'referer': 'https://tapthatapp.beerknurd.com/member-dash.php',
      'Cookie': `store__id=${storeId}; PHPSESSID=${sessionId}; store_name=${encodeURIComponent(storeName)}; member_id=${memberId}; username=${encodeURIComponent(username || '')}; first_name=${encodeURIComponent(firstName || '')}; last_name=${encodeURIComponent(lastName || '')}; email=${encodeURIComponent(email || '')}; cardNum=${cardNum || ''}`
    };

    // Make the API request
    const response = await fetch('https://tapthatapp.beerknurd.com/memberQueues.php', {
      method: 'GET',
      headers: headers
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch queues with status: ${response.status}`);
    }

    // Parse the HTML response
    const html = await response.text();
    const parsedBeers = parseQueuedBeersFromHtml(html);

    console.log(`Successfully retrieved ${parsedBeers.length} queued beers`);
    return parsedBeers;
  } catch (error) {
    // Log the error and re-throw
    console.error('Error fetching queued beers:', error);

    // Preserve ApiError instances
    if (error instanceof ApiError) {
      throw error;
    }

    // Wrap other errors
    throw new Error(error instanceof Error ? error.message : 'Failed to fetch queued beers');
  }
}

/**
 * Deletes a beer from the user's queue on Flying Saucer.
 *
 * This function:
 * 1. Validates the user's session data
 * 2. Makes a GET request to deleteQueuedBrew.php with the beer's cid parameter
 * 3. Returns true if the deletion was successful, false otherwise
 *
 * @param cid - The unique identifier (cid) of the beer to delete
 * @returns A promise that resolves to true if successful, false if failed
 *
 * @example
 * ```typescript
 * const success = await deleteQueuedBeer('1885490');
 * if (success) {
 *   console.log('Beer removed from queue');
 * } else {
 *   console.log('Failed to remove beer');
 * }
 * ```
 */
export async function deleteQueuedBeer(cid: string): Promise<boolean> {
  try {
    // Validate input
    if (!cid) {
      console.error('Cannot delete queued beer: missing cid');
      return false;
    }

    // Get and validate session data
    const sessionData = await getSessionData();

    if (!sessionData || !sessionData.memberId || !sessionData.storeId || !sessionData.storeName || !sessionData.sessionId) {
      console.log('Session data invalid or missing for queue deletion');
      throw new ApiError('Your session has expired. Please log in again in the Settings tab.', 401, false, false);
    }

    const { memberId, storeId, storeName, sessionId, username, firstName, lastName, email, cardNum } = sessionData;

    console.log(`Deleting queued beer ID: ${cid}`);

    // Prepare headers with session cookies
    const headers = {
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'accept-language': 'en-US,en;q=0.9',
      'referer': 'https://tapthatapp.beerknurd.com/memberQueues.php',
      'Cookie': `store__id=${storeId}; PHPSESSID=${sessionId}; store_name=${encodeURIComponent(storeName)}; member_id=${memberId}; username=${encodeURIComponent(username || '')}; first_name=${encodeURIComponent(firstName || '')}; last_name=${encodeURIComponent(lastName || '')}; email=${encodeURIComponent(email || '')}; cardNum=${cardNum || ''}`
    };

    // Make the API request
    const response = await fetch(`https://tapthatapp.beerknurd.com/deleteQueuedBrew.php?cid=${cid}`, {
      method: 'GET',
      headers: headers
    });

    if (!response.ok) {
      console.error(`Failed to delete beer with status: ${response.status}`);
      return false;
    }

    console.log(`Successfully deleted queued beer ID: ${cid}`);
    return true;
  } catch (error) {
    // Log the error and return false
    console.error('Error deleting queued beer:', error);
    return false;
  }
}
