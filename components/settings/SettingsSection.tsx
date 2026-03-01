import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/Colors';

type SettingsSectionProps = {
  title: string;
  children: React.ReactNode;
  footer?: string;
  style?: ViewStyle;
  testID?: string;
};

export default function SettingsSection({
  title,
  children,
  footer,
  style,
  testID,
}: SettingsSectionProps) {
  const colorScheme = useColorScheme() ?? 'dark';
  const colors = Colors[colorScheme];

  return (
    <View style={[styles.container, style]} testID={testID}>
      <Text
        style={[styles.sectionHeader, { color: colors.textSecondary }]}
        accessibilityRole="header"
      >
        {title.toUpperCase()}
      </Text>

      <View
        style={[
          styles.sectionCard,
          {
            backgroundColor: colors.backgroundElevated,
            borderColor: colors.border,
          },
        ]}
      >
        {children}
      </View>

      {footer && (
        <Text style={[styles.sectionFooter, { color: colors.textSecondary }]}>{footer}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
  },
  sectionHeader: {
    fontFamily: 'Inter',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 3,
    marginBottom: 8,
    marginLeft: 4,
  },
  sectionCard: {
    borderWidth: 1,
    overflow: 'hidden',
  },
  sectionFooter: {
    fontFamily: 'Space Mono',
    fontSize: 11,
    marginTop: 8,
    marginHorizontal: 4,
    lineHeight: 16,
  },
});
