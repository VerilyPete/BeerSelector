# Dead Code & Test Cleanup Plan

> **Created**: 2026-02-27
> **Status**: Completed (Phases 1-10)
> **Scope**: Remove dead files, dead exports, dead tests; fix test anti-patterns; fill coverage gaps

## Principles

- Each phase is a single commit that leaves the codebase in a working state
- Run `npm run test:ci` after each phase to confirm nothing breaks
- Delete dead tests alongside their dead production code
- Phases 1-7: Removal only — do not refactor or improve surviving code
- Phases 8-9: Test improvements — no production code changes

---

## Phase 1: Remove Dead Expo Boilerplate Files

**Status: COMPLETED**

**Risk: None** — These are stock Expo template files never wired into the app.

Delete files:
- `components/HelloWave.tsx`
- `components/ParallaxScrollView.tsx`
- `components/Collapsible.tsx`
- `components/ExternalLink.tsx`

Delete associated tests (if any exist in `components/__tests__/`).

---

## Phase 2: Remove Dead UI Components

**Status: COMPLETED**

**Risk: Low** — Confirmed no production imports.

Delete files:
- `components/LoadingIndicator.tsx`
- `components/icons/GlassIcon.tsx`
- `components/layout/ResponsiveLayout.tsx`
- `components/layout/index.ts`

Delete associated tests (if any).

**Note**: `GlassType` in `src/utils/beerGlassType.ts` is still used by `migrateToV3.ts` (a live migration path). Do not remove it.

---

## Phase 3: Remove Dead Theme/Styling System

**Status: COMPLETED**

**Risk: Low** — App uses `@react-navigation` ThemeProvider, not this custom Restyle-based one.

Delete files:
- `context/ThemeContext.tsx`
- `constants/theme.ts`
- `constants/typography.ts`

Delete associated tests (if any).

Check if `@shopify/restyle` is still needed after removal — if nothing else imports it, remove from `package.json` dependencies.

Update `constants/index.ts` barrel export: remove `typography` and `TypographyKey` re-exports, and any re-exports from `theme.ts`.

---

## Phase 4: Remove Dead API Service Code

**Status: COMPLETED**

### 4a: Remove `sessionService.ts`

**Risk: Low** — Production `refreshSession` in AppContext is a different function entirely.

Delete files:
- `src/api/sessionService.ts`
- `src/api/__tests__/sessionService.test.ts`

### 4b: Remove dead exports from `beerService.ts`

**Risk: Low** — Only `checkInBeer` is used in production.

Remove exports from `src/api/beerService.ts`:
- `getBeerDetails`
- `searchBeers`
- `getAllBeers`
- `getMyBeers`

Remove corresponding tests from `src/api/__tests__/beerService.test.ts`.

### 4c: Remove dead export from `validators.ts`

Remove from `src/api/validators.ts`:
- `validateRewardsResponse` (not called in production — see note below)

**Note**: `validateBeer` is NOT dead — it is called internally by `validateBeerArray`, which is used in `dataUpdateService.ts`. Do not remove it. Remove only its dedicated test block if it has one, since `validateBeerArray` tests already exercise `validateBeer` transitively.

Remove corresponding tests for `validateRewardsResponse`.

---

## Phase 5: Remove Dead Database Code

**Status: COMPLETED** (split across two worktrees: Phases 4-5b in one, Phases 5c-5f with Phases 6-7 in another)

### 5a: Remove `dataValidation.ts`

**Risk: Low** — Entire module is test-only; production uses Zod schemas from `schemaTypes.ts`.

Delete files:
- `src/database/dataValidation.ts`
- `src/database/__tests__/dataValidation.test.ts`
- `src/database/__tests__/dataValidation.security.test.ts`

### 5b: Remove dead exports from `transactions.ts`

Remove from `src/database/transactions.ts`:
- `withBatchInsert`
- `withReplaceData`

Remove corresponding tests from `src/database/__tests__/transactions.test.ts`.

### 5c: Remove dead exports from `schema.ts`

Remove from `src/database/schema.ts`:
- `CREATE_ALL_BEERS_TABLE` (alias export)
- `CREATE_MY_BEERS_TABLE` (alias export)
- `DEFAULT_PREFERENCES` (make non-exported — only used internally)

### 5d: Remove dead exports from `schemaTypes.ts`

Remove from `src/database/schemaTypes.ts`:
- `schemas` convenience object
- `typeGuards` convenience object
- `converters` convenience object
- `DatabaseRow` union type

Remove corresponding tests if any.

### 5e: Remove dead export from `db.ts`

Remove export keyword from `initDatabase` in `src/database/db.ts` (keep function, just don't export it).

Also update `src/database/__tests__/schema.test.ts` to remove its `initDatabase` import and any test cases that call it directly, since they will no longer be able to import it.

### 5f: Remove dead export from `glassTypeCalculator.ts`

Remove from `src/database/utils/glassTypeCalculator.ts`:
- `calculateContainerType` (singular — the plural version is the one used in production)

Remove corresponding tests from `src/database/utils/__tests__/glassTypeCalculator.test.ts`.

---

## Phase 6: Remove Dead Type Exports

**Status: COMPLETED**

### 6a: Clean up `src/types/beer.ts`

Remove:
- `BeerDetails` type
- `isBeerDetails` type guard
- `isBeerWithContainerType` type guard
- `isBeerfinderWithContainerType` type guard
- `isBeerfinder` type guard
- `isCheckInResponse` type guard

Remove corresponding tests from type guard test files.

Update `src/database/types.ts`: remove `isBeerfinder` re-export and any other re-exports of deleted items.

### 6b: Clean up `src/types/api.ts`

Remove:
- `isApiResponse` type guard
- `isLoginResult` type guard

Remove corresponding tests.

### 6c: Clean up `src/types/liveActivity.ts`

Remove:
- `LiveActivitySupportResult`
- `LiveActivityStartData`
- `ActivityStateCallback`
- `ActivityState`

Check if removing these causes any compile errors in the live activity module before committing.

---

## Phase 7: Remove Duplicate and Scaffolding Test Files

**Status: COMPLETED**

**Risk: None** — These are redundant or leftover scaffolding.

Delete files:
- `src/__tests__/utils/mockServer.example.test.ts` — overlapping examples already covered by `mockServer.test.ts`
- `src/__tests__/utils/mockServerExample.test.ts` — same; also has `console.log` pollution
- `src/types/__tests__/simple-types.test.ts` — strict subset of `typeGuards.test.ts` and `beer-types.test.ts`

### Summary

Phases 1-7 merged to main on 2026-02-27. 16 commits, ~4,884 lines of dead code and dead tests removed. All 57 test suites pass (1,583 tests).

---

## Phase 8: Fix Test Anti-Patterns in Surviving Tests

**Status: COMPLETED** (8d/8e absorbed into 8a; 8f mostly resolved with 2 legitimate skips remaining)

**Risk: Low** — Improving test quality without changing production code.

Each sub-step is a separate commit. Run `npm run test:ci` after each.

### 8a: Replace `let`/`beforeEach` with factory functions

Affected files:
- `src/database/__tests__/transactions.test.ts` — `let mockDatabase: any` + `beforeEach`
- `src/database/repositories/__tests__/type-safety.test.ts` — `let repository` + `beforeEach`
- `components/beer/__tests__/BeerItem.test.tsx` — `beforeEach` clearing mocks
- `components/beer/__tests__/BeerList.test.tsx` — `beforeEach` clearing mocks
- `components/beer/__tests__/FilterBar.test.tsx` — `beforeEach` clearing mocks

Pattern: Extract `createMock*()` factory functions that return fresh instances per test.

### 8b: Remove `any` types from test files

Affected files:
- `src/database/__tests__/transactions.test.ts` — `let mockDatabase: any`, `callback: any`, `db: any` throughout
- `src/api/__tests__/validators.test.ts` — `as any` casts for boundary tests

Replace `any` with `unknown` and proper type narrowing, or typed mock interfaces.

### 8c: Replace vacuous `expect(true).toBe(true)` assertions

Affected files:
- `src/database/repositories/__tests__/type-inference.test.ts` — 9 instances
- `src/database/repositories/__tests__/type-safety.test.ts` — 2 instances

These are compile-time type checks masquerading as runtime tests. Options:
1. Convert to `// @ts-expect-error` annotations that fail at compile time if types change
2. Replace with a meaningful runtime assertion on the return value
3. If the test provides no value beyond what `tsc --noEmit` already catches, delete it

### 8d: Remove "does not crash" tautological tests from `BeerList.test.tsx`

Tests that only assert `expect(() => render(...)).not.toThrow()` provide zero behavioral verification. Either:
- Replace with assertions about what the component actually renders
- Delete if the scenario is already covered by other tests

### 8e: Replace hardcoded hex color assertions in `FilterBar.test.tsx`

Lines 107-127 and 279-290 assert specific hex values (`#0a7ea4`, `#FFFFFF`). Replace with behavior-oriented checks (e.g., active/inactive state changes style, without asserting the exact color value).

### 8f: Resolve skipped tests

Affected files:
- `src/api/__tests__/beerService.test.ts` — 4 of 7 tests are `it.skip`. Since the dead exports are being removed in Phase 4b, most skipped tests go away. Evaluate whether the remaining `checkInBeer` tests need fixing or deletion.
- `src/services/__tests__/liveActivityService.test.ts` — 6 skipped debounce tests. Fix or delete.
- `src/services/__tests__/dataRefresh.integration.test.ts` — 1 skipped parallel refresh test. Fix or delete.
- `src/__tests__/utils/mockServer.example.test.ts` — already deleted in Phase 7.

---

## Phase 9: Fill Coverage Gaps

**Status: COMPLETED**

**Risk: Low** — Adding new tests for existing production code. TDD in reverse (code exists, tests don't).

### 9a: Add tests for `OptimisticUpdateRepository`

File: `src/database/repositories/OptimisticUpdateRepository.ts`

Only repository without tests. Add tests covering its public API following the pattern of existing repository tests.

### 9b: Add tests for `notificationUtils.ts`

File: `src/utils/notificationUtils.ts`

No test file exists. Add tests covering its exported functions.

### 9c: Fix or cover `liveActivityService` debouncing

File: `src/services/__tests__/liveActivityService.test.ts`

The 6 skipped debounce tests suggest this behavior path is untested. Either unskip and fix, or write new tests from scratch if the skipped tests are unsalvageable.

---

## Phase 10: Final Verification and Documentation

**Status: COMPLETED**

- Run full test suite: `npm run test:ci`
- Run TypeScript compiler: `npx tsc --noEmit`
- Run linter: `npm run lint`
- Update `CLAUDE.md` if any documented files/patterns were removed
- Update `.claude/key-files.md` if any listed files were removed
- Remove any stale barrel exports in `index.ts` files

### Final Summary

- Removed stale reference to `GlassIcon.tsx` from `UI.md` (file deleted in Phase 2)
- All barrel files (`constants/index.ts`, `src/types/index.ts`, `src/database/types.ts`) are clean
- `CLAUDE.md` and `.claude/key-files.md` had no stale references requiring removal
- **Final test count**: 59 suites, 1671 tests, 1669 passing

---

## Out of Scope

These items were flagged but are NOT part of this cleanup:

- **`app/(tabs)/mybeers.tsx`** — Marked "deprecated/unused" in CLAUDE.md but actually serves as the Beerfinder tab. Needs a rename, not deletion. Separate task.
- **`src/api/mockSession.ts`** — Contains hardcoded credentials. Live code (used by DeveloperSection). Security concern, not dead code. Separate task.
- **Migration files** (`migrateToV4.ts`–`migrateToV7.ts`) — Dynamically imported. Not dead.
- **Consolidating `dataValidation.ts` into Zod schemas** — We're deleting the dead module, not migrating it. The Zod schemas in `schemaTypes.ts` already exist.
