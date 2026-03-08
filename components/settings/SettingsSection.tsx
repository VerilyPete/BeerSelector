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
      <View
        style={[
          styles.labelPlate,
          {
            backgroundColor: colors.steelLabelPlate,
            borderColor: colors.steelLabelBorder,
          },
        ]}
      >
        <Text
          style={[styles.sectionHeader, { color: colors.border }]}
          accessibilityRole="header"
        >
          {title.toUpperCase()}
        </Text>
      </View>

      <View
        style={[
          styles.steelBezelOuter,
          {
            backgroundColor: colors.steelBezel,
            borderColor: colors.steelBezelBorder,
          },
        ]}
      >
        <View
          style={[
            styles.sectionCard,
            {
              backgroundColor: colors.backgroundSecondary,
              borderColor: colors.border,
            },
          ]}
        >
          {children}
        </View>
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
  labelPlate: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 3,
    paddingHorizontal: 10,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.4,
    shadowRadius: 2,
  },
  sectionHeader: {
    fontFamily: 'SpaceMono',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2,
  },
  steelBezelOuter: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 3,
  },
  sectionCard: {
    borderWidth: 1,
    borderRadius: 11,
    overflow: 'hidden',
  },
  sectionFooter: {
    fontFamily: 'SpaceMono',
    fontSize: 11,
    marginTop: 8,
    marginHorizontal: 4,
    lineHeight: 16,
  },
});
