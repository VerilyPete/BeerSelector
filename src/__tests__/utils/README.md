# Mock Server Test Utilities

This directory contains testing utilities for the BeerSelector app, with a focus on realistic HTTP testing using a lightweight mock server.

## Overview

The MockServer utility provides a real HTTP server for testing, allowing tests to make actual HTTP requests instead of mocking fetch directly. This approach offers several benefits:

- **More realistic testing**: Tests make actual network calls
- **Better integration testing**: Validates the full HTTP request/response cycle
- **Request tracking**: Automatically records all requests for validation
- **Flexible response configuration**: Static responses, dynamic handlers, delays, errors
- **Config module integration**: Works seamlessly with the centralized config module

## Quick Start

```typescript
import { MockServer } from '@/src/__tests__/utils/mockServer';
import { config } from '@/src/config';

describe('API Integration Test', () => {
  const mockServer = new MockServer();

  beforeAll(async () => {
    // Start the mock server
    await mockServer.start(3000);

    // Configure the app to use the mock server
    config.setCustomApiUrl(mockServer.getUrl());
  });

  afterAll(async () => {
    await mockServer.stop();
    config.setEnvironment('production'); // Reset
  });

  beforeEach(() => {
    mockServer.clearHistory();
  });

  it('should fetch beers from API', async () => {
    // Configure the response
    mockServer.setResponse('/memberQueues.php', {
      status: 200,
      body: [null, { brewInStock: [...beers] }]
    });

    // Make the API call
    const result = await fetchBeersFromAPI();

    // Verify the request
    const requests = mockServer.getRequests();
    expect(requests).toHaveLength(1);
    expect(requests[0].path).toBe('/memberQueues.php');

    // Verify the result
    expect(result).toHaveLength(beers.length);
  });
});
```

## API Reference

### MockServer Class

#### Starting and Stopping

```typescript
// Start on random port
const port = await mockServer.start();

// Start on specific port
await mockServer.start(3000);

// Stop the server
await mockServer.stop();

// Check if running
if (mockServer.isServerRunning()) {
  // Server is running
}

// Get server URL
const url = mockServer.getUrl(); // "http://localhost:3000"
```

#### Configuring Responses

```typescript
// Set a single response
mockServer.setResponse('/api/test', {
  status: 200,
  body: { message: 'Hello' },
  headers: { 'X-Custom': 'value' },
  delay: 100 // Optional delay in ms
});

// Set multiple responses
mockServer.setResponses({
  '/api/users': { status: 200, body: [...users] },
  '/api/posts': { status: 200, body: [...posts] }
});

// Set default response for unmatched paths
mockServer.setDefaultResponse({
  status: 404,
  body: { error: 'Not Found' }
});

// Clear responses
mockServer.clearResponse('/api/test');
mockServer.clearAllResponses();
```

#### Dynamic Response Handlers

```typescript
// Function-based responses
mockServer.setResponse('/dynamic', (request) => {
  if (request.query.error === 'true') {
    return { status: 500, body: { error: 'Server Error' } };
  }
  return { status: 200, body: { success: true } };
});

// Sequential responses (different response each time)
import { createSequentialResponses } from '@/src/__tests__/utils/mockServer';

mockServer.setResponse('/sequential', createSequentialResponses([
  { status: 200, body: 'First call' },
  { status: 201, body: 'Second call' },
  { status: 202, body: 'Third call' }
]));

// Conditional responses
import { createConditionalResponse } from '@/src/__tests__/utils/mockServer';

mockServer.setResponse('/conditional', createConditionalResponse(
  [
    [req => req.method === 'POST', { status: 201, body: 'Created' }],
    [req => req.query.id === '1', { status: 200, body: 'User 1' }]
  ],
  { status: 404, body: 'Not Found' } // Default
));
```

#### Request Tracking

```typescript
// Get all requests
const allRequests = mockServer.getRequests();

// Get requests for specific path
const userRequests = mockServer.getRequestsForPath('/api/users');

// Get last request
const lastRequest = mockServer.getLastRequest();

// Clear history
mockServer.clearHistory();

// Request object structure
interface RequestRecord {
  method: string;              // 'GET', 'POST', etc.
  path: string;                // '/api/users'
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, string>; // Query parameters
  body?: any;                  // Request body (parsed)
  timestamp: Date;
}
```

## Common Test Scenarios

### Testing Success Cases

```typescript
it('should fetch data successfully', async () => {
  mockServer.setResponse('/api/data', {
    status: 200,
    body: { id: 1, name: 'Test' }
  });

  const response = await fetch(`${mockServer.getUrl()}/api/data`);
  const data = await response.json();

  expect(response.status).toBe(200);
  expect(data).toEqual({ id: 1, name: 'Test' });
});
```

### Testing Error Scenarios

```typescript
it('should handle server errors', async () => {
  mockServer.setResponse('/api/error', {
    status: 500,
    body: { error: 'Internal Server Error' }
  });

  const response = await fetch(`${mockServer.getUrl()}/api/error`);

  expect(response.status).toBe(500);
});

it('should handle network timeouts', async () => {
  mockServer.setResponse('/api/slow', {
    status: 200,
    body: 'OK',
    delay: 10000 // 10 second delay
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 100);

  await expect(
    fetch(`${mockServer.getUrl()}/api/slow`, {
      signal: controller.signal
    })
  ).rejects.toThrow('AbortError');

  clearTimeout(timeout);
});
```

### Testing with Request Headers

```typescript
it('should send authentication headers', async () => {
  mockServer.setResponse('/api/protected', {
    status: 200,
    body: { secure: 'data' }
  });

  await fetch(`${mockServer.getUrl()}/api/protected`, {
    headers: {
      'Authorization': 'Bearer token123',
      'Cookie': 'session=abc'
    }
  });

  const requests = mockServer.getRequests();
  expect(requests[0].headers).toMatchObject({
    'authorization': 'Bearer token123',
    'cookie': 'session=abc'
  });
});
```

### Testing POST Requests

```typescript
it('should handle POST with JSON body', async () => {
  mockServer.setResponse('/api/create', {
    status: 201,
    body: { id: 123, created: true }
  });

  const payload = { name: 'New Item', value: 42 };

  const response = await fetch(`${mockServer.getUrl()}/api/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const requests = mockServer.getRequests();
  expect(requests[0]).toMatchObject({
    method: 'POST',
    body: payload
  });
});
```

### Testing Query Parameters

```typescript
it('should handle query parameters', async () => {
  mockServer.setResponse('/api/search', {
    status: 200,
    body: { results: [] }
  });

  await fetch(`${mockServer.getUrl()}/api/search?q=test&limit=10`);

  const requests = mockServer.getRequests();
  expect(requests[0].query).toEqual({
    q: 'test',
    limit: '10'
  });
});
```

## Integration with Config Module

The MockServer is designed to work seamlessly with the MP-6 config module:

```typescript
import { MockServer } from '@/src/__tests__/utils/mockServer';
import { config } from '@/src/config';
import { fetchBeersFromAPI } from '@/src/services/dataUpdateService';

describe('Data Update Service', () => {
  const mockServer = new MockServer();

  beforeAll(async () => {
    await mockServer.start();
    // Use the mock server URL in config
    config.setCustomApiUrl(mockServer.getUrl());
  });

  afterAll(async () => {
    await mockServer.stop();
    config.setEnvironment('production');
  });

  it('should use config URLs with mock server', async () => {
    // Set up response for config endpoint
    mockServer.setResponse('/memberQueues.php', {
      status: 200,
      body: [null, { brewInStock: [...] }]
    });

    // Service uses config.api.getFullUrl() internally
    const beers = await fetchBeersFromAPI();

    // Verify correct endpoint was called
    const requests = mockServer.getRequests();
    expect(requests[0].path).toBe('/memberQueues.php');
  });

  it('should handle referer headers from config', async () => {
    mockServer.setResponse('/deleteQueuedBrew.php', {
      status: 200,
      body: { success: true }
    });

    // Make request with config referer
    await fetch(
      `${config.api.getFullUrl('deleteQueuedBrew')}?cid=123`,
      {
        headers: {
          'referer': config.api.referers.memberQueues
        }
      }
    );

    const requests = mockServer.getRequests();
    expect(requests[0].headers.referer).toBe(
      `${mockServer.getUrl()}/memberQueues.php`
    );
  });
});
```

## Advanced Usage

### Simulating Flaky Network

```typescript
let callCount = 0;
mockServer.setResponse('/flaky', () => {
  callCount++;
  if (callCount === 1) {
    // First call fails
    return { status: 500, body: { error: 'Server Error' } };
  }
  // Subsequent calls succeed
  return { status: 200, body: { success: true } };
});
```

### Testing Retry Logic

```typescript
it('should retry on failure', async () => {
  const responses = [
    { status: 503, body: { error: 'Service Unavailable' } },
    { status: 503, body: { error: 'Service Unavailable' } },
    { status: 200, body: { success: true } }
  ];

  mockServer.setResponse('/retry-test',
    createSequentialResponses(responses)
  );

  const result = await serviceWithRetry('/retry-test');

  expect(result).toEqual({ success: true });
  expect(mockServer.getRequests()).toHaveLength(3);
});
```

### Testing Concurrent Requests

```typescript
it('should handle concurrent requests', async () => {
  mockServer.setResponse('/concurrent', {
    status: 200,
    body: { data: 'test' }
  });

  const promises = Array(10).fill(null).map(() =>
    fetch(`${mockServer.getUrl()}/concurrent`)
  );

  await Promise.all(promises);

  const requests = mockServer.getRequests();
  expect(requests).toHaveLength(10);
});
```

## Troubleshooting

### Port Already in Use

If you get a port conflict error:

```typescript
// Use a random available port
const port = await mockServer.start(); // No port specified

// Or use a different port
await mockServer.start(3456);
```

### Tests Hanging

Ensure you stop the server in `afterAll` or `afterEach`:

```typescript
afterAll(async () => {
  if (mockServer.isServerRunning()) {
    await mockServer.stop();
  }
});
```

### Request Not Matching

Debug request paths:

```typescript
const requests = mockServer.getRequests();
console.log('Actual path:', requests[0]?.path);
console.log('Expected path:', '/api/test');
```

### Memory Leaks

Clear history between tests to prevent memory buildup:

```typescript
beforeEach(() => {
  mockServer.clearHistory();
});
```

## Best Practices

1. **Always stop servers**: Ensure servers are stopped in cleanup hooks
2. **Clear history**: Reset request history between tests
3. **Use descriptive paths**: Match your actual API endpoints
4. **Test error cases**: Include tests for failures, timeouts, and edge cases
5. **Validate requests**: Check that your app sends the correct data
6. **Use config module**: Integrate with config for consistent URL handling
7. **Isolate tests**: Each test should set up its own responses
8. **Document delays**: Comment why delays are used (timeout testing, etc.)

## Migration from Mocked Fetch

If you're migrating from directly mocked fetch:

### Before (Mocked Fetch)
```typescript
global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  json: jest.fn().mockResolvedValue({ data: 'test' })
});
```

### After (Mock Server)
```typescript
const mockServer = new MockServer();
await mockServer.start();

mockServer.setResponse('/api/endpoint', {
  status: 200,
  body: { data: 'test' }
});

config.setCustomApiUrl(mockServer.getUrl());
```

The mock server approach provides more realistic testing and better request validation capabilities.

## Related Documentation

- [Test Patterns: Config Module Usage](../../../docs/TEST_PATTERNS_CONFIG_MODULE.md)
- [Mock Server Patterns](../../../docs/MOCK_SERVER_PATTERNS.md)
- [MP-6 Test Refactoring Plan](../../../docs/MP-6_TEST_REFACTORING_PLAN.md)