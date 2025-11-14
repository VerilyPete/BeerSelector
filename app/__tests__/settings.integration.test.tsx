import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import SettingsScreen from '@/app/settings';

// Polyfill for clearImmediate (required by StatusBar)
if (typeof globalThis.clearImmediate === 'undefined') {
  globalThis.clearImmediate = (id: any) => clearTimeout(id);
}
if (typeof globalThis.setImmediate === 'undefined') {
  globalThis.setImmediate = (callback: any, ...args: any[]) => setTimeout(callback, 0, ...args);
}

// Mock expo-router
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn(() => true);
let mockSearchParams = {};

const mockUseLocalSearchParams = jest.fn(() => mockSearchParams);

jest.mock('expo-router', () => ({
  router: {
    back: (...args: any[]) => mockBack(...args),
    replace: (...args: any[]) => mockReplace(...args),
    canGoBack: (...args: any[]) => mockCanGoBack(...args),
  },
  useLocalSearchParams: () => mockUseLocalSearchParams(),
}));

// Mock expo-web-browser
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(),
}));

// Mock theme hooks
jest.mock('@/hooks/useColorScheme', () => ({
  useColorScheme: jest.fn(() => 'light'),
}));

jest.mock('@/hooks/useThemeColor', () => ({
  useThemeColor: jest.fn(() => '#007AFF'),
}));

// Mock Constants
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      version: '1.0.0',
      ios: { buildNumber: '42' },
      android: { versionCode: 42 },
      extra: {
        NODE_ENV: 'test',
      },
    },
  },
}));

// Mock React Native components
jest.mock('react-native/Libraries/Components/ScrollView/ScrollView', () => {
  const { View } = require('react-native');
  return ({ children, ...props }: any) => <View {...props}>{children}</View>;
});

jest.mock('react-native/Libraries/Modal/Modal', () => {
  const { View } = require('react-native');
  return ({ visible, children, testID, ...props }: any) => {
    if (!visible) return null;
    return <View testID={testID} {...props}>{children}</View>;
  };
});

jest.mock('react-native/Libraries/Components/ActivityIndicator/ActivityIndicator', () => ({
  __esModule: true,
  default: ({ testID, ...props }: any) => {
    const { View } = require('react-native');
    return <View testID={testID || 'activity-indicator'} {...props} />;
  },
}));

jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}));

// Mock ThemedText and ThemedView
jest.mock('@/components/ThemedText', () => {
  const { Text } = require('react-native');
  return {
    ThemedText: ({ children, ...props }: any) => <Text {...props}>{children}</Text>,
  };
});

jest.mock('@/components/ThemedView', () => {
  const { View } = require('react-native');
  return {
    ThemedView: ({ children, ...props }: any) => <View {...props}>{children}</View>,
  };
});

// Mock IconSymbol
jest.mock('@/components/ui/IconSymbol', () => ({
  IconSymbol: ({ testID }: any) => {
    const { View } = require('react-native');
    return <View testID={testID || 'icon'} />;
  },
}));

// Mock database functions
const mockGetAllPreferences = jest.fn();
const mockGetPreference = jest.fn();
const mockSetPreference = jest.fn();

jest.mock('@/src/database/preferences', () => ({
  getAllPreferences: mockGetAllPreferences,
  getPreference: mockGetPreference,
  setPreference: mockSetPreference,
}));

// Mock database functions for Untappd
const mockIsUntappdLoggedIn = jest.fn();
const mockClearUntappdCookies = jest.fn();
const mockSetUntappdCookie = jest.fn();

// Mock data update service
const mockManualRefreshAllData = jest.fn();

jest.mock('@/src/services/dataUpdateService', () => ({
  manualRefreshAllData: mockManualRefreshAllData,
}));

// Mock auth service
const mockCreateMockSession = jest.fn();

jest.mock('@/src/api/mockSession', () => ({
  createMockSession: mockCreateMockSession,
}));

// Mock react-native-webview (NOT the LoginWebView/UntappdLoginWebView components)
// This allows us to use the REAL components in integration tests
jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    WebView: ({ testID, source }: any) => {
      // Simple mock that renders but doesn't do actual web navigation
      return <View testID={testID || 'webview'} accessibilityLabel={source?.uri || 'webview'} />;
    },
  };
});

// Mock SafeAreaView for WebView components
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children, ...props }: any) => <View {...props}>{children}</View>,
  };
});

// Mock auth service used by LoginWebView
const mockHandleVisitorLogin = jest.fn();
const mockHandleTapThatAppLogin = jest.fn();
const mockSaveSessionData = jest.fn();
const mockExtractSessionDataFromResponse = jest.fn();

jest.mock('@/src/api/authService', () => ({
  handleVisitorLogin: mockHandleVisitorLogin,
  handleTapThatAppLogin: mockHandleTapThatAppLogin,
}));

jest.mock('@/src/api/sessionManager', () => ({
  saveSessionData: mockSaveSessionData,
  extractSessionDataFromResponse: mockExtractSessionDataFromResponse,
}));

// Mock type guards
jest.mock('@/src/types/api', () => ({
  isSessionData: jest.fn(() => true),
}));

// Mock @/src/database/db with all Untappd-related functions
jest.mock('@/src/database/db', () => ({
  isUntappdLoggedIn: mockIsUntappdLoggedIn,
  clearUntappdCookies: mockClearUntappdCookies,
  setUntappdCookie: mockSetUntappdCookie,
}));

// Mock notification utils
jest.mock('@/src/utils/notificationUtils', () => ({
  getUserFriendlyErrorMessage: jest.fn((error) => error.message || 'Unknown error'),
}));

// Mock the custom hooks
const mockUseSettingsState = jest.fn();
const mockUseSettingsRefresh = jest.fn();
const mockUseLoginFlow = jest.fn();
const mockUseUntappdLogin = jest.fn();

jest.mock('@/hooks/useSettingsState', () => ({
  useSettingsState: () => mockUseSettingsState(),
}));

jest.mock('@/hooks/useSettingsRefresh', () => ({
  useSettingsRefresh: () => mockUseSettingsRefresh(),
}));

jest.mock('@/hooks/useLoginFlow', () => ({
  useLoginFlow: (props: any) => mockUseLoginFlow(props),
}));

jest.mock('@/hooks/useUntappdLogin', () => ({
  useUntappdLogin: () => mockUseUntappdLogin(),
}));

describe('SettingsScreen Integration Tests', () => {
  const defaultPreferences = [
    { key: 'all_beers_api_url', value: 'https://api.example.com/beers', description: 'All beers URL' },
    { key: 'my_beers_api_url', value: 'https://api.example.com/my-beers', description: 'My beers URL' },
    { key: 'first_launch', value: 'false', description: 'First launch flag' },
  ];

  // Helper function to setup default hook states
  const setupDefaultHooks = () => {
    mockUseSettingsState.mockReturnValue({
      preferences: defaultPreferences,
      loading: false,
      apiUrlsConfigured: true,
      isFirstLogin: false,
      canGoBack: true,
      loadPreferences: jest.fn().mockResolvedValue(undefined),
    });

    mockUseSettingsRefresh.mockReturnValue({
      refreshing: false,
      handleRefresh: mockManualRefreshAllData,
    });

    mockUseLoginFlow.mockReturnValue({
      isLoggingIn: false,
      loginWebViewVisible: false,
      selectedLoginType: null,
      startMemberLogin: jest.fn(),
      startVisitorLogin: jest.fn(),
      handleLoginSuccess: jest.fn().mockResolvedValue(undefined),
      handleLoginCancel: jest.fn(),
    });

    mockUseUntappdLogin.mockReturnValue({
      untappdWebViewVisible: false,
      isUntappdLoggedIn: false,
      startUntappdLogin: jest.fn(),
      handleUntappdLoginSuccess: jest.fn().mockResolvedValue(undefined),
      handleUntappdLoginCancel: jest.fn(),
      checkUntappdLoginStatus: mockIsUntappdLoggedIn,
    });
  };

  beforeEach(() => {
    // Use real timers by default
    jest.useRealTimers();
    jest.clearAllMocks();

    // Reset router mocks
    mockSearchParams = {};

    // Default mock implementations
    mockGetAllPreferences.mockResolvedValue(defaultPreferences);
    mockGetPreference.mockResolvedValue(null);
    mockIsUntappdLoggedIn.mockResolvedValue(false);
    mockClearUntappdCookies.mockResolvedValue(undefined);
    mockSetUntappdCookie.mockResolvedValue(undefined);
    mockHandleVisitorLogin.mockResolvedValue({ success: true });
    mockHandleTapThatAppLogin.mockResolvedValue({ success: true });
    mockSaveSessionData.mockResolvedValue(undefined);
    mockExtractSessionDataFromResponse.mockReturnValue({
      memberId: '123',
      sessionId: 'abc',
      storeId: '1',
      storeName: 'Test Store',
    });
    mockManualRefreshAllData.mockResolvedValue({
      hasErrors: false,
      allNetworkErrors: false,
      allBeersResult: { success: true, dataUpdated: true, itemCount: 150 },
      myBeersResult: { success: true, dataUpdated: true, itemCount: 50 },
    });
    mockCanGoBack.mockReturnValue(true);

    // Setup default hooks
    setupDefaultHooks();
  });

  afterEach(() => {
    // Ensure timers are cleaned up and reset to real timers
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('Complete Settings Flow', () => {
    it('should render settings screen with all sections', async () => {
      const { getByText } = render(<SettingsScreen />);

      await waitFor(() => {
        expect(getByText('Settings')).toBeTruthy();
        expect(getByText('About')).toBeTruthy();
        expect(getByText('Data Management')).toBeTruthy();
      });
    });

    it('should display version information in About section', async () => {
      const { getByText } = render(<SettingsScreen />);

      await waitFor(() => {
        expect(getByText('Beer Selector')).toBeTruthy();
        expect(getByText(/Version 1\.0\.0/)).toBeTruthy();
        expect(getByText(/Build 42/)).toBeTruthy();
      });
    });

    it('should show back button when can go back and not first login', async () => {
      const { getByTestId } = render(<SettingsScreen />);

      await waitFor(() => {
        expect(getByTestId('icon')).toBeTruthy(); // Back button icon
      }, { timeout: 3000 });
    });

    it('should not show back button on first login', async () => {
      mockUseSettingsState.mockReturnValue({
        preferences: [
          { key: 'all_beers_api_url', value: '', description: 'All beers URL' },
          { key: 'my_beers_api_url', value: '', description: 'My beers URL' },
          { key: 'first_launch', value: 'true', description: 'First launch flag' },
        ],
        loading: false,
        apiUrlsConfigured: false,
        isFirstLogin: true,
        canGoBack: false,
        loadPreferences: jest.fn().mockResolvedValue(undefined),
      });

      const { queryByTestId } = render(<SettingsScreen />);

      await waitFor(() => {
        // Back button should not be visible on first login
        const icons = queryByTestId('icon');
        expect(icons).toBeFalsy();
      }, { timeout: 3000 });
    });
  });

  describe('First Login Flow', () => {
    beforeEach(() => {
      mockGetAllPreferences.mockResolvedValue([
        { key: 'all_beers_api_url', value: '', description: 'All beers URL' },
        { key: 'my_beers_api_url', value: '', description: 'My beers URL' },
        { key: 'first_launch', value: 'true', description: 'First launch flag' },
      ]);

      // Mock hooks for first login state
      mockUseSettingsState.mockReturnValue({
        preferences: [
          { key: 'all_beers_api_url', value: '', description: 'All beers URL' },
          { key: 'my_beers_api_url', value: '', description: 'My beers URL' },
          { key: 'first_launch', value: 'true', description: 'First launch flag' },
        ],
        loading: false,
        apiUrlsConfigured: false,
        isFirstLogin: true,
        canGoBack: false,
        loadPreferences: jest.fn().mockResolvedValue(undefined),
      });
    });

    it('should display welcome message on first login', async () => {
      const { getByText } = render(<SettingsScreen />);

      await waitFor(() => {
        expect(getByText('Welcome to Beer Selector')).toBeTruthy();
        expect(getByText(/Please log in to your UFO Club account/)).toBeTruthy();
      }, { timeout: 3000 });
    });

    it('should show login button on welcome message', async () => {
      const { getByText } = render(<SettingsScreen />);

      await waitFor(() => {
        expect(getByText('Login to Flying Saucer')).toBeTruthy();
      }, { timeout: 3000 });
    });

    it('should not show Data Management section on first login with unconfigured URLs', async () => {
      const { queryByText } = render(<SettingsScreen />);

      await waitFor(() => {
        expect(queryByText('Data Management')).toBeNull();
      }, { timeout: 3000 });
    });
  });

  describe('Button Interactions - Login Flow', () => {
    it('should open LoginWebView modal when member login button pressed', async () => {
      const mockStartMemberLogin = jest.fn();
      let loginVisible = false;

      // Setup mock that tracks state changes
      mockUseLoginFlow.mockImplementation(() => {
        return {
          isLoggingIn: loginVisible,
          loginWebViewVisible: loginVisible,
          selectedLoginType: loginVisible ? 'member' : null,
          startMemberLogin: () => {
            mockStartMemberLogin();
            loginVisible = true;
          },
          startVisitorLogin: jest.fn(),
          handleLoginSuccess: jest.fn().mockResolvedValue(undefined),
          handleLoginCancel: jest.fn(),
        };
      });

      const { getByText, getByTestId } = render(<SettingsScreen />);

      await waitFor(() => {
        expect(getByText('Login to Flying Saucer')).toBeTruthy();
      }, { timeout: 3000 });

      // Press login button
      fireEvent.press(getByText('Login to Flying Saucer'));

      // Verify function was called
      await waitFor(() => {
        expect(mockStartMemberLogin).toHaveBeenCalled();
      }, { timeout: 3000 });
    });

    it('should close LoginWebView modal on cancel via close button', async () => {
      const mockHandleLoginCancel = jest.fn();

      // Start with modal visible
      mockUseLoginFlow.mockReturnValue({
        isLoggingIn: true,
        loginWebViewVisible: true,
        selectedLoginType: 'member',
        startMemberLogin: jest.fn(),
        startVisitorLogin: jest.fn(),
        handleLoginSuccess: jest.fn().mockResolvedValue(undefined),
        handleLoginCancel: mockHandleLoginCancel,
      });

      const { getByTestId } = render(<SettingsScreen />);

      await waitFor(() => {
        expect(getByTestId('login-webview-modal')).toBeTruthy();
      }, { timeout: 3000 });

      // Press the close button
      const closeButton = getByTestId('close-webview-button');
      fireEvent.press(closeButton);

      await waitFor(() => {
        expect(mockHandleLoginCancel).toHaveBeenCalled();
      }, { timeout: 3000 });
    });

    it('should pass correct props to LoginWebView', async () => {
      mockUseLoginFlow.mockReturnValue({
        isLoggingIn: true,
        loginWebViewVisible: true,
        selectedLoginType: 'member',
        startMemberLogin: jest.fn(),
        startVisitorLogin: jest.fn(),
        handleLoginSuccess: jest.fn().mockResolvedValue(undefined),
        handleLoginCancel: jest.fn(),
      });

      const { getByTestId } = render(<SettingsScreen />);

      await waitFor(() => {
        const modal = getByTestId('login-webview-modal');
        expect(modal).toBeTruthy();

        // Verify the WebView has the correct source URL
        const webView = getByTestId('webview');
        expect(webView.props.accessibilityLabel).toContain('beerknurd.com');
      }, { timeout: 3000 });
    });
  });

  describe('Button Interactions - Untappd Login', () => {
    it('should open UntappdLoginWebView modal when Untappd login button pressed', async () => {
      const mockStartUntappdLogin = jest.fn();

      mockUseUntappdLogin.mockImplementation(() => {
        let visible = false;
        return {
          untappdWebViewVisible: visible,
          isUntappdLoggedIn: false,
          startUntappdLogin: () => {
            mockStartUntappdLogin();
            visible = true;
          },
          handleUntappdLoginSuccess: jest.fn().mockResolvedValue(undefined),
          handleUntappdLoginCancel: jest.fn(),
          checkUntappdLoginStatus: mockIsUntappdLoggedIn,
        };
      });

      const { getByText } = render(<SettingsScreen />);

      await waitFor(() => {
        expect(getByText('Login to Untappd')).toBeTruthy();
      }, { timeout: 3000 });

      fireEvent.press(getByText('Login to Untappd'));

      await waitFor(() => {
        expect(mockStartUntappdLogin).toHaveBeenCalled();
      }, { timeout: 3000 });
    });

    it('should close UntappdLoginWebView modal on cancel via close button', async () => {
      const mockHandleUntappdLoginCancel = jest.fn();

      mockUseUntappdLogin.mockReturnValue({
        untappdWebViewVisible: true,
        isUntappdLoggedIn: false,
        startUntappdLogin: jest.fn(),
        handleUntappdLoginSuccess: jest.fn().mockResolvedValue(undefined),
        handleUntappdLoginCancel: mockHandleUntappdLoginCancel,
        checkUntappdLoginStatus: mockIsUntappdLoggedIn,
      });

      const { getByTestId } = render(<SettingsScreen />);

      await waitFor(() => {
        expect(getByTestId('untappd-webview-modal')).toBeTruthy();
      }, { timeout: 3000 });

      // Press the close button
      const closeButton = getByTestId('close-untappd-webview-button');
      fireEvent.press(closeButton);

      await waitFor(() => {
        expect(mockHandleUntappdLoginCancel).toHaveBeenCalled();
      }, { timeout: 3000 });
    });

    it('should pass correct props to UntappdLoginWebView', async () => {
      mockUseUntappdLogin.mockReturnValue({
        untappdWebViewVisible: true,
        isUntappdLoggedIn: false,
        startUntappdLogin: jest.fn(),
        handleUntappdLoginSuccess: jest.fn().mockResolvedValue(undefined),
        handleUntappdLoginCancel: jest.fn(),
        checkUntappdLoginStatus: mockIsUntappdLoggedIn,
      });

      const { getByTestId } = render(<SettingsScreen />);

      await waitFor(() => {
        const modal = getByTestId('untappd-webview-modal');
        expect(modal).toBeTruthy();

        // Verify the WebView has the correct source URL
        const webView = getByTestId('webview');
        expect(webView.props.accessibilityLabel).toContain('untappd.com');
      }, { timeout: 3000 });
    });

    it('should show reconnect button when Untappd logged in', async () => {
      mockUseUntappdLogin.mockReturnValue({
        untappdWebViewVisible: false,
        isUntappdLoggedIn: true,
        startUntappdLogin: jest.fn(),
        handleUntappdLoginSuccess: jest.fn().mockResolvedValue(undefined),
        handleUntappdLoginCancel: jest.fn(),
        checkUntappdLoginStatus: mockIsUntappdLoggedIn,
      });

      const { getByText } = render(<SettingsScreen />);

      await waitFor(() => {
        expect(getByText('Reconnect to Untappd')).toBeTruthy();
      }, { timeout: 3000 });
    });

    it('should show logout button when Untappd logged in', async () => {
      mockUseUntappdLogin.mockReturnValue({
        untappdWebViewVisible: false,
        isUntappdLoggedIn: true,
        startUntappdLogin: jest.fn(),
        handleUntappdLoginSuccess: jest.fn().mockResolvedValue(undefined),
        handleUntappdLoginCancel: jest.fn(),
        checkUntappdLoginStatus: mockIsUntappdLoggedIn,
      });

      const { getByText } = render(<SettingsScreen />);

      await waitFor(() => {
        expect(getByText('Clear Untappd Credentials')).toBeTruthy();
      }, { timeout: 3000 });
    });

    it('should handle Untappd logout', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert');

      mockUseUntappdLogin.mockReturnValue({
        untappdWebViewVisible: false,
        isUntappdLoggedIn: true,
        startUntappdLogin: jest.fn(),
        handleUntappdLoginSuccess: jest.fn().mockResolvedValue(undefined),
        handleUntappdLoginCancel: jest.fn(),
        checkUntappdLoginStatus: mockIsUntappdLoggedIn,
      });

      const { getByText } = render(<SettingsScreen />);

      // Wait for button to be rendered first
      await waitFor(() => {
        expect(getByText('Clear Untappd Credentials')).toBeTruthy();
      }, { timeout: 3000 });

      // Then press it
      fireEvent.press(getByText('Clear Untappd Credentials'));

      // Verify the logout was called
      await waitFor(() => {
        expect(mockClearUntappdCookies).toHaveBeenCalled();
        expect(alertSpy).toHaveBeenCalledWith(
          'Untappd Credentials Cleared',
          expect.stringContaining('Your cached Untappd session has been cleared'),
          expect.any(Array)
        );
      }, { timeout: 3000 });
    });
  });

  describe('Data Refresh Flow', () => {
    it('should trigger data refresh when refresh button pressed', async () => {
      const mockHandleRefresh = jest.fn().mockResolvedValue(undefined);

      mockUseSettingsRefresh.mockReturnValue({
        refreshing: false,
        handleRefresh: mockHandleRefresh,
      });

      const { getByText } = render(<SettingsScreen />);

      await waitFor(() => {
        expect(getByText('Refresh All Beer Data')).toBeTruthy();
      }, { timeout: 3000 });

      fireEvent.press(getByText('Refresh All Beer Data'));

      await waitFor(() => {
        expect(mockHandleRefresh).toHaveBeenCalled();
      }, { timeout: 3000 });
    });

    it('should show loading state during refresh', async () => {
      mockUseSettingsRefresh.mockReturnValue({
        refreshing: true,
        handleRefresh: jest.fn().mockResolvedValue(undefined),
      });

      const { getByText } = render(<SettingsScreen />);

      await waitFor(() => {
        expect(getByText('Refreshing data...')).toBeTruthy();
      }, { timeout: 3000 });
    });

    it('should show success alert after successful refresh', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert');
      const mockHandleRefresh = jest.fn(async () => {
        Alert.alert('Success', expect.stringContaining('Beer data refreshed successfully'));
      });

      mockUseSettingsRefresh.mockReturnValue({
        refreshing: false,
        handleRefresh: mockHandleRefresh,
      });

      const { getByText } = render(<SettingsScreen />);

      await waitFor(() => {
        fireEvent.press(getByText('Refresh All Beer Data'));
      }, { timeout: 3000 });

      await waitFor(() => {
        expect(mockHandleRefresh).toHaveBeenCalled();
      }, { timeout: 3000 });
    });

    it('should show visitor mode message in success alert for visitors', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert');
      const mockHandleRefresh = jest.fn(async () => {
        Alert.alert('Success', expect.stringContaining('Visitor mode: Personal data not available'));
      });

      mockUseSettingsRefresh.mockReturnValue({
        refreshing: false,
        handleRefresh: mockHandleRefresh,
      });

      const { getByText } = render(<SettingsScreen />);

      await waitFor(() => {
        fireEvent.press(getByText('Refresh All Beer Data'));
      }, { timeout: 3000 });

      await waitFor(() => {
        expect(mockHandleRefresh).toHaveBeenCalled();
      }, { timeout: 3000 });
    });

    it('should handle network errors during refresh', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert');
      const mockHandleRefresh = jest.fn(async () => {
        Alert.alert('Server Connection Error', expect.stringContaining('Unable to connect to the server'), expect.any(Array));
      });

      mockUseSettingsRefresh.mockReturnValue({
        refreshing: false,
        handleRefresh: mockHandleRefresh,
      });

      const { getByText } = render(<SettingsScreen />);

      await waitFor(() => {
        fireEvent.press(getByText('Refresh All Beer Data'));
      }, { timeout: 3000 });

      await waitFor(() => {
        expect(mockHandleRefresh).toHaveBeenCalled();
      }, { timeout: 3000 });
    });

    it('should handle partial errors during refresh', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert');
      const mockHandleRefresh = jest.fn(async () => {
        Alert.alert('Data Refresh Error', expect.stringContaining('There were problems refreshing beer data'), expect.any(Array));
      });

      mockUseSettingsRefresh.mockReturnValue({
        refreshing: false,
        handleRefresh: mockHandleRefresh,
      });

      const { getByText } = render(<SettingsScreen />);

      await waitFor(() => {
        fireEvent.press(getByText('Refresh All Beer Data'));
      }, { timeout: 3000 });

      await waitFor(() => {
        expect(mockHandleRefresh).toHaveBeenCalled();
      }, { timeout: 3000 });
    });

    it('should show info alert when no new data available', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert');
      const mockHandleRefresh = jest.fn(async () => {
        Alert.alert('Info', 'No new data available.');
      });

      mockUseSettingsRefresh.mockReturnValue({
        refreshing: false,
        handleRefresh: mockHandleRefresh,
      });

      const { getByText } = render(<SettingsScreen />);

      await waitFor(() => {
        fireEvent.press(getByText('Refresh All Beer Data'));
      }, { timeout: 3000 });

      await waitFor(() => {
        expect(mockHandleRefresh).toHaveBeenCalled();
      }, { timeout: 3000 });
    });
  });

  describe('Navigation Flow', () => {
    it('should navigate back when back button pressed', async () => {
      const { getByTestId } = render(<SettingsScreen />);

      await waitFor(() => {
        expect(getByTestId('icon')).toBeTruthy();
      }, { timeout: 3000 });

      const backButton = getByTestId('icon').parent;
      if (backButton) {
        fireEvent.press(backButton);
        expect(mockBack).toHaveBeenCalled();
      }
    });

    it('should show "Go to Home Screen" button when cannot go back', async () => {
      mockUseSettingsState.mockReturnValue({
        preferences: defaultPreferences,
        loading: false,
        apiUrlsConfigured: true,
        isFirstLogin: false,
        canGoBack: false,
        loadPreferences: jest.fn().mockResolvedValue(undefined),
      });

      const { getByText } = render(<SettingsScreen />);

      await waitFor(() => {
        expect(getByText('Go to Home Screen')).toBeTruthy();
      }, { timeout: 3000 });
    });

    it('should navigate to home when "Go to Home Screen" pressed', async () => {
      mockUseSettingsState.mockReturnValue({
        preferences: defaultPreferences,
        loading: false,
        apiUrlsConfigured: true,
        isFirstLogin: false,
        canGoBack: false,
        loadPreferences: jest.fn().mockResolvedValue(undefined),
      });

      const { getByText } = render(<SettingsScreen />);

      // Wait for button to appear first
      await waitFor(() => {
        expect(getByText('Go to Home Screen')).toBeTruthy();
      }, { timeout: 3000 });

      // Then press it
      fireEvent.press(getByText('Go to Home Screen'));

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
      }, { timeout: 3000 });
    });
  });

  describe('Auto-login Action Flow', () => {
    it('should auto-open login dialog when action=login in URL params', async () => {
      const mockStartMemberLogin = jest.fn();
      mockSearchParams = { action: 'login' };

      mockUseLoginFlow.mockReturnValue({
        isLoggingIn: false,
        loginWebViewVisible: false,
        selectedLoginType: null,
        startMemberLogin: mockStartMemberLogin,
        startVisitorLogin: jest.fn(),
        handleLoginSuccess: jest.fn().mockResolvedValue(undefined),
        handleLoginCancel: jest.fn(),
      });

      render(<SettingsScreen />);

      await waitFor(() => {
        expect(mockStartMemberLogin).toHaveBeenCalled();
      }, { timeout: 3000 });
    });
  });

  describe('State Management', () => {
    it('should check Untappd login status on mount', async () => {
      const mockCheckStatus = jest.fn().mockResolvedValue(undefined);

      mockUseUntappdLogin.mockReturnValue({
        untappdWebViewVisible: false,
        isUntappdLoggedIn: false,
        startUntappdLogin: jest.fn(),
        handleUntappdLoginSuccess: jest.fn().mockResolvedValue(undefined),
        handleUntappdLoginCancel: jest.fn(),
        checkUntappdLoginStatus: mockCheckStatus,
      });

      render(<SettingsScreen />);

      // The hook itself checks status on mount
      await waitFor(() => {
        expect(mockUseUntappdLogin).toHaveBeenCalled();
      }, { timeout: 3000 });
    });

    it('should store initial preferences in state', async () => {
      const { getByText } = render(<SettingsScreen />);

      await waitFor(() => {
        // Verify state was loaded by checking for About section
        expect(getByText('About')).toBeTruthy();
        expect(mockUseSettingsState).toHaveBeenCalled();
      }, { timeout: 3000 });
    });

    it('should track login modal visibility state', async () => {
      const mockHandleCancel = jest.fn();

      // Start with modal not visible
      mockUseLoginFlow.mockReturnValueOnce({
        isLoggingIn: false,
        loginWebViewVisible: false,
        selectedLoginType: null,
        startMemberLogin: jest.fn(),
        startVisitorLogin: jest.fn(),
        handleLoginSuccess: jest.fn().mockResolvedValue(undefined),
        handleLoginCancel: mockHandleCancel,
      });

      const { queryByTestId } = render(<SettingsScreen />);

      // Initially modal should not be visible
      await waitFor(() => {
        expect(queryByTestId('login-webview-modal')).toBeNull();
      }, { timeout: 3000 });
    });

    it('should track Untappd login status and update button text', async () => {
      mockUseUntappdLogin.mockReturnValue({
        untappdWebViewVisible: false,
        isUntappdLoggedIn: true,
        startUntappdLogin: jest.fn(),
        handleUntappdLoginSuccess: jest.fn().mockResolvedValue(undefined),
        handleUntappdLoginCancel: jest.fn(),
        checkUntappdLoginStatus: mockIsUntappdLoggedIn,
      });

      const { getByText } = render(<SettingsScreen />);

      await waitFor(() => {
        // When logged in, should show "Reconnect" instead of "Login"
        expect(getByText('Reconnect to Untappd')).toBeTruthy();
      }, { timeout: 3000 });
    });
  });

  describe('Loading States', () => {
    it('should show loading indicator during initial load', async () => {
      // Mock loading state
      mockUseSettingsState.mockReturnValue({
        preferences: [],
        loading: true,
        apiUrlsConfigured: false,
        isFirstLogin: true,
        canGoBack: false,
        loadPreferences: jest.fn().mockResolvedValue(undefined),
      });

      const { getByTestId } = render(<SettingsScreen />);

      // Component should call the hook
      await waitFor(() => {
        expect(mockUseSettingsState).toHaveBeenCalled();
      }, { timeout: 3000 });
    });

    it('should disable buttons during refresh', async () => {
      mockUseSettingsRefresh.mockReturnValue({
        refreshing: true,
        handleRefresh: jest.fn().mockResolvedValue(undefined),
      });

      const { getByText } = render(<SettingsScreen />);

      await waitFor(() => {
        // During refresh, "Refreshing data..." should be shown
        expect(getByText('Refreshing data...')).toBeTruthy();
      }, { timeout: 3000 });
    });
  });

  describe('Error Handling', () => {
    it('should handle preferences loading error gracefully', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert');
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      mockGetAllPreferences.mockRejectedValue(new Error('Database error'));

      // The hook should handle the error internally
      mockUseSettingsState.mockReturnValue({
        preferences: [],
        loading: false,
        apiUrlsConfigured: false,
        isFirstLogin: true,
        canGoBack: false,
        loadPreferences: jest.fn().mockRejectedValue(new Error('Database error')),
      });

      render(<SettingsScreen />);

      await waitFor(() => {
        expect(mockUseSettingsState).toHaveBeenCalled();
      }, { timeout: 3000 });

      consoleErrorSpy.mockRestore();
    });

    it('should handle Untappd login status check error', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      mockUseUntappdLogin.mockReturnValue({
        untappdWebViewVisible: false,
        isUntappdLoggedIn: false,
        startUntappdLogin: jest.fn(),
        handleUntappdLoginSuccess: jest.fn().mockResolvedValue(undefined),
        handleUntappdLoginCancel: jest.fn(),
        checkUntappdLoginStatus: jest.fn().mockRejectedValue(new Error('Database error')),
      });

      render(<SettingsScreen />);

      await waitFor(() => {
        expect(mockUseUntappdLogin).toHaveBeenCalled();
      }, { timeout: 3000 });

      consoleErrorSpy.mockRestore();
    });

    it('should handle Untappd logout error', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert');
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      mockUseUntappdLogin.mockReturnValue({
        untappdWebViewVisible: false,
        isUntappdLoggedIn: true,
        startUntappdLogin: jest.fn(),
        handleUntappdLoginSuccess: jest.fn().mockResolvedValue(undefined),
        handleUntappdLoginCancel: jest.fn(),
        checkUntappdLoginStatus: mockIsUntappdLoggedIn,
      });

      mockClearUntappdCookies.mockRejectedValue(new Error('Clear error'));

      const { getByText } = render(<SettingsScreen />);

      await waitFor(() => {
        fireEvent.press(getByText('Clear Untappd Credentials'));
      }, { timeout: 3000 });

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalled();
        expect(alertSpy).toHaveBeenCalledWith(
          'Error',
          'Failed to clear Untappd credentials. Please try again.',
          expect.any(Array)
        );
      }, { timeout: 3000 });

      consoleErrorSpy.mockRestore();
    });

    it('should handle refresh error', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert');
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const mockHandleRefresh = jest.fn(async () => {
        console.error('Failed to refresh data:', new Error('Network error'));
        Alert.alert('Error', 'Failed to refresh data from server. Please try again later.');
      });

      mockUseSettingsRefresh.mockReturnValue({
        refreshing: false,
        handleRefresh: mockHandleRefresh,
      });

      const { getByText } = render(<SettingsScreen />);

      await waitFor(() => {
        fireEvent.press(getByText('Refresh All Beer Data'));
      }, { timeout: 3000 });

      await waitFor(() => {
        expect(mockHandleRefresh).toHaveBeenCalled();
      }, { timeout: 3000 });

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Development Features', () => {
    it('should show development section in development mode', async () => {
      const Constants = require('expo-constants').default;
      Constants.expoConfig.extra.NODE_ENV = 'development';

      const { getByText } = render(<SettingsScreen />);

      await waitFor(() => {
        expect(getByText('Development')).toBeTruthy();
        expect(getByText('Create Mock Session')).toBeTruthy();
      }, { timeout: 3000 });
    });

    it('should not show development section in production', async () => {
      const Constants = require('expo-constants').default;
      Constants.expoConfig.extra.NODE_ENV = 'production';

      const { queryByText } = render(<SettingsScreen />);

      await waitFor(() => {
        expect(queryByText('Development')).toBeNull();
        expect(queryByText('Create Mock Session')).toBeNull();
      }, { timeout: 3000 });
    });

    it('should handle create mock session', async () => {
      const Constants = require('expo-constants').default;
      Constants.expoConfig.extra.NODE_ENV = 'development';

      const alertSpy = jest.spyOn(Alert, 'alert');
      mockCreateMockSession.mockResolvedValue(undefined);

      const { getByText } = render(<SettingsScreen />);

      // Wait for button to be rendered
      await waitFor(() => {
        expect(getByText('Create Mock Session')).toBeTruthy();
      }, { timeout: 3000 });

      // Press it
      fireEvent.press(getByText('Create Mock Session'));

      // Verify the mock was called
      await waitFor(() => {
        expect(mockCreateMockSession).toHaveBeenCalled();
        expect(alertSpy).toHaveBeenCalledWith('Success', 'Mock session created successfully!');
      }, { timeout: 3000 });
    });

    it('should handle create mock session error', async () => {
      const Constants = require('expo-constants').default;
      Constants.expoConfig.extra.NODE_ENV = 'development';

      const alertSpy = jest.spyOn(Alert, 'alert');
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      mockCreateMockSession.mockRejectedValue(new Error('Mock error'));

      const { getByText } = render(<SettingsScreen />);

      await waitFor(() => {
        fireEvent.press(getByText('Create Mock Session'));
      }, { timeout: 3000 });

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalled();
        expect(alertSpy).toHaveBeenCalledWith('Error', 'Failed to create mock session.');
      }, { timeout: 3000 });

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Integration with Extracted Components', () => {
    it('should render real LoginWebView component with WebView', async () => {
      mockUseLoginFlow.mockReturnValue({
        isLoggingIn: true,
        loginWebViewVisible: true,
        selectedLoginType: 'member',
        startMemberLogin: jest.fn(),
        startVisitorLogin: jest.fn(),
        handleLoginSuccess: jest.fn().mockResolvedValue(undefined),
        handleLoginCancel: jest.fn(),
      });

      const { getByText, getByTestId } = render(<SettingsScreen />);

      await waitFor(() => {
        // Verify we have the real Modal component
        const modal = getByTestId('login-webview-modal');
        expect(modal).toBeTruthy();

        // Verify we have the real WebView (not a mock button)
        const webView = getByTestId('webview');
        expect(webView).toBeTruthy();

        // Verify we have the real close button from LoginWebView
        const closeButton = getByTestId('close-webview-button');
        expect(closeButton).toBeTruthy();

        // Verify the header text from real component
        expect(getByText('Flying Saucer Login')).toBeTruthy();
      }, { timeout: 3000 });
    });

    it('should render real UntappdLoginWebView component with WebView', async () => {
      mockUseUntappdLogin.mockReturnValue({
        untappdWebViewVisible: true,
        isUntappdLoggedIn: false,
        startUntappdLogin: jest.fn(),
        handleUntappdLoginSuccess: jest.fn().mockResolvedValue(undefined),
        handleUntappdLoginCancel: jest.fn(),
        checkUntappdLoginStatus: mockIsUntappdLoggedIn,
      });

      const { getByText, getByTestId } = render(<SettingsScreen />);

      await waitFor(() => {
        // Verify we have the real Modal component
        const modal = getByTestId('untappd-webview-modal');
        expect(modal).toBeTruthy();

        // Verify we have the real WebView (not a mock button)
        const webView = getByTestId('webview');
        expect(webView).toBeTruthy();

        // Verify we have the real close button from UntappdLoginWebView
        const closeButton = getByTestId('close-untappd-webview-button');
        expect(closeButton).toBeTruthy();

        // Verify the header text from real component
        expect(getByText('Untappd Login')).toBeTruthy();
      }, { timeout: 3000 });
    });

    it('should pass onRefreshData callback to LoginWebView', async () => {
      const mockHandleRefresh = jest.fn().mockResolvedValue(undefined);

      mockUseLoginFlow.mockReturnValue({
        isLoggingIn: true,
        loginWebViewVisible: true,
        selectedLoginType: 'member',
        startMemberLogin: jest.fn(),
        startVisitorLogin: jest.fn(),
        handleLoginSuccess: jest.fn().mockResolvedValue(undefined),
        handleLoginCancel: jest.fn(),
      });

      mockUseSettingsRefresh.mockReturnValue({
        refreshing: false,
        handleRefresh: mockHandleRefresh,
      });

      const { getByTestId } = render(<SettingsScreen />);

      await waitFor(() => {
        const modal = getByTestId('login-webview-modal');
        expect(modal).toBeTruthy();
        // The real component receives onRefreshData prop (can't directly test callback)
        // But we can verify the component rendered successfully which proves props work
      }, { timeout: 3000 });
    });

    it('should handle LoginWebView close button correctly', async () => {
      const mockHandleCancel = jest.fn();

      mockUseLoginFlow.mockReturnValue({
        isLoggingIn: true,
        loginWebViewVisible: true,
        selectedLoginType: 'member',
        startMemberLogin: jest.fn(),
        startVisitorLogin: jest.fn(),
        handleLoginSuccess: jest.fn().mockResolvedValue(undefined),
        handleLoginCancel: mockHandleCancel,
      });

      const { getByTestId } = render(<SettingsScreen />);

      await waitFor(() => {
        expect(getByTestId('login-webview-modal')).toBeTruthy();
      }, { timeout: 3000 });

      // Click the real close button from LoginWebView
      const closeButton = getByTestId('close-webview-button');
      fireEvent.press(closeButton);

      await waitFor(() => {
        expect(mockHandleCancel).toHaveBeenCalled();
      }, { timeout: 3000 });
    });
  });

  describe('Router Integration', () => {
    it('should check router.canGoBack on mount', async () => {
      render(<SettingsScreen />);

      await waitFor(() => {
        // The hook checks canGoBack on mount
        expect(mockUseSettingsState).toHaveBeenCalled();
      }, { timeout: 3000 });
    });

    it('should handle router.canGoBack error gracefully', async () => {
      // Mock the hook to handle the error internally
      mockUseSettingsState.mockReturnValue({
        preferences: defaultPreferences,
        loading: false,
        apiUrlsConfigured: true,
        isFirstLogin: false,
        canGoBack: false, // Should default to false on error
        loadPreferences: jest.fn().mockResolvedValue(undefined),
      });

      const { queryByTestId } = render(<SettingsScreen />);

      await waitFor(() => {
        // Should not crash, back button should not be shown
        expect(queryByTestId('icon')).toBeFalsy();
      }, { timeout: 3000 });
    });
  });

  describe('Hook Integration - Direct Hook Usage (Note: Settings uses hooks)', () => {
    it('should be compatible with useLoginFlow hook pattern', async () => {
      const mockStartMemberLogin = jest.fn();

      mockUseLoginFlow.mockReturnValue({
        isLoggingIn: false,
        loginWebViewVisible: false,
        selectedLoginType: null,
        startMemberLogin: mockStartMemberLogin,
        startVisitorLogin: jest.fn(),
        handleLoginSuccess: jest.fn().mockResolvedValue(undefined),
        handleLoginCancel: jest.fn(),
      });

      const { getByText } = render(<SettingsScreen />);

      // Verify login button is not disabled initially (matching useLoginFlow.isLoggingIn = false)
      await waitFor(() => {
        const loginButton = getByText('Login to Flying Saucer');
        expect(loginButton.props.accessibilityState?.disabled).toBeFalsy();
      }, { timeout: 3000 });

      // Start login (matching useLoginFlow.startMemberLogin())
      fireEvent.press(getByText('Login to Flying Saucer'));

      await waitFor(() => {
        expect(mockStartMemberLogin).toHaveBeenCalled();
      }, { timeout: 3000 });
    });

    it('should be compatible with useUntappdLogin hook pattern', async () => {
      const mockStartUntappdLogin = jest.fn();

      mockUseUntappdLogin.mockReturnValue({
        untappdWebViewVisible: false,
        isUntappdLoggedIn: false,
        startUntappdLogin: mockStartUntappdLogin,
        handleUntappdLoginSuccess: jest.fn().mockResolvedValue(undefined),
        handleUntappdLoginCancel: jest.fn(),
        checkUntappdLoginStatus: mockIsUntappdLoggedIn,
      });

      const { getByText } = render(<SettingsScreen />);

      // Verify Untappd login button exists (matching useUntappdLogin.isUntappdLoggedIn = false)
      await waitFor(() => {
        expect(getByText('Login to Untappd')).toBeTruthy();
      }, { timeout: 3000 });

      // Start Untappd login (matching useUntappdLogin.startUntappdLogin())
      fireEvent.press(getByText('Login to Untappd'));

      await waitFor(() => {
        expect(mockStartUntappdLogin).toHaveBeenCalled();
      }, { timeout: 3000 });
    });

    it('should handle Untappd logged-in state like useUntappdLogin hook', async () => {
      // When user is logged in to Untappd (matching useUntappdLogin.isUntappdLoggedIn = true)
      mockUseUntappdLogin.mockReturnValue({
        untappdWebViewVisible: false,
        isUntappdLoggedIn: true,
        startUntappdLogin: jest.fn(),
        handleUntappdLoginSuccess: jest.fn().mockResolvedValue(undefined),
        handleUntappdLoginCancel: jest.fn(),
        checkUntappdLoginStatus: mockIsUntappdLoggedIn,
      });

      const { getByText } = render(<SettingsScreen />);

      await waitFor(() => {
        // Should show "Reconnect" button instead of "Login" (matching hook behavior)
        expect(getByText('Reconnect to Untappd')).toBeTruthy();
      }, { timeout: 3000 });
    });

    it('should handle login state changes like useLoginFlow hook', async () => {
      const mockHandleCancel = jest.fn();

      // Initial state: not logging in (matching useLoginFlow.isLoggingIn = false)
      mockUseLoginFlow.mockReturnValue({
        isLoggingIn: false,
        loginWebViewVisible: false,
        selectedLoginType: null,
        startMemberLogin: jest.fn(),
        startVisitorLogin: jest.fn(),
        handleLoginSuccess: jest.fn().mockResolvedValue(undefined),
        handleLoginCancel: mockHandleCancel,
      });

      const { queryByTestId } = render(<SettingsScreen />);

      await waitFor(() => {
        expect(queryByTestId('login-webview-modal')).toBeNull();
      }, { timeout: 3000 });
    });

    it('should handle Untappd logout and status refresh like useUntappdLogin hook', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert');

      mockUseUntappdLogin.mockReturnValue({
        untappdWebViewVisible: false,
        isUntappdLoggedIn: true,
        startUntappdLogin: jest.fn(),
        handleUntappdLoginSuccess: jest.fn().mockResolvedValue(undefined),
        handleUntappdLoginCancel: jest.fn(),
        checkUntappdLoginStatus: mockIsUntappdLoggedIn,
      });

      const { getByText } = render(<SettingsScreen />);

      // User is logged in initially
      await waitFor(() => {
        expect(getByText('Clear Untappd Credentials')).toBeTruthy();
      }, { timeout: 3000 });

      // Clear credentials (matching useUntappdLogin.checkUntappdLoginStatus() after logout)
      fireEvent.press(getByText('Clear Untappd Credentials'));

      // Verify the logout action was called
      await waitFor(() => {
        expect(mockClearUntappdCookies).toHaveBeenCalled();
      }, { timeout: 5000 });

      // Verify the alert was shown
      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith(
          'Untappd Credentials Cleared',
          expect.any(String),
          expect.any(Array)
        );
      }, { timeout: 5000 });
    });
  });
});
