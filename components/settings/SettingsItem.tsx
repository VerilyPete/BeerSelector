import React from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
  ActivityIndicator,
  Switch,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { SymbolViewProps } from 'expo-symbols';
import { IconSymbol } from '@/components/ui/IconSymbol';
import { ThemedText } from '@/components/ThemedText';
import { useThemeColor } from '@/hooks/useThemeColor';
import { Colors } from '@/constants/Colors';
import { spacing } from '@/constants/spacing';

/**
 * Types of right accessories for settings items
 */
type AccessoryType =
  | 'chevron' // Navigation indicator
  | 'switch' // Toggle switch
  | 'value' // Display value text
  | 'loading' // Loading spinner
  | 'none'; // No accessory

/**
 * Props for SettingsItem component
 */
interface SettingsItemProps {
  /** SF Symbol icon name */
  icon?: SymbolViewProps['name'];
  /** Icon background color (optional, defaults to tint) */
  iconBackgroundColor?: string;
  /** Icon tint color (optional, defaults to white) */
  iconColor?: string;
  /** Main title text */
  title: string;
  /** Optional subtitle text */
  subtitle?: string;
  /** Type of right accessory */
  accessoryType?: AccessoryType;
  /** Value to display when accessoryType is 'value' */
  value?: string;
  /** Switch state when accessoryType is 'switch' */
  switchValue?: boolean;
  /** Callback when switch is toggled */
  onSwitchChange?: (value: boolean) => void;
  /** Callback when item is pressed */
  onPress?: () => void;
  /** Whether the item is disabled */
  disabled?: boolean;
  /** Whether this is a destructive action (uses red color) */
  destructive?: boolean;
  /** Whether to show separator at bottom */
  showSeparator?: boolean;
  /** Custom style for the container */
  style?: ViewStyle;
  /** Test ID for testing */
  testID?: string;
}

/**
 * SettingsItem Component
 *
 * A single settings row with:
 * - Icon on the left (with optional colored background)
 * - Title and optional subtitle
 * - Right accessory (chevron, switch, value, or loading)
 * - Haptic feedback on press
 * - Dark mode support
 *
 * @example
 * ```tsx
 * <SettingsItem
 *   icon="person.fill"
 *   title="Profile"
 *   subtitle="View and edit your profile"
 *   accessoryType="chevron"
 *   onPress={() => navigation.navigate('Profile')}
 * />
 * ```
 */
export default function SettingsItem({
  icon,
  iconBackgroundColor,
  iconColor,
  title,
  subtitle,
  accessoryType = 'chevron',
  value,
  switchValue,
  onSwitchChange,
  onPress,
  disabled = false,
  destructive = false,
  showSeparator = true,
  style,
  testID,
}: SettingsItemProps) {
  const textColor = useThemeColor({ light: Colors.light.text, dark: Colors.dark.text }, 'text');
  const textSecondaryColor = useThemeColor(
    { light: Colors.light.textSecondary, dark: Colors.dark.textSecondary },
    'text'
  );
  const textMutedColor = useThemeColor(
    { light: Colors.light.textMuted, dark: Colors.dark.textMuted },
    'text'
  );
  const tintColor = useThemeColor({ light: Colors.light.tint, dark: Colors.dark.tint }, 'tint');
  const destructiveColor = useThemeColor(
    { light: Colors.light.destructive, dark: Colors.dark.destructive },
    'text'
  );
  const separatorColor = useThemeColor(
    { light: Colors.light.separator, dark: Colors.dark.separator },
    'background'
  );

  // Determine title color based on destructive prop
  const titleColor = destructive ? destructiveColor : textColor;
  const finalIconBgColor = iconBackgroundColor || tintColor;
  const finalIconColor = iconColor || '#FFFFFF';

  /**
   * Handle press with haptic feedback
   */
  const handlePress = async () => {
    if (disabled || !onPress) return;

    // Provide haptic feedback
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Haptics may not be available on all devices
    }

    onPress();
  };

  /**
   * Handle switch toggle with haptic feedback
   */
  const handleSwitchChange = async (newValue: boolean) => {
    if (!onSwitchChange) return;

    // Provide haptic feedback
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Haptics may not be available on all devices
    }

    onSwitchChange(newValue);
  };

  /**
   * Render the right accessory based on type
   */
  const renderAccessory = () => {
    switch (accessoryType) {
      case 'chevron':
        return (
          <IconSymbol
            name="chevron.right"
            size={16}
            color={textMutedColor}
            style={styles.chevronIcon}
          />
        );
      case 'switch':
        return (
          <Switch
            value={switchValue}
            onValueChange={handleSwitchChange}
            disabled={disabled}
            trackColor={{ false: textMutedColor, true: tintColor }}
            thumbColor="#FFFFFF"
            accessibilityLabel={`Toggle ${title}`}
          />
        );
      case 'value':
        return (
          <View style={styles.valueContainer}>
            <ThemedText style={[styles.valueText, { color: textSecondaryColor }]}>
              {value}
            </ThemedText>
            <IconSymbol
              name="chevron.right"
              size={16}
              color={textMutedColor}
              style={styles.chevronIcon}
            />
          </View>
        );
      case 'loading':
        return <ActivityIndicator size="small" color={tintColor} />;
      case 'none':
      default:
        return null;
    }
  };

  const content = (
    <View
      style={[
        styles.container,
        showSeparator && {
          borderBottomColor: separatorColor,
          borderBottomWidth: StyleSheet.hairlineWidth,
        },
        disabled && styles.disabled,
        style,
      ]}
    >
      {/* Left Icon */}
      {icon && (
        <View
          style={[
            styles.iconContainer,
            { backgroundColor: destructive ? destructiveColor : finalIconBgColor },
          ]}
        >
          <IconSymbol name={icon} size={18} color={finalIconColor} />
        </View>
      )}

      {/* Title and Subtitle */}
      <View style={styles.textContainer}>
        <ThemedText
          style={[styles.title, { color: titleColor }, disabled && styles.disabledText]}
          numberOfLines={1}
        >
          {title}
        </ThemedText>
        {subtitle && (
          <ThemedText style={[styles.subtitle, { color: textSecondaryColor }]} numberOfLines={2}>
            {subtitle}
          </ThemedText>
        )}
      </View>

      {/* Right Accessory */}
      <View style={styles.accessoryContainer}>{renderAccessory()}</View>
    </View>
  );

  // If there's an onPress handler and not a switch, wrap in TouchableOpacity
  if (onPress && accessoryType !== 'switch') {
    return (
      <TouchableOpacity
        onPress={handlePress}
        disabled={disabled}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityHint={subtitle}
        accessibilityState={{ disabled }}
        testID={testID}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return <View testID={testID}>{content}</View>;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.m,
    minHeight: 44, // iOS HIG minimum touch target
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '400',
  },
  subtitle: {
    fontSize: 14,
    marginTop: 2,
  },
  accessoryContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: spacing.s,
  },
  valueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  valueText: {
    fontSize: 17,
    marginRight: spacing.xs,
  },
  chevronIcon: {
    opacity: 0.4,
  },
  disabled: {
    opacity: 0.5,
  },
  disabledText: {
    opacity: 0.7,
  },
});
