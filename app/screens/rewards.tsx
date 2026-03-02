import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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
          <LinearGradient
            colors={['#D4D8DD', '#8A919A', '#6B727B'] as const}
            style={[styles.bezelOuter, { borderColor: '#FFFFFF30' }]}
          >
            <TouchableOpacity
              style={[
                styles.bezelInner,
                { backgroundColor: colors.backgroundSecondary, borderColor: colors.border },
              ]}
              onPress={() => router.back()}
            >
              <Ionicons name="chevron-back" size={22} color={colors.tint} />
            </TouchableOpacity>
          </LinearGradient>
          <Text style={[styles.title, { color: colors.text }]}>Rewards</Text>
          <View style={styles.bezelSpacer} />
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
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bezelSpacer: {
    width: 36,
    height: 36,
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
