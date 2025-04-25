# Testing Guide for BeerSelector App

This document provides information on how to run tests for the BeerSelector app.

## Test Structure

The tests are organized as follows:

- `__tests__/` - Component tests
- `src/api/__tests__/` - API service tests
- `src/database/__tests__/` - Database operation tests
- `src/services/__tests__/` - Service function tests
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

### Service Function Tests

Service function tests mock external dependencies and test service functions:

```typescript
import { fetchAndUpdateAllBeers, fetchAndUpdateMyBeers } from '../dataUpdateService';
import { getPreference, setPreference, populateBeersTable, populateMyBeersTable } from '../../database/db';

// Mock dependencies
jest.mock('../../database/db', () => ({
  getPreference: jest.fn(),
  setPreference: jest.fn(),
  populateBeersTable: jest.fn(),
  populateMyBeersTable: jest.fn(),
}));

// Mock fetch
global.fetch = jest.fn();

describe('dataUpdateService', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock for fetch
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue([]),
    });
  });

  describe('fetchAndUpdateAllBeers', () => {
    it('should successfully update all beers', async () => {
      // Mock getPreference to return an API URL
      (getPreference as jest.Mock).mockResolvedValueOnce('https://example.com/api/all-beers');

      // Mock beers data
      const mockBeers = [
        { id: 'beer-1', brew_name: 'Test Beer 1', brewer: 'Brewery 1' },
        { id: 'beer-2', brew_name: 'Test Beer 2', brewer: 'Brewery 2' }
      ];

      // Mock fetch to return valid data
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce([
          { something: 'else' },
          { brewInStock: mockBeers }
        ]),
      });

      const result = await fetchAndUpdateAllBeers();

      expect(result).toBe(true);
      expect(populateBeersTable).toHaveBeenCalledWith(mockBeers);
    });
  });
});

## Test Coverage

Test coverage reports are generated when running `npm run test:ci`. The coverage report can be found in the `coverage/` directory.

### Data Update Service Coverage

The `dataUpdateService.ts` file has the following test coverage:

- Statement coverage: 66.66%
- Branch coverage: 71.42%
- Function coverage: 50%
- Line coverage: 66.29%

The tests specifically cover the `fetchAndUpdateAllBeers` and `fetchAndUpdateMyBeers` functions, which handle API data fetching and database updates. These tests ensure that:

1. The functions correctly extract beer data from the API response
2. Invalid data is properly validated and handled
3. Only valid beers with IDs are used to update the database
4. Error cases are handled gracefully

To run these tests specifically:

```bash
npx jest src/services/__tests__/dataUpdateService.test.ts --coverage
```

To see coverage for just the dataUpdateService.ts file:

```bash
npx jest src/services/__tests__/dataUpdateService.test.ts --coverage --collectCoverageFrom=src/services/dataUpdateService.ts
```

## Continuous Integration

Tests are automatically run in CI environments using the `test:ci` script. The test results are output in JUnit format for integration with CI systems.

## Troubleshooting

If you encounter issues with tests:

1. Make sure all dependencies are installed: `npm install`
2. Check that the test file follows the naming convention: `*.test.ts` or `*.test.tsx`
3. Verify that mocks are properly set up for external dependencies
4. Check the Jest configuration in `jest.config.js`
