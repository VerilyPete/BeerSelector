import { renderHook, act, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { useLoginFlow } from '../useLoginFlow';
import { getPreference, setPreference } from '@/src/database/preferences';
import { handleTapThatAppLogin, handleVisitorLogin } from '@/src/api/authService';
import { router } from 'expo-router';

// Mock dependencies
jest.mock('@/src/database/preferences');
jest.mock('@/src/api/authService');
jest.mock('react-native/Libraries/Alert/Alert', () => ({
  alert: jest.fn(),
}));
jest.mock('expo-router', () => ({
  router: {
    replace: jest.fn(),
    back: jest.fn(),
  },
}));

const mockGetPreference = getPreference as jest.MockedFunction<typeof getPreference>;
const mockSetPreference = setPreference as jest.MockedFunction<typeof setPreference>;
const mockHandleTapThatAppLogin = handleTapThatAppLogin as jest.MockedFunction<typeof handleTapThatAppLogin>;
const mockHandleVisitorLogin = handleVisitorLogin as jest.MockedFunction<typeof handleVisitorLogin>;
const mockAlert = Alert.alert as jest.MockedFunction<typeof Alert.alert>;
const mockRouterReplace = router.replace as jest.MockedFunction<typeof router.replace>;

describe('useLoginFlow', () => {
  let onRefreshData: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    onRefreshData = jest.fn().mockResolvedValue(undefined);

    // Default mocks
    mockGetPreference.mockResolvedValue(null);
    mockSetPreference.mockResolvedValue(undefined);
    mockHandleTapThatAppLogin.mockResolvedValue({
      success: true,
      message: 'Login successful',
      statusCode: 200,
      isVisitorMode: false,
      sessionData: {
        sessionId: 'test-session',
        memberId: 'test-member',
        storeId: 'test-store',
        storeName: 'Test Store',
      },
    });
    mockHandleVisitorLogin.mockResolvedValue({
      success: true,
      message: 'Visitor login successful',
      statusCode: 200,
      isVisitorMode: true,
      sessionData: {
        sessionId: 'visitor-session',
        memberId: 'visitor',
        storeId: 'test-store',
        storeName: 'Test Store',
      },
    });
  });

  describe('Initialization', () => {
    it('should initialize with default state values', () => {
      const { result } = renderHook(() => useLoginFlow({ onRefreshData }));

      expect(result.current.isLoggingIn).toBe(false);
      expect(result.current.loginWebViewVisible).toBe(false);
      expect(result.current.selectedLoginType).toBeNull();
    });

    it('should expose all required functions', () => {
      const { result } = renderHook(() => useLoginFlow({ onRefreshData }));

      expect(typeof result.current.startMemberLogin).toBe('function');
      expect(typeof result.current.startVisitorLogin).toBe('function');
      expect(typeof result.current.handleLoginSuccess).toBe('function');
      expect(typeof result.current.handleLoginCancel).toBe('function');
    });

    it('should work without onRefreshData callback', () => {
      const { result } = renderHook(() => useLoginFlow({}));

      expect(result.current.isLoggingIn).toBe(false);
      expect(result.current.loginWebViewVisible).toBe(false);
    });
  });

  describe('startMemberLogin', () => {
    it('should set login state and show webview for member login', () => {
      const { result } = renderHook(() => useLoginFlow({ onRefreshData }));

      act(() => {
        result.current.startMemberLogin();
      });

      expect(result.current.isLoggingIn).toBe(true);
      expect(result.current.loginWebViewVisible).toBe(true);
      expect(result.current.selectedLoginType).toBe('member');
    });

    it('should not show alert on successful member login start', () => {
      const { result } = renderHook(() => useLoginFlow({ onRefreshData }));

      act(() => {
        result.current.startMemberLogin();
      });

      expect(mockAlert).not.toHaveBeenCalled();
    });

    it('should handle multiple consecutive member login starts', () => {
      const { result } = renderHook(() => useLoginFlow({ onRefreshData }));

      act(() => {
        result.current.startMemberLogin();
      });

      expect(result.current.selectedLoginType).toBe('member');

      act(() => {
        result.current.startMemberLogin();
      });

      // Should maintain member login state
      expect(result.current.selectedLoginType).toBe('member');
      expect(result.current.loginWebViewVisible).toBe(true);
    });
  });

  describe('startVisitorLogin', () => {
    it('should set login state and show webview for visitor login', () => {
      const { result } = renderHook(() => useLoginFlow({ onRefreshData }));

      act(() => {
        result.current.startVisitorLogin();
      });

      expect(result.current.isLoggingIn).toBe(true);
      expect(result.current.loginWebViewVisible).toBe(true);
      expect(result.current.selectedLoginType).toBe('visitor');
    });

    it('should not show alert on successful visitor login start', () => {
      const { result } = renderHook(() => useLoginFlow({ onRefreshData }));

      act(() => {
        result.current.startVisitorLogin();
      });

      expect(mockAlert).not.toHaveBeenCalled();
    });

    it('should switch from member to visitor login type', () => {
      const { result } = renderHook(() => useLoginFlow({ onRefreshData }));

      act(() => {
        result.current.startMemberLogin();
      });

      expect(result.current.selectedLoginType).toBe('member');

      act(() => {
        result.current.startVisitorLogin();
      });

      expect(result.current.selectedLoginType).toBe('visitor');
      expect(result.current.loginWebViewVisible).toBe(true);
    });
  });

  describe('handleLoginCancel', () => {
    it('should reset login state when canceling member login', () => {
      const { result } = renderHook(() => useLoginFlow({ onRefreshData }));

      act(() => {
        result.current.startMemberLogin();
      });

      expect(result.current.loginWebViewVisible).toBe(true);

      act(() => {
        result.current.handleLoginCancel();
      });

      expect(result.current.isLoggingIn).toBe(false);
      expect(result.current.loginWebViewVisible).toBe(false);
      expect(result.current.selectedLoginType).toBeNull();
    });

    it('should reset login state when canceling visitor login', () => {
      const { result } = renderHook(() => useLoginFlow({ onRefreshData }));

      act(() => {
        result.current.startVisitorLogin();
      });

      expect(result.current.loginWebViewVisible).toBe(true);

      act(() => {
        result.current.handleLoginCancel();
      });

      expect(result.current.isLoggingIn).toBe(false);
      expect(result.current.loginWebViewVisible).toBe(false);
      expect(result.current.selectedLoginType).toBeNull();
    });

    it('should not call onRefreshData when canceling', () => {
      const { result } = renderHook(() => useLoginFlow({ onRefreshData }));

      act(() => {
        result.current.startMemberLogin();
      });

      act(() => {
        result.current.handleLoginCancel();
      });

      expect(onRefreshData).not.toHaveBeenCalled();
    });

    it('should not navigate when canceling', () => {
      const { result } = renderHook(() => useLoginFlow({ onRefreshData }));

      act(() => {
        result.current.startMemberLogin();
      });

      act(() => {
        result.current.handleLoginCancel();
      });

      expect(mockRouterReplace).not.toHaveBeenCalled();
    });

    it('should handle cancel when no login is in progress', () => {
      const { result } = renderHook(() => useLoginFlow({ onRefreshData }));

      // Cancel without starting login
      act(() => {
        result.current.handleLoginCancel();
      });

      expect(result.current.isLoggingIn).toBe(false);
      expect(result.current.loginWebViewVisible).toBe(false);
    });
  });

  describe('handleLoginSuccess - Member Login', () => {
    it('should successfully complete member login and navigate', async () => {
      const { result } = renderHook(() => useLoginFlow({ onRefreshData }));

      act(() => {
        result.current.startMemberLogin();
      });

      await act(async () => {
        await result.current.handleLoginSuccess({
          cookies: 'PHPSESSID=test-session; member_id=test-member',
        });
      });

      // Should call member login handler
      // Note: LoginWebView component extracts headers internally before calling handleLoginSuccess
      expect(mockHandleTapThatAppLogin).toHaveBeenCalledWith(
        'PHPSESSID=test-session; member_id=test-member',
        undefined
      );

      // Should close webview
      expect(result.current.loginWebViewVisible).toBe(false);
      expect(result.current.isLoggingIn).toBe(false);

      // Should call onRefreshData
      await waitFor(() => {
        expect(onRefreshData).toHaveBeenCalled();
      });

      // Should navigate to home
      await waitFor(() => {
        expect(mockRouterReplace).toHaveBeenCalledWith('/(tabs)');
      });
    });

    it('should set API URLs configured preference after successful member login', async () => {
      const { result } = renderHook(() => useLoginFlow({ onRefreshData }));

      act(() => {
        result.current.startMemberLogin();
      });

      await act(async () => {
        await result.current.handleLoginSuccess({
          cookies: 'PHPSESSID=test-session; member_id=test-member',
        });
      });

      await waitFor(() => {
        expect(mockSetPreference).toHaveBeenCalledWith(
          'api_urls_configured',
          'true',
          expect.any(String)
        );
      });
    });

    it('should navigate with delay after successful member login', async () => {
      jest.useFakeTimers();

      const { result } = renderHook(() => useLoginFlow({ onRefreshData }));

      act(() => {
        result.current.startMemberLogin();
      });

      await act(async () => {
        await result.current.handleLoginSuccess({
          cookies: 'PHPSESSID=test-session',
        });
      });

      // Should not navigate immediately
      expect(mockRouterReplace).not.toHaveBeenCalled();

      // Fast-forward timers
      act(() => {
        jest.advanceTimersByTime(300);
      });

      // Should navigate after delay
      await waitFor(() => {
        expect(mockRouterReplace).toHaveBeenCalledWith('/(tabs)');
      });

      jest.useRealTimers();
    });

    it('should handle onRefreshData errors gracefully during member login', async () => {
      const refreshError = new Error('Refresh failed');
      onRefreshData.mockRejectedValue(refreshError);

      const { result } = renderHook(() => useLoginFlow({ onRefreshData }));

      act(() => {
        result.current.startMemberLogin();
      });

      await act(async () => {
        await result.current.handleLoginSuccess({
          cookies: 'PHPSESSID=test-session',
        });
      });

      // Should still complete login despite refresh error
      expect(result.current.loginWebViewVisible).toBe(false);
      expect(result.current.isLoggingIn).toBe(false);
    });
  });

  describe('handleLoginSuccess - Visitor Login', () => {
    it('should successfully complete visitor login and navigate', async () => {
      const { result } = renderHook(() => useLoginFlow({ onRefreshData }));

      act(() => {
        result.current.startVisitorLogin();
      });

      await act(async () => {
        await result.current.handleLoginSuccess({
          cookies: 'store__id=test-store',
        });
      });

      // Should call visitor login handler
      expect(mockHandleVisitorLogin).toHaveBeenCalledWith('store__id=test-store');

      // Should close webview
      expect(result.current.loginWebViewVisible).toBe(false);
      expect(result.current.isLoggingIn).toBe(false);

      // Should call onRefreshData
      await waitFor(() => {
        expect(onRefreshData).toHaveBeenCalled();
      });

      // Should navigate to home
      await waitFor(() => {
        expect(mockRouterReplace).toHaveBeenCalledWith('/(tabs)');
      });
    });

    it('should set API URLs configured preference after successful visitor login', async () => {
      const { result } = renderHook(() => useLoginFlow({ onRefreshData }));

      act(() => {
        result.current.startVisitorLogin();
      });

      await act(async () => {
        await result.current.handleLoginSuccess({
          cookies: 'store__id=test-store',
        });
      });

      await waitFor(() => {
        expect(mockSetPreference).toHaveBeenCalledWith(
          'api_urls_configured',
          'true',
          expect.any(String)
        );
      });
    });
  });

  describe('handleLoginSuccess - Error Handling', () => {
    it('should handle member login failure with error message', async () => {
      mockHandleTapThatAppLogin.mockResolvedValue({
        success: false,
        error: 'Invalid credentials',
        statusCode: 401,
      });

      const { result } = renderHook(() => useLoginFlow({ onRefreshData }));

      act(() => {
        result.current.startMemberLogin();
      });

      await act(async () => {
        await result.current.handleLoginSuccess({
          cookies: 'invalid-cookies',
        });
      });

      // Should show error alert
      expect(mockAlert).toHaveBeenCalledWith('Login Error', 'Invalid credentials');

      // Should close webview
      expect(result.current.loginWebViewVisible).toBe(false);
      expect(result.current.isLoggingIn).toBe(false);

      // Should NOT navigate
      expect(mockRouterReplace).not.toHaveBeenCalled();

      // Should NOT call onRefreshData
      expect(onRefreshData).not.toHaveBeenCalled();
    });

    it('should handle visitor login failure with error message', async () => {
      mockHandleVisitorLogin.mockResolvedValue({
        success: false,
        error: 'Missing store ID',
        statusCode: 401,
      });

      const { result } = renderHook(() => useLoginFlow({ onRefreshData }));

      act(() => {
        result.current.startVisitorLogin();
      });

      await act(async () => {
        await result.current.handleLoginSuccess({
          cookies: 'invalid-cookies',
        });
      });

      // Should show error alert
      expect(mockAlert).toHaveBeenCalledWith('Login Error', 'Missing store ID');

      // Should NOT navigate
      expect(mockRouterReplace).not.toHaveBeenCalled();
    });

    it('should handle generic error during member login', async () => {
      const loginError = new Error('Network error');
      mockHandleTapThatAppLogin.mockRejectedValue(loginError);

      const { result } = renderHook(() => useLoginFlow({ onRefreshData }));

      act(() => {
        result.current.startMemberLogin();
      });

      await act(async () => {
        await result.current.handleLoginSuccess({
          cookies: 'PHPSESSID=test-session',
        });
      });

      // Should show error alert
      expect(mockAlert).toHaveBeenCalledWith(
        'Login Error',
        'Failed to complete login. Please try again.'
      );

      // Should close webview
      expect(result.current.loginWebViewVisible).toBe(false);
      expect(result.current.isLoggingIn).toBe(false);
    });

    it('should handle generic error during visitor login', async () => {
      const loginError = new Error('Network error');
      mockHandleVisitorLogin.mockRejectedValue(loginError);

      const { result } = renderHook(() => useLoginFlow({ onRefreshData }));

      act(() => {
        result.current.startVisitorLogin();
      });

      await act(async () => {
        await result.current.handleLoginSuccess({
          cookies: 'store__id=test-store',
        });
      });

      // Should show error alert
      expect(mockAlert).toHaveBeenCalledWith(
        'Login Error',
        'Failed to complete login. Please try again.'
      );
    });

    it('should handle missing login type error', async () => {
      const { result } = renderHook(() => useLoginFlow({ onRefreshData }));

      // Don't set login type (selectedLoginType is null)
      await act(async () => {
        await result.current.handleLoginSuccess({
          cookies: 'PHPSESSID=test-session',
        });
      });

      // Should show error
      expect(mockAlert).toHaveBeenCalledWith(
        'Login Error',
        'Login type not specified. Please try again.'
      );

      // Should NOT call any login handlers
      expect(mockHandleTapThatAppLogin).not.toHaveBeenCalled();
      expect(mockHandleVisitorLogin).not.toHaveBeenCalled();
    });

    it('should handle missing cookies error', async () => {
      const { result } = renderHook(() => useLoginFlow({ onRefreshData }));

      act(() => {
        result.current.startMemberLogin();
      });

      await act(async () => {
        await result.current.handleLoginSuccess({
          cookies: '',
        });
      });

      // Should show error
      expect(mockAlert).toHaveBeenCalledWith(
        'Login Error',
        expect.stringContaining('No cookies received')
      );
    });
  });

  describe('State Management', () => {
    it('should maintain independent state across multiple hook instances', () => {
      const { result: result1 } = renderHook(() => useLoginFlow({ onRefreshData }));
      const { result: result2 } = renderHook(() => useLoginFlow({ onRefreshData }));

      act(() => {
        result1.current.startMemberLogin();
      });

      expect(result1.current.loginWebViewVisible).toBe(true);
      expect(result2.current.loginWebViewVisible).toBe(false);
    });

    it('should reset state properly after complete login flow', async () => {
      const { result } = renderHook(() => useLoginFlow({ onRefreshData }));

      // Start login
      act(() => {
        result.current.startMemberLogin();
      });

      expect(result.current.isLoggingIn).toBe(true);

      // Complete login
      await act(async () => {
        await result.current.handleLoginSuccess({
          cookies: 'PHPSESSID=test-session',
        });
      });

      // State should be reset
      expect(result.current.isLoggingIn).toBe(false);
      expect(result.current.loginWebViewVisible).toBe(false);

      // Should be able to start new login
      act(() => {
        result.current.startVisitorLogin();
      });

      expect(result.current.selectedLoginType).toBe('visitor');
    });

    it('should update loading state during async operations', async () => {
      let resolveLogin: any;
      const delayedLogin = new Promise((resolve) => {
        resolveLogin = resolve;
      });

      mockHandleTapThatAppLogin.mockReturnValue(delayedLogin as any);

      const { result } = renderHook(() => useLoginFlow({ onRefreshData }));

      act(() => {
        result.current.startMemberLogin();
      });

      // Start login process
      act(() => {
        result.current.handleLoginSuccess({
          cookies: 'PHPSESSID=test-session',
        });
      });

      // Should still be loading during async operation
      expect(result.current.isLoggingIn).toBe(true);

      // Complete login
      await act(async () => {
        resolveLogin({
          success: true,
          message: 'Login successful',
          statusCode: 200,
          sessionData: {
            sessionId: 'test-session',
            memberId: 'test-member',
            storeId: 'test-store',
            storeName: 'Test Store',
          },
        });
      });

      // Should be done loading
      await waitFor(() => {
        expect(result.current.isLoggingIn).toBe(false);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should prevent duplicate login attempts when already logging in', async () => {
      let resolveLogin: any;
      const delayedLogin = new Promise((resolve) => {
        resolveLogin = resolve;
      });

      mockHandleTapThatAppLogin.mockReturnValue(delayedLogin as any);

      const { result } = renderHook(() => useLoginFlow({ onRefreshData }));

      act(() => {
        result.current.startMemberLogin();
      });

      // Start first login
      act(() => {
        result.current.handleLoginSuccess({
          cookies: 'PHPSESSID=session1',
        });
      });

      expect(result.current.isLoggingIn).toBe(true);

      // Try to start visitor login while member login is in progress
      act(() => {
        result.current.startVisitorLogin();
      });

      // Should still be on member login (second call should be rejected)
      expect(result.current.selectedLoginType).toBe('member');

      // Complete first login
      await act(async () => {
        resolveLogin({
          success: true,
          message: 'Login successful',
          statusCode: 200,
          sessionData: {
            sessionId: 'test-session',
            memberId: 'test-member',
            storeId: 'test-store',
            storeName: 'Test Store',
          },
        });
      });

      // Should only have called auth service once
      expect(mockHandleTapThatAppLogin).toHaveBeenCalledTimes(1);
      expect(mockHandleVisitorLogin).not.toHaveBeenCalled();
    });

    it('should handle login without onRefreshData callback', async () => {
      const { result } = renderHook(() => useLoginFlow({}));

      act(() => {
        result.current.startMemberLogin();
      });

      await act(async () => {
        await result.current.handleLoginSuccess({
          cookies: 'PHPSESSID=test-session',
        });
      });

      // Should complete successfully without callback
      expect(result.current.loginWebViewVisible).toBe(false);
      expect(mockRouterReplace).toHaveBeenCalled();
    });
  });

  describe('Cleanup', () => {
    it('should cleanup timers on unmount', () => {
      jest.useFakeTimers();

      const { unmount } = renderHook(() => useLoginFlow({ onRefreshData }));

      unmount();

      // Fast-forward timers to ensure no pending operations
      act(() => {
        jest.runAllTimers();
      });

      // Should not cause errors
      expect(mockRouterReplace).not.toHaveBeenCalled();

      jest.useRealTimers();
    });

    it('should cleanup timers and prevent state updates after unmount', () => {
      jest.useFakeTimers();

      const { result, unmount } = renderHook(() => useLoginFlow({ onRefreshData }));

      act(() => {
        result.current.startMemberLogin();
      });

      act(() => {
        result.current.handleLoginSuccess({
          cookies: 'PHPSESSID=test-session',
        });
      });

      // Unmount during navigation delay
      unmount();

      // Advance timers past navigation delay
      act(() => {
        jest.advanceTimersByTime(300);
      });

      // Should NOT navigate after unmount
      expect(mockRouterReplace).not.toHaveBeenCalled();

      jest.useRealTimers();
    });

    it('should not update state after unmount', async () => {
      const { result, unmount } = renderHook(() => useLoginFlow({ onRefreshData }));

      act(() => {
        result.current.startMemberLogin();
      });

      unmount();

      // Try to complete login after unmount
      await act(async () => {
        try {
          await result.current.handleLoginSuccess({
            cookies: 'PHPSESSID=test-session',
          });
        } catch (e) {
          // Expected to possibly throw or fail silently
        }
      });

      // Should not cause errors or warnings about state updates on unmounted component
      expect(mockRouterReplace).not.toHaveBeenCalled();
    });
  });
});
