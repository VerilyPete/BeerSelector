import { useState, useEffect, useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { handleTapThatAppLogin, handleVisitorLogin } from '@/src/api/authService';
import { setPreference } from '@/src/database/preferences';

/**
 * Parameters for the useLoginFlow hook
 */
export interface UseLoginFlowProps {
  /**
   * Optional callback to refresh data after successful login
   * This will typically call manualRefreshAllData() to fetch fresh data from APIs
   */
  onRefreshData?: () => Promise<void>;
}

/**
 * Return value of the useLoginFlow hook
 */
export interface UseLoginFlowReturn {
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
   * Handle successful login with cookies received from WebView
   * Routes to appropriate auth handler based on selectedLoginType
   * Shows success alert, calls onRefreshData, and navigates to home after 300ms
   *
   * @param params - Object containing cookies string from WebView
   */
  handleLoginSuccess: (params: { cookies: string }) => Promise<void>;

  /**
   * Handle user canceling the login process
   * Resets all login state without navigation or data refresh
   */
  handleLoginCancel: () => void;
}

/**
 * Custom hook to manage login flow state and logic for Flying Saucer authentication
 *
 * This hook handles both UFO Club member login and visitor mode login flows:
 *
 * **Member Login Flow:**
 * 1. User calls startMemberLogin() → Shows WebView with member login page
 * 2. WebView captures cookies after successful login
 * 3. handleLoginSuccess() → Calls handleTapThatAppLogin() with cookies
 * 4. Shows success alert → Calls onRefreshData() → Navigates to home after 300ms
 *
 * **Visitor Login Flow:**
 * 1. User calls startVisitorLogin() → Shows WebView with visitor login page
 * 2. WebView captures cookies after store selection
 * 3. handleLoginSuccess() → Calls handleVisitorLogin() with cookies
 * 4. Shows success alert → Calls onRefreshData() → Navigates to home after 300ms
 *
 * **Key Features:**
 * - Prevents duplicate login attempts via isLoggingIn flag
 * - Implements cleanup pattern to prevent state updates on unmounted component
 * - 300ms navigation delay with proper timer cleanup
 * - Comprehensive error handling with user-friendly alerts
 * - Supports optional data refresh callback
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
export const useLoginFlow = ({
  onRefreshData,
}: UseLoginFlowProps): UseLoginFlowReturn => {
  // State for login flow
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginWebViewVisible, setLoginWebViewVisible] = useState(false);
  const [selectedLoginType, setSelectedLoginType] = useState<'member' | 'visitor' | null>(null);

  // Ref to track component mount status for cleanup
  const isMounted = useRef(true);

  // Ref to track pending timers for cleanup
  const pendingTimers = useRef<Set<NodeJS.Timeout>>(new Set());

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
   * Handle successful login with cookies from WebView
   *
   * Flow:
   * 1. Validate login type and cookies (if provided)
   * 2. Call appropriate auth handler (member or visitor) if cookies provided
   * 3. Close WebView
   * 4. On success: show alert, call onRefreshData, navigate after 300ms
   * 5. On error: show error alert, keep WebView open for retry
   *
   * @param params - Optional object containing cookies string from WebView
   *                 When called from LoginWebView, params is undefined (cookies handled internally)
   */
  const handleLoginSuccess = useCallback(async (params?: { cookies: string }) => {
    try {
      // LoginWebView handles authentication internally, so params may be undefined
      // In that case, we just close the WebView and refresh data
      if (!params) {
        console.log('Login handled internally by WebView, proceeding with post-login flow');

        // Close webview
        if (isMounted.current) {
          setLoginWebViewVisible(false);
        }

        // Set API URLs configured preference
        await setPreference('api_urls_configured', 'true', 'Flag indicating API URLs are configured');

        // Call onRefreshData if provided
        if (onRefreshData) {
          try {
            await onRefreshData();
          } catch (refreshError) {
            console.error('Error refreshing data after login:', refreshError);
          }
        }

        // Reset loading state
        if (isMounted.current) {
          setIsLoggingIn(false);
        }

        return;
      }

      const { cookies } = params;

      // Validate login type is set
      if (!selectedLoginType) {
        Alert.alert('Login Error', 'Login type not specified. Please try again.');
        if (isMounted.current) {
          setIsLoggingIn(false);
          setLoginWebViewVisible(false);
        }
        return;
      }

      // Validate cookies are present
      if (!cookies || cookies.trim() === '') {
        Alert.alert('Login Error', 'No cookies received from login. Please try again.');
        if (isMounted.current) {
          setIsLoggingIn(false);
          setLoginWebViewVisible(false);
        }
        return;
      }

      // Call appropriate auth handler based on login type
      let result;
      if (selectedLoginType === 'member') {
        // Note: LoginWebView component extracts headers internally from WebView navigation state
        // and passes them to the auth service. The hook only receives cookies.
        result = await handleTapThatAppLogin(cookies, undefined);
      } else {
        result = await handleVisitorLogin(cookies);
      }

      // Check if login was successful
      if (!result.success) {
        // Show error to user
        Alert.alert('Login Error', result.error || 'Login failed. Please try again.');

        // Close webview and reset state
        if (isMounted.current) {
          setIsLoggingIn(false);
          setLoginWebViewVisible(false);
        }
        return;
      }

      // Login successful - close webview immediately
      if (isMounted.current) {
        setLoginWebViewVisible(false);
      }

      // Set API URLs configured preference
      await setPreference('api_urls_configured', 'true', 'Flag indicating API URLs are configured');

      // Show success alert
      Alert.alert(
        'Login Successful',
        selectedLoginType === 'member'
          ? 'You have successfully logged in to your UFO Club account.'
          : 'You have successfully logged in as a visitor.'
      );

      // Call onRefreshData if provided (don't block on errors)
      if (onRefreshData) {
        try {
          await onRefreshData();
        } catch (refreshError) {
          console.error('Error refreshing data after login:', refreshError);
          // Continue with navigation even if refresh fails
        }
      }

      // Navigate to home after 300ms delay with cleanup
      const timer = setTimeout(() => {
        if (isMounted.current) {
          router.replace('/(tabs)');
        }
        pendingTimers.current.delete(timer);
      }, 300);

      pendingTimers.current.add(timer);

      // Reset loading state
      if (isMounted.current) {
        setIsLoggingIn(false);
      }

    } catch (error) {
      console.error('Error during login:', error);

      // Show generic error message
      Alert.alert(
        'Login Error',
        'Failed to complete login. Please try again.'
      );

      // Close webview and reset state
      if (isMounted.current) {
        setIsLoggingIn(false);
        setLoginWebViewVisible(false);
      }
    }
  }, [selectedLoginType, onRefreshData]);

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
