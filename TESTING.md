# Testing Guide for BeerSelector App

This document provides information on how to run tests for the BeerSelector app.

## Test Structure

The tests are organized as follows:

- `__tests__/` - Component tests
- `src/api/__tests__/` - API service tests
- `src/database/__tests__/` - Database operation tests
- `src/types/__tests__/` - Type guard tests

## Running Tests

### Command Line

To run tests in watch mode (during development):

```bash
npm test
```

To run tests once with coverage report:

```bash
npm run test:ci
```

### Xcode Integration

Tests can be run directly from Xcode by adding a Run Script phase to your target:

1. In Xcode, select your target and go to "Build Phases"
2. Click the "+" button and select "New Run Script Phase"
3. Add the following script:

```bash
"${SRCROOT}/../scripts/run-tests.sh"
```

This will run the tests as part of your build process and fail the build if tests fail.

## Writing Tests

### Component Tests

Component tests use React Test Renderer for snapshot testing:

```typescript
import * as React from 'react';
import renderer from 'react-test-renderer';
import { MyComponent } from '../MyComponent';

it('renders correctly', () => {
  const tree = renderer.create(<MyComponent />).toJSON();
  expect(tree).toMatchSnapshot();
});
```

### API Service Tests

API service tests mock external dependencies and test the service functions:

```typescript
import { myApiFunction } from '../myApiService';
import { ApiClient } from '../apiClient';

// Mock dependencies
jest.mock('../apiClient');

describe('myApiService', () => {
  it('should handle successful API calls', async () => {
    // Setup mocks
    const mockApiClient = require('../apiClientInstance').apiClient;
    mockApiClient.get.mockResolvedValue({
      success: true,
      data: { test: 'data' }
    });
    
    // Test the function
    const result = await myApiFunction();
    
    // Assert expectations
    expect(result.success).toBe(true);
  });
});
```

### Database Tests

Database tests mock the SQLite module and test database operations:

```typescript
import { myDatabaseFunction } from '../db';
import * as SQLite from 'expo-sqlite';

// Mock SQLite
jest.mock('expo-sqlite');

describe('Database Operations', () => {
  it('should perform database operations correctly', async () => {
    // Setup mocks
    const mockDatabase = {
      getAllAsync: jest.fn().mockResolvedValue([{ id: 1, name: 'Test' }])
    };
    (SQLite.openDatabase as jest.Mock).mockReturnValue(mockDatabase);
    
    // Test the function
    const result = await myDatabaseFunction();
    
    // Assert expectations
    expect(result).toEqual([{ id: 1, name: 'Test' }]);
  });
});
```

## Test Coverage

Test coverage reports are generated when running `npm run test:ci`. The coverage report can be found in the `coverage/` directory.

## Continuous Integration

Tests are automatically run in CI environments using the `test:ci` script. The test results are output in JUnit format for integration with CI systems.

## Troubleshooting

If you encounter issues with tests:

1. Make sure all dependencies are installed: `npm install`
2. Check that the test file follows the naming convention: `*.test.ts` or `*.test.tsx`
3. Verify that mocks are properly set up for external dependencies
4. Check the Jest configuration in `jest.config.js`
