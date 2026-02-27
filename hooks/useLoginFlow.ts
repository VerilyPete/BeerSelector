import { useState, useEffect, useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { setPreference } from '@/src/database/preferences';

/**
 * Parameters for the useLoginFlow hook
 */
export type UseLoginFlowProps = {
  /**
   * Optional callback to refresh data after successful login
   * This will typically call manualRefreshAllData() to fetch fresh data from APIs
   */
  onRefreshData?: () => Promise<void>;
};

/**
 * Return value of the useLoginFlow hook
 */
export type UseLoginFlowReturn = {
  /**
   * Whether a login operation is currently in progress
   * Used to prevent duplicate login attempts and show loading states
   */
  isLoggingIn: boolean;

  /**
   * Whether the login WebView modal should be visible
   */
  loginWebViewVisible: boolean;

  /**
   * The type of login currently selected ('member' or 'visitor')
   * null when no login is in progress
   */
  selectedLoginType: 'member' | 'visitor' | null;

  /**
   * Start the UFO Club member login flow
   * Sets login type to 'member' and displays the login WebView
   */
  startMemberLogin: () => void;

  /**
   * Start the visitor login flow
   * Sets login type to 'visitor' and displays the login WebView
   */
  startVisitorLogin: () => void;

  /**
   * Handle successful login after WebView completes authentication
   * WebView has already extracted cookies, validated session, and saved preferences
   * This handler coordinates the post-login flow:
   * 1. Close WebView
   * 2. Refresh data from database
   * 3. Navigate to home screen
   */
  handleLoginSuccess: () => Promise<void>;

  /**
   * Handle user canceling the login process
   * Resets all login state without navigation or data refresh
   */
  handleLoginCancel: () => void;
};

/**
 * Navigation delay constant
 * Allows time for state updates to propagate before navigation
 */
const NAVIGATION_DELAY_MS = 300;

/**
 * Custom hook to manage login flow state and logic for Flying Saucer authentication
 *
 * This hook handles both UFO Club member login and visitor mode login flows:
 *
 * **Modern Login Flow (LoginWebView):**
 * 1. User calls startMemberLogin() or startVisitorLogin() → Shows WebView
 * 2. WebView handles authentication internally (cookies, session validation, preferences)
 * 3. handleLoginSuccess() → Post-login coordinator:
 *    - Closes WebView
 *    - Calls onRefreshData() to fetch latest data
 *    - Navigates to home screen after 300ms delay
 *
 * **Key Features:**
 * - Prevents duplicate login attempts via isLoggingIn flag
 * - Implements cleanup pattern to prevent state updates on unmounted component
 * - 300ms navigation delay with proper timer cleanup
 * - Comprehensive error handling with user-friendly alerts
 * - Supports optional data refresh callback
 * - Ensures data refresh completes BEFORE navigation starts
 *
 * **Cleanup Pattern:**
 * The hook uses an `isMounted` ref to track component lifecycle and prevent
 * React warnings about setting state on unmounted components. All async operations
 * check `isMounted.current` before updating state. Timers are tracked and cleared
 * on unmount.
 *
 * @example
 * ```tsx
 * // In settings.tsx:
 * const {
 *   isLoggingIn,
 *   loginWebViewVisible,
 *   selectedLoginType,
 *   startMemberLogin,
 *   startVisitorLogin,
 *   handleLoginSuccess,
 *   handleLoginCancel
 * } = useLoginFlow({
 *   onRefreshData: async () => {
 *     await manualRefreshAllData();
 *   }
 * });
 *
 * // Start member login:
 * <TouchableOpacity onPress={startMemberLogin}>
 *   <Text>Login to UFO Club</Text>
 * </TouchableOpacity>
 *
 * // Start visitor login:
 * <TouchableOpacity onPress={startVisitorLogin}>
 *   <Text>Continue as Visitor</Text>
 * </TouchableOpacity>
 *
 * // Render WebView:
 * <LoginWebView
 *   visible={loginWebViewVisible}
 *   loginType={selectedLoginType}
 *   onLoginSuccess={handleLoginSuccess}
 *   onLoginCancel={handleLoginCancel}
 *   loading={isLoggingIn}
 * />
 * ```
 *
 * @param props - Configuration object with optional onRefreshData callback
 * @returns Object containing login state and control functions
 */
export const useLoginFlow = ({ onRefreshData }: UseLoginFlowProps): UseLoginFlowReturn => {
  // State for login flow
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginWebViewVisible, setLoginWebViewVisible] = useState(false);
  const [selectedLoginType, setSelectedLoginType] = useState<'member' | 'visitor' | null>(null);

  // Ref to track component mount status for cleanup
  const isMounted = useRef(true);

  // Ref to track pending timers for cleanup
  const pendingTimers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  /**
   * Cleanup effect - prevents state updates on unmounted component
   * and clears any pending timers
   */
  useEffect(() => {
    isMounted.current = true;

    return () => {
      isMounted.current = false;

      // Clear all pending timers on unmount
      pendingTimers.current.forEach(timer => clearTimeout(timer));
      pendingTimers.current.clear();
    };
  }, []);

  /**
   * Start UFO Club member login flow
   * Prevents duplicate login attempts when already logging in
   */
  const startMemberLogin = useCallback(() => {
    // Prevent duplicate login attempts
    if (isLoggingIn) {
      return;
    }

    setIsLoggingIn(true);
    setLoginWebViewVisible(true);
    setSelectedLoginType('member');
  }, [isLoggingIn]);

  /**
   * Start visitor login flow
   * Prevents duplicate login attempts when already logging in
   */
  const startVisitorLogin = useCallback(() => {
    // Prevent duplicate login attempts
    if (isLoggingIn) {
      return;
    }

    setIsLoggingIn(true);
    setLoginWebViewVisible(true);
    setSelectedLoginType('visitor');
  }, [isLoggingIn]);

  /**
   * Handle user canceling login
   * Resets all state without any side effects
   */
  const handleLoginCancel = useCallback(() => {
    setIsLoggingIn(false);
    setLoginWebViewVisible(false);
    setSelectedLoginType(null);
  }, []);

  /**
   * Called after LoginWebView completes authentication internally.
   * WebView has already extracted cookies, validated session, and saved preferences.
   * This handler coordinates the post-login flow:
   * 1. Close WebView
   * 2. Refresh data from database
   * 3. Navigate to home screen
   */
  const handleLoginSuccess = useCallback(async () => {
    try {
      console.log('Login handled internally by WebView, proceeding with post-login flow');

      // Close webview
      if (isMounted.current) {
        setLoginWebViewVisible(false);
      }

      // Set API URLs configured preference (non-critical, log if fails)
      try {
        await setPreference(
          'api_urls_configured',
          'true',
          'Flag indicating API URLs are configured'
        );
      } catch (prefError) {
        console.warn('Failed to set api_urls_configured preference:', prefError);
        // Continue with login flow even if preference fails
      }

      // Call onRefreshData if provided - WAIT for completion before navigating
      if (onRefreshData) {
        try {
          console.log('Starting data refresh after login...');
          await onRefreshData();
          console.log('Data refresh completed after login');
        } catch (refreshError) {
          console.error('Error refreshing data after login:', refreshError);
          // Continue with navigation even if refresh fails
        }
      }

      // IMPORTANT: Navigate only AFTER refresh completes
      // Reset login state immediately, navigation happens after delay
      if (isMounted.current) {
        setIsLoggingIn(false);
      }

      const timer = setTimeout(() => {
        if (isMounted.current) {
          console.log('Navigating to home screen after successful login');
          router.replace('/(tabs)');
        }
        pendingTimers.current.delete(timer);
      }, NAVIGATION_DELAY_MS);

      pendingTimers.current.add(timer);
    } catch (error) {
      console.error('Error in handleLoginSuccess:', error);
      Alert.alert('Login Error', 'An error occurred during login. Please try again.');
      if (isMounted.current) {
        setIsLoggingIn(false);
        setLoginWebViewVisible(false);
      }
    }
  }, [onRefreshData]);

  return {
    isLoggingIn,
    loginWebViewVisible,
    selectedLoginType,
    startMemberLogin,
    startVisitorLogin,
    handleLoginSuccess,
    handleLoginCancel,
  };
};
