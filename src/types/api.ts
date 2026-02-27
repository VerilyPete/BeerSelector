/**
 * Types related to API interactions in the application
 */

/**
 * API client configuration options
 */
export type ApiClientOptions = {
  baseUrl?: string;
  retries?: number;
  retryDelay?: number;
  timeout?: number;
};

/**
 * Session data type for user sessions
 */
export type SessionData = {
  memberId: string;
  storeId: string;
  storeName: string;
  sessionId: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  cardNum?: string;
};

/**
 * API response as a discriminated union.
 * On success, `data` contains the typed payload.
 * On failure, `data` is null and `error` describes the problem.
 */
export type ApiResponse<T> =
  | { success: true; data: T; statusCode: number }
  | { success: false; data: null; error: string; statusCode: number };

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
    this.retryable =
      isNetworkError ||
      isTimeout ||
      statusCode >= 500 || // Server errors
      statusCode === 429 || // Rate limiting
      statusCode === 408; // Request timeout
  }
}

/**
 * Login result as a discriminated union.
 * On success, `sessionData` is guaranteed present.
 * On failure, `error` describes the problem.
 */
export type LoginResult =
  | {
      success: true;
      sessionData: SessionData;
      message?: string;
      data?: unknown;
      statusCode: number;
      isVisitorMode?: boolean;
    }
  | {
      success: false;
      error: string;
      statusCode: number;
    };

/**
 * Logout result — separate from LoginResult since logout
 * has no session data on success.
 */
export type LogoutResult =
  | { success: true; message: string; statusCode: number }
  | { success: false; error: string; statusCode: number };

/**
 * Type guard to check if an object is a SessionData
 * @param obj The object to check
 * @returns True if the object is a SessionData, false otherwise
 */
export function isSessionData(obj: unknown): obj is SessionData {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.memberId === 'string' &&
    typeof o.storeId === 'string' &&
    typeof o.storeName === 'string' &&
    typeof o.sessionId === 'string'
  );
}

