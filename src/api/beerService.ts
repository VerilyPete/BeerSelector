import * as SecureStore from 'expo-secure-store';
import { getSessionData } from './sessionManager';
import { autoLogin } from './authService';
import { ApiClient } from './apiClient';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { ApiResponse, ApiError, SessionData } from '../types/api';
import { Beer, Beerfinder, CheckInRequestData, CheckInResponse, isBeer, isBeerfinder } from '../types/beer';

const apiClient = ApiClient.getInstance();

/**
 * Checks in a beer by making an API request to tapthatapp.beerknurd.com
 * @param beer The beer to check in
 * @returns A promise that resolves to the response data
 */
export const checkInBeer = async (beer: Beer): Promise<CheckInResponse> => {
  try {
    // Get session data from secure storage
    let sessionData = await getSessionData();

    // If no session data or session is missing required fields, try auto-login
    if (!sessionData || !sessionData.memberId || !sessionData.storeId || !sessionData.storeName || !sessionData.sessionId) {
      console.log('Session data invalid or missing, attempting auto-login');
      const loginResult = await autoLogin();

      if (!loginResult.success) {
        throw new ApiError('No session data found. Please log in again.', 401, false, false);
      }

      // Use the new session data from auto-login
      sessionData = loginResult.sessionData!;
      console.log('Auto-login successful, continuing with check-in');
    }

    // Check if user is in visitor mode
    if (sessionData.memberId === 'visitor') {
      return {
        success: false,
        error: 'Check-in requires UFO Club member login. Please log in via Settings.',
        message: 'Visitor mode does not support check-in'
      };
    }

    // Create the chitCode
    const chitCode = `${beer.id}-${sessionData.storeId}-${sessionData.memberId}`;

    // Prepare the request data
    const requestData: CheckInRequestData = {
      chitCode: chitCode,
      chitBrewId: beer.id,
      chitBrewName: beer.brew_name,
      chitStoreName: sessionData.storeName
    };

    // Use the ApiClient to make the request
    const response = await apiClient.post<Record<string, unknown>>('/addToQueue.php', requestData);

    // If the request was successful but returned no data
    if (response.success && (!response.data || Object.keys(response.data).length === 0)) {
      console.log('Empty response received from server, considering check-in successful');
      return {
        success: true,
        message: 'Check-in processed successfully (empty response)'
      };
    }

    // If the request was successful and returned data
    if (response.success) {
      return {
        success: true,
        message: 'Check-in successful',
        ...response.data
      };
    }

    // If the request failed
    return {
      success: false,
      error: response.error || 'Unknown error occurred during check-in',
      message: 'Check-in failed'
    };
  } catch (error) {
    console.error('Error checking in beer:', error);

    // Format the error response
    if (error instanceof ApiError) {
      return {
        success: false,
        error: error.message,
        message: 'Check-in failed due to API error'
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      message: 'Check-in failed due to unexpected error'
    };
  }
};

/**
 * Get details for a specific beer by ID
 * @param beerId The ID of the beer to get details for
 * @returns A promise that resolves to the beer details
 */
export async function getBeerDetails(beerId: string): Promise<ApiResponse<Beer>> {
  try {
    // Validate input
    if (!beerId) {
      return {
        success: false,
        data: null as unknown as Beer,
        error: 'Beer ID is required',
        statusCode: 400
      };
    }

    // Make the API request
    return await apiClient.get<Beer>(`/beer-details.php?id=${encodeURIComponent(beerId)}`);
  } catch (error) {
    console.error('Error getting beer details:', error);

    // Format the error response
    if (error instanceof ApiError) {
      return {
        success: false,
        data: null as unknown as Beer,
        error: error.message,
        statusCode: error.statusCode
      };
    }

    return {
      success: false,
      data: null as unknown as Beer,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      statusCode: 500
    };
  }
}

/**
 * Search for beers by name, brewer, or style
 * @param query The search query
 * @returns A promise that resolves to the search results
 */
export async function searchBeers(query: string): Promise<ApiResponse<Beer[]>> {
  try {
    // Validate input
    if (!query || query.trim().length === 0) {
      return {
        success: false,
        data: [] as Beer[],
        error: 'Search query is required',
        statusCode: 400
      };
    }

    // Make the API request
    return await apiClient.get<Beer[]>(`/search-beers.php?q=${encodeURIComponent(query)}`);
  } catch (error) {
    console.error('Error searching beers:', error);

    // Format the error response
    if (error instanceof ApiError) {
      return {
        success: false,
        data: [] as Beer[],
        error: error.message,
        statusCode: error.statusCode
      };
    }

    return {
      success: false,
      data: [] as Beer[],
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      statusCode: 500
    };
  }
}

/**
 * Get all beers from the API
 * @returns A promise that resolves to all beers
 */
export async function getAllBeers(): Promise<ApiResponse<Beer[]>> {
  try {
    // Make the API request
    return await apiClient.get<Beer[]>('/get-all-beers.php');
  } catch (error) {
    console.error('Error getting all beers:', error);

    // Format the error response
    if (error instanceof ApiError) {
      return {
        success: false,
        data: [] as Beer[],
        error: error.message,
        statusCode: error.statusCode
      };
    }

    return {
      success: false,
      data: [] as Beer[],
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      statusCode: 500
    };
  }
}

/**
 * Get all Beerfinder beers (tasted beers) from the API
 * @returns A promise that resolves to all Beerfinder beers
 */
export async function getMyBeers(): Promise<ApiResponse<Beerfinder[]>> {
  try {
    // Make the API request
    return await apiClient.get<Beerfinder[]>('/get-my-beers.php');
  } catch (error) {
    console.error('Error getting Beerfinder beers:', error);

    // Format the error response
    if (error instanceof ApiError) {
      return {
        success: false,
        data: [] as Beerfinder[],
        error: error.message,
        statusCode: error.statusCode
      };
    }

    return {
      success: false,
      data: [] as Beerfinder[],
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      statusCode: 500
    };
  }
}