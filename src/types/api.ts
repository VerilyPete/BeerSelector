/**
 * Types related to API interactions in the application
 */

/**
 * API client configuration options
 */
export interface ApiClientOptions {
  baseUrl?: string;
  retries?: number;
  retryDelay?: number;
  timeout?: number;
}

/**
 * Session data interface for user sessions
 */
export interface SessionData {
  memberId: string;
  storeId: string;
  storeName: string;
  sessionId: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  cardNum?: string;
}

/**
 * API response interface for typed API responses
 */
export interface ApiResponse<T> {
  data: T;
  success: boolean;
  error?: string;
  statusCode: number;
}

/**
 * API error class for handling API errors
 */
export class ApiError extends Error {
  statusCode: number;
  isNetworkError: boolean;
  isTimeout: boolean;
  retryable: boolean;

  constructor(message: string, statusCode = 0, isNetworkError = false, isTimeout = false) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.isNetworkError = isNetworkError;
    this.isTimeout = isTimeout;

    // Determine if the error is retryable
    this.retryable = isNetworkError || isTimeout || (
      statusCode >= 500 || // Server errors
      statusCode === 429 || // Rate limiting
      statusCode === 408    // Request timeout
    );
  }
}

/**
 * Login result interface for authentication responses
 */
export interface LoginResult {
  success: boolean;
  error?: string;
  message?: string;
  data?: unknown;
  sessionData?: SessionData;
  statusCode?: number;
  isVisitorMode?: boolean; // Indicates if the user is in visitor mode
}

/**
 * Type guard to check if an object is a SessionData
 * @param obj The object to check
 * @returns True if the object is a SessionData, false otherwise
 */
export function isSessionData(obj: unknown): obj is SessionData {
  if (!obj) return false;
  return typeof obj.memberId === 'string' &&
    typeof obj.storeId === 'string' &&
    typeof obj.storeName === 'string' &&
    typeof obj.sessionId === 'string';
}

/**
 * Type guard to check if an object is an ApiResponse
 * @param obj The object to check
 * @returns True if the object is an ApiResponse, false otherwise
 */
export function isApiResponse<T>(obj: unknown): obj is ApiResponse<T> {
  if (!obj) return false;
  return typeof obj.success === 'boolean' &&
    typeof obj.statusCode === 'number' &&
    'data' in obj;
}

/**
 * Type guard to check if an object is a LoginResult
 * @param obj The object to check
 * @returns True if the object is a LoginResult, false otherwise
 */
export function isLoginResult(obj: unknown): obj is LoginResult {
  if (!obj) return false;
  return typeof obj.success === 'boolean';
}
