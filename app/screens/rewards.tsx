import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Rewards } from '@/components/Rewards';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/Colors';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export function RewardsScreen() {
  const colorScheme = useColorScheme() ?? 'dark';
  const colors = Colors[colorScheme];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'right', 'left']}>
        <View style={styles.headerRow}>
          <View style={[styles.bezelOuter, { backgroundColor: colors.steelBezel, borderColor: colors.steelBezelBorder }]}>
            <TouchableOpacity
              style={[styles.bezelInner, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}
              onPress={() => router.back()}
            >
              <Ionicons name="chevron-back" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>
          <Text style={[styles.title, { color: colors.text }]}>Rewards</Text>
          <View style={[styles.bezelOuter, { backgroundColor: colors.steelBezel, borderColor: colors.steelBezelBorder }]} />
        </View>
        <Rewards />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    marginTop: 8,
    marginBottom: 16,
  },
  title: {
    fontFamily: 'SpaceGrotesk-Bold',
    fontSize: 26,
    letterSpacing: -0.5,
  },
  bezelOuter: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 2,
  },
  bezelInner: {
    borderWidth: 1,
    borderRadius: 8,
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default RewardsScreen;
