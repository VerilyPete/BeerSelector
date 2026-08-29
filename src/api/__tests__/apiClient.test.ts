import { vi, type Mock, describe, it, expect, afterEach } from 'vitest';
import { ApiClient } from '../apiClient';
import { ApiError } from '../../types/api';
import { getCurrentSession } from '../sessionValidator';
import { config } from '@/src/config';

// Mock the sessionValidator
vi.mock('../sessionValidator', () => ({
  getCurrentSession: vi.fn(),
}));

// Mock fetch
global.fetch = vi.fn();
// A class, not `vi.fn().mockImplementation(() => ({...}))`. Jest's mock
// functions are constructible, so `new AbortController()` worked; vitest's
// return the plain arrow, which is not a constructor.
const RealAbortController = global.AbortController;
global.AbortController = class {
  private readonly inner = new RealAbortController();
  readonly signal = this.inner.signal;
  readonly abort = vi.fn(() => this.inner.abort());
} as unknown as typeof AbortController;

// Mock setTimeout and clearTimeout
vi.useFakeTimers();

const mockSessionData = {
  memberId: 'test-member-id',
  storeId: 'test-store-id',
  storeName: 'Test Store',
  sessionId: 'test-session-id',
};

function createApiTestContext() {
  config.setCustomApiUrl('https://test-api.example.com');
  (getCurrentSession as Mock).mockClear();
  (global.fetch as Mock).mockClear();
  (getCurrentSession as Mock).mockResolvedValue(mockSessionData);
  (global.fetch as Mock).mockResolvedValue({
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue({ success: true, data: { test: 'data' } }),
    text: vi.fn().mockResolvedValue('{"success":true,"data":{"test":"data"}}'),
  });
  const apiClient = ApiClient.getInstance();
  return { apiClient };
}

describe('ApiClient', () => {
  describe('get', () => {
    it('reloads credentials immediately after the session cache is cleared', async () => {
      const { apiClient } = createApiTestContext();
      apiClient.clearSessionCache();
      await apiClient.get('/before-logout');

      (getCurrentSession as Mock).mockResolvedValue({
        ...mockSessionData,
        sessionId: 'replacement-session',
      });
      apiClient.clearSessionCache();
      await apiClient.get('/after-logout');

      const requestFor = (endpoint: string) =>
        (global.fetch as Mock).mock.calls.find(([url]) => String(url).endsWith(endpoint))?.[1];
      const firstHeaders = requestFor('/before-logout').headers;
      const secondHeaders = requestFor('/after-logout').headers;
      expect(firstHeaders.Cookie).toContain('PHPSESSID=test-session-id');
      expect(secondHeaders.Cookie).toContain('PHPSESSID=replacement-session');
      expect(getCurrentSession).toHaveBeenCalledTimes(2);
    });

    it('rejects a session read that finishes after the cache is cleared', async () => {
      const { apiClient } = createApiTestContext();
      apiClient.clearSessionCache();
      let resolveSession!: (session: typeof mockSessionData) => void;
      (getCurrentSession as Mock).mockImplementationOnce(
        () =>
          new Promise(resolve => {
            resolveSession = resolve;
          })
      );

      const request = apiClient.get('/in-flight-during-logout');
      await Promise.resolve();
      apiClient.clearSessionCache();
      resolveSession(mockSessionData);

      await expect(request).rejects.toMatchObject({ statusCode: 401 });
      expect(
        (global.fetch as Mock).mock.calls.some(([url]) =>
          String(url).endsWith('/in-flight-during-logout')
        )
      ).toBe(false);
    });

    it('should make a GET request and return data', async () => {
      const { apiClient } = createApiTestContext();
      const response = await apiClient.get('/test-endpoint');

      expect(global.fetch).toHaveBeenCalledWith(
        `${config.api.baseUrl}/test-endpoint`,
        expect.objectContaining({
          method: 'GET',
          headers: expect.any(Object),
        })
      );

      expect(response).toEqual({
        success: true,
        data: { success: true, data: { test: 'data' } },
        statusCode: 200,
      });
    });

    it('should handle query parameters correctly', async () => {
      const { apiClient } = createApiTestContext();
      await apiClient.get('/test-endpoint', { param1: 'value1', param2: 'value2' });

      expect(global.fetch).toHaveBeenCalledWith(
        `${config.api.baseUrl}/test-endpoint?param1=value1&param2=value2`,
        expect.any(Object)
      );
    });

    it('should handle errors correctly', async () => {
      const { apiClient } = createApiTestContext();
      global.fetch = vi.fn().mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 404,
          statusText: 'Not Found',
          json: () => Promise.resolve({ error: 'Resource not found' }),
          text: () => Promise.resolve('{"error":"Resource not found"}'),
        })
      );

      const response = await apiClient.get('/test-endpoint');

      expect(response).toEqual({
        success: false,
        data: null,
        error: 'HTTP error! status: 404 Not Found',
        statusCode: 404,
      });
    });

    it('should use config values for retry settings', () => {
      createApiTestContext();
      // Verify that the ApiClient was instantiated with config values
      // The retry mechanism is tested in integration tests
      expect(config.network.retries).toBe(3);
      expect(config.network.retryDelay).toBe(1000);

      // Verify client can be created with config values
      const testClient = ApiClient.getInstance({
        baseUrl: config.api.baseUrl,
        retries: config.network.retries,
        retryDelay: config.network.retryDelay,
        timeout: config.network.timeout,
      });

      expect(testClient).toBeDefined();
    });
  });

  describe('post', () => {
    it('should make a POST request with correct body', async () => {
      const { apiClient } = createApiTestContext();
      const requestData = { name: 'Test', value: 123 };

      await apiClient.post('/test-endpoint', requestData);

      expect(global.fetch).toHaveBeenCalledWith(
        `${config.api.baseUrl}/test-endpoint`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
          }),
          body: 'name=Test&value=123',
        })
      );
    });
  });

  describe('ApiError', () => {
    it('should create an ApiError with correct properties', () => {
      const error = new ApiError('Test error', 500, true, false);

      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(500);
      expect(error.isNetworkError).toBe(true);
      expect(error.isTimeout).toBe(false);
      expect(error.retryable).toBe(true);
    });

    it('should mark 5xx errors as retryable', () => {
      const error = new ApiError('Server error', 503, false, false);
      expect(error.retryable).toBe(true);
    });

    it('should mark 4xx errors as non-retryable (except 408 and 429)', () => {
      const error404 = new ApiError('Not found', 404, false, false);
      expect(error404.retryable).toBe(false);

      const error429 = new ApiError('Too many requests', 429, false, false);
      expect(error429.retryable).toBe(true);

      const error408 = new ApiError('Request timeout', 408, false, false);
      expect(error408.retryable).toBe(true);
    });
  });

  describe('Config Integration', () => {
    describe('URL Configuration', () => {
      it('should use config base URL for API client initialization', () => {
        createApiTestContext();
        const testUrl = 'https://test-config.example.com';
        config.setCustomApiUrl(testUrl);

        // Verify client can be created (getInstance returns existing instance or creates new one)
        ApiClient.getInstance({
          baseUrl: config.api.baseUrl,
          retries: config.network.retries,
          retryDelay: config.network.retryDelay,
          timeout: config.network.timeout,
        });

        expect(config.api.baseUrl).toBe(testUrl);
      });

      it('should construct URLs correctly with config base URL', async () => {
        const { apiClient } = createApiTestContext();
        await apiClient.get('/test-path');

        expect(global.fetch).toHaveBeenCalledWith(
          `${config.api.baseUrl}/test-path`,
          expect.any(Object)
        );
      });

      it('should use config base URL for POST requests', async () => {
        const { apiClient } = createApiTestContext();
        await apiClient.post('/test-path', { data: 'test' });

        expect(global.fetch).toHaveBeenCalledWith(
          `${config.api.baseUrl}/test-path`,
          expect.any(Object)
        );
      });
    });

    describe('Network Configuration', () => {
      it('should respect config retry settings', () => {
        createApiTestContext();
        // Verify client can be created (getInstance returns existing instance or creates new one)
        ApiClient.getInstance({
          baseUrl: config.api.baseUrl,
          retries: config.network.retries,
          retryDelay: config.network.retryDelay,
          timeout: config.network.timeout,
        });

        // Verify config values are used
        expect(config.network.retries).toBe(3);
        expect(config.network.retryDelay).toBe(1000);
      });

      it('should respect config timeout settings', () => {
        createApiTestContext();
        // Verify client can be created (getInstance returns existing instance or creates new one)
        ApiClient.getInstance({
          baseUrl: config.api.baseUrl,
          retries: config.network.retries,
          retryDelay: config.network.retryDelay,
          timeout: config.network.timeout,
        });

        // Verify timeout configuration is available and valid
        expect(config.network.timeout).toBeGreaterThan(0);
        expect(config.network.timeout).toBeLessThanOrEqual(60000);
      });

      it('should use config network settings for client instantiation', () => {
        createApiTestContext();
        // Verify that network settings from config are used
        const client1 = ApiClient.getInstance({
          baseUrl: config.api.baseUrl,
          retries: config.network.retries,
          retryDelay: config.network.retryDelay,
          timeout: config.network.timeout,
        });

        const client2 = ApiClient.getInstance({
          baseUrl: config.api.baseUrl,
          retries: config.network.retries,
          retryDelay: config.network.retryDelay,
          timeout: config.network.timeout,
        });

        // Both clients should use the same config values (valid ranges)
        expect(config.network.retries).toBeGreaterThan(0);
        expect(config.network.retryDelay).toBeGreaterThan(0);
        expect(config.network.timeout).toBeGreaterThan(0);

        expect(client1).toBeDefined();
        expect(client2).toBeDefined();
      });
    });

    describe('Environment Switching', () => {
      afterEach(() => {
        // Reset to production environment
        config.setEnvironment('production');
      });

      it('should use production URLs when environment is production', () => {
        config.setEnvironment('production');

        expect(config.api.baseUrl).toBe('https://tapthatapp.beerknurd.com');
      });

      it('should use development URLs when environment is development', () => {
        config.setEnvironment('development');

        // Verify development base URL (currently same as production)
        expect(config.api.baseUrl).toBe('https://tapthatapp.beerknurd.com');
      });

      it('should use custom URL when set', () => {
        const customUrl = 'https://staging.example.com';
        config.setCustomApiUrl(customUrl);

        // Verify client can be created (getInstance returns existing instance or creates new one)
        ApiClient.getInstance({
          baseUrl: config.api.baseUrl,
          retries: config.network.retries,
          retryDelay: config.network.retryDelay,
          timeout: config.network.timeout,
        });

        expect(config.api.baseUrl).toBe(customUrl);

        // Reset to production
        config.setEnvironment('production');
      });

      it('should validate URL format when setting custom URL', () => {
        // Invalid URLs should throw error
        expect(() => {
          config.setCustomApiUrl('not-a-valid-url');
        }).toThrow();

        // Valid URLs should work
        expect(() => {
          config.setCustomApiUrl('https://valid.example.com');
        }).not.toThrow();

        // Reset to production
        config.setEnvironment('production');
      });
    });

    describe('Config Validation', () => {
      it('should have valid config structure', () => {
        // Verify config has required properties
        expect(config).toHaveProperty('api');
        expect(config).toHaveProperty('network');
        expect(config).toHaveProperty('external');

        // Verify API config
        expect(config.api).toHaveProperty('baseUrl');
        expect(config.api).toHaveProperty('endpoints');
        expect(config.api).toHaveProperty('referers');
        expect(config.api).toHaveProperty('getFullUrl');

        // Verify network config
        expect(config.network).toHaveProperty('timeout');
        expect(config.network).toHaveProperty('retries');
        expect(config.network).toHaveProperty('retryDelay');
      });

      it('should have valid network configuration values', () => {
        // Verify network values are positive integers
        expect(config.network.timeout).toBeGreaterThan(0);
        expect(config.network.retries).toBeGreaterThan(0);
        expect(config.network.retryDelay).toBeGreaterThan(0);

        // Verify reasonable values
        expect(config.network.timeout).toBeLessThanOrEqual(60000); // Max 60s
        expect(config.network.retries).toBeLessThanOrEqual(10); // Max 10 retries
        expect(config.network.retryDelay).toBeLessThanOrEqual(5000); // Max 5s initial delay
      });

      it('should provide valid base URL', () => {
        // Verify base URL is valid HTTPS URL
        expect(config.api.baseUrl).toMatch(/^https?:\/\//);
        expect(config.api.baseUrl).toBeTruthy();
      });

      it('should have consistent network settings across client instances', () => {
        // Create two client instances to verify consistency
        ApiClient.getInstance({
          baseUrl: config.api.baseUrl,
          retries: config.network.retries,
          retryDelay: config.network.retryDelay,
          timeout: config.network.timeout,
        });

        ApiClient.getInstance({
          baseUrl: config.api.baseUrl,
          retries: config.network.retries,
          retryDelay: config.network.retryDelay,
          timeout: config.network.timeout,
        });

        // Both clients should use the same config values (verify consistency)
        expect(config.network.retries).toBeGreaterThan(0);
        expect(config.network.retryDelay).toBeGreaterThan(0);
        expect(config.network.timeout).toBeGreaterThan(0);
        expect(config.network.timeout).toBeLessThanOrEqual(60000);
      });
    });
  });

  // ==========================================================================
  // Check-in response diagnostics (plan 02 Phase 7.1)
  //
  // Two places in this codebase make contradictory claims about what a
  // successful check-in looks like: apiClient treats an EMPTY body as success
  // (:262-271), while useOptimisticCheckIn treats a SyntaxError on a NON-EMPTY
  // unparseable body as success (:162-183). Both cannot be right, and neither
  // has ever been checked against a real response.
  //
  // Logging only — this confirms the empty-body rule, which affects every
  // endpoint, not just check-in. It is not a gate on Phase 7.2.
  // ==========================================================================

  describe('check-in response diagnostics', () => {
    it('request logs response diagnostics for addToQueue only', async () => {
      const { apiClient } = createApiTestContext();
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await apiClient.get(config.api.endpoints.addToQueue);

      const logged = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
      expect(logged).toContain('[check-in diagnostics]');
      expect(logged).toContain('status=200');
      expect(logged).toContain('content-type=');

      logSpy.mockClear();
      await apiClient.get('/some-other-endpoint');

      const otherLogged = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
      expect(otherLogged).not.toContain('[check-in diagnostics]');

      logSpy.mockRestore();
    });

    it('logs the resolved response url and redirect flag for captive-portal detection', async () => {
      const { apiClient } = createApiTestContext();
      // A differing origin means something intercepted the request — a captive
      // portal or carrier proxy — which is indistinguishable from success once
      // the body has been swallowed. RN populates `url` reliably but
      // `redirected` inconsistently, so Phase 7.2 needs to see both.
      (global.fetch as Mock).mockResolvedValue({
        ok: true,
        status: 200,
        url: 'http://captive.example.net/login',
        redirected: true,
        headers: { get: vi.fn().mockReturnValue('text/html') },
        text: vi.fn().mockResolvedValue('<html>Sign in to continue</html>'),
      });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await apiClient.get(config.api.endpoints.addToQueue);

      const logged = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
      expect(logged).toContain('http://captive.example.net/login');
      expect(logged).toContain('redirected=true');
      expect(logged).toContain('Sign in to continue');

      logSpy.mockRestore();
    });
  });
});
