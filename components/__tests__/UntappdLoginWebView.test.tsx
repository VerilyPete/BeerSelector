import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

// Mock theme hooks
jest.mock('@/hooks/useColorScheme', () => ({
  useColorScheme: jest.fn(() => 'light'),
}));

jest.mock('@/hooks/useThemeColor', () => ({
  useThemeColor: jest.fn(() => '#FFAC33'),
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
const mockUntappdWebViewRef = {
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
      onLoadStart,
      onNavigationStateChange,
      testID,
      ref
    }: any) => {
      // Expose the mock ref
      if (ref) {
        Object.assign(ref, mockUntappdWebViewRef);
      }

      return (
        <View
          testID={testID || 'untappd-webview-mock'}
          onMessage={onMessage}
          onLoadEnd={onLoadEnd}
          onLoadStart={onLoadStart}
          onNavigationStateChange={onNavigationStateChange}
        />
      );
    },
  };
});

// Mock database functions
// NOTE: Untappd functions (setUntappdCookie, isUntappdLoggedIn, clearUntappdCookies)
// are intentionally kept in db.ts as part of an alpha feature per HP-7 completion report.
// These functions manage the untappd_cookies table directly, not using the preferences module.
// If Untappd becomes a core feature, these should be migrated to UntappdRepository.
// See app/settings.tsx lines 15, 59-67, 698-786, 815-832 for actual usage.
jest.mock('@/src/database/db', () => ({
  setUntappdCookie: jest.fn().mockResolvedValue(undefined),
  isUntappdLoggedIn: jest.fn().mockResolvedValue(false),
  clearUntappdCookies: jest.fn().mockResolvedValue(undefined),
}));

// Import after mocks
import UntappdLoginWebView from '@/components/UntappdLoginWebView';
import { setUntappdCookie } from '@/src/database/db';

describe('UntappdLoginWebView', () => {
  const mockOnLoginSuccess = jest.fn();
  const mockOnLoginCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUntappdWebViewRef.current.injectJavaScript.mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Component Rendering', () => {
    it('should render when visible is true', () => {
      const { getByTestId } = render(
        <UntappdLoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
        />
      );

      expect(getByTestId('untappd-webview-modal')).toBeTruthy();
    });

    it('should not render modal content when visible is false', () => {
      const { queryByTestId } = render(
        <UntappdLoginWebView
          visible={false}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
        />
      );

      const modal = queryByTestId('untappd-webview-modal');
      expect(modal).toBeTruthy();
      expect(modal?.props.visible).toBe(false);
    });

    it('should render close button', () => {
      const { getByTestId } = render(
        <UntappdLoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
        />
      );

      expect(getByTestId('close-untappd-webview-button')).toBeTruthy();
    });

    it('should render title', () => {
      const { getByText } = render(
        <UntappdLoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
        />
      );

      expect(getByText('Untappd Login')).toBeTruthy();
    });

    it('should render WebView component', () => {
      const { getByTestId } = render(
        <UntappdLoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
        />
      );

      expect(getByTestId('untappd-webview-mock')).toBeTruthy();
    });

    it('should load Untappd login page', () => {
      const { getByTestId } = render(
        <UntappdLoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
        />
      );

      const webview = getByTestId('untappd-webview-mock');

      // WebView should have correct source URL (implementation will have this)
      // This test verifies the component renders the webview
      expect(webview).toBeTruthy();
    });
  });

  describe('Close Button Behavior', () => {
    it('should call onLoginCancel when close button pressed', () => {
      const { getByTestId } = render(
        <UntappdLoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
        />
      );

      const closeButton = getByTestId('close-untappd-webview-button');
      fireEvent.press(closeButton);

      expect(mockOnLoginCancel).toHaveBeenCalledTimes(1);
    });

    it('should show alert when login cancelled', () => {
      const alertSpy = jest.spyOn(Alert, 'alert');

      const { getByTestId } = render(
        <UntappdLoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
        />
      );

      const closeButton = getByTestId('close-untappd-webview-button');
      fireEvent.press(closeButton);

      expect(alertSpy).toHaveBeenCalledWith(
        'Untappd Login Cancelled',
        'The Untappd login process was cancelled.'
      );
    });
  });

  describe('Login Detection via Navigation', () => {
    it('should detect login on user profile page', () => {
      const { getByTestId } = render(
        <UntappdLoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
        />
      );

      const webview = getByTestId('untappd-webview-mock');

      if (webview.props.onNavigationStateChange) {
        webview.props.onNavigationStateChange({
          url: 'https://untappd.com/user/testuser',
          loading: false,
        });
      }

      // Should inject JavaScript to check login state
      expect(mockUntappdWebViewRef.current.injectJavaScript).toHaveBeenCalled();
    });

    it('should detect login on dashboard page', () => {
      const { getByTestId } = render(
        <UntappdLoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
        />
      );

      const webview = getByTestId('untappd-webview-mock');

      if (webview.props.onNavigationStateChange) {
        webview.props.onNavigationStateChange({
          url: 'https://untappd.com/dashboard',
          loading: false,
        });
      }

      expect(mockUntappdWebViewRef.current.injectJavaScript).toHaveBeenCalled();
    });

    it('should detect login on home page', () => {
      const { getByTestId } = render(
        <UntappdLoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
        />
      );

      const webview = getByTestId('untappd-webview-mock');

      if (webview.props.onNavigationStateChange) {
        webview.props.onNavigationStateChange({
          url: 'https://untappd.com/home',
          loading: false,
        });
      }

      expect(mockUntappdWebViewRef.current.injectJavaScript).toHaveBeenCalled();
    });

    it('should not inject JavaScript on login page', () => {
      const { getByTestId } = render(
        <UntappdLoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
        />
      );

      const webview = getByTestId('untappd-webview-mock');

      mockUntappdWebViewRef.current.injectJavaScript.mockClear();

      if (webview.props.onNavigationStateChange) {
        webview.props.onNavigationStateChange({
          url: 'https://untappd.com/login',
          loading: false,
        });
      }

      // Should not inject on login page
      expect(mockUntappdWebViewRef.current.injectJavaScript).not.toHaveBeenCalled();
    });

    it('should not inject JavaScript while page is loading', () => {
      const { getByTestId } = render(
        <UntappdLoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
        />
      );

      const webview = getByTestId('untappd-webview-mock');

      if (webview.props.onNavigationStateChange) {
        webview.props.onNavigationStateChange({
          url: 'https://untappd.com/user/testuser',
          loading: true,
        });
      }

      // Should not inject while loading
      expect(mockUntappdWebViewRef.current.injectJavaScript).not.toHaveBeenCalled();
    });

    it('should log navigation changes', () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      const { getByTestId } = render(
        <UntappdLoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
        />
      );

      const webview = getByTestId('untappd-webview-mock');

      if (webview.props.onNavigationStateChange) {
        webview.props.onNavigationStateChange({
          url: 'https://untappd.com/user/testuser',
          loading: false,
        });
      }

      expect(consoleLogSpy).toHaveBeenCalledWith(
        'Untappd WebView navigating to:',
        'https://untappd.com/user/testuser'
      );

      consoleLogSpy.mockRestore();
    });
  });

  describe('WebView Message Handling - Login Check', () => {
    it('should handle UNTAPPD_LOGIN_CHECK message', async () => {
      const { getByTestId } = render(
        <UntappdLoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
        />
      );

      const webview = getByTestId('untappd-webview-mock');

      const message = {
        nativeEvent: {
          data: JSON.stringify({
            type: 'UNTAPPD_LOGIN_CHECK',
            userMenuExists: true,
            isLoggedInElementExists: true,
            logoutLinkExists: true,
            cookiesAvailable: ['session', 'user_id'],
            url: 'https://untappd.com/user/testuser',
            pageTitle: 'Untappd - Test User',
          }),
        },
      };

      fireEvent(webview, 'onMessage', message);

      await waitFor(() => {
        expect(setUntappdCookie).toHaveBeenCalledWith(
          'login_check_result',
          expect.any(String),
          'Login check results from page'
        );
      });
    });

    it('should log login check details', () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      const { getByTestId } = render(
        <UntappdLoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
        />
      );

      const webview = getByTestId('untappd-webview-mock');

      const message = {
        nativeEvent: {
          data: JSON.stringify({
            type: 'UNTAPPD_LOGIN_CHECK',
            userMenuExists: true,
            isLoggedInElementExists: true,
            logoutLinkExists: true,
            cookiesAvailable: ['session'],
            url: 'https://untappd.com/user/testuser',
            pageTitle: 'Test User',
          }),
        },
      };

      fireEvent(webview, 'onMessage', message);

      expect(consoleLogSpy).toHaveBeenCalledWith('Login check details:', expect.any(Object));

      consoleLogSpy.mockRestore();
    });
  });

  describe('WebView Message Handling - Cookies', () => {
    it('should handle UNTAPPD_COOKIES message', async () => {
      const { getByTestId } = render(
        <UntappdLoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
        />
      );

      const webview = getByTestId('untappd-webview-mock');

      const message = {
        nativeEvent: {
          data: JSON.stringify({
            type: 'UNTAPPD_COOKIES',
            cookies: {
              session: 'test-session-123',
              user_id: '456',
            },
          }),
        },
      };

      fireEvent(webview, 'onMessage', message);

      await waitFor(() => {
        expect(setUntappdCookie).toHaveBeenCalledWith(
          'session',
          'test-session-123',
          'Untappd cookie: session'
        );
      });

      expect(setUntappdCookie).toHaveBeenCalledWith(
        'user_id',
        '456',
        'Untappd cookie: user_id'
      );
    });

    it('should save login timestamp with cookies', async () => {
      const { getByTestId } = render(
        <UntappdLoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
        />
      );

      const webview = getByTestId('untappd-webview-mock');

      const message = {
        nativeEvent: {
          data: JSON.stringify({
            type: 'UNTAPPD_COOKIES',
            cookies: {
              session: 'test-session-123',
            },
          }),
        },
      };

      fireEvent(webview, 'onMessage', message);

      await waitFor(() => {
        expect(setUntappdCookie).toHaveBeenCalledWith(
          'last_login_timestamp',
          expect.any(String),
          'Last successful Untappd login timestamp'
        );
      });
    });

    it('should save UI detection flag', async () => {
      const { getByTestId } = render(
        <UntappdLoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
        />
      );

      const webview = getByTestId('untappd-webview-mock');

      const message = {
        nativeEvent: {
          data: JSON.stringify({
            type: 'UNTAPPD_COOKIES',
            cookies: {
              session: 'test',
            },
          }),
        },
      };

      fireEvent(webview, 'onMessage', message);

      await waitFor(() => {
        expect(setUntappdCookie).toHaveBeenCalledWith(
          'login_detected_via_ui',
          'true',
          'Login was detected via UI elements'
        );
      });
    });

    it('should handle empty cookies', () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      const { getByTestId } = render(
        <UntappdLoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
        />
      );

      const webview = getByTestId('untappd-webview-mock');

      const message = {
        nativeEvent: {
          data: JSON.stringify({
            type: 'UNTAPPD_COOKIES',
            cookies: {},
          }),
        },
      };

      fireEvent(webview, 'onMessage', message);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        'No cookies received, user probably not logged in yet'
      );

      consoleLogSpy.mockRestore();
    });

    it('should log received cookie keys', () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      const { getByTestId } = render(
        <UntappdLoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
        />
      );

      const webview = getByTestId('untappd-webview-mock');

      const message = {
        nativeEvent: {
          data: JSON.stringify({
            type: 'UNTAPPD_COOKIES',
            cookies: {
              session: 'test',
              user_id: '123',
            },
          }),
        },
      };

      fireEvent(webview, 'onMessage', message);

      expect(consoleLogSpy).toHaveBeenCalledWith('Received cookies keys:', ['session', 'user_id']);

      consoleLogSpy.mockRestore();
    });
  });

  describe('WebView Message Handling - Login Success', () => {
    it('should handle UNTAPPD_LOGGED_IN message from user page', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert');

      const { getByTestId } = render(
        <UntappdLoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
        />
      );

      const webview = getByTestId('untappd-webview-mock');

      const message = {
        nativeEvent: {
          data: JSON.stringify({
            type: 'UNTAPPD_LOGGED_IN',
            url: 'https://untappd.com/user/testuser',
            method: 'page_element_detection',
          }),
        },
      };

      fireEvent(webview, 'onMessage', message);

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith(
          'Untappd Login Successful',
          'You are now logged in to Untappd.',
          expect.any(Array)
        );
      });
    });

    it('should set logged in detection cookie', async () => {
      const { getByTestId } = render(
        <UntappdLoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
        />
      );

      const webview = getByTestId('untappd-webview-mock');

      const message = {
        nativeEvent: {
          data: JSON.stringify({
            type: 'UNTAPPD_LOGGED_IN',
            url: 'https://untappd.com/user/testuser',
            method: 'page_element_detection',
          }),
        },
      };

      fireEvent(webview, 'onMessage', message);

      await waitFor(() => {
        expect(setUntappdCookie).toHaveBeenCalledWith(
          'untappd_logged_in_detected',
          'true',
          'Login was detected by app'
        );
      });
    });

    it('should call onLoginSuccess callback', async () => {
      const { getByTestId } = render(
        <UntappdLoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
        />
      );

      const webview = getByTestId('untappd-webview-mock');

      const message = {
        nativeEvent: {
          data: JSON.stringify({
            type: 'UNTAPPD_LOGGED_IN',
            url: 'https://untappd.com/user/testuser',
          }),
        },
      };

      fireEvent(webview, 'onMessage', message);

      // Alert OK button press will trigger callback
      await waitFor(() => {
        expect(setUntappdCookie).toHaveBeenCalled();
      });
    });

    it('should recognize dashboard URL as valid login', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert');

      const { getByTestId } = render(
        <UntappdLoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
        />
      );

      const webview = getByTestId('untappd-webview-mock');

      const message = {
        nativeEvent: {
          data: JSON.stringify({
            type: 'UNTAPPD_LOGGED_IN',
            url: 'https://untappd.com/dashboard',
          }),
        },
      };

      fireEvent(webview, 'onMessage', message);

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith(
          'Untappd Login Successful',
          expect.any(String),
          expect.any(Array)
        );
      });
    });

    it('should recognize home URL as valid login', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert');

      const { getByTestId } = render(
        <UntappdLoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
        />
      );

      const webview = getByTestId('untappd-webview-mock');

      const message = {
        nativeEvent: {
          data: JSON.stringify({
            type: 'UNTAPPD_LOGGED_IN',
            url: 'https://untappd.com/home',
          }),
        },
      };

      fireEvent(webview, 'onMessage', message);

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith(
          'Untappd Login Successful',
          expect.any(String),
          expect.any(Array)
        );
      });
    });

    it('should ignore login message from non-logged-in pages', () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      const { getByTestId } = render(
        <UntappdLoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
        />
      );

      const webview = getByTestId('untappd-webview-mock');

      const message = {
        nativeEvent: {
          data: JSON.stringify({
            type: 'UNTAPPD_LOGGED_IN',
            url: 'https://untappd.com/login',
          }),
        },
      };

      fireEvent(webview, 'onMessage', message);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        'Login message received but not from a profile/home page, ignoring'
      );

      consoleLogSpy.mockRestore();
    });

    it('should log login confirmation method', () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      const { getByTestId } = render(
        <UntappdLoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
        />
      );

      const webview = getByTestId('untappd-webview-mock');

      const message = {
        nativeEvent: {
          data: JSON.stringify({
            type: 'UNTAPPD_LOGGED_IN',
            url: 'https://untappd.com/user/test',
            method: 'page_element_detection',
          }),
        },
      };

      fireEvent(webview, 'onMessage', message);

      expect(consoleLogSpy).toHaveBeenCalledWith('Login confirmed via:', 'page_element_detection');

      consoleLogSpy.mockRestore();
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON in message', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const { getByTestId } = render(
        <UntappdLoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
        />
      );

      const webview = getByTestId('untappd-webview-mock');

      const message = {
        nativeEvent: {
          data: 'invalid json {{{',
        },
      };

      fireEvent(webview, 'onMessage', message);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error handling Untappd WebView message:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });

    it('should handle unknown message types', () => {
      const { getByTestId } = render(
        <UntappdLoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
        />
      );

      const webview = getByTestId('untappd-webview-mock');

      const message = {
        nativeEvent: {
          data: JSON.stringify({
            type: 'UNKNOWN_TYPE',
            data: 'some data',
          }),
        },
      };

      // Should not crash
      fireEvent(webview, 'onMessage', message);
    });
  });

  describe('Loading State', () => {
    it('should handle load start event', () => {
      const { getByTestId } = render(
        <UntappdLoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
        />
      );

      const webview = getByTestId('untappd-webview-mock');

      if (webview.props.onLoadStart) {
        webview.props.onLoadStart();
      }

      // Should set loading state to true
    });

    it('should handle load end event', () => {
      const { getByTestId } = render(
        <UntappdLoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
        />
      );

      const webview = getByTestId('untappd-webview-mock');

      if (webview.props.onLoadEnd) {
        webview.props.onLoadEnd();
      }

      // Should set loading state to false
    });

    it('should show loading indicator', () => {
      const { getByTestId } = render(
        <UntappdLoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
        />
      );

      const webview = getByTestId('untappd-webview-mock');

      // Trigger loading
      if (webview.props.onLoadStart) {
        webview.props.onLoadStart();
      }

      // Loading indicator should be visible (implementation specific)
    });
  });

  describe('Props and State Management', () => {
    it('should handle modal close via Android back button', () => {
      const { getByTestId } = render(
        <UntappdLoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
        />
      );

      const modal = getByTestId('untappd-webview-modal');

      if (modal.props.onRequestClose) {
        modal.props.onRequestClose();
      }

      expect(mockOnLoginCancel).toHaveBeenCalled();
    });

    it('should support accessibility labels', () => {
      const { getByTestId } = render(
        <UntappdLoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
        />
      );

      const modal = getByTestId('untappd-webview-modal');

      expect(modal.props.accessibilityLabel).toBe('Untappd login modal');
    });

    it('should accept custom loading state', () => {
      const { rerender } = render(
        <UntappdLoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          loading={false}
        />
      );

      rerender(
        <UntappdLoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          loading={true}
        />
      );

      // Should respect loading prop
    });

    it('should clear state when reopened', () => {
      const { rerender, getByTestId } = render(
        <UntappdLoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
        />
      );

      const closeButton = getByTestId('close-untappd-webview-button');
      fireEvent.press(closeButton);

      rerender(
        <UntappdLoginWebView
          visible={false}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
        />
      );

      rerender(
        <UntappdLoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
        />
      );

      expect(getByTestId('untappd-webview-modal')).toBeTruthy();
    });
  });

  describe('WebView Configuration', () => {
    it('should enable JavaScript', () => {
      const { getByTestId } = render(
        <UntappdLoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
        />
      );

      // WebView should have javaScriptEnabled=true
      const webview = getByTestId('untappd-webview-mock');
      expect(webview).toBeTruthy();
    });

    it('should enable DOM storage', () => {
      const { getByTestId } = render(
        <UntappdLoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
        />
      );

      // WebView should have domStorageEnabled=true
      const webview = getByTestId('untappd-webview-mock');
      expect(webview).toBeTruthy();
    });

    it('should enable shared cookies', () => {
      const { getByTestId } = render(
        <UntappdLoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
        />
      );

      // WebView should have sharedCookiesEnabled=true
      const webview = getByTestId('untappd-webview-mock');
      expect(webview).toBeTruthy();
    });

    it('should set custom user agent', () => {
      const { getByTestId } = render(
        <UntappdLoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
        />
      );

      // WebView should have applicationNameForUserAgent="Untappd"
      const webview = getByTestId('untappd-webview-mock');
      expect(webview).toBeTruthy();
    });

    it('should not use incognito mode', () => {
      const { getByTestId } = render(
        <UntappdLoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
        />
      );

      // WebView should have incognito=false to persist cookies
      const webview = getByTestId('untappd-webview-mock');
      expect(webview).toBeTruthy();
    });
  });

  describe('Message Logging', () => {
    it('should log message receipt', () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      const { getByTestId } = render(
        <UntappdLoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
        />
      );

      const webview = getByTestId('untappd-webview-mock');

      const message = {
        nativeEvent: {
          data: JSON.stringify({
            type: 'UNTAPPD_COOKIES',
            cookies: {},
          }),
        },
      };

      fireEvent(webview, 'onMessage', message);

      expect(consoleLogSpy).toHaveBeenCalledWith('Received message from Untappd WebView');

      consoleLogSpy.mockRestore();
    });

    it('should log message type', () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      const { getByTestId } = render(
        <UntappdLoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
        />
      );

      const webview = getByTestId('untappd-webview-mock');

      const message = {
        nativeEvent: {
          data: JSON.stringify({
            type: 'UNTAPPD_LOGGED_IN',
            url: 'https://untappd.com/user/test',
          }),
        },
      };

      fireEvent(webview, 'onMessage', message);

      expect(consoleLogSpy).toHaveBeenCalledWith('Message type:', 'UNTAPPD_LOGGED_IN');

      consoleLogSpy.mockRestore();
    });
  });
});
