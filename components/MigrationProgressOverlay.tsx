import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { ThemedText } from './ThemedText';
import { ThemedView } from './ThemedView';

type MigrationProgressOverlayProps = {
  progress: number; // 0-100
};

export function MigrationProgressOverlay({ progress }: MigrationProgressOverlayProps) {
  return (
    <ThemedView style={styles.overlay}>
      <View style={styles.content}>
        <ActivityIndicator size="large" color="#007AFF" />
        <ThemedText style={styles.title}>Updating Database</ThemedText>
        <ThemedText style={styles.subtitle}>
          Processing beer data: {Math.round(progress)}%
        </ThemedText>
        <View style={styles.progressBarContainer}>
          <View style={[styles.progressBar, { width: `${progress}%` }]} />
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
    backgroundColor: 'rgba(0, 122, 255, 0.2)',
    borderRadius: 2,
    marginTop: 16,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#007AFF',
    borderRadius: 2,
  },
});
