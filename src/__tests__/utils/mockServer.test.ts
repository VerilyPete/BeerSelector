/**
 * Tests for MockServer utilities
 *
 * These tests validate that the mock server infrastructure works correctly.
 * We test the test infrastructure to ensure reliability.
 */

import {
  MockServer,
  createSequentialResponses,
  createConditionalResponse,
  networkErrorResponse,
  timeoutResponse
} from './mockServer';
import { config } from '@/src/config';

// Use real fetch for MockServer tests (not the mocked global.fetch)
// @ts-ignore - node-fetch is available as transitive dependency
const nodeFetch = require('node-fetch');

// Increase timeout for server tests
jest.setTimeout(10000);

describe('MockServer', () => {
  let mockServer: MockServer;
  let originalFetch: typeof fetch;

  beforeAll(() => {
    // Use real timers for MockServer tests
    jest.useRealTimers();
  });

  beforeEach(() => {
    mockServer = new MockServer();
    // Replace global fetch with node-fetch for these tests
    originalFetch = global.fetch;
    global.fetch = nodeFetch as any;
  });

  afterEach(async () => {
    // Restore original fetch
    global.fetch = originalFetch;

    if (mockServer.isServerRunning()) {
      await mockServer.stop();
    }
  });

  afterAll(() => {
    // Restore fake timers for other tests
    jest.useFakeTimers();
  });

  describe('server lifecycle', () => {
    it('should start and stop the server', async () => {
      // Initially not running
      expect(mockServer.isServerRunning()).toBe(false);
      expect(mockServer.getUrl()).toBeNull();
      expect(mockServer.getPort()).toBe(0);

      // Start server
      const port = await mockServer.start();
      expect(port).toBeGreaterThan(0);
      expect(mockServer.isServerRunning()).toBe(true);
      expect(mockServer.getUrl()).toBe(`http://localhost:${port}`);
      expect(mockServer.getPort()).toBe(port);

      // Stop server
      await mockServer.stop();
      expect(mockServer.isServerRunning()).toBe(false);
      expect(mockServer.getUrl()).toBeNull();
      expect(mockServer.getPort()).toBe(0);
    });

    it('should start on a specific port', async () => {
      const specificPort = 3456;
      const port = await mockServer.start(specificPort);
      expect(port).toBe(specificPort);
      expect(mockServer.getPort()).toBe(specificPort);
    });

    it('should handle port conflicts gracefully', async () => {
      // Start first server
      const server1 = new MockServer();
      const port1 = await server1.start(3457);

      // Try to start second server on same port
      const server2 = new MockServer();
      await expect(server2.start(3457)).rejects.toThrow();

      // Cleanup
      await server1.stop();
    });

    it('should throw error if trying to start already running server', async () => {
      await mockServer.start();
      await expect(mockServer.start()).rejects.toThrow('MockServer is already running');
    });

    it('should handle multiple stop calls gracefully', async () => {
      await mockServer.start();
      await mockServer.stop();
      // Second stop should not throw
      await expect(mockServer.stop()).resolves.toBeUndefined();
    });
  });

  describe('response configuration', () => {
    beforeEach(async () => {
      await mockServer.start();
    });

    it('should set and serve static responses', async () => {
      mockServer.setResponse('/test', {
        status: 200,
        body: { message: 'Hello, World!' }
      });

      const response = await fetch(`${mockServer.getUrl()}/test`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ message: 'Hello, World!' });
    });

    it('should set multiple responses at once', async () => {
      mockServer.setResponses({
        '/api/users': { status: 200, body: [{ id: 1, name: 'User 1' }] },
        '/api/posts': { status: 200, body: [{ id: 1, title: 'Post 1' }] }
      });

      const usersResponse = await fetch(`${mockServer.getUrl()}/api/users`);
      const usersData = await usersResponse.json();
      expect(usersData).toEqual([{ id: 1, name: 'User 1' }]);

      const postsResponse = await fetch(`${mockServer.getUrl()}/api/posts`);
      const postsData = await postsResponse.json();
      expect(postsData).toEqual([{ id: 1, title: 'Post 1' }]);
    });

    it('should return default 404 for unmatched paths', async () => {
      const response = await fetch(`${mockServer.getUrl()}/unknown`);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data).toEqual({ error: 'Not Found' });
    });

    it('should allow setting custom default response', async () => {
      mockServer.setDefaultResponse({
        status: 418,
        body: { message: "I'm a teapot" }
      });

      const response = await fetch(`${mockServer.getUrl()}/unknown`);
      const data = await response.json();

      expect(response.status).toBe(418);
      expect(data).toEqual({ message: "I'm a teapot" });
    });

    it('should support custom headers', async () => {
      mockServer.setResponse('/with-headers', {
        status: 200,
        body: 'OK',
        headers: {
          'X-Custom-Header': 'custom-value',
          'Content-Type': 'text/plain'
        }
      });

      const response = await fetch(`${mockServer.getUrl()}/with-headers`);
      expect(response.headers.get('X-Custom-Header')).toBe('custom-value');
      expect(response.headers.get('Content-Type')).toBe('text/plain');
    });

    it('should support wildcard patterns', async () => {
      mockServer.setResponse('/api/users/*', {
        status: 200,
        body: { user: 'data' }
      });

      const response = await fetch(`${mockServer.getUrl()}/api/users/123`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ user: 'data' });
    });

    it('should clear specific responses', async () => {
      mockServer.setResponse('/test', { status: 200, body: 'OK' });
      mockServer.clearResponse('/test');

      const response = await fetch(`${mockServer.getUrl()}/test`);
      expect(response.status).toBe(404);
    });

    it('should clear all responses', async () => {
      mockServer.setResponses({
        '/test1': { status: 200, body: 'OK1' },
        '/test2': { status: 200, body: 'OK2' }
      });

      mockServer.clearAllResponses();

      const response1 = await fetch(`${mockServer.getUrl()}/test1`);
      const response2 = await fetch(`${mockServer.getUrl()}/test2`);

      expect(response1.status).toBe(404);
      expect(response2.status).toBe(404);
    });
  });

  describe('request tracking', () => {
    beforeEach(async () => {
      await mockServer.start();
    });

    it('should track GET requests', async () => {
      mockServer.setResponse('/track-me', { status: 200, body: 'OK' });

      await fetch(`${mockServer.getUrl()}/track-me?param=value`);

      const requests = mockServer.getRequests();
      expect(requests).toHaveLength(1);
      expect(requests[0]).toMatchObject({
        method: 'GET',
        path: '/track-me',
        query: { param: 'value' }
      });
      expect(requests[0].timestamp).toBeInstanceOf(Date);
    });

    it('should track POST requests with body', async () => {
      mockServer.setResponse('/api/data', { status: 201, body: { success: true } });

      const body = { name: 'Test', value: 123 };
      await fetch(`${mockServer.getUrl()}/api/data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const requests = mockServer.getRequests();
      expect(requests).toHaveLength(1);
      expect(requests[0]).toMatchObject({
        method: 'POST',
        path: '/api/data',
        body: body
      });
    });

    it('should track request headers', async () => {
      mockServer.setResponse('/with-headers', { status: 200, body: 'OK' });

      await fetch(`${mockServer.getUrl()}/with-headers`, {
        headers: {
          'X-Custom-Header': 'custom-value',
          'Cookie': 'session=abc123'
        }
      });

      const requests = mockServer.getRequests();
      expect(requests[0].headers).toMatchObject({
        'x-custom-header': 'custom-value',
        'cookie': 'session=abc123'
      });
    });

    it('should filter requests by path', async () => {
      mockServer.setResponses({
        '/api/users': { status: 200, body: [] },
        '/api/posts': { status: 200, body: [] }
      });

      await fetch(`${mockServer.getUrl()}/api/users`);
      await fetch(`${mockServer.getUrl()}/api/posts`);
      await fetch(`${mockServer.getUrl()}/api/users`);

      const userRequests = mockServer.getRequestsForPath('/api/users');
      expect(userRequests).toHaveLength(2);

      const postRequests = mockServer.getRequestsForPath('/api/posts');
      expect(postRequests).toHaveLength(1);
    });

    it('should get last request', async () => {
      mockServer.setResponse('/test', { status: 200, body: 'OK' });

      await fetch(`${mockServer.getUrl()}/test?first=1`);
      await fetch(`${mockServer.getUrl()}/test?second=2`);

      const lastRequest = mockServer.getLastRequest();
      expect(lastRequest?.query).toEqual({ second: '2' });
    });

    it('should clear request history', async () => {
      mockServer.setResponse('/test', { status: 200, body: 'OK' });

      await fetch(`${mockServer.getUrl()}/test`);
      expect(mockServer.getRequests()).toHaveLength(1);

      mockServer.clearHistory();
      expect(mockServer.getRequests()).toHaveLength(0);
    });
  });

  describe('delay simulation', () => {
    beforeEach(async () => {
      await mockServer.start();
    });

    it('should simulate response delay', async () => {
      mockServer.setResponse('/slow', {
        status: 200,
        body: 'Delayed response',
        delay: 100
      });

      const startTime = Date.now();
      const response = await fetch(`${mockServer.getUrl()}/slow`);
      const endTime = Date.now();

      expect(response.status).toBe(200);
      expect(endTime - startTime).toBeGreaterThanOrEqual(100);
    });

    it('should handle timeout responses for timeout testing', async () => {
      mockServer.setResponse('/timeout', timeoutResponse(100));

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 50);

      try {
        await fetch(`${mockServer.getUrl()}/timeout`, {
          signal: controller.signal
        });
        fail('Should have timed out');
      } catch (error: any) {
        expect(error.name).toBe('AbortError');
      } finally {
        clearTimeout(timeout);
      }
    });
  });

  describe('dynamic responses', () => {
    beforeEach(async () => {
      await mockServer.start();
    });

    it('should support dynamic response handlers', async () => {
      let callCount = 0;
      mockServer.setResponse('/dynamic', (req) => {
        callCount++;
        return {
          status: 200,
          body: {
            count: callCount,
            method: req.method,
            query: req.query
          }
        };
      });

      const response1 = await fetch(`${mockServer.getUrl()}/dynamic?test=1`);
      const data1 = await response1.json();
      expect(data1).toEqual({
        count: 1,
        method: 'GET',
        query: { test: '1' }
      });

      const response2 = await fetch(`${mockServer.getUrl()}/dynamic?test=2`);
      const data2 = await response2.json();
      expect(data2).toEqual({
        count: 2,
        method: 'GET',
        query: { test: '2' }
      });
    });

    it('should support sequential responses helper', async () => {
      const responses = [
        { status: 200, body: { message: 'First' } },
        { status: 201, body: { message: 'Second' } },
        { status: 202, body: { message: 'Third' } }
      ];

      mockServer.setResponse('/sequential', createSequentialResponses(responses));

      const response1 = await fetch(`${mockServer.getUrl()}/sequential`);
      expect(response1.status).toBe(200);
      expect(await response1.json()).toEqual({ message: 'First' });

      const response2 = await fetch(`${mockServer.getUrl()}/sequential`);
      expect(response2.status).toBe(201);
      expect(await response2.json()).toEqual({ message: 'Second' });

      const response3 = await fetch(`${mockServer.getUrl()}/sequential`);
      expect(response3.status).toBe(202);
      expect(await response3.json()).toEqual({ message: 'Third' });

      // Should cycle back
      const response4 = await fetch(`${mockServer.getUrl()}/sequential`);
      expect(response4.status).toBe(200);
      expect(await response4.json()).toEqual({ message: 'First' });
    });

    it('should support conditional responses helper', async () => {
      mockServer.setResponse('/conditional', createConditionalResponse(
        [
          [req => req.query.type === 'success', { status: 200, body: { result: 'success' } }],
          [req => req.query.type === 'error', { status: 500, body: { error: 'Server error' } }],
          [req => req.method === 'POST', { status: 201, body: { created: true } }]
        ],
        { status: 400, body: { error: 'Bad request' } }
      ));

      // Test success condition
      const successResponse = await fetch(`${mockServer.getUrl()}/conditional?type=success`);
      expect(successResponse.status).toBe(200);
      expect(await successResponse.json()).toEqual({ result: 'success' });

      // Test error condition
      const errorResponse = await fetch(`${mockServer.getUrl()}/conditional?type=error`);
      expect(errorResponse.status).toBe(500);
      expect(await errorResponse.json()).toEqual({ error: 'Server error' });

      // Test POST condition
      const postResponse = await fetch(`${mockServer.getUrl()}/conditional`, {
        method: 'POST'
      });
      expect(postResponse.status).toBe(201);
      expect(await postResponse.json()).toEqual({ created: true });

      // Test default response
      const defaultResponse = await fetch(`${mockServer.getUrl()}/conditional`);
      expect(defaultResponse.status).toBe(400);
      expect(await defaultResponse.json()).toEqual({ error: 'Bad request' });
    });
  });

  describe('error scenarios', () => {
    beforeEach(async () => {
      await mockServer.start();
    });

    it('should handle malformed JSON in request body gracefully', async () => {
      mockServer.setResponse('/test', { status: 200, body: 'OK' });

      const response = await fetch(`${mockServer.getUrl()}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json'
      });

      expect(response.status).toBe(200);

      const requests = mockServer.getRequests();
      expect(requests[0].body).toBe('not json');
    });

    it('should simulate network errors', async () => {
      // NOTE: Real HTTP servers cannot return status 0 (invalid HTTP status)
      // Network errors in fetch() cause rejection, not status 0 responses
      // This test verifies the mock server's error response instead
      mockServer.setResponse('/network-error', networkErrorResponse());

      const response = await fetch(`${mockServer.getUrl()}/network-error`);
      // Mock server returns 500 for invalid status codes
      expect(response.status).toBe(500);
    });
    it('should simulate network errors', async () => {
      // NOTE: Real HTTP servers cannot return status 0 (invalid HTTP status)
      // Network errors in fetch() cause rejection, not status 0 responses
      // This test verifies the mock server's error response instead
      mockServer.setResponse('/network-error', networkErrorResponse());

      const response = await fetch(`${mockServer.getUrl()}/network-error`);
      // Mock server returns 500 for invalid status codes
      expect(response.status).toBe(500);
    });
    it('should simulate network errors', async () => {
      // NOTE: Real HTTP servers cannot return status 0 (invalid HTTP status)
      // Network errors in fetch() cause rejection, not status 0 responses
      // This test verifies the mock server's error response instead
      mockServer.setResponse('/network-error', networkErrorResponse());

      const response = await fetch(`${mockServer.getUrl()}/network-error`);
      // Mock server returns 500 for invalid status codes
      expect(response.status).toBe(500);
    });
    it('should simulate network errors', async () => {
      // NOTE: Real HTTP servers cannot return status 0 (invalid HTTP status)
      // Network errors in fetch() cause rejection, not status 0 responses
      // This test verifies the mock server's error response instead
      mockServer.setResponse('/network-error', networkErrorResponse());

      const response = await fetch(`${mockServer.getUrl()}/network-error`);
      // Mock server returns 500 for invalid status codes
      expect(response.status).toBe(500);
    });
    it('should simulate network errors', async () => {
      // NOTE: Real HTTP servers cannot return status 0 (invalid HTTP status)
      // Network errors in fetch() cause rejection, not status 0 responses
      // This test verifies the mock server's error response instead
      mockServer.setResponse('/network-error', networkErrorResponse());

      const response = await fetch(`${mockServer.getUrl()}/network-error`);
      // Mock server returns 500 for invalid status codes
      expect(response.status).toBe(500);
    });
    it('should simulate network errors', async () => {
      // NOTE: Real HTTP servers cannot return status 0 (invalid HTTP status)
      // Network errors in fetch() cause rejection, not status 0 responses
      // This test verifies the mock server's error response instead
      mockServer.setResponse('/network-error', networkErrorResponse());

      const response = await fetch(`${mockServer.getUrl()}/network-error`);
      // Mock server returns 500 for invalid status codes
      expect(response.status).toBe(500);
    });

    it('should handle server errors during request processing', async () => {
      // Set up a handler that throws an error
      mockServer.setResponse('/error', () => {
        throw new Error('Handler error');
      });

      const response = await fetch(`${mockServer.getUrl()}/error`);
      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data).toEqual({ error: 'Internal Server Error' });
    });
  });

  describe('integration with config module', () => {
    let originalEnv: string | undefined;

    beforeEach(async () => {
      originalEnv = config.getEnvironment();
      await mockServer.start();
    });

    afterEach(() => {
      if (originalEnv) {
        config.setEnvironment(originalEnv as any);
      }
    });

    it('should work with config.setCustomApiUrl()', async () => {
      // Set up mock response
      mockServer.setResponse('/memberQueues.php', {
        status: 200,
        body: [null, { brewInStock: [{ id: 1, name: 'Test Beer' }] }]
      });

      // Configure the config module to use our mock server
      const mockUrl = mockServer.getUrl();
      expect(mockUrl).toBeTruthy();
      if (mockUrl) {
        config.setCustomApiUrl(mockUrl);
      }

      // Verify the config is using our mock server
      const fullUrl = config.api.getFullUrl('memberQueues');
      expect(fullUrl).toBe(`${mockUrl}/memberQueues.php`);

      // Make a request using the config URL
      const response = await fetch(fullUrl);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual([null, { brewInStock: [{ id: 1, name: 'Test Beer' }] }]);

      // Verify the request was tracked
      const requests = mockServer.getRequests();
      expect(requests).toHaveLength(1);
      expect(requests[0].path).toBe('/memberQueues.php');
    });

    it('should handle referer headers from config', async () => {
      mockServer.setResponse('/member-dash.php', {
        status: 200,
        body: '<html>Dashboard</html>'
      });

      const mockUrl = mockServer.getUrl();
      if (mockUrl) {
        config.setCustomApiUrl(mockUrl);
      }

      // Make request with referer from config
      const response = await fetch(config.api.getFullUrl('memberDashboard'), {
        headers: {
          'referer': config.api.referers.memberDashboard
        }
      });

      expect(response.status).toBe(200);

      const requests = mockServer.getRequests();
      expect(requests[0].headers.referer).toBe(`${mockUrl}/member-dash.php`);
    });

    it('should handle query parameters with config URLs', async () => {
      mockServer.setResponse('/deleteQueuedBrew.php', {
        status: 200,
        body: { success: true }
      });

      const mockUrl = mockServer.getUrl();
      if (mockUrl) {
        config.setCustomApiUrl(mockUrl);
      }

      // Build URL with query params as shown in test patterns
      const beerId = '123456';
      const url = `${config.api.getFullUrl('deleteQueuedBrew')}?cid=${beerId}`;

      const response = await fetch(url);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ success: true });

      const requests = mockServer.getRequests();
      expect(requests[0].query).toEqual({ cid: '123456' });
    });
  });
});

describe('MockServer helpers', () => {
  describe('networkErrorResponse', () => {
    it('should create network error response', () => {
      const response = networkErrorResponse();
      expect(response).toEqual({
        status: 0,
        body: undefined,
        headers: {}
      });
    });
  });

  describe('timeoutResponse', () => {
    it('should create timeout response with default delay', () => {
      const response = timeoutResponse();
      expect(response).toEqual({
        status: 200,
        body: { message: 'This will timeout' },
        delay: 30000
      });
    });

    it('should create timeout response with custom delay', () => {
      const response = timeoutResponse(5000);
      expect(response).toEqual({
        status: 200,
        body: { message: 'This will timeout' },
        delay: 5000
      });
    });
  });
});

// ============================================================================
// NEW USABILITY IMPROVEMENTS TESTS
// ============================================================================

describe('setupMockServer helper', () => {
  let cleanup: (() => Promise<void>) | null = null;

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
      cleanup = null;
    }
  });

  it('should start server and configure API URL', async () => {
    const { setupMockServer } = require('./mockServer');
    const result = await setupMockServer();
    cleanup = result.cleanup;

    expect(result.mockServer).toBeDefined();
    expect(result.mockServer.isServerRunning()).toBe(true);
    expect(result.mockServer.getUrl()).toMatch(/http:\/\/localhost:\d+/);

    // Verify config was updated
    const fullUrl = config.api.getFullUrl('memberQueues');
    expect(fullUrl).toContain(result.mockServer.getUrl()!);
  });

  it('should start on specific port when provided', async () => {
    const { setupMockServer } = require('./mockServer');
    const testPort = 3458;
    const result = await setupMockServer(testPort);
    cleanup = result.cleanup;

    expect(result.mockServer.getPort()).toBe(testPort);
  });

  it('should restore environment on cleanup', async () => {
    const { setupMockServer } = require('./mockServer');
    const originalEnv = config.getEnvironment();

    const result = await setupMockServer();
    await result.cleanup();
    cleanup = null;

    expect(config.getEnvironment()).toBe(originalEnv);
  });

  it('should work with setResponse and fetch', async () => {
    const { setupMockServer } = require('./mockServer');
    const result = await setupMockServer();
    cleanup = result.cleanup;

    result.mockServer.setResponse('/test', {
      status: 200,
      body: { success: true }
    });

    const response = await nodeFetch(`${result.mockServer.getUrl()}/test`);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ success: true });
  });
});

describe('FlyingSaucerResponses presets', () => {
  let mockServer: MockServer;
  let originalFetch: typeof fetch;

  beforeAll(() => {
    originalFetch = global.fetch;
    global.fetch = nodeFetch as any;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  beforeEach(async () => {
    mockServer = new MockServer();
    await mockServer.start();
  });

  afterEach(async () => {
    if (mockServer.isServerRunning()) {
      await mockServer.stop();
    }
  });

  describe('beers()', () => {
    it('should create proper Flying Saucer beers response', async () => {
      const { FlyingSaucerResponses } = require('./mockServer');
      const testBeers = [
        { id: 1, name: 'IPA', brewery: 'Local' },
        { id: 2, name: 'Stout', brewery: 'Craft' }
      ];

      mockServer.setResponse('/memberQueues.php', FlyingSaucerResponses.beers(testBeers));

      const response = await fetch(`${mockServer.getUrl()}/memberQueues.php`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual([null, { brewInStock: testBeers }]);
    });

    it('should handle empty beers array', async () => {
      const { FlyingSaucerResponses } = require('./mockServer');

      mockServer.setResponse('/memberQueues.php', FlyingSaucerResponses.beers([]));

      const response = await fetch(`${mockServer.getUrl()}/memberQueues.php`);
      const data = await response.json();

      expect(data).toEqual([null, { brewInStock: [] }]);
    });
  });

  describe('myBeers()', () => {
    it('should create proper tasted beers response', async () => {
      const { FlyingSaucerResponses } = require('./mockServer');
      const tastedBeers = [
        { id: 1, name: 'Tasted IPA', tasted: true }
      ];

      mockServer.setResponse('/myBeers.php', FlyingSaucerResponses.myBeers(tastedBeers));

      const response = await fetch(`${mockServer.getUrl()}/myBeers.php`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual([null, { tasted_brew_current_round: tastedBeers }]);
    });
  });

  describe('rewards()', () => {
    it('should create proper rewards response', async () => {
      const { FlyingSaucerResponses } = require('./mockServer');
      const rewardsList = [
        { id: 1, name: 'Plate 1', earned: true }
      ];

      mockServer.setResponse('/rewards.php', FlyingSaucerResponses.rewards(rewardsList));

      const response = await fetch(`${mockServer.getUrl()}/rewards.php`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual([null, { rewards: rewardsList }]);
    });
  });

  describe('empty()', () => {
    it('should create empty brewInStock response', async () => {
      const { FlyingSaucerResponses } = require('./mockServer');

      mockServer.setResponse('/api/empty', FlyingSaucerResponses.empty());

      const response = await fetch(`${mockServer.getUrl()}/api/empty`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual([null, { brewInStock: [] }]);
    });
  });

  describe('error responses', () => {
    it('should create 500 server error response', async () => {
      const { FlyingSaucerResponses } = require('./mockServer');

      mockServer.setResponse('/api/error', FlyingSaucerResponses.serverError());

      const response = await fetch(`${mockServer.getUrl()}/api/error`);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Internal Server Error' });
    });

    it('should create 401 not authenticated response', async () => {
      const { FlyingSaucerResponses } = require('./mockServer');

      mockServer.setResponse('/api/auth', FlyingSaucerResponses.notAuthenticated());

      const response = await fetch(`${mockServer.getUrl()}/api/auth`);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data).toEqual({ error: 'Not authenticated' });
    });

    it('should create 404 not found response', async () => {
      const { FlyingSaucerResponses } = require('./mockServer');

      mockServer.setResponse('/api/missing', FlyingSaucerResponses.notFound());

      const response = await fetch(`${mockServer.getUrl()}/api/missing`);

      expect(response.status).toBe(404);
    });

    it('should create 429 rate limited response', async () => {
      const { FlyingSaucerResponses } = require('./mockServer');

      mockServer.setResponse('/api/limited', FlyingSaucerResponses.rateLimited());

      const response = await fetch(`${mockServer.getUrl()}/api/limited`);
      const data = await response.json();

      expect(response.status).toBe(429);
      expect(data).toEqual({ error: 'Rate limit exceeded' });
    });
  });
});

describe('RequestMatcher', () => {
  let mockServer: MockServer;
  let originalFetch: typeof fetch;

  beforeAll(() => {
    originalFetch = global.fetch;
    global.fetch = nodeFetch as any;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  beforeEach(async () => {
    mockServer = new MockServer();
    await mockServer.start();
  });

  afterEach(async () => {
    if (mockServer.isServerRunning()) {
      await mockServer.stop();
    }
  });

  describe('toHaveBeenCalled', () => {
    it('should pass when endpoint was called', async () => {
      mockServer.setResponse('/api/test', { status: 200, body: 'OK' });

      await fetch(`${mockServer.getUrl()}/api/test`);

      expect(() => {
        mockServer.expectRequest('/api/test').toHaveBeenCalled();
      }).not.toThrow();
    });

    it('should fail when endpoint was not called', () => {
      expect(() => {
        mockServer.expectRequest('/api/never-called').toHaveBeenCalled();
      }).toThrow('Expected /api/never-called to have been called, but it was not called');
    });
  });

  describe('toHaveBeenCalledTimes', () => {
    it('should pass when call count matches', async () => {
      mockServer.setResponse('/api/test', { status: 200, body: 'OK' });

      await fetch(`${mockServer.getUrl()}/api/test`);
      await fetch(`${mockServer.getUrl()}/api/test`);
      await fetch(`${mockServer.getUrl()}/api/test`);

      expect(() => {
        mockServer.expectRequest('/api/test').toHaveBeenCalledTimes(3);
      }).not.toThrow();
    });

    it('should fail when call count does not match', async () => {
      mockServer.setResponse('/api/test', { status: 200, body: 'OK' });

      await fetch(`${mockServer.getUrl()}/api/test`);

      expect(() => {
        mockServer.expectRequest('/api/test').toHaveBeenCalledTimes(3);
      }).toThrow('Expected /api/test to have been called 3 times, but it was called 1 times');
    });
  });

  describe('toHaveBeenCalledWith', () => {
    it('should match query parameters', async () => {
      mockServer.setResponse('/api/search', { status: 200, body: [] });

      await fetch(`${mockServer.getUrl()}/api/search?q=test&page=1`);

      expect(() => {
        mockServer.expectRequest('/api/search').toHaveBeenCalledWith({
          query: { q: 'test', page: '1' }
        });
      }).not.toThrow();
    });

    it('should match request method', async () => {
      mockServer.setResponse('/api/create', { status: 201, body: { created: true } });

      await fetch(`${mockServer.getUrl()}/api/create`, {
        method: 'POST',
        body: JSON.stringify({ name: 'Test' }),
        headers: { 'Content-Type': 'application/json' }
      });

      expect(() => {
        mockServer.expectRequest('/api/create').toHaveBeenCalledWith({
          method: 'POST'
        });
      }).not.toThrow();
    });

    it('should match request body', async () => {
      mockServer.setResponse('/api/create', { status: 201, body: { created: true } });

      const testData = { name: 'Test Item', value: 42 };
      await fetch(`${mockServer.getUrl()}/api/create`, {
        method: 'POST',
        body: JSON.stringify(testData),
        headers: { 'Content-Type': 'application/json' }
      });

      expect(() => {
        mockServer.expectRequest('/api/create').toHaveBeenCalledWith({
          body: testData
        });
      }).not.toThrow();
    });

    it('should match request headers', async () => {
      mockServer.setResponse('/api/auth', { status: 200, body: 'OK' });

      await fetch(`${mockServer.getUrl()}/api/auth`, {
        headers: {
          'X-Auth-Token': 'abc123',
          'Content-Type': 'application/json'
        }
      });

      expect(() => {
        mockServer.expectRequest('/api/auth').toHaveBeenCalledWith({
          headers: { 'x-auth-token': 'abc123' }
        });
      }).not.toThrow();
    });

    it('should fail when parameters do not match', async () => {
      mockServer.setResponse('/api/test', { status: 200, body: 'OK' });

      await fetch(`${mockServer.getUrl()}/api/test?foo=bar`);

      expect(() => {
        mockServer.expectRequest('/api/test').toHaveBeenCalledWith({
          query: { foo: 'baz' }
        });
      }).toThrow('Expected /api/test to have been called with');
    });
  });

  describe('not.toHaveBeenCalled', () => {
    it('should pass when endpoint was not called', () => {
      expect(() => {
        mockServer.expectRequest('/api/never').not.toHaveBeenCalled();
      }).not.toThrow();
    });

    it('should fail when endpoint was called', async () => {
      mockServer.setResponse('/api/test', { status: 200, body: 'OK' });

      await fetch(`${mockServer.getUrl()}/api/test`);

      expect(() => {
        mockServer.expectRequest('/api/test').not.toHaveBeenCalled();
      }).toThrow('Expected /api/test not to have been called, but it was called 1 times');
    });
  });
});