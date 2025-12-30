/**
 * Mock Server Utilities for Testing
 *
 * Provides a lightweight HTTP server for testing API interactions without
 * mocking fetch directly. This enables more realistic integration testing
 * by making actual HTTP requests to a controlled server.
 *
 * @module mockServer
 */

import * as http from 'http';
import { IncomingMessage, ServerResponse } from 'http';
import { URL } from 'url';

/**
 * Request record for tracking HTTP requests
 */
export interface RequestRecord {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, string>;
  body?: any;
  timestamp: Date;
}

/**
 * Response configuration for mock endpoints
 */
export interface MockResponse {
  status: number;
  body?: any;
  headers?: Record<string, string>;
  delay?: number;
}

/**
 * Dynamic response handler function
 */
export type DynamicResponseHandler = (req: RequestRecord) => MockResponse | Promise<MockResponse>;

/**
 * MockServer class for creating test HTTP servers
 *
 * @example
 * ```typescript
 * const mockServer = new MockServer();
 * await mockServer.start(3000);
 *
 * mockServer.setResponse('/api/test', {
 *   status: 200,
 *   body: { data: 'test' }
 * });
 *
 * // Make requests to http://localhost:3000/api/test
 *
 * const requests = mockServer.getRequests();
 * await mockServer.stop();
 * ```
 */
export class MockServer {
  private server: http.Server | null = null;
  private port: number = 0;
  private isRunning: boolean = false;
  private requestHistory: RequestRecord[] = [];
  private responseMap: Map<string, MockResponse | DynamicResponseHandler> = new Map();
  private defaultResponse: MockResponse = {
    status: 404,
    body: { error: 'Not Found' },
  };

  /**
   * Start the mock server on specified port
   * @param port - Port number to listen on
   * @returns Promise that resolves when server is ready
   */
  async start(port: number = 0): Promise<number> {
    if (this.isRunning) {
      throw new Error('MockServer is already running');
    }

    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res).catch((err: Error) => {
          console.error('MockServer request handling error:', err);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Internal Server Error' }));
          }
        });
      });

      this.server.on('error', (err: Error) => {
        this.isRunning = false;
        reject(err);
      });

      this.server.listen(port, () => {
        if (!this.server) {
          reject(new Error('Server failed to initialize'));
          return;
        }

        const address = this.server.address();
        if (!address || typeof address === 'string') {
          reject(new Error('Unable to determine server port'));
          return;
        }

        this.port = address.port;
        this.isRunning = true;
        resolve(this.port);
      });
    });
  }

  /**
   * Stop the mock server
   * @returns Promise that resolves when server is stopped
   */
  async stop(): Promise<void> {
    if (!this.isRunning || !this.server) {
      return;
    }

    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }

      this.server.close(err => {
        if (err) {
          reject(err);
        } else {
          this.isRunning = false;
          this.server = null;
          this.port = 0;
          resolve();
        }
      });
    });
  }

  /**
   * Set a static response for an endpoint
   * @param path - Path to match (exact match)
   * @param response - Response configuration or dynamic handler
   */
  setResponse(path: string, response: MockResponse | DynamicResponseHandler): void {
    this.responseMap.set(path, response);
  }

  /**
   * Set multiple responses at once
   * @param responses - Map of path to response configuration
   */
  setResponses(responses: Record<string, MockResponse | DynamicResponseHandler>): void {
    Object.entries(responses).forEach(([path, response]) => {
      this.setResponse(path, response);
    });
  }

  /**
   * Set the default response for unmatched paths
   * @param response - Default response configuration
   */
  setDefaultResponse(response: MockResponse): void {
    this.defaultResponse = response;
  }

  /**
   * Clear a specific response configuration
   * @param path - Path to clear
   */
  clearResponse(path: string): void {
    this.responseMap.delete(path);
  }

  /**
   * Clear all response configurations
   */
  clearAllResponses(): void {
    this.responseMap.clear();
  }

  /**
   * Get all recorded requests
   * @returns Array of request records
   */
  getRequests(): RequestRecord[] {
    return [...this.requestHistory];
  }

  /**
   * Get requests for a specific path
   * @param path - Path to filter by
   * @returns Array of matching request records
   */
  getRequestsForPath(path: string): RequestRecord[] {
    return this.requestHistory.filter(req => req.path === path);
  }

  /**
   * Get the last request made
   * @returns Last request record or undefined
   */
  getLastRequest(): RequestRecord | undefined {
    return this.requestHistory[this.requestHistory.length - 1];
  }

  /**
   * Clear request history
   */
  clearHistory(): void {
    this.requestHistory = [];
  }

  /**
   * Get the server URL
   * @returns Server URL or null if not running
   */
  getUrl(): string | null {
    if (!this.isRunning) {
      return null;
    }
    return `http://localhost:${this.port}`;
  }

  /**
   * Check if server is running
   * @returns True if server is running
   */
  isServerRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get the server port
   * @returns Port number or 0 if not running
   */
  getPort(): number {
    return this.port;
  }

  /**
   * Handle incoming HTTP requests
   * @private
   */
  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      // Parse request details
      const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
      const path = url.pathname;
      const query: Record<string, string> = {};

      url.searchParams.forEach((value, key) => {
        query[key] = value;
      });

      // Parse request body if present
      let body: any = undefined;
      if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
        body = await this.parseRequestBody(req);
      }

      // Record the request
      const requestRecord: RequestRecord = {
        method: req.method || 'GET',
        path,
        headers: req.headers,
        query,
        body,
        timestamp: new Date(),
      };
      this.requestHistory.push(requestRecord);

      // Get the response configuration
      let responseConfig = this.responseMap.get(path);

      // If not found, try to find a pattern match (for wildcard support)
      if (!responseConfig) {
        for (const [pattern, config] of this.responseMap.entries()) {
          if (pattern.includes('*') && this.matchesPattern(path, pattern)) {
            responseConfig = config;
            break;
          }
        }
      }

      // Use default response if no match found
      if (!responseConfig) {
        responseConfig = this.defaultResponse;
      }

      // Handle dynamic response
      let finalResponse: MockResponse;
      if (typeof responseConfig === 'function') {
        finalResponse = await responseConfig(requestRecord);
      } else {
        finalResponse = responseConfig;
      }

      // Apply delay if specified
      if (finalResponse.delay && finalResponse.delay > 0) {
        await this.delay(finalResponse.delay);
      }

      // Set response headers
      const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Cookie, Referer',
        ...finalResponse.headers,
      };

      Object.entries(headers).forEach(([key, value]) => {
        res.setHeader(key, value);
      });

      // Send response
      res.statusCode = finalResponse.status;

      if (finalResponse.body !== undefined) {
        const responseBody =
          typeof finalResponse.body === 'string'
            ? finalResponse.body
            : JSON.stringify(finalResponse.body);
        res.end(responseBody);
      } else {
        res.end();
      }
    } catch (error) {
      // Handle errors
      console.error('MockServer request handling error:', error);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Internal Server Error' }));
    }
  }

  /**
   * Parse request body
   * @private
   */
  private parseRequestBody(req: IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      let body = '';

      req.on('data', chunk => {
        body += chunk.toString();
      });

      req.on('end', () => {
        if (!body) {
          resolve(undefined);
          return;
        }

        try {
          // Try to parse as JSON
          const contentType = req.headers['content-type'] || '';
          if (contentType.includes('application/json')) {
            resolve(JSON.parse(body));
          } else {
            resolve(body);
          }
        } catch (error) {
          resolve(body);
        }
      });

      req.on('error', reject);
    });
  }

  /**
   * Check if a path matches a pattern (with wildcard support)
   * @private
   */
  private matchesPattern(path: string, pattern: string): boolean {
    const regexPattern = pattern.replace(/[.+?^${}()|[\\\]]/g, '\\$&').replace(/\*/g, '.*');
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(path);
  }

  /**
   * Delay helper
   * @private
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Helper to create dynamic response handlers for sequential responses
 * @param responses - Array of responses to return in sequence
 * @returns Dynamic response handler
 */
export function createSequentialResponses(responses: MockResponse[]): DynamicResponseHandler {
  let index = 0;

  return () => {
    const response = responses[index % responses.length];
    index++;
    return response;
  };
}

/**
 * Helper to create conditional response based on request properties
 * @param conditions - Map of condition functions to responses
 * @param defaultResponse - Default response if no conditions match
 * @returns Dynamic response handler
 */
export function createConditionalResponse(
  conditions: [(req: RequestRecord) => boolean, MockResponse][],
  defaultResponse: MockResponse
): DynamicResponseHandler {
  return (req: RequestRecord) => {
    for (const [condition, response] of conditions) {
      if (condition(req)) {
        return response;
      }
    }
    return defaultResponse;
  };
}

/**
 * Helper to simulate network errors
 * @returns MockResponse that simulates a network error
 */
export function networkErrorResponse(): MockResponse {
  return {
    status: 0,
    body: undefined,
    headers: {},
  };
}

/**
 * Helper to simulate timeout
 * @param delayMs - Delay in milliseconds (should be longer than test timeout)
 * @returns MockResponse with long delay
 */
export function timeoutResponse(delayMs: number = 30000): MockResponse {
  return {
    status: 200,
    body: { message: 'This will timeout' },
    delay: delayMs,
  };
}

/**
 * Default export for convenience
 */
export default MockServer;

// ============================================================================
// HIGH PRIORITY USABILITY IMPROVEMENTS
// ============================================================================

/**
 * Setup helper that combines server start + config setup
 * Provides a one-line setup for most test scenarios
 *
 * @param port - Optional port number to start the server on
 * @returns Object with mockServer instance and cleanup function
 *
 * @example
 * ```typescript
 * const { mockServer, cleanup } = await setupMockServer();
 *
 * mockServer.setResponse('/api/test', { status: 200, body: { data: 'test' } });
 * // Make API calls...
 *
 * await cleanup();
 * ```
 */
export async function setupMockServer(port?: number): Promise<{
  mockServer: MockServer;
  cleanup: () => Promise<void>;
}> {
  // Import at runtime to allow tests to configure mocks first
  const { config } = require('@/src/config');

  const mockServer = new MockServer();
  const originalEnv = config.getEnvironment();

  await mockServer.start(port);
  config.setCustomApiUrl(mockServer.getUrl()!);

  return {
    mockServer,
    cleanup: async () => {
      await mockServer.stop();
      config.setEnvironment(originalEnv);
    },
  };
}

/**
 * Preset response builders for common Flying Saucer API patterns
 * Makes it easy to create API responses that match the expected format
 *
 * @example
 * ```typescript
 * // All beers response
 * mockServer.setResponse('/memberQueues.php',
 *   FlyingSaucerResponses.beers([
 *     { id: 1, name: 'IPA' },
 *     { id: 2, name: 'Stout' }
 *   ])
 * );
 *
 * // My beers (tasted) response
 * mockServer.setResponse('/myBeers.php',
 *   FlyingSaucerResponses.myBeers(tastedBeers)
 * );
 *
 * // Error responses
 * mockServer.setResponse('/api/error',
 *   FlyingSaucerResponses.serverError()
 * );
 * ```
 */
export const FlyingSaucerResponses = {
  /**
   * Create a response for the all beers endpoint (brewInStock)
   * @param beers - Array of beer objects
   * @returns MockResponse with Flying Saucer API format
   */
  beers: (beers: any[]): MockResponse => ({
    status: 200,
    body: [null, { brewInStock: beers }],
  }),

  /**
   * Create a response for the my beers endpoint (tasted_brew_current_round)
   * @param beers - Array of tasted beer objects
   * @returns MockResponse with Flying Saucer API format
   */
  myBeers: (beers: any[]): MockResponse => ({
    status: 200,
    body: [null, { tasted_brew_current_round: beers }],
  }),

  /**
   * Create a response for the rewards endpoint
   * @param rewards - Array of reward objects
   * @returns MockResponse with Flying Saucer API format
   */
  rewards: (rewards: any[]): MockResponse => ({
    status: 200,
    body: [null, { rewards: rewards }],
  }),

  /**
   * Create an empty response (no beers/data)
   * @returns MockResponse with empty brewInStock array
   */
  empty: (): MockResponse => ({
    status: 200,
    body: [null, { brewInStock: [] }],
  }),

  /**
   * Create a 500 server error response
   * @returns MockResponse with 500 status
   */
  serverError: (): MockResponse => ({
    status: 500,
    body: { error: 'Internal Server Error' },
  }),

  /**
   * Create a 401 not authenticated response
   * @returns MockResponse with 401 status
   */
  notAuthenticated: (): MockResponse => ({
    status: 401,
    body: { error: 'Not authenticated' },
  }),

  /**
   * Create a 404 not found response
   * @returns MockResponse with 404 status
   */
  notFound: (): MockResponse => ({
    status: 404,
    body: { error: 'Not found' },
  }),

  /**
   * Create a 429 rate limited response
   * @returns MockResponse with 429 status
   */
  rateLimited: (): MockResponse => ({
    status: 429,
    body: { error: 'Rate limit exceeded' },
  }),
};

/**
 * Jest hook for automatic MockServer lifecycle management
 * Handles server start/stop and cleanup automatically in test suites
 *
 * @returns MockServer instance ready to use in tests
 *
 * @example
 * ```typescript
 * describe('My API Tests', () => {
 *   const mockServer = useMockServer();
 *
 *   it('should fetch data', async () => {
 *     mockServer.setResponse('/api/test', { status: 200, body: { data: 'test' } });
 *     // Test implementation...
 *   });
 *
 *   // Server automatically started before tests and stopped after
 *   // History automatically cleared between tests
 * });
 * ```
 */
export function useMockServer(): MockServer {
  const mockServer = new MockServer();
  let cleanup: (() => Promise<void>) | null = null;

  beforeAll(async () => {
    const result = await setupMockServer();
    // Copy properties from the setup mockServer to our instance
    Object.assign(mockServer, result.mockServer);
    cleanup = result.cleanup;
  });

  afterAll(async () => {
    if (cleanup) {
      await cleanup();
    }
  });

  beforeEach(() => {
    mockServer.clearHistory();
    mockServer.clearAllResponses();
  });

  return mockServer;
}

// ============================================================================
// MEDIUM PRIORITY USABILITY IMPROVEMENTS
// ============================================================================

/**
 * Request matcher for fluent request validation API
 * Provides a more readable way to assert on requests
 *
 * @example
 * ```typescript
 * // Check if endpoint was called
 * mockServer.expectRequest('/api/users').toHaveBeenCalled();
 *
 * // Check call count
 * mockServer.expectRequest('/api/users').toHaveBeenCalledTimes(3);
 *
 * // Check request details
 * mockServer.expectRequest('/api/create').toHaveBeenCalledWith({
 *   headers: { 'content-type': 'application/json' },
 *   query: { foo: 'bar' },
 *   body: { name: 'Test' }
 * });
 * ```
 */
export class RequestMatcher {
  constructor(
    private server: MockServer,
    private path: string
  ) {}

  /**
   * Assert that the endpoint was called at least once
   */
  toHaveBeenCalled(): void {
    const requests = this.server.getRequestsForPath(this.path);
    if (requests.length === 0) {
      throw new Error(`Expected ${this.path} to have been called, but it was not called`);
    }
  }

  /**
   * Assert that the endpoint was called exactly N times
   * @param count - Expected number of calls
   */
  toHaveBeenCalledTimes(count: number): void {
    const requests = this.server.getRequestsForPath(this.path);
    if (requests.length !== count) {
      throw new Error(
        `Expected ${this.path} to have been called ${count} times, but it was called ${requests.length} times`
      );
    }
  }

  /**
   * Assert that the endpoint was called with specific parameters
   * @param params - Expected request parameters (headers, query, body, method)
   */
  toHaveBeenCalledWith(params: {
    headers?: Record<string, any>;
    query?: Record<string, string>;
    body?: any;
    method?: string;
  }): void {
    const requests = this.server.getRequestsForPath(this.path);

    if (requests.length === 0) {
      throw new Error(`Expected ${this.path} to have been called, but it was not called`);
    }

    // Check if any request matches the params
    const matchingRequest = requests.find(req => {
      let matches = true;

      if (params.method && req.method !== params.method) {
        matches = false;
      }

      if (params.headers) {
        for (const [key, value] of Object.entries(params.headers)) {
          const headerKey = key.toLowerCase();
          if (req.headers[headerKey] !== value) {
            matches = false;
            break;
          }
        }
      }

      if (params.query) {
        for (const [key, value] of Object.entries(params.query)) {
          if (req.query[key] !== value) {
            matches = false;
            break;
          }
        }
      }

      if (params.body !== undefined) {
        if (JSON.stringify(req.body) !== JSON.stringify(params.body)) {
          matches = false;
        }
      }

      return matches;
    });

    if (!matchingRequest) {
      const requestDetails = requests.map(req => ({
        method: req.method,
        headers: req.headers,
        query: req.query,
        body: req.body,
      }));
      throw new Error(
        `Expected ${this.path} to have been called with ${JSON.stringify(params)}, ` +
          `but actual requests were: ${JSON.stringify(requestDetails, null, 2)}`
      );
    }
  }

  /**
   * Assert that the endpoint was NOT called
   */
  not: {
    toHaveBeenCalled: () => void;
  } = {
    toHaveBeenCalled: () => {
      const requests = this.server.getRequestsForPath(this.path);
      if (requests.length > 0) {
        throw new Error(
          `Expected ${this.path} not to have been called, but it was called ${requests.length} times`
        );
      }
    },
  };
}

/**
 * Add expectRequest method to MockServer for fluent request validation
 */
declare module './mockServer' {
  interface MockServer {
    expectRequest(path: string): RequestMatcher;
  }
}

// Add the method to MockServer prototype
MockServer.prototype.expectRequest = function (path: string): RequestMatcher {
  return new RequestMatcher(this, path);
};
