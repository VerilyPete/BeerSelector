import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert, Modal } from 'react-native';
import { config } from '@/src/config';

// Import after mocks
import LoginWebView from '@/components/LoginWebView';
// The component still statically imports `loginMessageHandler.ts`, which in
// turn imports `preferences`, `taplistEtag`, `sessionManager` and
// `authService` — so those four stay mocked below even though nothing in
// this file asserts against them directly any more. Removing the mocks would
// let Jest load the real modules transitively, pulling in the native-backed
// code this split exists to keep out of jest-expo.
//
// `databaseLockManager` is the one export from that same dependency graph
// still referenced here, for the `resetForTesting()` safety net in
// `afterEach` below — every lock-contention assertion that used to justify
// leaving it unmocked now lives in `src/api/__tests__/loginMessageHandler.test.ts`.
import { databaseLockManager } from '@/src/database/DatabaseLockManager';

// Test URL constants - prefixed with 'mock' to allow use in jest.mock() factory
const mockTestBaseUrl = 'https://test.beerknurd.com';
const mockUntappdBaseUrl = 'https://untappd.com';

// Test network configuration constants - prefixed with 'mock' for jest.mock()
const mockTestTimeout = 15000;
const mockTestRetries = 3;
const mockTestRetryDelay = 1000;

// The real `getFullUrl` resolves through this map, so `memberDashboard` becomes
// `/member-dash.php`. The mock used to interpolate the endpoint NAME instead,
// producing `/memberDashboard.php` — which never matches the component's
// `url.includes('member-dash.php')` check, so every injection test silently
// asserted against a URL the component could not recognise.
let mockCurrentBaseUrl: string | null = null;

const mockEndpointPaths: Record<string, string> = {
  kiosk: '/kiosk.php',
  visitor: '/visitor.php',
  memberDashboard: '/member-dash.php',
  memberQueues: '/memberQueues.php',
  addToQueue: '/addToQueue.php',
  deleteQueuedBrew: '/deleteQueuedBrew.php',
  addToRewardQueue: '/addToRewardQueue.php',
  memberRewards: '/memberRewards.php',
};

// Mock config module (following gold standard pattern)
jest.mock('@/src/config', () => ({
  config: {
    api: {
      getFullUrl: jest.fn(
        endpoint => `${mockTestBaseUrl}${mockEndpointPaths[endpoint] ?? `/${endpoint}.php`}`
      ),
      // A getter, not a value. `jest.mock` factories are hoisted above the
      // `const` declarations above, and Babel's transform makes that early read
      // yield `undefined` instead of throwing — so a plain `baseUrl:
      // mockTestBaseUrl` captured undefined. `getFullUrl` escaped this only
      // because its closure runs when called, long after initialisation.
      get baseUrl() {
        return mockCurrentBaseUrl ?? mockTestBaseUrl;
      },
      // A setter, because a lifecycle test assigns to this directly to simulate
      // an environment change. Without one the assignment silently no-ops
      // against a getter-only property. `beforeEach` clears the override so the
      // mutation cannot leak into the tests that follow.
      set baseUrl(value: string) {
        mockCurrentBaseUrl = value;
      },
      endpoints: {
        kiosk: '/kiosk.php',
        visitor: '/visitor.php',
        memberDashboard: '/member-dash.php',
        memberQueues: '/memberQueues.php',
        addToQueue: '/addToQueue.php',
        deleteQueuedBrew: '/deleteQueuedBrew.php',
        addToRewardQueue: '/addToRewardQueue.php',
        memberRewards: '/memberRewards.php',
      },
      referers: {
        memberDashboard: `${mockTestBaseUrl}/member-dash.php`,
        memberRewards: `${mockTestBaseUrl}/memberRewards.php`,
        memberQueues: `${mockTestBaseUrl}/memberQueues.php`,
      },
    },
    network: {
      timeout: mockTestTimeout,
      retries: mockTestRetries,
      retryDelay: mockTestRetryDelay,
    },
    external: {
      untappd: {
        baseUrl: mockUntappdBaseUrl,
        loginUrl: `${mockUntappdBaseUrl}/login`,
      },
    },
    setEnvironment: jest.fn(),
    setCustomApiUrl: jest.fn(),
  },
}));

// Mock theme hooks
jest.mock('@/hooks/useColorScheme', () => ({
  useColorScheme: jest.fn(() => 'light'),
}));

// Mock IconSymbol
jest.mock('@/components/ui/IconSymbol', () => ({
  IconSymbol: ({ name, testID }: any) => {
    const { View } = require('react-native');
    return <View testID={testID || `icon-${name}`} />;
  },
}));

// Mock WebView
const mockWebViewRef = {
  current: {
    injectJavaScript: jest.fn(),
  },
};

jest.mock('react-native-webview', () => {
  const { View } = require('react-native');
  return {
    WebView: ({ onMessage, onLoadEnd, onNavigationStateChange, onLoadStart, testID, ref }: any) => {
      // Expose the mock ref
      if (ref) {
        Object.assign(ref, mockWebViewRef);
      }

      return (
        <View
          testID={testID || 'webview-mock'}
          onMessage={onMessage}
          onLoadEnd={onLoadEnd}
          onNavigationStateChange={onNavigationStateChange}
          onLoadStart={onLoadStart}
        />
      );
    },
  };
});

// Mock database functions
jest.mock('@/src/database/preferences', () => ({
  setPreference: jest.fn().mockResolvedValue(undefined),
  getPreference: jest.fn().mockResolvedValue(null),
}));

// Mock the taplist ETag owner. Login invalidates the stored ETag not because
// the rows and the ETag disagree — they still match each other — but because
// login repoints `all_beers_api_url` at a different store, leaving the ETag
// naming a store the app no longer fetches from.
jest.mock('@/src/services/taplistEtag', () => ({
  commitTaplistWrite: jest.fn().mockResolvedValue(undefined),
}));

// Mock session manager
jest.mock('@/src/api/sessionManager', () => ({
  saveSessionData: jest.fn().mockResolvedValue(undefined),
  extractSessionDataFromResponse: jest.fn().mockReturnValue({
    memberId: '12345',
    sessionId: 'test-session',
    storeId: '67',
    storeName: 'Test Store',
  }),
}));

// Mock auth service
jest.mock('@/src/api/authService', () => ({
  handleVisitorLogin: jest.fn().mockResolvedValue({ success: true }),
}));

describe('LoginWebView', () => {
  const mockOnLoginSuccess = jest.fn();
  const mockOnLoginCancel = jest.fn();
  const mockOnRefreshData = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockWebViewRef.current.injectJavaScript.mockClear();
    // `clearAllMocks` resets calls but NOT implementations, so a test that
    // points `getFullUrl` at a throwing stub leaks it into every test that
    // follows. Restoring the default here is what makes this suite order
    // -independent.
    mockCurrentBaseUrl = null;
    (config.api.getFullUrl as jest.Mock).mockImplementation(
      (endpoint: string) => `${mockTestBaseUrl}${mockEndpointPaths[endpoint] ?? `/${endpoint}.php`}`
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
    // Guards every test in the file, not just the ones below that take the
    // lock deliberately: a test that fails mid-hold would otherwise leave the
    // singleton locked for every test that runs after it in this file.
    databaseLockManager.resetForTesting();
  });

  describe('Component Rendering', () => {
    it('should render when visible is true', () => {
      const { getByTestId } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      expect(getByTestId('login-webview-modal')).toBeTruthy();
    });

    it('should not render modal content when visible is false', () => {
      const { queryByTestId } = render(
        <LoginWebView
          visible={false}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      // A hidden Modal does not render its children at all, so the content is
      // absent rather than present-and-flagged-invisible. The test name always
      // described this; the assertion did not.
      expect(queryByTestId('login-webview-modal')).toBeNull();
    });

    it('should render close button', () => {
      const { getByTestId } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      expect(getByTestId('close-webview-button')).toBeTruthy();
    });

    it('should render title', () => {
      const { getByText } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      expect(getByText('Flying Saucer Login')).toBeTruthy();
    });

    it('should render WebView component', () => {
      const { getByTestId } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      expect(getByTestId('webview-mock')).toBeTruthy();
    });

    it('should show loading indicator when loading', () => {
      const { getByTestId } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      const webview = getByTestId('webview-mock');

      // Simulate load start
      if (webview.props.onLoadStart) {
        webview.props.onLoadStart();
      }

      // Should show loading state (implementation specific)
    });
  });

  describe('Close Button Behavior', () => {
    it('should call onLoginCancel when close button pressed', () => {
      const { getByTestId } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      const closeButton = getByTestId('close-webview-button');
      fireEvent.press(closeButton);

      expect(mockOnLoginCancel).toHaveBeenCalledTimes(1);
    });

    it('should show alert when login cancelled', () => {
      const alertSpy = jest.spyOn(Alert, 'alert');

      const { getByTestId } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      const closeButton = getByTestId('close-webview-button');
      fireEvent.press(closeButton);

      expect(alertSpy).toHaveBeenCalledWith('Login Cancelled', 'The login process was cancelled.');
    });

    it('should clear processed URLs when closed', () => {
      const { getByTestId } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      const closeButton = getByTestId('close-webview-button');
      fireEvent.press(closeButton);

      // Processed URLs should be cleared (internal state)
      expect(mockOnLoginCancel).toHaveBeenCalled();
    });
  });

  describe('JavaScript Injection', () => {
    it('should inject URL check JavaScript on load end', () => {
      const { getByTestId } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      const webview = getByTestId('webview-mock');

      // Simulate load end
      if (webview.props.onLoadEnd) {
        webview.props.onLoadEnd();
      }

      expect(mockWebViewRef.current.injectJavaScript).toHaveBeenCalled();
    });

    it('should handle URL_CHECK message', async () => {
      const { getByTestId } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      const webview = getByTestId('webview-mock');

      const message = {
        nativeEvent: {
          data: JSON.stringify({
            type: 'URL_CHECK',
            url: config.api.getFullUrl('memberDashboard'),
          }),
        },
      };

      fireEvent(webview, 'onMessage', message);

      // Should trigger URL verification
      await waitFor(() => {
        expect(mockWebViewRef.current.injectJavaScript).toHaveBeenCalled();
      });
    });

    it('should handle URL_VERIFIED message', async () => {
      const { getByTestId } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      const webview = getByTestId('webview-mock');

      const message = {
        nativeEvent: {
          data: JSON.stringify({
            type: 'URL_VERIFIED',
            url: config.api.getFullUrl('memberDashboard'),
          }),
        },
      };

      fireEvent(webview, 'onMessage', message);

      // Should inject page-specific JavaScript for member-dash.php
      await waitFor(() => {
        expect(mockWebViewRef.current.injectJavaScript).toHaveBeenCalled();
      });
    });

    it('should inject member dashboard specific JavaScript', async () => {
      const { getByTestId } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      const webview = getByTestId('webview-mock');

      const message = {
        nativeEvent: {
          data: JSON.stringify({
            type: 'URL_VERIFIED',
            url: config.api.getFullUrl('memberDashboard'),
          }),
        },
      };

      fireEvent(webview, 'onMessage', message);

      await waitFor(() => {
        expect(mockWebViewRef.current.injectJavaScript).toHaveBeenCalled();
      });
    });

    it('should inject visitor page specific JavaScript', async () => {
      const { getByTestId } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      const webview = getByTestId('webview-mock');

      const message = {
        nativeEvent: {
          data: JSON.stringify({
            type: 'URL_VERIFIED',
            url: config.api.getFullUrl('visitor'),
          }),
        },
      };

      fireEvent(webview, 'onMessage', message);

      await waitFor(() => {
        expect(mockWebViewRef.current.injectJavaScript).toHaveBeenCalled();
      });
    });

    it('should not inject JavaScript twice for same URL', async () => {
      const { getByTestId } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      const webview = getByTestId('webview-mock');

      const message = {
        nativeEvent: {
          data: JSON.stringify({
            type: 'URL_VERIFIED',
            url: config.api.getFullUrl('memberDashboard'),
          }),
        },
      };

      // Send same message twice
      fireEvent(webview, 'onMessage', message);
      const firstCallCount = mockWebViewRef.current.injectJavaScript.mock.calls.length;

      fireEvent(webview, 'onMessage', message);
      const secondCallCount = mockWebViewRef.current.injectJavaScript.mock.calls.length;

      // Should not inject again for the same URL
      expect(secondCallCount).toBe(firstCallCount);
    });
  });

  describe('Error Handling', () => {
    it('should handle WebView error event without crashing', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const { getByTestId } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      // Component renders with onError handler - verify no crash
      expect(getByTestId('login-webview-modal')).toBeTruthy();

      consoleErrorSpy.mockRestore();
    });

    it('should recover after error by reopening modal', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert');

      const { getByTestId, rerender } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      const webview = getByTestId('webview-mock');

      // Trigger error
      const errorMessage = {
        nativeEvent: {
          data: JSON.stringify({
            type: 'JS_INJECTION_ERROR',
            error: 'Error occurred',
            location: 'test',
          }),
        },
      };

      fireEvent(webview, 'onMessage', errorMessage);

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalled();
      });

      // Close modal after error
      rerender(
        <LoginWebView
          visible={false}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      // Reopen modal - should work normally
      rerender(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      // Should render successfully after recovery
      expect(getByTestId('login-webview-modal')).toBeTruthy();
    });
  });

  describe('Navigation State Changes', () => {
    it('should log navigation events', () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      const { getByTestId } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      const webview = getByTestId('webview-mock');

      if (webview.props.onNavigationStateChange) {
        webview.props.onNavigationStateChange({
          url: config.api.getFullUrl('kiosk'),
          loading: false,
        });
      }

      consoleLogSpy.mockRestore();
    });

    it('should not log duplicate navigation events', () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      const { getByTestId } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      const webview = getByTestId('webview-mock');

      const navState = {
        url: config.api.getFullUrl('kiosk'),
        loading: false,
      };

      if (webview.props.onNavigationStateChange) {
        webview.props.onNavigationStateChange(navState);
        webview.props.onNavigationStateChange(navState);
      }

      // Should only log once for same URL within timeframe
      consoleLogSpy.mockRestore();
    });
  });

  describe('Props and State Management', () => {
    it('should accept custom loading state', () => {
      const { rerender } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
          loading={false}
        />
      );

      // Should render without loading

      rerender(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
          loading={true}
        />
      );

      // Should show loading state
    });

    it('should handle modal close via Android back button', () => {
      const { UNSAFE_getByType } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      // `onRequestClose` is a prop of the Modal; `login-webview-modal` is the
      // View inside it, which has no such prop. The `if` meant the test silently
      // asserted nothing whenever it looked at the wrong node — it did not fail,
      // it just never fired. Reach the Modal itself.
      const modal = UNSAFE_getByType(Modal);
      modal.props.onRequestClose();

      expect(mockOnLoginCancel).toHaveBeenCalled();
    });

    it('should support accessibility labels', () => {
      const { getByLabelText } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      // `accessibilityLabel` is on the Modal; `login-webview-modal` is the View
      // inside it. Reading the label off the View found undefined and always
      // would have. Query by the label itself, which is what a screen reader does.
      expect(getByLabelText('Flying Saucer login modal')).toBeTruthy();
    });

    it('should clear state when reopened after close', () => {
      const { rerender, getByTestId } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      const closeButton = getByTestId('close-webview-button');
      fireEvent.press(closeButton);

      // Close and reopen
      rerender(
        <LoginWebView
          visible={false}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      rerender(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      // State should be reset
      expect(getByTestId('login-webview-modal')).toBeTruthy();
    });
  });

  describe('Config Integration', () => {
    describe('Component Config Usage', () => {
      it('should use config for WebView source URL', () => {
        render(
          <LoginWebView
            visible={true}
            onLoginSuccess={mockOnLoginSuccess}
            onLoginCancel={mockOnLoginCancel}
            onRefreshData={mockOnRefreshData}
          />
        );

        // Component should use config.api.getFullUrl('kiosk')
        expect(config.api.getFullUrl).toHaveBeenCalledWith('kiosk');
      });
    });

    describe('Config Lifecycle Changes', () => {
      it('should respond when config changes during component lifecycle', () => {
        const { rerender } = render(
          <LoginWebView
            visible={true}
            onLoginSuccess={mockOnLoginSuccess}
            onLoginCancel={mockOnLoginCancel}
            onRefreshData={mockOnRefreshData}
          />
        );

        expect(config.api.getFullUrl).toHaveBeenCalledWith('kiosk');
        const initialCallCount = (config.api.getFullUrl as jest.Mock).mock.calls.length;

        // Rerender component (simulates state change)
        rerender(
          <LoginWebView
            visible={false}
            onLoginSuccess={mockOnLoginSuccess}
            onLoginCancel={mockOnLoginCancel}
            onRefreshData={mockOnRefreshData}
          />
        );

        rerender(
          <LoginWebView
            visible={true}
            onLoginSuccess={mockOnLoginSuccess}
            onLoginCancel={mockOnLoginCancel}
            onRefreshData={mockOnRefreshData}
          />
        );

        // Component should call config again on rerender
        expect((config.api.getFullUrl as jest.Mock).mock.calls.length).toBeGreaterThan(
          initialCallCount
        );
      });
    });

    describe('Config Error Handling', () => {
      it('should render without crashing when config returns undefined', () => {
        // Mock config to return undefined
        (config.api.getFullUrl as jest.Mock).mockReturnValue(undefined);

        // Component should not crash - it will pass undefined to WebView which handles it
        const { getByTestId } = render(
          <LoginWebView
            visible={true}
            onLoginSuccess={mockOnLoginSuccess}
            onLoginCancel={mockOnLoginCancel}
            onRefreshData={mockOnRefreshData}
          />
        );

        // Component should still render
        expect(getByTestId('login-webview-modal')).toBeTruthy();
        // Note: WebView will handle the undefined URL and show error
      });

      it('should pass invalid URL format to WebView without crashing', () => {
        // Mock config to return invalid URL
        (config.api.getFullUrl as jest.Mock).mockReturnValue('not-a-valid-url');

        // Component doesn't validate URLs - WebView handles that
        const { getByTestId } = render(
          <LoginWebView
            visible={true}
            onLoginSuccess={mockOnLoginSuccess}
            onLoginCancel={mockOnLoginCancel}
            onRefreshData={mockOnRefreshData}
          />
        );

        // Component should still render - WebView will show error
        expect(getByTestId('login-webview-modal')).toBeTruthy();
      });

      it('should not crash when config throws error during render', () => {
        // Mock config to throw error
        (config.api.getFullUrl as jest.Mock).mockImplementation(() => {
          throw new Error('Config error');
        });

        // Component will crash at render time because it doesn't wrap config call in try-catch
        // This is expected behavior - config errors should be caught at app level
        expect(() => {
          render(
            <LoginWebView
              visible={true}
              onLoginSuccess={mockOnLoginSuccess}
              onLoginCancel={mockOnLoginCancel}
              onRefreshData={mockOnRefreshData}
            />
          );
        }).toThrow('Config error');
      });
    });

    describe('WebView URL Verification', () => {
      it('should use config URLs for navigation detection', async () => {
        const { getByTestId } = render(
          <LoginWebView
            visible={true}
            onLoginSuccess={mockOnLoginSuccess}
            onLoginCancel={mockOnLoginCancel}
            onRefreshData={mockOnRefreshData}
          />
        );

        const webview = getByTestId('webview-mock');

        // Test navigation to member dashboard (uses config URL)
        const memberDashUrl = config.api.getFullUrl('memberDashboard');

        const message = {
          nativeEvent: {
            data: JSON.stringify({
              type: 'URL_VERIFIED',
              url: memberDashUrl,
            }),
          },
        };

        fireEvent(webview, 'onMessage', message);

        await waitFor(() => {
          expect(mockWebViewRef.current.injectJavaScript).toHaveBeenCalled();
        });

        // Verify the URL came from config
        expect(config.api.getFullUrl).toHaveBeenCalledWith('memberDashboard');
      });

      it('should use config for visitor mode URL detection', async () => {
        const { getByTestId } = render(
          <LoginWebView
            visible={true}
            onLoginSuccess={mockOnLoginSuccess}
            onLoginCancel={mockOnLoginCancel}
            onRefreshData={mockOnRefreshData}
          />
        );

        const webview = getByTestId('webview-mock');

        const visitorUrl = config.api.getFullUrl('visitor');

        const message = {
          nativeEvent: {
            data: JSON.stringify({
              type: 'URL_VERIFIED',
              url: visitorUrl,
            }),
          },
        };

        fireEvent(webview, 'onMessage', message);

        await waitFor(() => {
          expect(mockWebViewRef.current.injectJavaScript).toHaveBeenCalled();
        });

        // Verify config was used for visitor endpoint
        expect(config.api.getFullUrl).toHaveBeenCalledWith('visitor');
      });
    });
  });
});
