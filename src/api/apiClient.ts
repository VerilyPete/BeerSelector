import { getSessionData } from './sessionManager';
import { getCurrentSession } from './sessionValidator';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

interface ApiClientOptions {
  baseUrl?: string;
  retries?: number;
  retryDelay?: number;
}

export class ApiClient {
  private static instance: ApiClient;
  private baseUrl: string;
  private retries: number;
  private retryDelay: number;
  private sessionData: any = null;
  private sessionPromise: Promise<any> | null = null;

  private constructor(options: ApiClientOptions = {}) {
    this.baseUrl = options.baseUrl || 'https://tapthatapp.beerknurd.com';
    this.retries = options.retries || 3;
    this.retryDelay = options.retryDelay || 1000;
  }

  public static getInstance(options?: ApiClientOptions): ApiClient {
    if (!ApiClient.instance) {
      ApiClient.instance = new ApiClient(options);
    }
    return ApiClient.instance;
  }

  private async getSession() {
    // If we already have a session promise, return it
    if (this.sessionPromise) {
      return this.sessionPromise;
    }

    // Create a new session promise
    this.sessionPromise = (async () => {
      try {
        const sessionData = await getCurrentSession();
        if (!sessionData) {
          throw new Error('No valid session available');
        }
        this.sessionData = sessionData;
        return sessionData;
      } catch (error) {
        console.error('Error getting session:', error);
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

  private getHeaders(sessionData: any) {
    const { memberId, storeId, storeName, sessionId, username, firstName, lastName, email, cardNum } = sessionData;
    
    // Get the device's native user agent or use a fallback
    const userAgent = Platform.OS === 'web' 
      ? window.navigator.userAgent 
      : `BeerSelector/${Constants.expoConfig?.version || '1.0.0'} (${Platform.OS}; ${Platform.Version})`;
    
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
      'Cookie': `store__id=${storeId}; PHPSESSID=${sessionId}; store_name=${encodeURIComponent(storeName)}; member_id=${memberId}; username=${encodeURIComponent(username || '')}; first_name=${encodeURIComponent(firstName || '')}; last_name=${encodeURIComponent(lastName || '')}; email=${encodeURIComponent(email || '')}; cardNum=${cardNum || ''}`
    };
  }

  private async fetchWithRetry(url: string, options: RequestInit, retries = this.retries): Promise<Response> {
    try {
      const response = await fetch(url, options);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return response;
    } catch (error) {
      if (retries <= 1) {
        throw error;
      }
      
      console.log(`Fetch failed, retrying in ${this.retryDelay}ms... (${retries-1} retries left)`);
      await new Promise(resolve => setTimeout(resolve, this.retryDelay));
      return this.fetchWithRetry(url, options, retries - 1);
    }
  }

  public async request(endpoint: string, options: RequestInit = {}): Promise<Response> {
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
    
    return this.fetchWithRetry(url, requestOptions);
  }

  public async post(endpoint: string, data: Record<string, any>): Promise<Response> {
    const formData = new URLSearchParams();
    for (const [key, value] of Object.entries(data)) {
      formData.append(key, value.toString());
    }
    
    return this.request(endpoint, {
      method: 'POST',
      body: formData.toString(),
    });
  }

  public async get(endpoint: string): Promise<Response> {
    return this.request(endpoint, {
      method: 'GET',
    });
  }
} 