import { Alert } from 'react-native';
import { DatabaseContentionError } from '../database/errors';
import { HttpError, MalformedResponseError } from '../api/fetchOutcome';

/**
 * Error types for API requests
 */
export enum ApiErrorType {
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  SERVER_ERROR = 'SERVER_ERROR',
  PARSE_ERROR = 'PARSE_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  CONTENTION_ERROR = 'CONTENTION_ERROR',
  MALFORMED_RESPONSE_ERROR = 'MALFORMED_RESPONSE_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  INFO = 'INFO',
}

/**
 * Error response interface
 */
export type ErrorResponse = {
  type: ApiErrorType;
  message: string;
  statusCode?: number;
  originalError?: unknown;
  /**
   * True when the same operation is expected to succeed if retried.
   *
   * Set only for CONTENTION_ERROR. Deliberately NOT set for HTTP 5xx, even
   * though a 5xx is retryable in principle: nothing reads this field yet, and a
   * second setter whose value no code consumes is a claim the codebase does not
   * honour. Wire it into a retry policy first, then set it.
   */
  readonly retryable?: boolean;
};

/**
 * Show an error alert to the user
 * @param title Alert title
 * @param message Alert message
 * @param onOk Optional callback for OK button
 */
export function showErrorAlert(title: string, message: string, onOk?: () => void): void {
  Alert.alert(title, message, [{ text: 'OK', onPress: onOk }]);
}

/**
 * Show a success alert to the user
 * @param title Alert title
 * @param message Alert message
 * @param onOk Optional callback for OK button
 */
export function showSuccessAlert(title: string, message: string, onOk?: () => void): void {
  Alert.alert(title, message, [{ text: 'OK', onPress: onOk }]);
}

/**
 * Show an info alert to the user
 * @param title Alert title
 * @param message Alert message
 * @param onOk Optional callback for OK button
 */
export function showInfoAlert(title: string, message: string, onOk?: () => void): void {
  Alert.alert(title, message, [{ text: 'OK', onPress: onOk }]);
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
    if (
      error.message.includes('Network request failed') ||
      error.message.includes('Failed to fetch') ||
      error.message.includes('Network error')
    ) {
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
/**
 * Carries an already-classified `ErrorResponse` across a `throw`.
 *
 * Some call sites learn the typed failure in one frame and can only report it
 * from an enclosing `catch` several frames up. Throwing a plain
 * `new Error(response.message)` there destroys the classification, and the catch
 * then re-derives it from the string — which is the message-parsing this whole
 * area exists to eliminate. Measured cost of getting this wrong: an offline
 * refresh produced UNKNOWN_ERROR instead of NETWORK_ERROR, which flipped
 * `allNetworkErrors` to false and replaced one clean "check your connection"
 * alert with developer prose.
 *
 * `createErrorResponse` unwraps this back to the original response, so every
 * existing `catch (e) { createErrorResponse(e) }` preserves classification with
 * no change at the catch site.
 */
export class SourceFailureError extends Error {
  constructor(
    readonly response: ErrorResponse,
    context: string
  ) {
    super(`${context}: ${response.message}`);
    this.name = 'SourceFailureError';
    // Required for `instanceof` to survive transpilation of Error subclasses.
    Object.setPrototypeOf(this, SourceFailureError.prototype);
  }
}

export function createErrorResponse(error: unknown): ErrorResponse {
  // Already classified upstream — hand it back untouched. Must precede every
  // rule below, all of which would re-derive a worse answer from the message.
  if (error instanceof SourceFailureError) {
    return error.response;
  }

  // Classified by type, deliberately not by message. A write aborted by
  // database contention is transient, so it must not be reported as the hard
  // failure the UNKNOWN_ERROR default would make of it.
  if (error instanceof DatabaseContentionError) {
    return {
      type: ApiErrorType.CONTENTION_ERROR,
      message: error.message,
      originalError: error,
      retryable: true,
    };
  }

  // The server answered with a non-2xx status. Classified by type for the same
  // reason as the two cases around it: the old thrown message began
  // "Failed to fetch", which the substring rules below read as a network error,
  // so a 500 told the user to check their internet connection and set
  // `allNetworkErrors`.
  //
  // The 4xx/5xx split matches this function's own rule for a plain object
  // carrying `statusCode` (below). Classifying every non-2xx as SERVER_ERROR
  // would tell a user whose request was rejected on its merits that "the server
  // encountered an error", and would contradict that sibling rule.
  if (error instanceof HttpError) {
    const clientFault = error.status >= 400 && error.status < 500;
    return {
      type: clientFault ? ApiErrorType.VALIDATION_ERROR : ApiErrorType.SERVER_ERROR,
      message: error.message,
      statusCode: error.status,
      originalError: error,
    };
  }

  // A body arrived and was unusable. Classified by type so the raw developer
  // message never reaches the user, and deliberately not retryable — the same
  // request returns the same unusable body.
  if (error instanceof MalformedResponseError) {
    return {
      type: ApiErrorType.MALFORMED_RESPONSE_ERROR,
      message: error.message,
      originalError: error,
    };
  }

  // Default error response
  const errorResponse: ErrorResponse = {
    type: ApiErrorType.UNKNOWN_ERROR,
    message: 'An unknown error occurred',
    originalError: error,
  };

  // If it's already an Error object
  if (error instanceof Error) {
    // Check for network errors
    if (
      error.message.includes('Network request failed') ||
      error.message.includes('Failed to fetch') ||
      error.message.includes('Network error')
    ) {
      errorResponse.type = ApiErrorType.NETWORK_ERROR;
      errorResponse.message = 'Network connection error';
    }
    // Check for timeout errors - also treat as network errors for consolidated messaging
    else if (
      error.message.includes('timeout') ||
      error.message.includes('Timed out') ||
      error.name === 'AbortError'
    ) {
      errorResponse.type = ApiErrorType.NETWORK_ERROR; // Changed from TIMEOUT_ERROR to NETWORK_ERROR
      errorResponse.message = 'Network connection error: request timed out';
    }
    // Check for JSON parse errors
    else if (error instanceof SyntaxError && error.message.includes('JSON')) {
      errorResponse.type = ApiErrorType.PARSE_ERROR;
      errorResponse.message = 'Failed to parse server response';
    } else {
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

    case ApiErrorType.MALFORMED_RESPONSE_ERROR:
      // Deliberately ignores error.message, which carries developer prose.
      return 'The server sent data this app could not read. Your existing data has been kept.';

    case ApiErrorType.CONTENTION_ERROR:
      // Deliberately ignores error.message, which carries the raw SQLite text.
      return 'The app was busy updating. Please try again in a moment.';

    case ApiErrorType.VALIDATION_ERROR:
      return error.message || 'There was a problem with your request. Please try again.';

    case ApiErrorType.INFO:
      return error.message || 'Information notice.';

    case ApiErrorType.UNKNOWN_ERROR:
    default:
      return error.message || 'An unexpected error occurred. Please try again later.';
  }
}
