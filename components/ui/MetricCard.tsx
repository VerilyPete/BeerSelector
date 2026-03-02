import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { Colors } from '@/constants/Colors';

const PROGRESS_GOAL = 200;

type MetricCardProps = {
  readonly tastedCount: number;
  readonly colors: typeof Colors.dark;
};

export function MetricCard({ tastedCount, colors }: MetricCardProps) {
  const progress = Math.min(tastedCount / PROGRESS_GOAL, 1);
  const percentage = (progress * 100).toFixed(1);

  return (
    <View style={[styles.metricPanel, { backgroundColor: colors.steelBezel, borderColor: colors.steelBezelBorder }]}>
      <View style={[styles.metricCard, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
        <View style={[styles.labelPlate, { backgroundColor: colors.steelLabelPlate, borderColor: colors.steelLabelBorder }]}>
          <Text style={[styles.labelPlateText, { color: colors.border }]}>BEERS TASTED</Text>
        </View>
        <View style={styles.metricRow}>
          {/* Ghost segments */}
          <Text style={[styles.metricGhost, { color: colors.tint, opacity: 0.05 }]}>888</Text>
          <Text style={[styles.metricNumber, { color: colors.tint }]}>{tastedCount}</Text>
          <Text style={[styles.metricTotal, { color: colors.textMuted }]}>/200</Text>
        </View>
        <View style={[styles.progressTrack, { backgroundColor: colors.progressTrack }]}>
          <View
            testID="metric-progress-fill"
            style={[styles.progressFill, { backgroundColor: colors.tint, width: `${progress * 100}%` }]}
          />
        </View>
        <Text style={[styles.progressLabel, { color: colors.textMuted }]}>
          {percentage}% UFO CLUB PROGRESS
        </Text>
      </View>
    </View>
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
  metricGhost: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 64, letterSpacing: -4, lineHeight: 64, position: 'absolute', left: 0, bottom: 0 },
  metricNumber: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 64, letterSpacing: -4, lineHeight: 64 },
  metricTotal: { fontFamily: 'SpaceMono', fontSize: 22, marginBottom: 4 },
  progressTrack: { height: 6, width: '100%', borderRadius: 3 },
  progressFill: { height: '100%', borderRadius: 3 },
  progressLabel: { fontFamily: 'SpaceMono', fontSize: 9, letterSpacing: 1 },
});
