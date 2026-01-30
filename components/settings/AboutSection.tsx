import React from 'react';
import { View, StyleSheet, ViewStyle, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/ThemedText';
import { useThemeColor } from '@/hooks/useThemeColor';
import { Colors } from '@/constants/Colors';
import { spacing } from '@/constants/spacing';
import SettingsSection from './SettingsSection';
import SettingsItem from './SettingsItem';

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
 * Uses the new SettingsSection and SettingsItem components
 * for consistent styling and dark mode support.
 */
export default function AboutSection({
  helpUrl,
  privacyUrl,
  style,
  testID = 'about-section',
}: AboutSectionProps) {
  const textMutedColor = useThemeColor(
    { light: Colors.light.textMuted, dark: Colors.dark.textMuted },
    'text'
  );

  // Get version information from expo config
  const version = Constants.expoConfig?.version || '1.0.0';

  // Get platform-specific build number
  const buildNumber = Platform.select({
    ios: Constants.platform?.ios?.buildNumber,
    android: Constants.expoConfig?.android?.versionCode?.toString(),
    default: undefined,
  });

  // Get current year for copyright
  const currentYear = new Date().getFullYear();

  /**
   * Opens external URL in browser with haptic feedback
   */
  const handleOpenLink = async (url: string) => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await WebBrowser.openBrowserAsync(url);
    } catch (error) {
      console.error('Failed to open browser:', error);
    }
  };

  // Build version string
  const versionString = buildNumber ? `${version} (${buildNumber})` : version;

  return (
    <View style={style} testID={testID}>
      <SettingsSection title="About">
        {/* App Info */}
        <SettingsItem
          icon="info.circle.fill"
          iconBackgroundColor={Colors.light.info}
          title="Beer Selector"
          subtitle={`Version ${versionString}`}
          accessoryType="none"
          showSeparator={!!(helpUrl || privacyUrl)}
        />

        {/* Help Link */}
        {helpUrl && (
          <SettingsItem
            icon="questionmark.circle.fill"
            iconBackgroundColor={Colors.light.success}
            title="Help & Documentation"
            accessoryType="chevron"
            onPress={() => handleOpenLink(helpUrl)}
            showSeparator={!!privacyUrl}
          />
        )}

        {/* Privacy Policy Link */}
        {privacyUrl && (
          <SettingsItem
            icon="hand.raised.fill"
            iconBackgroundColor="#5856D6"
            title="Privacy Policy"
            accessoryType="chevron"
            onPress={() => handleOpenLink(privacyUrl)}
            showSeparator={false}
          />
        )}
      </SettingsSection>

      {/* Copyright Footer */}
      <ThemedText
        style={[styles.copyrightText, { color: textMutedColor }]}
        accessibilityLabel={`Copyright ${currentYear} Beer Selector. All rights reserved.`}
        accessibilityRole="text"
      >
        {currentYear} Beer Selector. All rights reserved.
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  copyrightText: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.m,
  },
});
