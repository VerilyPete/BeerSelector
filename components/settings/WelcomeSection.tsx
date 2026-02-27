import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { useThemeColor } from '@/hooks/useThemeColor';
import { Colors } from '@/constants/Colors';
import { spacing, borderRadii } from '@/constants/spacing';
import SettingsSection from './SettingsSection';
import SettingsItem from './SettingsItem';

/**
 * Props for WelcomeSection component
 */
type WelcomeSectionProps = {
  /**
   * Callback when user taps login button
   */
  onLogin: () => void;

  /**
   * Whether login is in progress (disables button)
   */
  loginLoading: boolean;

  /**
   * Whether any refresh is in progress (disables button)
   */
  refreshing: boolean;

  /**
   * Custom style for the container
   */
  style?: ViewStyle;

  /**
   * Test ID for testing
   */
  testID?: string;
};

/**
 * WelcomeSection Component
 *
 * Displays first-login welcome message with:
 * - Welcome message card
 * - Login action using SettingsItem
 *
 * Shown only on first app launch before API URLs are configured.
 * Uses the new SettingsSection and SettingsItem components.
 */
export default function WelcomeSection({
  onLogin,
  loginLoading,
  refreshing,
  style,
  testID = 'welcome-section',
}: WelcomeSectionProps) {
  const backgroundElevatedColor = useThemeColor(
    { light: Colors.light.backgroundElevated, dark: Colors.dark.backgroundElevated },
    'background'
  );
  const borderColor = useThemeColor(
    { light: Colors.light.border, dark: Colors.dark.border },
    'background'
  );
  const textSecondaryColor = useThemeColor(
    { light: Colors.light.textSecondary, dark: Colors.dark.textSecondary },
    'text'
  );

  const isDisabled = loginLoading || refreshing;

  return (
    <View style={style} testID={testID}>
      {/* Welcome Message Card */}
      <View
        style={[
          styles.welcomeCard,
          {
            backgroundColor: backgroundElevatedColor,
            borderColor: borderColor,
          },
        ]}
      >
        <ThemedText style={styles.welcomeTitle}>Welcome to Beer Selector</ThemedText>
        <ThemedText style={[styles.welcomeText, { color: textSecondaryColor }]}>
          Track your UFO Club progress, discover new beers, and never miss a tap takeover.
        </ThemedText>
      </View>

      {/* Account Section with Login */}
      <SettingsSection
        title="Get Started"
        footer="Sign in with your UFO Club account to track your tasted beers, or continue as a visitor to browse taplists."
      >
        <SettingsItem
          icon="person.crop.circle.badge.plus"
          iconBackgroundColor={Colors.light.tint}
          title={loginLoading ? 'Signing in...' : 'Sign In to Flying Saucer'}
          subtitle="Access your UFO Club account"
          accessoryType={loginLoading ? 'loading' : 'chevron'}
          onPress={onLogin}
          disabled={isDisabled}
          showSeparator={false}
          testID="login-button"
        />
      </SettingsSection>
    </View>
  );
}

const styles = StyleSheet.create({
  welcomeCard: {
    borderRadius: borderRadii.l,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.l,
    marginBottom: spacing.l,
    alignItems: 'center',
  },
  welcomeTitle: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: spacing.s,
    textAlign: 'center',
  },
  welcomeText: {
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
  },
});
