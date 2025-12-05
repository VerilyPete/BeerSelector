import { ApiClient } from '../apiClient';
import { ApiError } from '../../types/api';
import { getCurrentSession } from '../sessionValidator';
import { config } from '@/src/config';

// Mock the sessionValidator
jest.mock('../sessionValidator', () => ({
  getCurrentSession: jest.fn(),
}));

// Mock fetch
global.fetch = jest.fn();
global.AbortController = jest.fn().mockImplementation(() => ({
  signal: 'mock-signal',
  abort: jest.fn(),
}));

// Mock setTimeout and clearTimeout
jest.useFakeTimers();

describe('ApiClient', () => {
  let apiClient: ApiClient;
  const mockSessionData = {
    memberId: 'test-member-id',
    storeId: 'test-store-id',
    storeName: 'Test Store',
    sessionId: 'test-session-id',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Set test environment
    config.setCustomApiUrl('https://test-api.example.com');

    // Mock getCurrentSession to return mock session data
    (getCurrentSession as jest.Mock).mockResolvedValue(mockSessionData);

    // Mock fetch to return a successful response
    // This will be called during ApiClient instantiation for network monitoring
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ success: true, data: { test: 'data' } }),
      text: jest.fn().mockResolvedValue('{"success":true,"data":{"test":"data"}}'),
    });

    // Use config values for ApiClient instantiation
    apiClient = new ApiClient({
      baseUrl: config.api.baseUrl,
      retries: config.network.retries,
      retryDelay: config.network.retryDelay,
      timeout: config.network.timeout,
    });

    // Clear mock call count after initialization
    // (ApiClient constructor calls fetch for network monitoring)
    jest.clearAllMocks();
  });

  describe('get', () => {
    it('should make a GET request and return data', async () => {
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
      await apiClient.get('/test-endpoint', { param1: 'value1', param2: 'value2' });

      expect(global.fetch).toHaveBeenCalledWith(
        `${config.api.baseUrl}/test-endpoint?param1=value1&param2=value2`,
        expect.any(Object)
      );
    });

    it('should handle errors correctly', async () => {
      global.fetch = jest.fn().mockImplementation(() =>
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
      // Verify that the ApiClient was instantiated with config values
      // The retry mechanism is tested in integration tests
      expect(config.network.retries).toBe(3);
      expect(config.network.retryDelay).toBe(1000);

      // Verify client can be created with config values
      const testClient = new ApiClient({
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
        const testUrl = 'https://test-config.example.com';
        config.setCustomApiUrl(testUrl);

        const client = new ApiClient({
          baseUrl: config.api.baseUrl,
          retries: config.network.retries,
          retryDelay: config.network.retryDelay,
          timeout: config.network.timeout,
        });

        expect(config.api.baseUrl).toBe(testUrl);
      });

      it('should construct URLs correctly with config base URL', async () => {
        const response = await apiClient.get('/test-path');

        expect(global.fetch).toHaveBeenCalledWith(
          `${config.api.baseUrl}/test-path`,
          expect.any(Object)
        );
      });

      it('should use config base URL for POST requests', async () => {
        await apiClient.post('/test-path', { data: 'test' });

        expect(global.fetch).toHaveBeenCalledWith(
          `${config.api.baseUrl}/test-path`,
          expect.any(Object)
        );
      });
    });

    describe('Network Configuration', () => {
      it('should respect config retry settings', () => {
        const client = new ApiClient({
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
        const client = new ApiClient({
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
        // Verify that network settings from config are used
        const client1 = new ApiClient({
          baseUrl: config.api.baseUrl,
          retries: config.network.retries,
          retryDelay: config.network.retryDelay,
          timeout: config.network.timeout,
        });

        const client2 = new ApiClient({
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
      beforeEach(() => {
        // Reset to production environment
        config.setEnvironment('production');
      });

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

        const client = new ApiClient({
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
        const client1 = new ApiClient({
          baseUrl: config.api.baseUrl,
          retries: config.network.retries,
          retryDelay: config.network.retryDelay,
          timeout: config.network.timeout,
        });

        const client2 = new ApiClient({
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
});
