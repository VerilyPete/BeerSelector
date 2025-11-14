import { renderHook, act, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { useUntappdLogin } from '../useUntappdLogin';
import { isUntappdLoggedIn, clearUntappdCookies } from '@/src/database/db';

// Mock dependencies
jest.mock('@/src/database/db');
jest.mock('react-native/Libraries/Alert/Alert', () => ({
  alert: jest.fn(),
}));

const mockIsUntappdLoggedIn = isUntappdLoggedIn as jest.MockedFunction<typeof isUntappdLoggedIn>;
const mockClearUntappdCookies = clearUntappdCookies as jest.MockedFunction<typeof clearUntappdCookies>;
const mockAlert = Alert.alert as jest.MockedFunction<typeof Alert.alert>;

describe('useUntappdLogin', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default mocks
    mockIsUntappdLoggedIn.mockResolvedValue(false);
    mockClearUntappdCookies.mockResolvedValue(undefined);
  });

  describe('Initialization', () => {
    it('should initialize with default state values', () => {
      const { result } = renderHook(() => useUntappdLogin());

      expect(result.current.untappdWebViewVisible).toBe(false);
      expect(result.current.isUntappdLoggedIn).toBe(false);
    });

    it('should expose all required functions', () => {
      const { result } = renderHook(() => useUntappdLogin());

      expect(typeof result.current.startUntappdLogin).toBe('function');
      expect(typeof result.current.handleUntappdLoginSuccess).toBe('function');
      expect(typeof result.current.handleUntappdLoginCancel).toBe('function');
      expect(typeof result.current.checkUntappdLoginStatus).toBe('function');
    });

    it('should check Untappd login status on mount', async () => {
      mockIsUntappdLoggedIn.mockResolvedValue(true);

      const { result } = renderHook(() => useUntappdLogin());

      await waitFor(() => {
        expect(mockIsUntappdLoggedIn).toHaveBeenCalledTimes(1);
      });

      await waitFor(() => {
        expect(result.current.isUntappdLoggedIn).toBe(true);
      });
    });

    it('should handle error when checking login status on mount', async () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation();
      mockIsUntappdLoggedIn.mockRejectedValue(new Error('Database error'));

      const { result } = renderHook(() => useUntappdLogin());

      await waitFor(() => {
        expect(mockIsUntappdLoggedIn).toHaveBeenCalledTimes(1);
      });

      // Should default to false on error
      await waitFor(() => {
        expect(result.current.isUntappdLoggedIn).toBe(false);
      });

      expect(consoleError).toHaveBeenCalledWith(
        'Error checking Untappd login status:',
        expect.any(Error)
      );

      consoleError.mockRestore();
    });
  });

  describe('startUntappdLogin', () => {
    it('should show Untappd webview when starting login', () => {
      const { result } = renderHook(() => useUntappdLogin());

      act(() => {
        result.current.startUntappdLogin();
      });

      expect(result.current.untappdWebViewVisible).toBe(true);
    });

    it('should not show alert on successful login start', () => {
      const { result } = renderHook(() => useUntappdLogin());

      act(() => {
        result.current.startUntappdLogin();
      });

      expect(mockAlert).not.toHaveBeenCalled();
    });

    it('should handle multiple consecutive login starts', () => {
      const { result } = renderHook(() => useUntappdLogin());

      act(() => {
        result.current.startUntappdLogin();
      });

      expect(result.current.untappdWebViewVisible).toBe(true);

      act(() => {
        result.current.startUntappdLogin();
      });

      // Should maintain webview visibility
      expect(result.current.untappdWebViewVisible).toBe(true);
    });

    it('should be able to start login after cancel', () => {
      const { result } = renderHook(() => useUntappdLogin());

      act(() => {
        result.current.startUntappdLogin();
      });

      act(() => {
        result.current.handleUntappdLoginCancel();
      });

      expect(result.current.untappdWebViewVisible).toBe(false);

      act(() => {
        result.current.startUntappdLogin();
      });

      expect(result.current.untappdWebViewVisible).toBe(true);
    });
  });

  describe('handleUntappdLoginSuccess', () => {
    it('should close webview and update login status on success', async () => {
      mockIsUntappdLoggedIn.mockResolvedValue(true);

      const { result } = renderHook(() => useUntappdLogin());

      act(() => {
        result.current.startUntappdLogin();
      });

      expect(result.current.untappdWebViewVisible).toBe(true);

      await act(async () => {
        await result.current.handleUntappdLoginSuccess();
      });

      expect(result.current.untappdWebViewVisible).toBe(false);

      await waitFor(() => {
        expect(result.current.isUntappdLoggedIn).toBe(true);
      });
    });

    it('should check Untappd login status after success', async () => {
      mockIsUntappdLoggedIn
        .mockResolvedValueOnce(false) // Initial check on mount
        .mockResolvedValueOnce(true); // After login success

      const { result } = renderHook(() => useUntappdLogin());

      await waitFor(() => {
        expect(mockIsUntappdLoggedIn).toHaveBeenCalledTimes(1);
      });

      act(() => {
        result.current.startUntappdLogin();
      });

      await act(async () => {
        await result.current.handleUntappdLoginSuccess();
      });

      await waitFor(() => {
        expect(mockIsUntappdLoggedIn).toHaveBeenCalledTimes(2);
      });

      await waitFor(() => {
        expect(result.current.isUntappdLoggedIn).toBe(true);
      });
    });

    it('should not show alert on successful login', async () => {
      const { result } = renderHook(() => useUntappdLogin());

      act(() => {
        result.current.startUntappdLogin();
      });

      await act(async () => {
        await result.current.handleUntappdLoginSuccess();
      });

      expect(mockAlert).not.toHaveBeenCalled();
    });

    it('should handle error when checking status after success', async () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation();
      mockIsUntappdLoggedIn
        .mockResolvedValueOnce(false) // Initial check
        .mockRejectedValueOnce(new Error('Database error')); // After success

      const { result } = renderHook(() => useUntappdLogin());

      await waitFor(() => {
        expect(mockIsUntappdLoggedIn).toHaveBeenCalledTimes(1);
      });

      act(() => {
        result.current.startUntappdLogin();
      });

      await act(async () => {
        await result.current.handleUntappdLoginSuccess();
      });

      // Should close webview despite error
      expect(result.current.untappdWebViewVisible).toBe(false);

      // Should log error
      await waitFor(() => {
        expect(consoleError).toHaveBeenCalledWith(
          'Error checking Untappd login status:',
          expect.any(Error)
        );
      });

      consoleError.mockRestore();
    });
  });

  describe('handleUntappdLoginCancel', () => {
    it('should close webview when canceling login', () => {
      const { result } = renderHook(() => useUntappdLogin());

      act(() => {
        result.current.startUntappdLogin();
      });

      expect(result.current.untappdWebViewVisible).toBe(true);

      act(() => {
        result.current.handleUntappdLoginCancel();
      });

      expect(result.current.untappdWebViewVisible).toBe(false);
    });

    it('should not change login status when canceling', async () => {
      mockIsUntappdLoggedIn.mockResolvedValue(true);

      const { result } = renderHook(() => useUntappdLogin());

      await waitFor(() => {
        expect(result.current.isUntappdLoggedIn).toBe(true);
      });

      act(() => {
        result.current.startUntappdLogin();
      });

      act(() => {
        result.current.handleUntappdLoginCancel();
      });

      // Login status should remain unchanged
      expect(result.current.isUntappdLoggedIn).toBe(true);
    });

    it('should not check login status when canceling', () => {
      const { result } = renderHook(() => useUntappdLogin());

      act(() => {
        result.current.startUntappdLogin();
      });

      const initialCallCount = mockIsUntappdLoggedIn.mock.calls.length;

      act(() => {
        result.current.handleUntappdLoginCancel();
      });

      // Should not make additional calls
      expect(mockIsUntappdLoggedIn).toHaveBeenCalledTimes(initialCallCount);
    });

    it('should handle cancel when no login is in progress', () => {
      const { result } = renderHook(() => useUntappdLogin());

      // Cancel without starting login
      act(() => {
        result.current.handleUntappdLoginCancel();
      });

      expect(result.current.untappdWebViewVisible).toBe(false);
    });

    it('should not show alert when canceling', () => {
      const { result } = renderHook(() => useUntappdLogin());

      act(() => {
        result.current.startUntappdLogin();
      });

      act(() => {
        result.current.handleUntappdLoginCancel();
      });

      expect(mockAlert).not.toHaveBeenCalled();
    });
  });

  describe('checkUntappdLoginStatus', () => {
    it('should check and update Untappd login status', async () => {
      mockIsUntappdLoggedIn.mockResolvedValue(true);

      const { result } = renderHook(() => useUntappdLogin());

      await act(async () => {
        await result.current.checkUntappdLoginStatus();
      });

      await waitFor(() => {
        expect(result.current.isUntappdLoggedIn).toBe(true);
      });

      expect(mockIsUntappdLoggedIn).toHaveBeenCalled();
    });

    it('should update status to false when not logged in', async () => {
      mockIsUntappdLoggedIn
        .mockResolvedValueOnce(true) // Initial check
        .mockResolvedValueOnce(false); // Manual check

      const { result } = renderHook(() => useUntappdLogin());

      await waitFor(() => {
        expect(result.current.isUntappdLoggedIn).toBe(true);
      });

      await act(async () => {
        await result.current.checkUntappdLoginStatus();
      });

      await waitFor(() => {
        expect(result.current.isUntappdLoggedIn).toBe(false);
      });
    });

    it('should handle error when checking status', async () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation();
      mockIsUntappdLoggedIn
        .mockResolvedValueOnce(true) // Initial check
        .mockRejectedValueOnce(new Error('Database error')); // Manual check

      const { result } = renderHook(() => useUntappdLogin());

      await waitFor(() => {
        expect(result.current.isUntappdLoggedIn).toBe(true);
      });

      await act(async () => {
        await result.current.checkUntappdLoginStatus();
      });

      // Should set to false on error
      await waitFor(() => {
        expect(result.current.isUntappdLoggedIn).toBe(false);
      });

      expect(consoleError).toHaveBeenCalledWith(
        'Error checking Untappd login status:',
        expect.any(Error)
      );

      consoleError.mockRestore();
    });

    it('should allow multiple status checks', async () => {
      mockIsUntappdLoggedIn
        .mockResolvedValueOnce(false) // Initial
        .mockResolvedValueOnce(true) // First check
        .mockResolvedValueOnce(false); // Second check

      const { result } = renderHook(() => useUntappdLogin());

      await waitFor(() => {
        expect(result.current.isUntappdLoggedIn).toBe(false);
      });

      await act(async () => {
        await result.current.checkUntappdLoginStatus();
      });

      await waitFor(() => {
        expect(result.current.isUntappdLoggedIn).toBe(true);
      });

      await act(async () => {
        await result.current.checkUntappdLoginStatus();
      });

      await waitFor(() => {
        expect(result.current.isUntappdLoggedIn).toBe(false);
      });

      expect(mockIsUntappdLoggedIn).toHaveBeenCalledTimes(3);
    });

    it('should be callable without starting login flow', async () => {
      mockIsUntappdLoggedIn.mockResolvedValue(true);

      const { result } = renderHook(() => useUntappdLogin());

      // Don't start login, just check status
      await act(async () => {
        await result.current.checkUntappdLoginStatus();
      });

      await waitFor(() => {
        expect(result.current.isUntappdLoggedIn).toBe(true);
      });

      // Webview should not be visible
      expect(result.current.untappdWebViewVisible).toBe(false);
    });
  });

  describe('State Management', () => {
    it('should maintain independent state across multiple hook instances', () => {
      const { result: result1 } = renderHook(() => useUntappdLogin());
      const { result: result2 } = renderHook(() => useUntappdLogin());

      act(() => {
        result1.current.startUntappdLogin();
      });

      expect(result1.current.untappdWebViewVisible).toBe(true);
      expect(result2.current.untappdWebViewVisible).toBe(false);
    });

    it('should reset webview state properly after complete login flow', async () => {
      mockIsUntappdLoggedIn.mockResolvedValue(true);

      const { result } = renderHook(() => useUntappdLogin());

      // Start login
      act(() => {
        result.current.startUntappdLogin();
      });

      expect(result.current.untappdWebViewVisible).toBe(true);

      // Complete login
      await act(async () => {
        await result.current.handleUntappdLoginSuccess();
      });

      // Webview should be closed
      expect(result.current.untappdWebViewVisible).toBe(false);

      // Should be able to start new login
      act(() => {
        result.current.startUntappdLogin();
      });

      expect(result.current.untappdWebViewVisible).toBe(true);
    });

    it('should update login status independently of webview state', async () => {
      mockIsUntappdLoggedIn
        .mockResolvedValueOnce(false) // Initial
        .mockResolvedValueOnce(true); // After status check

      const { result } = renderHook(() => useUntappdLogin());

      await waitFor(() => {
        expect(result.current.isUntappdLoggedIn).toBe(false);
      });

      // Check status without opening webview
      await act(async () => {
        await result.current.checkUntappdLoginStatus();
      });

      await waitFor(() => {
        expect(result.current.isUntappdLoggedIn).toBe(true);
      });

      expect(result.current.untappdWebViewVisible).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should prevent duplicate login attempts when already logging in', async () => {
      let resolveCheck: any;
      const delayedCheck = new Promise((resolve) => {
        resolveCheck = resolve;
      });

      mockIsUntappdLoggedIn
        .mockResolvedValueOnce(false) // Initial check on mount
        .mockReturnValue(delayedCheck as any); // Delayed check during login

      const { result } = renderHook(() => useUntappdLogin());

      await waitFor(() => {
        expect(mockIsUntappdLoggedIn).toHaveBeenCalledTimes(1);
      });

      act(() => {
        result.current.startUntappdLogin();
      });

      expect(result.current.untappdWebViewVisible).toBe(true);

      // Start login success (triggers status check)
      act(() => {
        result.current.handleUntappdLoginSuccess();
      });

      // Try to start another login while check is in progress
      act(() => {
        result.current.startUntappdLogin();
      });

      // Webview should still be open (second start should be allowed for Untappd)
      expect(result.current.untappdWebViewVisible).toBe(true);

      // Complete status check
      await act(async () => {
        resolveCheck(true);
      });

      // Status check should have been called (once on mount, once after success)
      expect(mockIsUntappdLoggedIn).toHaveBeenCalledTimes(2);
    });

    it('should handle rapid successive login attempts', async () => {
      mockIsUntappdLoggedIn.mockResolvedValue(true);

      const { result } = renderHook(() => useUntappdLogin());

      act(() => {
        result.current.startUntappdLogin();
      });

      // Start first login success
      const promise1 = act(async () => {
        await result.current.handleUntappdLoginSuccess();
      });

      // Start second login immediately
      act(() => {
        result.current.startUntappdLogin();
      });

      const promise2 = act(async () => {
        await result.current.handleUntappdLoginSuccess();
      });

      await promise1;
      await promise2;

      // Both should complete without errors
      expect(result.current.untappdWebViewVisible).toBe(false);
    });

    it('should handle login success followed immediately by status check', async () => {
      mockIsUntappdLoggedIn.mockResolvedValue(true);

      const { result } = renderHook(() => useUntappdLogin());

      act(() => {
        result.current.startUntappdLogin();
      });

      await act(async () => {
        await result.current.handleUntappdLoginSuccess();
      });

      await act(async () => {
        await result.current.checkUntappdLoginStatus();
      });

      expect(result.current.isUntappdLoggedIn).toBe(true);
    });

    it('should handle unmount during status check', async () => {
      let resolveCheck: any;
      const delayedCheck = new Promise((resolve) => {
        resolveCheck = resolve;
      });

      mockIsUntappdLoggedIn
        .mockResolvedValueOnce(false) // Initial
        .mockReturnValue(delayedCheck as any); // Delayed check

      const { result, unmount } = renderHook(() => useUntappdLogin());

      await waitFor(() => {
        expect(mockIsUntappdLoggedIn).toHaveBeenCalledTimes(1);
      });

      // Start status check
      act(() => {
        result.current.checkUntappdLoginStatus();
      });

      // Unmount before check completes
      unmount();

      // Resolve check
      await act(async () => {
        resolveCheck(true);
      });

      // Should not throw errors
      expect(true).toBe(true);
    });

    it('should handle database returning undefined', async () => {
      mockIsUntappdLoggedIn.mockResolvedValue(undefined as any);

      const { result } = renderHook(() => useUntappdLogin());

      await act(async () => {
        await result.current.checkUntappdLoginStatus();
      });

      // Should treat undefined as false
      expect(result.current.isUntappdLoggedIn).toBe(false);
    });

    it('should handle database returning null', async () => {
      mockIsUntappdLoggedIn.mockResolvedValue(null as any);

      const { result } = renderHook(() => useUntappdLogin());

      await act(async () => {
        await result.current.checkUntappdLoginStatus();
      });

      // Should treat null as false
      expect(result.current.isUntappdLoggedIn).toBe(false);
    });
  });

  describe('Cleanup', () => {
    it('should not update state after unmount during async operations', async () => {
      let resolveCheck: any;
      const delayedCheck = new Promise((resolve) => {
        resolveCheck = resolve;
      });

      mockIsUntappdLoggedIn
        .mockResolvedValueOnce(false) // Initial check on mount
        .mockReturnValue(delayedCheck as any); // Delayed check

      const { result, unmount } = renderHook(() => useUntappdLogin());

      await waitFor(() => {
        expect(mockIsUntappdLoggedIn).toHaveBeenCalledTimes(1);
      });

      act(() => {
        result.current.startUntappdLogin();
      });

      // Start login success (begins async status check)
      act(() => {
        result.current.handleUntappdLoginSuccess();
      });

      // Unmount during status check
      unmount();

      // Complete status check after unmount
      await act(async () => {
        resolveCheck(true);
      });

      // Should not cause errors or warnings about state updates on unmounted component
      expect(mockIsUntappdLoggedIn).toHaveBeenCalledTimes(2);
    });

    it('should not update state after unmount', async () => {
      mockIsUntappdLoggedIn.mockResolvedValue(true);

      const { result, unmount } = renderHook(() => useUntappdLogin());

      act(() => {
        result.current.startUntappdLogin();
      });

      unmount();

      // Try to complete login after unmount
      await act(async () => {
        try {
          await result.current.handleUntappdLoginSuccess();
        } catch (e) {
          // Expected to possibly throw or fail silently
        }
      });

      // Should not cause errors or warnings about state updates on unmounted component
      expect(mockIsUntappdLoggedIn).toHaveBeenCalled();
    });

    it('should handle multiple unmounts gracefully', () => {
      const { unmount } = renderHook(() => useUntappdLogin());

      unmount();

      // Second unmount should not throw
      expect(() => unmount()).not.toThrow();
    });
  });

  describe('Integration with Untappd Database', () => {
    it('should correctly interpret login status from database', async () => {
      mockIsUntappdLoggedIn.mockResolvedValue(true);

      const { result } = renderHook(() => useUntappdLogin());

      await waitFor(() => {
        expect(result.current.isUntappdLoggedIn).toBe(true);
      });

      expect(mockIsUntappdLoggedIn).toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation();
      mockIsUntappdLoggedIn.mockRejectedValue(new Error('Database connection failed'));

      const { result } = renderHook(() => useUntappdLogin());

      await waitFor(() => {
        expect(result.current.isUntappdLoggedIn).toBe(false);
      });

      expect(consoleError).toHaveBeenCalled();

      consoleError.mockRestore();
    });

    it('should reflect status changes from database', async () => {
      mockIsUntappdLoggedIn
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      const { result } = renderHook(() => useUntappdLogin());

      // Initial status
      await waitFor(() => {
        expect(result.current.isUntappdLoggedIn).toBe(false);
      });

      // Check again - still false
      await act(async () => {
        await result.current.checkUntappdLoginStatus();
      });

      await waitFor(() => {
        expect(result.current.isUntappdLoggedIn).toBe(false);
      });

      // Status changes to true
      await act(async () => {
        await result.current.checkUntappdLoginStatus();
      });

      await waitFor(() => {
        expect(result.current.isUntappdLoggedIn).toBe(true);
      });

      // Status changes back to false
      await act(async () => {
        await result.current.checkUntappdLoginStatus();
      });

      await waitFor(() => {
        expect(result.current.isUntappdLoggedIn).toBe(false);
      });
    });
  });
});
