/**
 * Tests for notificationUtils
 *
 * Tests the exported utility functions for displaying alerts and
 * formatting/classifying API errors.
 */

import { Alert } from 'react-native';
import {
  showErrorAlert,
  showSuccessAlert,
  showInfoAlert,
  formatApiErrorForUser,
  createErrorResponse,
  getUserFriendlyErrorMessage,
  ApiErrorType,
} from '../notificationUtils';
import type { ErrorResponse } from '../notificationUtils';

jest.mock('react-native', () => ({
  Alert: {
    alert: jest.fn(),
  },
}));

describe('notificationUtils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================
  // Alert functions
  // ============================================================

  describe('showErrorAlert', () => {
    it('should call Alert.alert with the given title and message', () => {
      showErrorAlert('Error', 'Something went wrong');

      expect(Alert.alert).toHaveBeenCalledWith('Error', 'Something went wrong', [
        { text: 'OK', onPress: undefined },
      ]);
    });

    it('should pass onOk callback to the OK button', () => {
      const onOk = jest.fn();

      showErrorAlert('Error', 'Something went wrong', onOk);

      expect(Alert.alert).toHaveBeenCalledWith('Error', 'Something went wrong', [
        { text: 'OK', onPress: onOk },
      ]);
    });
  });

  describe('showSuccessAlert', () => {
    it('should call Alert.alert with the given title and message', () => {
      showSuccessAlert('Success', 'Operation completed');

      expect(Alert.alert).toHaveBeenCalledWith('Success', 'Operation completed', [
        { text: 'OK', onPress: undefined },
      ]);
    });

    it('should pass onOk callback to the OK button', () => {
      const onOk = jest.fn();

      showSuccessAlert('Success', 'Beer checked in', onOk);

      expect(Alert.alert).toHaveBeenCalledWith('Success', 'Beer checked in', [
        { text: 'OK', onPress: onOk },
      ]);
    });
  });

  describe('showInfoAlert', () => {
    it('should call Alert.alert with the given title and message', () => {
      showInfoAlert('Info', 'Here is some information');

      expect(Alert.alert).toHaveBeenCalledWith('Info', 'Here is some information', [
        { text: 'OK', onPress: undefined },
      ]);
    });

    it('should pass onOk callback to the OK button', () => {
      const onOk = jest.fn();

      showInfoAlert('Info', 'Note this', onOk);

      expect(Alert.alert).toHaveBeenCalledWith('Info', 'Note this', [
        { text: 'OK', onPress: onOk },
      ]);
    });
  });

  // ============================================================
  // formatApiErrorForUser
  // ============================================================

  describe('formatApiErrorForUser', () => {
    it('should return the string directly when error is a string', () => {
      const result = formatApiErrorForUser('plain error string');

      expect(result).toBe('plain error string');
    });

    it('should return network error message for "Network request failed"', () => {
      const result = formatApiErrorForUser(new Error('Network request failed'));

      expect(result).toBe(
        'Unable to connect to the server. Please check your internet connection and try again.'
      );
    });

    it('should return network error message for "Failed to fetch"', () => {
      const result = formatApiErrorForUser(new Error('Failed to fetch'));

      expect(result).toBe(
        'Unable to connect to the server. Please check your internet connection and try again.'
      );
    });

    it('should return network error message for "Network error"', () => {
      const result = formatApiErrorForUser(new Error('Network error occurred'));

      expect(result).toBe(
        'Unable to connect to the server. Please check your internet connection and try again.'
      );
    });

    it('should return timeout message for errors containing "timeout"', () => {
      const result = formatApiErrorForUser(new Error('Request timeout exceeded'));

      expect(result).toBe('The server is taking too long to respond. Please try again later.');
    });

    it('should return timeout message for errors containing "Timed out"', () => {
      const result = formatApiErrorForUser(new Error('Timed out after 15000ms'));

      expect(result).toBe('The server is taking too long to respond. Please try again later.');
    });

    it('should return the error message for generic Error objects', () => {
      const result = formatApiErrorForUser(new Error('Something specific went wrong'));

      expect(result).toBe('Something specific went wrong');
    });

    it('should return message from objects with a message property', () => {
      const errorLike = { message: 'Error from object' };

      const result = formatApiErrorForUser(errorLike);

      expect(result).toBe('Error from object');
    });

    it('should return default message for null', () => {
      const result = formatApiErrorForUser(null);

      expect(result).toBe('An unexpected error occurred. Please try again later.');
    });

    it('should return default message for undefined', () => {
      const result = formatApiErrorForUser(undefined);

      expect(result).toBe('An unexpected error occurred. Please try again later.');
    });

    it('should return default message for number', () => {
      const result = formatApiErrorForUser(42);

      expect(result).toBe('An unexpected error occurred. Please try again later.');
    });
  });

  // ============================================================
  // createErrorResponse
  // ============================================================

  describe('createErrorResponse', () => {
    it('should classify "Network request failed" as NETWORK_ERROR', () => {
      const result = createErrorResponse(new Error('Network request failed'));

      expect(result.type).toBe(ApiErrorType.NETWORK_ERROR);
      expect(result.message).toBe('Network connection error');
    });

    it('should classify "Failed to fetch" as NETWORK_ERROR', () => {
      const result = createErrorResponse(new Error('Failed to fetch'));

      expect(result.type).toBe(ApiErrorType.NETWORK_ERROR);
    });

    it('should classify "Network error" as NETWORK_ERROR', () => {
      const result = createErrorResponse(new Error('Network error'));

      expect(result.type).toBe(ApiErrorType.NETWORK_ERROR);
    });

    it('should classify timeout errors as NETWORK_ERROR', () => {
      const result = createErrorResponse(new Error('Request timeout'));

      expect(result.type).toBe(ApiErrorType.NETWORK_ERROR);
      expect(result.message).toBe('Network connection error: request timed out');
    });

    it('should classify AbortError as NETWORK_ERROR', () => {
      const error = new Error('The operation was aborted');
      error.name = 'AbortError';

      const result = createErrorResponse(error);

      expect(result.type).toBe(ApiErrorType.NETWORK_ERROR);
    });

    it('should classify SyntaxError with JSON message as PARSE_ERROR', () => {
      const error = new SyntaxError('Unexpected token } in JSON at position 5');

      const result = createErrorResponse(error);

      expect(result.type).toBe(ApiErrorType.PARSE_ERROR);
      expect(result.message).toBe('Failed to parse server response');
    });

    it('should preserve the message for generic Error objects', () => {
      const result = createErrorResponse(new Error('Something unusual'));

      expect(result.type).toBe(ApiErrorType.UNKNOWN_ERROR);
      expect(result.message).toBe('Something unusual');
    });

    it('should classify 5xx status codes as SERVER_ERROR', () => {
      const errorWithStatus = { statusCode: 500 };

      const result = createErrorResponse(errorWithStatus);

      expect(result.type).toBe(ApiErrorType.SERVER_ERROR);
      expect(result.message).toBe('Server error');
      expect(result.statusCode).toBe(500);
    });

    it('should classify 4xx status codes as VALIDATION_ERROR', () => {
      const errorWithStatus = { statusCode: 400 };

      const result = createErrorResponse(errorWithStatus);

      expect(result.type).toBe(ApiErrorType.VALIDATION_ERROR);
      expect(result.message).toBe('Request error');
      expect(result.statusCode).toBe(400);
    });

    it('should preserve the original error on the response', () => {
      const originalError = new Error('Original');

      const result = createErrorResponse(originalError);

      expect(result.originalError).toBe(originalError);
    });

    it('should return UNKNOWN_ERROR for unknown values', () => {
      const result = createErrorResponse(null);

      expect(result.type).toBe(ApiErrorType.UNKNOWN_ERROR);
      expect(result.message).toBe('An unknown error occurred');
    });
  });

  // ============================================================
  // getUserFriendlyErrorMessage
  // ============================================================

  describe('getUserFriendlyErrorMessage', () => {
    const makeError = (type: ApiErrorType, message = ''): ErrorResponse => ({
      type,
      message,
    });

    it('should return connectivity message for NETWORK_ERROR', () => {
      const result = getUserFriendlyErrorMessage(makeError(ApiErrorType.NETWORK_ERROR));

      expect(result).toBe(
        'Unable to connect to the server. Please check your internet connection and try again.'
      );
    });

    it('should return timeout message for TIMEOUT_ERROR', () => {
      const result = getUserFriendlyErrorMessage(makeError(ApiErrorType.TIMEOUT_ERROR));

      expect(result).toBe('The server is taking too long to respond. Please try again later.');
    });

    it('should return server error message for SERVER_ERROR', () => {
      const result = getUserFriendlyErrorMessage(makeError(ApiErrorType.SERVER_ERROR));

      expect(result).toBe('The server encountered an error. Please try again later.');
    });

    it('should return parse error message for PARSE_ERROR', () => {
      const result = getUserFriendlyErrorMessage(makeError(ApiErrorType.PARSE_ERROR));

      expect(result).toBe(
        'There was a problem processing the server response. Please try again.'
      );
    });

    it('should return the custom message for VALIDATION_ERROR when set', () => {
      const result = getUserFriendlyErrorMessage(
        makeError(ApiErrorType.VALIDATION_ERROR, 'Invalid credentials')
      );

      expect(result).toBe('Invalid credentials');
    });

    it('should return default message for VALIDATION_ERROR when message is empty', () => {
      const result = getUserFriendlyErrorMessage(makeError(ApiErrorType.VALIDATION_ERROR));

      expect(result).toBe('There was a problem with your request. Please try again.');
    });

    it('should return the custom message for INFO when set', () => {
      const result = getUserFriendlyErrorMessage(makeError(ApiErrorType.INFO, 'Tap list updated'));

      expect(result).toBe('Tap list updated');
    });

    it('should return default message for INFO when message is empty', () => {
      const result = getUserFriendlyErrorMessage(makeError(ApiErrorType.INFO));

      expect(result).toBe('Information notice.');
    });

    it('should return the custom message for UNKNOWN_ERROR when set', () => {
      const result = getUserFriendlyErrorMessage(
        makeError(ApiErrorType.UNKNOWN_ERROR, 'Something unusual')
      );

      expect(result).toBe('Something unusual');
    });

    it('should return default message for UNKNOWN_ERROR when message is empty', () => {
      const result = getUserFriendlyErrorMessage(makeError(ApiErrorType.UNKNOWN_ERROR));

      expect(result).toBe('An unexpected error occurred. Please try again later.');
    });
  });
});
