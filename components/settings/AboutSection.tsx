import React from 'react';
import { View, Text, StyleSheet, ViewStyle, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import * as Haptics from 'expo-haptics';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/Colors';
import SettingsSection from './SettingsSection';
import SettingsItem from './SettingsItem';

type AboutSectionProps = {
  helpUrl?: string;
  privacyUrl?: string;
  style?: ViewStyle;
  testID?: string;
};

export default function AboutSection({
  helpUrl,
  privacyUrl,
  style,
  testID = 'about-section',
}: AboutSectionProps) {
  const colorScheme = useColorScheme() ?? 'dark';
  const colors = Colors[colorScheme];

  const version = Constants.expoConfig?.version || '1.0.0';

  const buildNumber = Platform.select({
    ios: Constants.platform?.ios?.buildNumber,
    android: Constants.expoConfig?.android?.versionCode?.toString(),
    default: undefined,
  });

  const currentYear = new Date().getFullYear();

  const handleOpenLink = async (url: string) => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await WebBrowser.openBrowserAsync(url);
    } catch (error) {
      console.error('Failed to open browser:', error);
    }
  };

  const versionString = buildNumber ? `${version} (${buildNumber})` : version;

  return (
    <View style={style} testID={testID}>
      <SettingsSection title="About">
        <SettingsItem
          icon="info.circle.fill"
          title="Beer Selector"
          subtitle={`Version ${versionString}`}
          accessoryType="none"
          showSeparator={!!(helpUrl || privacyUrl)}
        />

        {helpUrl && (
          <SettingsItem
            icon="questionmark.circle.fill"
            title="Help & Documentation"
            accessoryType="chevron"
            onPress={() => handleOpenLink(helpUrl)}
            showSeparator={!!privacyUrl}
          />
        )}

        {privacyUrl && (
          <SettingsItem
            icon="hand.raised.fill"
            title="Privacy Policy"
            accessoryType="chevron"
            onPress={() => handleOpenLink(privacyUrl)}
            showSeparator={false}
          />
        )}
      </SettingsSection>

      <Text
        style={[styles.copyrightText, { color: colors.textSecondary }]}
        accessibilityLabel={`Copyright ${currentYear} Beer Selector. All rights reserved.`}
        accessibilityRole="text"
      >
        {currentYear} Beer Selector. All rights reserved.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  copyrightText: {
    fontFamily: 'Space Mono',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 32,
    marginBottom: 16,
  },
});
