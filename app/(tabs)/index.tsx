import { StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, View, Text } from 'react-native';
import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import Animated from 'react-native-reanimated';

import { IconSymbol } from '@/components/ui/IconSymbol';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useHomeScreenState, HomeScreenView } from '@/hooks/useHomeScreenState';
import { Colors } from '@/constants/Colors';
import { useAnimatedPress } from '@/animations';

const PROGRESS_GOAL = 200;

function NavigationCard({
  title,
  description,
  iconName,
  iconColor,
  onPress,
  disabled = false,
  testID,
}: {
  title: string;
  description: string;
  iconName: string;
  iconColor?: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  const colorScheme = useColorScheme() ?? 'dark';
  const colors = Colors[colorScheme];
  const { animatedStyle: pressStyle, onPressIn, onPressOut } = useAnimatedPress({ disabled });

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <TouchableOpacity
      testID={testID}
      onPress={handlePress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      activeOpacity={1}
      style={disabled ? { opacity: 0.5 } : undefined}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={description}
      accessibilityState={{ disabled }}
    >
      <Animated.View style={pressStyle}>
        {/* Steel bezel outer frame */}
        <View style={[styles.navCardBezel, { backgroundColor: colors.steelBezel, borderColor: colors.steelBezelBorder }]}>
          <View style={[styles.navCard, { borderColor: colors.border, backgroundColor: colors.backgroundSecondary }]}>
            <View style={[styles.navCardIcon, { backgroundColor: colors.backgroundSecondary, borderColor: colors.tint }]}>
              <Ionicons name={iconName as any} size={20} color={iconColor ?? colors.tint} />
            </View>
            <View style={styles.navCardText}>
              <Text style={[styles.navCardTitle, { color: colors.tint }]}>{title}</Text>
              <Text style={[styles.navCardDesc, { color: colors.textSecondary }]}>{description}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </View>
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
}

function MetricCard({ tastedCount, colors }: { tastedCount: number; colors: typeof Colors.dark }) {
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
        <View style={[styles.progressTrack, { backgroundColor: '#1A2A2A' }]}>
          <View style={[styles.progressFill, { backgroundColor: colors.tint, width: `${progress * 100}%` }]} />
        </View>
        <Text style={[styles.progressLabel, { color: colors.textMuted }]}>
          {percentage}% UFO CLUB PROGRESS
        </Text>
      </View>
    </View>
  );
}

function MainHomeView({
  view,
  memberName,
  storeName,
  tastedBeerCount,
  actions,
}: {
  view: HomeScreenView;
  memberName?: string;
  storeName?: string;
  tastedBeerCount: number;
  actions: {
    navigateToSettings: () => void;
    navigateToAllBeers: () => void;
    navigateToBeerfinder: () => void;
    navigateToTastedBrews: () => void;
    navigateToRewards: () => void;
  };
}) {
  const isVisitor = view === 'visitor';
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme() ?? 'dark';
  const colors = Colors[colorScheme];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.chromeBar, { height: insets.top + 6, backgroundColor: colors.chromeBar }]} />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header row with label plate + gear button */}
        <View style={styles.headerRow}>
          <View style={[styles.labelPlate, { backgroundColor: colors.steelLabelPlate, borderColor: colors.steelLabelBorder }]}>
            <Text style={[styles.labelPlateText, { color: colors.border }]}>
              {isVisitor ? 'GUEST MODE' : 'WELCOME BACK'}
            </Text>
          </View>
          <TouchableOpacity
            testID="settings-nav-button"
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              actions.navigateToSettings();
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Open settings"
          >
            <View style={[styles.gearBezel, { backgroundColor: colors.steelBezel, borderColor: colors.steelBezelBorder }]}>
              <View style={[styles.gearInner, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
                <Ionicons name="settings-outline" size={18} color={colors.textSecondary} />
              </View>
            </View>
          </TouchableOpacity>
        </View>
        <Text style={[styles.heroName, { color: colors.text }]}>
          {isVisitor ? 'Visitor' : (memberName || 'Beer Enthusiast').toUpperCase()}
        </Text>
        {!isVisitor && storeName && (
          <View style={styles.storeRow}>
            <Ionicons name="location-sharp" size={14} color={colors.tint} />
            <Text style={[styles.storeName, { color: colors.textSecondary }]}>
              Flying Saucer — {storeName}
            </Text>
          </View>
        )}

        {/* Metric card - members only */}
        {!isVisitor && (
          <View style={{ marginTop: 32 }}>
            <MetricCard tastedCount={tastedBeerCount} colors={colors} />
          </View>
        )}

        {/* Navigation section */}
        <View style={{ marginTop: 32 }}>
          <View style={[styles.labelPlate, { backgroundColor: colors.steelLabelPlate, borderColor: colors.steelLabelBorder, alignSelf: 'flex-start' }]}>
            <Text style={[styles.labelPlateText, { color: colors.border }]}>EXPLORE</Text>
          </View>
          <View style={{ marginTop: 12, gap: 10 }}>
            <NavigationCard
              testID="nav-all-beers"
              title="All Beers"
              description="Browse the complete taplist"
              iconName="beer-outline"
              onPress={actions.navigateToAllBeers}
            />
            <NavigationCard
              testID="nav-beerfinder"
              title="Beerfinder"
              description={isVisitor ? "Log in to find untasted beers" : "Find beers you haven't tasted"}
              iconName="search-outline"
              onPress={actions.navigateToBeerfinder}
              disabled={isVisitor}
            />
            <NavigationCard
              testID="nav-tasted-brews"
              title="Tasted Brews"
              description={isVisitor ? 'Log in to track your history' : 'View your tasting history'}
              iconName="checkmark-circle-outline"
              iconColor={colors.tint}
              onPress={actions.navigateToTastedBrews}
              disabled={isVisitor}
            />
            <NavigationCard
              testID="nav-rewards"
              title="Rewards"
              description={isVisitor ? 'Log in to view rewards' : 'View your UFO Club rewards'}
              iconName="gift-outline"
              onPress={actions.navigateToRewards}
              disabled={isVisitor}
            />
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

function LoadingView() {
  const colorScheme = useColorScheme() ?? 'dark';
  const colors = Colors[colorScheme];
  return (
    <View style={[styles.centered, { backgroundColor: colors.background }]}>
      <ActivityIndicator size="large" color={colors.tint} />
    </View>
  );
}

function SetupView({ onLoginPress }: { onLoginPress: () => void }) {
  const colorScheme = useColorScheme() ?? 'dark';
  const colors = Colors[colorScheme];
  const { animatedStyle: pressStyle, onPressIn, onPressOut } = useAnimatedPress();

  return (
    <View style={[styles.centered, { backgroundColor: colors.background }]}>
      <View style={[styles.setupCard, { borderColor: colors.border }]}>
        <Ionicons name="beer" size={48} color={colors.tint} style={{ marginBottom: 24 }} />
        <Text style={[styles.heroName, { color: colors.text, textAlign: 'center', marginBottom: 12 }]}>
          Beer Selector
        </Text>
        <Text style={[styles.storeName, { color: colors.textSecondary, textAlign: 'center', marginBottom: 24 }]}>
          Log in to your UFO Club account or browse as a visitor.
        </Text>
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onLoginPress();
          }}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          activeOpacity={1}
        >
          <Animated.View style={[styles.loginButton, { backgroundColor: colors.tint }, pressStyle]}>
            <Text style={[styles.loginButtonText, { color: colors.textOnPrimary }]}>Get Started</Text>
          </Animated.View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const { view, userData, actions } = useHomeScreenState();

  switch (view) {
    case 'loading':
      return <LoadingView />;
    case 'setup':
      return <SetupView onLoginPress={actions.navigateToSettings} />;
    case 'visitor':
    case 'member':
      return (
        <MainHomeView
          view={view}
          memberName={userData?.memberName}
          storeName={userData?.storeName}
          tastedBeerCount={userData?.tastedBeerCount ?? 0}
          actions={actions}
        />
      );
    default:
      return <LoadingView />;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  chromeBar: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.15)',
  },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 18, paddingBottom: 24, paddingTop: 8 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },

  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },

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
  gearBezel: {
    borderRadius: 10,
    padding: 2,
    borderWidth: 1,
  },
  gearInner: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },

  sectionLabel: {
    fontFamily: 'SpaceMono',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 3,
  },
  heroName: {
    fontFamily: 'SpaceGrotesk-Bold',
    fontSize: 26,
    letterSpacing: -0.5,
    marginTop: 8,
  },
  storeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  storeName: { fontFamily: 'SpaceMono', fontSize: 11 },

  metricPanel: { borderWidth: 1, borderRadius: 16, padding: 3, overflow: 'hidden' },
  metricCard: { borderRadius: 13, padding: 20, gap: 10, borderWidth: 1 },
  metricRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, position: 'relative' },
  metricGhost: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 64, letterSpacing: -4, lineHeight: 64, position: 'absolute', left: 0, bottom: 0 },
  metricNumber: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 64, letterSpacing: -4, lineHeight: 64 },
  metricTotal: { fontFamily: 'SpaceMono', fontSize: 22, marginBottom: 4 },
  progressTrack: { height: 6, width: '100%', borderRadius: 3 },
  progressFill: { height: '100%', borderRadius: 3 },
  progressLabel: { fontFamily: 'SpaceMono', fontSize: 9, letterSpacing: 1 },

  navCardBezel: {
    borderRadius: 14,
    padding: 3,
    borderWidth: 1,
  },
  navCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    gap: 14,
    borderWidth: 1,
    borderRadius: 11,
  },
  navCardIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  navCardText: { flex: 1, gap: 2 },
  navCardTitle: { fontFamily: 'SpaceGrotesk-SemiBold', fontSize: 14 },
  navCardDesc: { fontFamily: 'SpaceMono', fontSize: 11 },

  setupCard: { borderWidth: 1, borderRadius: 16, padding: 32, alignItems: 'center', maxWidth: 340, width: '100%' },
  loginButton: { paddingVertical: 14, paddingHorizontal: 32, alignItems: 'center', borderRadius: 8 },
  loginButtonText: { fontFamily: 'SpaceGrotesk-SemiBold', fontSize: 15, letterSpacing: 2 },
});
