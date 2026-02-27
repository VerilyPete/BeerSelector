import { Alert } from 'react-native';

/**
 * Error types for API requests
 */
export enum ApiErrorType {
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  SERVER_ERROR = 'SERVER_ERROR',
  PARSE_ERROR = 'PARSE_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  INFO = 'INFO'
}

/**
 * Error response interface
 */
export type ErrorResponse = {
  type: ApiErrorType;
  message: string;
  statusCode?: number;
  originalError?: unknown;
};

/**
 * Show an error alert to the user
 * @param title Alert title
 * @param message Alert message
 * @param onOk Optional callback for OK button
 */
export function showErrorAlert(title: string, message: string, onOk?: () => void): void {
  Alert.alert(
    title,
    message,
    [{ text: 'OK', onPress: onOk }]
  );
}

/**
 * Show a success alert to the user
 * @param title Alert title
 * @param message Alert message
 * @param onOk Optional callback for OK button
 */
export function showSuccessAlert(title: string, message: string, onOk?: () => void): void {
  Alert.alert(
    title,
    message,
    [{ text: 'OK', onPress: onOk }]
  );
}

/**
 * Show an info alert to the user
 * @param title Alert title
 * @param message Alert message
 * @param onOk Optional callback for OK button
 */
export function showInfoAlert(title: string, message: string, onOk?: () => void): void {
  Alert.alert(
    title,
    message,
    [{ text: 'OK', onPress: onOk }]
  );
}

/**
 * Format an API error for display to the user
 * @param error The error object
 * @returns A user-friendly error message
 */
export function formatApiErrorForUser(error: unknown): string {
  // If it's already a string, just return it
  if (typeof error === 'string') {
    return error;
  }

  // If it's an Error object with a message
  if (error instanceof Error) {
    // Check for network errors
    if (error.message.includes('Network request failed') ||
        error.message.includes('Failed to fetch') ||
        error.message.includes('Network error')) {
      return 'Unable to connect to the server. Please check your internet connection and try again.';
    }

    // Check for timeout errors
    if (error.message.includes('timeout') || error.message.includes('Timed out')) {
      return 'The server is taking too long to respond. Please try again later.';
    }

    // For other errors, return the message
    return error.message;
  }

  // If it's an object with a message property
  if (error && typeof error === 'object' && 'message' in error) {
    return error.message as string;
  }

  // Default message for unknown errors
  return 'An unexpected error occurred. Please try again later.';
}

/**
 * Create a standardized error response object
 * @param error The original error
 * @returns A standardized error response
 */
export function createErrorResponse(error: unknown): ErrorResponse {
  // Default error response
  const errorResponse: ErrorResponse = {
    type: ApiErrorType.UNKNOWN_ERROR,
    message: 'An unknown error occurred',
    originalError: error
  };

  // If it's already an Error object
  if (error instanceof Error) {
    // Check for network errors
    if (error.message.includes('Network request failed') ||
        error.message.includes('Failed to fetch') ||
        error.message.includes('Network error')) {
      errorResponse.type = ApiErrorType.NETWORK_ERROR;
      errorResponse.message = 'Network connection error';
    }
    // Check for timeout errors - also treat as network errors for consolidated messaging
    else if (error.message.includes('timeout') || error.message.includes('Timed out') ||
             error.name === 'AbortError') {
      errorResponse.type = ApiErrorType.NETWORK_ERROR; // Changed from TIMEOUT_ERROR to NETWORK_ERROR
      errorResponse.message = 'Network connection error: request timed out';
    }
    // Check for JSON parse errors
    else if (error instanceof SyntaxError && error.message.includes('JSON')) {
      errorResponse.type = ApiErrorType.PARSE_ERROR;
      errorResponse.message = 'Failed to parse server response';
    }
    else {
      errorResponse.message = error.message;
    }
  }

  // If it has a status code, it might be a server error
  if (error && typeof error === 'object' && 'statusCode' in error) {
    errorResponse.statusCode = error.statusCode as number;

    // Server errors (5xx)
    if (errorResponse.statusCode >= 500) {
      errorResponse.type = ApiErrorType.SERVER_ERROR;
      errorResponse.message = 'Server error';
    }
    // Client errors (4xx)
    else if (errorResponse.statusCode >= 400) {
      errorResponse.type = ApiErrorType.VALIDATION_ERROR;
      errorResponse.message = 'Request error';
    }
  }

  return errorResponse;
}

/**
 * Get a user-friendly message for an API error
 * @param error The error response
 * @returns A user-friendly error message
 */
export function getUserFriendlyErrorMessage(error: ErrorResponse): string {
  switch (error.type) {
    case ApiErrorType.NETWORK_ERROR:
      return 'Unable to connect to the server. Please check your internet connection and try again.';

    case ApiErrorType.TIMEOUT_ERROR:
      return 'The server is taking too long to respond. Please try again later.';

    case ApiErrorType.SERVER_ERROR:
      return 'The server encountered an error. Please try again later.';

    case ApiErrorType.PARSE_ERROR:
      return 'There was a problem processing the server response. Please try again.';

    case ApiErrorType.VALIDATION_ERROR:
      return error.message || 'There was a problem with your request. Please try again.';
      
    case ApiErrorType.INFO:
      return error.message || 'Information notice.';

    case ApiErrorType.UNKNOWN_ERROR:
    default:
      return error.message || 'An unexpected error occurred. Please try again later.';
  }
}
