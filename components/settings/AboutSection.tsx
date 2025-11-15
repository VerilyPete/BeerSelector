import React from 'react';
import { View, TouchableOpacity, StyleSheet, ViewStyle, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useThemeColor } from '@/hooks/useThemeColor';

/**
 * Props for AboutSection component
 */
interface AboutSectionProps {
  /** URL for help/documentation link (optional) */
  helpUrl?: string;
  /** URL for privacy policy link (optional) */
  privacyUrl?: string;
  /** Custom style for the container */
  style?: ViewStyle;
  /** Test ID for testing */
  testID?: string;
}

/**
 * AboutSection Component
 *
 * Displays app information including:
 * - App name and version
 * - Build number (platform-specific)
 * - External links (Help, Privacy)
 * - Copyright notice
 *
 * Supports dark mode and accessibility features.
 */
export default function AboutSection({
  helpUrl,
  privacyUrl,
  style,
  testID = 'about-section',
}: AboutSectionProps) {
  const tintColor = useThemeColor({}, 'tint');
  const linkColor = useThemeColor({ light: '#007AFF', dark: '#0A84FF' }, 'tint');

  // Get version information from expo config
  const version = Constants.expoConfig?.version || '1.0.0';

  // Get platform-specific build number
  const buildNumber = Platform.select({
    ios: Constants.expoConfig?.ios?.buildNumber,
    android: Constants.expoConfig?.android?.versionCode,
    default: undefined,
  });

  // Get current year for copyright
  const currentYear = new Date().getFullYear();

  /**
   * Opens external URL in browser
   * Handles errors gracefully without throwing
   */
  const handleOpenLink = async (url: string) => {
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch (error) {
      console.error('Failed to open browser:', error);
      // Fail silently - user experience is better without error alerts for link opening failures
    }
  };

  return (
    <ThemedView style={[styles.container, style]} testID={testID}>
      {/* Section Title */}
      <ThemedText style={styles.sectionTitle}>About</ThemedText>

      {/* App Name */}
      <ThemedText
        testID="app-name-text"
        style={styles.appName}
        accessibilityLabel="Beer Selector application"
        accessibilityRole="text"
      >
        Beer Selector
      </ThemedText>

      {/* Version and Build Information */}
      <ThemedText
        testID="version-text"
        style={styles.versionText}
        accessibilityLabel={`Version ${version}${buildNumber ? `, Build ${buildNumber}` : ''}`}
        accessibilityRole="text"
      >
        Version {version}
        {buildNumber && ` • Build ${buildNumber}`}
      </ThemedText>

      {/* External Links */}
      {(helpUrl || privacyUrl) && (
        <View style={styles.linksContainer}>
          {helpUrl && (
            <TouchableOpacity
              onPress={() => handleOpenLink(helpUrl)}
              style={styles.linkButton}
              accessibilityRole="button"
              accessibilityLabel="Help and Documentation"
              accessibilityHint="Opens help documentation in browser"
            >
              <ThemedText style={[styles.linkText, { color: linkColor }]}>
                Help & Documentation
              </ThemedText>
            </TouchableOpacity>
          )}

          {privacyUrl && (
            <TouchableOpacity
              onPress={() => handleOpenLink(privacyUrl)}
              style={styles.linkButton}
              accessibilityRole="button"
              accessibilityLabel="Privacy Policy"
              accessibilityHint="Opens privacy policy in browser"
            >
              <ThemedText style={[styles.linkText, { color: linkColor }]}>
                Privacy Policy
              </ThemedText>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Copyright Notice */}
      <ThemedText
        style={styles.copyrightText}
        accessibilityLabel={`Copyright ${currentYear} Beer Selector. All rights reserved.`}
        accessibilityRole="text"
      >
        © {currentYear} Beer Selector. All rights reserved.
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  appName: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  versionText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
    opacity: 0.7,
  },
  linksContainer: {
    marginTop: 8,
    marginBottom: 20,
  },
  linkButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginVertical: 4,
  },
  linkText: {
    fontSize: 16,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
  copyrightText: {
    fontSize: 12,
    textAlign: 'center',
    opacity: 0.5,
    marginTop: 8,
  },
});
