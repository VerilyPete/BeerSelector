# Data Refresh Improvement Plan

This plan outlines how to ensure fresh data on app launch and working pull-to-refresh, without including rewards in the unified pull-to-refresh flow.

1. Add automatic refresh on launch
   - In `RootLayout` (app/_layout.tsx), after database setup and before navigating to `(tabs)`, invoke:
     ```ts
     import { manualRefreshAllData, fetchAndUpdateRewards } from '@/src/services/dataUpdateService';

     // inside prepare() in useEffect:
     await manualRefreshAllData();
     await fetchAndUpdateRewards();
     ```
   - Ensure any errors are caught/logged but do not block navigation.

2. Fix existing pull-to-refresh behavior
   - In screens with pull-to-refresh (`Beerfinder.tsx`, `AllBeers.tsx`, `TastedBrewList.tsx`), verify their `RefreshControl` is wired correctly:
     ```tsx
     <FlatList
       data={...}
       refreshing={refreshing}
       onRefresh={async () => {
         setRefreshing(true);
         const result = await manualRefreshAllData();
         setRefreshing(false);
         if (result.hasErrors) { /* show Alert */ }
         reloadLocalData();
       }}
       ...
     />
     ```
   - Confirm `manualRefreshAllData` covers both `fetchAndUpdateAllBeers` and `fetchAndUpdateMyBeers`.

3. Extend unified refresh to cover core endpoints only
   - Update `manualRefreshAllData` in `dataUpdateService.ts` so it calls:
     ```ts
     const allBeersResult = await fetchAndUpdateAllBeers();
     const myBeersResult = await fetchAndUpdateMyBeers();
     return { allBeersResult, myBeersResult, hasErrors, allNetworkErrors };
     ```
   - Omit rewards from this unified function.

4. Display UI feedback and handle errors
   - During both launch and pull refresh, show activity indicators.
   - Consolidate network errors into a single message; otherwise, present per-endpoint errors via `Alert.alert`.

5. Add unit tests for `dataUpdateService`
   - Mock `fetchAndUpdateAllBeers` and `fetchAndUpdateMyBeers`.
   - Verify `manualRefreshAllData` calls both, aggregates `hasErrors` and `allNetworkErrors` correctly.

6. Add component tests for pull-to-refresh
   - Using React Native Testing Library, render each screen, mock `manualRefreshAllData`, simulate `onRefresh`, and assert:
     - The spinner appears while refreshing.
     - `manualRefreshAllData` is called once.
     - Local data reload function is invoked afterward.

7. Review and iterate
   - Test on physical iOS device or simulator to confirm pull-to-refresh and launch refresh work as expected.
