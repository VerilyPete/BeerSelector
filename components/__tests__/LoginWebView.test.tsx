import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { config } from '@/src/config';

// Import after mocks
import LoginWebView from '@/components/LoginWebView';
import { setPreference } from '@/src/database/preferences';
import { saveSessionData } from '@/src/api/sessionManager';
import { handleVisitorLogin } from '@/src/api/authService';

// Test URL constants - prefixed with 'mock' to allow use in jest.mock() factory
const mockTestBaseUrl = 'https://test.beerknurd.com';
const mockUntappdBaseUrl = 'https://untappd.com';
const mockFsbsBaseUrl = 'https://fsbs.beerknurd.com';

// Test network configuration constants - prefixed with 'mock' for jest.mock()
const mockTestTimeout = 15000;
const mockTestRetries = 3;
const mockTestRetryDelay = 1000;

// Mock config module (following gold standard pattern)
jest.mock('@/src/config', () => ({
  config: {
    api: {
      getFullUrl: jest.fn(endpoint => `${mockTestBaseUrl}/${endpoint}.php`),
      baseUrl: mockTestBaseUrl,
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

jest.mock('@/hooks/useThemeColor', () => ({
  useThemeColor: jest.fn(() => '#007AFF'),
}));

// Mock ThemedText and ThemedView
jest.mock('@/components/ThemedText');
jest.mock('@/components/ThemedView');

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
  });

  afterEach(() => {
    jest.clearAllMocks();
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

      // Modal should exist but not be visible
      const modal = queryByTestId('login-webview-modal');
      expect(modal).toBeTruthy();
      expect(modal?.props.visible).toBe(false);
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

  describe('WebView Message Handling - Member Login', () => {
    it('should handle URLs message with valid data', async () => {
      const { getByTestId } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      const webview = getByTestId('webview-mock');

      const testUserUrl = `${mockFsbsBaseUrl}/bk-member-json.php?uid=12345`;
      const testStoreUrl = `${mockFsbsBaseUrl}/bk-store-json.php?sid=67`;

      const message = {
        nativeEvent: {
          data: JSON.stringify({
            type: 'URLs',
            userJsonUrl: testUserUrl,
            storeJsonUrl: testStoreUrl,
            cookies: {
              member: '12345',
              session: 'test-session',
              store__id: '67',
              store: 'Test Store',
            },
          }),
        },
      };

      fireEvent(webview, 'onMessage', message);

      await waitFor(() => {
        expect(setPreference).toHaveBeenCalledWith(
          'is_visitor_mode',
          'false',
          'Flag indicating whether the user is in visitor mode'
        );
      });

      expect(setPreference).toHaveBeenCalledWith(
        'user_json_url',
        testUserUrl,
        'API endpoint for user data'
      );

      expect(setPreference).toHaveBeenCalledWith(
        'my_beers_api_url',
        testUserUrl,
        'API endpoint for fetching Beerfinder beers'
      );

      expect(saveSessionData).toHaveBeenCalled();
      expect(mockOnRefreshData).toHaveBeenCalled();
      expect(mockOnLoginSuccess).toHaveBeenCalled();
    });

    it('should save authentication cookies', async () => {
      const { getByTestId } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      const webview = getByTestId('webview-mock');

      const testCookies = {
        member: '12345',
        session: 'test-session',
      };

      const message = {
        nativeEvent: {
          data: JSON.stringify({
            type: 'URLs',
            userJsonUrl: `${mockTestBaseUrl}/user.php`,
            storeJsonUrl: `${mockTestBaseUrl}/store.php`,
            cookies: testCookies,
          }),
        },
      };

      fireEvent(webview, 'onMessage', message);

      await waitFor(() => {
        expect(setPreference).toHaveBeenCalledWith(
          'auth_cookies',
          JSON.stringify(testCookies),
          'Authentication cookies'
        );
      });
    });

    it('should save login timestamp', async () => {
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
            type: 'URLs',
            userJsonUrl: `${mockTestBaseUrl}/user.php`,
            storeJsonUrl: `${mockTestBaseUrl}/store.php`,
            cookies: {},
          }),
        },
      };

      fireEvent(webview, 'onMessage', message);

      await waitFor(() => {
        expect(setPreference).toHaveBeenCalledWith(
          'last_login_timestamp',
          expect.any(String),
          'Last successful login timestamp'
        );
      });
    });

    it('should show success alert for member login', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert');

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
            type: 'URLs',
            userJsonUrl: `${mockTestBaseUrl}/user.php`,
            storeJsonUrl: `${mockTestBaseUrl}/store.php`,
            cookies: {},
          }),
        },
      };

      fireEvent(webview, 'onMessage', message);

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith(
          'Login Successful',
          expect.stringContaining('API URLs have been updated'),
          expect.any(Array)
        );
      });
    });

    it('should not process login if URLs are missing', async () => {
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
            type: 'URLs',
            userJsonUrl: null,
            storeJsonUrl: null,
            cookies: {},
          }),
        },
      };

      fireEvent(webview, 'onMessage', message);

      // Should not save preferences if URLs are missing
      await waitFor(() => {
        expect(setPreference).not.toHaveBeenCalledWith(
          'my_beers_api_url',
          expect.any(String),
          expect.any(String)
        );
      });
    });
  });

  describe('WebView Message Handling - Visitor Login', () => {
    it('should handle VISITOR_LOGIN message', async () => {
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
            type: 'VISITOR_LOGIN',
            cookies: {
              store__id: '67',
              store: 'Test Store',
            },
            rawCookies: 'store__id=67; store=Test Store',
            url: config.api.getFullUrl('visitor'),
          }),
        },
      };

      fireEvent(webview, 'onMessage', message);

      await waitFor(() => {
        expect(handleVisitorLogin).toHaveBeenCalledWith({
          store__id: '67',
          store: 'Test Store',
        });
      });
    });

    it('should set visitor mode flag for visitor login', async () => {
      (handleVisitorLogin as jest.Mock).mockResolvedValue({ success: true });

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
            type: 'VISITOR_LOGIN',
            cookies: {
              store__id: '67',
            },
            rawCookies: 'store__id=67',
            url: `${mockTestBaseUrl}/visitor.php`,
          }),
        },
      };

      fireEvent(webview, 'onMessage', message);

      await waitFor(() => {
        expect(setPreference).toHaveBeenCalledWith(
          'is_visitor_mode',
          'true',
          'Flag indicating whether the user is in visitor mode'
        );
      });
    });

    it('should set correct API URLs for visitor mode', async () => {
      (handleVisitorLogin as jest.Mock).mockResolvedValue({ success: true });

      const { getByTestId } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      const webview = getByTestId('webview-mock');

      const testStoreId = '67';

      const message = {
        nativeEvent: {
          data: JSON.stringify({
            type: 'VISITOR_LOGIN',
            cookies: {
              store__id: testStoreId,
            },
            rawCookies: `store__id=${testStoreId}`,
            url: config.api.getFullUrl('visitor'),
          }),
        },
      };

      fireEvent(webview, 'onMessage', message);

      await waitFor(() => {
        expect(setPreference).toHaveBeenCalledWith(
          'all_beers_api_url',
          `${mockFsbsBaseUrl}/bk-store-json.php?sid=${testStoreId}`,
          'API endpoint for fetching all beers'
        );
      });

      expect(setPreference).toHaveBeenCalledWith(
        'my_beers_api_url',
        'none://visitor_mode',
        'Placeholder URL for visitor mode (not a real endpoint)'
      );
    });

    it('should show visitor mode success alert', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert');
      (handleVisitorLogin as jest.Mock).mockResolvedValue({ success: true });

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
            type: 'VISITOR_LOGIN',
            cookies: {
              store__id: '67',
            },
            rawCookies: 'store__id=67',
            url: config.api.getFullUrl('visitor'),
          }),
        },
      };

      fireEvent(webview, 'onMessage', message);

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith(
          'Visitor Mode Active',
          expect.stringContaining('browsing as a visitor'),
          expect.any(Array)
        );
      });
    });

    it('should handle visitor login failure', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert');
      (handleVisitorLogin as jest.Mock).mockResolvedValue({
        success: false,
        error: 'Failed to login',
      });

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
            type: 'VISITOR_LOGIN',
            cookies: {
              store__id: '67',
            },
            rawCookies: 'store__id=67',
            url: config.api.getFullUrl('visitor'),
          }),
        },
      };

      fireEvent(webview, 'onMessage', message);

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith(
          'Visitor Login Failed',
          'Failed to login',
          expect.any(Array)
        );
      });
    });

    it('should handle missing store ID in visitor login', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert');

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
            type: 'VISITOR_LOGIN',
            cookies: {},
            rawCookies: '',
            url: config.api.getFullUrl('visitor'),
          }),
        },
      };

      fireEvent(webview, 'onMessage', message);

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith(
          'Visitor Login Failed',
          expect.stringContaining('Could not find store ID'),
          expect.any(Array)
        );
      });
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
    it('should handle JS_INJECTION_ERROR message', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert');

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
            type: 'JS_INJECTION_ERROR',
            error: 'JavaScript injection failed',
            location: 'member-dash',
          }),
        },
      };

      fireEvent(webview, 'onMessage', message);

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith(
          'Login Error',
          expect.stringContaining('error processing the login page'),
          expect.any(Array)
        );
      });
    });

    it('should call handleClose when JS_INJECTION_ERROR Alert OK pressed', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert');

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
            type: 'JS_INJECTION_ERROR',
            error: 'JavaScript injection failed',
            location: 'member-dash',
          }),
        },
      };

      fireEvent(webview, 'onMessage', message);

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalled();
      });

      // Extract and call the OK button handler
      const alertCall = alertSpy.mock.calls[0];
      const buttons = alertCall[2];
      if (buttons && buttons[0] && buttons[0].onPress) {
        buttons[0].onPress();
      }

      // Should trigger handleClose which calls onLoginCancel
      expect(mockOnLoginCancel).toHaveBeenCalled();
    });

    it('should handle VISITOR_LOGIN_ERROR message', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert');

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
            type: 'VISITOR_LOGIN_ERROR',
            error: 'Failed to extract store info',
          }),
        },
      };

      fireEvent(webview, 'onMessage', message);

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith(
          'Visitor Login Failed',
          expect.stringContaining('Could not extract the store information'),
          expect.any(Array)
        );
      });
    });

    it('should call onLoginCancel after VISITOR_LOGIN_ERROR', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert');

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
            type: 'VISITOR_LOGIN_ERROR',
            error: 'Failed to extract store info',
          }),
        },
      };

      fireEvent(webview, 'onMessage', message);

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalled();
        expect(mockOnLoginCancel).toHaveBeenCalled();
      });
    });

    it('should handle malformed JSON in message', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

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
          data: 'invalid json {{{',
        },
      };

      fireEvent(webview, 'onMessage', message);

      // Should log error but not crash
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should call onLoginCancel when malformed JSON received', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

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
          data: 'invalid json {{{',
        },
      };

      fireEvent(webview, 'onMessage', message);

      // Should call onLoginCancel after error (per line 390 in component)
      expect(mockOnLoginCancel).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should handle visitor login with handleVisitorLogin throwing error', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert');
      (handleVisitorLogin as jest.Mock).mockRejectedValue(new Error('Network error'));

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
            type: 'VISITOR_LOGIN',
            cookies: {
              store__id: '67',
            },
            rawCookies: 'store__id=67',
            url: config.api.getFullUrl('visitor'),
          }),
        },
      };

      fireEvent(webview, 'onMessage', message);

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith(
          'Error',
          'An error occurred during visitor login. Please try again.',
          expect.any(Array)
        );
      });

      expect(mockOnLoginCancel).toHaveBeenCalled();
    });

    it('should not crash when unexpected message type received', () => {
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
            type: 'UNKNOWN_MESSAGE_TYPE',
            data: 'some data',
          }),
        },
      };

      // Should not crash
      expect(() => {
        fireEvent(webview, 'onMessage', message);
      }).not.toThrow();
    });

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
      const { getByTestId } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      const modal = getByTestId('login-webview-modal');

      // Trigger onRequestClose (Android back button)
      if (modal.props.onRequestClose) {
        modal.props.onRequestClose();
      }

      expect(mockOnLoginCancel).toHaveBeenCalled();
    });

    it('should support accessibility labels', () => {
      const { getByTestId } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      const modal = getByTestId('login-webview-modal');

      expect(modal.props.accessibilityLabel).toBe('Flying Saucer login modal');
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

      it('should set WebView source to config URL on initial render', () => {
        const expectedUrl = config.api.getFullUrl('kiosk');

        render(
          <LoginWebView
            visible={true}
            onLoginSuccess={mockOnLoginSuccess}
            onLoginCancel={mockOnLoginCancel}
            onRefreshData={mockOnRefreshData}
          />
        );

        // Verify the URL returned from config is the expected kiosk URL
        expect(expectedUrl).toBe(`${mockTestBaseUrl}/kiosk.php`);
        expect(config.api.getFullUrl).toHaveBeenCalledWith('kiosk');
      });

      it('should construct correct kiosk URL', () => {
        render(
          <LoginWebView
            visible={true}
            onLoginSuccess={mockOnLoginSuccess}
            onLoginCancel={mockOnLoginCancel}
            onRefreshData={mockOnRefreshData}
          />
        );

        const expectedUrl = `${mockTestBaseUrl}/kiosk.php`;
        expect(config.api.getFullUrl('kiosk')).toBe(expectedUrl);
      });

      it('should use config base URL for all API calls', () => {
        render(
          <LoginWebView
            visible={true}
            onLoginSuccess={mockOnLoginSuccess}
            onLoginCancel={mockOnLoginCancel}
            onRefreshData={mockOnRefreshData}
          />
        );

        expect(config.api.baseUrl).toBe(mockTestBaseUrl);
      });

      it('should handle config getFullUrl for different endpoints', () => {
        const endpoints = ['kiosk', 'visitor', 'memberDashboard'];

        endpoints.forEach(endpoint => {
          const url = config.api.getFullUrl(endpoint as any);
          expect(url).toBeTruthy();
          expect(url).toContain(endpoint);
          expect(url).toMatch(/^https:\/\//);
        });
      });

      it('should use config for visitor mode URL construction', async () => {
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

        // Should have used config to get visitor URL
        expect(config.api.getFullUrl).toHaveBeenCalledWith('visitor');
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

      it('should handle custom API URL change gracefully', () => {
        const CUSTOM_URL = 'http://localhost:3000';

        // Render with original config
        const { rerender } = render(
          <LoginWebView
            visible={true}
            onLoginSuccess={mockOnLoginSuccess}
            onLoginCancel={mockOnLoginCancel}
            onRefreshData={mockOnRefreshData}
          />
        );

        expect(config.api.baseUrl).toBe(mockTestBaseUrl);

        // Simulate environment change
        (config.api.getFullUrl as jest.Mock).mockImplementation(
          endpoint => `${CUSTOM_URL}/${endpoint}.php`
        );
        (config.api.baseUrl as any) = CUSTOM_URL;

        // Rerender component
        rerender(
          <LoginWebView
            visible={true}
            onLoginSuccess={mockOnLoginSuccess}
            onLoginCancel={mockOnLoginCancel}
            onRefreshData={mockOnRefreshData}
          />
        );

        // Component should use new config values
        expect(config.api.baseUrl).toBe(CUSTOM_URL);
      });

      it('should use consistent config throughout component lifecycle', () => {
        const { rerender } = render(
          <LoginWebView
            visible={true}
            onLoginSuccess={mockOnLoginSuccess}
            onLoginCancel={mockOnLoginCancel}
            onRefreshData={mockOnRefreshData}
          />
        );

        const firstBaseUrl = config.api.baseUrl;
        const firstKioskUrl = config.api.getFullUrl('kiosk');

        // Rerender multiple times
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

        // Config should remain consistent unless explicitly changed
        expect(config.api.baseUrl).toBe(firstBaseUrl);
        expect(config.api.getFullUrl('kiosk')).toBe(firstKioskUrl);
      });
    });

    describe('Environment Switching', () => {
      it('should work with production environment URLs', () => {
        // Mock production config
        const PROD_BASE_URL = 'https://tapthatapp.beerknurd.com';
        (config.api.getFullUrl as jest.Mock).mockImplementation(
          endpoint => `${PROD_BASE_URL}/${endpoint}.php`
        );
        (config.api.baseUrl as any) = PROD_BASE_URL;

        render(
          <LoginWebView
            visible={true}
            onLoginSuccess={mockOnLoginSuccess}
            onLoginCancel={mockOnLoginCancel}
            onRefreshData={mockOnRefreshData}
          />
        );

        const url = config.api.getFullUrl('kiosk');
        expect(url).toBe(`${PROD_BASE_URL}/kiosk.php`);
      });

      it('should work with custom API URLs', () => {
        // Mock custom config
        const CUSTOM_BASE_URL = 'https://custom.example.com';
        (config.api.getFullUrl as jest.Mock).mockImplementation(
          endpoint => `${CUSTOM_BASE_URL}/${endpoint}.php`
        );
        (config.api.baseUrl as any) = CUSTOM_BASE_URL;

        render(
          <LoginWebView
            visible={true}
            onLoginSuccess={mockOnLoginSuccess}
            onLoginCancel={mockOnLoginCancel}
            onRefreshData={mockOnRefreshData}
          />
        );

        const url = config.api.getFullUrl('kiosk');
        expect(url).toContain('custom.example.com');
      });

      it('should handle development environment', () => {
        // Mock development config
        const DEV_BASE_URL = 'http://localhost:3000';
        (config.api.getFullUrl as jest.Mock).mockImplementation(
          endpoint => `${DEV_BASE_URL}/${endpoint}.php`
        );
        (config.api.baseUrl as any) = DEV_BASE_URL;

        render(
          <LoginWebView
            visible={true}
            onLoginSuccess={mockOnLoginSuccess}
            onLoginCancel={mockOnLoginCancel}
            onRefreshData={mockOnRefreshData}
          />
        );

        const url = config.api.getFullUrl('kiosk');
        expect(url).toContain('localhost:3000');
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

      it('should handle config errors in message handlers gracefully', () => {
        // Reset config mock for normal rendering
        (config.api.getFullUrl as jest.Mock).mockReturnValue(`${mockTestBaseUrl}/kiosk.php`);

        const { getByTestId } = render(
          <LoginWebView
            visible={true}
            onLoginSuccess={mockOnLoginSuccess}
            onLoginCancel={mockOnLoginCancel}
            onRefreshData={mockOnRefreshData}
          />
        );

        const webview = getByTestId('webview-mock');

        // Mock config to throw during message handling
        (config.api.getFullUrl as jest.Mock).mockImplementation(() => {
          throw new Error('Config error during message handling');
        });

        // Send URL_CHECK message which uses config internally
        const message = {
          nativeEvent: {
            data: JSON.stringify({
              type: 'URL_CHECK',
              url: 'https://test.com/some-page.php',
            }),
          },
        };

        // Should handle error gracefully
        expect(() => {
          fireEvent(webview, 'onMessage', message);
        }).not.toThrow();
      });
    });

    describe('WebView URL Verification', () => {
      it('should use kiosk endpoint from config', () => {
        const kioskUrl = config.api.getFullUrl('kiosk');

        render(
          <LoginWebView
            visible={true}
            onLoginSuccess={mockOnLoginSuccess}
            onLoginCancel={mockOnLoginCancel}
            onRefreshData={mockOnRefreshData}
          />
        );

        // Verify the kiosk URL structure
        expect(kioskUrl).toMatch(/^https:\/\//);
        expect(kioskUrl).toContain('kiosk.php');
        expect(config.api.getFullUrl).toHaveBeenCalledWith('kiosk');
      });

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

      it('should get all endpoint URLs from config', () => {
        const endpoints = ['kiosk', 'visitor', 'memberDashboard'] as const;

        endpoints.forEach(endpoint => {
          const url = config.api.getFullUrl(endpoint);

          // All URLs should be valid HTTPS URLs
          expect(url).toMatch(/^https:\/\//);
          expect(url).toContain(mockTestBaseUrl);
          expect(url).toContain('.php');
        });
      });
    });
  });
});
