# Test Quality Remediation Plan

## Status: COMPLETED

**Final state**: 64 suites, 1750 tests, 0 skipped, 0 failing.

Executed in 3 waves using parallel agent teams:
- **Wave 1** (Phases 1, 2, 4, 7, 8): Factory conversions + skipped tests + migration tests V3/V7
- **Wave 2** (Phases 3, 5, 6, 9): Console assertions + as-any + coverage + enrichment refactor
- **Wave 3** (cleanup): Remaining console assertions in session/liveActivity tests, let/beforeEach in lifecycle/validation/databaseLifecycle, migration tests V4/V5/V6, capturedSignal typing

### Results Summary

| Metric | Before | After |
|--------|--------|-------|
| Tests | 1669 | 1750 (+81) |
| Suites | 59 | 64 (+5) |
| Skipped | 2 | 0 |
| let/beforeEach antipattern files | 13+ | 0 (remaining beforeEach is .mockClear() infrastructure) |
| Console assertion count | ~150 | ~53 (all Tier C/D — acceptable) |
| mockDatabase: any | 7+ files | 0 |
| Migration test coverage | 0% | 100% (V3-V7) |
| dataUpdateService coverage | 64% | 80% |

### Remaining Console Assertions (53, all acceptable)

- `errorLogger.test.ts` (22) — Tier D: testing a logging utility
- `DatabaseLockManager.test.ts` (9) + `locks.test.ts` (6) — Tier D: lock state logging is the contract
- `initializationState.test.ts` (3) — Tier D: state machine transition logging
- `preferences.test.ts` (3) — Tier C: return value is ambiguous (null/[] for both empty and error)
- `lifecycle.test.ts` (2) — Tier D: WAL mode fallback logging
- `schema.test.ts` (2) — Tier D: database setup lifecycle
- `databaseLifecycle.test.tsx` (4) — Tier D: app state change logging
- `LoginWebView.test.tsx` (1) — Tier C: error recovery
- `RewardsRepository.test.ts` (1) — Tier C: clear operation logging

### Remaining `as any` (all justified)

- ~28 in config validation tests — intentional invalid input testing (`'invalid' as any`)
- ~4 in LoginWebView — config mutation for testing (design limitation)
- ~2 in queueService/sessionValidator — null/undefined input testing

---

## Original Plan

**Reference template**: `src/database/repositories/__tests__/OptimisticUpdateRepository.test.ts` (demonstrates the target pattern for Issues 1 and 3).

---

## Phase 1: Repository Tests -- let/beforeEach to Factory Functions + MockDatabase Type

**Issues addressed**: #1 (let/beforeEach antipattern), #3 (as any for mockDatabase)

**Files** (4 files, ~2,400 lines total):
- `src/database/repositories/__tests__/BeerRepository.test.ts` (734 lines)
- `src/database/repositories/__tests__/MyBeersRepository.test.ts` (814 lines)
- `src/database/repositories/__tests__/RewardsRepository.test.ts` (535 lines)
- `src/database/repositories/__tests__/updateEnrichmentData.test.ts`

**Estimated effort**: Medium (each file is a mechanical transformation)

### Current Pattern (from BeerRepository.test.ts)

```typescript
describe('BeerRepository', () => {
  let repository: BeerRepository;
  let mockDatabase: any;

  beforeEach(() => {
    repository = new BeerRepository();
    mockDatabase = {
      withTransactionAsync: jest.fn(async (callback: any) => await callback()),
      runAsync: jest.fn(),
      getAllAsync: jest.fn(),
      getFirstAsync: jest.fn(),
    };
    (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
    jest.clearAllMocks();
  });
```

### Target Pattern (from OptimisticUpdateRepository.test.ts)

```typescript
type MockDatabase = {
  execAsync: jest.Mock;
  runAsync: jest.Mock;
  getAllAsync: jest.Mock;
  getFirstAsync: jest.Mock;
};

function createMockDatabase(): MockDatabase {
  return {
    execAsync: jest.fn(),
    runAsync: jest.fn(),
    getAllAsync: jest.fn(),
    getFirstAsync: jest.fn(),
  };
}

// Each test creates its own mock inline:
it('should insert an optimistic update into the database', async () => {
  const mockDatabase = createMockDatabase();
  (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
  // ...test body
});
```

### Transformation Steps Per File

1. **Run tests** to confirm current green state
2. **Define `MockDatabase` type** at module level (typed to match what the production code calls)
   - For BeerRepository/MyBeersRepository/RewardsRepository, the mock needs: `withTransactionAsync`, `runAsync`, `getAllAsync`, `getFirstAsync`
   - The `withTransactionAsync` mock needs the callback invocation: `jest.fn(async (callback: () => Promise<void>) => await callback())`
3. **Create `createMockDatabase()` factory** returning `MockDatabase`
4. **Create `createRepository()` factory** returning a new instance
5. **Remove `let repository`** and **`let mockDatabase: any`** declarations
6. **Remove `beforeEach`** block entirely
7. **Update each test** to call factory functions at the start
8. **Run tests** to confirm green state after each file

### Important Details

- BeerRepository uses `withTransactionAsync` which requires a typed callback parameter. The `MockDatabase` type should use:
  ```typescript
  withTransactionAsync: jest.Mock;
  ```
  And the factory returns `jest.fn(async (callback: () => Promise<void>) => await callback())`.

- **Known bug in current code**: The existing `BeerRepository.test.ts` `beforeEach` calls `jest.clearAllMocks()` AFTER setting up mocks via `mockResolvedValue`, which clears those mocks. The tests currently pass because the mock setup order happens to work, but this is fragile. The factory pattern fixes this as a side effect -- each test sets up its own fresh mocks with no `clearAllMocks()` needed.

- Since each test creates fresh mocks via the factory, `jest.clearAllMocks()` is unnecessary and should NOT be called. Each test mocks `connection.getDatabase` fresh via `(connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase)`.

- **BeerRepository has 19 tests**, MyBeersRepository has 26 tests, RewardsRepository has 22 tests. Each test body needs the 2-line mock setup prepended.

### Console Log Assertions in This Phase

Several tests in these files assert on `consoleLogSpy`/`consoleErrorSpy` (Issue #2). During Phase 1, do NOT change these assertions -- keep the transformation mechanical. Console log assertions will be addressed separately in Phase 3.

---

## Phase 2: Database Utility Tests -- let/beforeEach to Factory Functions

**Issues addressed**: #1 (let/beforeEach antipattern)

**Files** (4 files, ~1,738 lines total):
- `src/database/__tests__/DatabaseLockManager.test.ts` (817 lines)
- `src/database/__tests__/locks.test.ts` (430 lines)
- `src/database/__tests__/initializationState.test.ts` (192 lines)
- `src/database/__tests__/preferences.test.ts` (299 lines)

**Estimated effort**: Medium-Low

### Transformation Notes

**DatabaseLockManager.test.ts**:
- `let lockManager: DatabaseLockManager` with `beforeEach(() => { lockManager = new DatabaseLockManager(); })`
- Replace with `function createLockManager(): DatabaseLockManager { return new DatabaseLockManager(); }`
- Each test calls `const lockManager = createLockManager();`
- **Special case**: The `Timeout handling with fake timers` and `Lock acquisition timeout` describe blocks have nested `beforeEach(() => { jest.useFakeTimers(); })` and `afterEach(() => { jest.useRealTimers(); })`. These timer setup/teardown blocks are NOT the antipattern -- they configure Jest behavior, not test data. Keep them as-is.
- **IMPORTANT**: In tests using fake timers, `createLockManager()` must be called AFTER `jest.useFakeTimers()` is set up, to ensure the lock manager is initialized in the fake-timer context. If the factory is called before fake timers are active, internal setTimeout/setInterval calls will use real timers.

**locks.test.ts**:
- Same pattern: `let lockManager` + `beforeEach`. Same fix.
- The `jest.clearAllMocks()` in beforeEach can be removed since each test creates its own instance.

**initializationState.test.ts**:
- `let initializer: DatabaseInitializer` + `beforeEach(() => { initializer = new DatabaseInitializer(); })`
- Simple: `function createInitializer(): DatabaseInitializer { return new DatabaseInitializer(); }`
- 18 tests, all straightforward.

**preferences.test.ts**:
- More complex: has module-level `const mockRunAsync`, `const mockGetFirstAsync`, `const mockGetAllAsync`, `const mockDatabase`, plus `let consoleErrorSpy`.
- The mock functions are created once and `.mockReset()` in `beforeEach`. This is the antipattern -- shared mutable state.
- Fix: Create a factory that returns fresh mocks each time:
  ```typescript
  function createMockPreferencesDb() {
    const mockRunAsync = jest.fn().mockResolvedValue({ rowsAffected: 1 });
    const mockGetFirstAsync = jest.fn();
    const mockGetAllAsync = jest.fn();
    const mockDatabase = {
      runAsync: mockRunAsync,
      getFirstAsync: mockGetFirstAsync,
      getAllAsync: mockGetAllAsync,
    };
    return { mockDatabase, mockRunAsync, mockGetFirstAsync, mockGetAllAsync };
  }
  ```
- The `consoleErrorSpy` setup/teardown (`beforeEach`/`afterEach`) should be moved into individual tests. Some tests in this file do not use `consoleErrorSpy`, so they should not carry the overhead.
- **Subtlety**: The `afterEach(() => { consoleErrorSpy.mockRestore(); })` is important -- `mockRestore()` must be called to avoid test pollution. Each test that spies on console.error should call `.mockRestore()` at the end.

---

## Phase 3: Console Log Assertions -- Replace Behavior Proxies with State/Return Value Assertions

**Issues addressed**: #2 (95 console log assertions)

**Estimated effort**: High (requires understanding what business behavior each console assertion was proxying)

**Approach**: This phase is the most nuanced. Not all console assertions are equally bad:

### Tier A: Pure behavior proxies (high priority, ~40 assertions)
These tests assert ONLY on console output and nothing else. The console assertion IS the test. Examples:

```typescript
// BeerRepository.test.ts line 198-217
it('should log progress during import', async () => {
  const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
  // ... setup ...
  await repository.insertMany(beers);
  expect(consoleLogSpy).toHaveBeenCalledWith('Starting import of 10 beers...');
  expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Beer import complete'));
  consoleLogSpy.mockRestore();
});
```

**Fix**: These should either:
1. Assert on the actual behavior (return value, database state, thrown errors), or
2. Be removed entirely if the "behavior" is just "this function logs something"

### Tier B: Console assertions alongside real assertions (medium priority, ~35 assertions)
These tests have both console assertions AND meaningful assertions. The console assertions are redundant.

**Fix**: Remove the console assertion. Keep the meaningful assertion.

### Tier C: Console assertions as error detection (keep, ~20 assertions)
Some tests legitimately verify error handling paths where `console.error` is the observable side effect:

```typescript
it('should return empty array on database error', async () => {
  const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  mockDatabase.getAllAsync.mockRejectedValueOnce(new Error('Database error'));
  const result = await repository.getAll();
  expect(result).toEqual([]);
  expect(consoleErrorSpy).toHaveBeenCalledWith('Error getting rewards:', expect.any(Error));
  consoleErrorSpy.mockRestore();
});
```

**Fix for Tier C**: Remove the console assertion ONLY when the return value unambiguously distinguishes the error path from a genuine empty result. If the function returns `[]` both when the database is empty AND when an error occurs, keep the console assertion -- it is the only way to distinguish the two paths.

### Tier D: Logging that IS the API contract (leave alone, ~10 assertions)
Some systems have logging as their primary observable behavior. Examples:
- `DatabaseLockManager` logging tests where lock acquisition/release logging is the contract
- `errorLogger.test.ts` (already marked as skip)

**Fix for Tier D**: Do not remove these. They are testing the correct behavior.

### Implementation Strategy for Phase 3

1. **Audit each console assertion** across all test files
2. **Classify each as Tier A/B/C**
3. **For Tier A**: Write a replacement assertion that tests the actual behavior, or delete the test if the only behavior is logging
4. **For Tier B**: Remove the console assertion, keep the meaningful assertion
5. **For Tier C**: Remove the console assertion only if the return value unambiguously proves the error path was taken
6. **For Tier D**: Leave as-is
7. **Per-assertion verification**: Before removing any console assertion, verify the test still has at least one meaningful assertion. If removing the console assertion would leave the test vacuous (no assertions or only trivial ones), either add a behavioral assertion or delete the entire test.
8. Run tests after each file

### Files with highest console assertion density:
| File | Count | Priority |
|------|-------|----------|
| `src/api/__tests__/queueService.test.ts` | 37 | High |
| `src/database/repositories/__tests__/MyBeersRepository.test.ts` | 37 | High (overlaps Phase 1) |
| `src/utils/__tests__/errorLogger.test.ts` | 35 | Skip (testing a logger) |
| `src/services/__tests__/liveActivityService.test.ts` | 29 | High |
| `src/database/__tests__/lifecycle.test.ts` | 28 | High |
| `src/database/__tests__/DatabaseLockManager.test.ts` | 27 | Medium (overlaps Phase 2) |
| `src/services/__tests__/dataUpdateService.test.ts` | 23 | Medium (overlaps Phase 6) |

**Note**: `errorLogger.test.ts` is a special case -- it tests a logging utility, so console assertions may be the correct approach there. Skip this file.

---

## Phase 4: API Client Test -- let/beforeEach to Factory Functions

**Issues addressed**: #1 (let/beforeEach antipattern)

**File**: `src/api/__tests__/apiClient.test.ts` (380 lines)

**Estimated effort**: Low-Medium

### Special Considerations

- Uses `jest.useFakeTimers()` at module level. This is test-infrastructure setup, not the antipattern.
- The `let apiClient: ApiClient` is created via `ApiClient.getInstance()` in `beforeEach`. Since `ApiClient` is a singleton, each test gets the same instance. A factory function should still reset the singleton state.
- `config.setCustomApiUrl(...)` in `beforeEach` mutates global state. Each test that depends on a specific config should set it locally.
- `global.fetch = jest.fn()` at line 12 and re-assignment at line 85 mutate global state. A factory could return a mock fetch, but since `global.fetch` is inherently global, the pattern is: mock at module level, reset per test.

### Transformation

```typescript
function createApiTestContext() {
  const apiClient = ApiClient.getInstance();
  config.setCustomApiUrl('https://test-api.example.com');
  (getCurrentSession as jest.Mock).mockResolvedValue({
    memberId: 'test-member-id',
    storeId: 'test-store-id',
    storeName: 'Test Store',
    sessionId: 'test-session-id',
  });
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue({ success: true, data: { test: 'data' } }),
    text: jest.fn().mockResolvedValue('{"success":true,"data":{"test":"data"}}'),
  });
  return { apiClient };
}
```

**NOTE**: Do NOT call `jest.clearAllMocks()` in the factory -- it would clear the mocks just set up. The factory pattern eliminates the need for clearing since each test gets fresh mocks.

### Environment Switching Tests

The `Environment Switching` describe block has its own nested `beforeEach`/`afterEach` for config cleanup. This state management should also be moved into a dedicated factory or into individual test bodies. Explicitly include this in scope.

---

## Phase 5: as any Type Assertions -- Define Proper Mock Types

**Issues addressed**: #3 (67 as any assertions in tests)

**Estimated effort**: Medium-High (requires understanding each usage context)

### Categories of `as any` Usage

**Category 1: `mockDatabase: any` (7 occurrences, 5 files) -- FIXED IN PHASES 1-2**
Already addressed by defining `MockDatabase` type in Phases 1-2.

**Category 2: Intentional type-narrowing for invalid input tests (~20 occurrences)**
Example: `config.setEnvironment('invalid' as any)` in validation.errors.test.ts.
These test that functions reject invalid inputs. Using `as any` is the standard way to pass invalid types to typed functions. **These are acceptable** -- they are testing error boundaries.

**Category 3: Test infrastructure casting (~10 occurrences)**
Example: `global.fetch = nodeFetch as any` in mockServer.test.ts.
These work around library type mismatches. **Lower priority** -- fix only if a better typing is available.

**Category 4: Singleton state resets (~10 occurrences)**
Example: `(databaseLockManager as any).lockHeld = false` in refreshCoordination.test.ts.
These reach into private fields to reset the module-level singleton's internal state. **Creating a local `new DatabaseLockManager()` per test will NOT work** because the production code under test imports the same module singleton. Fix by:
- Adding a `resetForTesting()` method to `DatabaseLockManager` that resets internal state (`lockHeld`, `queue`, `timeoutId`, `currentOperation`)
- Each test calls `databaseLockManager.resetForTesting()` instead of `(databaseLockManager as any).lockHeld = false`
- This eliminates the `as any` casts and makes the reset explicit and type-safe

### Action Items

1. Phases 1-2 eliminate ~7 `mockDatabase: any` occurrences
2. Leave Category 2 (`as any` for invalid input testing) as-is -- these are correct usage
3. Fix `refreshCoordination.test.ts` by adding `resetForTesting()` to `DatabaseLockManager` and calling it per test instead of `as any` casts on singleton internals
4. Low-priority: `mockServer.test.ts`, `beerApi.test.ts` type assertions

---

## Phase 6: dataUpdateService Coverage Gap

**Issues addressed**: #4 (64% coverage, lines 673-1317 untested)

**Estimated effort**: High

### Untested Functions

| Function | Lines | Description |
|----------|-------|-------------|
| `shouldRefreshData` | 692-715 | Time-interval check |
| `fetchAndUpdateRewards` | 742-775 | Rewards fetch + insert |
| `sequentialRefreshAllData` | 790-1000+ | Master-lock sequential refresh with proxy/fallback |
| `refreshAllDataFromAPI` | 1150-1317 | Lock-coordinated full refresh with enrichment |

### Testing Strategy

These functions orchestrate multiple dependencies (lock manager, repositories, API clients, enrichment service). They need integration-style unit tests with mocked dependencies.

1. **`shouldRefreshData`** -- Simple to test: mock `getPreference` to return timestamps, verify boolean result. 4-5 tests.

2. **`fetchAndUpdateRewards`** -- Mock visitor mode preference, mock `fetchRewardsFromAPI`, mock `rewardsRepository.insertMany`. Test happy path, visitor skip, and error path. 3-4 tests.

3. **`sequentialRefreshAllData`** -- Complex. Requires mocking:
   - `databaseLockManager.acquireLock/releaseLock`
   - `getPreference` (for API URLs, visitor mode)
   - `fetchBeersFromProxy` (proxy path)
   - `fetchBeersFromAPI` (fallback path)
   - `fetchMyBeersFromAPI`
   - `fetchRewardsFromAPI`
   - Repository unsafe insert methods
   - Enrichment service functions
   - `config.enrichment.isConfigured()`

   Test scenarios:
   - Happy path with proxy success
   - Proxy failure with fallback to direct
   - Visitor mode (skip my beers + rewards)
   - Error in one stage doesn't prevent others
   - Lock always released in finally

   ~8-10 tests.

4. **`refreshAllDataFromAPI`** -- Similar to `sequentialRefreshAllData` but with different orchestration. ~6-8 tests.

**Recommendation**: Add tests incrementally. Start with `shouldRefreshData` (simplest), then `fetchAndUpdateRewards`, then tackle the complex refresh functions.

---

## Phase 7: Skipped Tests Resolution

**Issues addressed**: #5 (2 skipped tests)

**Estimated effort**: Low

### `src/services/__tests__/dataRefresh.integration.test.ts:135`

**Skipped test**: "should refresh data in parallel for performance"

**Resolution options**:
1. **Delete the test** -- The parallel execution is implicitly tested by the other tests completing quickly.
2. **Fix the mock** -- The test uses `setTimeout` inside mock implementations, which may not play well with Jest's fake timers.

**Recommendation**: Option 1 (delete). Testing `Promise.all` execution ordering is an implementation detail.

### `src/config/__tests__/envVarLoading.test.ts:140`

**Skipped test**: "should use generic EXPO_PUBLIC_API_BASE_URL when env-specific not set"

**Resolution options**:
1. **Delete the test** with documented justification
2. **Fix by clearing env vars** before the isolated module load:
   ```typescript
   const savedVars = { ...process.env };
   delete process.env.EXPO_PUBLIC_DEVELOPMENT_API_BASE_URL;
   // ... run test ...
   Object.assign(process.env, savedVars);
   ```

**Recommendation**: Try Option 2 first. If it still fails due to Expo's env loading, go with Option 1.

---

## Phase 8: Migration Test Coverage

**Issues addressed**: #6 (zero migration test coverage)

**Estimated effort**: Medium

### Files to Test

- `src/database/migrations/migrateToV3.ts`
- `src/database/migrations/migrateToV4.ts`
- `src/database/migrations/migrateToV5.ts`
- `src/database/migrations/migrateToV6.ts`
- `src/database/migrations/migrateToV7.ts`

### Test Scenarios Per Migration

1. **Happy path**: Columns don't exist, migration adds them
2. **Idempotency**: Columns already exist, migration skips
3. **Lock always released**: Even on error
4. **Progress callback called** (for V7)

**Recommendation**: Start with V7 (most recent) and V3 (oldest). Add V4-V6 incrementally.

---

## Phase 9: enrichmentService.test.ts Refactoring

**Issues addressed**: #7 (10 beforeEach blocks across 1,456 lines)

**Estimated effort**: Medium-High

### Strategy

Since the enrichment service has internal module state (metrics, rate limit state), tests genuinely need to reset it. The cleanest approach:

1. Create a `setupEnrichmentTest()` factory that:
   - Resets metrics
   - Resets rate limit state
   - Returns a fresh mock fetch
2. Each test calls `const { mockFetch } = setupEnrichmentTest()` at the start
3. Nested `beforeEach` blocks in sub-describes should be folded into local factories

**Risk**: This file is large (1,456 lines) and the refactoring touches every test. Do it in sections, running tests between each section.

---

## Execution Order and Dependencies

```
Phase 1 (Repository Factory+MockDatabase)  ──┐
Phase 2 (Database Utility Factories)        ──┤
Phase 4 (API Client Factory)                ──┤── All independent, can be done in any order
Phase 7 (Skipped Tests)                     ──┤
Phase 8 (Migration Tests)                   ──┘

Phase 3 (Console Log Assertions)            ──── Depends on Phases 1-2 (files overlap)

Phase 5 (as any Cleanup)                    ──── Depends on Phases 1-2 (MockDatabase eliminates many)

Phase 6 (dataUpdateService Coverage)        ──── Independent but large; can start anytime

Phase 9 (enrichmentService Refactoring)     ──── Independent; lowest priority
```

### Recommended Execution Sequence

1. **Phase 1** -- Highest impact, mechanical, builds muscle memory for the pattern
2. **Phase 2** -- Same pattern, smaller files
3. **Phase 4** -- Same pattern, one file
4. **Phase 3** -- Console assertion cleanup (do after Phase 1-2 so files are already in factory pattern)
5. **Phase 5** -- as any cleanup (most are already fixed by Phases 1-2)
6. **Phase 7** -- Quick wins, 2 skipped tests
7. **Phase 8** -- New test files for migrations
8. **Phase 6** -- Most complex, new test coverage for orchestration functions
9. **Phase 9** -- Large refactoring, lowest priority

### TDD Safety Protocol

For EVERY change in EVERY phase:

1. **Run full test suite before starting**: `npx jest --ci`
2. **Make one file's changes at a time**
3. **Run that file's tests after each transformation**: `npx jest path/to/file.test.ts`
4. **Run full test suite after completing each file**
5. **Commit after each file** (or at minimum, each phase)

The transformations in Phases 1-4 are purely mechanical refactoring of test code. Production code is NOT modified. The test assertions remain identical -- only the setup pattern changes from shared mutable state to per-test factory invocation.

---

## Effort Summary (Actual)

| Phase | Issue | Files | Status |
|-------|-------|-------|--------|
| 1 | let/beforeEach + MockDatabase type in repos | 4 | DONE (Wave 1) |
| 2 | let/beforeEach in database utilities | 4 | DONE (Wave 1) |
| 3 | Console log assertions | ~15 | DONE (Wave 2 + 3) |
| 4 | let/beforeEach in API client | 1 | DONE (Wave 1) |
| 5 | as any cleanup + resetForTesting() | ~5 | DONE (Wave 2) |
| 6 | dataUpdateService coverage | 1 (33 new tests) | DONE (Wave 2) |
| 7 | Skipped tests | 2 | DONE (Wave 1) |
| 8 | Migration test coverage | 5 (69 new tests) | DONE (Wave 1 + 3) |
| 9 | enrichmentService refactoring | 1 | DONE (Wave 2) |
| — | Cleanup (lifecycle, validation, databaseLifecycle, session tests) | 5 | DONE (Wave 3) |

One production code change: `DatabaseLockManager.resetForTesting()` method added (Phase 5).
