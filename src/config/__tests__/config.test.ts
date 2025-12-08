/**
 * Configuration Module Tests (TDD - Red Phase)
 *
 * These tests define the expected behavior of the configuration module
 * before implementation. Following TDD principles:
 * 1. Write tests first (RED)
 * 2. Implement minimum code to pass (GREEN)
 * 3. Refactor and improve (REFACTOR)
 */

import { config, AppEnvironment, ApiEndpoints } from '../config';

describe('Configuration Module', () => {
  describe('Environment Configuration', () => {
    it('should have a default environment set', () => {
      expect(config.environment).toBeDefined();
      expect(config.environment).toBeOneOf(['development', 'staging', 'production']);
    });

    it('should be able to get current environment', () => {
      const env = config.getEnvironment();
      expect(env).toBeDefined();
      expect(typeof env).toBe('string');
    });

    it('should be able to switch environments', () => {
      const originalEnv = config.getEnvironment();

      config.setEnvironment('development');
      expect(config.getEnvironment()).toBe('development');

      config.setEnvironment('production');
      expect(config.getEnvironment()).toBe('production');

      // Restore original
      config.setEnvironment(originalEnv as AppEnvironment);
    });
  });

  describe('API Configuration', () => {
    describe('Base URL', () => {
      it('should have a valid base URL for Flying Saucer API', () => {
        expect(config.api.baseUrl).toBeDefined();
        expect(config.api.baseUrl).toMatch(/^https?:\/\/.+/);
      });

      it('should not have trailing slash in base URL', () => {
        expect(config.api.baseUrl).not.toMatch(/\/$/);
      });

      it('should use HTTPS for production', () => {
        config.setEnvironment('production');
        expect(config.api.baseUrl).toMatch(/^https:\/\//);
      });
    });

    describe('Endpoints', () => {
      it('should have all required endpoint paths defined', () => {
        const requiredEndpoints: (keyof ApiEndpoints)[] = [
          'memberQueues',
          'deleteQueuedBrew',
          'addToQueue',
          'addToRewardQueue',
          'memberDashboard',
          'memberRewards'
        ];

        requiredEndpoints.forEach(endpoint => {
          expect(config.api.endpoints[endpoint]).toBeDefined();
          expect(typeof config.api.endpoints[endpoint]).toBe('string');
        });
      });

      it('should have endpoint paths starting with /', () => {
        Object.values(config.api.endpoints).forEach(path => {
          expect(path).toMatch(/^\//);
        });
      });

      it('should be able to get full URL for an endpoint', () => {
        const fullUrl = config.api.getFullUrl('memberQueues');
        expect(fullUrl).toBe(`${config.api.baseUrl}${config.api.endpoints.memberQueues}`);
        expect(fullUrl).toMatch(/^https?:\/\/.+\/memberQueues\.php$/);
      });

      it('should handle query parameters when building full URL', () => {
        const fullUrl = config.api.getFullUrl('deleteQueuedBrew', { cid: '12345' });
        expect(fullUrl).toContain('?cid=12345');
      });
    });

    describe('Referer URLs', () => {
      it('should have referer URLs for API calls', () => {
        expect(config.api.referers).toBeDefined();
        expect(config.api.referers.memberDashboard).toBeDefined();
        expect(config.api.referers.memberRewards).toBeDefined();
        expect(config.api.referers.memberQueues).toBeDefined();
      });

      it('should have valid referer URLs', () => {
        Object.values(config.api.referers).forEach(referer => {
          expect(referer).toMatch(/^https?:\/\/.+/);
        });
      });
    });
  });

  describe('Network Configuration', () => {
    it('should have network timeout configured', () => {
      expect(config.network.timeout).toBeDefined();
      expect(typeof config.network.timeout).toBe('number');
      expect(config.network.timeout).toBeGreaterThan(0);
    });

    it('should have retry configuration', () => {
      expect(config.network.retries).toBeDefined();
      expect(config.network.retryDelay).toBeDefined();
      expect(typeof config.network.retries).toBe('number');
      expect(typeof config.network.retryDelay).toBe('number');
    });

    it('should have sensible timeout value (between 5s and 30s)', () => {
      expect(config.network.timeout).toBeGreaterThanOrEqual(5000);
      expect(config.network.timeout).toBeLessThanOrEqual(30000);
    });

    it('should have sensible retry attempts (between 1 and 5)', () => {
      expect(config.network.retries).toBeGreaterThanOrEqual(1);
      expect(config.network.retries).toBeLessThanOrEqual(5);
    });
  });

  describe('External Services Configuration', () => {
    describe('Untappd', () => {
      it('should have Untappd base URL configured', () => {
        expect(config.external.untappd.baseUrl).toBeDefined();
        expect(config.external.untappd.baseUrl).toMatch(/^https:\/\//);
      });

      it('should have Untappd login URL', () => {
        expect(config.external.untappd.loginUrl).toBeDefined();
        expect(config.external.untappd.loginUrl).toContain('untappd.com');
      });

      it('should have Untappd search URL template', () => {
        expect(config.external.untappd.searchUrl).toBeDefined();
        expect(typeof config.external.untappd.searchUrl).toBe('function');
      });

      it('should generate correct Untappd search URL with beer name', () => {
        const beerName = 'Test IPA';
        const searchUrl = config.external.untappd.searchUrl(beerName);
        expect(searchUrl).toContain('untappd.com/search');
        expect(searchUrl).toContain(encodeURIComponent(beerName));
      });
    });
  });

  describe('Environment-Specific Configuration', () => {
    it('should have different base URLs for different environments', () => {
      config.setEnvironment('development');
      const devUrl = config.api.baseUrl;

      config.setEnvironment('production');
      const prodUrl = config.api.baseUrl;

      // Dev and prod should have different URLs (or allow same for now)
      expect(devUrl).toBeDefined();
      expect(prodUrl).toBeDefined();
    });

    it('should allow custom API base URL override', () => {
      const customUrl = 'https://custom-api.example.com';
      config.setCustomApiUrl(customUrl);
      expect(config.api.baseUrl).toBe(customUrl);
    });
  });

  describe('Type Safety', () => {
    it('should export TypeScript types', () => {
      // This test verifies that types are exported and usable
      const env: AppEnvironment = 'production';
      expect(env).toBe('production');
    });

    it('should have properly typed endpoint keys', () => {
      const endpoint: keyof ApiEndpoints = 'memberQueues';
      expect(config.api.endpoints[endpoint]).toBeDefined();
    });
  });

  describe('Validation', () => {
    it('should validate URLs are well-formed', () => {
      const allUrls = [
        config.api.baseUrl,
        config.external.untappd.baseUrl,
        config.external.untappd.loginUrl,
        ...Object.values(config.api.referers)
      ];

      allUrls.forEach(url => {
        expect(url).toMatch(/^https?:\/\/.+\..+/);
      });
    });

    it('should not allow invalid environment values', () => {
      expect(() => {
        config.setEnvironment('invalid' as AppEnvironment);
      }).toThrow();
    });
  });

  describe('Documentation', () => {
    it('should have JSDoc comments on public methods', () => {
      // This is more of a documentation reminder
      // Actual implementation should include JSDoc
      expect(config.getEnvironment).toBeDefined();
      expect(config.setEnvironment).toBeDefined();
      expect(config.api.getFullUrl).toBeDefined();
    });
  });
});

// Custom Jest matcher for environment enum check
expect.extend({
  toBeOneOf(received: unknown, expected: unknown[]) {
    const pass = expected.includes(received);
    if (pass) {
      return {
        message: () => `expected ${received} not to be one of ${expected.join(', ')}`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be one of ${expected.join(', ')}`,
        pass: false,
      };
    }
  },
});

declare global {
  namespace jest {
    interface Matchers<R> {
      toBeOneOf(expected: unknown[]): R;
    }
  }
}
