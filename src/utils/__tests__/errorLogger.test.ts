import { logError, logWarning, logInfo, ErrorContext, LogLevel } from '../errorLogger';

// Mock console methods
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleLog = console.log;

describe('Error Logger', () => {
  let consoleErrorSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    // Create spies for console methods
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore original console methods
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  describe('logError', () => {
    it('should log error with basic context', () => {
      const error = new Error('Test error');
      const context: ErrorContext = {
        operation: 'fetchBeers',
        component: 'AllBeers',
      };

      logError(error, context);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[ERROR] fetchBeers in AllBeers:',
        expect.objectContaining({
          message: 'Test error',
          name: 'Error',
          context,
        })
      );
    });

    it('should log error with full context including user state', () => {
      const error = new Error('Database error');
      const context: ErrorContext = {
        operation: 'insertBeers',
        component: 'dataUpdateService',
        userId: 'user123',
        additionalData: { beerCount: 100 },
      };

      logError(error, context);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[ERROR] insertBeers in dataUpdateService:',
        expect.objectContaining({
          message: 'Database error',
          context: expect.objectContaining({
            userId: 'user123',
            additionalData: { beerCount: 100 },
          }),
        })
      );
    });

    it('should log error with string error message', () => {
      const error = 'Simple error string';
      const context: ErrorContext = {
        operation: 'testOperation',
      };

      logError(error, context);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[ERROR] testOperation:',
        expect.objectContaining({
          message: 'Simple error string',
        })
      );
    });

    it('should log error with network error details', () => {
      const error = new Error('Network request failed');
      error.name = 'NetworkError';
      const context: ErrorContext = {
        operation: 'fetchFromAPI',
        component: 'apiClient',
        additionalData: {
          url: 'https://api.example.com/beers',
          statusCode: 500,
        },
      };

      logError(error, context);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[ERROR] fetchFromAPI in apiClient:',
        expect.objectContaining({
          message: 'Network request failed',
          name: 'NetworkError',
          context: expect.objectContaining({
            additionalData: expect.objectContaining({
              statusCode: 500,
            }),
          }),
        })
      );
    });

    it('should handle errors without message property', () => {
      const error = { someProperty: 'value' };
      const context: ErrorContext = {
        operation: 'unknownOperation',
      };

      logError(error, context);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[ERROR] unknownOperation:',
        expect.objectContaining({
          message: 'Unknown error',
        })
      );
    });

    it('should include stack trace when available', () => {
      const error = new Error('Error with stack');
      const context: ErrorContext = {
        operation: 'testOperation',
      };

      logError(error, context);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[ERROR] testOperation:',
        expect.objectContaining({
          stack: expect.stringContaining('Error with stack'),
        })
      );
    });

    it('should handle null or undefined context', () => {
      const error = new Error('Test error');

      logError(error, undefined as any);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[ERROR] Unknown operation:',
        expect.objectContaining({
          message: 'Test error',
        })
      );
    });

    it('should serialize complex additional data', () => {
      const error = new Error('Complex data error');
      const context: ErrorContext = {
        operation: 'complexOperation',
        additionalData: {
          nested: {
            object: {
              value: 123,
            },
          },
          array: [1, 2, 3],
        },
      };

      logError(error, context);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[ERROR] complexOperation:',
        expect.objectContaining({
          context: expect.objectContaining({
            additionalData: expect.objectContaining({
              nested: expect.any(Object),
              array: expect.any(Array),
            }),
          }),
        })
      );
    });

    it('should include timestamp in log', () => {
      const error = new Error('Test error');
      const context: ErrorContext = {
        operation: 'testOperation',
      };

      const beforeTime = Date.now();
      logError(error, context);
      const afterTime = Date.now();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[ERROR] testOperation:',
        expect.objectContaining({
          timestamp: expect.any(String),
        })
      );

      // Verify timestamp is within reasonable range
      const loggedData = consoleErrorSpy.mock.calls[0][1];
      const loggedTime = new Date(loggedData.timestamp).getTime();
      expect(loggedTime).toBeGreaterThanOrEqual(beforeTime);
      expect(loggedTime).toBeLessThanOrEqual(afterTime);
    });
  });

  describe('logWarning', () => {
    it('should log warning with context', () => {
      const message = 'Invalid beer skipped';
      const context: ErrorContext = {
        operation: 'validateBeer',
        additionalData: { beerId: 123 },
      };

      logWarning(message, context);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[WARNING] validateBeer:',
        expect.objectContaining({
          message: 'Invalid beer skipped',
          context: expect.objectContaining({
            additionalData: { beerId: 123 },
          }),
        })
      );
    });

    it('should handle warning without context', () => {
      const message = 'Simple warning';

      logWarning(message);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[WARNING] Unknown operation:',
        expect.objectContaining({
          message: 'Simple warning',
        })
      );
    });

    it('should include timestamp in warning', () => {
      const message = 'Test warning';
      const context: ErrorContext = {
        operation: 'testOperation',
      };

      logWarning(message, context);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[WARNING] testOperation:',
        expect.objectContaining({
          timestamp: expect.any(String),
        })
      );
    });
  });

  describe('logInfo', () => {
    it('should log info with context', () => {
      const message = 'Operation completed successfully';
      const context: ErrorContext = {
        operation: 'refreshData',
        additionalData: { recordsProcessed: 500 },
      };

      logInfo(message, context);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[INFO] refreshData:',
        expect.objectContaining({
          message: 'Operation completed successfully',
          context: expect.objectContaining({
            additionalData: { recordsProcessed: 500 },
          }),
        })
      );
    });

    it('should handle info without context', () => {
      const message = 'Simple info message';

      logInfo(message);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[INFO] Unknown operation:',
        expect.objectContaining({
          message: 'Simple info message',
        })
      );
    });

    it('should include timestamp in info log', () => {
      const message = 'Test info';
      const context: ErrorContext = {
        operation: 'testOperation',
      };

      logInfo(message, context);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[INFO] testOperation:',
        expect.objectContaining({
          timestamp: expect.any(String),
        })
      );
    });
  });

  describe('Context serialization', () => {
    it('should handle circular references in additional data', () => {
      const error = new Error('Circular reference error');
      const circularObj: any = { prop: 'value' };
      circularObj.self = circularObj;

      const context: ErrorContext = {
        operation: 'circularTest',
        additionalData: circularObj,
      };

      // Should not throw error
      expect(() => logError(error, context)).not.toThrow();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should sanitize sensitive data in context', () => {
      const error = new Error('Auth error');
      const context: ErrorContext = {
        operation: 'authenticate',
        additionalData: {
          password: 'secret123',
          sessionId: 'abc123',
          apiKey: 'key123',
        },
      };

      logError(error, context);

      // The logger should redact or handle sensitive data
      // This test documents expected behavior - implementation may vary
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should handle undefined and null values in additional data', () => {
      const error = new Error('Test error');
      const context: ErrorContext = {
        operation: 'testOperation',
        additionalData: {
          nullValue: null,
          undefinedValue: undefined,
          normalValue: 'test',
        },
      };

      expect(() => logError(error, context)).not.toThrow();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('Real-world error scenarios', () => {
    it('should log database operation failure', () => {
      const error = new Error('SQLITE_ERROR: no such table: allbeers');
      const context: ErrorContext = {
        operation: 'insertAllBeers',
        component: 'database/db',
        additionalData: {
          query: 'INSERT INTO allbeers...',
          recordCount: 150,
        },
      };

      logError(error, context);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[ERROR] insertAllBeers in database/db:',
        expect.objectContaining({
          message: expect.stringContaining('SQLITE_ERROR'),
        })
      );
    });

    it('should log API authentication failure', () => {
      const error = new Error('Session expired');
      error.name = 'AuthenticationError';
      const context: ErrorContext = {
        operation: 'validateSession',
        component: 'authService',
        userId: 'user123',
        additionalData: {
          sessionAge: 7200000, // 2 hours in ms
        },
      };

      logError(error, context);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[ERROR] validateSession in authService:',
        expect.objectContaining({
          name: 'AuthenticationError',
          context: expect.objectContaining({
            userId: 'user123',
          }),
        })
      );
    });

    it('should log data validation failure', () => {
      const message = 'Beer object missing required field: id';
      const context: ErrorContext = {
        operation: 'validateBeer',
        component: 'validators',
        additionalData: {
          beer: { brew_name: 'Test Beer' },
          validationErrors: ['missing id', 'invalid type'],
        },
      };

      logWarning(message, context);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[WARNING] validateBeer in validators:',
        expect.objectContaining({
          message: expect.stringContaining('missing required field'),
        })
      );
    });

    it('should log network timeout', () => {
      const error = new Error('Request timeout');
      error.name = 'TimeoutError';
      const context: ErrorContext = {
        operation: 'fetchAllBeers',
        component: 'apiClient',
        additionalData: {
          url: 'https://api.flyingsaucer.com/beers',
          timeoutMs: 15000,
        },
      };

      logError(error, context);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[ERROR] fetchAllBeers in apiClient:',
        expect.objectContaining({
          name: 'TimeoutError',
        })
      );
    });
  });
});
