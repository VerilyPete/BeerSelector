import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
  ActivityIndicator,
  Switch,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { SymbolViewProps } from 'expo-symbols';
import { IconSymbol } from '@/components/ui/IconSymbol';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/Colors';

type AccessoryType =
  | 'chevron'
  | 'switch'
  | 'value'
  | 'loading'
  | 'none';

type SettingsItemProps = {
  icon?: SymbolViewProps['name'];
  iconBackgroundColor?: string;
  iconColor?: string;
  title: string;
  subtitle?: string;
  accessoryType?: AccessoryType;
  value?: string;
  switchValue?: boolean;
  onSwitchChange?: (value: boolean) => void;
  onPress?: () => void;
  disabled?: boolean;
  destructive?: boolean;
  showSeparator?: boolean;
  style?: ViewStyle;
  testID?: string;
};

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
  const colorScheme = useColorScheme() ?? 'dark';
  const colors = Colors[colorScheme];

  const titleColor = destructive ? colors.destructive : colors.text;
  const finalIconColor = iconColor || colors.text;

  const handlePress = async () => {
    if (disabled || !onPress) return;
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Haptics may not be available
    }
    onPress();
  };

  const handleSwitchChange = async (newValue: boolean) => {
    if (!onSwitchChange) return;
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Haptics may not be available
    }
    onSwitchChange(newValue);
  };

  const renderAccessory = () => {
    switch (accessoryType) {
      case 'chevron':
        return (
          <IconSymbol
            name="chevron.right"
            size={14}
            color={colors.textSecondary}
            style={styles.chevronIcon}
          />
        );
      case 'switch':
        return (
          <Switch
            value={switchValue}
            onValueChange={handleSwitchChange}
            disabled={disabled}
            trackColor={{ false: colors.border, true: colors.tint }}
            thumbColor="#FFFFFF"
            accessibilityLabel={`Toggle ${title}`}
          />
        );
      case 'value':
        return (
          <View style={styles.valueContainer}>
            <Text style={[styles.valueText, { color: colors.textSecondary }]}>
              {value}
            </Text>
            <IconSymbol
              name="chevron.right"
              size={14}
              color={colors.textSecondary}
              style={styles.chevronIcon}
            />
          </View>
        );
      case 'loading':
        return <ActivityIndicator size="small" color={colors.tint} />;
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
          borderBottomColor: colors.separator,
          borderBottomWidth: 1,
        },
        disabled && styles.disabled,
        style,
      ]}
    >
      {icon && (
        <View style={styles.iconContainer}>
          <IconSymbol
            name={icon}
            size={18}
            color={destructive ? colors.destructive : finalIconColor}
          />
        </View>
      )}

      <View style={styles.textContainer}>
        <Text
          style={[styles.title, { color: titleColor }, disabled && styles.disabledText]}
          numberOfLines={1}
        >
          {title}
        </Text>
        {subtitle && (
          <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={2}>
            {subtitle}
          </Text>
        )}
      </View>

      <View style={styles.accessoryContainer}>{renderAccessory()}</View>
    </View>
  );

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
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 44,
  },
  iconContainer: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontFamily: 'SpaceGrotesk-Regular',
    fontSize: 15,
    fontWeight: '500',
  },
  subtitle: {
    fontFamily: 'SpaceMono',
    fontSize: 11,
    marginTop: 2,
  },
  accessoryContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  valueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  valueText: {
    fontFamily: 'SpaceMono',
    fontSize: 11,
    marginRight: 4,
  },
  chevronIcon: {
    opacity: 0.6,
  },
  disabled: {
    opacity: 0.5,
  },
  disabledText: {
    opacity: 0.7,
  },
});
