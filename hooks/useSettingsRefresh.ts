import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import { manualRefreshAllData } from '@/src/services/dataUpdateService';
import { getPreference } from '@/src/database/preferences';
import { getUserFriendlyErrorMessage } from '@/src/utils/notificationUtils';

/**
 * Return value of the useSettingsRefresh hook
 */
export type UseSettingsRefreshReturn = {
  /**
   * Whether a refresh operation is currently in progress
   */
  refreshing: boolean;

  /**
   * Refresh all beer data from APIs
   * Shows appropriate success/error alerts based on result
   * Specifically designed for settings screen (no data reload callback)
   * @param silent - If true, suppresses success alerts (errors still shown)
   */
  handleRefresh: (silent?: boolean) => Promise<void>;
};

/**
 * Custom hook to manage data refresh operations for settings screen
 *
 * This hook is a simplified version of useDataRefresh specifically for the settings screen.
 * Unlike the component-level useDataRefresh, this doesn't require an onDataReloaded callback
 * since settings screen doesn't display beer data directly.
 *
 * **Refresh Flow:**
 * 1. User calls handleRefresh()
 * 2. Sets refreshing state to true
 * 3. Calls manualRefreshAllData() from dataUpdateService
 * 4. Shows appropriate alert based on result:
 *    - Network errors: Single consolidated message
 *    - Mixed errors: Individual error messages for each endpoint
 *    - Success with data: Shows counts for All Beer and Beerfinder
 *    - Success without data: Shows "No new data available"
 * 5. Sets refreshing state to false
 *
 * **Error Handling:**
 * - Network errors are consolidated into a single message
 * - Server errors show specific endpoint information
 * - Visitor mode is detected and messaging is adjusted accordingly
 * - All errors are caught and handled gracefully
 *
 * **Success Messages:**
 * - Shows beer counts for both All Beer and Beerfinder
 * - Adjusts message for visitor mode (no personal data)
 * - Handles case where no new data is available
 *
 * @example
 * ```tsx
 * // In settings.tsx:
 * const { refreshing, handleRefresh } = useSettingsRefresh();
 *
 * // Pass to DataManagementSection:
 * <DataManagementSection
 *   refreshing={refreshing}
 *   onRefresh={handleRefresh}
 *   // ... other props
 * />
 * ```
 *
 * @returns Object containing refresh state and control function
 */
export const useSettingsRefresh = (): UseSettingsRefreshReturn => {
  const [refreshing, setRefreshing] = useState(false);

  /**
   * Handle refreshing all data from APIs
   * Shows user-friendly alerts based on success/error states
   * @param silent - If true, suppresses success alerts (errors still shown)
   */
  const handleRefresh = useCallback(async (silent: boolean = false) => {
    try {
      setRefreshing(true);

      // Perform the refresh of both tables using the conditional update function
      const result = await manualRefreshAllData();

      // Check if there were any errors
      if (result.hasErrors) {
        // If all errors are network-related, show a single consolidated message
        if (result.allNetworkErrors) {
          Alert.alert(
            'Server Connection Error',
            'Unable to connect to the server. Please check your internet connection and try again later.',
            [{ text: 'OK' }]
          );
        }
        // Otherwise, show individual error messages for each endpoint
        else {
          // Collect error messages
          const errorMessages: string[] = [];

          if (!result.allBeersResult.success && result.allBeersResult.error) {
            const allBeersError = getUserFriendlyErrorMessage(result.allBeersResult.error);
            errorMessages.push(`All Beer data: ${allBeersError}`);
          }

          if (!result.myBeersResult.success && result.myBeersResult.error) {
            const myBeersError = getUserFriendlyErrorMessage(result.myBeersResult.error);
            errorMessages.push(`Beerfinder data: ${myBeersError}`);
          }

          // Show error alert with all error messages
          Alert.alert(
            'Data Refresh Error',
            `There were problems refreshing beer data:\n\n${errorMessages.join('\n\n')}`,
            [{ text: 'OK' }]
          );
        }
      }
      // If no errors but data was updated
      else if (result.allBeersResult.dataUpdated || result.myBeersResult.dataUpdated) {
        // Only show success alert if not in silent mode
        if (!silent) {
          // Show success message with counts
          const allBeersCount = result.allBeersResult.itemCount || 0;
          const tastedBeersCount = result.myBeersResult.itemCount || 0;

          // Check if user is in visitor mode to customize message
          const isVisitor = (await getPreference('is_visitor_mode')) === 'true';

          let successMessage = `Beer data refreshed successfully!\n\nAll Beers: ${allBeersCount} beers\n`;

          if (!isVisitor) {
            // Beerfinder = beers available to check-in (All Beers - Tasted Beers)
            // Optimized: Use counts from refresh result instead of redundant database queries
            // This is mathematically correct because Beerfinder = All Beers - Tasted Beers
            const beerfinderCount = allBeersCount - tastedBeersCount;

            successMessage += `Tasted Beers: ${tastedBeersCount} beers\n`;
            successMessage += `Beerfinder (available): ${beerfinderCount} beers`;
          } else {
            successMessage += 'Visitor mode: Personal data not available';
          }

          Alert.alert('Success', successMessage);
        }
      }
      // If no errors and no data was updated
      else if (!silent) {
        Alert.alert('Info', 'No new data available.');
      }
    } catch (err) {
      console.error('Failed to refresh data:', err);
      Alert.alert('Error', 'Failed to refresh data from server. Please try again later.');
    } finally {
      // Set refreshing to false at the end, in both success and error cases
      setRefreshing(false);
    }
  }, []);

  return {
    refreshing,
    handleRefresh,
  };
};
