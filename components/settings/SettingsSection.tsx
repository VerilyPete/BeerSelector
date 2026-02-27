import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useThemeColor } from '@/hooks/useThemeColor';
import { Colors } from '@/constants/Colors';
import { spacing, borderRadii } from '@/constants/spacing';

/**
 * Props for SettingsSection component
 */
type SettingsSectionProps = {
  /** Section header title */
  title: string;
  /** Section content (SettingsItem components) */
  children: React.ReactNode;
  /** Optional footer text below the section */
  footer?: string;
  /** Custom style for the container */
  style?: ViewStyle;
  /** Test ID for testing */
  testID?: string;
};

/**
 * SettingsSection Component
 *
 * A container for grouping related settings items.
 * Provides:
 * - Section header with muted text style
 * - Elevated card background for content
 * - Optional footer text for additional context
 * - Proper spacing and dark mode support
 *
 * @example
 * ```tsx
 * <SettingsSection title="Account">
 *   <SettingsItem
 *     icon="person.fill"
 *     title="Profile"
 *     onPress={() => {}}
 *   />
 * </SettingsSection>
 * ```
 */
export default function SettingsSection({
  title,
  children,
  footer,
  style,
  testID,
}: SettingsSectionProps) {
  const textMutedColor = useThemeColor(
    { light: Colors.light.textMuted, dark: Colors.dark.textMuted },
    'text'
  );
  const backgroundElevatedColor = useThemeColor(
    { light: Colors.light.backgroundElevated, dark: Colors.dark.backgroundElevated },
    'background'
  );
  const borderColor = useThemeColor(
    { light: Colors.light.border, dark: Colors.dark.border },
    'background'
  );

  return (
    <View style={[styles.container, style]} testID={testID}>
      {/* Section Header */}
      <ThemedText
        style={[styles.sectionHeader, { color: textMutedColor }]}
        accessibilityRole="header"
      >
        {title.toUpperCase()}
      </ThemedText>

      {/* Section Content Card */}
      <ThemedView
        style={[
          styles.sectionCard,
          {
            backgroundColor: backgroundElevatedColor,
            borderColor: borderColor,
          },
        ]}
      >
        {children}
      </ThemedView>

      {/* Optional Footer */}
      {footer && (
        <ThemedText style={[styles.sectionFooter, { color: textMutedColor }]}>{footer}</ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.l,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.5,
    marginBottom: spacing.s,
    marginLeft: spacing.m,
  },
  sectionCard: {
    borderRadius: borderRadii.l,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  sectionFooter: {
    fontSize: 13,
    marginTop: spacing.s,
    marginHorizontal: spacing.m,
    lineHeight: 18,
  },
});
