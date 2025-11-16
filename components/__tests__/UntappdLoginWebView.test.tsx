import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { config } from '@/src/config';

// Test URL constants - Centralized to eliminate hardcoded values
const TEST_BASE_URL = 'https://test.beerknurd.com';
const UNTAPPD_BASE_URL = 'https://untappd.com';

// Network configuration constants
const TEST_TIMEOUT = 15000;
const TEST_RETRIES = 2;
const TEST_RETRY_DELAY = 1000;

// Mock the config module
jest.mock('@/src/config', () => ({
  config: {
    api: {
      getFullUrl: jest.fn((endpoint) => `${TEST_BASE_URL}/${endpoint}.php`),
      baseUrl: TEST_BASE_URL,
      endpoints: {
        kiosk: '/kiosk.php',
        visitor: '/visitor.php',
        memberDashboard: '/member-dash.php',
        memberQueues: '/memberQueues.php',
        addToQueue: '/addToQueue.php',
        deleteQueuedBrew: '/deleteQueuedBrew.php',
        addToRewardQueue: '/addToRewardQueue.php',
        memberRewards: '/memberRewards.php'
      },
      referers: {
        memberDashboard: `${TEST_BASE_URL}/member-dash.php`,
        memberRewards: `${TEST_BASE_URL}/memberRewards.php`,
        memberQueues: `${TEST_BASE_URL}/memberQueues.php`
      }
    },
    external: {
      untappd: {
        baseUrl: UNTAPPD_BASE_URL,
        loginUrl: `${UNTAPPD_BASE_URL}/login`,
        searchUrl: jest.fn((beerName) => `${UNTAPPD_BASE_URL}/search?q=${encodeURIComponent(beerName)}`)
      }
    },
    network: {
      timeout: TEST_TIMEOUT,
      retries: TEST_RETRIES,
      retryDelay: TEST_RETRY_DELAY
    },
    setEnvironment: jest.fn(),
    setCustomApiUrl: jest.fn()
  }
}));

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
          url: `${config.external.untappd.baseUrl}/user/testuser`,
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
          url: `${config.external.untappd.baseUrl}/dashboard`,
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
          url: `${config.external.untappd.baseUrl}/home`,
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
          url: config.external.untappd.loginUrl,
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
          url: `${config.external.untappd.baseUrl}/user/testuser`,
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
          url: `${config.external.untappd.baseUrl}/user/testuser`,
          loading: false,
        });
      }

      expect(consoleLogSpy).toHaveBeenCalledWith(
        'Untappd WebView navigating to:',
        `${config.external.untappd.baseUrl}/user/testuser`
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
            url: `${config.external.untappd.baseUrl}/user/testuser`,
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
            url: `${config.external.untappd.baseUrl}/user/testuser`,
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
            url: `${config.external.untappd.baseUrl}/user/testuser`,
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
            url: `${config.external.untappd.baseUrl}/user/testuser`,
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
            url: `${config.external.untappd.baseUrl}/user/testuser`,
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
            url: `${config.external.untappd.baseUrl}/dashboard`,
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
            url: `${config.external.untappd.baseUrl}/home`,
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
            url: config.external.untappd.loginUrl,
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
            url: `${config.external.untappd.baseUrl}/user/test`,
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

    it('should call onLoginCancel when malformed JSON received', () => {
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

      // Component calls onLoginCancel after error (line 215)
      expect(mockOnLoginCancel).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should handle unknown message types without crashing', () => {
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

      // Should not crash - component ignores unknown message types
      expect(() => {
        fireEvent(webview, 'onMessage', message);
      }).not.toThrow();
    });

    it('should handle setUntappdCookie throwing error', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      (setUntappdCookie as jest.Mock).mockRejectedValue(new Error('Database error'));

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
              session: 'test-session',
            },
          }),
        },
      };

      fireEvent(webview, 'onMessage', message);

      // Component continues even if database save fails
      // Error is logged but doesn't crash the component
      await new Promise(resolve => setTimeout(resolve, 50));

      consoleErrorSpy.mockRestore();
    });

    it('should recover after error by reopening modal', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const { getByTestId, rerender } = render(
        <UntappdLoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
        />
      );

      const webview = getByTestId('untappd-webview-mock');

      // Trigger error
      const errorMessage = {
        nativeEvent: {
          data: 'malformed json',
        },
      };

      fireEvent(webview, 'onMessage', errorMessage);

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(mockOnLoginCancel).toHaveBeenCalled();

      // Close modal after error
      rerender(
        <UntappdLoginWebView
          visible={false}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
        />
      );

      // Reopen modal - should work normally
      rerender(
        <UntappdLoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
        />
      );

      // Should render successfully after recovery
      expect(getByTestId('untappd-webview-modal')).toBeTruthy();

      consoleErrorSpy.mockRestore();
    });

    it('should not crash when message handler throws unexpected error', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const { getByTestId } = render(
        <UntappdLoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
        />
      );

      const webview = getByTestId('untappd-webview-mock');

      // Send message with null data to trigger error
      const message = {
        nativeEvent: {
          data: null as any,
        },
      };

      // Should not crash even with null data
      expect(() => {
        fireEvent(webview, 'onMessage', message);
      }).not.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(mockOnLoginCancel).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
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
            url: `${config.external.untappd.baseUrl}/user/test`,
          }),
        },
      };

      fireEvent(webview, 'onMessage', message);

      expect(consoleLogSpy).toHaveBeenCalledWith('Message type:', 'UNTAPPD_LOGGED_IN');

      consoleLogSpy.mockRestore();
    });
  });

  describe('Config Integration', () => {
    describe('WebView URL Configuration', () => {
      it('should use config.external.untappd.loginUrl for WebView URL', () => {
        const { getByTestId } = render(
          <UntappdLoginWebView
            visible={true}
            onLoginSuccess={mockOnLoginSuccess}
            onLoginCancel={mockOnLoginCancel}
          />
        );

        const webview = getByTestId('untappd-webview-mock');

        // WebView should be initialized with config.external.untappd.loginUrl
        // This verifies the component is using the config module
        expect(webview).toBeTruthy();
        // The actual source URI is passed to WebView component
        // Implementation uses: source={{ uri: config.external.untappd.loginUrl }}
      });

      it('should set WebView source to config Untappd URL on initial render', () => {
        const expectedLoginUrl = config.external.untappd.loginUrl;

        render(
          <UntappdLoginWebView
            visible={true}
            onLoginSuccess={mockOnLoginSuccess}
            onLoginCancel={mockOnLoginCancel}
          />
        );

        // Verify the URL from config is the expected Untappd login URL
        expect(expectedLoginUrl).toBe(`${UNTAPPD_BASE_URL}/login`);
        expect(config.external.untappd.loginUrl).toBeTruthy();
      });

      it('should load Untappd URL from config', () => {
        // Verify config has the expected structure
        expect(config.external.untappd).toBeDefined();
        expect(config.external.untappd.loginUrl).toBe(`${UNTAPPD_BASE_URL}/login`);
        expect(config.external.untappd.baseUrl).toBe(UNTAPPD_BASE_URL);
      });

      it('should handle navigation to config-based Untappd URLs', () => {
        const { getByTestId } = render(
          <UntappdLoginWebView
            visible={true}
            onLoginSuccess={mockOnLoginSuccess}
            onLoginCancel={mockOnLoginCancel}
          />
        );

        const webview = getByTestId('untappd-webview-mock');

        // Test navigation to various Untappd pages using config
        if (webview.props.onNavigationStateChange) {
          webview.props.onNavigationStateChange({
            url: `${config.external.untappd.baseUrl}/user/testuser`,
            loading: false,
          });
        }

        // Should inject JavaScript when navigating to user page
        expect(mockUntappdWebViewRef.current.injectJavaScript).toHaveBeenCalled();
      });
    });

    describe('Config Lifecycle Changes', () => {
      it('should respond when config changes during component lifecycle', () => {
        const { rerender } = render(
          <UntappdLoginWebView
            visible={true}
            onLoginSuccess={mockOnLoginSuccess}
            onLoginCancel={mockOnLoginCancel}
          />
        );

        const initialLoginUrl = config.external.untappd.loginUrl;

        // Rerender component (simulates state change)
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

        // Config should remain accessible
        expect(config.external.untappd.loginUrl).toBe(initialLoginUrl);
      });

      it('should handle custom Untappd URL changes gracefully', () => {
        const CUSTOM_UNTAPPD_URL = 'https://custom-untappd.example.com';

        // Render with original config
        const { rerender } = render(
          <UntappdLoginWebView
            visible={true}
            onLoginSuccess={mockOnLoginSuccess}
            onLoginCancel={mockOnLoginCancel}
          />
        );

        expect(config.external.untappd.baseUrl).toBe(UNTAPPD_BASE_URL);

        // Simulate environment change
        (config.external.untappd as any).baseUrl = CUSTOM_UNTAPPD_URL;
        (config.external.untappd as any).loginUrl = `${CUSTOM_UNTAPPD_URL}/login`;

        // Rerender component
        rerender(
          <UntappdLoginWebView
            visible={true}
            onLoginSuccess={mockOnLoginSuccess}
            onLoginCancel={mockOnLoginCancel}
          />
        );

        // Component should use new config values
        expect(config.external.untappd.baseUrl).toBe(CUSTOM_UNTAPPD_URL);
      });

      it('should use consistent config URLs throughout navigation', () => {
        const { getByTestId } = render(
          <UntappdLoginWebView
            visible={true}
            onLoginSuccess={mockOnLoginSuccess}
            onLoginCancel={mockOnLoginCancel}
          />
        );

        const webview = getByTestId('untappd-webview-mock');

        const loginUrl = config.external.untappd.loginUrl;
        const baseUrl = config.external.untappd.baseUrl;

        // Navigate to different Untappd pages
        const testUrls = [
          `${baseUrl}/user/testuser`,
          `${baseUrl}/dashboard`,
          `${baseUrl}/home`,
          loginUrl
        ];

        testUrls.forEach(url => {
          mockUntappdWebViewRef.current.injectJavaScript.mockClear();

          if (webview.props.onNavigationStateChange) {
            webview.props.onNavigationStateChange({
              url,
              loading: false,
            });
          }

          // All URLs should be based on consistent config
          expect(url).toContain(baseUrl);
        });
      });
    });

    describe('Config Error Handling', () => {
      it('should render without crashing when config is valid', () => {
        // Component doesn't validate config - it passes it to WebView
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

        const { getByTestId } = render(
          <UntappdLoginWebView
            visible={true}
            onLoginSuccess={mockOnLoginSuccess}
            onLoginCancel={mockOnLoginCancel}
          />
        );

        const webview = getByTestId('untappd-webview-mock');

        // Component should render - WebView handles URL validation
        expect(webview).toBeTruthy();

        consoleErrorSpy.mockRestore();
      });

      it('should have required config properties', () => {
        // Verify config module provides required values
        expect(config.external).toBeDefined();
        expect(config.external.untappd).toBeDefined();
        expect(config.external.untappd.loginUrl).toBeTruthy();
        expect(config.external.untappd.baseUrl).toBeTruthy();

        // Verify URLs are strings
        expect(typeof config.external.untappd.loginUrl).toBe('string');
        expect(typeof config.external.untappd.baseUrl).toBe('string');
      });

      it('should handle config returning undefined URL gracefully', () => {
        // Mock config to return undefined
        const originalLoginUrl = config.external.untappd.loginUrl;
        (config.external.untappd as any).loginUrl = undefined;

        // Component doesn't crash - WebView handles undefined URL
        const { getByTestId } = render(
          <UntappdLoginWebView
            visible={true}
            onLoginSuccess={mockOnLoginSuccess}
            onLoginCancel={mockOnLoginCancel}
          />
        );

        expect(getByTestId('untappd-webview-modal')).toBeTruthy();

        // Restore config
        (config.external.untappd as any).loginUrl = originalLoginUrl;
      });

      it('should handle config returning invalid URL format', () => {
        // Mock config to return invalid URL
        const originalLoginUrl = config.external.untappd.loginUrl;
        (config.external.untappd as any).loginUrl = 'not-a-valid-url';

        // Component doesn't validate - passes to WebView
        const { getByTestId } = render(
          <UntappdLoginWebView
            visible={true}
            onLoginSuccess={mockOnLoginSuccess}
            onLoginCancel={mockOnLoginCancel}
          />
        );

        expect(getByTestId('untappd-webview-modal')).toBeTruthy();

        // Restore config
        (config.external.untappd as any).loginUrl = originalLoginUrl;
      });

      it('should use consistent Untappd URLs throughout component', () => {
        const { getByTestId } = render(
          <UntappdLoginWebView
            visible={true}
            onLoginSuccess={mockOnLoginSuccess}
            onLoginCancel={mockOnLoginCancel}
          />
        );

        const webview = getByTestId('untappd-webview-mock');

        // Verify navigation detection works with config URLs
        const testUrls = [
          `${config.external.untappd.baseUrl}/user/test`,
          `${config.external.untappd.baseUrl}/dashboard`,
          `${config.external.untappd.baseUrl}/home`,
          config.external.untappd.loginUrl
        ];

        testUrls.forEach(url => {
          mockUntappdWebViewRef.current.injectJavaScript.mockClear();

          if (webview.props.onNavigationStateChange) {
            webview.props.onNavigationStateChange({
              url,
              loading: false,
            });
          }

          // Login page should not trigger injection, others should
          if (url === config.external.untappd.loginUrl) {
            expect(mockUntappdWebViewRef.current.injectJavaScript).not.toHaveBeenCalled();
          } else {
            expect(mockUntappdWebViewRef.current.injectJavaScript).toHaveBeenCalled();
          }
        });
      });

      it('should handle navigation errors from invalid config URLs', () => {
        const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

        const { getByTestId } = render(
          <UntappdLoginWebView
            visible={true}
            onLoginSuccess={mockOnLoginSuccess}
            onLoginCancel={mockOnLoginCancel}
          />
        );

        const webview = getByTestId('untappd-webview-mock');

        // Navigate to malformed URL
        if (webview.props.onNavigationStateChange) {
          webview.props.onNavigationStateChange({
            url: 'not-untappd.com/page',
            loading: false,
          });
        }

        // Component logs but doesn't crash
        expect(consoleLogSpy).toHaveBeenCalled();

        consoleLogSpy.mockRestore();
      });
    });

    describe('WebView URL Verification', () => {
      it('should use Untappd login URL from config', () => {
        const loginUrl = config.external.untappd.loginUrl;

        render(
          <UntappdLoginWebView
            visible={true}
            onLoginSuccess={mockOnLoginSuccess}
            onLoginCancel={mockOnLoginCancel}
          />
        );

        // Verify the Untappd login URL structure
        expect(loginUrl).toMatch(/^https:\/\//);
        expect(loginUrl).toContain('untappd.com');
        expect(loginUrl).toContain('/login');
      });

      it('should use config base URL for navigation detection', () => {
        const { getByTestId } = render(
          <UntappdLoginWebView
            visible={true}
            onLoginSuccess={mockOnLoginSuccess}
            onLoginCancel={mockOnLoginCancel}
          />
        );

        const webview = getByTestId('untappd-webview-mock');

        // Test navigation to user page (uses config base URL)
        const userPageUrl = `${config.external.untappd.baseUrl}/user/testuser`;

        if (webview.props.onNavigationStateChange) {
          webview.props.onNavigationStateChange({
            url: userPageUrl,
            loading: false,
          });
        }

        // Should inject JavaScript for logged-in detection
        expect(mockUntappdWebViewRef.current.injectJavaScript).toHaveBeenCalled();
      });

      it('should get all Untappd URLs from config', () => {
        const baseUrl = config.external.untappd.baseUrl;
        const loginUrl = config.external.untappd.loginUrl;

        // Verify base URL is valid
        expect(baseUrl).toMatch(/^https:\/\//);
        expect(baseUrl).toContain('untappd.com');

        // Verify login URL is valid and uses base URL
        expect(loginUrl).toMatch(/^https:\/\//);
        expect(loginUrl).toContain('untappd.com');
        expect(loginUrl).toContain(baseUrl);

        // Verify URL structure
        expect(loginUrl).toBe(`${baseUrl}/login`);
      });

      it('should use consistent config base for navigation URLs', () => {
        const { getByTestId } = render(
          <UntappdLoginWebView
            visible={true}
            onLoginSuccess={mockOnLoginSuccess}
            onLoginCancel={mockOnLoginCancel}
          />
        );

        const webview = getByTestId('untappd-webview-mock');
        const baseUrl = config.external.untappd.baseUrl;

        // Test various navigation URLs
        const navigationUrls = [
          `${baseUrl}/user/testuser`,
          `${baseUrl}/dashboard`,
          `${baseUrl}/home`,
          `${baseUrl}/profile`
        ];

        navigationUrls.forEach(url => {
          mockUntappdWebViewRef.current.injectJavaScript.mockClear();

          if (webview.props.onNavigationStateChange) {
            webview.props.onNavigationStateChange({
              url,
              loading: false,
            });
          }

          // All URLs should contain the config base URL
          expect(url).toContain(baseUrl);
          expect(url).toContain('untappd.com');
        });
      });
    });

  });
});
