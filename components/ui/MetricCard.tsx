import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '@/constants/Colors';
import { Scanlines } from './Scanlines';

const PROGRESS_GOAL = 200;

type MetricCardProps = {
  readonly tastedCount: number;
  readonly colors: typeof Colors.dark;
};

export function MetricCard({ tastedCount, colors }: MetricCardProps) {
  const progress = Math.min(tastedCount / PROGRESS_GOAL, 1);
  const percentage = (progress * 100).toFixed(1);

  return (
    <LinearGradient
      colors={['#D4D8DD', '#8A919A', '#6B727B'] as const}
      style={[styles.metricPanel, { borderColor: '#FFFFFF30' }]}
    >
      <View
        style={[
          styles.metricCard,
          { backgroundColor: colors.backgroundSecondary, borderColor: colors.border },
        ]}
      >
        <View
          style={[
            styles.labelPlate,
            { backgroundColor: colors.tint, borderColor: colors.accentMuted },
          ]}
        >
          <Text style={[styles.labelPlateText, { color: colors.backgroundSecondary }]}>
            BEERS TASTED
          </Text>
        </View>
        <View style={styles.metricRow}>
          {/* Ghost segments */}
          <Text style={[styles.metricGhost, { color: colors.tint, opacity: 0.12 }]}>888</Text>
          <Text style={[styles.metricNumber, { color: colors.tint }]}>{tastedCount}</Text>
          <View style={styles.metricTotalWrap}>
            <Text style={[styles.metricTotalGhost, { color: colors.tint, opacity: 0.12 }]}>
              /888
            </Text>
            <Text style={[styles.metricTotal, { color: colors.tint, opacity: 0.4 }]}>/200</Text>
          </View>
        </View>
        <View style={[styles.progressTrack, { backgroundColor: colors.progressTrack }]}>
          <View
            testID="metric-progress-fill"
            style={[
              styles.progressFill,
              { backgroundColor: colors.tint, width: `${progress * 100}%` },
            ]}
          />
        </View>
        <Text style={[styles.progressLabel, { color: colors.textMuted }]}>
          {percentage}% UFO CLUB PROGRESS
        </Text>
        <Scanlines />
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  metricPanel: { borderWidth: 1, borderRadius: 16, padding: 3, overflow: 'hidden' },
  metricCard: { borderRadius: 13, padding: 20, gap: 10, borderWidth: 1 },
  labelPlate: {
    borderRadius: 4,
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.4,
    shadowRadius: 2,
    elevation: 3,
  },
  labelPlateText: {
    fontFamily: 'SpaceGrotesk-Bold',
    fontSize: 9,
    letterSpacing: 2,
  },
  metricRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, position: 'relative' },
  metricGhost: {
    fontFamily: 'DSEG7Classic-Bold',
    fontSize: 64,
    lineHeight: 64,
    position: 'absolute',
    left: 0,
    bottom: 0,
  },
  metricNumber: { fontFamily: 'DSEG7Classic-Bold', fontSize: 64, lineHeight: 64 },
  metricTotalWrap: { position: 'relative', marginBottom: 4 },
  metricTotalGhost: { fontFamily: 'DSEG7Classic-Bold', fontSize: 22 },
  metricTotal: {
    fontFamily: 'DSEG7Classic-Bold',
    fontSize: 22,
    position: 'absolute',
    left: 0,
    top: 0,
  },
  progressTrack: { height: 6, width: '100%', borderRadius: 3 },
  progressFill: { height: '100%', borderRadius: 3 },
  progressLabel: { fontFamily: 'SpaceMono', fontSize: 9, letterSpacing: 1 },
});
