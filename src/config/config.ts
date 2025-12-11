/**
 * Configuration Module
 *
 * Centralized configuration for all API endpoints, URLs, and app settings.
 * This module provides a single source of truth for all configuration values,
 * making it easy to switch between environments and update URLs.
 *
 * Supports loading configuration from environment variables (prefixed with EXPO_PUBLIC_)
 * with fallback to hardcoded defaults. This allows dynamic configuration without
 * code changes.
 *
 * @module config
 */

import { InvalidUrlError, InvalidNetworkConfigError, InvalidEnvironmentError } from './errors';

/**
 * Supported application environments
 */
export type AppEnvironment = 'development' | 'staging' | 'production';

/**
 * Flying Saucer API endpoint paths
 */
export interface ApiEndpoints {
  memberQueues: string;
  deleteQueuedBrew: string;
  addToQueue: string;
  addToRewardQueue: string;
  memberDashboard: string;
  memberRewards: string;
  kiosk: string;
  visitor: string;
}

/**
 * Network configuration settings
 */
export interface NetworkConfig {
  timeout: number;
  retries: number;
  retryDelay: number;
}

/**
 * External services configuration
 */
export interface ExternalServices {
  untappd: {
    baseUrl: string;
    loginUrl: string;
    searchUrl: (beerName: string) => string;
  };
}

/**
 * Enrichment service configuration
 */
export interface EnrichmentConfig {
  apiUrl: string | undefined;
  apiKey: string | undefined;
  timeout: number;
  batchSize: number;
  rateLimitWindow: number;
  rateLimitMaxRequests: number;
  isConfigured: () => boolean;
  getFullUrl: (endpoint: 'beers' | 'batch' | 'health' | 'cache') => string;
}

/**
 * API configuration interface
 */
export interface ApiConfig {
  baseUrl: string;
  endpoints: ApiEndpoints;
  referers: {
    memberDashboard: string;
    memberRewards: string;
    memberQueues: string;
  };
  getFullUrl: (endpoint: keyof ApiEndpoints, params?: Record<string, string>) => string;
}

/**
 * Complete application configuration
 */
export interface AppConfig {
  environment: AppEnvironment;
  api: ApiConfig;
  network: NetworkConfig;
  external: ExternalServices;
  enrichment: EnrichmentConfig;
  getEnvironment: () => AppEnvironment;
  setEnvironment: (env: AppEnvironment) => void;
  setCustomApiUrl: (url: string) => void;
}

/**
 * Helper Functions for Environment Variable Loading
 */

/**
 * Safely reads a string environment variable with fallback
 * @param key - Environment variable key (with EXPO_PUBLIC_ prefix)
 * @param defaultValue - Default value if env var not set
 * @returns Environment variable value or default
 */
function getEnvString(key: string, defaultValue: string): string {
  // eslint-disable-next-line expo/no-dynamic-env-var
  const value = process.env[key];
  if (!value) {
    return defaultValue;
  }
  // Remove trailing slash if present
  return value.replace(/\/$/, '');
}

/**
 * Safely reads a numeric environment variable with fallback and validation
 * @param key - Environment variable key (with EXPO_PUBLIC_ prefix)
 * @param defaultValue - Default value if env var not set or invalid
 * @returns Parsed number or default
 */
function getEnvNumber(key: string, defaultValue: number): number {
  // eslint-disable-next-line expo/no-dynamic-env-var
  const value = process.env[key];
  if (!value) {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    console.warn(`Invalid number for ${key}: ${value}, using default: ${defaultValue}`);
    return defaultValue;
  }
  return parsed;
}

/**
 * Safely reads an environment variable and validates it's a valid AppEnvironment
 * @param key - Environment variable key
 * @param defaultValue - Default environment
 * @returns Valid AppEnvironment or default
 */
function getEnvEnvironment(key: string, defaultValue: AppEnvironment): AppEnvironment {
  // eslint-disable-next-line expo/no-dynamic-env-var
  const value = process.env[key];
  if (!value) {
    return defaultValue;
  }
  const validEnvs: AppEnvironment[] = ['development', 'staging', 'production'];
  if (validEnvs.includes(value as AppEnvironment)) {
    return value as AppEnvironment;
  }
  console.warn(`Invalid environment: ${value}, using default: ${defaultValue}`);
  return defaultValue;
}

/**
 * Validates that a URL is well-formed
 * @param url - URL to validate
 * @returns true if valid, false otherwise
 */
function isValidUrl(url: string): boolean {
  if (!url || url.trim() === '') {
    return false;
  }

  // Check basic protocol and structure
  if (!/^https?:\/\/.+/.test(url)) {
    return false;
  }

  // Check for spaces (URLs should not have unencoded spaces)
  if (url.includes(' ')) {
    return false;
  }

  // Check for proper domain structure (at least something after protocol)
  const urlPattern = /^https?:\/\/[^\s/$.?#].[^\s]*$/;
  return urlPattern.test(url);
}

/**
 * Validates and throws if URL is invalid
 * @param url - URL to validate
 * @param context - Context for error message (e.g., "API base URL")
 * @throws InvalidUrlError if URL is invalid
 */
function validateUrl(url: string, context: string = 'URL'): void {
  if (!url || url.trim() === '') {
    throw new InvalidUrlError(
      `Invalid ${context}: URL cannot be empty. ` + `Must start with http:// or https://.`
    );
  }

  if (!url.match(/^https?:\/\//)) {
    throw new InvalidUrlError(
      `Invalid ${context}: "${url}". ` +
        `Must start with http:// or https://. ` +
        `Example: https://example.com`
    );
  }

  if (url === 'http://' || url === 'https://') {
    throw new InvalidUrlError(
      `Invalid ${context}: "${url}". ` +
        `URL must include a domain name. ` +
        `Example: https://example.com`
    );
  }

  if (url.includes(' ')) {
    throw new InvalidUrlError(
      `Invalid ${context}: "${url}". ` +
        `URL cannot contain spaces. ` +
        `Use proper URL encoding for special characters.`
    );
  }

  if (!isValidUrl(url)) {
    throw new InvalidUrlError(
      `Invalid ${context}: "${url}". ` +
        `URL is malformed. Must be a valid HTTP or HTTPS URL. ` +
        `Example: https://api.example.com`
    );
  }
}

/**
 * Validates network configuration values
 * @param config - Network configuration to validate
 * @throws InvalidNetworkConfigError if configuration is invalid
 */
function validateNetworkConfig(config: NetworkConfig): void {
  // Validate timeout (1ms to 60 seconds)
  if (config.timeout <= 0 || config.timeout > 60000) {
    throw new InvalidNetworkConfigError(
      `Invalid timeout value: ${config.timeout}ms. ` +
        `Must be between 1 and 60000 (1 minute max). ` +
        `Check EXPO_PUBLIC_API_TIMEOUT environment variable.`
    );
  }

  // Validate retries (0 to 5)
  if (config.retries < 0 || config.retries > 5) {
    throw new InvalidNetworkConfigError(
      `Invalid retries value: ${config.retries}. ` +
        `Must be between 0 and 5. ` +
        `Check EXPO_PUBLIC_API_RETRIES environment variable.`
    );
  }

  // Validate retry delay (1ms to 10 seconds)
  if (config.retryDelay <= 0 || config.retryDelay > 10000) {
    throw new InvalidNetworkConfigError(
      `Invalid retry delay value: ${config.retryDelay}ms. ` +
        `Must be between 1 and 10000 (10 seconds max). ` +
        `Check EXPO_PUBLIC_API_RETRY_DELAY environment variable.`
    );
  }
}

/**
 * Hardcoded default base URLs for each environment
 * These are used as the final fallback when no environment variables are set
 */
const ENV_BASE_URLS: Record<AppEnvironment, string> = {
  development: 'https://tapthatapp.beerknurd.com', // Same as production for now
  staging: 'https://tapthatapp.beerknurd.com', // Can be changed to staging server when available
  production: 'https://tapthatapp.beerknurd.com',
};

/**
 * API endpoint paths (same across all environments)
 */
const API_ENDPOINTS: ApiEndpoints = {
  memberQueues: '/memberQueues.php',
  deleteQueuedBrew: '/deleteQueuedBrew.php',
  addToQueue: '/addToQueue.php',
  addToRewardQueue: '/addToRewardQueue.php',
  memberDashboard: '/member-dash.php',
  memberRewards: '/memberRewards.php',
  kiosk: '/kiosk.php',
  visitor: '/visitor.php',
};

/**
 * Enrichment service endpoint paths
 */
const ENRICHMENT_ENDPOINTS = {
  beers: '/beers', // GET /beers?sid={storeId}
  batch: '/beers/batch', // POST /beers/batch
  health: '/health', // GET /health
  cache: '/cache', // DELETE /cache?sid={storeId}
} as const;

type EnrichmentEndpoint = keyof typeof ENRICHMENT_ENDPOINTS;

/**
 * Gets network configuration dynamically from environment variables
 * This allows tests to set env vars and have them picked up immediately
 * @returns NetworkConfig object
 * @throws InvalidNetworkConfigError if configuration is invalid
 */
function getNetworkConfig(): NetworkConfig {
  const config: NetworkConfig = {
    timeout: getEnvNumber('EXPO_PUBLIC_API_TIMEOUT', 15000), // 15 seconds default
    retries: getEnvNumber('EXPO_PUBLIC_API_RETRIES', 3), // 3 retries default
    retryDelay: getEnvNumber('EXPO_PUBLIC_API_RETRY_DELAY', 1000), // 1 second default
  };

  // Validate the configuration
  validateNetworkConfig(config);

  return config;
}

/**
 * Gets external services configuration dynamically from environment variables
 * This allows tests to set env vars and have them picked up immediately
 * @returns ExternalServices object
 */
function getExternalServices(): ExternalServices {
  const untappdBaseUrl = getEnvString('EXPO_PUBLIC_UNTAPPD_BASE_URL', 'https://untappd.com');
  return {
    untappd: {
      baseUrl: untappdBaseUrl,
      loginUrl: `${untappdBaseUrl}/login`,
      searchUrl: (beerName: string) => {
        // Parse out words in parentheses from the beer name
        const parsedBeerName = beerName.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
        return `${untappdBaseUrl}/search?q=${encodeURIComponent(parsedBeerName)}`;
      },
    },
  };
}

/**
 * Gets enrichment configuration dynamically from environment variables
 * This allows tests to set env vars and have them picked up immediately
 * @returns EnrichmentConfig object
 */
function getEnrichmentConfig(): EnrichmentConfig {
  const apiUrl = process.env.EXPO_PUBLIC_ENRICHMENT_API_URL?.replace(/\/$/, '');
  const apiKey = process.env.EXPO_PUBLIC_ENRICHMENT_API_KEY;

  return {
    apiUrl,
    apiKey,
    timeout: getEnvNumber('EXPO_PUBLIC_ENRICHMENT_TIMEOUT', 15000),
    batchSize: getEnvNumber('EXPO_PUBLIC_ENRICHMENT_BATCH_SIZE', 100), // Worker limit
    rateLimitWindow: getEnvNumber('EXPO_PUBLIC_ENRICHMENT_RATE_WINDOW', 60000), // 1 minute
    rateLimitMaxRequests: getEnvNumber('EXPO_PUBLIC_ENRICHMENT_RATE_MAX', 10), // 10 requests per minute
    isConfigured: () => Boolean(apiUrl && apiKey),
    getFullUrl: (endpoint: EnrichmentEndpoint) => {
      if (!apiUrl) {
        throw new Error('Enrichment API URL not configured');
      }
      return `${apiUrl}${ENRICHMENT_ENDPOINTS[endpoint]}`;
    },
  };
}

/**
 * Current environment (mutable for environment switching)
 * Can be set via EXPO_PUBLIC_DEFAULT_ENV environment variable
 */
let currentEnvironment: AppEnvironment = getEnvEnvironment('EXPO_PUBLIC_DEFAULT_ENV', 'production');

/**
 * Custom API URL override (null means use environment default)
 */
let customApiUrl: string | null = null;

/**
 * Validates that an environment value is valid
 * @param env - Environment to validate
 * @throws InvalidEnvironmentError if environment is invalid
 */
function validateEnvironment(env: AppEnvironment): void {
  const validEnvs: AppEnvironment[] = ['development', 'staging', 'production'];
  if (!env || !validEnvs.includes(env)) {
    throw new InvalidEnvironmentError(
      `Invalid environment: "${env}". ` +
        `Must be one of: ${validEnvs.join(', ')}. ` +
        `Set EXPO_PUBLIC_DEFAULT_ENV or use config.setEnvironment().`
    );
  }
}

/**
 * Gets the base URL for a specific environment from environment variables or defaults
 * This is evaluated dynamically to support runtime environment switching
 * @param env - The environment to get the URL for
 * @returns Base URL string
 */
function getEnvironmentBaseUrl(env: AppEnvironment): string {
  // Check for environment-specific env var
  const envVarMap: Record<AppEnvironment, string> = {
    development: 'EXPO_PUBLIC_DEV_API_BASE_URL',
    staging: 'EXPO_PUBLIC_STAGING_API_BASE_URL',
    production: 'EXPO_PUBLIC_PROD_API_BASE_URL',
  };

  // eslint-disable-next-line expo/no-dynamic-env-var
  const envSpecificVar = process.env[envVarMap[env]];

  if (envSpecificVar && isValidUrl(envSpecificVar)) {
    return envSpecificVar.replace(/\/$/, '');
  }

  // Fall back to generic env var
  const genericVar = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (genericVar && isValidUrl(genericVar)) {
    return genericVar.replace(/\/$/, '');
  }

  // Fall back to hardcoded default from ENV_BASE_URLS
  return ENV_BASE_URLS[env];
}

/**
 * Gets the base URL for the current environment
 * @returns Base URL string
 */
function getBaseUrl(): string {
  if (customApiUrl) {
    return customApiUrl;
  }
  return getEnvironmentBaseUrl(currentEnvironment);
}

/**
 * Builds referer URLs based on current base URL
 * @returns Referer URLs object
 */
function getReferers(): ApiConfig['referers'] {
  const baseUrl = getBaseUrl();
  return {
    memberDashboard: `${baseUrl}/member-dash.php`,
    memberRewards: `${baseUrl}/memberRewards.php`,
    memberQueues: `${baseUrl}/memberQueues.php`,
  };
}

/**
 * Builds a full URL for an API endpoint
 * @param endpoint - The endpoint key from ApiEndpoints
 * @param params - Optional query parameters
 * @returns Full URL string
 */
function getFullUrl(endpoint: keyof ApiEndpoints, params?: Record<string, string>): string {
  const baseUrl = getBaseUrl();
  const path = API_ENDPOINTS[endpoint];
  let url = `${baseUrl}${path}`;

  if (params && Object.keys(params).length > 0) {
    const queryString = new URLSearchParams(params).toString();
    url += `?${queryString}`;
  }

  return url;
}

/**
 * Main configuration object
 * Provides access to all app configuration with dynamic environment switching
 */
export const config: AppConfig = {
  /**
   * Current environment
   */
  get environment(): AppEnvironment {
    return currentEnvironment;
  },

  /**
   * API configuration
   */
  get api(): ApiConfig {
    return {
      baseUrl: getBaseUrl(),
      endpoints: API_ENDPOINTS,
      referers: getReferers(),
      getFullUrl,
    };
  },

  /**
   * Network configuration (dynamic getter)
   */
  get network(): NetworkConfig {
    return getNetworkConfig();
  },

  /**
   * External services configuration (dynamic getter)
   */
  get external(): ExternalServices {
    return getExternalServices();
  },

  /**
   * Enrichment service configuration (dynamic getter)
   */
  get enrichment(): EnrichmentConfig {
    return getEnrichmentConfig();
  },

  /**
   * Get the current environment
   * @returns Current environment name
   */
  getEnvironment(): AppEnvironment {
    return currentEnvironment;
  },

  /**
   * Set the application environment
   * @param env - Environment to switch to
   * @throws Error if environment is invalid
   */
  setEnvironment(env: AppEnvironment): void {
    validateEnvironment(env);
    currentEnvironment = env;
    // Clear custom URL when switching environments
    customApiUrl = null;
  },

  /**
   * Set a custom API base URL (overrides environment default)
   * Useful for testing with mock servers or local development
   * @param url - Custom base URL
   * @throws InvalidUrlError if URL is invalid
   */
  setCustomApiUrl(url: string): void {
    // Validate URL format with helpful error messages
    validateUrl(url, 'API base URL');

    // Remove trailing slash(es) if present
    customApiUrl = url.replace(/\/+$/, '');
  },
};

/**
 * Export error classes for error handling
 */
export { InvalidUrlError, InvalidNetworkConfigError, InvalidEnvironmentError } from './errors';

/**
 * Convenience exports for commonly used values
 */
export const { getEnvironment, setEnvironment, setCustomApiUrl } = config;

/**
 * Default export
 */
export default config;
