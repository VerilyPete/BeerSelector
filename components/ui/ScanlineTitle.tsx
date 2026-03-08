import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Scanlines } from './Scanlines';

type ScanlineTitleProps = {
  readonly title: string;
};

export function ScanlineTitle({ title }: ScanlineTitleProps) {
  const colorScheme = useColorScheme() ?? 'dark';
  const colors = Colors[colorScheme];

  return (
    <View style={[styles.wrap, { backgroundColor: colors.tint }]}>
      <Text style={[styles.title, { color: colors.background }]}>{title}</Text>
      <Scanlines />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'flex-start',
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  title: {
    fontFamily: 'SpaceGrotesk-Bold',
    fontSize: 26,
    letterSpacing: -0.5,
  },
});
