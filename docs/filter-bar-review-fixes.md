# Filter Bar Review Fixes

Fixes for 7 issues found during code review of the filter bar redesign.

## Fixes

### Fix 1: `cycleSort` side effect in state updater (P2-1)

**File**: `hooks/useBeerFilters.ts`

Read `sortBy` from closure instead of nesting `setSortDirection` inside `setSortBy` updater. Replace:

```typescript
const cycleSort = useCallback(() => {
  setSortBy(prev => {
    const newSort = nextSortOption(prev);
    setSortDirection(defaultDirectionForSort(newSort));
    return newSort;
  });
}, []);
```

With:

```typescript
const cycleSort = useCallback(() => {
  const newSort = nextSortOption(sortBy);
  setSortBy(newSort);
  setSortDirection(defaultDirectionForSort(newSort));
}, [sortBy]);
```

### Fix 2: Import types instead of duplicating (P3-1)

**File**: `components/beer/FilterBar.tsx`

Remove local type definitions and the TODO comment. Import from the hook:

```typescript
import { ContainerFilter, SortOption, SortDirection } from '@/hooks/useBeerFilters';
```

### Fix 3: Add haptics to container filter and sort buttons (P3-2)

**File**: `components/beer/FilterBar.tsx`

Wrap `onCycleContainerFilter` and `onCycleSort` in handlers that call `Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)` before invoking the callback, matching the existing `handleDirectionPress` pattern.

### Fix 4: Use `backgroundElevated` theme color (P3-3)

**File**: `components/beer/FilterBar.tsx`

Change:

```typescript
const backgroundElevated = useThemeColor({}, 'background');
```

To:

```typescript
const backgroundElevated = useThemeColor({}, 'backgroundElevated');
```

Verified: `'backgroundElevated'` exists in `constants/Colors.ts` (light: `#FFFFFF`, dark: `#292524`).

### Fix 5: Accessibility labels with next action (P3-4)

**File**: `components/beer/FilterBar.tsx`

Update labels to describe current state and next action. Use inline lookup maps to determine the next state — do not import cycling helpers from the hook (keep FilterBar as a pure presentational component):

```typescript
const NEXT_CONTAINER: Record<ContainerFilter, string> = {
  all: 'Draft',
  draft: 'Cans',
  cans: 'All',
};
const NEXT_SORT: Record<SortOption, string> = { date: 'Name', name: 'ABV', abv: 'Date' };
```

Add a code comment above the maps noting they duplicate the cycling logic from `nextContainerFilter`/`nextSortOption` in `useBeerFilters.ts` and must stay in sync. _(Added by Brony)_

Label formats:

- Container: `"Container filter: ${current}. Double tap to show ${next}."`
- Sort: `"Sort by ${current}. Double tap to sort by ${next}."`
- Direction: `"Sort ${currentDirection}. Double tap to sort ${oppositeDirection}."`

### Fix 6: Add haptics test (P3-5)

**File**: `components/beer/__tests__/FilterBar.test.tsx`

Add tests asserting `Haptics.impactAsync` is called with `Haptics.ImpactFeedbackStyle.Light` when each of the three buttons is pressed.

### Fix 7: Add accessibility label tests (P3-6)

**File**: `components/beer/__tests__/FilterBar.test.tsx`

Add tests asserting `accessibilityLabel` prop values on each button for representative states.

## Execution Order (TDD)

### Step 1: Write failing tests for fixes 6 and 7 + update test mock

Update `components/beer/__tests__/FilterBar.test.tsx`:

- Add `backgroundElevated: '#FFFFFF'` to the `useThemeColor` mock (currently only has `background`). Without this, Fix 4's `backgroundElevated` theme key will return fallback `'#000000'` in tests.
- Add haptics assertions (Fix 6).
- Add accessibility label assertions (Fix 7).
- Add test asserting sort buttons use the `backgroundElevated` color, so Fix 4 has actual test coverage. _(Added by Brony)_
  These tests will fail against the current FilterBar.

### Step 2: Apply fixes 1–5 (implementation)

All five fixes are independent and can be applied in a single pass:

- Fix 1: `hooks/useBeerFilters.ts`
- Fixes 2–5: `components/beer/FilterBar.tsx` (check `constants/Colors.ts` for correct theme key)

### Step 3: Run tests

- `npx jest components/beer/__tests__/FilterBar.test.tsx` — all tests pass including new haptics/a11y tests
- `npx jest hooks/__tests__/useBeerFilters.test.ts` — still passes (Fix 1 doesn't change behavior)
- `npm run test:ci` — full suite, no regressions
