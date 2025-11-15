/**
 * Configuration Error Classes
 *
 * Custom error classes for configuration validation failures.
 * These provide better error messages and make it easier to catch
 * specific types of configuration errors.
 */

/**
 * Base error class for all configuration errors
 */
export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
    // Maintain proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ConfigurationError);
    }
  }
}

/**
 * Error thrown when a URL is invalid or malformed
 */
export class InvalidUrlError extends ConfigurationError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidUrlError';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, InvalidUrlError);
    }
  }
}

/**
 * Error thrown when required configuration is missing
 */
export class MissingConfigError extends ConfigurationError {
  constructor(message: string) {
    super(message);
    this.name = 'MissingConfigError';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, MissingConfigError);
    }
  }
}

/**
 * Error thrown when network configuration is invalid
 */
export class InvalidNetworkConfigError extends ConfigurationError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidNetworkConfigError';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, InvalidNetworkConfigError);
    }
  }
}

/**
 * Error thrown when environment value is invalid
 */
export class InvalidEnvironmentError extends ConfigurationError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidEnvironmentError';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, InvalidEnvironmentError);
    }
  }
}
