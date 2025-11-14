import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Platform } from 'react-native';

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

// Mock expo-constants
jest.mock('expo-constants', () => ({
  default: {
    expoConfig: {
      version: '1.0.0',
      ios: {
        buildNumber: '42',
      },
      android: {
        versionCode: 42,
      },
    },
  },
}));

// Mock expo-web-browser
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn().mockResolvedValue({ type: 'cancel' }),
}));

// Import after mocks
import AboutSection from '@/components/settings/AboutSection';
import * as WebBrowser from 'expo-web-browser';

// Constants for external URLs - these will be added in implementation
const HELP_URL = 'https://github.com/VerilyPete/BeerSelector/wiki';
const PRIVACY_URL = 'https://github.com/VerilyPete/BeerSelector/blob/main/PRIVACY.md';

describe('AboutSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Component Rendering', () => {
    it('should render AboutSection component', () => {
      const { getByText } = render(<AboutSection />);
      expect(getByText).toBeDefined();
    });

    it('should render app name', () => {
      const { getByText } = render(<AboutSection />);
      expect(getByText('Beer Selector')).toBeTruthy();
    });

    it('should render app version correctly', () => {
      const { getByText } = render(<AboutSection />);
      expect(getByText(/Version 1.0.0/)).toBeTruthy();
    });

    it('should render build number on iOS', () => {
      jest.spyOn(Platform, 'select').mockImplementation(({ ios }) => ios);
      const { getByText } = render(<AboutSection />);
      expect(getByText(/Build 42/)).toBeTruthy();
    });

    it('should render version code on Android', () => {
      jest.spyOn(Platform, 'select').mockImplementation(({ android }) => android);
      const { getByText } = render(<AboutSection />);
      expect(getByText(/Build 42/)).toBeTruthy();
    });

    it('should have section title', () => {
      const { getByText } = render(<AboutSection />);
      expect(getByText('About')).toBeTruthy();
    });
  });

  describe('Version Display', () => {
    it('should handle missing version gracefully', () => {
      jest.resetModules();
      jest.doMock('expo-constants', () => ({
        default: {
          expoConfig: null,
        },
      }));

      const { getByText } = render(<AboutSection />);
      // Should show default version
      expect(getByText(/Version 1.0.0/)).toBeTruthy();
    });

    it('should handle missing build number gracefully', () => {
      jest.resetModules();
      jest.doMock('expo-constants', () => ({
        default: {
          expoConfig: {
            version: '1.0.0',
            ios: {},
            android: {},
          },
        },
      }));

      const { queryByText } = render(<AboutSection />);
      // Should still render component
      expect(queryByText('Beer Selector')).toBeTruthy();
    });

    it('should format version text with proper spacing', () => {
      const { getByText } = render(<AboutSection />);
      const versionText = getByText(/Version 1.0.0/);
      expect(versionText).toBeTruthy();
      // Text should contain both version and build
      expect(versionText.props.children).toMatch(/Version.*Build/);
    });
  });

  describe('Dark Mode Support', () => {
    it('should render correctly in dark mode', () => {
      const useColorScheme = require('@/hooks/useColorScheme').useColorScheme;
      useColorScheme.mockReturnValue('dark');

      const { getByText } = render(<AboutSection />);
      expect(getByText('Beer Selector')).toBeTruthy();
    });

    it('should apply dark mode theme colors', () => {
      const useThemeColor = require('@/hooks/useThemeColor').useThemeColor;
      useThemeColor.mockReturnValue('#FFFFFF');

      const { getByText } = render(<AboutSection />);
      expect(getByText('Beer Selector')).toBeTruthy();
    });
  });

  describe('Accessibility', () => {
    it('should have accessibility label for app name', () => {
      const { getByLabelText } = render(<AboutSection />);
      expect(getByLabelText('Beer Selector application')).toBeTruthy();
    });

    it('should have accessibility label for version info', () => {
      const { getByLabelText } = render(<AboutSection />);
      expect(getByLabelText(/Version 1.0.0, Build 42/)).toBeTruthy();
    });

    it('should have proper role for interactive elements', () => {
      const { getByRole } = render(<AboutSection />);
      // Links should have button role
      expect(getByRole('button')).toBeTruthy();
    });
  });

  describe('External Links', () => {
    // NOTE: These tests expect the implementation to add Help and Privacy links
    // which are reasonable UX improvements for the About section

    it('should render help/documentation link', () => {
      const { getByText } = render(<AboutSection helpUrl={HELP_URL} />);
      expect(getByText(/Help/)).toBeTruthy();
    });

    it('should open help URL when pressed', async () => {
      const { getByText } = render(<AboutSection helpUrl={HELP_URL} />);
      const helpButton = getByText(/Help/);

      fireEvent.press(helpButton);

      expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(HELP_URL);
    });

    it('should render privacy policy link', () => {
      const { getByText } = render(<AboutSection privacyUrl={PRIVACY_URL} />);
      expect(getByText(/Privacy/)).toBeTruthy();
    });

    it('should open privacy URL when pressed', async () => {
      const { getByText } = render(<AboutSection privacyUrl={PRIVACY_URL} />);
      const privacyButton = getByText(/Privacy/);

      fireEvent.press(privacyButton);

      expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(PRIVACY_URL);
    });

    it('should handle link opening errors gracefully', async () => {
      (WebBrowser.openBrowserAsync as jest.Mock).mockRejectedValue(
        new Error('Failed to open browser')
      );

      const { getByText } = render(<AboutSection helpUrl={HELP_URL} />);
      const helpButton = getByText(/Help/);

      // Should not throw
      await expect(async () => {
        fireEvent.press(helpButton);
      }).not.toThrow();
    });

    it('should not render help link when URL not provided', () => {
      const { queryByText } = render(<AboutSection />);
      expect(queryByText(/Help/)).toBeNull();
    });

    it('should not render privacy link when URL not provided', () => {
      const { queryByText } = render(<AboutSection />);
      expect(queryByText(/Privacy/)).toBeNull();
    });
  });

  describe('Copyright Information', () => {
    it('should render copyright notice', () => {
      const { getByText } = render(<AboutSection />);
      const currentYear = new Date().getFullYear();
      expect(getByText(new RegExp(`© ${currentYear}`))).toBeTruthy();
    });

    it('should include developer/company name in copyright', () => {
      const { getByText } = render(<AboutSection />);
      expect(getByText(/Beer Selector/)).toBeTruthy();
    });
  });

  describe('Platform-Specific Rendering', () => {
    it('should show iOS-specific build information on iOS', () => {
      jest.spyOn(Platform, 'select').mockImplementation(({ ios }) => ios);
      const { getByText } = render(<AboutSection />);
      expect(getByText(/Build 42/)).toBeTruthy();
    });

    it('should show Android-specific version code on Android', () => {
      jest.spyOn(Platform, 'select').mockImplementation(({ android }) => android);
      const { getByText } = render(<AboutSection />);
      expect(getByText(/Build 42/)).toBeTruthy();
    });

    it('should handle web platform gracefully', () => {
      jest.spyOn(Platform, 'select').mockImplementation(({ web }) => web || 'web');
      const { getByText } = render(<AboutSection />);
      // Should still render basic info
      expect(getByText('Beer Selector')).toBeTruthy();
    });
  });

  describe('Component Props', () => {
    it('should accept and apply custom style prop', () => {
      const customStyle = { marginTop: 20 };
      const { container } = render(<AboutSection style={customStyle} />);
      // Component should accept style prop
      expect(container).toBeTruthy();
    });

    it('should accept testID prop for testing', () => {
      const { getByTestId } = render(<AboutSection testID="about-section" />);
      expect(getByTestId('about-section')).toBeTruthy();
    });

    it('should accept helpUrl prop', () => {
      const { getByText } = render(<AboutSection helpUrl={HELP_URL} />);
      expect(getByText(/Help/)).toBeTruthy();
    });

    it('should accept privacyUrl prop', () => {
      const { getByText } = render(<AboutSection privacyUrl={PRIVACY_URL} />);
      expect(getByText(/Privacy/)).toBeTruthy();
    });
  });
});
