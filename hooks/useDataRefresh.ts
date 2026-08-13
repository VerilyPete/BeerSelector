import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import { areApiUrlsConfigured } from '@/src/database/preferences';
import { manualRefreshAllData } from '@/src/services/dataUpdateService';
import { buildRefreshErrorMessages } from '@/src/utils/refreshErrorMessages';

/**
 * Parameters for the useDataRefresh hook
 */
export type UseDataRefreshParams = {
  /**
   * Callback to reload local data after a successful or partial refresh
   * This should fetch data from the local database and update component state
   *
   * Its resolved value is ignored — `Promise<unknown>` only so callers can pass
   * a function that happens to return something, such as the context's
   * `refreshBeerData`. What this hook reacts to is a REJECTION.
   */
  onDataReloaded: () => Promise<unknown>;

  /**
   * Optional name for logging purposes (e.g., 'AllBeers', 'Beerfinder')
   */
  componentName?: string;
};

/**
 * Return value of the useDataRefresh hook
 */
export type UseDataRefreshResult = {
  /**
   * Whether a refresh operation is currently in progress
   */
  refreshing: boolean;

  /**
   * Function to trigger a manual refresh of all data types
   * Handles API URL configuration check, network errors, and partial errors
   */
  handleRefresh: () => Promise<void>;
};

/**
 * Custom hook to handle manual data refresh for beer list components
 *
 * This hook encapsulates the entire refresh flow that was previously duplicated
 * across AllBeers, Beerfinder, and TastedBrewList components:
 *
 * 1. Checks if already refreshing (prevents duplicate requests)
 * 2. Validates API URLs are configured
 * 3. Calls manualRefreshAllData() from dataUpdateService
 * 4. Handles three error scenarios:
 *    - All network errors: Shows generic connection error
 *    - Partial errors: Shows detailed error messages per data type
 *    - Success: No alert shown
 * 5. Reloads local data from database (even on partial success)
 * 6. Updates component state via onDataReloaded callback
 *
 * Every failure it can see is alerted, and one user action produces at most one
 * alert. It used to return an `error` string as well, which no caller ever
 * destructured — so the one failure reported only that way (a local re-read
 * that throws after a successful fetch) reached nobody at all. The alert is now
 * the whole contract; there is no second, silent channel to forget to read.
 *
 * How far that reaches depends on the `onDataReloaded` a screen passes.
 * Beerfinder and TastedBrewList pass the context's `refreshBeerData`, which
 * catches its own failures into `beerError` and never rejects — so for them
 * this branch is unreachable and the failure surfaces as the context's error
 * screen instead. Only AllBeers, whose callback reads `beerRepository`
 * directly, can reach it today.
 *
 * @example
 * ```tsx
 * const { refreshing, handleRefresh } = useDataRefresh({
 *   onDataReloaded: async () => {
 *     const beers = await getAllBeers();
 *     setAllBeers(beers);
 *   },
 *   componentName: 'AllBeers'
 * });
 *
 * // Use in BeerList component:
 * <BeerList
 *   beers={filteredBeers}
 *   refreshing={refreshing}
 *   onRefresh={handleRefresh}
 * />
 * ```
 *
 * @param params - Configuration object with onDataReloaded callback and optional componentName
 * @returns Object containing refreshing state and handleRefresh function
 */
export const useDataRefresh = ({
  onDataReloaded,
  componentName = 'Component',
}: UseDataRefreshParams): UseDataRefreshResult => {
  const [refreshing, setRefreshing] = useState(false);

  /**
   * Handle manual refresh triggered by user pull-to-refresh gesture
   *
   * Implements the unified refresh flow:
   * - Check API URL configuration
   * - Call unified manualRefreshAllData (refreshes all beers, my beers, and rewards)
   * - Handle network errors vs partial errors with appropriate alerts
   * - Reload local data regardless of API success (offline-first approach)
   * - Update component state via callback
   */
  const handleRefresh = useCallback(async () => {
    // Prevent duplicate refresh requests
    if (refreshing) {
      console.log(`${componentName}: Refresh already in progress, ignoring duplicate request`);
      return;
    }

    try {
      setRefreshing(true);
      console.log(`Manual refresh initiated by user in ${componentName}`);

      // First check if API URLs are configured
      const apiUrlsConfigured = await areApiUrlsConfigured();
      if (!apiUrlsConfigured) {
        Alert.alert(
          'API URLs Not Configured',
          'Please log in via the Settings screen to configure API URLs before refreshing.'
        );
        // No `setRefreshing(false)` here: this return is inside the try, so the
        // finally below already lowers it. The explicit call that used to sit
        // here was unreachable-by-effect, and no test could tell the two apart.
        return;
      }

      // Use the unified refresh function to refresh ALL data types
      console.log('Using unified refresh to update all data types');
      const result = await manualRefreshAllData();

      // Refresh the local display regardless of API errors (use cached data)
      // This implements offline-first approach - show what we have even if API
      // fails. Done BEFORE the alerts, not after: two `Alert.alert` calls in
      // one tick do not queue or collapse — RN gives each its own UIWindow at
      // the same level, so both present and the later sits on top. Reporting
      // the API failure and then the local failure put "Refreshed, but…" over
      // the top of the error explaining why nothing was refreshed. One user
      // action, one message.
      let localReloadFailed = false;
      try {
        await onDataReloaded();

        if (!result.hasErrors) {
          console.log(`All data refreshed successfully from ${componentName} tab`);
        }
      } catch (localError: unknown) {
        // Reported, not merely recorded. This branch used to write an `error`
        // state that no consumer of this hook destructures, so a refresh that
        // fetched fine and then failed to re-read the database was
        // indistinguishable from one with nothing new to show: spinner
        // retracts, stale rows stay, user told nothing.
        console.error('Error loading local beer data after refresh:', localError);
        localReloadFailed = true;
      }

      // The local re-read failing is appended to the API error rather than
      // raised beside it, so the two facts arrive together and in the order
      // that explains them.
      const staleWarning = localReloadFailed
        ? '\n\nThe list on screen could not be reloaded either, so it may be out of date.'
        : '';

      if (result.hasErrors) {
        if (result.allNetworkErrors) {
          // All errors are network-related
          Alert.alert(
            'Server Connection Error',
            `Unable to connect to the server. Please check your internet connection and try again later.${staleWarning}`,
            [{ text: 'OK' }]
          );
        } else {
          // Partial errors - one line per failed source. Covers rewards too;
          // omitting it here while `hasErrors` counted it produced an error
          // dialog with an empty body. See refreshErrorMessages.ts.
          const errorMessages = buildRefreshErrorMessages(result);

          Alert.alert(
            'Data Refresh Error',
            `There were problems refreshing beer data:\n\n${errorMessages.join('\n\n')}${staleWarning}`,
            [{ text: 'OK' }]
          );
        }
      } else if (localReloadFailed) {
        Alert.alert(
          'Error',
          'Refreshed, but the updated data could not be loaded from this device. What you see may be out of date.'
        );
      }
    } catch (error: unknown) {
      console.error(`Error in unified refresh from ${componentName}:`, error);
      Alert.alert('Error', 'Failed to refresh beer data. Please try again later.');
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, onDataReloaded, componentName]);

  return {
    refreshing,
    handleRefresh,
  };
};
