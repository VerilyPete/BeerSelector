import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  View,
  ViewStyle,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/Colors';

type ActionButtonProps = {
  readonly label: string;
  readonly onPress: () => void;
  readonly loading?: boolean;
  readonly disabled?: boolean;
  readonly style?: ViewStyle;
};

export const ActionButton = ({
  label,
  onPress,
  loading = false,
  disabled = false,
  style,
}: ActionButtonProps) => {
  const colorScheme = useColorScheme() ?? 'dark';
  const colors = Colors[colorScheme];

  const gradientColors =
    colorScheme === 'dark'
      ? (['#FFD54F', '#FFB300', '#E6A200'] as const)
      : (['#E6A200', '#CC8F00', '#B37D00'] as const);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      disabled={disabled || loading}
      style={[styles.touchable, style]}
    >
      {/* Layer 1: Shell with shadow/glow */}
      <View
        style={[
          styles.shell,
          {
            ...Platform.select({
              ios: {
                shadowColor: '#FFB300',
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.5,
                shadowRadius: 12,
              },
              android: {
                elevation: 6,
              },
            }),
          },
        ]}
      >
        {/* Layer 2: Amber gradient — fills the entire button */}
        <LinearGradient
          colors={[...gradientColors]}
          locations={[0, 0.3, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.gradientFill}
        />

        {/* Layer 3: Tiny dark well — just barely wraps the text */}
        <View
          style={[
            styles.darkWell,
            {
              backgroundColor: colors.amberWell,
              borderColor: colors.amberBorderInner,
            },
          ]}
        >
          {/* Layer 4: Label */}
          {loading ? (
            <ActivityIndicator size="small" color={colors.amber} />
          ) : (
            <Text style={[styles.label, { color: colors.amber }]}>
              {label}
            </Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  touchable: {
    flex: 1,
  },
  shell: {
    borderRadius: 10,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  gradientFill: {
    ...StyleSheet.absoluteFillObject,
  },
  darkWell: {
    borderRadius: 4,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: 'SpaceGrotesk-Bold',
    fontSize: 11,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
});
