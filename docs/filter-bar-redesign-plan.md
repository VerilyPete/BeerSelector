# Filter Bar Redesign Plan

## Overview

Redesign the FilterBar and useBeerFilters system to replace Heavies/IPA filters with a tri-state Draft/Cans container filter, add ABV sorting, and add a sort-direction toggle button.

**Intentional product decision**: The Heavies and IPA style-based filters are being removed entirely across all tabs (All Beers, Beerfinder, and Tasted Beers). They are replaced by the container-based filter (All/Draft/Cans). This is a deliberate scope change, not an oversight.

## Files to Modify

| File                                                  | Changes                                                      |
| ----------------------------------------------------- | ------------------------------------------------------------ |
| `hooks/useBeerFilters.ts`                             | New types, filter logic, sort logic                          |
| `components/beer/FilterBar.tsx`                       | New UI: tri-state draft button, 3-way sort, direction toggle |
| `components/AllBeers.tsx`                             | Update props passed to FilterBar                             |
| `components/Beerfinder.tsx`                           | Update props passed to FilterBar                             |
| `components/TastedBrewList.tsx`                       | Update props passed to FilterBar                             |
| `hooks/__tests__/useBeerFilters.test.ts`              | Rewrite filter/sort tests                                    |
| `hooks/__tests__/useBeerFilters.optimization.test.ts` | Update imports/calls for new signatures                      |
| `components/ui/IconSymbol.tsx`                        | Add MaterialIcons mappings for new SF Symbols                |
| `components/beer/__tests__/FilterBar.test.tsx`        | Rewrite UI tests                                             |

## Execution Order (TDD)

This plan follows test-driven development. Per the project's testing architecture (see TESTING.md):

- **Jest**: Pure functions only (filter logic, sort logic, cycling helpers)
- **Maestro**: Integration and E2E tests (hook state transitions, UI interactions, full tab flows)
- **Never** use `renderHook()` with React Native hooks in Jest — they hang

For each phase: write failing tests first, then implement just enough code to make them pass.

### Phase 1a: Write failing Jest tests for pure filter/sort/cycling logic

1. **`hooks/__tests__/useBeerFilters.test.ts`** — Rewrite tests for new signatures:
   - Remove all Heavies/IPA filter tests.
   - Write failing tests for `applyFilters` with new `FilterOptions` shape:
     - `containerFilter: 'all'` returns all beers
     - `containerFilter: 'draft'` matches "draft"/"draught" (case-insensitive)
     - `containerFilter: 'cans'` matches "bottle"/"can" (case-insensitive)
     - Combined container filter + search text
   - Write failing tests for `applySorting` with new `direction` parameter:
     - Name sort ascending (A-Z) and descending (Z-A)
     - Date sort descending (newest first) and ascending (oldest first) — test **both** `added_date` and `tasted_date` paths
     - ABV sort ascending (lowest first) and descending (highest first)
     - ABV with `null` values sort to end regardless of direction
     - ABV with `undefined` values (field absent) sort to end regardless of direction _(Added by Brony)_
   - Update all existing `applySorting` calls to include the new `direction` parameter _(Added by Brony)_
   - Write failing tests for pure cycling helpers:
     - `nextContainerFilter`: `'all'` -> `'draft'` -> `'cans'` -> `'all'` _(Added by Brony)_
     - `nextSortOption`: `'date'` -> `'name'` -> `'abv'` -> `'date'` _(Added by Brony)_
     - `defaultDirectionForSort`: returns `'desc'` for date, `'asc'` for name, `'asc'` for ABV

### Phase 1b: Write failing Jest tests for FilterBar UI + optimization test cleanup

2. **`hooks/__tests__/useBeerFilters.optimization.test.ts`** — Update for new signatures:
   - Update `applyFilters` calls to use `containerFilter` instead of `isDraft`/`isHeavies`/`isIpa`
   - Update `applySorting` calls to include the `direction` parameter
   - **Delete the entire "Integration with useBeerFilters Hook" and "Regression Prevention" describe blocks** — these use `renderHook`/`act` which will hang _(Added by Brony)_

3. **`components/beer/__tests__/FilterBar.test.tsx`** — Rewrite UI tests:
   - Remove Heavies/IPA rendering and toggle tests
   - Write failing tests for container filter button rendering and `onCycleContainerFilter` callback
   - Write failing tests for sort button showing current state ("Date", "Name", "ABV") and `onCycleSort` callback
   - Write failing tests for sort direction button with `arrow.up`/`arrow.down` and `onToggleSortDirection` callback
   - Write failing tests for label display in all states

### Phase 2: Implement pure functions to pass tests

4. **`hooks/useBeerFilters.ts`** — Types and pure functions only:
   - Add new types (`SortOption`, `SortDirection`, `ContainerFilter`, `FilterState`, `FilterOptions`)
   - Export pure helpers: `nextContainerFilter`, `nextSortOption`, `defaultDirectionForSort`
   - Rewrite `applyFilters` with `containerFilter` logic
   - Rewrite `applySorting` with `direction` parameter and ABV branch
   - Run tests — all Phase 1 tests should now pass

### Phase 3: Implement UI component to pass FilterBar tests

5. **`components/ui/IconSymbol.tsx`** — Add MaterialIcons mappings (prerequisite for FilterBar)
6. **`components/beer/FilterBar.tsx`** — Rewrite with new props and three-button layout
   - Run FilterBar tests — all Phase 1 FilterBar tests should now pass

### Phase 4: Implement hook state management and wire up consumers

7. **`hooks/useBeerFilters.ts`** — Add hook state and callbacks (uses the pure functions from Phase 2)
8. **`components/AllBeers.tsx`**, **`components/Beerfinder.tsx`**, **`components/TastedBrewList.tsx`** — Update consumer destructuring and FilterBar props
   - Run full test suite — all tests pass

### Phase 5: Integration verification (Maestro / manual)

9. Manual test or Maestro E2E to verify hook state transitions, cycling behavior, and full tab flows (these cannot be tested in Jest)

---

## Detailed Specifications

### 1. `hooks/useBeerFilters.ts`

**Types — replace:**

```typescript
type SortOption = 'date' | 'name' | 'abv';
type SortDirection = 'asc' | 'desc';
type ContainerFilter = 'all' | 'draft' | 'cans';

type FilterState = {
  containerFilter: ContainerFilter;
};
```

**`FilterOptions` type — replace:**

```typescript
type FilterOptions = {
  containerFilter: ContainerFilter;
  searchText: string;
};
```

**`applyFilters` — rewrite filter body:**

- Remove `isDraft`, `isHeavies`, `isIpa` logic entirely.
- Add `containerFilter` logic:
  - `'all'`: no container filtering (pass through).
  - `'draft'`: keep beers where `brew_container` includes "draft" or "draught" (case-insensitive) — same as current draft logic.
  - `'cans'`: keep beers where `brew_container` includes "bottle" or "can" (case-insensitive). Note: match `"bottle"` not `"bottled"` — real data uses `"Bottle"` (singular), and `"bottled".includes("bottle")` is true so both forms are caught.
- Update early-exit optimization: `if (!searchText && containerFilter === 'all') return beers;`
- Search text filtering stays unchanged.

**`applySorting` — add ABV branch and direction parameter:**

- New signature: `applySorting(beers, sortBy, direction, dateField)`. Preserve existing `dateField: DateSortField` parameter (TastedBrewList passes `'tasted_date'`).
- Keep existing `'name'` and `'date'` branches. **Both** date sort paths (`tasted_date` MM/DD/YYYY parsing and `added_date` timestamp parsing) must apply the `direction` parameter — do not leave either path hardcoded.
- Add `'abv'` branch: sort by `beer.abv` numerically. Use defensive `Number()` parsing in case of string values at runtime. Beers with null/undefined/NaN ABV sort to the end.
- Accept a `direction: SortDirection` parameter. Apply it by reversing comparison when direction differs from the sort type's natural default.
- Each sort type has a natural default direction:
  - `'date'`: defaults to `'desc'` (most recent first)
  - `'name'`: defaults to `'asc'` (A-Z)
  - `'abv'`: defaults to `'asc'` (lowest first)

**`useBeerFilters` hook — update state and callbacks:**

- State: `containerFilter` (default `'all'`), `sortBy` (default `'date'`), `sortDirection` (default `'desc'`).
- `cycleContainerFilter()`: `'all'` -> `'draft'` -> `'cans'` -> `'all'` (round-robin). Wrap in `useCallback`. Extract the cycling logic into a pure helper function (e.g., `nextContainerFilter(current: ContainerFilter): ContainerFilter`) so it can be unit tested in Jest without `renderHook`. _(Added by Brony)_
- `cycleSort()`: `'date'` -> `'name'` -> `'abv'` -> `'date'` (round-robin). Extract cycling logic into a pure helper (e.g., `nextSortOption(current: SortOption): SortOption`) for the same reason. _(Added by Brony)_ When cycling, auto-set `sortDirection` to the new sort type's natural default (`'desc'` for date, `'asc'` for name, `'asc'` for ABV). React 18+/19 automatically batches multiple `setState` calls within the same synchronous event handler into a single re-render, so calling `setSortBy` and `setSortDirection` in the same callback is safe and idiomatic. Wrap in `useCallback`.
- `toggleSortDirection()`: flip between `'asc'` and `'desc'`. Wrap in `useCallback`.
- Remove `toggleFilter` and the old `toggleSort`.
- Update the `expandedId` reset `useEffect` dependencies from `[filters, searchText]` to `[containerFilter, searchText]`.
- Update `useMemo` dependencies for `filteredBeers` to `[beers, containerFilter, searchText, sortBy, sortDirection, dateField]`.
- Export `SortOption`, `SortDirection`, and `ContainerFilter` types from this file. Import them in `FilterBar.tsx` instead of duplicating type definitions.
- Remove the old `filters` object from the hook return entirely — it is replaced by `containerFilter`. Do not leave it as dead code. _(Added by Brony)_
- Return all values from the hook. New returns: `containerFilter`, `sortDirection`, `cycleContainerFilter`, `cycleSort`, `toggleSortDirection`. Unchanged returns that must be preserved: `filteredBeers`, `sortBy`, `searchText`, `expandedId`, `setSearchText`, `toggleExpand`, `setExpandedId`.

### 2. `components/beer/FilterBar.tsx`

**Props — replace:**

```typescript
type FilterBarProps = {
  containerFilter: ContainerFilter;
  sortBy: SortOption;
  sortDirection: SortDirection;
  onCycleContainerFilter: () => void;
  onCycleSort: () => void;
  onToggleSortDirection: () => void;
};
```

Remove `showHeaviesAndIpa` prop (no longer needed).

**UI — three buttons in the ScrollView:**

1. **Container filter button** — uses existing `FilterChip` style.
   - Label shows current state: "All", "Draft", or "Cans".
   - Active styling when state is `'draft'` or `'cans'` (i.e., any non-`'all'` state).
   - Pressing cycles through states.
   - Accessibility: `accessibilityLabel` describes current state and next action (e.g., "Container filter, showing All. Double tap to show Draft only.").

2. **Sort button** — uses existing sort button style (secondary/elevated look).
   - **Intentional UX change**: label now shows the _current_ sort state ("Date", "Name", or "ABV") instead of the old behavior of showing the next option. This is clearer for a 3-way cycle.
   - Icon: `calendar` for date, `textformat` for name, `percent` for ABV.
   - Pressing cycles through sort options.
   - Accessibility: `accessibilityLabel` describes current sort and next action (e.g., "Sort by Date. Double tap to sort by Name.").

3. **Sort direction button** — new, same sort button style (secondary/elevated).
   - Icon only, no text label:
     - Ascending (`'asc'`): SF Symbol `arrow.up`.
     - Descending (`'desc'`): SF Symbol `arrow.down`.
   - Same height and border-radius as other buttons.
   - Pressing toggles direction. Trigger `Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)` on press to match the existing filter chips and sort button.
   - Accessibility: `accessibilityLabel` describes current direction and toggle action (e.g., "Sort ascending. Double tap to sort descending.").

All buttons remain the same `CHIP_MIN_HEIGHT` (44px), pill-shaped. Filter button uses tint color when active. Sort buttons use `backgroundElevated` style as they do today.

### 3. Consumer components (`AllBeers.tsx`, `Beerfinder.tsx`, `TastedBrewList.tsx`)

Each component currently destructures from `useBeerFilters` and passes to `<FilterBar>`. Update each to:

- Destructure `containerFilter`, `sortBy`, `sortDirection`, `cycleContainerFilter`, `cycleSort`, `toggleSortDirection` instead of old `filters`, `toggleFilter`, `toggleSort`.
- Pass new props to `<FilterBar>`.
- Remove `showHeaviesAndIpa` prop from TastedBrewList's FilterBar usage.

## Implementation Notes

1. **IconSymbol platform fallback**: The non-iOS `IconSymbol.tsx` uses a hardcoded `MAPPING` object, and `IconSymbolName` is typed as `keyof typeof MAPPING`. Add the following MaterialIcons mappings to `IconSymbol.tsx` to avoid TypeScript errors:

   ```typescript
   'calendar': 'calendar-today',
   'textformat': 'sort-by-alpha',
   'percent': 'percent',
   'arrow.up': 'arrow-upward',
   'arrow.down': 'arrow-downward',
   ```

2. **ABV null handling in sort**: When implementing ABV sorting, check for null/undefined **before** calling `Number()`. `Number(null)` returns `0`, which would incorrectly sort null-ABV beers as 0% instead of to the end of the list. Correct order: guard for null/undefined/NaN first, push those to the end, then compare numerically.

## Verification

**After each TDD phase, run the relevant tests to confirm red-green progression:**

- Phase 1a (logic tests written): `npx jest hooks/__tests__/useBeerFilters.test.ts` — tests should **fail** (no implementation yet)
- Phase 1b (UI tests written): `npx jest components/beer/__tests__/FilterBar.test.tsx` — tests should **fail**
- Phase 2 (pure functions): `npx jest hooks/__tests__/useBeerFilters.test.ts` — tests should **pass**
- Phase 2 (pure functions): `npx jest hooks/__tests__/useBeerFilters.optimization.test.ts` — should **pass**
- Phase 3 (FilterBar UI): `npx jest components/beer/__tests__/FilterBar.test.tsx` — should **pass**
- Phase 4 (wiring): `npm run test:ci` — full suite should **pass** with no regressions

**Final integration verification (Phase 5):**

1. Manual test in simulator: open All Beers tab, verify container filter cycles through All/Draft/Cans, sort cycles through Date/Name/ABV, direction toggle flips order.
2. Verify default sort is Date descending (most recent first), cycling to Name resets to A-Z, cycling to ABV resets to lowest first.
3. Check Beerfinder and Tasted Beers tabs work identically.
4. Hook state transitions (cycling, direction reset on sort change) can only be verified via manual test or Maestro E2E — not Jest.
