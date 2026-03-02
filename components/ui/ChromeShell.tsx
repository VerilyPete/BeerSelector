import React from 'react';
import { View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CHROME_GRADIENT } from '@/constants/Colors';

type ChromeShellProps = {
  readonly children: React.ReactNode;
  readonly borderRadius?: number;
  readonly padding?: number;
  readonly style?: ViewStyle;
  readonly colors?: readonly [string, string, string];
  readonly testID?: string;
};

export const ChromeShell = ({
  children,
  borderRadius = 14,
  padding = 3,
  style,
  colors = CHROME_GRADIENT,
  testID,
}: ChromeShellProps) => (
  <View style={[{ borderRadius, padding, overflow: 'hidden' as const }, style]} testID={testID}>
    <LinearGradient
      colors={[...colors]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
    />
    {children}
  </View>
);
