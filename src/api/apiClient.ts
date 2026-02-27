import { getCurrentSession } from './sessionValidator';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { ApiClientOptions, SessionData, ApiResponse, ApiError } from '../types/api';
import { config } from '@/src/config';

// Network detection is handled through fetch API error handling
// No external network detection module is used

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
    this.baseUrl = options.baseUrl || config.api.baseUrl;
    this.retries = options.retries || config.network.retries;
    this.retryDelay = options.retryDelay || config.network.retryDelay;
    this.timeout = options.timeout || config.network.timeout;

    // Initialize network status monitoring
    this.initNetworkMonitoring();
  }

  private async initNetworkMonitoring(): Promise<void> {
    // Initialize with default values
    // Network connectivity will be detected through fetch errors
    this.networkStatus = {
      isConnected: true,
      type: 'unknown',
    };

    // Make a lightweight request to check connectivity
    try {
      // Use a simple HEAD request to a reliable endpoint
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

      await fetch(config.api.baseUrl, {
        method: 'HEAD',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // If we get here, we're online
      this.networkStatus.isConnected = true;
    } catch (error) {
      // If fetch fails, we might be offline
      // But don't assume offline just from one failed request
      console.log('Network check request failed, but still assuming online:', error);
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
        this.sessionData = sessionData;
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
    const {
      memberId,
      storeId,
      storeName,
      sessionId,
      username,
      firstName,
      lastName,
      email,
      cardNum,
    } = sessionData;

    // Get the device's native user agent or use a fallback
    const userAgent =
      Platform.OS === 'web'
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
      accept: '*/*',
      'accept-language': 'en-US,en;q=0.9',
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      origin: this.baseUrl,
      referer: config.api.referers.memberDashboard,
      'sec-ch-ua': '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      'user-agent': userAgent,
      'x-requested-with': 'XMLHttpRequest',
      Cookie: cookieParts.join('; '),
    };
  }

  private async fetchWithRetry(
    url: string,
    options: RequestInit,
    retries = this.retries
  ): Promise<Response> {
    // Network connectivity will be detected through fetch errors
    // No pre-check needed

    // Add timeout to fetch request
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const fetchOptions = {
        ...options,
        signal: controller.signal,
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
    } catch (error: unknown) {
      // Clear the timeout to prevent memory leaks
      clearTimeout(timeoutId);

      // Handle different types of errors
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ApiError('Request timed out', 408, false, true);
      }

      // Check if it's a network error
      const isNetworkError =
        error instanceof TypeError &&
        (error.message.includes('Network request failed') ||
          error.message.includes('Failed to fetch'));

      if (isNetworkError) {
        throw new ApiError('Network request failed', 0, true, false);
      }

      // If it's already an ApiError, just rethrow it
      if (error instanceof ApiError) {
        // If we have retries left and the error is retryable, retry
        if (retries > 1 && error.retryable) {
          console.log(
            `Fetch failed (${error.message}), retrying in ${this.retryDelay}ms... (${retries - 1} retries left)`
          );
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
        console.log(
          `Fetch failed (${apiError.message}), retrying in ${this.retryDelay}ms... (${retries - 1} retries left)`
        );
        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        return this.fetchWithRetry(url, options, retries - 1);
      }

      throw apiError;
    }
  }

  public async request<T = unknown>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
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

      // Get response text first to handle empty responses
      const responseText = await response.text();

      // If response is empty, return success with empty object
      if (!responseText || responseText.trim().length === 0) {
        return {
          data: {} as T,
          success: true,
          statusCode: response.status,
        };
      }

      // Try to parse as JSON
      try {
        const data = JSON.parse(responseText);
        return {
          data,
          success: true,
          statusCode: response.status,
        };
      } catch (jsonError) {
        // If JSON parsing fails, return as failure — caller expects T, not raw text
        return {
          data: null,
          success: false,
          error: `Response is not valid JSON: ${responseText.substring(0, 100)}`,
          statusCode: response.status,
        };
      }
    } catch (error) {
      // If it's already an ApiError, just rethrow it with the response structure
      if (error instanceof ApiError) {
        return {
          data: null,
          success: false,
          error: error.message,
          statusCode: error.statusCode,
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
        data: null,
        success: false,
        error: apiError.message,
        statusCode: apiError.statusCode,
      };
    }
  }

  public async post<T = unknown>(
    endpoint: string,
    data: Record<string, unknown>
  ): Promise<ApiResponse<T>> {
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

  public async get<T = unknown>(
    endpoint: string,
    queryParams?: Record<string, unknown>
  ): Promise<ApiResponse<T>> {
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
      // Make a lightweight request to check connectivity
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

      await fetch(config.api.baseUrl, {
        method: 'HEAD',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // If we get here, we're online
      this.networkStatus = {
        isConnected: true,
        type: 'unknown',
      };
      return true;
    } catch (error) {
      // If fetch fails, we're likely offline
      this.networkStatus = {
        isConnected: false,
        type: 'unknown',
      };
      console.log('Network connectivity check failed:', error);
      return false;
    }
  }
}
