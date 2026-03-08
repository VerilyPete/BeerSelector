import React from 'react';
import { StyleSheet, View } from 'react-native';

const SCANLINE_COUNT = 50;
const scanlineIndices = Array.from({ length: SCANLINE_COUNT });

export function Scanlines() {
  return (
    <View style={styles.overlay} pointerEvents="none">
      {scanlineIndices.map((_, i) => (
        <View key={i} style={i % 2 === 0 ? styles.darkLine : styles.clearLine} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.15,
    flexDirection: 'column',
  },
  darkLine: {
    height: 2,
    backgroundColor: '#000000',
  },
  clearLine: {
    height: 2,
  },
});
