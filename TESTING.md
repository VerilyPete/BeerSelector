# TESTING.md

Refer to this file when writing tests, debugging test failures, or setting up test infrastructure.

## Testing Strategy

- **Jest**: Unit tests only (functions, utilities, pure logic)
- **Maestro/Flashlight**: ALL integration and E2E tests
- **DO NOT** use Jest for integration tests - React Native environment causes timeouts
- **DO NOT** write unit tests for React Native hooks using `renderHook()` - they hang

## Test Organization

- `__tests__/` - Component snapshot tests
- `src/api/__tests__/` - API service tests
- `src/database/__tests__/` - Database operation tests
- `src/services/__tests__/` - Service function tests (unit tests only)
- `context/__tests__/` - Context and state management tests

## Safe Patterns (Use Jest)

**Pure Function Tests:**

```typescript
it('filters beers correctly', () => {
  const filtered = applyFilters(beers, { style: 'IPA' });
  expect(filtered).toHaveLength(5);
});
```

**Database Operations:**

```typescript
it('inserts beer into database', async () => {
  await beerRepository.insertBeer(mockBeer);
  const result = await beerRepository.getBeer(mockBeer.id);
  expect(result).toEqual(mockBeer);
});
```

**API Service Tests:**

```typescript
it('fetches beers from API', async () => {
  mockFetch.mockResolvedValue({ json: () => mockBeers });
  const result = await beerApi.getBeers();
  expect(result).toEqual(mockBeers);
});
```

**Simple Components (no RN hook dependencies):**

```typescript
it('renders beer name', () => {
  render(<BeerName name="IPA" />);
  expect(screen.getByText('IPA')).toBeTruthy();
});
```

## Unsafe Patterns (Will Hang - Use Maestro Instead)

| Pattern                                          | Problem                                  | Fix                               |
| ------------------------------------------------ | ---------------------------------------- | --------------------------------- |
| `renderHook()` with RN context                   | Alert, Appearance, NetInfo never resolve | Test through component or Maestro |
| Components with `useThemeColor`/`useColorScheme` | Even mocked, causes hangs                | Migrate to Maestro E2E            |
| Performance/Profiler tests                       | Profiler API doesn't work in jsdom       | Use Maestro/Flashlight            |
| Fake timers + renderHook + RN hook               | Timer + hook combination hangs           | Test timer logic separately       |
| Integration tests (multi-async)                  | Too many RN dependencies                 | Use Maestro                       |
| Native module tests (NetInfo)                    | Requires native runtime                  | Use Maestro E2E                   |
| WebView tests                                    | Navigation/cookies don't resolve         | Use Maestro E2E                   |

## Prevention Checklist

Before writing a test, ask:

1. **Uses `renderHook()`?** → Does hook use RN context? → Will hang
2. **Renders component?** → Uses `useThemeColor()`/`useColorScheme()`? → Will hang
3. **Performance test?** → Measures render times? → Will hang
4. **Fake timers?** → Combined with renderHook + RN hook? → Will hang
5. **Integration test?** → Multiple async ops in RN context? → Will hang

## Quick Reference

| Test Type                  | Jest | Maestro |
| -------------------------- | ---- | ------- |
| Pure functions             | ✅   | ❌      |
| API services               | ✅   | ❌      |
| Database operations        | ✅   | ❌      |
| RN hooks (direct)          | ❌   | ✅      |
| Component integration      | ❌   | ✅      |
| E2E flows                  | ❌   | ✅      |
| Performance tests          | ❌   | ✅      |
| Simple components          | ✅   | ❌      |
| Theme-dependent components | ❌   | ✅      |

## Mock Strategy

- Expo modules mocked in `__mocks__/` directory
- SQLite operations mocked in database tests
- API calls mocked with `jest.fn()`
- Real data from `allbeers.json` and `mybeers.json` for service-level tests

## Running Tests

```bash
npm test                 # Watch mode
npm run test:ci          # CI mode with coverage

# Specific test suites
npx jest src/services/__tests__/dataUpdateService.test.ts
npx jest src/utils/__tests__/beerGlassType.test.ts
```

## Pre-commit Hook

A Git hook at `.husky/pre-commit` prevents committing new hanging test patterns.

See `JEST_HANGING_TESTS_FINAL_REPORT.md` for detailed analysis of 27 hanging test patterns.
