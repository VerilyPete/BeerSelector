import { useState, useEffect, useCallback, useRef } from 'react';
import { isUntappdLoggedIn as checkUntappdLoggedInDb } from '@/src/database/db';

/**
 * Return value of the useUntappdLogin hook
 */
export interface UseUntappdLoginReturn {
  /**
   * Whether the Untappd login WebView modal should be visible
   */
  untappdWebViewVisible: boolean;

  /**
   * Whether the user is currently logged in to Untappd
   * Checked automatically on mount and after successful login
   */
  isUntappdLoggedIn: boolean;

  /**
   * Start the Untappd login flow
   * Displays the Untappd login WebView
   */
  startUntappdLogin: () => void;

  /**
   * Handle successful Untappd login
   * Closes WebView and re-checks login status
   * No alerts or navigation (alpha feature)
   */
  handleUntappdLoginSuccess: () => Promise<void>;

  /**
   * Handle user canceling the Untappd login process
   * Closes WebView without checking login status
   */
  handleUntappdLoginCancel: () => void;

  /**
   * Manually check Untappd login status
   * Updates isUntappdLoggedIn state
   * Can be called independently of login flow
   */
  checkUntappdLoginStatus: () => Promise<void>;
}

/**
 * Custom hook to manage Untappd authentication state and login flow (alpha feature)
 *
 * This hook handles the Untappd login integration which allows users to connect
 * their Untappd account to check beer ratings and add check-ins. This is an alpha
 * feature with simplified error handling (console.log instead of alerts).
 *
 * **Untappd Login Flow:**
 * 1. Hook auto-checks login status on mount
 * 2. User calls startUntappdLogin() → Shows WebView with Untappd login page
 * 3. WebView stores cookies in database after successful login
 * 4. handleUntappdLoginSuccess() → Closes WebView and re-checks status
 * 5. No navigation or success alerts (alpha feature)
 *
 * **Key Features:**
 * - Auto-checks login status on component mount
 * - No loading states or duplicate prevention (simpler than main login)
 * - No alerts for errors (alpha feature, uses console.log)
 * - No navigation after login (stays on current screen)
 * - Implements cleanup pattern to prevent state updates on unmounted component
 * - Supports manual status checks via checkUntappdLoginStatus()
 *
 * **Cleanup Pattern:**
 * The hook uses an `isMounted` ref to track component lifecycle and prevent
 * React warnings about setting state on unmounted components. All async operations
 * check `isMounted.current` before updating state.
 *
 * **Boolean Coercion:**
 * The hook explicitly coerces database results to boolean using `!!` to handle
 * undefined/null values gracefully (treats them as false).
 *
 * @example
 * ```tsx
 * // In settings.tsx:
 * const {
 *   untappdWebViewVisible,
 *   isUntappdLoggedIn,
 *   startUntappdLogin,
 *   handleUntappdLoginSuccess,
 *   handleUntappdLoginCancel,
 *   checkUntappdLoginStatus
 * } = useUntappdLogin();
 *
 * // Show login button with status:
 * <TouchableOpacity onPress={startUntappdLogin}>
 *   <Text>
 *     {isUntappdLoggedIn ? 'Reconnect to Untappd' : 'Login to Untappd'}
 *   </Text>
 * </TouchableOpacity>
 *
 * // Render Untappd WebView:
 * <UntappdLoginWebView
 *   visible={untappdWebViewVisible}
 *   onLoginSuccess={handleUntappdLoginSuccess}
 *   onLoginCancel={handleUntappdLoginCancel}
 * />
 *
 * // Manually refresh status after logout:
 * await clearUntappdCookies();
 * await checkUntappdLoginStatus();
 * ```
 *
 * @returns Object containing Untappd login state and control functions
 */
export const useUntappdLogin = (): UseUntappdLoginReturn => {
  // State for Untappd login flow
  const [untappdWebViewVisible, setUntappdWebViewVisible] = useState(false);
  const [isUntappdLoggedIn, setIsUntappdLoggedIn] = useState(false);

  // Ref to track component mount status for cleanup
  const isMounted = useRef(true);

  /**
   * Check Untappd login status from database
   * Updates isUntappdLoggedIn state
   * Handles errors gracefully (logs to console, defaults to false)
   */
  const checkUntappdLoginStatus = useCallback(async () => {
    try {
      const loggedIn = await checkUntappdLoggedInDb();

      // Only update state if component is still mounted
      if (isMounted.current) {
        // Explicitly coerce to boolean to handle undefined/null
        setIsUntappdLoggedIn(!!loggedIn);
      }
    } catch (error) {
      console.error('Error checking Untappd login status:', error);

      // Set to false on error if component is still mounted
      if (isMounted.current) {
        setIsUntappdLoggedIn(false);
      }
    }
  }, []);

  /**
   * Cleanup effect - prevents state updates on unmounted component
   * Also runs initial login status check on mount
   */
  useEffect(() => {
    isMounted.current = true;

    // Check Untappd login status on mount
    checkUntappdLoginStatus();

    return () => {
      isMounted.current = false;
    };
  }, [checkUntappdLoginStatus]);

  /**
   * Start Untappd login flow
   * Simply shows the WebView - no duplicate prevention needed
   */
  const startUntappdLogin = useCallback(() => {
    setUntappdWebViewVisible(true);
  }, []);

  /**
   * Handle user canceling Untappd login
   * Closes WebView without checking status
   */
  const handleUntappdLoginCancel = useCallback(() => {
    setUntappdWebViewVisible(false);
  }, []);

  /**
   * Handle successful Untappd login
   *
   * Flow:
   * 1. Close WebView
   * 2. Re-check login status from database
   * 3. No alerts or navigation (alpha feature)
   *
   * Note: The UntappdLoginWebView component handles storing cookies in database
   * before calling this handler.
   */
  const handleUntappdLoginSuccess = useCallback(async () => {
    // Close WebView immediately
    setUntappdWebViewVisible(false);

    // Re-check login status to update UI
    await checkUntappdLoginStatus();
  }, [checkUntappdLoginStatus]);

  return {
    untappdWebViewVisible,
    isUntappdLoggedIn,
    startUntappdLogin,
    handleUntappdLoginSuccess,
    handleUntappdLoginCancel,
    checkUntappdLoginStatus,
  };
};
