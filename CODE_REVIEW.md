# Code Review - BeerSelector

## Executive Summary

The BeerSelector React Native/Expo application is a functional offline-first mobile app for UFO Club members and visitors to browse beer taplists and track tastings. The codebase demonstrates good intentions with database persistence, API integration, and dual-mode support. However, the project suffers from significant architectural issues including:

- **Critical technical debt** in the 1,417-line database module that violates single responsibility principle
- **Severe code duplication** across components (AllBeers, Beerfinder, TastedBrewList share 80%+ identical code)
- **Complex state management** with global module-level flags creating race conditions
- **Missing separation of concerns** between UI, business logic, and data access layers
- **Inadequate error handling** and recovery mechanisms
- **HTML parsing in production code** (Beerfinder queue management)
- **Poor testability** due to tight coupling and large file sizes

**Overall Code Health**: 5/10 - The app works but requires substantial refactoring to be maintainable and extensible.

**Recommended Priority**:
1. ✅ **COMPLETED**: Fix CI-4, CI-5, and CI-6 (sequential refresh + event-based waiting) - **RESOLVED** via TDD approach
2. ⚠️ **OPTIONAL**: Fix CI-7 (nested lock optimization in refreshAllDataFromAPI) - Medium priority, 2-3 hour effort
3. Address remaining High Priority issues (HP-3 component refactoring, HP-4 state management)
4. Tackle Medium Priority issues to improve code maintainability

**Latest Review Findings** (2025-11-09):
✅ **CI-4, CI-5, and CI-6 RESOLVED**: Sequential refresh is now fully integrated into production code using Test-Driven Development (TDD). All 27 tests passing (12 refresh coordination + 15 state machine). Lock contention eliminated (3x performance improvement: 4.5s → 1.5s). Both `manualRefreshAllData()` and `refreshAllDataFromAPI()` now use sequential execution with master lock coordination. **CI-2 (lock contention) is FULLY RESOLVED**. Event-based waiting replaces polling loop for 100-200ms performance gain.

⚠️ **CI-7 OPTIMIZATION OPPORTUNITY**: Code review found nested lock acquisition in `refreshAllDataFromAPI()` (uses `insertMany()` while holding master lock). Works correctly but has 300-600ms overhead. Adding `insertManyUnsafe()` methods to BeerRepository and RewardsRepository will eliminate this. Medium priority, safe to defer.

**Testing Approach**: All refactoring plans in this document follow a Test-Driven Development (TDD) approach. Each step includes:
1. **Write automated tests first** - Establish baseline and define expected behavior
2. **Implement the change** - Refactor with confidence
3. **Verify with tests** - Ensure no regressions
4. **Manual testing** - Validate user-facing functionality

This ensures the refactoring is safe, verifiable, and maintains (or improves) code quality throughout the process.

---

## High Priority Issues

### HP-1: Monolithic Database Module (1,417 lines) ✅ COMPLETED

**Status**: ✅ **COMPLETED** (2025-11-08)

**Description**: `/workspace/BeerSelector/src/database/db.ts` was a massive 918-line file that handled database schema, data fetching, API calls, business logic, caching, locks, and preferences. This violated the Single Responsibility Principle and made the code extremely difficult to test, debug, and maintain.

**Impact**:
- High risk of bugs when making changes
- Difficult to unit test individual functions
- Impossible to reuse logic across different contexts
- Performance issues due to module-level state variables
- Race conditions from shared lock mechanisms

**Resolution Summary**:
- ✅ Reduced db.ts from 918 lines to 432 lines (53% reduction)
- ✅ Eliminated ALL duplicate INSERT/UPDATE/DELETE logic (CI-1 resolved)
- ✅ Created 18 passing compatibility tests verifying delegation pattern
- ✅ All 147 database and service tests passing with no regressions
- ✅ Achieved 54.44% code coverage for database layer (up from ~6%)
- ✅ Single source of truth: All operations delegate to repositories

**Refactoring Plan** (Completed):

**Step 1a**: Write tests for current preference functions
- Create `src/database/__tests__/preferences.test.ts`
- Test `getPreference`, `setPreference`, `getAllPreferences` with current implementation
- Mock SQLite database operations
- Achieve 100% coverage of preference functions
- **Testing**: Run `npm test`, verify all preference tests pass

**Step 1b**: Extract preference management
- Create `src/database/preferences.ts` with `getPreference`, `setPreference`, `getAllPreferences`
- Move preference-related functions only (lines 197-255 of db.ts)
- Update imports in all files that use preferences
- Update test imports to point to new file
- **Testing**: Run `npm test` (unit tests pass), then verify settings screen loads preferences correctly in both light/dark modes

**Step 2a**: Write tests for API fetch functions
- Create `src/api/__tests__/beerApi.test.ts`
- Test all fetch functions with mocked API responses
- Test error scenarios (network timeout, malformed JSON)
- Use real JSON from `allbeers.json` and `mybeers.json` as test fixtures
- **Testing**: Run `npm test`, verify 100% coverage of API fetch functions

**Step 2b**: Extract API fetch logic
- Create `src/api/beerApi.ts` for beer data fetching (`fetchBeersFromAPI`, `fetchMyBeersFromAPI`, `fetchRewardsFromAPI`)
- Remove API calls from db.ts, keep only database operations
- Update tests to import from new location
- **Testing**: Run `npm test` (unit tests pass), then test manual refresh in AllBeers tab, verify beer count updates correctly

**Step 3a**: Write tests for database initialization
- Create `src/database/__tests__/schema.test.ts` and `__tests__/connection.test.ts`
- Test table creation with mocked SQLite
- Test connection lifecycle (open, close, error handling)
- **Testing**: Run `npm test`, verify initialization tests pass

**Step 3b**: Extract database schema and initialization
- Create `src/database/schema.ts` with table creation logic
- Create `src/database/connection.ts` for database instance management
- Update existing tests to use new structure
- **Testing**: Run `npm test`, then fresh install test - delete app, reinstall, verify first-launch flow works

**Step 4a**: Write tests for locking mechanism
- Create `src/database/__tests__/locks.test.ts`
- Test concurrent lock acquisition (should queue)
- Test lock timeout scenarios
- Test lock release on error
- **Testing**: Run `npm test`, verify lock tests pass with 100% coverage

**Step 4b**: Extract locking mechanism
- Create `src/database/locks.ts` with `acquireLock`, `releaseLock` utilities
- Replace module-level variables with class-based lock manager
- Update tests to use new lock manager
- **Testing**: Run `npm test`, then rapid refresh test - pull-to-refresh on AllBeers tab 5 times quickly, verify no crashes

**Step 5a**: Write repository tests
- Create `src/database/repositories/__tests__/BeerRepository.test.ts`
- Create `src/database/repositories/__tests__/MyBeersRepository.test.ts`
- Create `src/database/repositories/__tests__/RewardsRepository.test.ts`
- Test all CRUD operations with mocked database
- Test type validation and error handling
- **Testing**: Run `npm test`, verify 90%+ coverage for repositories

**Step 5b**: Split data access by entity
- Create `src/database/repositories/BeerRepository.ts`
- Create `src/database/repositories/MyBeersRepository.ts`
- Create `src/database/repositories/RewardsRepository.ts`
- Each repository handles CRUD for one entity type
- Update existing code to use repositories
- **Testing**: Run `npm test`, then test visitor mode vs member mode, verify My Beers shows empty state in visitor mode

**Step 6a**: Write integration tests for data refresh
- Create `src/services/__tests__/dataRefresh.integration.test.ts`
- Test full refresh flow with real JSON fixtures
- Test partial refresh scenarios
- Test refresh failure recovery
- **Testing**: Run `npm test:ci`, verify integration tests pass

**Step 6b**: Extract business logic to services
- Move refresh logic entirely to `dataUpdateService.ts`
- Remove `refreshAllDataFromAPI` from db.ts
- Update all imports and tests
- **Testing**: Run `npm test`, then full integration test - login, refresh all data, verify All Beers, Beerfinder, Tasted Brews all show correct counts

**Step 7a**: Write tests for db.ts compatibility layer
- Create `src/database/__tests__/db.compatibility.test.ts`
- Test that db.ts functions delegate to repositories correctly
- Test no duplicate INSERT logic remains
- Verify db.ts is thin wrapper (<300 lines)
- **Testing**: Run `npm test`, verify compatibility layer tests pass

**Step 7b**: Remove duplicate code from db.ts (Post-HP-1 Cleanup)
- **Critical Issue CI-1**: db.ts (918 lines) still contains duplicate INSERT logic that's already in repositories
- Replace `_refreshBeersFromAPIInternal` with calls to `beerRepository.insertMany()`
- Replace `_refreshMyBeersFromAPIInternal` with calls to `myBeersRepository.insertMany()`
- Replace `_refreshRewardsFromAPIInternal` with calls to `rewardsRepository.insertMany()`
- Reduce db.ts to ~300 lines (thin compatibility wrapper only)
- **Testing**: Run `npm test`, then full refresh test - verify all data refreshes work correctly with no duplication

**Testing Focus**:
- All database operations continue to work
- No data loss during refactoring
- Offline functionality preserved
- Both visitor and member modes work correctly
- Dark mode compatibility maintained
- **CI-1 Resolved**: Single source of truth for database operations (DRY principle)

---

### HP-2: Race Conditions from Module-Level State

**Description**: Multiple module-level boolean flags in `db.ts` create race conditions:
```typescript
let dbOperationInProgress = false;
let databaseInitialized = false;
let databaseSetupComplete = false;
let myBeersImportScheduled = false;
let myBeersImportInProgress = false;
let myBeersImportComplete = false;
let setupDatabaseInProgress = false;
```

These flags are checked and modified across async operations without proper synchronization.

**Impact**:
- Data corruption if concurrent operations modify the same tables
- Unpredictable behavior during app initialization
- Failed refreshes due to lock contention
- Hard-to-reproduce bugs in production

**Refactoring Plan**:

**Step 1a**: Write tests for DatabaseLockManager
- Create `src/database/__tests__/DatabaseLockManager.test.ts`
- Test lock acquisition queue (first-in-first-out)
- Test multiple simultaneous lock requests
- Test lock release propagates to next waiter
- **Testing**: Run `npm test`, verify lock manager tests pass

**Step 1b**: Create DatabaseLockManager class
- Create `src/database/DatabaseLockManager.ts`
- Implement proper async lock/unlock with queue mechanism
- Replace `acquireLock`/`releaseLock` functions
- Update all call sites to use new manager
- **Testing**: Run `npm test`, then concurrent operations test - start 3 refreshes simultaneously from different tabs, verify only one executes

**Step 2a**: Write tests for initialization state machine
- Create `src/database/__tests__/initializationState.test.ts`
- Test all state transitions (UNINITIALIZED → INITIALIZING → READY)
- Test error state transitions
- Test invalid state transitions are rejected
- **Testing**: Run `npm test`, verify state machine tests pass

**Step 2b**: Replace initialization flags with state machine
- Create `DatabaseInitializationState` enum (UNINITIALIZED, INITIALIZING, READY, ERROR)
- Use single `initState` variable instead of multiple booleans
- Add proper state transitions
- Update tests for new structure
- **Testing**: Run `npm test`, then app launch test - cold start app, verify beers load within 5 seconds

**Step 2c**: ✅ **COMPLETE** - Integrate DatabaseInitializer into production code
- ✅ Replaced module-level flags in db.ts with `databaseInitializer`
- ✅ Updated `setupDatabase()` to use state machine transitions (UNINITIALIZED → INITIALIZING → READY)
- ✅ **ENHANCED**: Replaced polling loop with event-based `waitUntilReady()` (CI-6 fix)
  - Event-driven promise resolution instead of 200ms polling
  - Timeout support (default 30s) with proper cleanup
  - Notifies all concurrent waiters when ready
  - ~100-200ms faster, better battery/CPU efficiency
- ✅ Updated `resetDatabaseState()` to use `databaseInitializer.reset()`
- ✅ Created comprehensive integration tests (15 tests, all passing)
- ✅ Tests verify state transitions, error handling, reset functionality, and event-based waiting
- **Testing**: Run `npm test -- db-state-machine-integration`, 15/15 tests pass
- **Testing**: Cold start app 5 times, verify beers load successfully each time
- **Testing**: Monitor logs for state machine transitions instead of flag messages

**Step 3a**: Write tests for idempotent myBeers import
- Add tests to `src/database/__tests__/myBeersImport.test.ts`
- Test calling `fetchAndPopulateMyBeers` multiple times doesn't duplicate data
- Test concurrent calls are handled safely
- **Testing**: Run `npm test`, verify idempotency tests pass

**Step 3b**: Remove myBeersImport flags
- Use lock manager instead of separate flags
- Make `fetchAndPopulateMyBeers` idempotent
- Remove flag-based logic
- **Testing**: Run `npm test`, then login/logout cycle test - login as member, logout, login as visitor, verify no cross-contamination

**Step 4a**: Write tests for operation timeouts
- Add timeout tests to `DatabaseLockManager.test.ts`
- Test lock auto-release after 15 seconds (mobile-optimized, not 60s)
- Test warning logs for slow operations
- **Testing**: Run `npm test`, verify timeout tests pass

**Step 4b**: Add operation timeout protection
- Implement 15-second max lock hold time with auto-release (**RI-1**: mobile-optimized)
- Add warning logs for slow operations
- Update lock manager implementation
- **Testing**: Run `npm test`, then network timeout test - enable airplane mode mid-refresh, verify app doesn't freeze

**Step 5a**: Write tests for sequential refresh coordination
- Create `src/services/__tests__/refreshCoordination.test.ts`
- Test sequential execution prevents lock contention
- Test master lock coordinates multiple operations
- Test parallel operations are properly serialized
- **Testing**: Run `npm test`, verify coordination tests pass

**Step 5b**: Fix parallel refresh lock contention (Post-HP-1 Cleanup)
- **Critical Issue CI-2**: `manualRefreshAllData()` runs 3 operations in parallel causing lock contention
- Document existing parallel execution pattern and lock contention behavior
- Identify all locations using `Promise.allSettled()` or `Promise.all()` for refresh operations
- **Testing**: Run `npm test`, then rapid refresh test - measure baseline timing (currently ~4.5s)

**Step 5c**: ✅ Implement sequential refresh with master lock
- ✅ **Critical Issue CI-2 RESOLUTION**: Replace parallel execution with sequential pattern
- ✅ Add `sequentialRefreshAllData()` function to dataUpdateService
- ✅ Acquire single master lock before all operations
- ✅ Use error handling to wrap each fetch operation gracefully
- ✅ **Testing**: Run `npm test`, verify all 7 refresh coordination tests pass (GREEN phase achieved)

- ✅ **Step 5d**: Add lock acquisition timeout
- ✅ Add optional `timeoutMs` parameter to `acquireLock()` method
- ✅ Reject promise if lock not acquired within timeout (separate from hold timeout)
- ✅ Default to 30 seconds for acquisition timeout (separate from 15s hold timeout)
- ✅ Update DatabaseLockManager tests to cover acquisition timeout scenarios (7 tests, all passing)
- ✅ Error handling for timeout rejection uses standard promise rejection propagation pattern
- ✅ **Testing**: Run `npm test -- DatabaseLockManager`, verify acquisition timeout tests pass (26/26 passing)
- ✅ **Implementation complete**: LockRequest interface updated, _timeoutAcquisition() method added, acquisition timeout cleared on lock grant

**Step 6a**: ✅ Write tests for improved lock coverage
- ✅ Extended `src/database/__tests__/locks.test.ts` with 11 additional tests for edge cases
  - Added module exports tests (3 tests) to verify re-exports from locks.ts
  - Added getQueueLength edge case tests (2 tests)
  - Added getCurrentOperation edge case tests (3 tests)
  - Added concurrent access pattern tests (2 tests)
  - Added singleton instance tests (2 tests)
- ✅ Timeout edge cases tested in DatabaseLockManager.test.ts (7 tests from Step 5d)
- ✅ Concurrent lock acquisition tested (10 concurrent requests, FIFO ordering)
- ✅ Error recovery paths tested (error scenarios, lock release)
- ✅ Coverage achieved: 98.14% statement coverage (exceeds 90% target)
- **Testing**: Run `npm test -- src/database/__tests__/DatabaseLockManager.test.ts --coverage --watchAll=false`, verify 98.14% coverage

**Step 6b**: ✅ Improve lock and db.ts test coverage
- ✅ locks.ts uncovered paths addressed (0% coverage is expected - re-exports only, non-executable code)
- ✅ db.ts delegation paths tested through existing repository and integration tests
- ✅ Error handling tested in DatabaseLockManager (timeout errors), repositories (database errors), and initializationState
- ✅ **Overall database layer coverage: 82.29%** (exceeds 80% target)
  - DatabaseLockManager.ts: 98.14%
  - Repositories: 96.1% average
  - initializationState.ts: 96.66%
  - schema.ts: 85.71%
  - preferences.ts: 72.72%
  - connection.ts: 72.72%
  - db.ts: 54.6% (will be addressed in Step 6c)
- **Testing**: Run `npm test -- --coverage --collectCoverageFrom='src/database/**/*.ts' --testPathPattern='database' --watchAll=false`
- **Note**: Pre-existing test failures in schema.test.ts and db-comprehensive.test.ts are unrelated to coverage goals

**Step 6c**: ⏭️ Improve db.ts test coverage to 75%+ (OPTIONAL/SKIPPED)
- **Current State**: db.ts coverage is 54.6%
- **Overall Database Layer**: 82.29% (exceeds 80% target from Step 6b) ✅
- **Rationale for skipping**:
  - Primary goal (80%+ database layer coverage) already achieved
  - Uncovered code in db.ts consists mainly of:
    - Lines 50-67: `setupDatabase()` polling logic (concurrent initialization edge case - complex to test)
    - Lines 377-394: `fetchAndPopulateRewards()` error paths (API URLs not configured - edge case)
    - Lines 406-411: `clearUntappdCookies()` (rarely-used utility function)
    - Lines 195-249: Error recovery paths in various functions (edge cases)
  - These provide diminishing returns for testing effort
  - Resources better spent on higher-priority HP-2 tasks
- **Decision**: Mark as optional since overall database layer coverage target is met
- **Testing**: Run `npm test -- --coverage --collectCoverageFrom='src/database/db.ts' --testPathPattern='database' --watchAll=false` to verify current 54.6% coverage

**Step 7**: ✅ Remove app layout module-level flag
- ✅ **Removed** `app/_layout.tsx` line 16: `let dbInitStarted = false;` module-level flag
- ✅ **Solution**: Integrated with database state machine from Step 2c (`databaseInitializer`)
  - The state machine already prevents concurrent initialization via `isInitializing()` and `isReady()` checks
  - `setupDatabase()` handles all edge cases: already ready, already initializing, errors
  - Module-level flag was redundant and has been removed
- ✅ **Audit**: No other module-level flags found in codebase (`grep -r "^let .*= false" app/ src/`)
- ✅ **Code Changes**:
  - Removed module-level flag declaration
  - Removed `if (!dbInitStarted)` check and associated else block
  - Database initialization now relies solely on state machine logic
- **Testing**: Run `npm test`, verify app layout tests pass
- **Testing**: Hot reload app multiple times, verify no duplicate initialization
- **Testing**: Background/foreground app, verify state persists correctly

**Step 8**: ✅ Add lock metrics and monitoring
- ✅ **Implemented** `getLockMetrics()` method in DatabaseLockManager.ts
- ✅ Returns object: `{ currentOperation: string | null, queueLength: number, queueWaitTimes: number[] }`
- ✅ **Implemented** `setDebugLogging(enabled: boolean)` method for optional debug logging
- ✅ Debug logging shows detailed lock acquisition with wait times
- ✅ Warning log when queue length >= 5 operations (QUEUE_WARNING_THRESHOLD)
- ✅ Wait time tracking: Records last 10 queue wait times (MAX_WAIT_TIME_HISTORY)
- ✅ **Testing**: All tests pass (32/32) in locks.test.ts
  - getLockMetrics() tests verify metrics accuracy
  - setDebugLogging() tests verify debug mode functionality
  - Queue warning tests verify threshold warnings
  - Wait time tracking tests verify history management

**Testing Focus**:
- No deadlocks during rapid operations
- Proper error recovery from failed operations
- Clean state after logout
- First launch reliability
- **CI-2 ✅ FULLY RESOLVED**: Sequential refresh now integrated into production via CI-4 and CI-5 fixes
- **RI-1 ✅ Resolved** (Step 4b): Mobile-appropriate timeout values (15s instead of 60s)
- **Test Coverage**: 82.29% overall database layer coverage achieved ✅

**CRITICAL ISSUES - RESOLUTION STATUS**:
- **CI-4 (CRITICAL)**: ✅ **RESOLVED** - Sequential refresh now integrated into production code
  - `manualRefreshAllData()` now delegates to `sequentialRefreshAllData()`
  - All 5 production call sites now use sequential execution automatically
  - Lock contention eliminated (4.5s → 1.5s per refresh, 3x performance improvement)
  - 12/12 tests passing including new CI-4 integration tests
  - TDD approach: Tests written first (RED), then implementation (GREEN)
  - Impact: 3x performance improvement, better mobile UX, **CI-2 FULLY RESOLVED**
- **CI-5 (HIGH)**: ✅ **RESOLVED** - `refreshAllDataFromAPI()` now uses sequential pattern with master lock
  - Replaced `Promise.all()` with sequential execution (lines 676-699)
  - Master lock acquired once for entire login refresh flow
  - Lock contention eliminated in authService.ts login flow
  - 12/12 tests passing including new CI-5 integration tests
  - Used in 2 production locations: auto-login and regular login
- ✅ **CI-6 (MEDIUM)**: Polling loop in `setupDatabase()` replaced with event-based waiting
  - **RESOLVED**: Implemented `waitUntilReady()` promise-based method in DatabaseInitializer
  - Replaces polling loop (200ms intervals) with event-driven notification pattern
  - Performance improvement: ~100-200ms faster concurrent initialization
  - Battery/CPU efficiency: No repeated polling checks
  - 15/15 integration tests passing (added 6 new tests for event-based waiting)
  - Uses real timers in tests to verify async behavior

See HP2_COMPREHENSIVE_REVIEW.md for detailed analysis.

**Current Status** (as of 2025-11-08):
✅ **HP-2 FULLY COMPLETE** - All steps completed with 82.29% database layer coverage and CI-2/CI-4/CI-5/CI-6 resolved

**Summary of Completed Work**:
- ✅ Steps 1a-1b: DatabaseLockManager implemented (98.14% coverage)
- ✅ Steps 2a-2b: State machine implemented (96.66% coverage)
- ✅ **Step 2c COMPLETE**: State machine integrated into production (9/9 tests passing)
- ✅ Steps 3a-3b: myBeersImport flags removed
- ✅ Steps 4a-4b: 15s timeout implemented
- ✅ **Step 5a COMPLETE**: refreshCoordination.test.ts created with 7 comprehensive tests (7/7 passing)
- ✅ **Step 5b COMPLETE**: Parallel refresh documented (PARALLEL_REFRESH_ANALYSIS.md) with baseline measurements
- ⚠️ **Step 5c PARTIAL**: Sequential refresh implemented BUT NOT INTEGRATED IN PRODUCTION (7/7 tests passing)
  - ❌ **CRITICAL ISSUE CI-4**: `sequentialRefreshAllData()` exists but is NEVER CALLED
  - ❌ `manualRefreshAllData()` still uses `Promise.allSettled()` (line 563)
  - ❌ `refreshAllDataFromAPI()` still uses `Promise.all()` (line 714)
  - ❌ **CI-2 NOT RESOLVED**: Lock contention still occurs in production
  - All 5 production call sites use old parallel pattern
- ✅ **Step 5d COMPLETE**: Lock acquisition timeout added (30s, separate from 15s hold timeout)
- ✅ Step 6a: Lock coverage tests complete (98.14% achieved)
- ✅ **Step 6b COMPLETE**: 82.29% overall database layer coverage (exceeds 80% target)
  - DatabaseLockManager.ts: 98.14%
  - Repositories: 96.1% average
  - initializationState.ts: 96.66%
  - schema.ts: 85.71%
  - preferences.ts: 72.72%
  - connection.ts: 72.72%
  - db.ts: 54.6% (compatibility layer - acceptable)
- ⏭️ **Step 6c SKIPPED**: db.ts coverage improvement (overall target met, diminishing returns)
- ✅ **Step 7 COMPLETE**: App layout module-level flag removed (integrated with database state machine)
- ✅ **Step 8 COMPLETE**: Lock metrics and monitoring added (getLockMetrics(), setDebugLogging(), queue warnings - 32/32 tests passing)

**Overall HP-2 Score**: 7/10 - **CRITICAL INTEGRATION ISSUE PREVENTS CI-2 RESOLUTION**
- ✅ Lock manager excellent (98.14% coverage, 26/26 tests passing)
- ✅ State machine integrated and working (9/9 integration tests pass)
- ✅ Step 5a-5b complete with documented lock contention
- ⚠️ Step 5c implementation excellent BUT NOT INTEGRATED (see CI-4)
- ✅ Step 5d acquisition timeout complete (7 tests)
- ✅ Step 6a-6b test coverage exceeds targets (82.29%)
- ✅ All module-level flags removed
- ❌ **CI-2 (parallel refresh contention) NOT RESOLVED** - sequential function exists but unused
- ⚠️ **NEW ISSUE CI-4**: Sequential refresh not integrated (CRITICAL, easy fix)

---

### CI-7: Nested Lock Acquisition Optimization (COMPLETED)

**Status**: ✅ **COMPLETED** (2025-11-09)

**What Was Done**:
Eliminated nested lock acquisition in `refreshAllDataFromAPI()` and `sequentialRefreshAllData()` by implementing `insertManyUnsafe()` methods across all repository classes and updating data refresh functions to use the master lock pattern.

**Implementation Summary**:
1. ✅ Added `insertManyUnsafe()` to `BeerRepository` (lines 46-55)
2. ✅ Added `insertManyUnsafe()` to `RewardsRepository` (lines 48-63)
3. ✅ Updated `refreshAllDataFromAPI()` (lines 676-714) to use unsafe methods under master lock
4. ✅ Updated `sequentialRefreshAllData()` (lines 450-547) to use unsafe methods under master lock
5. ✅ Added test coverage in `refreshCoordination.test.ts` (Tests 6 and 12 verify lock pattern)

**Performance Impact**:
- Eliminates 300-600ms overhead from nested lock queue operations
- Reduces lock manager contention during login/auto-login
- All refresh operations now use single master lock with lock-free repository methods

**Architecture Pattern**:
All repositories now follow the safe/unsafe method pattern:
- `insertMany()` - Public API, acquires its own lock (safe for standalone use)
- `insertManyUnsafe()` - Internal API, requires caller to hold lock (optimized for batch operations)
- `_insertManyInternal()` - Private shared implementation

**Code Review**: Production-ready with recommendations for future enhancements (structured error handling, empty array validation, performance logging). See react-native-code-reviewer assessment above for details.

---

### HP-3: Massive Code Duplication in Beer List Components

**Status**: ⚠️ **PARTIALLY COMPLETE** - Code reduced by 25% but critical quality gaps remain (2025-11-09)

**Original Description**: The components `AllBeers.tsx` (643 lines), `Beerfinder.tsx` (1,276 lines), and `TastedBrewList.tsx` (521 lines) shared approximately 80% identical code:
- Same filter UI (Draft/Heavies/IPA buttons)
- Same search bar implementation
- Same beer item rendering logic
- Same sort functionality
- Same refresh handling

**Impact**:
- Bug fixes must be applied to 3 places
- Inconsistent UX when changes are made to only one component
- Wasted development time maintaining duplicate code
- Increased bundle size

---

## HP-3 Code Review Findings (2025-11-09)

### Overall Assessment: 6.5/10

HP-3 achieved its **primary goal** of extracting shared components and reducing code duplication **by 25%** (2,442 → 1,834 lines = **608 lines eliminated**). The `useBeerFilters` hook is **excellent** with 22/22 tests passing. However, the work is **incomplete and not production-ready**.

**Line Count Reduction**:
- **Before HP-3**: AllBeers (642 lines) + Beerfinder (1,280 lines) + TastedBrewList (520 lines) = **2,442 lines**
- **After HP-3**: AllBeers (245 lines) + Beerfinder (724 lines) + TastedBrewList (262 lines) + Shared (603 lines) = **1,834 lines**
- **Net Reduction**: 608 lines eliminated (25% reduction)

**Strengths**:
- ✅ Clean hook-based filtering logic (22/22 tests passing, `useBeerFilters` hook)
- ✅ Well-structured shared components (BeerItem, FilterBar, BeerList)
- ✅ Successful integration into parent components
- ✅ Preserved all functionality (filters, search, sort, refresh)

**Critical Gaps**:
- ❌ **ZERO test coverage** for shared components (1,184 lines of tests removed in commit 2c2f331)
- ❌ **Missing accessibility support** (legal/compliance risk)
- ❌ **Missing performance optimizations** (no React.memo, poor mobile UX)
- ❌ **Missed 208 lines of refresh logic duplication** (HP-3's primary goal)

---

### Completed Work (Steps 1-6)

#### ✅ Step 1a-1b: BeerItem Component Extracted
**File**: `components/beer/BeerItem.tsx` (159 lines)

**Quality**: 7/10
- ✅ Clean separation of concerns (presentation only)
- ✅ Proper TypeScript typing with Beer interface
- ✅ Supports both `added_date` (timestamp) and `tasted_date` (MM/DD/YYYY) formats
- ✅ Optional `renderActions` prop for custom buttons (Beerfinder check-in)
- ✅ HTML stripping for descriptions (line 116)
- ✅ Dark mode support via `useThemeColor` hook
- ❌ **CRITICAL**: No React.memo for performance (unnecessary re-renders)
- ❌ **CRITICAL**: Missing accessibility labels (lines 85-122)
- ❌ **CRITICAL**: No test coverage (tests removed in commit 2c2f331)
- ❌ Date formatting functions not memoized (lines 27-66, recalculate on every render)

#### ✅ Step 2a-2b: FilterBar Component Extracted
**File**: `components/beer/FilterBar.tsx` (167 lines)

**Quality**: 7/10
- ✅ Clean props interface with proper TypeScript typing
- ✅ Optional `showHeaviesAndIpa` prop for TastedBrewList (line 21)
- ✅ Dark mode button color logic (lines 38-40)
- ✅ Proper visual feedback for active filters
- ❌ **CRITICAL**: No React.memo (re-renders on every parent state change)
- ❌ **CRITICAL**: Missing accessibility labels on all buttons (lines 44-128)
- ❌ **CRITICAL**: No test coverage (tests removed in commit 2c2f331)
- ❌ **PERFORMANCE**: Active state calculation on every render (line 38)
- ❌ **UX ISSUE**: Sort button label is confusing - shows opposite of current state (line 120)

#### ✅ Step 4a-4b: BeerList Component Extracted
**File**: `components/beer/BeerList.tsx` (96 lines)

**Quality**: 6.5/10
- ✅ Clean FlatList wrapper with proper TypeScript generics
- ✅ Proper empty state handling (lines 44-50)
- ✅ RefreshControl integration (lines 66-73)
- ✅ FlatList optimization props present (lines 74-77)
- ✅ Optional `renderItemActions` callback pattern (line 62)
- ❌ **CRITICAL**: No React.memo for BeerItem (line 57-63)
- ❌ **CRITICAL**: Missing accessibility labels
- ❌ **CRITICAL**: No test coverage (tests removed in commit 2c2f331)
- ❌ **PERFORMANCE**: `renderItem` inline function recreated on every render (line 56-64)
- ⚠️ **PERFORMANCE**: FlatList config not tuned for mobile (initialNumToRender={20} too high)

#### ✅ Step 5a-5b: useBeerFilters Hook Extracted ⭐ **BEST COMPONENT OF HP-3**
**File**: `hooks/useBeerFilters.ts` (181 lines)

**Quality**: 9/10
- ✅ **EXCELLENT**: Comprehensive test coverage (22/22 tests passing, 46% coverage)
- ✅ Exported pure functions (`applyFilters`, `applySorting`) for testing
- ✅ Proper `useMemo` for filtered/sorted results (line 133-136)
- ✅ Supports different date fields (`added_date` vs `tasted_date`) (line 122)
- ✅ Mutual exclusivity for Heavies/IPA filters (lines 151-155)
- ✅ Resets expanded state when filters change (lines 139-141)
- ✅ Handles edge cases (empty names, null dates)
- ❌ **MINOR**: No JSDoc comments (difficult to understand from imports)
- ❌ **MINOR**: 46% coverage - missing tasted_date parsing and hook state tests

#### ❌ Step 6a: Integration Tests (REMOVED)
**Status**: ❌ **ALL TESTS REMOVED** in commit 2c2f331 due to React Native testing environment issues

**Original Test Files** (created in commit baabff5, deleted in commit 2c2f331):
1. `components/beer/__tests__/BeerItem.test.tsx` (335 lines, 13 test cases)
2. `components/beer/__tests__/FilterBar.test.tsx` (213 lines, 18 test cases)
3. `components/beer/__tests__/BeerList.test.tsx` (237 lines, 13 test cases)
4. `components/__tests__/BeerListIntegration.test.tsx` (399 lines, 11 test cases)

**Total Test Code Lost**: 1,184 lines (55+ test cases)

**Critical Analysis**:
- ❌ This is **NOT acceptable** - React Native component testing is possible with proper setup
- ❌ Removing tests instead of fixing the environment violates TDD principles
- ❌ Should have used `@testing-library/react-native` with proper mock setup
- ⚠️ The issue is likely improper mocking of `useThemeColor` and `useColorScheme` hooks

#### ✅ Step 6b: Parent Components Refactored

**AllBeers.tsx** (245 lines, down from 642 = **62% reduction**):
- ✅ Successfully integrated useBeerFilters hook (lines 35-45)
- ✅ Successfully integrated FilterBar component (lines 182-187)
- ✅ Successfully integrated BeerList component (lines 190-198)
- ✅ Preserved refresh functionality and error handling
- ❌ **CODE DUPLICATION**: Lines 71-141 (refresh handler) duplicated in all 3 components

**Beerfinder.tsx** (724 lines, down from 1,280 = **43% reduction**):
- ✅ Successfully integrated useBeerFilters hook (lines 51-61)
- ✅ Successfully integrated FilterBar component (lines 549-554)
- ✅ Successfully integrated BeerList component (lines 557-566)
- ✅ Custom action buttons via `renderBeerActions` (lines 376-413)
- ❌ **CODE DUPLICATION**: Lines 96-161 (refresh handler) duplicated across components
- ❌ **ARCHITECTURE**: 200+ lines of HTML parsing (lines 319-361) should be extracted

**TastedBrewList.tsx** (262 lines, down from 520 = **50% reduction**):
- ✅ Successfully integrated useBeerFilters hook (lines 35-45)
- ✅ Successfully integrated FilterBar component (lines 203-209)
- ✅ Successfully integrated BeerList component (lines 212-221)
- ✅ Properly hides Heavies/IPA filters (line 208)
- ✅ Uses `tasted_date` for sorting (line 45)
- ❌ **CODE DUPLICATION**: Lines 88-158 (refresh handler) duplicated across components

---

### Critical Issues Found

#### CI-HP3-1: Zero Test Coverage for Shared Components (CRITICAL)
**Severity**: Critical - 603 lines of shared code with zero regression protection

**Problem**: All component tests were removed in commit 2c2f331 instead of fixing the testing environment.

**Impact**:
- No regression protection for shared components
- Breaking changes undetected until manual testing
- Violates TDD principle from CODE_REVIEW.md
- Production deployment risk

**Files Affected**:
- `components/beer/BeerItem.tsx` (159 lines) - 0% test coverage
- `components/beer/FilterBar.tsx` (167 lines) - 0% test coverage
- `components/beer/BeerList.tsx` (96 lines) - 0% test coverage

**Fix Required**: Resurrect tests with proper React Native Testing Library setup (10 hours)

#### CI-HP3-2: Missing Performance Optimizations (CRITICAL MOBILE UX)
**Severity**: Critical - Poor mobile user experience with 200+ beer lists

**Problem**: No React.memo on any shared component, causing 600+ unnecessary re-renders

**Evidence**:
```typescript
// components/beer/BeerItem.tsx - NO React.memo
export const BeerItem: React.FC<BeerItemProps> = ({...}) => {
  // This component re-renders for EVERY beer when ANY state changes
}
```

**Impact**:
- **200 beers × 3 components = 600+ unnecessary re-renders** on filter toggle
- Laggy scrolling (missed frames during filter changes)
- Battery drain from excessive React reconciliation
- Poor mobile UX (jank during interactions)

**Calculation**:
- User toggles "Draft" filter
- **WITHOUT React.memo**: All 200 BeerItem components re-render = **202 renders**
- **WITH React.memo**: Only FilterBar re-renders = **1 render + 200 prop comparisons**

**Fix Required**: Add React.memo to all components (1 hour)

#### CI-HP3-3: Missing Accessibility Support (LEGAL/COMPLIANCE RISK)
**Severity**: Critical - App Store rejection risk, ADA compliance failure

**Problem**: ZERO accessibility labels in any shared component

**Evidence**:
```bash
$ grep -r "accessibilityLabel|accessibilityRole" components/beer/
# No results
```

**Impact**:
- **WCAG 2.1 Level A failure** (minimum standard)
- **App Store rejection risk** (iOS requires basic accessibility)
- **Legal risk** (ADA compliance)
- **User exclusion** (visually impaired users cannot use app)

**Fix Required**: Add accessibility labels to all interactive elements (4 hours)

#### CI-HP3-4: Refresh Logic Duplication NOT Addressed (HP-3 GOAL MISSED)
**Severity**: High - Primary goal of HP-3 was code deduplication, but 208 lines remain duplicated

**Problem**: All three components have **identical refresh logic** (208 lines total duplicated):

**Location**:
- `components/AllBeers.tsx` lines 71-141 (71 lines)
- `components/Beerfinder.tsx` lines 96-161 (66 lines)
- `components/TastedBrewList.tsx` lines 88-158 (71 lines)

**Duplicate Code Pattern**:
1. Check if API URLs configured (lines 76-85 in AllBeers)
2. Call `manualRefreshAllData()` (line 89)
3. Handle network errors vs partial errors (lines 92-119)
4. Reload local data (lines 122-133)
5. Error handling (lines 134-140)

**HP-3 Failure**: This was the PRIMARY goal of HP-3 but was completely missed

**Fix Required**: Extract to `hooks/useDataRefresh.ts` (3 hours)

#### CI-HP3-5: FlatList Configuration Not Tuned for Mobile
**Severity**: Medium - Performance issues on low-end devices

**Problem**: FlatList optimization props not optimal for mobile

**Current Config** (components/beer/BeerList.tsx lines 74-77):
```typescript
initialNumToRender={20}    // TOO HIGH for complex items (causes initial jank)
maxToRenderPerBatch={20}   // TOO AGGRESSIVE (frame drops during scroll)
windowSize={21}            // DEFAULT (no optimization gained)
removeClippedSubviews={true}  // Can cause Android bugs
```

**Issues**:
1. `initialNumToRender={20}` too high for complex BeerItem components (200-300dp tall)
2. `maxToRenderPerBatch={20}` causes frame drops when scrolling fast
3. `windowSize={21}` is default (no memory optimization)
4. `removeClippedSubviews={true}` has known React Native bugs on Android

**Fix Required**: Tune FlatList props for mobile (2 hours)

---

### Missing Work (Not Completed)

#### MW-HP3-1: Component Tests (Step 1a, 2a, 4a, 6a)
**Status**: ❌ Removed instead of fixed
**Estimated Effort**: 10 hours

**Required Test Files**:
1. `components/beer/__tests__/BeerItem.test.tsx` (13 test scenarios)
2. `components/beer/__tests__/FilterBar.test.tsx` (18 test scenarios)
3. `components/beer/__tests__/BeerList.test.tsx` (13 test scenarios)
4. `components/__tests__/BeerListIntegration.test.tsx` (11 test scenarios)

#### MW-HP3-2: Performance Optimizations
**Status**: ❌ Not implemented
**Estimated Effort**: 2 hours

**Required Changes**:
1. Add React.memo to BeerItem, FilterBar, BeerList
2. Add useCallback to BeerList renderItem
3. Add useMemo to BeerItem date formatting
4. Optimize FlatList configuration

#### MW-HP3-3: Accessibility Support
**Status**: ❌ Not implemented
**Estimated Effort**: 4 hours

**Required Changes**:
1. Add accessibilityLabel to all buttons and interactive elements
2. Add accessibilityRole to buttons, lists
3. Add accessibilityState for expanded/selected states
4. Add accessibilityHint for complex interactions
5. Validate touch target sizes (44x44 minimum)

#### MW-HP3-4: Refresh Logic Extraction
**Status**: ❌ Not started (should have been part of HP-3)
**Estimated Effort**: 3 hours

**Required**: Create `hooks/useDataRefresh.ts` to eliminate 208 lines of duplication

#### MW-HP3-5: Error Handling Improvements
**Status**: ⚠️ Partially implemented
**Estimated Effort**: 2 hours

**Required Changes**:
1. Add error boundaries around BeerItem
2. Better error messages in date formatting
3. Fix HTML regex to use proper parser
4. Add logging with beer ID context

#### MW-HP3-6: JSDoc Documentation
**Status**: ❌ Not implemented
**Estimated Effort**: 2 hours

**Required**: Add JSDoc comments to all exported components and hooks

---

### Prioritized Fix Plan for HP-3

#### Priority 1: CRITICAL - Make Production-Ready (15 hours)

**1. Restore Test Coverage (10 hours)** ⚠️ HIGHEST PRIORITY
   - Fix React Native testing environment setup with proper mocking (2 hours)
   - Resurrect BeerItem tests with @testing-library/react-native (4 hours)
   - Resurrect FilterBar tests (3 hours)
   - Resurrect BeerList tests (3 hours)
   - Resurrect integration tests (moved to Priority 2)
   - **Why First**: Tests protect all other fixes from regression
   - **Dependencies**: None
   - **Impact**: Enables confident refactoring
   - **Files**: Install `@testing-library/react-native`, recreate test files

**2. Add Accessibility Support (4 hours)** ⚠️ LEGAL/COMPLIANCE RISK
   - Add accessibilityLabel to all buttons (BeerItem, FilterBar) (1 hour)
   - Add accessibilityRole to interactive elements (1 hour)
   - Add accessibilityState for expanded/selected (1 hour)
   - Validate touch target sizes >= 44x44 points (30 min)
   - Test with VoiceOver/TalkBack (30 min)
   - **Why Second**: Legal requirement, App Store requirement
   - **Dependencies**: None
   - **Impact**: Compliance, user inclusion, avoid App Store rejection

**3. Fix Performance Issues - Memoization (1 hour)** 🏎️ MOBILE UX
   - Add React.memo to BeerItem (15 min)
   - Add React.memo to FilterBar (15 min)
   - Add useCallback to BeerList renderItem (15 min)
   - Add useMemo to BeerItem date formatting (15 min)
   - **Why Third**: Users experiencing jank right now
   - **Dependencies**: Tests (to verify no regression)
   - **Impact**: 3x render reduction (600 → 200), smoother UX

#### Priority 2: HIGH - Complete HP-3 Goals (13 hours)

**4. Extract Refresh Logic to Shared Hook (3 hours)** 🎯 HP-3 PRIMARY GOAL
   - Create `hooks/useDataRefresh.ts` (2 hours)
   - Integrate into AllBeers, Beerfinder, TastedBrewList (1 hour)
   - **Why Fourth**: This was the main goal of HP-3 but was missed
   - **Dependencies**: Tests
   - **Impact**: Eliminate 208 lines of duplication (71+66+71)

**5. Resurrect Integration Tests (6 hours)**
   - Recreate `BeerListIntegration.test.tsx` with real data fixtures (4 hours)
   - Add performance benchmarks (scrolling, filtering) (1 hour)
   - Add accessibility tests (VoiceOver navigation) (1 hour)
   - **Why Fifth**: End-to-end validation of shared component integration
   - **Dependencies**: Component tests from Priority 1
   - **Impact**: Catch integration bugs, verify HP-3 goals achieved

**6. Optimize FlatList Configuration (2 hours)**
   - Tune initialNumToRender, maxToRenderPerBatch, windowSize (30 min)
   - Add conditional removeClippedSubviews (Platform.OS === 'ios') (15 min)
   - Add updateCellsBatchingPeriod for smoother scrolling (15 min)
   - Performance test on low-end device simulator (1 hour)
   - **Why Sixth**: Mobile-specific optimization for 200+ beer lists
   - **Dependencies**: Performance tests from Priority 2 Step 5
   - **Impact**: Better memory usage, smoother scrolling on budget devices

**7. Improve Error Handling (2 hours)**
   - Add error boundaries around BeerItem rendering (1 hour)
   - Improve date formatting error messages with beer ID (30 min)
   - Fix HTML regex → use html-to-text library (30 min)
   - **Why Seventh**: Production stability, graceful degradation
   - **Dependencies**: Tests
   - **Impact**: App doesn't crash on malformed data

#### Priority 3: MEDIUM - Code Quality (6 hours)

**8. Add JSDoc Documentation (2 hours)**
   - Document all component props with examples
   - Add usage examples for hooks
   - Document performance considerations
   - **Why Eighth**: Developer onboarding, maintainability
   - **Dependencies**: None
   - **Impact**: Easier for future developers to use shared components

**9. Fix HTML Parsing to Use Proper Library (1 hour)**
   - Replace regex with `html-to-text` library
   - Add tests for various HTML inputs (strong, em, div, span)
   - Handle HTML entities (&amp;, &lt;, &nbsp;)
   - **Why Ninth**: Robustness for beer descriptions
   - **Dependencies**: Tests
   - **Impact**: Handle more HTML edge cases correctly

**10. Extract Magic Numbers to Constants (1 hour)**
   - Create `constants/styles.ts` for style constants
   - Create `constants/performance.ts` for FlatList config
   - **Why Tenth**: Readability, easier tuning
   - **Dependencies**: None
   - **Impact**: Centralized configuration

**11. Enable TypeScript Strict Mode (2 hours)**
   - Enable strict mode in tsconfig.json
   - Fix all strict mode errors in shared components
   - Add stricter null checking
   - **Why Eleventh**: Type safety
   - **Dependencies**: None
   - **Impact**: Catch bugs at compile time

#### Priority 4: LOW - Nice to Have (4 hours)

**12. Add Haptic Feedback (1 hour)**
   - Add haptic feedback to filter toggle buttons (expo-haptics)
   - Add haptic feedback to beer expand/collapse
   - **Why Twelfth**: Mobile UX polish
   - **Dependencies**: None
   - **Impact**: Better tactile feedback on filter changes

**13. Improve Empty State Messages (1 hour)**
   - Better visitor mode messaging in TastedBrewList
   - Add illustrations to empty states
   - **Why Thirteenth**: UX polish for first-time users
   - **Dependencies**: None
   - **Impact**: Better first-time user experience

**14. Increase useBeerFilters Coverage to 80%+ (2 hours)**
   - Add 7 missing test scenarios (tasted_date sorting, hook state)
   - Cover uncovered lines 85-107, 123-169
   - **Why Fourteenth**: Complete hook test coverage
   - **Dependencies**: None
   - **Impact**: Better hook test coverage (currently 46%)

---

### Total Estimated Effort to Complete HP-3

**CRITICAL (Priority 1)**: 15 hours
**HIGH (Priority 2)**: 13 hours
**MEDIUM (Priority 3)**: 6 hours
**LOW (Priority 4)**: 4 hours

**TOTAL**: 38 hours (approximately 1 week of focused work)

**Current HP-3 Score**: 6.5/10
**With Priority 1 Complete**: 8/10
**With Priority 1+2 Complete**: 9/10
**With All Priorities Complete**: 9.5/10

---

### Recommendations

**Immediate Actions (This Week)**:

1. **DO NOT DEPLOY TO PRODUCTION** until Priority 1 items are complete
   - Missing tests = no regression protection
   - Missing accessibility = legal/compliance risk (ADA, App Store)
   - Performance issues = poor mobile UX (jank, battery drain)

2. **Fix Testing Environment FIRST** (2 hours)
   - Install `@testing-library/react-native`
   - Setup proper mocking for `useThemeColor` and `useColorScheme` hooks
   - Create test setup file with mock configuration
   - The "testing limitation" excuse is not valid - RN components are testable

3. **Add Accessibility NOW** (4 hours after tests)
   - Legal requirement (ADA compliance)
   - App Store requirement (iOS Human Interface Guidelines)
   - 4 hours of work to avoid legal/business risk

**For Future Refactoring Work**:

1. **DO NOT remove tests** - Fix the testing environment instead
2. **Performance is not optional** on mobile - Always add React.memo, useCallback, useMemo
3. **Accessibility is not optional** - Add a11y labels from the start
4. **Measure before/after** - Always include performance benchmarks
5. **Complete code duplication analysis** - HP-3 missed 208 lines, analysis was incomplete

**Code Review Process Improvements**:

1. **Require test coverage** before merging component refactoring (minimum 80%)
2. **Require performance tests** for list-based components (FlatList benchmarks)
3. **Require accessibility audit** for all UI components (WCAG 2.1 Level A)
4. **Require before/after metrics** for refactoring PRs (line counts, test coverage, performance)

---

### HP-3 Conclusion

HP-3 achieved its **primary goal** of extracting shared components and reducing code duplication **by 25%** (2,442 → 1,834 lines). The `useBeerFilters` hook is **excellent** with 22/22 tests passing. However, the work is **incomplete and not production-ready**:

**✅ SUCCESSES**:
- 608 lines eliminated (25% reduction)
- Clean shared component architecture (BeerItem, FilterBar, BeerList)
- Excellent useBeerFilters hook (22/22 tests passing)
- Successful integration into all 3 parent components

**❌ CRITICAL GAPS**:
- Zero test coverage for shared components (1,184 lines of tests removed)
- Missing accessibility support (legal/compliance risk)
- Missing performance optimizations (poor mobile UX)
- Missed 208 lines of refresh logic duplication (primary HP-3 goal)

**Recommendation**: **Invest 15 hours in Priority 1 fixes** before considering HP-3 complete. Current state is 6.5/10 - with fixes it would be 9/10.

**DO NOT PROCEED to HP-4** until HP-3 Priority 1 items are complete. The shared components are the foundation for all beer list UX - they must be production-ready before moving forward.

---

### HP-4: HTML Parsing in Production Code

**Description**: `Beerfinder.tsx` contains 150+ lines of regex-based HTML parsing to extract queued beers from the Flying Saucer website (lines 530-652). This is fragile and will break if the website HTML changes.

```typescript
const parseQueuedBeersFromHtml = (html: string): QueuedBeer[] => {
  const beerEntryRegex = /<h3 class="brewName">(.*?)<div class="brew_added_date">(.*?)<\/div><\/h3>[\s\S]*?<a href="deleteQueuedBrew\.php\?cid=(\d+)"/g;
  // ... 120 more lines of fragile regex
}
```

**Impact**:
- Production failures when website HTML changes
- Unpredictable parsing errors
- Poor user experience with broken queue management
- Security risk from unexpected HTML content

**Refactoring Plan**:

**Step 1a**: Write tests for queue API wrapper
- Create `src/api/__tests__/queueService.test.ts`
- Test `getQueuedBeers()` with mocked responses
- Test error handling for network failures
- Test response parsing
- **Testing**: Run `npm test`, verify queue service tests pass

**Step 1b**: Create dedicated API endpoint wrapper
- Add `getQueuedBeers()` to `src/api/queueService.ts`
- Document the API endpoint structure
- Add response type definitions
- **Testing**: Run `npm test`, then call View Queues, verify queued beers display correctly

**Step 2a**: Write tests for HTML parsing error handling
- Create `components/Beerfinder/__tests__/htmlParser.test.ts`
- Test parsing with valid HTML
- Test parsing with malformed HTML (should return empty array)
- Test parsing with missing elements
- Test error logging behavior
- **Testing**: Run `npm test`, verify parser error handling tests pass

**Step 2b**: Add proper error boundaries
- Wrap HTML parsing in try-catch with specific error types
- Return empty array on parse failure instead of throwing
- Log parsing errors for debugging
- Update tests
- **Testing**: Run `npm test`, then mock malformed HTML response, verify graceful error message instead of crash

**Step 3a**: Write tests for fallback strategies
- Add tests to `htmlParser.test.ts` for fallback scenarios
- Test regex failure → JSON extraction fallback
- Test complete failure → user message display
- **Testing**: Run `npm test`, verify fallback tests pass

**Step 3b**: Implement fallback strategies
- If regex parsing fails, try simpler JSON extraction
- Show user-friendly message: "Queue data unavailable. Please try again later."
- Add retry button
- **Testing**: Run `npm test`, then simulate API returning unexpected format, verify error message appears

**Step 4a**: Write tests for HTML parser library integration (optional)
- Add tests comparing regex vs. library parsing
- Test that results are identical
- **Testing**: Run `npm test`, verify parser library tests pass

**Step 4b**: Add HTML parser library (optional improvement)
- Consider adding `htmlparser2` or `cheerio` for React Native
- Replace regex with proper DOM parsing
- Update all tests
- **Testing**: Run `npm test`, then same test as Step 1, verify no regression

**Step 5**: Add integration test with real HTML samples
- Save sample HTML responses in `__tests__/fixtures/queueHtml/`
- Create `__tests__/queueParsing.integration.test.ts`
- Test parsing against known good and bad samples
- Include edge cases (0 queued beers, 50+ queued beers, special characters)
- **Testing**: Run `npm test:ci`, verify HTML parsing integration tests pass with 100% success rate

**Testing Focus**:
- Queue viewing works with current HTML format
- Graceful degradation when parsing fails
- User sees helpful error messages
- Delete queue item still works

---

### HP-5: Unsafe Error Handling and Missing Validation

**Description**: Multiple critical areas lack proper error handling:
1. No validation of API response structure before database insertion
2. Promises swallowed without logging (`.catch(err => {})` with empty handlers)
3. Network errors don't properly update UI state
4. Database errors allow app to continue in inconsistent state

**Impact**:
- Silent data corruption
- App appears to work but has stale/incorrect data
- Users don't know when operations fail
- Difficult to diagnose production issues

**Refactoring Plan**:

**Step 1a**: Write tests for API response validation
- Create `src/api/__tests__/validators.test.ts`
- Test validation with valid response structure
- Test validation with missing `brewInStock`
- Test validation with malformed beer objects
- Test validation with empty arrays
- **Testing**: Run `npm test`, verify validator tests pass with 100% coverage

**Step 1b**: Add API response validation
- Create `src/api/validators.ts` with response schema validation
- Validate `brewInStock` array exists and has expected structure
- Reject malformed responses early
- Update API client to use validators
- **Testing**: Run `npm test`, then mock API returning malformed JSON, verify error alert appears

**Step 2a**: Write tests for error logging
- Create `src/utils/__tests__/errorLogger.test.ts`
- Test error logging with different error types
- Test context serialization
- Test log levels (error, warning, info)
- **Testing**: Run `npm test`, verify error logger tests pass

**Step 2b**: Implement centralized error logging
- Create `src/utils/errorLogger.ts` with `logError(error, context)` function
- Replace all empty catch blocks with proper logging
- Add error context (which operation failed, user state, etc.)
- Update all error handling code
- **Testing**: Run `npm test`, then trigger network error, check console logs for proper error details

**Step 3a**: Write tests for database operation validation
- Create `src/database/__tests__/dataValidation.test.ts`
- Test validation of beer objects
- Test handling of invalid records
- Test operation summary generation
- **Testing**: Run `npm test`, verify data validation tests pass

**Step 3b**: Add database operation validation
- Validate beer objects have required fields (`id`, `brew_name`) before insertion
- Skip invalid records with warning log
- Return operation summary (inserted X, skipped Y invalid records)
- Update insertion logic with validation
- **Testing**: Run `npm test`, then mock API returning beers with missing `id` field, verify skipped with warning

**Step 4a**: Write tests for error boundaries
- Create `components/__tests__/ErrorBoundary.test.tsx`
- Test error boundary catches component errors
- Test error boundary shows fallback UI
- Test retry functionality
- **Testing**: Run `npm test`, verify error boundary tests pass

**Step 4b**: Implement user-facing error states
- Create `components/ErrorBoundary.tsx`
- Add error boundaries around critical components
- Show retry buttons with error messages
- Distinguish between network errors and data errors
- **Testing**: Run `npm test`, then test each error type shows appropriate message and recovery option

**Step 5a**: Write tests for transaction rollback
- Create `src/database/__tests__/transactions.test.ts`
- Test successful multi-step transaction
- Test transaction rollback on error
- Test partial failure scenarios
- **Testing**: Run `npm test`, verify transaction tests pass

**Step 5b**: Add transaction rollback on errors
- Wrap multi-step database operations in transactions
- Rollback on any step failure
- Update all multi-step operations
- **Testing**: Run `npm test`, then force error mid-import (mock runAsync to fail on 50th insert), verify no partial data

**Testing Focus**:
- Invalid data doesn't corrupt database
- Users see actionable error messages
- All errors are logged for debugging
- Network failures can be retried

---

### HP-6: Missing Database Connection Lifecycle Management

**Description**: The database connection in `src/database/connection.ts` (33 lines) is opened but never closed. The app doesn't properly manage database lifecycle during app backgrounding, which can lead to corruption if the app is killed during a transaction.

**Impact**:
- Potential database corruption if app is killed during a write operation
- Memory leaks on long-running sessions
- File lock issues on some Android devices
- No WAL (Write-Ahead Logging) mode enabled for better concurrency and crash safety
- Poor resource management violates React Native mobile best practices

**Refactoring Plan**:

**Step 1a**: Write tests for database lifecycle
- Create `src/database/__tests__/lifecycle.test.ts`
- Test database open/close operations
- Test WAL mode enablement
- Test PRAGMA settings
- **Testing**: Run `npm test`, verify lifecycle tests pass

**Step 1b**: Add database lifecycle management
- Add `closeDatabaseConnection()` function to `connection.ts`
- Enable WAL mode: `PRAGMA journal_mode = WAL`
- Set synchronous mode: `PRAGMA synchronous = NORMAL`
- Export close function for use by app lifecycle hooks
- **Testing**: Run `npm test`, then test database operations after close/reopen cycle

**Step 2a**: Write tests for app state integration
- Create `app/__tests__/databaseLifecycle.test.tsx`
- Test database closes when app backgrounds
- Test database reopens when app foregrounds
- Test pending operations complete before close
- **Testing**: Run `npm test`, verify app lifecycle tests pass

**Step 2b**: Integrate with React Native AppState
- Add AppState listener in `app/_layout.tsx`
- Close database connection when app state changes to 'background'
- Reopen connection when app state changes to 'active'
- Ensure all pending transactions complete before closing
- Add error handling for close failures
- **Testing**: Run `npm test`, then manual test - background app during refresh, verify no corruption when returning

**Step 3a**: Write tests for graceful shutdown
- Add tests to `lifecycle.test.ts` for shutdown scenarios
- Test pending operations complete before shutdown
- Test locks are released on shutdown
- Test error recovery on forced close
- **Testing**: Run `npm test`, verify shutdown tests pass

**Step 3b**: Add graceful shutdown mechanism
- Check for active locks before closing connection
- Wait for locks to release (with timeout)
- Log warning if forced to close with active operations
- Add shutdown state to prevent new operations during close
- **Testing**: Run `npm test`, then force close during operation, verify log warnings appear

**Testing Focus**:
- No database corruption on app backgrounding
- Proper resource cleanup
- File locks are released correctly
- WAL mode improves concurrency
- Memory usage is managed properly
- **CI-3 Resolved**: Database connections properly managed through app lifecycle

---

### HP-7: Deprecate and Remove db.ts Compatibility Layer

**Description**: The db.ts file (432 lines after HP-1 Step 7b) is now a thin compatibility wrapper that delegates all operations to repositories. While functional, it adds an unnecessary indirection layer and can confuse developers about the proper data access pattern. Currently 14 files import from db.ts across components, screens, and services.

**Impact**:
- Unnecessary indirection in data access flow
- Confusion about whether to use db.ts or repositories directly
- Additional maintenance burden
- Slightly reduced performance from extra function calls
- Harder to reason about data flow

**Current State**:
- db.ts: 432 lines (thin wrapper only)
- 14 files importing from db.ts
- All actual database logic in repositories (95-98% test coverage)

**Refactoring Plan**:

**Step 1a**: Write tests for deprecation warnings
- Create `src/database/__tests__/deprecation.test.ts`
- Test that @deprecated JSDoc annotations are present
- Test development mode warnings are logged
- **Testing**: Run `npm test`, verify deprecation tests pass

**Step 1b**: Add deprecation warnings
- Add `@deprecated` JSDoc to all db.ts exported functions
- Document repository imports in CLAUDE.md
- Add console.warn in development mode when db.ts functions are called
- Create migration guide in documentation
- **Testing**: Run app in dev mode, verify warnings appear for db.ts usage

**Step 2a**: Write migration tests for simple components
- Create tests for Rewards.tsx using repository pattern
- Create tests for TastedBrewList.tsx using repository pattern
- Verify all functionality preserved
- **Testing**: Run `npm test`, verify component tests pass with repository imports

**Step 2b**: Migrate simple components (lowest risk first)
- Migrate Rewards.tsx → import from repositories
- Migrate TastedBrewList.tsx → import from repositories
- Update component tests
- Manual test each component in light/dark mode
- **Testing**: Run `npm test`, then manual testing of affected components

**Step 3a**: Write migration tests for complex components
- Create tests for AllBeers.tsx using repository pattern
- Create tests for Beerfinder.tsx using repository pattern
- Test all filter/search/refresh scenarios
- **Testing**: Run `npm test`, verify complex component tests pass

**Step 3b**: Migrate complex components
- Migrate AllBeers.tsx → import from repositories
- Migrate Beerfinder.tsx → import from repositories
- Update component tests
- Full regression testing (filters, search, sort, refresh)
- **Testing**: Run `npm test`, then full manual test of beer list features

**Step 4a**: Write migration tests for screens and services
- Create tests for tab screens using repository pattern
- Create tests for authService.ts using repository pattern
- Test app initialization flow with repository pattern
- **Testing**: Run `npm test`, verify screen/service tests pass

**Step 4b**: Migrate screens and services
- Migrate tab screens (index.tsx, beerlist.tsx, tastedbrews.tsx, mybeers.tsx)
- Migrate settings.tsx (careful - large file)
- Migrate authService.ts
- Migrate app/_layout.tsx (critical - test thoroughly)
- Update all tests
- **Testing**: Run `npm test`, then full app regression test (visitor mode, member mode, login/logout)

**Step 5a**: Write final integration tests
- Create `src/__tests__/integration/repositoryMigration.integration.test.ts`
- Test complete user flows with repository pattern
- Test no db.ts imports remain (lint check)
- Test all database operations work correctly
- **Testing**: Run `npm test:ci`, verify 100% pass rate

**Step 5b**: Remove db.ts entirely
- Delete src/database/db.ts
- Remove from exports
- Update CLAUDE.md to document repository pattern
- Remove deprecation tests
- Final integration test run
- **Testing**: Run `npm test`, then complete regression - all tabs, login/logout, refresh, filters

**Migration Guide Example**:
```typescript
// OLD (deprecated)
import { getAllBeers, getMyBeers } from '@/database/db';
const beers = await getAllBeers();
const myBeers = await getMyBeers();

// NEW (recommended)
import { beerRepository } from '@/database/repositories/BeerRepository';
import { myBeersRepository } from '@/database/repositories/MyBeersRepository';
const beers = await beerRepository.getAll();
const myBeers = await myBeersRepository.getAll();
```

**Testing Focus**:
- Zero regressions during migration
- All components work identically
- Performance maintained or improved
- No db.ts imports remain in codebase
- Clear documentation for repository pattern

**Estimated effort**: 1 week
**Priority**: Medium-Low (complete after HP-6)
**Dependencies**: HP-1 must be complete (already done)

---

## Medium Priority Issues

### MP-1: Settings Screen Complexity (1,200 lines)

**Description**: `app/settings.tsx` is 1,200 lines handling login, WebView management, preferences display, Untappd authentication, visitor mode, and navigation. Too many responsibilities in one file.

**Impact**:
- Difficult to test login flows
- WebView logic mixed with UI logic
- State management is confusing
- Adding new settings features is risky

**Refactoring Plan**:

**Step 1a**: Write tests for WebView components
- Create `components/__tests__/LoginWebView.test.tsx`
- Create `components/__tests__/UntappdLoginWebView.test.tsx`
- Test WebView message handling
- Test login success/failure flows
- **Testing**: Run `npm test`, verify WebView tests pass

**Step 1b**: Extract WebView managers
- Create `components/LoginWebView.tsx` for Flying Saucer login
- Create `components/UntappdLoginWebView.tsx` for Untappd
- Move `handleWebViewMessage` logic to respective components
- Update tests
- **Testing**: Run `npm test`, then login flow - member login, visitor login, Untappd login all work

**Step 2a**: Write tests for login hooks
- Create `hooks/__tests__/useLoginFlow.test.ts`
- Create `hooks/__tests__/useUntappdLogin.test.ts`
- Test all login flow states
- Test error handling
- **Testing**: Run `npm test`, verify login hook tests pass

**Step 2b**: Extract login logic to hooks
- Create `hooks/useLoginFlow.ts` with `startLogin`, `handleLoginSuccess`, `handleLoginError`
- Create `hooks/useUntappdLogin.ts` for Untappd flow
- Update components to use hooks
- **Testing**: Run `npm test`, then member login, verify API URLs are saved and refresh occurs

**Step 3a**: Write tests for settings sections
- Create `components/settings/__tests__/AboutSection.test.tsx`
- Create `components/settings/__tests__/DataManagementSection.test.tsx`
- Create `components/settings/__tests__/DevelopmentSection.test.tsx`
- Test rendering and interactions
- **Testing**: Run `npm test`, verify settings section tests pass

**Step 3b**: Split settings UI into sections
- Create `components/settings/AboutSection.tsx`
- Create `components/settings/DataManagementSection.tsx`
- Create `components/settings/DevelopmentSection.tsx`
- Update main settings to use sections
- **Testing**: Run `npm test`, then verify settings screen renders all sections correctly

**Step 4a**: Write integration tests for settings screen
- Create `app/__tests__/settings.integration.test.tsx`
- Test complete settings flow end-to-end
- Test all button interactions
- Test modal flows
- **Testing**: Run `npm test:ci`, verify settings integration tests pass

**Step 4b**: Reduce main settings file
- Target ~300 lines for `settings.tsx` (orchestration only)
- Delegate rendering and logic to extracted components
- Update all tests
- **Testing**: Run `npm test`, then full settings regression - all buttons work, modals open/close

**Testing Focus**:
- Login flows don't break
- Settings screen navigation works
- Dark mode is preserved
- First-launch experience is correct

---

### MP-2: Missing Type Safety in Database Operations

**Description**: Database queries use `getAllAsync<any>()` and manual type casting throughout. Type guards exist but aren't consistently used. Runtime type safety is inconsistent.

**Impact**:
- TypeScript provides false sense of security
- Runtime errors from unexpected data shapes
- Difficult to catch data model changes

**Refactoring Plan**:

**Step 1a**: Write tests for database schemas
- Create `src/database/__tests__/schemas.test.ts`
- Test schema validation with valid data
- Test schema validation with invalid data
- Test all entity types (Beer, Beerfinder, Reward, Preference)
- **Testing**: Run `npm test`, verify schema tests pass

**Step 1b**: Define strict database schemas
- Create `src/database/schemas.ts` with Zod or io-ts schemas
- Define schemas for Beer, Beerfinder, Reward, Preference
- Export validation functions
- **Testing**: Run `npm test`, then import beers, verify all fields match schema

**Step 2a**: Write tests for runtime validation wrapper
- Create `src/database/__tests__/validation.test.ts`
- Test validated `getAllAsync` wrapper
- Test handling of invalid rows
- Test logging behavior
- **Testing**: Run `npm test`, verify validation wrapper tests pass

**Step 2b**: Add runtime validation at database boundaries
- Create `src/database/validation.ts` with validation wrapper
- Wrap `getAllAsync` with validation
- Type guard on every row returned
- Log and skip invalid rows
- **Testing**: Run `npm test`, then mock database returning extra/missing fields, verify graceful handling

**Step 3a**: Write tests for typed repository
- Extend repository tests from HP-1 Step 5a
- Test generic `Repository<T>` base class
- Test type guarantees
- **Testing**: Run `npm test`, verify typed repository tests pass

**Step 3b**: Create typed repository pattern
- Update `BeerRepository.getAll()` to return `Beer[]` with type guarantees
- Create generic `Repository<T>` base class in `src/database/repositories/BaseRepository.ts`
- Update all repositories to extend base
- **Testing**: Run `npm test`, verify repository methods return correctly typed data

**Step 4a**: Audit and identify all `any` types
- Run `grep -r ": any" src/` to find all instances
- Create checklist of files to update
- Write tests for each module before removing `any`
- **Testing**: Run `npm test`, establish baseline coverage

**Step 4b**: Remove `any` types
- Replace with specific types or `unknown` where appropriate
- Enable `strict: true` in tsconfig.json
- Fix all type errors
- Update tests as needed
- **Testing**: Run `npm run tsc` with no errors, then `npm test` to verify functionality

**Step 5a**: Write tests for repository type safety (Post-HP-1 Enhancement)
- Create `src/database/repositories/__tests__/typeSafety.test.ts`
- Test generic type parameters work correctly
- Test invalid data is filtered out
- Test type guards are applied
- **Testing**: Run `npm test`, verify repository type safety tests pass

**Step 5b**: Add strict typing to repository methods
- **Recommended Issue RI-2**: Repository methods use `getAllAsync<any>()` instead of proper generics
- Replace `getAllAsync<any>()` with `getAllAsync<Beer>()`, `getAllAsync<Beerfinder>()`, etc.
- Add runtime validation with type guards (filter invalid rows)
- Return type-safe arrays with compile-time guarantees
- Log and skip invalid rows instead of throwing
- **Testing**: Run `npm test`, then mock database returning extra/missing fields, verify graceful handling

**Testing Focus**:
- Type errors caught at compile time
- Runtime validation catches malformed data
- No `any` types in production code
- **RI-2 Resolved**: Repository methods have proper type safety with generics and runtime validation

---

### MP-3: Performance Issues in Large Lists

**Description**: FlatList components don't use optimization props like `initialNumToRender`, `maxToRenderPerBatch`, `windowSize`. Filtering/sorting happens on every render. No memoization.

**Impact**:
- Laggy scrolling with 200+ beers
- Unnecessary re-renders
- Battery drain from excessive work

**Refactoring Plan**:

**Step 1a**: Write performance benchmarks
- Create `src/__tests__/performance/listRendering.perf.test.ts`
- Benchmark current FlatList rendering with 200+ items
- Measure scroll FPS
- Establish baseline metrics
- **Testing**: Run `npm test`, record baseline performance numbers

**Step 1b**: Add FlatList optimizations
- Set `initialNumToRender={10}`, `maxToRenderPerBatch={10}`, `windowSize={10}`
- Add `getItemLayout` for consistent heights
- Update BeerList component
- **Testing**: Run performance tests, verify 60fps when scrolling through 200+ beers

**Step 2a**: Write tests for memoization
- Create `src/__tests__/performance/memoization.test.ts`
- Test that filter logic doesn't recompute unnecessarily
- Test that sort logic doesn't recompute unnecessarily
- Verify memo dependencies are correct
- **Testing**: Run `npm test`, verify memoization tests pass

**Step 2b**: Memoize expensive computations
- Wrap filter logic in `useMemo`
- Wrap sort logic in `useMemo`
- Dependencies: `[beers, filters, searchText, sortBy]`
- **Testing**: Run `npm test`, then toggle filter, verify only filtered list updates (use React DevTools)

**Step 3a**: Write tests for render optimization
- Add tests to `BeerItem.test.tsx` for React.memo behavior
- Test that memoized component doesn't re-render with same props
- **Testing**: Run `npm test`, verify memo tests pass

**Step 3b**: Optimize re-renders
- Use `React.memo` for BeerItem component with custom comparison
- Add optimized `keyExtractor` function
- Update FlatList configuration
- **Testing**: Run `npm test`, then enable React DevTools Profiler, verify reduced render count

**Step 4a**: Write comparison tests for FlashList
- Create performance comparison test
- Test both FlatList and FlashList implementations
- Measure rendering performance difference
- **Testing**: Run performance tests, compare metrics

**Step 4b**: Implement virtual scrolling improvements (optional)
- Add `@shopify/flash-list` dependency
- Replace FlatList with FlashList in BeerList component
- Update estimated item size
- **Testing**: Run `npm test`, then compare scroll performance before/after using profiler

**Testing Focus**:
- Smooth 60fps scrolling
- No jank when typing in search
- Fast filter toggles

---

### MP-4: Inconsistent State Management

**Description**: State is scattered across component state, database, preferences, module-level variables, and SecureStore. No single source of truth. Visitor mode flag stored in preferences instead of context.

**Impact**:
- Difficult to reason about app state
- Stale state bugs
- Multiple components reading preferences repeatedly
- Poor performance from redundant database reads

**Refactoring Plan**:

**Step 1a**: Write tests for AppContext
- Create `contexts/__tests__/AppContext.test.tsx`
- Test context provider initialization
- Test context value updates
- Test multiple consumers
- **Testing**: Run `npm test`, verify AppContext tests pass

**Step 1b**: Create AppContext
- Create `contexts/AppContext.tsx` with global app state
- Include: `isVisitorMode`, `isAuthenticated`, `currentUser`, `apiConfigured`
- Add provider to app root
- **Testing**: Run `npm test`, then login/logout, verify context updates across all tabs

**Step 2a**: Write tests for preference caching
- Create `hooks/__tests__/usePreference.test.ts`
- Test preference loading on app start
- Test preference updates propagate to all consumers
- Test cache invalidation
- **Testing**: Run `npm test`, verify preference hook tests pass

**Step 2b**: Cache preferences in context
- Load preferences once on app start in AppContext
- Create `usePreference(key)` hook
- Update components to use hook instead of direct DB reads
- **Testing**: Run `npm test`, then change preference, verify all consumers update

**Step 3a**: Write tests for auth context
- Create `hooks/__tests__/useAuth.test.ts`
- Test auth state transitions
- Test session expiry handling
- Test logout behavior
- **Testing**: Run `npm test`, verify auth hook tests pass

**Step 3b**: Consolidate auth state
- Move session management to AppContext
- Create `useAuth()` hook
- Update all components to use hook
- **Testing**: Run `npm test`, then verify session expiry handling works correctly

**Step 4a**: Write performance tests for context migration
- Create `src/__tests__/performance/contextPerformance.test.ts`
- Measure app load time before and after migration
- Count database reads during app initialization
- **Testing**: Run performance tests, record baseline metrics

**Step 4b**: Remove redundant preference reads
- Replace all `await getPreference('is_visitor_mode')` with `usePreference('is_visitor_mode')`
- Remove unnecessary database queries
- Update all affected components
- **Testing**: Run performance tests, verify app load time improved and DB read count reduced

**Testing Focus**:
- State consistency across components
- No redundant database reads
- Proper reactivity to state changes

---

### MP-5: Missing Integration Tests

**Description**: Tests exist but focus on unit tests. No integration tests for critical user flows. Component tests were removed due to issues. Service integration tests exist but don't cover error scenarios.

**Impact**:
- Refactoring is risky without flow tests
- Regressions are caught in production
- Manual testing burden is high

**Refactoring Plan**:

**Step 1**: Add critical path integration tests
- Create `src/__tests__/integration/userFlows.integration.test.ts`
- Test: Fresh install → login → refresh → view beers
- Test: Visitor mode flow end-to-end
- Test: Member logout → visitor login → member login
- Use real JSON fixtures for API responses
- **Testing**: Run `npm test:ci`, verify 80%+ coverage of critical paths

**Step 2**: Add error scenario tests
- Create `src/__tests__/integration/errorScenarios.integration.test.ts`
- Test: Network error during refresh (mock fetch to fail)
- Test: Malformed API response (invalid JSON)
- Test: Database full/corrupted (mock SQLite errors)
- Test: Concurrent operation conflicts
- **Testing**: Run `npm test:ci`, verify all error scenarios return graceful failures

**Step 3**: Add database migration tests
- Create `src/database/__tests__/migrations.integration.test.ts`
- Test: Upgrade from v1.0 to v1.1 (simulate schema change)
- Test: Data preserved during upgrade
- Test: Rollback on migration failure
- Test: Multiple version jumps (v1.0 → v1.3)
- **Testing**: Run `npm test:ci`, mock old database version, verify migration succeeds

**Step 4**: Set up E2E testing framework
- Add Detox or Maestro configuration
- Create `e2e/__tests__/userJourney.e2e.ts`
- Test: Complete user journey on real device (install → login → browse → check-in)
- Test: Visitor mode E2E flow
- Test: Offline mode E2E flow
- Configure CI to run E2E tests
- **Testing**: Run `npm run test:e2e`, verify E2E test suite passes in CI

**Testing Focus**:
- Critical user flows are tested
- Error scenarios are covered
- Regression suite is comprehensive

---

### MP-6: Hardcoded URLs and Magic Strings

**Description**: URLs like `'https://tapthatapp.beerknurd.com'`, `'https://fsbs.beerknurd.com'`, `'https://untappd.com'` are hardcoded throughout the codebase. Preference keys like `'is_visitor_mode'`, `'all_beers_api_url'` are magic strings.

**Impact**:
- Environment-specific configuration is difficult
- Typos in preference keys cause silent failures
- Hard to switch between dev/staging/prod environments

**Refactoring Plan**:

**Step 1a**: Write tests for constants module
- Create `src/constants/__tests__/api.test.ts`
- Create `src/constants/__tests__/preferences.test.ts`
- Test all constant values are defined
- Test enum values for preference keys
- **Testing**: Run `npm test`, verify constants tests pass

**Step 1b**: Create constants file
- Create `src/constants/api.ts` with `API_BASE_URL`, `UNTAPPD_URL`, etc.
- Create `src/constants/preferences.ts` with `PREF_KEYS` enum
- Replace all hardcoded URLs with constant references
- Update all imports
- **Testing**: Run `npm test`, then verify all features work (no breakage from constant migration)

**Step 2a**: Write tests for environment configuration
- Create `src/config/__tests__/environment.test.ts`
- Test dev environment configuration
- Test staging environment configuration
- Test prod environment configuration
- Test environment detection logic
- **Testing**: Run `npm test`, verify environment config tests pass

**Step 2b**: Add environment configuration
- Create `src/config/environment.ts` with dev/staging/prod configs
- Use `expo-constants` to switch environments
- Update constants to use environment config
- **Testing**: Run `npm test`, then build for each environment, verify correct URLs are used

**Step 3a**: Write tests for type-safe preference keys
- Update preference tests to use `PREF_KEYS` enum
- Test that enum values match actual database preference keys
- Test TypeScript compilation catches invalid keys
- **Testing**: Run `npm test`, verify type-safe preference tests pass

**Step 3b**: Type-safe preference keys
- Update `getPreference` signature to accept `PREF_KEYS` enum
- Replace all `getPreference('is_visitor_mode')` with `getPreference(PREF_KEYS.IS_VISITOR_MODE)`
- Update all preference reads throughout codebase
- **Testing**: Run `npm run tsc` (compile succeeds), then `npm test` (no runtime errors)

**Testing Focus**:
- No hardcoded URLs remain
- Environment switching works
- Type safety for constants

---

### MP-7: Inadequate Offline Support

**Description**: While the app has offline-first architecture with SQLite, the offline UX is poor:
- No indication when data is stale
- No queue for offline check-ins
- No sync status indicator
- Refresh button doesn't show last refresh time

**Impact**:
- Users don't know if they're seeing current data
- Lost check-ins if attempted while offline
- Confusion about app state

**Refactoring Plan**:

**Step 1a**: Write tests for timestamp display component
- Create `components/__tests__/LastRefreshTimestamp.test.tsx`
- Test timestamp formatting ("2 hours ago", "Just now", etc.)
- Test with various timestamp values
- **Testing**: Run `npm test`, verify timestamp display tests pass

**Step 1b**: Add last refresh timestamp display
- Create `components/LastRefreshTimestamp.tsx`
- Show "Last updated X ago" in each tab header
- Use `last_all_beers_refresh` preference from context
- Update beer list components
- **Testing**: Run `npm test`, then refresh data, verify timestamp updates correctly

**Step 2a**: Write tests for offline indicator
- Create `components/__tests__/OfflineIndicator.test.tsx`
- Test offline detection
- Test banner display when offline
- Test refresh button disabled state
- **Testing**: Run `npm test`, verify offline indicator tests pass

**Step 2b**: Add offline indicator
- Create `components/OfflineIndicator.tsx`
- Show banner when offline (use `@react-native-community/netinfo`)
- Disable refresh button when offline
- Add to app layout
- **Testing**: Run `npm test`, then enable airplane mode, verify banner appears and refresh is disabled

**Step 3a**: Write tests for offline queue
- Create `src/services/__tests__/offlineQueue.test.ts`
- Test adding check-ins to queue when offline
- Test queue persistence
- Test sync when coming back online
- Test conflict resolution
- **Testing**: Run `npm test`, verify offline queue tests pass

**Step 3b**: Implement offline queue for check-ins
- Create `src/services/offlineQueue.ts`
- Store check-ins in SQLite queue table when offline
- Add network listener to trigger sync when online
- Implement sync logic with retry on failure
- **Testing**: Run `npm test`, then check-in while offline, go online, verify sync succeeds

**Step 4a**: Write tests for sync status indicator
- Create `components/__tests__/SyncStatusIndicator.test.tsx`
- Test loading state display
- Test success toast
- Test failure toast with retry option
- **Testing**: Run `npm test`, verify sync status tests pass

**Step 4b**: Add sync status indicator
- Create `components/SyncStatusIndicator.tsx`
- Show loading spinner during refresh
- Show success toast on completion
- Show failure toast with retry button on error
- Add to main layout
- **Testing**: Run `npm test`, then test each sync outcome (success, network error, server error) shows appropriate feedback

**Testing Focus**:
- Users understand data freshness
- Offline operations are queued
- Clear sync feedback

---

## Low Priority Issues / Improvements

### LP-1: Code Style Inconsistencies

**Description**: Mix of function declarations and arrow functions, inconsistent naming (`getPreference` vs `get_preference` in DB), some files use default exports while others use named exports.

**Impact**: Minor - reduces code readability but doesn't affect functionality.

**Refactoring Plan**:
- Adopt ESLint with Airbnb or Standard config
- Enforce consistent naming conventions
- Choose default vs named exports convention
- Run `npm run lint --fix`

---

### LP-2: Missing Loading Skeletons

**Description**: Loading states show simple spinners. Modern UX uses skeleton screens to indicate content structure while loading.

**Impact**: Minor UX improvement, not critical.

**Refactoring Plan**:
- Add `react-native-skeleton-placeholder` or custom skeleton
- Replace LoadingIndicator with skeleton in beer lists
- Show skeleton beer cards while loading

---

### LP-3: No Analytics or Crash Reporting

**Description**: No integration with Sentry, Firebase Analytics, or similar tools. Production errors are invisible.

**Impact**: Can't diagnose production issues, no insight into user behavior.

**Refactoring Plan**:
- Add Sentry for error tracking
- Add Firebase Analytics for usage metrics
- Instrument critical paths
- Monitor error rates in production

---

### LP-4: Accessibility Issues

**Description**: No accessibility labels on buttons, poor screen reader support, insufficient color contrast in some dark mode elements.

**Impact**: App is unusable for visually impaired users.

**Refactoring Plan**:
- Add `accessibilityLabel` to all buttons
- Add `accessibilityRole` to components
- Test with iOS VoiceOver / Android TalkBack
- Ensure color contrast meets WCAG AA standards

---

### LP-5: No Automated Code Quality Checks

**Description**: No pre-commit hooks, no CI checks for code quality, no automated test runs.

**Impact**: Code quality depends entirely on manual review.

**Refactoring Plan**:
- Add Husky for pre-commit hooks
- Run `npm run lint` and `npm test` before commit
- Add GitHub Actions CI workflow
- Enforce test coverage thresholds (80%+)

---

### LP-6: Untappd Integration is Incomplete

**Description**: Untappd WebView is marked as "alpha", login detection is fragile (relies on DOM inspection), no actual Untappd API integration.

**Impact**: Feature doesn't provide much value in current state.

**Refactoring Plan**:
- Either fully implement Untappd API integration or remove feature
- If keeping: use official Untappd API instead of WebView scraping
- Add proper OAuth flow
- Store Untappd session securely

---

### LP-7: Magic Numbers Throughout Code

**Description**: Hardcoded values like `2 * 60 * 60 * 1000` (2 hours), `15000` (15 second timeout), `50` (batch size) appear throughout code.

**Impact**: Minor - makes code slightly less readable.

**Refactoring Plan**:
- Extract to named constants:
  ```typescript
  const REFRESH_INTERVAL_MS = 2 * 60 * 60 * 1000;
  const API_TIMEOUT_MS = 15000;
  const DB_BATCH_SIZE = 50;
  ```

---

### LP-8: Visitor Mode UX Could Be Improved

**Description**: Visitor mode shows "No beers in your current round yet" which is confusing for visitors who don't have "rounds".

**Impact**: Minor UX confusion.

**Refactoring Plan**:
- Detect visitor mode in TastedBrewList
- Show visitor-appropriate message: "Login to track your tasted beers"
- Add "Login" button in empty state

---

### LP-9: Inconsistent and Undocumented Batch Sizes

**Description**: Different repositories use different batch sizes without documentation or justification:
- BeerRepository: 50 beers per batch
- MyBeersRepository: 20 beers per batch
- RewardsRepository: 100 rewards per batch

No memory testing or performance profiling justifies these values.

**Impact**:
- Potential memory issues on low-end devices
- Suboptimal performance (batch sizes may be too small or too large)
- Inconsistent behavior across repository operations
- **Recommended Issue RI-5**: No mobile memory constraints validation

**Refactoring Plan**:

**Step 1a**: Write performance tests for batch operations
- Create `src/__tests__/performance/batchSizes.perf.test.ts`
- Test memory usage with different batch sizes (10, 25, 50, 100, 200)
- Test transaction time with different batch sizes
- Test on simulated low-end device constraints
- **Testing**: Run performance tests, record baseline metrics

**Step 1b**: Standardize and document batch sizes
- Create `src/constants/database.ts` with:
  ```typescript
  export const DB_BATCH_SIZES = {
    BEERS: 50,        // Tested with 1000 beers, ~2MB memory
    MY_BEERS: 50,     // Unified with beers for consistency
    REWARDS: 100,     // Rewards are smaller objects
    MAX_TRANSACTION_TIME_MS: 5000  // Prevent long-running transactions
  };
  ```
- Update all repositories to use constants
- Add JSDoc comments explaining choices
- **Testing**: Run `npm test`, verify all repositories use standard batch sizes

**Step 2a**: Write tests for transaction time monitoring
- Create `src/database/__tests__/transactionMonitoring.test.ts`
- Test warning logs for slow transactions
- Test metrics collection
- **Testing**: Run `npm test`, verify monitoring tests pass

**Step 2b**: Add transaction performance monitoring
- Log warning if batch operation exceeds `MAX_TRANSACTION_TIME_MS`
- Suggest reducing batch size in warning
- Track metrics for future optimization
- **Testing**: Run `npm test`, then import 1000+ beers, verify completion time is acceptable

**Testing Focus**:
- Batch sizes optimized for mobile memory constraints
- Consistent behavior across all repositories
- Clear documentation of performance trade-offs
- **RI-5 Resolved**: Batch sizes justified and validated against mobile device constraints

---

## Technical Debt & Future Considerations

### Database Migration Strategy
Currently there's no migration system. Adding/changing database columns will break existing installations. Consider:
- Implementing version-based migrations
- Using a migration library compatible with expo-sqlite
- Testing upgrade paths from old versions

### API Rate Limiting
No rate limiting protection. If many users refresh simultaneously, server could be overloaded. Consider:
- Exponential backoff on failures
- Random jitter in automatic refresh times
- Client-side rate limiting

### Bundle Size Optimization
No code splitting or lazy loading. Consider:
- Analyze bundle with `expo-bundle-visualizer`
- Lazy load screens/components
- Split vendor chunks

### State Persistence on Crashes
If app crashes during database write, data could be corrupted. Consider:
- Write-ahead logging (WAL mode) in SQLite
- Atomic transactions for all multi-step operations
- Graceful recovery from corruption

### Security Considerations
- API credentials stored in preferences table (not encrypted)
- Session tokens in SecureStore but preferences in plaintext SQLite
- Consider encrypting sensitive preferences
- Implement certificate pinning for API calls

### Scalability Concerns
- Single-threaded SQLite writes will bottleneck at scale
- Consider moving expensive operations to background threads
- Implement pagination for large lists instead of loading all beers

### Documentation Gaps
- No architectural documentation beyond CLAUDE.md
- API response structures not formally documented
- No developer onboarding guide
- Consider:
  - Adding JSDoc comments to all public functions
  - Creating architecture decision records (ADRs)
  - Documenting API contracts

### Future Feature Considerations
When adding features, prioritize:
1. Fixing the architectural issues above first
2. Adding comprehensive tests for new code
3. Following the extracted component patterns
4. Ensuring both visitor and member modes are supported
5. Maintaining offline-first principles

---

## Summary of Recommended Actions

**Testing Strategy**:
All refactoring work now includes automated test creation as part of the plan. Each refactoring step follows a Test-Driven Development (TDD) approach:
1. Write tests for current implementation (establish baseline)
2. Write tests for desired behavior
3. Implement refactoring
4. Verify all tests pass
5. Perform manual testing of affected functionality

This approach ensures:
- No regressions during refactoring
- High test coverage (target: 80%+ overall, 90%+ for critical paths)
- Confidence in future changes
- Living documentation of expected behavior

**Immediate Next Steps (High Priority)**:
1. ~~Split database module into smaller files (HP-1)~~ - **✅ COMPLETE** (Step 7 cleanup for CI-1 done)
2. **Fix CI-4 IMMEDIATELY** - **Estimated: 1 hour** ⚠️ CRITICAL
   - Replace `manualRefreshAllData()` implementation to call `sequentialRefreshAllData()`
   - Fix `refreshAllDataFromAPI()` or deprecate it (CI-5)
   - Manual test refresh in all tabs
   - Verify no lock contention in logs
   - Measure 3x performance improvement
3. **Complete HP-2: Race Conditions** - **Estimated: 2 hours remaining**
   - ✅ Steps 1-8: All complete (DatabaseLockManager, state machine, sequential refresh, metrics)
   - ⚠️ Step 5c: Implementation done, just needs integration (CI-4)
   - Optional: Refactor polling loop in setupDatabase (CI-6) - 2 hours
4. Extract shared beer component code (HP-3) - **Estimated: 2 weeks** (start after HP-2 truly complete)
4. Secure HTML parsing and add error handling (HP-4, HP-5) - **Estimated: 2 weeks**
5. Add database lifecycle management (HP-6) - **Estimated: 1 week** (new from code review CI-3)
6. Deprecate and remove db.ts compatibility layer (HP-7) - **Estimated: 1 week** (medium-low priority, post-HP-6)

**Short Term (Medium Priority, 2-3 months)**:
1. Refactor settings screen (MP-1) - **Estimated: 1.5 weeks**
2. Add type safety to database (MP-2) - **Estimated: 2 weeks** (includes Step 5 for RI-2 repository type safety)
3. Implement performance optimizations (MP-3) - **Estimated: 1 week**
4. Create AppContext for state (MP-4) - **Estimated: 1.5 weeks**
5. Build comprehensive integration test suite (MP-5) - **Estimated: 2 weeks**
6. Eliminate hardcoded values (MP-6) - **Estimated: 1 week**
7. Improve offline UX (MP-7) - **Estimated: 1.5 weeks**

**Long Term (3-6 months)**:
1. Address all low priority items (LP-1 through LP-9) - **Estimated: 3-4 weeks** (includes LP-9 for RI-5 batch optimization)
2. Implement future considerations (migrations, analytics, documentation)
3. Set up CI/CD with automated test runs
4. Add E2E testing framework (Detox/Maestro)

**Estimated Total Refactoring Effort**: 14-16 weeks for all high and medium priority issues (including automated testing)
- HP-2 extended from 2.5 weeks to 3.5 weeks due to additional steps identified in code review

**Code Review Findings Incorporated**:
The plan now includes all critical issues (CI-1 through CI-6) and recommended improvements (RI-1, RI-2, RI-5, RI-6, RI-7) from the comprehensive code review:
- **CI-1**: Duplicate code in db.ts → HP-1 Step 7 ✅ COMPLETE
- **CI-2**: Lock contention in parallel refresh → HP-2 Steps 5a-5c ❌ NOT RESOLVED (waiting on CI-4)
- **CI-3**: Missing database lifecycle → New HP-6 ❌ NOT STARTED
- **CI-4**: Sequential refresh not integrated → HP-2 Step 5c ❌ CRITICAL (1 hour fix)
- **CI-5**: refreshAllDataFromAPI uses parallel pattern → HP-2 cleanup ❌ HIGH (30 min fix)
- **CI-6**: Polling loop in setupDatabase → HP-2 enhancement ✅ COMPLETE (event-based waiting)
- **RI-1**: Lock timeout too long → HP-2 Step 4 ✅ COMPLETE (15s)
- **RI-2**: Type safety gaps in repositories → Added to MP-2 Step 5
- **RI-5**: Batch sizes not optimized → New LP-9
- **RI-6**: Lock performance monitoring → HP-2 enhancement (optional)
- **RI-7**: Lock contention dev alerts → HP-2 enhancement (optional)

**Test Coverage Goals**:
- **Week 4**: 50% code coverage
- **Week 8**: 70% code coverage
- **Week 12**: 80% code coverage
- **Week 14**: 90% coverage for critical paths (auth, data sync, database operations)

**Risk Mitigation**:
By writing tests before and during refactoring, we significantly reduce the risk of:
- Breaking existing functionality
- Introducing new bugs
- Regression in edge cases
- Production incidents

The codebase is functional but requires significant investment to be maintainable long-term. The good news is that the issues are well-understood and have clear remediation paths with comprehensive testing built in. Prioritizing the high-priority architectural issues with proper test coverage will provide the foundation for sustainable development.
