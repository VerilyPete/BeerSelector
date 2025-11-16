import { renderHook, act, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { useLoginFlow } from '../useLoginFlow';
import { getPreference, setPreference } from '@/src/database/preferences';
import { router } from 'expo-router';

// Mock dependencies
jest.mock('@/src/database/preferences');
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

  describe('handleLoginSuccess - Modern Path', () => {
    it('should close WebView and navigate after successful login', async () => {
      const { result } = renderHook(() => useLoginFlow({ onRefreshData }));

      act(() => {
        result.current.startMemberLogin();
      });

      await act(async () => {
        await result.current.handleLoginSuccess();
      });

      // Should close webview
      expect(result.current.loginWebViewVisible).toBe(false);

      // Should call onRefreshData
      await waitFor(() => {
        expect(onRefreshData).toHaveBeenCalled();
      });

      // Should navigate to home
      await waitFor(() => {
        expect(mockRouterReplace).toHaveBeenCalledWith('/(tabs)');
      });

      // Should reset loading state
      await waitFor(() => {
        expect(result.current.isLoggingIn).toBe(false);
      });
    });

    it('should set API URLs configured preference after successful login', async () => {
      const { result } = renderHook(() => useLoginFlow({ onRefreshData }));

      act(() => {
        result.current.startMemberLogin();
      });

      await act(async () => {
        await result.current.handleLoginSuccess();
      });

      await waitFor(() => {
        expect(mockSetPreference).toHaveBeenCalledWith(
          'api_urls_configured',
          'true',
          expect.any(String)
        );
      });
    });

    it('should navigate with delay after successful login', async () => {
      jest.useFakeTimers();

      const { result } = renderHook(() => useLoginFlow({ onRefreshData }));

      act(() => {
        result.current.startMemberLogin();
      });

      await act(async () => {
        await result.current.handleLoginSuccess();
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

    it('should handle onRefreshData errors gracefully', async () => {
      const refreshError = new Error('Refresh failed');
      onRefreshData.mockRejectedValue(refreshError);

      const { result } = renderHook(() => useLoginFlow({ onRefreshData }));

      act(() => {
        result.current.startMemberLogin();
      });

      await act(async () => {
        await result.current.handleLoginSuccess();
      });

      // Should still complete login despite refresh error
      expect(result.current.loginWebViewVisible).toBe(false);

      await waitFor(() => {
        expect(result.current.isLoggingIn).toBe(false);
      });
    });

    it('should work for both member and visitor login types', async () => {
      const { result } = renderHook(() => useLoginFlow({ onRefreshData }));

      // Test visitor login
      act(() => {
        result.current.startVisitorLogin();
      });

      await act(async () => {
        await result.current.handleLoginSuccess();
      });

      expect(result.current.loginWebViewVisible).toBe(false);

      await waitFor(() => {
        expect(mockRouterReplace).toHaveBeenCalledWith('/(tabs)');
      });
    });

    it('should wait for data refresh to complete before navigation', async () => {
      jest.useFakeTimers();

      let refreshComplete = false;
      const delayedRefresh = jest.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 1000));
        refreshComplete = true;
      });

      const { result } = renderHook(() => useLoginFlow({ onRefreshData: delayedRefresh }));

      act(() => {
        result.current.startMemberLogin();
      });

      await act(async () => {
        await result.current.handleLoginSuccess();
      });

      // Refresh should be called
      expect(delayedRefresh).toHaveBeenCalled();

      // Navigation should not happen until refresh completes
      expect(mockRouterReplace).not.toHaveBeenCalled();

      // Fast-forward past navigation delay
      act(() => {
        jest.advanceTimersByTime(300);
      });

      // Should navigate after refresh completes
      await waitFor(() => {
        expect(mockRouterReplace).toHaveBeenCalledWith('/(tabs)');
      });

      jest.useRealTimers();
    });

    it('should not navigate if component unmounts during login', async () => {
      jest.useFakeTimers();

      const { result, unmount } = renderHook(() => useLoginFlow({ onRefreshData }));

      act(() => {
        result.current.startMemberLogin();
      });

      await act(async () => {
        await result.current.handleLoginSuccess();
      });

      // Unmount during navigation delay
      unmount();

      // Fast-forward timers
      act(() => {
        jest.advanceTimersByTime(300);
      });

      // Should NOT navigate after unmount
      expect(mockRouterReplace).not.toHaveBeenCalled();

      jest.useRealTimers();
    });

    it('should handle login without onRefreshData callback', async () => {
      const { result } = renderHook(() => useLoginFlow({}));

      act(() => {
        result.current.startMemberLogin();
      });

      await act(async () => {
        await result.current.handleLoginSuccess();
      });

      // Should complete successfully without callback
      expect(result.current.loginWebViewVisible).toBe(false);

      await waitFor(() => {
        expect(mockRouterReplace).toHaveBeenCalledWith('/(tabs)');
      });
    });
  });

  describe('handleLoginSuccess - Error Handling', () => {
    it('should handle general errors gracefully', async () => {
      const mockError = new Error('Test error');
      mockSetPreference.mockRejectedValue(mockError);

      const { result } = renderHook(() => useLoginFlow({ onRefreshData }));

      act(() => {
        result.current.startMemberLogin();
      });

      await act(async () => {
        await result.current.handleLoginSuccess();
      });

      // Should show error alert
      expect(mockAlert).toHaveBeenCalledWith(
        'Login Error',
        'An error occurred during login. Please try again.'
      );

      // Should close webview and reset state
      expect(result.current.loginWebViewVisible).toBe(false);
      expect(result.current.isLoggingIn).toBe(false);

      // Should NOT navigate
      expect(mockRouterReplace).not.toHaveBeenCalled();
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
        await result.current.handleLoginSuccess();
      });

      // State should be reset
      await waitFor(() => {
        expect(result.current.isLoggingIn).toBe(false);
      });
      expect(result.current.loginWebViewVisible).toBe(false);

      // Should be able to start new login
      act(() => {
        result.current.startVisitorLogin();
      });

      expect(result.current.selectedLoginType).toBe('visitor');
    });

    it('should update loading state during async operations', async () => {
      let resolveRefresh: any;
      const delayedRefresh = new Promise((resolve) => {
        resolveRefresh = resolve;
      });

      const customOnRefreshData = jest.fn(() => delayedRefresh);

      const { result } = renderHook(() => useLoginFlow({ onRefreshData: customOnRefreshData }));

      act(() => {
        result.current.startMemberLogin();
      });

      // Start login process
      act(() => {
        result.current.handleLoginSuccess();
      });

      // Should still be loading during async operation
      expect(result.current.isLoggingIn).toBe(true);

      // Complete refresh
      await act(async () => {
        resolveRefresh();
      });

      // Should be done loading
      await waitFor(() => {
        expect(result.current.isLoggingIn).toBe(false);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should prevent duplicate login attempts when already logging in', async () => {
      const { result } = renderHook(() => useLoginFlow({ onRefreshData }));

      act(() => {
        result.current.startMemberLogin();
      });

      expect(result.current.isLoggingIn).toBe(true);

      // Try to start visitor login while member login is in progress
      act(() => {
        result.current.startVisitorLogin();
      });

      // Should still be on member login (second call should be rejected)
      expect(result.current.selectedLoginType).toBe('member');
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

    it('should cleanup timers and prevent state updates after unmount', async () => {
      jest.useFakeTimers();

      const { result, unmount } = renderHook(() => useLoginFlow({ onRefreshData }));

      act(() => {
        result.current.startMemberLogin();
      });

      await act(async () => {
        await result.current.handleLoginSuccess();
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
          await result.current.handleLoginSuccess();
        } catch (e) {
          // Expected to possibly throw or fail silently
        }
      });

      // Should not cause errors or warnings about state updates on unmounted component
      expect(mockRouterReplace).not.toHaveBeenCalled();
    });
  });
});
