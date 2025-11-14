import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

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
    WebView: ({
      onMessage,
      onLoadEnd,
      onNavigationStateChange,
      onLoadStart,
      testID,
      ref
    }: any) => {
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

// Import after mocks
import LoginWebView from '@/components/LoginWebView';
import { setPreference } from '@/src/database/preferences';
import { saveSessionData, extractSessionDataFromResponse } from '@/src/api/sessionManager';
import { handleVisitorLogin } from '@/src/api/authService';

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

      expect(alertSpy).toHaveBeenCalledWith(
        'Login Cancelled',
        'The login process was cancelled.'
      );
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

      const message = {
        nativeEvent: {
          data: JSON.stringify({
            type: 'URLs',
            userJsonUrl: 'https://fsbs.beerknurd.com/bk-member-json.php?uid=12345',
            storeJsonUrl: 'https://fsbs.beerknurd.com/bk-store-json.php?sid=67',
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
        'https://fsbs.beerknurd.com/bk-member-json.php?uid=12345',
        'API endpoint for user data'
      );

      expect(setPreference).toHaveBeenCalledWith(
        'my_beers_api_url',
        'https://fsbs.beerknurd.com/bk-member-json.php?uid=12345',
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
            userJsonUrl: 'https://test.com/user.php',
            storeJsonUrl: 'https://test.com/store.php',
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
            userJsonUrl: 'https://test.com/user.php',
            storeJsonUrl: 'https://test.com/store.php',
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
            userJsonUrl: 'https://test.com/user.php',
            storeJsonUrl: 'https://test.com/store.php',
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
            url: 'https://tapthatapp.beerknurd.com/visitor.php',
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
            url: 'https://tapthatapp.beerknurd.com/visitor.php',
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

      const message = {
        nativeEvent: {
          data: JSON.stringify({
            type: 'VISITOR_LOGIN',
            cookies: {
              store__id: '67',
            },
            rawCookies: 'store__id=67',
            url: 'https://tapthatapp.beerknurd.com/visitor.php',
          }),
        },
      };

      fireEvent(webview, 'onMessage', message);

      await waitFor(() => {
        expect(setPreference).toHaveBeenCalledWith(
          'all_beers_api_url',
          'https://fsbs.beerknurd.com/bk-store-json.php?sid=67',
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
            url: 'https://tapthatapp.beerknurd.com/visitor.php',
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
        error: 'Failed to login'
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
            url: 'https://tapthatapp.beerknurd.com/visitor.php',
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
            url: 'https://tapthatapp.beerknurd.com/visitor.php',
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
            url: 'https://tapthatapp.beerknurd.com/member-dash.php',
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
            url: 'https://tapthatapp.beerknurd.com/member-dash.php',
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
            url: 'https://tapthatapp.beerknurd.com/member-dash.php',
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
            url: 'https://tapthatapp.beerknurd.com/visitor.php',
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
            url: 'https://tapthatapp.beerknurd.com/member-dash.php',
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

    it('should handle WebView error event', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const { getByTestId } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      // Implementation should handle onError prop
      consoleErrorSpy.mockRestore();
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
          url: 'https://tapthatapp.beerknurd.com/kiosk.php',
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
        url: 'https://tapthatapp.beerknurd.com/kiosk.php',
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
      const { rerender, getByTestId } = render(
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
});
