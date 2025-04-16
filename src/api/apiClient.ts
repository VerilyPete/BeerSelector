import { getSessionData } from './sessionManager';
import { getCurrentSession } from './sessionValidator';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { ApiClientOptions, SessionData, ApiResponse, ApiError } from '../types/api';

// Import expo-network with error handling
let Network: any = null;
try {
  Network = require('expo-network');
} catch (error) {
  console.warn('expo-network package not available, network status checks will be disabled');
}

export class ApiClient {
  private static instance: ApiClient;
  private baseUrl: string;
  private retries: number;
  private retryDelay: number;
  private timeout: number;
  private sessionData: SessionData | null = null;
  private sessionPromise: Promise<SessionData> | null = null;
  private networkStatus: { isConnected: boolean; type: string } | null = null;

  private constructor(options: ApiClientOptions = {}) {
    this.baseUrl = options.baseUrl || 'https://tapthatapp.beerknurd.com';
    this.retries = options.retries || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.timeout = options.timeout || 15000; // 15 seconds default timeout

    // Initialize network status monitoring
    this.initNetworkMonitoring();
  }

  private async initNetworkMonitoring(): Promise<void> {
    try {
      // Check if Network is available
      if (Network && Network.getNetworkStateAsync) {
        const networkState = await Network.getNetworkStateAsync();
        this.networkStatus = {
          isConnected: networkState.isConnected,
          type: networkState.type
        };

        // We could add event listeners for network changes here if needed
      } else {
        // If Network is not available, assume we're connected
        this.networkStatus = { isConnected: true, type: 'unknown' };
      }
    } catch (error) {
      console.warn('Failed to initialize network monitoring:', error);
      this.networkStatus = { isConnected: true, type: 'unknown' };
    }
  }

  public static getInstance(options?: ApiClientOptions): ApiClient {
    if (!ApiClient.instance) {
      ApiClient.instance = new ApiClient(options);
    }
    return ApiClient.instance;
  }

  private async getSession(): Promise<SessionData> {
    // If we already have a session promise, return it
    if (this.sessionPromise) {
      return this.sessionPromise;
    }

    // Create a new session promise
    this.sessionPromise = (async () => {
      try {
        const sessionData = await getCurrentSession();
        if (!sessionData) {
          throw new ApiError('No valid session available', 401, false, false);
        }
        this.sessionData = sessionData as SessionData;
        return this.sessionData;
      } catch (error) {
        console.error('Error getting session:', error);
        // Convert to ApiError if it's not already
        if (!(error instanceof ApiError)) {
          throw new ApiError(
            error instanceof Error ? error.message : 'Unknown session error',
            401, // Unauthorized
            false,
            false
          );
        }
        throw error;
      } finally {
        // Clear the promise after a short delay to allow for retries
        setTimeout(() => {
          this.sessionPromise = null;
        }, 1000);
      }
    })();

    return this.sessionPromise;
  }

  private getHeaders(sessionData: SessionData): Record<string, string> {
    const { memberId, storeId, storeName, sessionId, username, firstName, lastName, email, cardNum } = sessionData;

    // Get the device's native user agent or use a fallback
    const userAgent = Platform.OS === 'web'
      ? window.navigator.userAgent
      : `BeerSelector/${Constants.expoConfig?.version || '1.0.0'} (${Platform.OS}; ${Platform.Version})`;

    // Build cookie string with proper encoding and null checks
    const cookieParts = [
      `store__id=${storeId || ''}`,
      `PHPSESSID=${sessionId || ''}`,
      `store_name=${encodeURIComponent(storeName || '')}`,
      `member_id=${memberId || ''}`,
    ];

    // Add optional cookie parts only if they exist
    if (username) cookieParts.push(`username=${encodeURIComponent(username)}`);
    if (firstName) cookieParts.push(`first_name=${encodeURIComponent(firstName)}`);
    if (lastName) cookieParts.push(`last_name=${encodeURIComponent(lastName)}`);
    if (email) cookieParts.push(`email=${encodeURIComponent(email)}`);
    if (cardNum) cookieParts.push(`cardNum=${cardNum}`);

    return {
      'accept': '*/*',
      'accept-language': 'en-US,en;q=0.9',
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'origin': this.baseUrl,
      'referer': `${this.baseUrl}/member-dash.php`,
      'sec-ch-ua': '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      'user-agent': userAgent,
      'x-requested-with': 'XMLHttpRequest',
      'Cookie': cookieParts.join('; ')
    };
  }

  private async fetchWithRetry(url: string, options: RequestInit, retries = this.retries): Promise<Response> {
    // Check network connectivity first if we have network status
    if (this.networkStatus && this.networkStatus.isConnected === false) {
      throw new ApiError('No network connection available', 0, true, false);
    }

    // Add timeout to fetch request
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const fetchOptions = {
        ...options,
        signal: controller.signal
      };

      const response = await fetch(url, fetchOptions);

      if (!response.ok) {
        throw new ApiError(
          `HTTP error! status: ${response.status} ${response.statusText}`,
          response.status,
          false,
          false
        );
      }

      return response;
    } catch (error) {
      // Clear the timeout to prevent memory leaks
      clearTimeout(timeoutId);

      // Handle different types of errors
      if (error.name === 'AbortError') {
        throw new ApiError('Request timed out', 408, false, true);
      }

      // Check if it's a network error
      const isNetworkError = error instanceof TypeError &&
        (error.message.includes('Network request failed') ||
         error.message.includes('Failed to fetch'));

      if (isNetworkError) {
        throw new ApiError('Network request failed', 0, true, false);
      }

      // If it's already an ApiError, just rethrow it
      if (error instanceof ApiError) {
        // If we have retries left and the error is retryable, retry
        if (retries > 1 && error.retryable) {
          console.log(`Fetch failed (${error.message}), retrying in ${this.retryDelay}ms... (${retries-1} retries left)`);
          await new Promise(resolve => setTimeout(resolve, this.retryDelay));
          return this.fetchWithRetry(url, options, retries - 1);
        }
        throw error;
      }

      // For any other error, convert to ApiError and decide whether to retry
      const apiError = new ApiError(
        error instanceof Error ? error.message : 'Unknown fetch error',
        0,
        isNetworkError,
        false
      );

      if (retries > 1 && apiError.retryable) {
        console.log(`Fetch failed (${apiError.message}), retrying in ${this.retryDelay}ms... (${retries-1} retries left)`);
        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        return this.fetchWithRetry(url, options, retries - 1);
      }

      throw apiError;
    }
  }

  public async request<T = any>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    const sessionData = await this.getSession();
    const headers = this.getHeaders(sessionData);

    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;

    const requestOptions: RequestInit = {
      ...options,
      headers: {
        ...headers,
        ...options.headers,
      },
    };

    try {
      const response = await this.fetchWithRetry(url, requestOptions);
      const data = await response.json();

      return {
        data,
        success: true,
        statusCode: response.status
      };
    } catch (error) {
      // If it's already an ApiError, just rethrow it with the response structure
      if (error instanceof ApiError) {
        return {
          data: null as unknown as T,
          success: false,
          error: error.message,
          statusCode: error.statusCode
        };
      }

      // For any other error, convert to ApiError and return response
      const apiError = new ApiError(
        error instanceof Error ? error.message : 'Unknown request error',
        0,
        false,
        false
      );

      return {
        data: null as unknown as T,
        success: false,
        error: apiError.message,
        statusCode: apiError.statusCode
      };
    }
  }

  public async post<T = any>(endpoint: string, data: Record<string, any>): Promise<ApiResponse<T>> {
    const formData = new URLSearchParams();
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && value !== null) {
        formData.append(key, value.toString());
      }
    }

    return this.request<T>(endpoint, {
      method: 'POST',
      body: formData.toString(),
    });
  }

  public async get<T = any>(endpoint: string, queryParams?: Record<string, any>): Promise<ApiResponse<T>> {
    let url = endpoint;

    // Add query parameters if provided
    if (queryParams && Object.keys(queryParams).length > 0) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(queryParams)) {
        if (value !== undefined && value !== null) {
          params.append(key, value.toString());
        }
      }
      url = `${endpoint}?${params.toString()}`;
    }

    return this.request<T>(url, {
      method: 'GET',
    });
  }

  // Check if the device is online
  public async isOnline(): Promise<boolean> {
    try {
      // Check if Network is available
      if (Network && Network.getNetworkStateAsync) {
        // Update network status
        const networkState = await Network.getNetworkStateAsync();
        this.networkStatus = {
          isConnected: networkState.isConnected,
          type: networkState.type
        };
        return this.networkStatus.isConnected;
      } else {
        // If Network is not available, assume we're connected
        return true;
      }
    } catch (error) {
      console.warn('Failed to check network status:', error);
      return true; // Assume online if we can't check
    }
  }
}