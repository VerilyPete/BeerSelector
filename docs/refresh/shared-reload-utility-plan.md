# Shared Reload Utility Implementation Plan

## Overview

The `Beerfinder.tsx` and `TastedBrewList.tsx` components both contain nearly identical `onDataReloaded` callbacks that reload data from the database into AppContext after a refresh operation completes. This plan outlines how to simplify these components by using the existing `refreshBeerData()` function from AppContext.

---

## Plan Review Feedback (Incorporated)

The original plan proposed creating a new utility file (`src/utils/contextReload.ts`). However, review feedback identified that **AppContext already provides `refreshBeerData()`** which accomplishes the same goal with several advantages:

| Aspect | Original Plan (New Utility) | Revised Plan (Use Existing) |
|--------|----------------------------|----------------------------|
| New code | ~130 lines + tests | 0 lines |
| State updates | 3 separate calls (3 re-renders) | 1 batched call (1 re-render) |
| Error handling | Manual | Built-in with logging |
| Complexity | New file, interfaces, tests | Zero - use existing function |

**Decision: Use the existing `refreshBeerData()` from AppContext.**

---

## Current State (To Be Replaced)

Both components currently use dynamic imports and manual setter calls inside the `onDataReloaded` callback:

**Beerfinder.tsx (lines 90-108):**
```typescript
const { refreshing, handleRefresh: baseHandleRefresh } = useDataRefresh({
  onDataReloaded: async () => {
    // Reload all data from database into AppContext
    const { beerRepository } = await import('@/src/database/repositories/BeerRepository');
    const { myBeersRepository } = await import('@/src/database/repositories/MyBeersRepository');
    const { rewardsRepository } = await import('@/src/database/repositories/RewardsRepository');

    const [allBeersData, tastedBeersData, rewardsData] = await Promise.all([
      beerRepository.getAll(),
      myBeersRepository.getAll(),
      rewardsRepository.getAll(),
    ]);

    setAllBeers(allBeersData);
    setTastedBeers(tastedBeersData);
    setRewards(rewardsData);
    console.log(`[Beerfinder] Reloaded: ${allBeersData.length} all beers, ${tastedBeersData.length} tasted beers`);
  },
  componentName: 'Beerfinder',
});
```

**TastedBrewList.tsx (lines 54-73):**
```typescript
const { refreshing, handleRefresh } = useDataRefresh({
  onDataReloaded: async () => {
    // Reload all data from database into AppContext
    const { beerRepository } = await import('@/src/database/repositories/BeerRepository');
    const { myBeersRepository } = await import('@/src/database/repositories/MyBeersRepository');
    const { rewardsRepository } = await import('@/src/database/repositories/RewardsRepository');

    const [allBeersData, tastedBeersData, rewardsData] = await Promise.all([
      beerRepository.getAll(),
      myBeersRepository.getAll(),
      rewardsRepository.getAll(),
    ]);

    setAllBeers(allBeersData);
    setTastedBeers(tastedBeersData);
    setRewards(rewardsData);
    console.log(`[TastedBrewList] Reloaded: ${tastedBeersData.length} tasted beers`);
  },
  componentName: 'TastedBrewList',
});
```

### Problems with Current Approach

1. **Dynamic imports inside callbacks**: Inconsistent with the rest of the codebase which uses static imports
2. **Code duplication**: Nearly identical logic in two components
3. **Multiple state updates**: 3 separate setter calls instead of 1 batched update
4. **Reinventing the wheel**: AppContext already has `refreshBeerData()` that does this

---

## The Existing Solution: `refreshBeerData()`

AppContext already provides `refreshBeerData()` which is purpose-built for this use case:

**From `context/AppContext.tsx` (lines 572-583):**
```typescript
const refreshBeerData = useCallback(async () => {
  try {
    setLoading(prev => ({ ...prev, isLoadingBeers: true }));
    await loadBeerDataFromDatabase();
    console.log('[AppContext] Refreshed beer data from database');
  } catch (error) {
    console.error('[AppContext] Error refreshing beer data:', error);
    setBeerError('Failed to refresh beer data from database');
  } finally {
    setLoading(prev => ({ ...prev, isLoadingBeers: false }));
  }
}, [loadBeerDataFromDatabase]);
```

**And the underlying `loadBeerDataFromDatabase()` (lines 433-454):**
```typescript
const loadBeerDataFromDatabase = useCallback(async () => {
  // Load all data in parallel for better performance
  const [allBeersData, tastedBeersData, rewardsData] = await Promise.all([
    beerRepository.getAll(),
    myBeersRepository.getAll(),
    rewardsRepository.getAll(),
  ]);

  // Update state with all data at once, preserving queuedBeerIds
  setBeers(prev => ({
    allBeers: allBeersData,
    tastedBeers: tastedBeersData,
    rewards: rewardsData,
    queuedBeerIds: prev.queuedBeerIds,
  }));

  console.log(
    `[AppContext] Loaded beer data: ${allBeersData.length} all beers, ${tastedBeersData.length} tasted beers, ${rewardsData.length} rewards`
  );

  return { allBeersData, tastedBeersData, rewardsData };
}, []);
```

### Advantages of `refreshBeerData()`

1. **Already exists** - No new code to write or maintain
2. **Batched state update** - Single `setBeers()` call = 1 re-render instead of 3
3. **Preserves queuedBeerIds** - Explicitly maintains the queued beer set
4. **Built-in error handling** - Sets error state and logs errors
5. **Loading state management** - Automatically manages `isLoadingBeers`
6. **Static imports** - Uses imports at module level, not dynamic imports
7. **Already tested** - Part of the existing AppContext test coverage

---

## Why NOT Include AllBeers.tsx

The `AllBeers.tsx` component is intentionally excluded from this refactor because:

1. **Visitor mode support**: AllBeers is the only tab available in visitor mode
2. **No tasted beers access**: Visitors cannot view tasted beers data
3. **No rewards access**: Visitors cannot view rewards data
4. **Different reload pattern**: AllBeers only reloads `allBeers`, not all three data sources

**Note:** The plan review also identified that AllBeers.tsx's manual beer name filtering is redundant since `BeerRepository.getAll()` already filters in SQL:
```sql
SELECT * FROM allbeers WHERE brew_name IS NOT NULL AND brew_name != "" ORDER BY added_date DESC
```

This is a separate cleanup opportunity but outside the scope of this plan.

---

## Files to be Modified

### 1. `/workspace/BeerSelector/components/Beerfinder.tsx`

- Remove `setAllBeers`, `setTastedBeers`, `setRewards` from `useAppContext()` destructuring
- Add `refreshBeerData` to `useAppContext()` destructuring
- Replace the inline `onDataReloaded` callback with `refreshBeerData`

### 2. `/workspace/BeerSelector/components/TastedBrewList.tsx`

- Remove `setAllBeers`, `setTastedBeers`, `setRewards` from `useAppContext()` destructuring
- Add `refreshBeerData` to `useAppContext()` destructuring
- Replace the inline `onDataReloaded` callback with `refreshBeerData`

---

## Implementation Details

### Step 1: Update Beerfinder.tsx

**Changes to `useAppContext()` destructuring:**

```diff
- const { beers, loading, errors, syncQueuedBeerIds, setAllBeers, setTastedBeers, setRewards } = useAppContext();
+ const { beers, loading, errors, syncQueuedBeerIds, refreshBeerData } = useAppContext();
```

**Changes to `useDataRefresh()` call:**

```diff
  // Use the shared data refresh hook
- // Reload data from database into AppContext after refresh completes
+ // Use AppContext's refreshBeerData to reload from database after refresh
  const { refreshing, handleRefresh: baseHandleRefresh } = useDataRefresh({
-   onDataReloaded: async () => {
-     // Reload all data from database into AppContext
-     const { beerRepository } = await import('@/src/database/repositories/BeerRepository');
-     const { myBeersRepository } = await import('@/src/database/repositories/MyBeersRepository');
-     const { rewardsRepository } = await import('@/src/database/repositories/RewardsRepository');
-
-     const [allBeersData, tastedBeersData, rewardsData] = await Promise.all([
-       beerRepository.getAll(),
-       myBeersRepository.getAll(),
-       rewardsRepository.getAll(),
-     ]);
-
-     setAllBeers(allBeersData);
-     setTastedBeers(tastedBeersData);
-     setRewards(rewardsData);
-     console.log(`[Beerfinder] Reloaded: ${allBeersData.length} all beers, ${tastedBeersData.length} tasted beers`);
-   },
+   onDataReloaded: refreshBeerData,
    componentName: 'Beerfinder',
  });
```

### Step 2: Update TastedBrewList.tsx

**Changes to `useAppContext()` destructuring:**

```diff
- const { beers, loading, errors, setTastedBeers, setAllBeers, setRewards } = useAppContext();
+ const { beers, loading, errors, refreshBeerData } = useAppContext();
```

**Changes to `useDataRefresh()` call:**

```diff
  // Use the shared data refresh hook
- // Reload data from database into AppContext after refresh completes
+ // Use AppContext's refreshBeerData to reload from database after refresh
  const { refreshing, handleRefresh } = useDataRefresh({
-   onDataReloaded: async () => {
-     // Reload all data from database into AppContext
-     const { beerRepository } = await import('@/src/database/repositories/BeerRepository');
-     const { myBeersRepository } = await import('@/src/database/repositories/MyBeersRepository');
-     const { rewardsRepository } = await import('@/src/database/repositories/RewardsRepository');
-
-     const [allBeersData, tastedBeersData, rewardsData] = await Promise.all([
-       beerRepository.getAll(),
-       myBeersRepository.getAll(),
-       rewardsRepository.getAll(),
-     ]);
-
-     setAllBeers(allBeersData);
-     setTastedBeers(tastedBeersData);
-     setRewards(rewardsData);
-     console.log(`[TastedBrewList] Reloaded: ${tastedBeersData.length} tasted beers`);
-   },
+   onDataReloaded: refreshBeerData,
    componentName: 'TastedBrewList',
  });
```

---

## Logging Behavior Change

The console log format will change slightly:

| Component | Before | After |
|-----------|--------|-------|
| Beerfinder | `[Beerfinder] Reloaded: X all beers, Y tasted beers` | `[AppContext] Loaded beer data: X all beers, Y tasted beers, Z rewards` |
| TastedBrewList | `[TastedBrewList] Reloaded: Y tasted beers` | `[AppContext] Loaded beer data: X all beers, Y tasted beers, Z rewards` |

This is acceptable because:
- The `[AppContext]` prefix is consistent and clear
- The log now includes all three counts (more informative)
- The `componentName` parameter in `useDataRefresh` still provides component context in other logs

---

## Testing Considerations

### No New Tests Required

Since we're using an existing, already-tested function (`refreshBeerData`), no new unit tests are needed.

### Existing Tests Should Pass

The existing component tests for Beerfinder and TastedBrewList should continue to pass since the behavior is functionally equivalent.

### Manual Testing Checklist

1. **Beerfinder tab**
   - [ ] Pull-to-refresh triggers data reload
   - [ ] All beers list updates with fresh data (including enrichment)
   - [ ] Tasted beers and rewards are also updated in context
   - [ ] Console shows `[AppContext] Loaded beer data: ...`

2. **Tasted Brews tab**
   - [ ] Pull-to-refresh triggers data reload
   - [ ] Tasted beers list updates with fresh data
   - [ ] All beers and rewards are also updated in context
   - [ ] Console shows `[AppContext] Loaded beer data: ...`

3. **Cross-tab consistency**
   - [ ] Refresh on Beerfinder, switch to Tasted Brews - data is current
   - [ ] Refresh on Tasted Brews, switch to Beerfinder - data is current

4. **Visitor mode (All Beers tab)**
   - [ ] Pull-to-refresh still works correctly
   - [ ] No errors related to tasted beers or rewards

---

## Implementation Order

1. Update `Beerfinder.tsx`:
   - Change `useAppContext()` destructuring
   - Replace `onDataReloaded` callback with `refreshBeerData`
2. Update `TastedBrewList.tsx`:
   - Change `useAppContext()` destructuring
   - Replace `onDataReloaded` callback with `refreshBeerData`
3. Run existing tests to verify no regressions
4. Manual testing of pull-to-refresh on both tabs

---

## Benefits of This Approach

1. **Zero new code**: Uses existing, tested infrastructure
2. **Better performance**: 1 batched state update instead of 3 separate calls
3. **Consistent with codebase**: Follows AppContext state management patterns
4. **Less maintenance**: No new utility file to maintain
5. **Built-in error handling**: Leverages AppContext's error state management
6. **Simpler components**: Callback becomes a single function reference

---

## Additional Cleanup: Remove Redundant Filtering in AllBeers.tsx

### Problem

`AllBeers.tsx` contains redundant JavaScript filtering that duplicates logic already present in the SQL query.

**The redundant filter appears in TWO places:**

**1. `loadBeers()` function (lines 58-72):**
```typescript
const loadBeers = useCallback(async () => {
  try {
    setLoadingBeers(true);
    const data = await beerRepository.getAll();
    // Filter out any beers with empty or null brew_name  <-- REDUNDANT
    const filteredData = data.filter(beer => beer.brew_name && beer.brew_name.trim() !== '');
    setAllBeers(filteredData);
    setBeerError(null);
  } catch (err) {
    console.error('Failed to load beers:', err);
    setBeerError('Failed to load beers. Please try again later.');
  } finally {
    setLoadingBeers(false);
  }
}, [setLoadingBeers, setAllBeers, setBeerError]);
```

**2. `onDataReloaded` callback (lines 75-85):**
```typescript
const { refreshing, handleRefresh } = useDataRefresh({
  onDataReloaded: async () => {
    const freshBeers = await beerRepository.getAll();
    const filteredData = freshBeers.filter(  // <-- REDUNDANT
      beer => beer.brew_name && beer.brew_name.trim() !== ''
    );
    setAllBeers(filteredData);
    setBeerError(null);
  },
  componentName: 'AllBeers',
});
```

### Why It's Redundant

`BeerRepository.getAll()` already filters in the SQL query:

**From `src/database/repositories/BeerRepository.ts` (line 149):**
```sql
SELECT * FROM allbeers WHERE brew_name IS NOT NULL AND brew_name != "" ORDER BY added_date DESC
```

The SQL `WHERE` clause ensures:
- `brew_name IS NOT NULL` - No null values
- `brew_name != ""` - No empty strings

The JavaScript filter `beer.brew_name && beer.brew_name.trim() !== ''` is checking the same conditions, plus trimming whitespace. However:
1. The SQL already excludes empty strings
2. Whitespace-only names are extremely unlikely in practice (data comes from Flying Saucer API)
3. If whitespace-only names were a real concern, the filtering should be in the repository, not the component

### Files to Modify

**`/workspace/BeerSelector/components/AllBeers.tsx`**

### Implementation Details

#### Change 1: Simplify `loadBeers()` function

```diff
  const loadBeers = useCallback(async () => {
    try {
      setLoadingBeers(true);
      const data = await beerRepository.getAll();
-     // Filter out any beers with empty or null brew_name
-     const filteredData = data.filter(beer => beer.brew_name && beer.brew_name.trim() !== '');
-     setAllBeers(filteredData);
+     setAllBeers(data);
      setBeerError(null);
    } catch (err) {
      console.error('Failed to load beers:', err);
      setBeerError('Failed to load beers. Please try again later.');
    } finally {
      setLoadingBeers(false);
    }
  }, [setLoadingBeers, setAllBeers, setBeerError]);
```

#### Change 2: Simplify `onDataReloaded` callback

```diff
  const { refreshing, handleRefresh } = useDataRefresh({
    onDataReloaded: async () => {
      const freshBeers = await beerRepository.getAll();
-     const filteredData = freshBeers.filter(
-       beer => beer.brew_name && beer.brew_name.trim() !== ''
-     );
-     setAllBeers(filteredData);
+     setAllBeers(freshBeers);
      setBeerError(null);
    },
    componentName: 'AllBeers',
  });
```

### Testing Considerations

1. **Add unit test to verify SQL filtering:**

   Create a test in `src/database/repositories/__tests__/BeerRepository.test.ts`:

   ```typescript
   describe('getAll filtering', () => {
     it('should not return beers with null or empty brew_name', async () => {
       // First, clear the table and insert test data including problematic entries
       await database.runAsync('DELETE FROM allbeers');

       // Insert a beer with empty brew_name (should be filtered out)
       await database.runAsync(
         `INSERT INTO allbeers (id, brew_name, brewer, brew_style) VALUES (?, ?, ?, ?)`,
         ['test-empty', '', 'Test Brewer', 'IPA']
       );

       // Insert a beer with valid brew_name (should be returned)
       await database.runAsync(
         `INSERT INTO allbeers (id, brew_name, brewer, brew_style) VALUES (?, ?, ?, ?)`,
         ['test-valid', 'Valid Beer', 'Test Brewer', 'IPA']
       );

       const beers = await beerRepository.getAll();

       // Should only return the valid beer
       expect(beers.length).toBe(1);
       expect(beers[0].id).toBe('test-valid');
       expect(beers.every(b => b.brew_name && b.brew_name.length > 0)).toBe(true);
     });
   });
   ```

2. **Manual testing:**
   - [ ] All Beers tab displays correctly after change
   - [ ] No beers with missing names appear in the list
   - [ ] Pull-to-refresh works correctly
   - [ ] Beer count matches before and after the change

3. **Edge case - whitespace-only names:**
   - Already handled by upstream validation in `dataValidation.ts` and `validators.ts`
   - Both reject `brew_name.trim() === ''` before data reaches the database
   - If this ever becomes a concern, add `TRIM(brew_name) != ""` to the SQL query in BeerRepository

### Benefits

1. **Removes ~8 lines of redundant code**
2. **Single source of truth** - Filtering logic lives in one place (repository SQL)
3. **Slightly better performance** - No unnecessary array iteration in JavaScript
4. **Clearer intent** - Component trusts the repository to return clean data

### Implementation Order

This cleanup can be done:
- **Option A:** As part of the main refactor (Steps 1-2, then this as Step 3)
- **Option B:** As a separate follow-up commit

Recommend **Option A** since we're already touching refresh-related code.

---

## Updated Implementation Order

1. Update `Beerfinder.tsx`:
   - Change `useAppContext()` destructuring
   - Replace `onDataReloaded` callback with `refreshBeerData`
2. Update `TastedBrewList.tsx`:
   - Change `useAppContext()` destructuring
   - Replace `onDataReloaded` callback with `refreshBeerData`
3. Update `AllBeers.tsx`:
   - Remove redundant filtering in `loadBeers()`
   - Remove redundant filtering in `onDataReloaded` callback
4. Run existing tests to verify no regressions
5. Manual testing of pull-to-refresh on all three tabs

---

## Summary

This refactor:
1. Removes ~40 lines of duplicated code across Beerfinder and TastedBrewList by using `refreshBeerData()`
2. Removes ~8 lines of redundant filtering in AllBeers by trusting the repository's SQL filtering

The result is cleaner, more maintainable code that leverages existing infrastructure and follows the principle of single source of truth for data filtering.
