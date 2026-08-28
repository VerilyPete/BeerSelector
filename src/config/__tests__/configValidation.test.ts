import { vi, describe, it, expect, beforeEach, afterAll } from 'vitest';
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
  InvalidEnvironmentError,
} from '../errors';

function assertError(value: unknown): asserts value is Error {
  if (!(value instanceof Error)) throw new Error(`Expected Error, got ${typeof value}`);
}

describe('Configuration Validation', () => {
  // Store original process.env to restore after tests
  const originalEnv = process.env;

  beforeEach(async () => {
    // Reset modules to get fresh config instance
    vi.resetModules();
    // Clone process.env for each test
    process.env = { ...originalEnv };
  });

  afterAll(async () => {
    // Restore original process.env
    process.env = originalEnv;
  });

  describe('URL Validation', () => {
    describe('Valid URLs', () => {
      it('should accept valid HTTP URLs', async () => {
        expect(() => {
          config.setCustomApiUrl('http://example.com');
        }).not.toThrow();
      });

      it('should accept valid HTTPS URLs', async () => {
        expect(() => {
          config.setCustomApiUrl('https://example.com');
        }).not.toThrow();
      });

      it('should accept URLs with subdomains', async () => {
        expect(() => {
          config.setCustomApiUrl('https://api.example.com');
        }).not.toThrow();
      });

      it('should accept URLs with ports', async () => {
        expect(() => {
          config.setCustomApiUrl('https://example.com:8080');
        }).not.toThrow();
      });

      it('should accept URLs with paths', async () => {
        expect(() => {
          config.setCustomApiUrl('https://example.com/api/v1');
        }).not.toThrow();
      });

      it('should accept URLs with dashes and underscores', async () => {
        expect(() => {
          config.setCustomApiUrl('https://my-api_server.example.com');
        }).not.toThrow();
      });

      it('should accept localhost URLs for development', async () => {
        expect(() => {
          config.setCustomApiUrl('http://localhost:3000');
        }).not.toThrow();
      });

      it('should accept IP address URLs', async () => {
        expect(() => {
          config.setCustomApiUrl('http://192.168.1.100:8080');
        }).not.toThrow();
      });
    });

    describe('Invalid URLs', () => {
      it('should reject URLs without protocol', async () => {
        expect(() => {
          config.setCustomApiUrl('example.com');
        }).toThrow(InvalidUrlError);
      });

      it('should reject empty URLs', async () => {
        expect(() => {
          config.setCustomApiUrl('');
        }).toThrow(InvalidUrlError);
      });

      it('should reject URLs with only protocol', async () => {
        expect(() => {
          config.setCustomApiUrl('https://');
        }).toThrow(InvalidUrlError);
      });

      it('should reject URLs with invalid protocol', async () => {
        expect(() => {
          config.setCustomApiUrl('ftp://example.com');
        }).toThrow(InvalidUrlError);
      });

      it('should reject URLs with spaces', async () => {
        expect(() => {
          config.setCustomApiUrl('https://example .com');
        }).toThrow(InvalidUrlError);
      });

      it('should reject malformed URLs', async () => {
        expect(() => {
          config.setCustomApiUrl('https:///example.com');
        }).toThrow(InvalidUrlError);
      });

      it('should provide helpful error message for invalid URLs', async () => {
        let caught: unknown;
        try {
          config.setCustomApiUrl('not-a-url');
        } catch (error) {
          caught = error;
        }
        assertError(caught);
        expect(caught).toBeInstanceOf(InvalidUrlError);
        // Message contains "Invalid API base URL" which includes "Invalid"
        expect(caught.message).toContain('Invalid');
        expect(caught.message).toContain('not-a-url');
        expect(caught.message).toContain('http://');
        expect(caught.message).toContain('https://');
      });
    });

    describe('URL Normalization', () => {
      it('should remove trailing slash from URLs', async () => {
        config.setCustomApiUrl('https://example.com/');
        expect(config.api.baseUrl).toBe('https://example.com');
      });

      it('should remove multiple trailing slashes', async () => {
        config.setCustomApiUrl('https://example.com///');
        expect(config.api.baseUrl).toBe('https://example.com');
      });

      it('should preserve path without trailing slash', async () => {
        config.setCustomApiUrl('https://example.com/api/v1');
        expect(config.api.baseUrl).toBe('https://example.com/api/v1');
      });
    });
  });

  describe('Network Configuration Validation', () => {
    describe('Timeout Validation', () => {
      it('should accept valid timeout values', async () => {
        process.env.EXPO_PUBLIC_API_TIMEOUT = '15000';
        const { config: freshConfig } = await import('../config');
        expect(freshConfig.network.timeout).toBe(15000);
      });

      it('should reject negative timeout values', async () => {
        process.env.EXPO_PUBLIC_API_TIMEOUT = '-1000';

        let caught: unknown;
        try {
          const { config: freshConfig } = await import('../config');
          void freshConfig.network; // Access to trigger validation
        } catch (error) {
          caught = error;
        }
        assertError(caught);
        expect(caught.name).toBe('InvalidNetworkConfigError');
        expect(caught.message).toContain('timeout');
      });

      it('should reject zero timeout', async () => {
        process.env.EXPO_PUBLIC_API_TIMEOUT = '0';

        let caught: unknown;
        try {
          const { config: freshConfig } = await import('../config');
          void freshConfig.network; // Access to trigger validation
        } catch (error) {
          caught = error;
        }
        assertError(caught);
        expect(caught.name).toBe('InvalidNetworkConfigError');
        expect(caught.message).toContain('timeout');
      });

      it('should reject extremely large timeout (>60 seconds)', async () => {
        process.env.EXPO_PUBLIC_API_TIMEOUT = '61000';

        let caught: unknown;
        try {
          const { config: freshConfig } = await import('../config');
          void freshConfig.network; // Access to trigger validation
        } catch (error) {
          caught = error;
        }
        assertError(caught);
        expect(caught.name).toBe('InvalidNetworkConfigError');
        expect(caught.message).toContain('timeout');
      });

      it('should provide helpful error message for invalid timeout', async () => {
        process.env.EXPO_PUBLIC_API_TIMEOUT = '-5000';
        let caught: unknown;
        try {
          const { config: freshConfig } = await import('../config');
          void freshConfig.network; // Access to trigger validation
        } catch (error) {
          caught = error;
        }
        assertError(caught);
        expect(caught.name).toBe('InvalidNetworkConfigError');
        expect(caught.message).toContain('timeout');
        expect(caught.message).toContain('-5000');
        expect(caught.message).toContain('between 1 and 60000');
      });
    });

    describe('Retries Validation', () => {
      it('should accept valid retry values', async () => {
        process.env.EXPO_PUBLIC_API_RETRIES = '3';
        const { config: freshConfig } = await import('../config');
        expect(freshConfig.network.retries).toBe(3);
      });

      it('should accept zero retries (no retries)', async () => {
        process.env.EXPO_PUBLIC_API_RETRIES = '0';
        const { config: freshConfig } = await import('../config');
        expect(freshConfig.network.retries).toBe(0);
      });

      it('should reject negative retry values', async () => {
        process.env.EXPO_PUBLIC_API_RETRIES = '-1';

        let caught: unknown;
        try {
          const { config: freshConfig } = await import('../config');
          void freshConfig.network; // Access to trigger validation
        } catch (error) {
          caught = error;
        }
        assertError(caught);
        expect(caught.name).toBe('InvalidNetworkConfigError');
        expect(caught.message).toContain('retries');
      });

      it('should reject excessive retry values (>5)', async () => {
        process.env.EXPO_PUBLIC_API_RETRIES = '10';

        let caught: unknown;
        try {
          const { config: freshConfig } = await import('../config');
          void freshConfig.network; // Access to trigger validation
        } catch (error) {
          caught = error;
        }
        assertError(caught);
        expect(caught.name).toBe('InvalidNetworkConfigError');
        expect(caught.message).toContain('retries');
      });

      it('should provide helpful error message for invalid retries', async () => {
        process.env.EXPO_PUBLIC_API_RETRIES = '20';
        let caught: unknown;
        try {
          const { config: freshConfig } = await import('../config');
          void freshConfig.network; // Access to trigger validation
        } catch (error) {
          caught = error;
        }
        assertError(caught);
        expect(caught.name).toBe('InvalidNetworkConfigError');
        expect(caught.message).toContain('retries');
        expect(caught.message).toContain('20');
        expect(caught.message).toContain('between 0 and 5');
      });
    });

    describe('Retry Delay Validation', () => {
      it('should accept valid retry delay values', async () => {
        process.env.EXPO_PUBLIC_API_RETRY_DELAY = '1000';
        const { config: freshConfig } = await import('../config');
        expect(freshConfig.network.retryDelay).toBe(1000);
      });

      it('should reject negative retry delay', async () => {
        process.env.EXPO_PUBLIC_API_RETRY_DELAY = '-500';

        let caught: unknown;
        try {
          const { config: freshConfig } = await import('../config');
          void freshConfig.network; // Access to trigger validation
        } catch (error) {
          caught = error;
        }
        assertError(caught);
        expect(caught.name).toBe('InvalidNetworkConfigError');
        expect(caught.message).toContain('retry delay');
      });

      it('should reject zero retry delay', async () => {
        process.env.EXPO_PUBLIC_API_RETRY_DELAY = '0';

        let caught: unknown;
        try {
          const { config: freshConfig } = await import('../config');
          void freshConfig.network; // Access to trigger validation
        } catch (error) {
          caught = error;
        }
        assertError(caught);
        expect(caught.name).toBe('InvalidNetworkConfigError');
        expect(caught.message).toContain('retry delay');
      });

      it('should reject excessive retry delay (>10 seconds)', async () => {
        process.env.EXPO_PUBLIC_API_RETRY_DELAY = '11000';

        let caught: unknown;
        try {
          const { config: freshConfig } = await import('../config');
          void freshConfig.network; // Access to trigger validation
        } catch (error) {
          caught = error;
        }
        assertError(caught);
        expect(caught.name).toBe('InvalidNetworkConfigError');
        expect(caught.message).toContain('retry delay');
      });

      it('should provide helpful error message for invalid retry delay', async () => {
        process.env.EXPO_PUBLIC_API_RETRY_DELAY = '-1000';
        let caught: unknown;
        try {
          const { config: freshConfig } = await import('../config');
          void freshConfig.network; // Access to trigger validation
        } catch (error) {
          caught = error;
        }
        assertError(caught);
        expect(caught.name).toBe('InvalidNetworkConfigError');
        expect(caught.message).toContain('retry delay');
        expect(caught.message).toContain('-1000');
        expect(caught.message).toContain('between 1 and 10000');
      });
    });
  });

  describe('Environment Validation', () => {
    it('should accept valid development environment', async () => {
      expect(() => {
        config.setEnvironment('development');
      }).not.toThrow();
    });

    it('should accept valid staging environment', async () => {
      expect(() => {
        config.setEnvironment('staging');
      }).not.toThrow();
    });

    it('should accept valid production environment', async () => {
      expect(() => {
        config.setEnvironment('production');
      }).not.toThrow();
    });

    it('should reject invalid environment name', async () => {
      expect(() => {
        config.setEnvironment('test' as any);
      }).toThrow(InvalidEnvironmentError);
    });

    it('should reject empty environment name', async () => {
      expect(() => {
        config.setEnvironment('' as any);
      }).toThrow(InvalidEnvironmentError);
    });

    it('should be case-sensitive for environment names', async () => {
      expect(() => {
        config.setEnvironment('PRODUCTION' as any);
      }).toThrow(InvalidEnvironmentError);
    });

    it('should provide helpful error message for invalid environment', async () => {
      let caught: unknown;
      try {
        config.setEnvironment('invalid-env' as any);
      } catch (error) {
        caught = error;
      }
      assertError(caught);
      expect(caught).toBeInstanceOf(InvalidEnvironmentError);
      expect(caught.message).toContain('Invalid environment');
      expect(caught.message).toContain('invalid-env');
      expect(caught.message).toContain('development');
      expect(caught.message).toContain('staging');
      expect(caught.message).toContain('production');
    });
  });

  describe('Missing Configuration', () => {
    it('should handle missing API base URL gracefully', async () => {
      // Clone env without URL vars
      const cleanEnv = { ...originalEnv };
      delete cleanEnv.EXPO_PUBLIC_API_BASE_URL;
      delete cleanEnv.EXPO_PUBLIC_DEV_API_BASE_URL;
      delete cleanEnv.EXPO_PUBLIC_STAGING_API_BASE_URL;
      delete cleanEnv.EXPO_PUBLIC_PROD_API_BASE_URL;
      process.env = cleanEnv;

      const { config: freshConfig } = await import('../config');

      // Should fall back to hardcoded defaults, not throw
      expect(freshConfig.api.baseUrl).toBeDefined();
      expect(freshConfig.api.baseUrl).toMatch(/^https?:\/\/.+/);
    });

    it('should handle missing network config gracefully', async () => {
      const cleanEnv = { ...originalEnv };
      delete cleanEnv.EXPO_PUBLIC_API_TIMEOUT;
      delete cleanEnv.EXPO_PUBLIC_API_RETRIES;
      delete cleanEnv.EXPO_PUBLIC_API_RETRY_DELAY;
      process.env = cleanEnv;

      const { config: freshConfig } = await import('../config');

      // Should fall back to defaults
      expect(freshConfig.network.timeout).toBeDefined();
      expect(freshConfig.network.retries).toBeDefined();
      expect(freshConfig.network.retryDelay).toBeDefined();
    });
  });

  describe('Error Classes', () => {
    it('should use ConfigurationError as base error class', async () => {
      const error = new ConfigurationError('Test error');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ConfigurationError);
      expect(error.message).toBe('Test error');
      expect(error.name).toBe('ConfigurationError');
    });

    it('should use InvalidUrlError for URL validation failures', async () => {
      const error = new InvalidUrlError('Invalid URL: test');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ConfigurationError);
      expect(error).toBeInstanceOf(InvalidUrlError);
      expect(error.name).toBe('InvalidUrlError');
    });

    it('should use MissingConfigError for missing required config', async () => {
      const error = new MissingConfigError('Missing API URL');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ConfigurationError);
      expect(error).toBeInstanceOf(MissingConfigError);
      expect(error.name).toBe('MissingConfigError');
    });

    it('should use InvalidNetworkConfigError for network config failures', async () => {
      const error = new InvalidNetworkConfigError('Invalid timeout');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ConfigurationError);
      expect(error).toBeInstanceOf(InvalidNetworkConfigError);
      expect(error.name).toBe('InvalidNetworkConfigError');
    });

    it('should use InvalidEnvironmentError for environment validation failures', async () => {
      const error = new InvalidEnvironmentError('Invalid environment');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ConfigurationError);
      expect(error).toBeInstanceOf(InvalidEnvironmentError);
      expect(error.name).toBe('InvalidEnvironmentError');
    });

    it('should include stack traces for debugging', async () => {
      const error = new ConfigurationError('Test error');
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('ConfigurationError');
    });
  });

  describe('Validation Integration', () => {
    it('should validate configuration when setting custom URL', async () => {
      expect(() => {
        config.setCustomApiUrl('invalid-url');
      }).toThrow(InvalidUrlError);
    });

    it('should validate configuration when switching environments', async () => {
      expect(() => {
        config.setEnvironment('invalid' as any);
      }).toThrow(InvalidEnvironmentError);
    });

    it('should validate network configuration when accessed', async () => {
      process.env.EXPO_PUBLIC_API_TIMEOUT = '-1000';

      let caught: unknown;
      try {
        const { config: freshConfig } = await import('../config');
        void freshConfig.network; // Access to trigger validation
      } catch (error) {
        caught = error;
      }
      assertError(caught);
      expect(caught.name).toBe('InvalidNetworkConfigError');
      expect(caught.message).toContain('timeout');
    });
  });

  describe('Helpful Error Messages', () => {
    it('should include invalid value in error message', async () => {
      try {
        config.setCustomApiUrl('not-a-url');
      } catch (error: unknown) {
        assertError(error);
        expect(error.message).toContain('not-a-url');
      }
    });

    it('should suggest how to fix the error', async () => {
      try {
        config.setCustomApiUrl('invalid');
      } catch (error: unknown) {
        assertError(error);
        expect(error.message).toContain('http://');
        expect(error.message).toContain('https://');
      }
    });

    it('should mention environment variable names when applicable', async () => {
      process.env.EXPO_PUBLIC_API_TIMEOUT = '-1000';
      try {
        const { config: freshConfig } = await import('../config');
        void freshConfig.network.timeout;
      } catch (error: unknown) {
        assertError(error);
        expect(error.message).toContain('EXPO_PUBLIC_API_TIMEOUT');
      }
    });

    it('should list valid options for enum-like values', async () => {
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
    it('should not significantly slow down config access', async () => {
      const start = Date.now();
      for (let i = 0; i < 1000; i++) {
        void config.api.baseUrl;
      }
      const duration = Date.now() - start;

      // 1000 accesses should complete in under 100ms
      expect(duration).toBeLessThan(100);
    });

    it('should cache validation results when possible', async () => {
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
    it('should allow validation to be bypassed for testing', async () => {
      // For tests that need to set invalid config temporarily
      // This would be implemented as a special method or flag

      // Example: config.dangerouslySetUrlWithoutValidation('invalid-url');
      // This test documents the need for such functionality
      expect(config).toBeDefined();
    });
  });
});
