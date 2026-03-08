import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';

type ChromeIconWellProps = {
  readonly size?: number;
  readonly iconSize?: number;
  readonly borderRadius?: number;
  readonly borderColor?: string;
  readonly renderIcon: (props: { color: string; size: number }) => React.ReactNode;
};

export function ChromeIconWell({
  size = 40,
  iconSize = 20,
  borderRadius = 10,
  borderColor,
  renderIcon,
}: ChromeIconWellProps) {
  const colorScheme = useColorScheme() ?? 'dark';
  const colors = Colors[colorScheme];
  const resolvedBorderColor = borderColor ?? colors.tint;
  const centerOffset = (size - iconSize) / 2;

  return (
    <View
      style={[
        styles.well,
        { width: size, height: size, borderRadius, borderColor: resolvedBorderColor },
      ]}
    >
      <LinearGradient
        colors={['#B8BFC7', '#8A919A', '#6B727B'] as const}
        style={StyleSheet.absoluteFill}
      />
      {/* Highlight layer — 1px below center */}
      <View style={[styles.iconLayer, { top: centerOffset + 1, left: centerOffset }]}>
        {renderIcon({ color: '#FFFFFF40', size: iconSize })}
      </View>
      {/* Etch layer — 1px above center */}
      <View style={[styles.iconLayer, { top: centerOffset - 1, left: centerOffset }]}>
        {renderIcon({ color: '#0A0A0A', size: iconSize })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  well: {
    borderWidth: 1,
    overflow: 'hidden',
  },
  iconLayer: {
    position: 'absolute',
  },
});
