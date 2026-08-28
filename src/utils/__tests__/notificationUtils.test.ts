import { describe, it, expect, vi } from 'vitest';
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
  isTransportFault,
  ApiErrorType,
} from '../notificationUtils';
import type { ErrorResponse } from '../notificationUtils';
import { DatabaseContentionError } from '../../database/errors';
import { HttpError, TransportAbortedError, UnreadableBodyError } from '../../api/fetchOutcome';

vi.mock('react-native', () => ({
  Alert: {
    alert: vi.fn(),
  },
}));

describe('notificationUtils', () => {
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
      const onOk = vi.fn();

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
      const onOk = vi.fn();

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
      const onOk = vi.fn();

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

    // ----------------------------------------------------------
    // Database contention (plan 02 Phase 0)
    //
    // Exclusive transactions abort a competing writer with
    // `database is locked`. That condition is transient and
    // self-resolving, so it must not be presented as a hard
    // failure. Classification is by type, never by message.
    // ----------------------------------------------------------

    // DELETED with the class. `MalformedResponseError` had exactly one thrower
    // in the repo — the `response.json()` catch in `beerApi` — and that site now
    // throws `UnreadableBodyError`, so the class and its rule are unreachable by
    // construction. The MALFORMED_RESPONSE_ERROR enum member and its copy STAY:
    // shape-rejection still reports through it, via the `ErrorResponse` literals
    // in `dataUpdateService`. The copy fence for it lives in
    // `getUserFriendlyErrorMessage` below and is deliberately untouched.

    it('createErrorResponse classifies a 5xx HttpError as SERVER_ERROR', () => {
      const result = createErrorResponse(new HttpError(500, 'Internal Server Error'));

      expect(result.type).toBe(ApiErrorType.SERVER_ERROR);
      expect(result.statusCode).toBe(500);
    });

    it('createErrorResponse classifies a 4xx HttpError as VALIDATION_ERROR', () => {
      // Matches this same function's rule for a plain object carrying
      // `statusCode` (tested above): 4xx is a client fault, 5xx is a server
      // fault. Classifying every non-2xx as SERVER_ERROR would tell a user whose
      // request was rejected on its merits that "the server encountered an
      // error", and would contradict the sibling rule 60 lines below.
      const result = createErrorResponse(new HttpError(404, 'Not Found'));

      expect(result.type).toBe(ApiErrorType.VALIDATION_ERROR);
      expect(result.statusCode).toBe(404);
    });

    it('createErrorResponse does not read an HttpError by its message', () => {
      // The whole point of the type. A message-classified 500 used to match the
      // 'Failed to fetch' network rule and tell the user to check their
      // connection — the one thing they could do nothing about.
      const result = createErrorResponse(new HttpError(503, 'Service Unavailable'));

      expect(result.type).not.toBe(ApiErrorType.NETWORK_ERROR);
    });

    it('createErrorResponse classifies a DatabaseContentionError as CONTENTION_ERROR', () => {
      const result = createErrorResponse(
        new DatabaseContentionError('allbeers write aborted: database is locked')
      );

      expect(result.type).toBe(ApiErrorType.CONTENTION_ERROR);
    });

    it('createErrorResponse marks a contention error as retryable', () => {
      const result = createErrorResponse(new DatabaseContentionError('write aborted'));

      expect(result.retryable).toBe(true);
    });

    it('createErrorResponse does not classify an arbitrary error mentioning "locked" as contention', () => {
      const result = createErrorResponse(new Error('The account is locked'));

      expect(result.type).toBe(ApiErrorType.UNKNOWN_ERROR);
      expect(result.retryable).toBeUndefined();
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

    it('describes a malformed response without leaking the developer message', () => {
      // Reachable and user-facing: Settings pull-to-refresh -> manualRefreshAllData
      // -> sequentialRefreshAllData -> the malformed branch. Untyped, its raw
      // text lands in the refresh alert as
      // "Beerfinder data: My Beers response contained 2 rows and all lack an id".
      const result = getUserFriendlyErrorMessage(
        makeError(
          ApiErrorType.MALFORMED_RESPONSE_ERROR,
          'My Beers response contained 2 rows and all lack an id'
        )
      );

      expect(result).toBe(
        'The server sent data this app could not read. Your existing data has been kept.'
      );
    });

    it('describes CONTENTION_ERROR as transient without leaking the SQLite message', () => {
      const result = getUserFriendlyErrorMessage(
        makeError(
          ApiErrorType.CONTENTION_ERROR,
          'allbeers write aborted: database is locked by another writer'
        )
      );

      expect(result).toBe('The app was busy updating. Please try again in a moment.');
    });

    it('should return parse error message for PARSE_ERROR', () => {
      const result = getUserFriendlyErrorMessage(makeError(ApiErrorType.PARSE_ERROR));

      expect(result).toBe('There was a problem processing the server response. Please try again.');
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
  describe('isTransportFault', () => {
    // `allNetworkErrors` selects the whole-refresh alert
    // ("Unable to connect… check your internet connection") in place of the
    // per-source list. It was decided TWICE by hand, in string literals, at
    // `dataUpdateService.ts:1760` and again in the `manualRefreshAllData` outer
    // catch — so a newly added transport-flavoured type could not match either
    // site, and the decision to exclude it left no trace, no test, and nothing
    // for the next such type to be measured against.
    //
    // A table over EVERY member, so adding one without deciding is a compile
    // error here rather than a silent "no".
    const VERDICTS: readonly { type: ApiErrorType; transport: boolean; why: string }[] = [
      { type: ApiErrorType.NETWORK_ERROR, transport: true, why: 'the request did not complete' },
      { type: ApiErrorType.TIMEOUT_ERROR, transport: true, why: 'the request did not complete' },
      { type: ApiErrorType.SERVER_ERROR, transport: false, why: 'the server answered' },
      { type: ApiErrorType.PARSE_ERROR, transport: false, why: 'a body arrived' },
      { type: ApiErrorType.VALIDATION_ERROR, transport: false, why: 'the server answered' },
      { type: ApiErrorType.CONTENTION_ERROR, transport: false, why: 'a local database fault' },
      {
        type: ApiErrorType.MALFORMED_RESPONSE_ERROR,
        transport: false,
        why: 'a well-formed body of the wrong shape',
      },
      {
        type: ApiErrorType.UNREADABLE_BODY_ERROR,
        transport: false,
        // THE DECISION, and it is about information rather than about truth —
        // bytes arriving proves nothing about the link, so "the connection
        // demonstrably worked" is not the argument. If it counted, three
        // unreadable sources would collapse into the single offline line and the
        // copy written for this type would be rendered only in the mixed case
        // and discarded in its own primary one. Excluded, a mixed refresh drops
        // to the per-source list: more verbose, strictly more informative, never
        // false.
        why: 'the cause is unknown; a per-source line says more than the offline alert',
      },
      { type: ApiErrorType.UNKNOWN_ERROR, transport: false, why: 'unclassified is not transport' },
      { type: ApiErrorType.INFO, transport: false, why: 'not a failure' },
    ];

    it.each(VERDICTS)('$type is transport=$transport — $why', ({ type, transport }) => {
      expect(isTransportFault(type)).toBe(transport);
    });

    it('covers every ApiErrorType member', () => {
      // Without this the table is a list of the members someone remembered.
      //
      // `toStrictEqual`, not `toEqual`: the latter treats a missing array slot
      // and an `undefined` one as equal, so a member the enum does not yet have
      // — exactly the state this test is meant to catch — passed vacuously.
      expect(VERDICTS.map(v => v.type).sort()).toStrictEqual(Object.values(ApiErrorType).sort());
    });
  });

  describe('UNREADABLE_BODY_ERROR', () => {
    const makeError = (type: ApiErrorType, message = ''): ErrorResponse => ({ type, message });

    it('createErrorResponse types a body that could not be read', () => {
      const result = createErrorResponse(new UnreadableBodyError(new SyntaxError('whatever')));

      expect(result.type).toBe(ApiErrorType.UNREADABLE_BODY_ERROR);
    });

    it('createErrorResponse types a chain-deadline abort as a network fault', () => {
      const result = createErrorResponse(
        new TransportAbortedError('the chain deadline ended the attempt', new Error('aborted'))
      );

      expect(result.type).toBe(ApiErrorType.NETWORK_ERROR);
    });

    it('has user copy of its own, so it cannot fall through to the verbatim default', () => {
      // `getUserFriendlyErrorMessage` ends `case UNKNOWN_ERROR: default:`, which
      // returns `error.message` verbatim — so an enum member added without a
      // copy arm COMPILES and leaks developer prose into the refresh alert.
      // There is no TypeScript fence for that, which is why this assertion is
      // the fence.
      expect(
        getUserFriendlyErrorMessage(
          makeError(ApiErrorType.UNREADABLE_BODY_ERROR, 'Response body could not be read as JSON')
        )
      ).toBe(
        'Could not read the beer data — your network may be interfering with the connection. Check your connection and try refreshing again. Your existing data has been kept.'
      );
    });
  });
});
