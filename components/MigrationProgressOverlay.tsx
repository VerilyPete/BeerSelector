import React from 'react';
import { View, ActivityIndicator, StyleSheet, useColorScheme } from 'react-native';
import { ThemedText } from './ThemedText';
import { ThemedView } from './ThemedView';

type MigrationProgressOverlayProps = {
  progress: number; // 0-100
};

export function MigrationProgressOverlay({ progress }: MigrationProgressOverlayProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  // Theme-aware colors
  const spinnerColor = isDark ? '#0A84FF' : '#007AFF'; // iOS blue, brighter in dark mode
  const progressBarColor = isDark ? '#0A84FF' : '#007AFF';
  const progressBarBackgroundColor = isDark
    ? 'rgba(10, 132, 255, 0.2)' // Brighter background in dark mode
    : 'rgba(0, 122, 255, 0.2)';

  return (
    <ThemedView style={styles.overlay}>
      <View style={styles.content}>
        <ActivityIndicator size="large" color={spinnerColor} />
        <ThemedText style={styles.title}>Updating Database</ThemedText>
        <ThemedText style={styles.subtitle}>
          Processing beer data: {Math.round(progress)}%
        </ThemedText>
        <View
          style={[
            styles.progressBarContainer,
            { backgroundColor: progressBarBackgroundColor },
          ]}
        >
          <View
            style={[
              styles.progressBar,
              { width: `${progress}%`, backgroundColor: progressBarColor },
            ]}
          />
        </View>
      </View>
    </ThemedView>
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
    borderRadius: 16,
    alignItems: 'center',
    minWidth: 280,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  subtitle: {
    fontSize: 14,
    marginTop: 8,
    opacity: 0.7,
  },
  progressBarContainer: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    marginTop: 16,
    overflow: 'hidden',
    // backgroundColor is set dynamically based on theme
  },
  progressBar: {
    height: '100%',
    borderRadius: 2,
    // backgroundColor is set dynamically based on theme
  },
});
