import { getSessionData } from './sessionManager';
import { autoLogin } from './authService';
import { ApiClient } from './apiClient';
import { ApiError } from '../types/api';
import { Beer, CheckInRequestData, CheckInResponse } from '../types/beer';
import { config } from '@/src/config';

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
    if (
      !sessionData ||
      !sessionData.memberId ||
      !sessionData.storeId ||
      !sessionData.storeName ||
      !sessionData.sessionId
    ) {
      console.log('Session data invalid or missing, attempting auto-login');
      const loginResult = await autoLogin();

      if (!loginResult.success) {
        throw new ApiError('No session data found. Please log in again.', 401, false, false);
      }

      // Use the new session data from auto-login
      sessionData = loginResult.sessionData;
      console.log('Auto-login successful, continuing with check-in');
    }

    // Check if user is in visitor mode
    if (sessionData.memberId === 'visitor') {
      return {
        success: false,
        error: 'Check-in requires UFO Club member login. Please log in via Settings.',
        message: 'Visitor mode does not support check-in',
      };
    }

    // Create the chitCode
    const chitCode = `${beer.id}-${sessionData.storeId}-${sessionData.memberId}`;

    // Prepare the request data
    const requestData: CheckInRequestData = {
      chitCode: chitCode,
      chitBrewId: beer.id,
      chitBrewName: beer.brew_name,
      chitStoreName: sessionData.storeName,
    };

    // Use the ApiClient to make the request
    const response = await apiClient.post<Record<string, unknown>>(
      config.api.endpoints.addToQueue,
      { ...requestData }
    );

    // If the request was successful but returned no data
    if (response.success && (!response.data || Object.keys(response.data).length === 0)) {
      console.log('Empty response received from server, considering check-in successful');
      return {
        success: true,
        message: 'Check-in processed successfully (empty response)',
      };
    }

    // If the request was successful and returned data
    if (response.success) {
      return {
        success: true,
        message: 'Check-in successful',
        ...response.data,
      };
    }

    // If the request failed
    return {
      success: false,
      error: response.error || 'Unknown error occurred during check-in',
      message: 'Check-in failed',
    };
  } catch (error) {
    console.error('Error checking in beer:', error);

    // Format the error response
    if (error instanceof ApiError) {
      return {
        success: false,
        error: error.message,
        message: 'Check-in failed due to API error',
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      message: 'Check-in failed due to unexpected error',
    };
  }
};

