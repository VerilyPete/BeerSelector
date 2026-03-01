import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/Colors';

type MigrationProgressOverlayProps = {
  progress: number;
};

export function MigrationProgressOverlay({ progress }: MigrationProgressOverlayProps) {
  const colorScheme = useColorScheme() ?? 'dark';
  const colors = Colors[colorScheme];

  return (
    <View style={[styles.overlay, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <ActivityIndicator size="large" color={colors.tint} />
        <Text style={[styles.title, { color: colors.text }]}>Updating Database</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Processing beer data: {Math.round(progress)}%
        </Text>
        <View
          style={[
            styles.progressBarContainer,
            { backgroundColor: colors.border },
          ]}
        >
          <View
            style={[
              styles.progressBar,
              { width: `${progress}%`, backgroundColor: colors.tint },
            ]}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  content: {
    padding: 32,
    alignItems: 'center',
    minWidth: 280,
  },
  title: {
    fontFamily: 'Inter',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  subtitle: {
    fontFamily: 'Space Mono',
    fontSize: 11,
    marginTop: 8,
  },
  progressBarContainer: {
    width: '100%',
    height: 4,
    marginTop: 16,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
  },
});
