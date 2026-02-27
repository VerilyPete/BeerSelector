/**
 * Centralized Error Logging Utility
 *
 * Provides consistent error logging across the application with context
 * information to aid in debugging production issues. Replaces empty catch
 * blocks with proper error handling.
 *
 * @example
 * try {
 *   await fetchBeers();
 * } catch (error) {
 *   logError(error, {
 *     operation: 'fetchBeers',
 *     component: 'AllBeers',
 *     additionalData: { url: apiUrl }
 *   });
 * }
 */

/**
 * Log levels for different types of messages
 */
export enum LogLevel {
  ERROR = 'ERROR',
  WARNING = 'WARNING',
  INFO = 'INFO',
}

/**
 * Context information for error logging
 */
export type ErrorContext = {
  /** The operation that was being performed when the error occurred */
  operation: string;
  /** The component or module where the error occurred */
  component?: string;
  /** User ID if available (for tracking user-specific issues) */
  userId?: string;
  /** Additional contextual data (API URLs, record counts, etc.) */
  additionalData?: Record<string, unknown>;
};

/**
 * Structured error log entry
 */
type ErrorLogEntry = {
  level: LogLevel;
  message: string;
  name?: string;
  stack?: string;
  timestamp: string;
  context: ErrorContext;
};

/**
 * Sensitive data keys that should be redacted from logs
 */
const SENSITIVE_KEYS = [
  'password',
  'token',
  'apiKey',
  'sessionId',
  'cookie',
  'authorization',
  'secret',
];

/**
 * Sanitizes sensitive data from an object by redacting values
 */
function sanitizeData(data: unknown): unknown {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data !== 'object') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(item => sanitizeData(item));
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.some(sensitive => lowerKey.includes(sensitive))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      try {
        sanitized[key] = sanitizeData(value);
      } catch (error) {
        // Handle circular references
        sanitized[key] = '[Circular Reference]';
      }
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Extracts error message from various error types
 */
function getErrorMessage(error: unknown): string {
  if (typeof error === 'string') {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message);
  }

  return 'Unknown error';
}

/**
 * Extracts error name from various error types
 */
function getErrorName(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.name;
  }

  if (error && typeof error === 'object' && 'name' in error) {
    return String(error.name);
  }

  return undefined;
}

/**
 * Extracts stack trace from error
 */
function getErrorStack(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.stack;
  }

  if (error && typeof error === 'object' && 'stack' in error) {
    return String(error.stack);
  }

  return undefined;
}

/**
 * Formats a log entry for console output
 */
function formatLogEntry(entry: ErrorLogEntry): void {
  const { level, context } = entry;
  const prefix = `[${level}] ${context.operation}${context.component ? ` in ${context.component}` : ''}:`;

  const logData = {
    message: entry.message,
    ...(entry.name && { name: entry.name }),
    ...(entry.stack && { stack: entry.stack }),
    timestamp: entry.timestamp,
    context: sanitizeData(context),
  };

  switch (level) {
    case LogLevel.ERROR:
      console.error(prefix, logData);
      break;
    case LogLevel.WARNING:
      console.warn(prefix, logData);
      break;
    case LogLevel.INFO:
      console.log(prefix, logData);
      break;
  }
}

/**
 * Logs an error with context information
 *
 * @param error - The error to log (Error object, string, or unknown)
 * @param context - Context information about where/why the error occurred
 *
 * @example
 * try {
 *   await database.runAsync('INSERT INTO beers...');
 * } catch (error) {
 *   logError(error, {
 *     operation: 'insertBeers',
 *     component: 'database/db',
 *     additionalData: { query: 'INSERT INTO beers...', recordCount: 100 }
 *   });
 *   throw error; // Re-throw if needed
 * }
 */
export function logError(error: unknown, context?: ErrorContext): void {
  const safeContext: ErrorContext = context || { operation: 'Unknown operation' };

  const entry: ErrorLogEntry = {
    level: LogLevel.ERROR,
    message: getErrorMessage(error),
    name: getErrorName(error),
    stack: getErrorStack(error),
    timestamp: new Date().toISOString(),
    context: safeContext,
  };

  formatLogEntry(entry);
}

/**
 * Logs a warning message with context
 *
 * Use for non-critical issues that should be investigated but don't prevent
 * the operation from continuing (e.g., skipping invalid records).
 *
 * @param message - The warning message
 * @param context - Context information
 *
 * @example
 * const validation = validateBeer(beer);
 * if (!validation.isValid) {
 *   logWarning(`Skipping invalid beer: ${validation.errors.join(', ')}`, {
 *     operation: 'insertBeers',
 *     component: 'dataUpdateService',
 *     additionalData: { beerId: beer.id, errors: validation.errors }
 *   });
 * }
 */
export function logWarning(message: string, context?: ErrorContext): void {
  const safeContext: ErrorContext = context || { operation: 'Unknown operation' };

  const entry: ErrorLogEntry = {
    level: LogLevel.WARNING,
    message,
    timestamp: new Date().toISOString(),
    context: safeContext,
  };

  formatLogEntry(entry);
}

/**
 * Logs an informational message with context
 *
 * Use for tracking successful operations with important context
 * (e.g., operation summaries, performance metrics).
 *
 * @param message - The info message
 * @param context - Context information
 *
 * @example
 * logInfo('Data refresh completed', {
 *   operation: 'refreshAllData',
 *   component: 'dataUpdateService',
 *   additionalData: {
 *     recordsInserted: 500,
 *     recordsSkipped: 5,
 *     durationMs: 1234
 *   }
 * });
 */
export function logInfo(message: string, context?: ErrorContext): void {
  const safeContext: ErrorContext = context || { operation: 'Unknown operation' };

  const entry: ErrorLogEntry = {
    level: LogLevel.INFO,
    message,
    timestamp: new Date().toISOString(),
    context: safeContext,
  };

  formatLogEntry(entry);
}

/**
 * Creates an error logging wrapper for async functions
 *
 * Automatically logs errors with context before re-throwing.
 *
 * @example
 * const safeFetchBeers = withErrorLogging(
 *   fetchBeers,
 *   { operation: 'fetchBeers', component: 'apiClient' }
 * );
 * await safeFetchBeers(); // Errors are logged before being thrown
 */
export function withErrorLogging<T extends (...args: never[]) => Promise<unknown>>(
  fn: T,
  context: ErrorContext
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      logError(error, context);
      throw error;
    }
  }) as T;
}
