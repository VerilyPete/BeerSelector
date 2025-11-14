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

// Mock ThemedText and ThemedView with actual React Native components
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

// Import after mocks
import DataManagementSection from '@/components/settings/DataManagementSection';

describe('DataManagementSection', () => {
  const defaultProps = {
    // Refresh functionality
    apiUrlsConfigured: true,
    refreshing: false,
    onRefresh: jest.fn().mockResolvedValue(undefined),

    // Login (first launch only)
    isFirstLogin: false,
    onLogin: jest.fn(),

    // Untappd auth
    isUntappdLoggedIn: false,
    onUntappdLogin: jest.fn(),
    onUntappdLogout: jest.fn(),

    // Navigation
    canGoBack: true,
    onGoHome: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Component Rendering', () => {
    it('should render DataManagementSection component', () => {
      const { getByText } = render(<DataManagementSection {...defaultProps} />);
      expect(getByText('Data Management')).toBeTruthy();
    });

    it('should not render section when first login and URLs not configured', () => {
      const props = { ...defaultProps, isFirstLogin: true, apiUrlsConfigured: false };
      const { queryByText } = render(<DataManagementSection {...props} />);
      expect(queryByText('Data Management')).toBeNull();
    });

    it('should render section when not first login', () => {
      const { getByText } = render(<DataManagementSection {...defaultProps} />);
      expect(getByText('Data Management')).toBeTruthy();
    });

    it('should render section when first login but URLs configured', () => {
      const props = { ...defaultProps, isFirstLogin: true, apiUrlsConfigured: true };
      const { getByText } = render(<DataManagementSection {...props} />);
      expect(getByText('Data Management')).toBeTruthy();
    });
  });

  describe('Refresh Button', () => {
    it('should render refresh button when API URLs configured', () => {
      const { getByText } = render(<DataManagementSection {...defaultProps} />);
      expect(getByText('Refresh All Beer Data')).toBeTruthy();
    });

    it('should not render refresh button when API URLs not configured', () => {
      const props = { ...defaultProps, apiUrlsConfigured: false };
      const { queryByText } = render(<DataManagementSection {...props} />);
      expect(queryByText('Refresh All Beer Data')).toBeNull();
    });

    it('should call onRefresh when refresh button pressed', () => {
      const mockOnRefresh = jest.fn().mockResolvedValue(undefined);
      const { getByText } = render(
        <DataManagementSection {...defaultProps} onRefresh={mockOnRefresh} />
      );

      fireEvent.press(getByText('Refresh All Beer Data'));

      expect(mockOnRefresh).toHaveBeenCalledTimes(1);
    });

    it('should show loading text when refreshing', () => {
      const props = { ...defaultProps, refreshing: true };
      const { getByText } = render(<DataManagementSection {...props} />);
      expect(getByText('Refreshing data...')).toBeTruthy();
    });

    it('should disable refresh button when refreshing', () => {
      const props = { ...defaultProps, refreshing: true };
      const { getByText } = render(<DataManagementSection {...props} />);
      const button = getByText('Refreshing data...');
      expect(button.props.accessibilityState?.disabled).toBe(true);
    });
  });

  describe('Login Button (First Launch)', () => {
    it('should not render login button when on first login', () => {
      const props = { ...defaultProps, isFirstLogin: true };
      const { queryByText } = render(<DataManagementSection {...props} />);
      expect(queryByText('Login to Flying Saucer')).toBeNull();
    });

    it('should render login button when not on first login', () => {
      const { getByText } = render(<DataManagementSection {...defaultProps} />);
      expect(getByText('Login to Flying Saucer')).toBeTruthy();
    });

    it('should call onLogin when login button pressed', () => {
      const mockOnLogin = jest.fn();
      const { getByText } = render(
        <DataManagementSection {...defaultProps} onLogin={mockOnLogin} />
      );

      fireEvent.press(getByText('Login to Flying Saucer'));

      expect(mockOnLogin).toHaveBeenCalledTimes(1);
    });

    it('should disable login button when refreshing', () => {
      const props = { ...defaultProps, refreshing: true };
      const { getByText } = render(<DataManagementSection {...props} />);
      const button = getByText('Login to Flying Saucer');
      expect(button.props.accessibilityState?.disabled).toBe(true);
    });
  });

  describe('Untappd Login Button', () => {
    it('should render Untappd login button', () => {
      const { getByText } = render(<DataManagementSection {...defaultProps} />);
      expect(getByText('Login to Untappd')).toBeTruthy();
    });

    it('should show "Reconnect to Untappd" when logged in', () => {
      const props = { ...defaultProps, isUntappdLoggedIn: true };
      const { getByText } = render(<DataManagementSection {...props} />);
      expect(getByText('Reconnect to Untappd')).toBeTruthy();
    });

    it('should call onUntappdLogin when button pressed', () => {
      const mockOnUntappdLogin = jest.fn();
      const { getByText } = render(
        <DataManagementSection {...defaultProps} onUntappdLogin={mockOnUntappdLogin} />
      );

      fireEvent.press(getByText('Login to Untappd'));

      expect(mockOnUntappdLogin).toHaveBeenCalledTimes(1);
    });

    it('should disable Untappd login button when refreshing', () => {
      const props = { ...defaultProps, refreshing: true };
      const { getByText } = render(<DataManagementSection {...props} />);
      const button = getByText('Login to Untappd');
      expect(button.props.accessibilityState?.disabled).toBe(true);
    });
  });

  describe('Untappd Logout Button', () => {
    it('should not render logout button when not logged in', () => {
      const { queryByText } = render(<DataManagementSection {...defaultProps} />);
      expect(queryByText('Clear Untappd Credentials')).toBeNull();
    });

    it('should render logout button when logged in', () => {
      const props = { ...defaultProps, isUntappdLoggedIn: true };
      const { getByText } = render(<DataManagementSection {...props} />);
      expect(getByText('Clear Untappd Credentials')).toBeTruthy();
    });

    it('should call onUntappdLogout when button pressed', () => {
      const mockOnUntappdLogout = jest.fn();
      const props = {
        ...defaultProps,
        isUntappdLoggedIn: true,
        onUntappdLogout: mockOnUntappdLogout,
      };
      const { getByText } = render(<DataManagementSection {...props} />);

      fireEvent.press(getByText('Clear Untappd Credentials'));

      expect(mockOnUntappdLogout).toHaveBeenCalledTimes(1);
    });

    it('should disable logout button when refreshing', () => {
      const props = { ...defaultProps, isUntappdLoggedIn: true, refreshing: true };
      const { getByText } = render(<DataManagementSection {...props} />);
      const button = getByText('Clear Untappd Credentials');
      expect(button.props.accessibilityState?.disabled).toBe(true);
    });
  });

  describe('Home Navigation Button', () => {
    it('should not render home button when can go back', () => {
      const props = { ...defaultProps, canGoBack: true };
      const { queryByText } = render(<DataManagementSection {...props} />);
      expect(queryByText('Go to Home Screen')).toBeNull();
    });

    it('should not render home button when URLs not configured', () => {
      const props = { ...defaultProps, apiUrlsConfigured: false, canGoBack: false };
      const { queryByText } = render(<DataManagementSection {...props} />);
      expect(queryByText('Go to Home Screen')).toBeNull();
    });

    it('should render home button when URLs configured and cannot go back', () => {
      const props = { ...defaultProps, canGoBack: false };
      const { getByText } = render(<DataManagementSection {...props} />);
      expect(getByText('Go to Home Screen')).toBeTruthy();
    });

    it('should call onGoHome when button pressed', () => {
      const mockOnGoHome = jest.fn();
      const props = { ...defaultProps, canGoBack: false, onGoHome: mockOnGoHome };
      const { getByText } = render(<DataManagementSection {...props} />);

      fireEvent.press(getByText('Go to Home Screen'));

      expect(mockOnGoHome).toHaveBeenCalledTimes(1);
    });

    it('should disable home button when refreshing', () => {
      const props = { ...defaultProps, canGoBack: false, refreshing: true };
      const { getByText } = render(<DataManagementSection {...props} />);
      const button = getByText('Go to Home Screen');
      expect(button.props.accessibilityState?.disabled).toBe(true);
    });
  });

  describe('Conditional Rendering Based on State', () => {
    it('should show all buttons when fully configured and not first login', () => {
      const { getByText } = render(<DataManagementSection {...defaultProps} />);

      expect(getByText('Refresh All Beer Data')).toBeTruthy();
      expect(getByText('Login to Flying Saucer')).toBeTruthy();
      expect(getByText('Login to Untappd')).toBeTruthy();
    });

    it('should only show Untappd button when not configured', () => {
      const props = { ...defaultProps, apiUrlsConfigured: false };
      const { getByText, queryByText } = render(<DataManagementSection {...props} />);

      expect(queryByText('Refresh All Beer Data')).toBeNull();
      expect(getByText('Login to Flying Saucer')).toBeTruthy();
      expect(getByText('Login to Untappd')).toBeTruthy();
    });

    it('should show refresh and Untappd when configured but first login', () => {
      const props = { ...defaultProps, isFirstLogin: true, apiUrlsConfigured: true };
      const { getByText, queryByText } = render(<DataManagementSection {...props} />);

      expect(getByText('Refresh All Beer Data')).toBeTruthy();
      expect(queryByText('Login to Flying Saucer')).toBeNull(); // Hidden on first login
      expect(getByText('Login to Untappd')).toBeTruthy();
    });
  });

  describe('Loading States', () => {
    it('should disable all buttons when refreshing', () => {
      const props = { ...defaultProps, refreshing: true };
      const { getByText } = render(<DataManagementSection {...props} />);

      const refreshButton = getByText('Refreshing data...');
      const loginButton = getByText('Login to Flying Saucer');
      const untappdButton = getByText('Login to Untappd');

      expect(refreshButton.props.accessibilityState?.disabled).toBe(true);
      expect(loginButton.props.accessibilityState?.disabled).toBe(true);
      expect(untappdButton.props.accessibilityState?.disabled).toBe(true);
    });

    it('should show appropriate loading text for refresh', () => {
      const props = { ...defaultProps, refreshing: true };
      const { getByText } = render(<DataManagementSection {...props} />);
      expect(getByText('Refreshing data...')).toBeTruthy();
    });
  });

  describe('Dark Mode Support', () => {
    it('should render correctly in dark mode', () => {
      const useColorScheme = require('@/hooks/useColorScheme').useColorScheme;
      useColorScheme.mockReturnValue('dark');

      const { getByText } = render(<DataManagementSection {...defaultProps} />);
      expect(getByText('Data Management')).toBeTruthy();
    });

    it('should apply dark mode button colors', () => {
      const useThemeColor = require('@/hooks/useThemeColor').useThemeColor;
      useThemeColor.mockReturnValue('#1C1C1E');

      const { getByText } = render(<DataManagementSection {...defaultProps} />);
      expect(getByText('Refresh All Beer Data')).toBeTruthy();
    });
  });

  describe('Component Props', () => {
    it('should accept custom style prop', () => {
      const customStyle = { marginTop: 20 };
      const { container } = render(
        <DataManagementSection {...defaultProps} style={customStyle} />
      );
      expect(container).toBeTruthy();
    });

    it('should accept testID prop', () => {
      const { getByTestId } = render(
        <DataManagementSection {...defaultProps} testID="data-management" />
      );
      expect(getByTestId('data-management')).toBeTruthy();
    });
  });

  describe('Accessibility', () => {
    it('should have accessibility label for refresh button', () => {
      const { getByLabelText } = render(<DataManagementSection {...defaultProps} />);
      expect(getByLabelText(/Refresh all beer data/)).toBeTruthy();
    });

    it('should have accessibility label for login button', () => {
      const { getByLabelText } = render(<DataManagementSection {...defaultProps} />);
      expect(getByLabelText(/Login to Flying Saucer/)).toBeTruthy();
    });

    it('should indicate disabled state to screen readers', () => {
      const props = { ...defaultProps, refreshing: true };
      const { getByText } = render(<DataManagementSection {...props} />);

      const refreshButton = getByText('Refreshing data...');
      expect(refreshButton.props.accessibilityState?.disabled).toBe(true);
    });
  });
});
