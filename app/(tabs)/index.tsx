import { StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Haptics from 'expo-haptics';
import Animated from 'react-native-reanimated';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useHomeScreenState, HomeScreenView } from '@/hooks/useHomeScreenState';
import { Colors } from '@/constants/Colors';
import { spacing, borderRadii } from '@/constants/spacing';
import { getShadow } from '@/constants/shadows';
import { useAnimatedPress } from '@/animations';

/**
 * Navigation card data structure
 */
type NavigationCardProps = {
  title: string;
  description: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
} & (
  | { iconFamily: 'ionicons'; iconName: React.ComponentProps<typeof Ionicons>['name'] }
  | {
      iconFamily: 'material-community';
      iconName: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
    }
);

/**
 * Navigation Card Component
 * Renders an elevated card with icon, title, and description
 * Includes animated press feedback for a polished feel
 */
function NavigationCard({
  title,
  description,
  iconName,
  iconFamily,
  onPress,
  disabled = false,
  testID,
}: NavigationCardProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const isDark = colorScheme === 'dark';
  const colors = Colors[colorScheme];
  const borderColor = useThemeColor({}, 'border');

  // Animation hooks
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
      style={styles.cardTouchable}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={description}
      accessibilityState={{ disabled }}
    >
      <Animated.View style={pressStyle}>
        <ThemedView
          variant="elevated"
          style={[
            styles.navigationCard,
            getShadow('md', isDark),
            { borderColor },
            disabled && styles.cardDisabled,
          ]}
        >
          <ThemedView
            variant="elevated"
            style={[styles.iconContainer, { backgroundColor: colors.tint }]}
          >
            {iconFamily === 'ionicons' ? (
              <Ionicons name={iconName} size={28} color={colors.textOnPrimary} />
            ) : (
              <MaterialCommunityIcons name={iconName} size={28} color={colors.textOnPrimary} />
            )}
          </ThemedView>
          <ThemedView variant="elevated" style={styles.cardContent}>
            <ThemedText type="defaultSemiBold" style={styles.cardTitle}>
              {title}
            </ThemedText>
            <ThemedText type="muted" style={styles.cardDescription}>
              {description}
            </ThemedText>
          </ThemedView>
          <Ionicons
            name="chevron-forward"
            size={24}
            color={colors.textMuted}
            style={styles.chevron}
          />
        </ThemedView>
      </Animated.View>
    </TouchableOpacity>
  );
}

/**
 * Welcome Card Component
 * Shows personalized greeting for members or visitor welcome message
 */
function WelcomeCard({
  memberName,
  storeName,
  isVisitor,
}: {
  memberName?: string;
  storeName?: string;
  isVisitor: boolean;
}) {
  const colorScheme = useColorScheme() ?? 'light';
  const isDark = colorScheme === 'dark';
  const colors = Colors[colorScheme];
  const borderColor = useThemeColor({}, 'border');

  return (
    <ThemedView
      variant="elevated"
      style={[styles.welcomeCard, getShadow('md', isDark), { borderColor }]}
    >
      <ThemedView variant="elevated" style={styles.welcomeHeader}>
        <ThemedView
          variant="elevated"
          style={[
            styles.welcomeIconContainer,
            { backgroundColor: isVisitor ? colors.visitorBadge : colors.tint },
          ]}
        >
          <Ionicons
            name={isVisitor ? 'person-outline' : 'beer-outline'}
            size={32}
            color={isVisitor ? '#000000' : colors.textOnPrimary}
          />
        </ThemedView>
        <ThemedView variant="elevated" style={styles.welcomeTextContainer}>
          <ThemedText type="muted" style={styles.welcomeLabel}>
            {isVisitor ? 'Guest Mode' : 'Welcome back'}
          </ThemedText>
          <ThemedText type="subtitle" style={styles.welcomeName}>
            {isVisitor ? 'Visitor' : memberName || 'Beer Enthusiast'}
          </ThemedText>
          {!isVisitor && storeName && (
            <ThemedText type="muted" style={styles.storeName}>
              {storeName}
            </ThemedText>
          )}
        </ThemedView>
      </ThemedView>
      {isVisitor && (
        <ThemedView variant="elevated" style={styles.visitorNote}>
          <ThemedText type="muted" style={styles.visitorNoteText}>
            Log in with your UFO Club account to access all features including Beerfinder, Tasted
            Brews, and Rewards.
          </ThemedText>
        </ThemedView>
      )}
    </ThemedView>
  );
}

/**
 * Settings Button Component
 * Fixed position button in the top right corner
 * Includes animated press feedback
 * Uses safe area insets to position below status bar
 */
function SettingsButton({ onPress, topInset }: { onPress: () => void; topInset: number }) {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  // Animation hooks
  const { animatedStyle: pressStyle, onPressIn, onPressOut } = useAnimatedPress();

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <TouchableOpacity
      testID="settings-nav-button"
      style={[styles.settingsButton, { top: topInset + spacing.sm }]}
      onPress={handlePress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      activeOpacity={1}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      accessibilityRole="button"
      accessibilityLabel="Open settings"
    >
      <Animated.View
        style={[
          styles.settingsButtonInner,
          { backgroundColor: colors.backgroundTertiary },
          pressStyle,
        ]}
      >
        <Ionicons name="settings-outline" size={24} color={colors.icon} />
      </Animated.View>
    </TouchableOpacity>
  );
}

/**
 * Loading View Component
 */
function LoadingView() {
  const tintColor = useThemeColor({}, 'tint');

  return (
    <ThemedView style={styles.centeredContainer}>
      <ActivityIndicator size="large" color={tintColor} />
    </ThemedView>
  );
}

/**
 * Setup View Component
 * Shown when API URLs are not configured
 * Includes animated press feedback on the login button
 */
function SetupView({ onLoginPress }: { onLoginPress: () => void }) {
  const colorScheme = useColorScheme() ?? 'light';
  const isDark = colorScheme === 'dark';
  const colors = Colors[colorScheme];

  // Animation hooks
  const { animatedStyle: pressStyle, onPressIn, onPressOut } = useAnimatedPress();

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onLoginPress();
  };

  return (
    <ThemedView style={styles.centeredContainer}>
      <ThemedView variant="elevated" style={[styles.setupCard, getShadow('lg', isDark)]}>
        <ThemedView
          variant="elevated"
          style={[styles.setupIconContainer, { backgroundColor: colors.tint }]}
        >
          <Ionicons name="beer" size={48} color={colors.textOnPrimary} />
        </ThemedView>
        <ThemedText type="title" style={styles.setupTitle}>
          Welcome to Beer Selector
        </ThemedText>
        <ThemedText type="secondary" style={styles.setupDescription}>
          Log in to your UFO Club account or continue as a visitor to explore the taplist.
        </ThemedText>
        <TouchableOpacity
          onPress={handlePress}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          activeOpacity={1}
        >
          <Animated.View style={[styles.loginButton, { backgroundColor: colors.tint }, pressStyle]}>
            <ThemedText style={[styles.loginButtonText, { color: colors.textOnPrimary }]}>
              Get Started
            </ThemedText>
          </Animated.View>
        </TouchableOpacity>
      </ThemedView>
    </ThemedView>
  );
}

/**
 * Main Home Screen View
 * Renders navigation cards based on user mode (visitor/member)
 */
function MainHomeView({
  view,
  memberName,
  storeName,
  actions,
}: {
  view: HomeScreenView;
  memberName?: string;
  storeName?: string;
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

  return (
    <ThemedView style={styles.container}>
      <SettingsButton onPress={actions.navigateToSettings} topInset={insets.top} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + spacing.xxl + spacing.m },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Welcome Card */}
        <WelcomeCard memberName={memberName} storeName={storeName} isVisitor={isVisitor} />

        {/* Navigation Section Title */}
        <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
          Explore
        </ThemedText>

        {/* All Beers Card - Always visible */}
        <NavigationCard
          testID="nav-all-beers"
          title="All Beers"
          description="Browse the complete taplist at your location"
          iconName="beer-outline"
          iconFamily="ionicons"
          onPress={actions.navigateToAllBeers}
        />

        {/* Beerfinder Card - Member only */}
        <NavigationCard
          testID="nav-beerfinder"
          title="Beerfinder"
          description={
            isVisitor
              ? "Log in to find beers you haven't tasted"
              : "Find beers you haven't tasted yet"
          }
          iconName="glass-mug-variant"
          iconFamily="material-community"
          onPress={actions.navigateToBeerfinder}
          disabled={isVisitor}
        />

        {/* Tasted Brews Card - Member only */}
        <NavigationCard
          testID="nav-tasted-brews"
          title="Tasted Brews"
          description={
            isVisitor
              ? 'Log in to track your tasting history'
              : 'View your tasting history and progress'
          }
          iconName="checkmark-done-circle-outline"
          iconFamily="ionicons"
          onPress={actions.navigateToTastedBrews}
          disabled={isVisitor}
        />

        {/* Rewards Card - Member only */}
        <NavigationCard
          testID="nav-rewards"
          title="Rewards"
          description={
            isVisitor
              ? 'Log in to view your UFO Club rewards'
              : 'View and redeem your UFO Club rewards'
          }
          iconName="gift-outline"
          iconFamily="ionicons"
          onPress={actions.navigateToRewards}
          disabled={isVisitor}
        />

        {/* Bottom spacing */}
        <ThemedView style={styles.bottomSpacer} />
      </ScrollView>
    </ThemedView>
  );
}

/**
 * Home Screen Component
 * Main entry point that uses useHomeScreenState hook for state management
 */
export default function HomeScreen() {
  const { view, userData, actions } = useHomeScreenState();

  // Handle different view states
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
          actions={actions}
        />
      );

    default:
      return <LoadingView />;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.m,
    // paddingTop is set dynamically using safe area insets
    paddingBottom: spacing.xl,
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.l,
  },

  // Settings Button
  settingsButton: {
    position: 'absolute',
    // top is set dynamically using safe area insets
    right: spacing.m,
    zIndex: 10,
  },
  settingsButtonInner: {
    width: 44,
    height: 44,
    borderRadius: borderRadii.full,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Welcome Card
  welcomeCard: {
    borderRadius: borderRadii.l,
    borderWidth: 1,
    padding: spacing.m,
    marginBottom: spacing.l,
  },
  welcomeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  welcomeIconContainer: {
    width: 64,
    height: 64,
    borderRadius: borderRadii.l,
    justifyContent: 'center',
    alignItems: 'center',
  },
  welcomeTextContainer: {
    flex: 1,
    marginLeft: spacing.m,
  },
  welcomeLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  welcomeName: {
    marginTop: spacing.xs,
  },
  storeName: {
    marginTop: spacing.xs,
    fontSize: 14,
  },
  visitorNote: {
    marginTop: spacing.m,
    paddingTop: spacing.m,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(128, 128, 128, 0.3)',
  },
  visitorNoteText: {
    fontSize: 13,
    lineHeight: 18,
  },

  // Section Title
  sectionTitle: {
    fontSize: 18,
    marginBottom: spacing.sm,
    marginTop: spacing.s,
  },

  // Navigation Cards
  cardTouchable: {
    marginBottom: spacing.sm,
  },
  navigationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadii.l,
    borderWidth: 1,
    padding: spacing.m,
    minHeight: 80, // Ensures adequate touch target
  },
  cardDisabled: {
    opacity: 0.5,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: borderRadii.m,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardContent: {
    flex: 1,
    marginLeft: spacing.m,
    marginRight: spacing.s,
  },
  cardTitle: {
    fontSize: 17,
    marginBottom: spacing.xs,
  },
  cardDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  chevron: {
    marginLeft: 'auto',
  },

  // Setup View
  setupCard: {
    borderRadius: borderRadii.xl,
    padding: spacing.xl,
    alignItems: 'center',
    maxWidth: 340,
    width: '100%',
  },
  setupIconContainer: {
    width: 88,
    height: 88,
    borderRadius: borderRadii.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.l,
  },
  setupTitle: {
    fontSize: 28,
    textAlign: 'center',
    marginBottom: spacing.m,
  },
  setupDescription: {
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.l,
  },
  loginButton: {
    paddingVertical: spacing.m,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadii.xl,
    minWidth: 180,
    alignItems: 'center',
  },
  loginButtonText: {
    fontSize: 17,
    fontWeight: '600',
  },

  // Bottom Spacer
  bottomSpacer: {
    height: spacing.xl,
  },
});
