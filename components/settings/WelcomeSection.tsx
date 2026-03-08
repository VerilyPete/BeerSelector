import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/Colors';
import SettingsSection from './SettingsSection';
import SettingsItem from './SettingsItem';

type WelcomeSectionProps = {
  onLogin: () => void;
  loginLoading: boolean;
  refreshing: boolean;
  style?: ViewStyle;
  testID?: string;
};

export default function WelcomeSection({
  onLogin,
  loginLoading,
  refreshing,
  style,
  testID = 'welcome-section',
}: WelcomeSectionProps) {
  const colorScheme = useColorScheme() ?? 'dark';
  const colors = Colors[colorScheme];

  const isDisabled = loginLoading || refreshing;

  return (
    <View style={style} testID={testID}>
      <View
        style={[
          styles.welcomeCard,
          {
            backgroundColor: colors.backgroundElevated,
            borderColor: colors.border,
          },
        ]}
      >
        <Text style={[styles.welcomeTitle, { color: colors.text }]}>Welcome to Beer Selector</Text>
        <Text style={[styles.welcomeText, { color: colors.textSecondary }]}>
          Track your UFO Club progress, discover new beers, and never miss a tap takeover.
        </Text>
      </View>

      <SettingsSection
        title="Get Started"
        footer="Sign in with your UFO Club account to track your tasted beers, or continue as a visitor to browse taplists."
      >
        <SettingsItem
          icon="person.crop.circle.badge.plus"
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
    borderWidth: 1,
    padding: 24,
    marginBottom: 24,
    alignItems: 'center',
  },
  welcomeTitle: {
    fontFamily: 'SpaceGrotesk-SemiBold',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  welcomeText: {
    fontFamily: 'SpaceMono',
    fontSize: 11,
    lineHeight: 18,
    textAlign: 'center',
  },
});
