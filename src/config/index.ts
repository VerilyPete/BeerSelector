/**
 * Configuration Module - Public API
 *
 * This file exports the public API of the configuration module.
 * Import configuration values from here in your application code.
 *
 * @example
 * ```typescript
 * import { config } from '@/src/config';
 *
 * // Get the base URL
 * const apiUrl = config.api.baseUrl;
 *
 * // Get a full endpoint URL
 * const queueUrl = config.api.getFullUrl('memberQueues');
 *
 * // Switch environment
 * config.setEnvironment('development');
 *
 * // Handle configuration errors
 * import { InvalidUrlError } from '@/src/config';
 * try {
 *   config.setCustomApiUrl(userUrl);
 * } catch (error) {
 *   if (error instanceof InvalidUrlError) {
 *     console.error('Invalid URL:', error.message);
 *   }
 * }
 * ```
 */

import configModule from './config';

export {
  config,
  getEnvironment,
  setEnvironment,
  setCustomApiUrl,
  assertEnrichmentConfigured,
  type AppEnvironment,
  type ApiEndpoints,
  type NetworkConfig,
  type ExternalServices,
  type ApiConfig,
  type AppConfig,
  type EnrichmentConfig,
  type ConfiguredEnrichment,
  // Error classes for error handling
  InvalidUrlError,
  InvalidNetworkConfigError,
  InvalidEnvironmentError
} from './config';

// Re-export all error classes from errors module
export {
  ConfigurationError,
  MissingConfigError
} from './errors';

export default configModule;
