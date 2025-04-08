import * as SecureStore from 'expo-secure-store';
import { getSessionData, SessionData } from './sessionManager';
import { autoLogin } from './authService';

interface CheckInRequestData {
  chitCode: string;
  chitBrewId: string;
  chitBrewName: string;
  chitStoreName: string;
}

/**
 * Checks in a beer by making an API request to tapthatapp.beerknurd.com
 * @param beer The beer to check in
 * @returns A promise that resolves to the response data
 */
export const checkInBeer = async (beer: { 
  id: string; 
  brew_name: string;
}): Promise<any> => {
  try {
    // Get session data from secure storage
    let sessionData = await getSessionData();
    
    // If no session data or session is missing required fields, try auto-login
    if (!sessionData || !sessionData.memberId || !sessionData.storeId || !sessionData.storeName || !sessionData.sessionId) {
      console.log('Session data invalid or missing, attempting auto-login');
      const loginResult = await autoLogin();
      
      if (!loginResult.success) {
        throw new Error('No session data found. Please log in again.');
      }
      
      // Use the new session data from auto-login
      sessionData = loginResult.sessionData!;
      console.log('Auto-login successful, continuing with check-in');
    }

    // Extract required data for the request
    const { memberId, storeId, storeName, sessionId, username, firstName, lastName, email, cardNum } = sessionData;
    
    // Create the chitCode
    const chitCode = `${beer.id}-${storeId}-${memberId}`;
    
    // Prepare the request data
    const requestData: CheckInRequestData = {
      chitCode: chitCode,
      chitBrewId: beer.id,
      chitBrewName: beer.brew_name,
      chitStoreName: storeName
    };
    
    // Convert to URL encoded form data
    const formData = Object.entries(requestData)
      .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
      .join('&');
    
    // Set up request headers
    const headers = {
      'accept': '*/*',
      'accept-language': 'en-US,en;q=0.9',
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'origin': 'https://tapthatapp.beerknurd.com',
      'referer': 'https://tapthatapp.beerknurd.com/memberBeerfinder.php',
      'sec-ch-ua': '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
      'x-requested-with': 'XMLHttpRequest',
      'Cookie': `store__id=${storeId}; PHPSESSID=${sessionId}; store_name=${encodeURIComponent(storeName)}; member_id=${memberId}; username=${encodeURIComponent(username || '')}; first_name=${encodeURIComponent(firstName || '')}; last_name=${encodeURIComponent(lastName || '')}; email=${encodeURIComponent(email || '')}; cardNum=${cardNum || ''}`
    };

    // Make the API request
    const response = await fetch('https://tapthatapp.beerknurd.com/addToQueue.php', {
      method: 'POST',
      headers: headers,
      body: formData
    });

    // Check if the response is ok
    if (!response.ok) {
      throw new Error(`Check-in failed with status: ${response.status}`);
    }

    // Get the response text
    const responseText = await response.text();
    
    // Check if the response is empty or too short to be valid JSON
    if (!responseText || responseText.trim().length < 2) {
      // If empty, assume success but return an empty object
      console.log('Empty response received from server, considering check-in successful');
      return { success: true, message: 'Check-in processed successfully (empty response)' };
    }
    
    try {
      // Try to parse the response as JSON
      const jsonResult = JSON.parse(responseText);
      return jsonResult;
    } catch (parseError) {
      // If parsing fails but we got a 200 OK, assume success
      console.log('Invalid JSON response, but got HTTP 200 OK. Response text:', responseText);
      
      // Don't throw the error, just return a success object
      return { 
        success: true, 
        message: 'Check-in processed with non-JSON response', 
        rawResponse: responseText.substring(0, 100) // Include part of the raw response for debugging
      };
    }
  } catch (error) {
    console.error('Error checking in beer:', error);
    throw error;
  }
}; 