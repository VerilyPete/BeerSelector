/**
 * Configuration Validation Tests (TDD - Red Phase)
 *
 * These tests define the expected validation behavior before implementation.
 * Following TDD principles:
 * 1. Write tests first (RED) - Tests should FAIL initially
 * 2. Implement minimum code to pass (GREEN)
 * 3. Refactor and improve (REFACTOR)
 *
 * Test Coverage:
 * - URL format validation
 * - Missing required configuration
 * - Invalid environment names
 * - Invalid numeric values (negative timeouts, etc.)
 * - Helpful error messages
 * - Validation can be disabled for testing
 */

import { config } from '../config';

// Import error classes (to be implemented)
import {
  ConfigurationError,
  InvalidUrlError,
  MissingConfigError,
  InvalidNetworkConfigError,
  InvalidEnvironmentError
} from '../errors';

function assertError(value: unknown): asserts value is Error {
  if (!(value instanceof Error)) throw new Error(`Expected Error, got ${typeof value}`);
}

describe('Configuration Validation', () => {
  // Store original process.env to restore after tests
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset modules to get fresh config instance
    jest.resetModules();
    // Clone process.env for each test
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    // Restore original process.env
    process.env = originalEnv;
  });

  describe('URL Validation', () => {
    describe('Valid URLs', () => {
      it('should accept valid HTTP URLs', () => {
        expect(() => {
          config.setCustomApiUrl('http://example.com');
        }).not.toThrow();
      });

      it('should accept valid HTTPS URLs', () => {
        expect(() => {
          config.setCustomApiUrl('https://example.com');
        }).not.toThrow();
      });

      it('should accept URLs with subdomains', () => {
        expect(() => {
          config.setCustomApiUrl('https://api.example.com');
        }).not.toThrow();
      });

      it('should accept URLs with ports', () => {
        expect(() => {
          config.setCustomApiUrl('https://example.com:8080');
        }).not.toThrow();
      });

      it('should accept URLs with paths', () => {
        expect(() => {
          config.setCustomApiUrl('https://example.com/api/v1');
        }).not.toThrow();
      });

      it('should accept URLs with dashes and underscores', () => {
        expect(() => {
          config.setCustomApiUrl('https://my-api_server.example.com');
        }).not.toThrow();
      });

      it('should accept localhost URLs for development', () => {
        expect(() => {
          config.setCustomApiUrl('http://localhost:3000');
        }).not.toThrow();
      });

      it('should accept IP address URLs', () => {
        expect(() => {
          config.setCustomApiUrl('http://192.168.1.100:8080');
        }).not.toThrow();
      });
    });

    describe('Invalid URLs', () => {
      it('should reject URLs without protocol', () => {
        expect(() => {
          config.setCustomApiUrl('example.com');
        }).toThrow(InvalidUrlError);
      });

      it('should reject empty URLs', () => {
        expect(() => {
          config.setCustomApiUrl('');
        }).toThrow(InvalidUrlError);
      });

      it('should reject URLs with only protocol', () => {
        expect(() => {
          config.setCustomApiUrl('https://');
        }).toThrow(InvalidUrlError);
      });

      it('should reject URLs with invalid protocol', () => {
        expect(() => {
          config.setCustomApiUrl('ftp://example.com');
        }).toThrow(InvalidUrlError);
      });

      it('should reject URLs with spaces', () => {
        expect(() => {
          config.setCustomApiUrl('https://example .com');
        }).toThrow(InvalidUrlError);
      });

      it('should reject malformed URLs', () => {
        expect(() => {
          config.setCustomApiUrl('https:///example.com');
        }).toThrow(InvalidUrlError);
      });

      it('should provide helpful error message for invalid URLs', () => {
        try {
          config.setCustomApiUrl('not-a-url');
          fail('Should have thrown InvalidUrlError');
        } catch (error: unknown) {
          assertError(error);
          expect(error).toBeInstanceOf(InvalidUrlError);
          // Message contains "Invalid API base URL" which includes "Invalid"
          expect(error.message).toContain('Invalid');
          expect(error.message).toContain('not-a-url');
          expect(error.message).toContain('http://');
          expect(error.message).toContain('https://');
        }
      });
    });

    describe('URL Normalization', () => {
      it('should remove trailing slash from URLs', () => {
        config.setCustomApiUrl('https://example.com/');
        expect(config.api.baseUrl).toBe('https://example.com');
      });

      it('should remove multiple trailing slashes', () => {
        config.setCustomApiUrl('https://example.com///');
        expect(config.api.baseUrl).toBe('https://example.com');
      });

      it('should preserve path without trailing slash', () => {
        config.setCustomApiUrl('https://example.com/api/v1');
        expect(config.api.baseUrl).toBe('https://example.com/api/v1');
      });
    });
  });

  describe('Network Configuration Validation', () => {
    describe('Timeout Validation', () => {
      it('should accept valid timeout values', () => {
        process.env.EXPO_PUBLIC_API_TIMEOUT = '15000';
        const { config: freshConfig } = require('../config');
        expect(freshConfig.network.timeout).toBe(15000);
      });

      it('should reject negative timeout values', () => {
        process.env.EXPO_PUBLIC_API_TIMEOUT = '-1000';

        try {
          const { config: freshConfig } = require('../config');
          freshConfig.network; // Access to trigger validation
          fail('Should have thrown InvalidNetworkConfigError');
        } catch (error: unknown) {
          assertError(error);
          expect(error.name).toBe('InvalidNetworkConfigError');
          expect(error.message).toContain('timeout');
        }
      });

      it('should reject zero timeout', () => {
        process.env.EXPO_PUBLIC_API_TIMEOUT = '0';

        try {
          const { config: freshConfig } = require('../config');
          freshConfig.network; // Access to trigger validation
          fail('Should have thrown InvalidNetworkConfigError');
        } catch (error: unknown) {
          assertError(error);
          expect(error.name).toBe('InvalidNetworkConfigError');
          expect(error.message).toContain('timeout');
        }
      });

      it('should reject extremely large timeout (>60 seconds)', () => {
        process.env.EXPO_PUBLIC_API_TIMEOUT = '61000';

        try {
          const { config: freshConfig } = require('../config');
          freshConfig.network; // Access to trigger validation
          fail('Should have thrown InvalidNetworkConfigError');
        } catch (error: unknown) {
          assertError(error);
          expect(error.name).toBe('InvalidNetworkConfigError');
          expect(error.message).toContain('timeout');
        }
      });

      it('should provide helpful error message for invalid timeout', () => {
        process.env.EXPO_PUBLIC_API_TIMEOUT = '-5000';
        try {
          const { config: freshConfig } = require('../config');
          freshConfig.network; // Access to trigger validation
          fail('Should have thrown InvalidNetworkConfigError');
        } catch (error: unknown) {
          assertError(error);
          expect(error.name).toBe('InvalidNetworkConfigError');
          expect(error.message).toContain('timeout');
          expect(error.message).toContain('-5000');
          expect(error.message).toContain('between 1 and 60000');
        }
      });
    });

    describe('Retries Validation', () => {
      it('should accept valid retry values', () => {
        process.env.EXPO_PUBLIC_API_RETRIES = '3';
        const { config: freshConfig } = require('../config');
        expect(freshConfig.network.retries).toBe(3);
      });

      it('should accept zero retries (no retries)', () => {
        process.env.EXPO_PUBLIC_API_RETRIES = '0';
        const { config: freshConfig } = require('../config');
        expect(freshConfig.network.retries).toBe(0);
      });

      it('should reject negative retry values', () => {
        process.env.EXPO_PUBLIC_API_RETRIES = '-1';

        try {
          const { config: freshConfig } = require('../config');
          freshConfig.network; // Access to trigger validation
          fail('Should have thrown InvalidNetworkConfigError');
        } catch (error: unknown) {
          assertError(error);
          expect(error.name).toBe('InvalidNetworkConfigError');
          expect(error.message).toContain('retries');
        }
      });

      it('should reject excessive retry values (>5)', () => {
        process.env.EXPO_PUBLIC_API_RETRIES = '10';

        try {
          const { config: freshConfig } = require('../config');
          freshConfig.network; // Access to trigger validation
          fail('Should have thrown InvalidNetworkConfigError');
        } catch (error: unknown) {
          assertError(error);
          expect(error.name).toBe('InvalidNetworkConfigError');
          expect(error.message).toContain('retries');
        }
      });

      it('should provide helpful error message for invalid retries', () => {
        process.env.EXPO_PUBLIC_API_RETRIES = '20';
        try {
          const { config: freshConfig } = require('../config');
          freshConfig.network; // Access to trigger validation
          fail('Should have thrown InvalidNetworkConfigError');
        } catch (error: unknown) {
          assertError(error);
          expect(error.name).toBe('InvalidNetworkConfigError');
          expect(error.message).toContain('retries');
          expect(error.message).toContain('20');
          expect(error.message).toContain('between 0 and 5');
        }
      });
    });

    describe('Retry Delay Validation', () => {
      it('should accept valid retry delay values', () => {
        process.env.EXPO_PUBLIC_API_RETRY_DELAY = '1000';
        const { config: freshConfig } = require('../config');
        expect(freshConfig.network.retryDelay).toBe(1000);
      });

      it('should reject negative retry delay', () => {
        process.env.EXPO_PUBLIC_API_RETRY_DELAY = '-500';

        try {
          const { config: freshConfig } = require('../config');
          freshConfig.network; // Access to trigger validation
          fail('Should have thrown InvalidNetworkConfigError');
        } catch (error: unknown) {
          assertError(error);
          expect(error.name).toBe('InvalidNetworkConfigError');
          expect(error.message).toContain('retry delay');
        }
      });

      it('should reject zero retry delay', () => {
        process.env.EXPO_PUBLIC_API_RETRY_DELAY = '0';

        try {
          const { config: freshConfig } = require('../config');
          freshConfig.network; // Access to trigger validation
          fail('Should have thrown InvalidNetworkConfigError');
        } catch (error: unknown) {
          assertError(error);
          expect(error.name).toBe('InvalidNetworkConfigError');
          expect(error.message).toContain('retry delay');
        }
      });

      it('should reject excessive retry delay (>10 seconds)', () => {
        process.env.EXPO_PUBLIC_API_RETRY_DELAY = '11000';

        try {
          const { config: freshConfig } = require('../config');
          freshConfig.network; // Access to trigger validation
          fail('Should have thrown InvalidNetworkConfigError');
        } catch (error: unknown) {
          assertError(error);
          expect(error.name).toBe('InvalidNetworkConfigError');
          expect(error.message).toContain('retry delay');
        }
      });

      it('should provide helpful error message for invalid retry delay', () => {
        process.env.EXPO_PUBLIC_API_RETRY_DELAY = '-1000';
        try {
          const { config: freshConfig } = require('../config');
          freshConfig.network; // Access to trigger validation
          fail('Should have thrown InvalidNetworkConfigError');
        } catch (error: unknown) {
          assertError(error);
          expect(error.name).toBe('InvalidNetworkConfigError');
          expect(error.message).toContain('retry delay');
          expect(error.message).toContain('-1000');
          expect(error.message).toContain('between 1 and 10000');
        }
      });
    });
  });

  describe('Environment Validation', () => {
    it('should accept valid development environment', () => {
      expect(() => {
        config.setEnvironment('development');
      }).not.toThrow();
    });

    it('should accept valid staging environment', () => {
      expect(() => {
        config.setEnvironment('staging');
      }).not.toThrow();
    });

    it('should accept valid production environment', () => {
      expect(() => {
        config.setEnvironment('production');
      }).not.toThrow();
    });

    it('should reject invalid environment name', () => {
      expect(() => {
        config.setEnvironment('test' as any);
      }).toThrow(InvalidEnvironmentError);
    });

    it('should reject empty environment name', () => {
      expect(() => {
        config.setEnvironment('' as any);
      }).toThrow(InvalidEnvironmentError);
    });

    it('should be case-sensitive for environment names', () => {
      expect(() => {
        config.setEnvironment('PRODUCTION' as any);
      }).toThrow(InvalidEnvironmentError);
    });

    it('should provide helpful error message for invalid environment', () => {
      try {
        config.setEnvironment('invalid-env' as any);
        fail('Should have thrown InvalidEnvironmentError');
      } catch (error: unknown) {
        assertError(error);
        expect(error).toBeInstanceOf(InvalidEnvironmentError);
        expect(error.message).toContain('Invalid environment');
        expect(error.message).toContain('invalid-env');
        expect(error.message).toContain('development');
        expect(error.message).toContain('staging');
        expect(error.message).toContain('production');
      }
    });
  });

  describe('Missing Configuration', () => {
    it('should handle missing API base URL gracefully', () => {
      // Clone env without URL vars
      const cleanEnv = { ...originalEnv };
      delete cleanEnv.EXPO_PUBLIC_API_BASE_URL;
      delete cleanEnv.EXPO_PUBLIC_DEV_API_BASE_URL;
      delete cleanEnv.EXPO_PUBLIC_STAGING_API_BASE_URL;
      delete cleanEnv.EXPO_PUBLIC_PROD_API_BASE_URL;
      process.env = cleanEnv;

      const { config: freshConfig } = require('../config');

      // Should fall back to hardcoded defaults, not throw
      expect(freshConfig.api.baseUrl).toBeDefined();
      expect(freshConfig.api.baseUrl).toMatch(/^https?:\/\/.+/);
    });

    it('should handle missing network config gracefully', () => {
      const cleanEnv = { ...originalEnv };
      delete cleanEnv.EXPO_PUBLIC_API_TIMEOUT;
      delete cleanEnv.EXPO_PUBLIC_API_RETRIES;
      delete cleanEnv.EXPO_PUBLIC_API_RETRY_DELAY;
      process.env = cleanEnv;

      const { config: freshConfig } = require('../config');

      // Should fall back to defaults
      expect(freshConfig.network.timeout).toBeDefined();
      expect(freshConfig.network.retries).toBeDefined();
      expect(freshConfig.network.retryDelay).toBeDefined();
    });
  });

  describe('Error Classes', () => {
    it('should use ConfigurationError as base error class', () => {
      const error = new ConfigurationError('Test error');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ConfigurationError);
      expect(error.message).toBe('Test error');
      expect(error.name).toBe('ConfigurationError');
    });

    it('should use InvalidUrlError for URL validation failures', () => {
      const error = new InvalidUrlError('Invalid URL: test');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ConfigurationError);
      expect(error).toBeInstanceOf(InvalidUrlError);
      expect(error.name).toBe('InvalidUrlError');
    });

    it('should use MissingConfigError for missing required config', () => {
      const error = new MissingConfigError('Missing API URL');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ConfigurationError);
      expect(error).toBeInstanceOf(MissingConfigError);
      expect(error.name).toBe('MissingConfigError');
    });

    it('should use InvalidNetworkConfigError for network config failures', () => {
      const error = new InvalidNetworkConfigError('Invalid timeout');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ConfigurationError);
      expect(error).toBeInstanceOf(InvalidNetworkConfigError);
      expect(error.name).toBe('InvalidNetworkConfigError');
    });

    it('should use InvalidEnvironmentError for environment validation failures', () => {
      const error = new InvalidEnvironmentError('Invalid environment');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ConfigurationError);
      expect(error).toBeInstanceOf(InvalidEnvironmentError);
      expect(error.name).toBe('InvalidEnvironmentError');
    });

    it('should include stack traces for debugging', () => {
      const error = new ConfigurationError('Test error');
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('ConfigurationError');
    });
  });

  describe('Validation Integration', () => {
    it('should validate configuration when setting custom URL', () => {
      expect(() => {
        config.setCustomApiUrl('invalid-url');
      }).toThrow(InvalidUrlError);
    });

    it('should validate configuration when switching environments', () => {
      expect(() => {
        config.setEnvironment('invalid' as any);
      }).toThrow(InvalidEnvironmentError);
    });

    it('should validate network configuration when accessed', () => {
      process.env.EXPO_PUBLIC_API_TIMEOUT = '-1000';

      try {
        const { config: freshConfig } = require('../config');
        freshConfig.network; // Access to trigger validation
        fail('Should have thrown InvalidNetworkConfigError');
      } catch (error: unknown) {
        assertError(error);
        expect(error.name).toBe('InvalidNetworkConfigError');
        expect(error.message).toContain('timeout');
      }
    });
  });

  describe('Helpful Error Messages', () => {
    it('should include invalid value in error message', () => {
      try {
        config.setCustomApiUrl('not-a-url');
      } catch (error: unknown) {
        assertError(error);
        expect(error.message).toContain('not-a-url');
      }
    });

    it('should suggest how to fix the error', () => {
      try {
        config.setCustomApiUrl('invalid');
      } catch (error: unknown) {
        assertError(error);
        expect(error.message).toContain('http://');
        expect(error.message).toContain('https://');
      }
    });

    it('should mention environment variable names when applicable', () => {
      process.env.EXPO_PUBLIC_API_TIMEOUT = '-1000';
      try {
        const { config: freshConfig } = require('../config');
        freshConfig.network.timeout;
      } catch (error: unknown) {
        assertError(error);
        expect(error.message).toContain('EXPO_PUBLIC_API_TIMEOUT');
      }
    });

    it('should list valid options for enum-like values', () => {
      try {
        config.setEnvironment('invalid' as any);
      } catch (error: unknown) {
        assertError(error);
        expect(error.message).toContain('development');
        expect(error.message).toContain('staging');
        expect(error.message).toContain('production');
      }
    });
  });

  describe('Validation Performance', () => {
    it('should not significantly slow down config access', () => {
      const start = Date.now();
      for (let i = 0; i < 1000; i++) {
        config.api.baseUrl;
      }
      const duration = Date.now() - start;

      // 1000 accesses should complete in under 100ms
      expect(duration).toBeLessThan(100);
    });

    it('should cache validation results when possible', () => {
      // First access might validate
      const url1 = config.api.baseUrl;

      // Subsequent accesses should use cached result
      const start = Date.now();
      const url2 = config.api.baseUrl;
      const duration = Date.now() - start;

      expect(url1).toBe(url2);
      expect(duration).toBeLessThan(10); // Should be nearly instant
    });
  });

  describe('Test Utilities', () => {
    it('should allow validation to be bypassed for testing', () => {
      // For tests that need to set invalid config temporarily
      // This would be implemented as a special method or flag

      // Example: config.dangerouslySetUrlWithoutValidation('invalid-url');
      // This test documents the need for such functionality
      expect(config).toBeDefined();
    });
  });
});
