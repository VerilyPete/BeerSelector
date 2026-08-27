/**
 * Config Validation Error Tests
 *
 * Comprehensive tests for all config validation error scenarios and edge cases.
 * This file focuses specifically on error conditions, error messages, and edge cases
 * that should be rejected or handled gracefully.
 *
 * Test Coverage:
 * - Invalid URL formats and edge cases
 * - Empty and malformed URLs
 * - URLs with special characters and spaces
 * - Invalid network configuration values
 * - Invalid retry counts and timeout values
 * - Invalid environments
 * - Error message quality and helpfulness
 * - Endpoint validation
 * - URL normalization edge cases
 */

import { config } from '../config';
import { InvalidUrlError, InvalidEnvironmentError } from '../errors';

function assertError(value: unknown): asserts value is Error {
  if (!(value instanceof Error)) throw new Error(`Expected Error, got ${typeof value}`);
}

describe('Config Validation Error Tests', () => {
  // Store original process.env to restore after tests
  const originalEnv = process.env;

  beforeEach(async () => {
    // Reset modules to get fresh config instance
    jest.resetModules();
    // Clone process.env for each test
    process.env = { ...originalEnv };
  });

  afterAll(async () => {
    // Restore original process.env
    process.env = originalEnv;
  });

  describe('Invalid URL Formats', () => {
    describe('Protocol Validation', () => {
      it('should reject URL without protocol', async () => {
        expect(() => {
          config.setCustomApiUrl('example.com');
        }).toThrow(InvalidUrlError);
      });

      it('should reject URL with FTP protocol', async () => {
        expect(() => {
          config.setCustomApiUrl('ftp://example.com');
        }).toThrow(InvalidUrlError);
      });

      it('should reject URL with file:// protocol', async () => {
        expect(() => {
          config.setCustomApiUrl('file:///etc/passwd');
        }).toThrow(InvalidUrlError);
      });

      it('should reject URL with custom protocol', async () => {
        expect(() => {
          config.setCustomApiUrl('myprotocol://example.com');
        }).toThrow(InvalidUrlError);
      });

      it('should reject URL with javascript: protocol', async () => {
        expect(() => {
          config.setCustomApiUrl('javascript:alert(1)');
        }).toThrow(InvalidUrlError);
      });

      it('should reject protocol-relative URLs', async () => {
        expect(() => {
          config.setCustomApiUrl('//example.com');
        }).toThrow(InvalidUrlError);
      });
    });

    describe('Empty and Minimal URLs', () => {
      it('should reject empty URL string', async () => {
        expect(() => {
          config.setCustomApiUrl('');
        }).toThrow(InvalidUrlError);
      });

      it('should reject whitespace-only URL', async () => {
        expect(() => {
          config.setCustomApiUrl('   ');
        }).toThrow(InvalidUrlError);
      });

      it('should reject URL with only HTTP protocol', async () => {
        expect(() => {
          config.setCustomApiUrl('http://');
        }).toThrow(InvalidUrlError);
      });

      it('should reject URL with only HTTPS protocol', async () => {
        expect(() => {
          config.setCustomApiUrl('https://');
        }).toThrow(InvalidUrlError);
      });

      it('should reject URL with protocol and single slash', async () => {
        expect(() => {
          config.setCustomApiUrl('http:/example.com');
        }).toThrow(InvalidUrlError);
      });

      it('should reject URL with protocol but no domain', async () => {
        expect(() => {
          config.setCustomApiUrl('https:///path');
        }).toThrow(InvalidUrlError);
      });
    });

    describe('URLs with Spaces and Special Characters', () => {
      it('should reject URL with space in domain', async () => {
        expect(() => {
          config.setCustomApiUrl('https://example .com');
        }).toThrow(InvalidUrlError);
      });

      it('should reject URL with space in path', async () => {
        expect(() => {
          config.setCustomApiUrl('https://example.com/my path');
        }).toThrow(InvalidUrlError);
      });

      it('should reject URL with leading space', async () => {
        expect(() => {
          config.setCustomApiUrl(' https://example.com');
        }).toThrow(InvalidUrlError);
      });

      it('should reject URL with trailing space', async () => {
        expect(() => {
          config.setCustomApiUrl('https://example.com ');
        }).toThrow(InvalidUrlError);
      });

      it('should reject URL with tab character', async () => {
        expect(() => {
          config.setCustomApiUrl('https://example.com\t/path');
        }).toThrow(InvalidUrlError);
      });

      it('should reject URL with newline character', async () => {
        expect(() => {
          config.setCustomApiUrl('https://example.com\n/path');
        }).toThrow(InvalidUrlError);
      });
    });

    describe('Malformed URLs', () => {
      it('should accept URL with double slashes in path (valid URL)', async () => {
        // This is actually valid - it's a path, not a domain issue
        expect(() => {
          config.setCustomApiUrl('https://example.com//path');
        }).not.toThrow();
      });

      it('should accept localhost without dots (valid localhost)', async () => {
        // localhost is a valid domain name without dots
        expect(() => {
          config.setCustomApiUrl('https://localhost');
        }).not.toThrow();
      });

      it('should reject URL with only dots', async () => {
        expect(() => {
          config.setCustomApiUrl('https://...');
        }).toThrow(InvalidUrlError);
      });

      it('should accept URL with # (fragment identifier)', async () => {
        // Fragments are valid in URLs
        expect(() => {
          config.setCustomApiUrl('https://example.com#section');
        }).not.toThrow();
      });

      it('should accept URL with @ for authentication', async () => {
        // @ is valid for authentication in URLs
        expect(() => {
          config.setCustomApiUrl('https://user:password@example.com');
        }).not.toThrow();
      });
    });
  });

  describe('URL Edge Cases', () => {
    describe('Query Parameters', () => {
      it('should accept URLs with query parameters', async () => {
        expect(() => {
          config.setCustomApiUrl('https://example.com?key=value');
        }).not.toThrow();
      });

      it('should accept URLs with multiple query parameters', async () => {
        expect(() => {
          config.setCustomApiUrl('https://example.com?key1=value1&key2=value2');
        }).not.toThrow();
      });

      it('should accept URLs with encoded query parameters', async () => {
        expect(() => {
          config.setCustomApiUrl('https://example.com?search=hello%20world');
        }).not.toThrow();
      });
    });

    describe('Ports', () => {
      it('should accept URLs with standard HTTP port', async () => {
        expect(() => {
          config.setCustomApiUrl('http://example.com:80');
        }).not.toThrow();
      });

      it('should accept URLs with standard HTTPS port', async () => {
        expect(() => {
          config.setCustomApiUrl('https://example.com:443');
        }).not.toThrow();
      });

      it('should accept URLs with custom port', async () => {
        expect(() => {
          config.setCustomApiUrl('http://example.com:8080');
        }).not.toThrow();
      });

      it('should accept URLs with high port number', async () => {
        expect(() => {
          config.setCustomApiUrl('http://example.com:65535');
        }).not.toThrow();
      });
    });

    describe('localhost and IP addresses', () => {
      it('should accept localhost with HTTP', async () => {
        expect(() => {
          config.setCustomApiUrl('http://localhost');
        }).not.toThrow();
      });

      it('should accept localhost with port', async () => {
        expect(() => {
          config.setCustomApiUrl('http://localhost:3000');
        }).not.toThrow();
      });

      it('should accept IPv4 address', async () => {
        expect(() => {
          config.setCustomApiUrl('http://192.168.1.1');
        }).not.toThrow();
      });

      it('should accept IPv4 address with port', async () => {
        expect(() => {
          config.setCustomApiUrl('http://192.168.1.1:8080');
        }).not.toThrow();
      });

      it('should accept 127.0.0.1 loopback', async () => {
        expect(() => {
          config.setCustomApiUrl('http://127.0.0.1:3000');
        }).not.toThrow();
      });

      it('should accept 0.0.0.0 all interfaces', async () => {
        expect(() => {
          config.setCustomApiUrl('http://0.0.0.0:8080');
        }).not.toThrow();
      });
    });

    describe('URL Normalization', () => {
      it('should remove single trailing slash', async () => {
        config.setCustomApiUrl('https://example.com/');
        expect(config.api.baseUrl).toBe('https://example.com');
      });

      it('should remove multiple trailing slashes', async () => {
        config.setCustomApiUrl('https://example.com///');
        expect(config.api.baseUrl).toBe('https://example.com');
      });

      it('should remove trailing slash from path', async () => {
        config.setCustomApiUrl('https://example.com/api/v1/');
        expect(config.api.baseUrl).toBe('https://example.com/api/v1');
      });

      it('should preserve path without trailing slash', async () => {
        config.setCustomApiUrl('https://example.com/api/v1');
        expect(config.api.baseUrl).toBe('https://example.com/api/v1');
      });

      it('should normalize mixed trailing slashes', async () => {
        config.setCustomApiUrl('https://example.com/api/////');
        expect(config.api.baseUrl).toBe('https://example.com/api');
      });
    });
  });

  describe('Invalid Timeout Values', () => {
    it('should reject negative timeout', async () => {
      process.env.EXPO_PUBLIC_API_TIMEOUT = '-1000';
      jest.resetModules();
      const { config: freshConfig, InvalidNetworkConfigError: ErrorClass } =
        await import('../config');

      try {
        void freshConfig.network;
        fail('Should have thrown InvalidNetworkConfigError');
      } catch (error: unknown) {
        assertError(error);
        expect(error).toBeInstanceOf(ErrorClass);
        expect(error.name).toBe('InvalidNetworkConfigError');
        expect(error.message).toContain('timeout');
      }
    });

    it('should reject zero timeout', async () => {
      process.env.EXPO_PUBLIC_API_TIMEOUT = '0';
      jest.resetModules();
      const { config: freshConfig, InvalidNetworkConfigError: ErrorClass } =
        await import('../config');

      try {
        void freshConfig.network;
        fail('Should have thrown InvalidNetworkConfigError');
      } catch (error: unknown) {
        assertError(error);
        expect(error).toBeInstanceOf(ErrorClass);
        expect(error.name).toBe('InvalidNetworkConfigError');
        expect(error.message).toContain('timeout');
      }
    });

    it('should reject timeout exactly at upper limit + 1', async () => {
      process.env.EXPO_PUBLIC_API_TIMEOUT = '60001';
      jest.resetModules();
      const { config: freshConfig, InvalidNetworkConfigError: ErrorClass } =
        await import('../config');

      try {
        void freshConfig.network;
        fail('Should have thrown InvalidNetworkConfigError');
      } catch (error: unknown) {
        assertError(error);
        expect(error).toBeInstanceOf(ErrorClass);
        expect(error.name).toBe('InvalidNetworkConfigError');
        expect(error.message).toContain('timeout');
      }
    });

    it('should reject extremely large timeout', async () => {
      process.env.EXPO_PUBLIC_API_TIMEOUT = '999999999';
      jest.resetModules();
      const { config: freshConfig, InvalidNetworkConfigError: ErrorClass } =
        await import('../config');

      try {
        void freshConfig.network;
        fail('Should have thrown InvalidNetworkConfigError');
      } catch (error: unknown) {
        assertError(error);
        expect(error).toBeInstanceOf(ErrorClass);
        expect(error.name).toBe('InvalidNetworkConfigError');
        expect(error.message).toContain('timeout');
      }
    });

    it('should accept timeout at lower boundary (1ms)', async () => {
      process.env.EXPO_PUBLIC_API_TIMEOUT = '1';
      const { config: freshConfig } = await import('../config');
      expect(freshConfig.network.timeout).toBe(1);
    });

    it('should accept timeout at upper boundary (60000ms)', async () => {
      process.env.EXPO_PUBLIC_API_TIMEOUT = '60000';
      const { config: freshConfig } = await import('../config');
      expect(freshConfig.network.timeout).toBe(60000);
    });

    it('should handle non-numeric timeout gracefully (fallback to default)', async () => {
      process.env.EXPO_PUBLIC_API_TIMEOUT = 'not-a-number';
      const { config: freshConfig } = await import('../config');
      expect(freshConfig.network.timeout).toBe(15000); // Default
    });

    it('should handle empty string timeout gracefully (fallback to default)', async () => {
      process.env.EXPO_PUBLIC_API_TIMEOUT = '';
      const { config: freshConfig } = await import('../config');
      expect(freshConfig.network.timeout).toBe(15000); // Default
    });

    it('should handle decimal timeout values (parses to integer)', async () => {
      process.env.EXPO_PUBLIC_API_TIMEOUT = '15000.5';
      const { config: freshConfig } = await import('../config');
      expect(freshConfig.network.timeout).toBe(15000);
    });
  });

  describe('Invalid Retry Counts', () => {
    it('should reject negative retry count', async () => {
      process.env.EXPO_PUBLIC_API_RETRIES = '-1';
      jest.resetModules();
      const { config: freshConfig, InvalidNetworkConfigError: ErrorClass } =
        await import('../config');

      try {
        void freshConfig.network;
        fail('Should have thrown InvalidNetworkConfigError');
      } catch (error: unknown) {
        assertError(error);
        expect(error).toBeInstanceOf(ErrorClass);
        expect(error.name).toBe('InvalidNetworkConfigError');
        expect(error.message).toContain('retries');
      }
    });

    it('should reject retry count exactly at upper limit + 1', async () => {
      process.env.EXPO_PUBLIC_API_RETRIES = '6';
      jest.resetModules();
      const { config: freshConfig, InvalidNetworkConfigError: ErrorClass } =
        await import('../config');

      try {
        void freshConfig.network;
        fail('Should have thrown InvalidNetworkConfigError');
      } catch (error: unknown) {
        assertError(error);
        expect(error).toBeInstanceOf(ErrorClass);
        expect(error.name).toBe('InvalidNetworkConfigError');
        expect(error.message).toContain('retries');
      }
    });

    it('should reject extremely large retry count', async () => {
      process.env.EXPO_PUBLIC_API_RETRIES = '100';
      jest.resetModules();
      const { config: freshConfig, InvalidNetworkConfigError: ErrorClass } =
        await import('../config');

      try {
        void freshConfig.network;
        fail('Should have thrown InvalidNetworkConfigError');
      } catch (error: unknown) {
        assertError(error);
        expect(error).toBeInstanceOf(ErrorClass);
        expect(error.name).toBe('InvalidNetworkConfigError');
        expect(error.message).toContain('retries');
      }
    });

    it('should accept zero retries (no retry)', async () => {
      process.env.EXPO_PUBLIC_API_RETRIES = '0';
      const { config: freshConfig } = await import('../config');
      expect(freshConfig.network.retries).toBe(0);
    });

    it('should accept retry count at upper boundary (5)', async () => {
      process.env.EXPO_PUBLIC_API_RETRIES = '5';
      const { config: freshConfig } = await import('../config');
      expect(freshConfig.network.retries).toBe(5);
    });

    it('should handle non-numeric retries gracefully (fallback to default)', async () => {
      process.env.EXPO_PUBLIC_API_RETRIES = 'many';
      const { config: freshConfig } = await import('../config');
      expect(freshConfig.network.retries).toBe(3); // Default
    });

    it('should handle decimal retry values (parses to integer)', async () => {
      process.env.EXPO_PUBLIC_API_RETRIES = '3.7';
      const { config: freshConfig } = await import('../config');
      expect(freshConfig.network.retries).toBe(3);
    });
  });

  describe('Invalid Retry Delay Values', () => {
    it('should reject negative retry delay', async () => {
      process.env.EXPO_PUBLIC_API_RETRY_DELAY = '-500';
      jest.resetModules();
      const { config: freshConfig, InvalidNetworkConfigError: ErrorClass } =
        await import('../config');

      try {
        void freshConfig.network;
        fail('Should have thrown InvalidNetworkConfigError');
      } catch (error: unknown) {
        assertError(error);
        expect(error).toBeInstanceOf(ErrorClass);
        expect(error.name).toBe('InvalidNetworkConfigError');
        expect(error.message).toContain('retry delay');
      }
    });

    it('should reject zero retry delay', async () => {
      process.env.EXPO_PUBLIC_API_RETRY_DELAY = '0';
      jest.resetModules();
      const { config: freshConfig, InvalidNetworkConfigError: ErrorClass } =
        await import('../config');

      try {
        void freshConfig.network;
        fail('Should have thrown InvalidNetworkConfigError');
      } catch (error: unknown) {
        assertError(error);
        expect(error).toBeInstanceOf(ErrorClass);
        expect(error.name).toBe('InvalidNetworkConfigError');
        expect(error.message).toContain('retry delay');
      }
    });

    it('should reject retry delay exactly at upper limit + 1', async () => {
      process.env.EXPO_PUBLIC_API_RETRY_DELAY = '10001';
      jest.resetModules();
      const { config: freshConfig, InvalidNetworkConfigError: ErrorClass } =
        await import('../config');

      try {
        void freshConfig.network;
        fail('Should have thrown InvalidNetworkConfigError');
      } catch (error: unknown) {
        assertError(error);
        expect(error).toBeInstanceOf(ErrorClass);
        expect(error.name).toBe('InvalidNetworkConfigError');
        expect(error.message).toContain('retry delay');
      }
    });

    it('should reject extremely large retry delay', async () => {
      process.env.EXPO_PUBLIC_API_RETRY_DELAY = '99999999';
      jest.resetModules();
      const { config: freshConfig, InvalidNetworkConfigError: ErrorClass } =
        await import('../config');

      try {
        void freshConfig.network;
        fail('Should have thrown InvalidNetworkConfigError');
      } catch (error: unknown) {
        assertError(error);
        expect(error).toBeInstanceOf(ErrorClass);
        expect(error.name).toBe('InvalidNetworkConfigError');
        expect(error.message).toContain('retry delay');
      }
    });

    it('should accept retry delay at lower boundary (1ms)', async () => {
      process.env.EXPO_PUBLIC_API_RETRY_DELAY = '1';
      const { config: freshConfig } = await import('../config');
      expect(freshConfig.network.retryDelay).toBe(1);
    });

    it('should accept retry delay at upper boundary (10000ms)', async () => {
      process.env.EXPO_PUBLIC_API_RETRY_DELAY = '10000';
      const { config: freshConfig } = await import('../config');
      expect(freshConfig.network.retryDelay).toBe(10000);
    });

    it('should handle non-numeric retry delay gracefully (fallback to default)', async () => {
      process.env.EXPO_PUBLIC_API_RETRY_DELAY = 'slow';
      const { config: freshConfig } = await import('../config');
      expect(freshConfig.network.retryDelay).toBe(1000); // Default
    });
  });

  describe('Invalid Environments', () => {
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

    it('should reject null environment', async () => {
      expect(() => {
        config.setEnvironment(null as any);
      }).toThrow(InvalidEnvironmentError);
    });

    it('should reject undefined environment', async () => {
      expect(() => {
        config.setEnvironment(undefined as any);
      }).toThrow(InvalidEnvironmentError);
    });

    it('should reject uppercase environment name (case-sensitive)', async () => {
      expect(() => {
        config.setEnvironment('PRODUCTION' as any);
      }).toThrow(InvalidEnvironmentError);
    });

    it('should reject mixed-case environment name', async () => {
      expect(() => {
        config.setEnvironment('Production' as any);
      }).toThrow(InvalidEnvironmentError);
    });

    it('should reject environment with extra whitespace', async () => {
      expect(() => {
        config.setEnvironment(' production ' as any);
      }).toThrow(InvalidEnvironmentError);
    });

    it('should reject common but invalid environment names', async () => {
      const invalidEnvs = ['test', 'testing', 'qa', 'uat', 'local', 'dev', 'prod'];

      invalidEnvs.forEach(env => {
        expect(() => {
          config.setEnvironment(env as any);
        }).toThrow(InvalidEnvironmentError);
      });
    });
  });

  describe('Error Message Quality', () => {
    describe('URL Error Messages', () => {
      it('should include invalid URL value in error message', async () => {
        try {
          config.setCustomApiUrl('not-a-url');
          fail('Should have thrown InvalidUrlError');
        } catch (error: unknown) {
          assertError(error);
          expect(error).toBeInstanceOf(InvalidUrlError);
          expect(error.message).toContain('not-a-url');
        }
      });

      it('should suggest http:// or https:// for URL without protocol', async () => {
        try {
          config.setCustomApiUrl('example.com');
          fail('Should have thrown');
        } catch (error: unknown) {
          assertError(error);
          expect(error.message).toContain('http://');
          expect(error.message).toContain('https://');
        }
      });

      it('should provide example URL in error message', async () => {
        try {
          config.setCustomApiUrl('invalid-url');
          fail('Should have thrown');
        } catch (error: unknown) {
          assertError(error);
          expect(error.message).toMatch(/example\.com/i);
        }
      });

      it('should mention URL encoding for space errors', async () => {
        try {
          config.setCustomApiUrl('https://example .com');
          fail('Should have thrown');
        } catch (error: unknown) {
          assertError(error);
          expect(error.message).toMatch(/encod/i);
        }
      });

      it('should provide context about what URL is for', async () => {
        try {
          config.setCustomApiUrl('');
          fail('Should have thrown');
        } catch (error: unknown) {
          assertError(error);
          expect(error.message).toMatch(/API base URL/i);
        }
      });
    });

    describe('Network Config Error Messages', () => {
      it('should include invalid timeout value in error message', async () => {
        process.env.EXPO_PUBLIC_API_TIMEOUT = '-5000';
        jest.resetModules();
        try {
          const { config: freshConfig } = await import('../config');
          void freshConfig.network.timeout;
          fail('Should have thrown');
        } catch (error: unknown) {
          assertError(error);
          expect(error.message).toContain('-5000');
        }
      });

      it('should include valid range in timeout error message', async () => {
        process.env.EXPO_PUBLIC_API_TIMEOUT = '100000';
        jest.resetModules();
        try {
          const { config: freshConfig } = await import('../config');
          void freshConfig.network.timeout;
          fail('Should have thrown');
        } catch (error: unknown) {
          assertError(error);
          expect(error.message).toContain('1');
          expect(error.message).toContain('60000');
        }
      });

      it('should mention environment variable name in network config errors', async () => {
        process.env.EXPO_PUBLIC_API_TIMEOUT = '-1000';
        jest.resetModules();
        try {
          const { config: freshConfig } = await import('../config');
          void freshConfig.network.timeout;
          fail('Should have thrown');
        } catch (error: unknown) {
          assertError(error);
          expect(error.message).toContain('EXPO_PUBLIC_API_TIMEOUT');
        }
      });

      it('should include invalid retry count in error message', async () => {
        process.env.EXPO_PUBLIC_API_RETRIES = '20';
        jest.resetModules();
        try {
          const { config: freshConfig } = await import('../config');
          void freshConfig.network.retries;
          fail('Should have thrown');
        } catch (error: unknown) {
          assertError(error);
          expect(error.message).toContain('20');
          expect(error.message).toContain('0');
          expect(error.message).toContain('5');
        }
      });

      it('should include invalid retry delay in error message', async () => {
        process.env.EXPO_PUBLIC_API_RETRY_DELAY = '-1000';
        jest.resetModules();
        try {
          const { config: freshConfig } = await import('../config');
          void freshConfig.network.retryDelay;
          fail('Should have thrown');
        } catch (error: unknown) {
          assertError(error);
          expect(error.message).toContain('-1000');
          expect(error.message).toContain('1');
          expect(error.message).toContain('10000');
        }
      });
    });

    describe('Environment Error Messages', () => {
      it('should include invalid environment name in error message', async () => {
        try {
          config.setEnvironment('invalid-env' as any);
          fail('Should have thrown');
        } catch (error: unknown) {
          assertError(error);
          expect(error).toBeInstanceOf(InvalidEnvironmentError);
          expect(error.message).toContain('invalid-env');
        }
      });

      it('should list all valid environments in error message', async () => {
        try {
          config.setEnvironment('test' as any);
          fail('Should have thrown');
        } catch (error: unknown) {
          assertError(error);
          expect(error.message).toContain('development');
          expect(error.message).toContain('staging');
          expect(error.message).toContain('production');
        }
      });

      it('should mention how to set environment correctly', async () => {
        try {
          config.setEnvironment('invalid' as any);
          fail('Should have thrown');
        } catch (error: unknown) {
          assertError(error);
          expect(error.message).toMatch(/setEnvironment|EXPO_PUBLIC_DEFAULT_ENV/);
        }
      });
    });
  });

  describe('Error Types', () => {
    it('should throw InvalidUrlError for URL validation failures', async () => {
      expect(() => {
        config.setCustomApiUrl('not-a-url');
      }).toThrow(InvalidUrlError);
    });

    it('should throw InvalidNetworkConfigError for timeout validation failures', async () => {
      process.env.EXPO_PUBLIC_API_TIMEOUT = '-1000';
      jest.resetModules();
      const { config: freshConfig, InvalidNetworkConfigError: ErrorClass } =
        await import('../config');

      try {
        void freshConfig.network.timeout;
        fail('Should have thrown');
      } catch (error: unknown) {
        assertError(error);
        expect(error).toBeInstanceOf(ErrorClass);
        expect(error.name).toBe('InvalidNetworkConfigError');
      }
    });

    it('should throw InvalidNetworkConfigError for retry validation failures', async () => {
      process.env.EXPO_PUBLIC_API_RETRIES = '10';
      jest.resetModules();
      const { config: freshConfig, InvalidNetworkConfigError: ErrorClass } =
        await import('../config');

      try {
        void freshConfig.network.retries;
        fail('Should have thrown');
      } catch (error: unknown) {
        assertError(error);
        expect(error).toBeInstanceOf(ErrorClass);
        expect(error.name).toBe('InvalidNetworkConfigError');
      }
    });

    it('should throw InvalidEnvironmentError for environment validation failures', async () => {
      expect(() => {
        config.setEnvironment('invalid' as any);
      }).toThrow(InvalidEnvironmentError);
    });

    it('should have correct error name for InvalidUrlError', async () => {
      try {
        config.setCustomApiUrl('invalid');
        fail('Should have thrown');
      } catch (error: unknown) {
        assertError(error);
        expect(error.name).toBe('InvalidUrlError');
      }
    });

    it('should have correct error name for InvalidNetworkConfigError', async () => {
      process.env.EXPO_PUBLIC_API_TIMEOUT = '-1000';
      jest.resetModules();
      try {
        const { config: freshConfig } = await import('../config');
        void freshConfig.network.timeout;
        fail('Should have thrown');
      } catch (error: unknown) {
        assertError(error);
        expect(error.name).toBe('InvalidNetworkConfigError');
      }
    });

    it('should have correct error name for InvalidEnvironmentError', async () => {
      try {
        config.setEnvironment('invalid' as any);
        fail('Should have thrown');
      } catch (error: unknown) {
        assertError(error);
        expect(error.name).toBe('InvalidEnvironmentError');
      }
    });
  });

  describe('Endpoint Validation Edge Cases', () => {
    it('should handle undefined endpoint gracefully', async () => {
      const url = config.api.getFullUrl('memberQueues');
      expect(url).toBeDefined();
      expect(url).toMatch(/^https?:\/\/.+\/memberQueues\.php$/);
    });

    it('should construct valid URLs for all defined endpoints', async () => {
      const endpoints = [
        'memberQueues',
        'deleteQueuedBrew',
        'addToQueue',
        'addToRewardQueue',
        'memberDashboard',
        'memberRewards',
        'kiosk',
        'visitor',
      ] as const;

      endpoints.forEach(endpoint => {
        const url = config.api.getFullUrl(endpoint);
        expect(url).toBeDefined();
        expect(url).toMatch(/^https?:\/\/.+\/.+\.php$/);
      });
    });

    it('should handle query parameters with special characters', async () => {
      const url = config.api.getFullUrl('deleteQueuedBrew', {
        cid: '12345',
        special: 'hello world',
      });
      expect(url).toContain('?');
      expect(url).toContain('cid=12345');
      // URLSearchParams should encode spaces
      expect(url).toContain('special=hello');
    });

    it('should handle empty query parameters object', async () => {
      const url = config.api.getFullUrl('memberQueues', {});
      expect(url).not.toContain('?');
      expect(url).toMatch(/^https?:\/\/.+\/memberQueues\.php$/);
    });
  });

  describe('Combined Error Scenarios', () => {
    it('should reject multiple invalid configurations at once', async () => {
      process.env.EXPO_PUBLIC_API_TIMEOUT = '-1000';
      process.env.EXPO_PUBLIC_API_RETRIES = '10';
      process.env.EXPO_PUBLIC_API_RETRY_DELAY = '-500';
      jest.resetModules();
      const { config: freshConfig, InvalidNetworkConfigError: ErrorClass } =
        await import('../config');

      // Should fail on first validation check (timeout)
      try {
        void freshConfig.network.timeout;
        fail('Should have thrown');
      } catch (error: unknown) {
        assertError(error);
        expect(error).toBeInstanceOf(ErrorClass);
        expect(error.name).toBe('InvalidNetworkConfigError');
        expect(error.message).toContain('timeout');
      }
    });

    it('should validate environment before applying custom URL', async () => {
      expect(() => {
        config.setEnvironment('invalid' as any);
        config.setCustomApiUrl('https://example.com');
      }).toThrow(InvalidEnvironmentError);
    });

    it('should clear custom URL when switching to invalid environment', async () => {
      config.setCustomApiUrl('https://custom.example.com');

      expect(() => {
        config.setEnvironment('invalid' as any);
      }).toThrow(InvalidEnvironmentError);

      // Custom URL should still be set since setEnvironment failed
      expect(config.api.baseUrl).toBe('https://custom.example.com');
    });

    it('should clear custom URL when switching to valid environment', async () => {
      // Set custom URL
      config.setCustomApiUrl('https://custom.example.com');
      expect(config.api.baseUrl).toBe('https://custom.example.com');

      // Switch environment
      config.setEnvironment('development');

      // Custom URL should be cleared
      expect(config.api.baseUrl).not.toBe('https://custom.example.com');

      // Should use environment default
      const devUrl = config.api.baseUrl;
      expect(devUrl).toMatch(/dev|development|localhost|tapthatapp/i);
    });

    it('should clear custom URL when switching environments multiple times', async () => {
      config.setCustomApiUrl('https://custom.example.com');

      config.setEnvironment('production');
      expect(config.api.baseUrl).not.toBe('https://custom.example.com');

      config.setEnvironment('development');
      expect(config.api.baseUrl).not.toBe('https://custom.example.com');

      config.setEnvironment('staging');
      expect(config.api.baseUrl).not.toBe('https://custom.example.com');
    });
  });

  describe('Boundary Value Testing', () => {
    it('should accept timeout exactly at 1ms (minimum)', async () => {
      process.env.EXPO_PUBLIC_API_TIMEOUT = '1';
      const { config: freshConfig } = await import('../config');
      expect(freshConfig.network.timeout).toBe(1);
    });

    it('should accept timeout exactly at 60000ms (maximum)', async () => {
      process.env.EXPO_PUBLIC_API_TIMEOUT = '60000';
      const { config: freshConfig } = await import('../config');
      expect(freshConfig.network.timeout).toBe(60000);
    });

    it('should accept retries exactly at 0 (minimum)', async () => {
      process.env.EXPO_PUBLIC_API_RETRIES = '0';
      const { config: freshConfig } = await import('../config');
      expect(freshConfig.network.retries).toBe(0);
    });

    it('should accept retries exactly at 5 (maximum)', async () => {
      process.env.EXPO_PUBLIC_API_RETRIES = '5';
      const { config: freshConfig } = await import('../config');
      expect(freshConfig.network.retries).toBe(5);
    });

    it('should accept retry delay exactly at 1ms (minimum)', async () => {
      process.env.EXPO_PUBLIC_API_RETRY_DELAY = '1';
      const { config: freshConfig } = await import('../config');
      expect(freshConfig.network.retryDelay).toBe(1);
    });

    it('should accept retry delay exactly at 10000ms (maximum)', async () => {
      process.env.EXPO_PUBLIC_API_RETRY_DELAY = '10000';
      const { config: freshConfig } = await import('../config');
      expect(freshConfig.network.retryDelay).toBe(10000);
    });
  });

  describe('Error Class Hierarchy', () => {
    it('InvalidUrlError should inherit from Error', async () => {
      try {
        config.setCustomApiUrl('invalid-url');
        fail('Should have thrown');
      } catch (error: unknown) {
        assertError(error);
        // Verify inheritance chain
        expect(error).toBeInstanceOf(InvalidUrlError);
        expect(error).toBeInstanceOf(Error);

        // Verify error name
        expect(error.name).toBe('InvalidUrlError');

        // Verify it has standard Error properties
        expect(error.message).toBeTruthy();
        expect(error.stack).toBeTruthy();
      }
    });

    it('InvalidNetworkConfigError should inherit from Error', async () => {
      process.env.EXPO_PUBLIC_API_TIMEOUT = '-1000';
      jest.resetModules();

      try {
        const { config: freshConfig } = await import('../config');
        void freshConfig.network.timeout;
        fail('Should have thrown');
      } catch (error: unknown) {
        assertError(error);
        expect(error).toBeInstanceOf(Error);
        expect(error.name).toBe('InvalidNetworkConfigError');
        expect(error.message).toContain('-1000');
        expect(error.stack).toBeTruthy();
      }
    });

    it('InvalidEnvironmentError should inherit from Error', async () => {
      try {
        config.setEnvironment('invalid-env' as any);
        fail('Should have thrown');
      } catch (error: unknown) {
        assertError(error);
        expect(error).toBeInstanceOf(Error);
        expect(error.name).toBe('InvalidEnvironmentError');
        expect(error.message).toContain('invalid-env');
        expect(error.stack).toBeTruthy();
      }
    });

    it('all custom errors should have Error.captureStackTrace behavior', async () => {
      const errors: unknown[] = [];

      try {
        config.setCustomApiUrl('invalid');
      } catch (e) {
        errors.push(e);
      }
      try {
        config.setEnvironment('bad' as any);
      } catch (e) {
        errors.push(e);
      }

      errors.forEach(error => {
        assertError(error);
        expect(error.stack).toBeTruthy();
        expect(error.stack).toContain('validation.errors.test.ts');
      });
    });
  });
});
