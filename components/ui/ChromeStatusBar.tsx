import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/Colors';

export const ChromeStatusBar: React.FC = () => {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme() ?? 'dark';
  const colors = Colors[colorScheme];

  return (
    <View
      style={{
        height: insets.top + 6,
        backgroundColor: colors.chromeBar,
        borderBottomWidth: 1,
        borderBottomColor: colors.chromeBarBorder,
      }}
    />
  );
};
