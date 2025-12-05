import React, { useState, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  View,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Platform,
  useColorScheme,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withRepeat,
  withSequence,
  interpolate,
  FadeIn,
  FadeInDown,
  Layout,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { rewardsRepository } from '@/src/database/repositories/RewardsRepository';
import { fetchRewardsFromAPI } from '@/src/api/beerApi';
import { ThemedText } from './ThemedText';
import { ThemedView } from './ThemedView';
import { useThemeColor } from '@/hooks/useThemeColor';
import { getSessionData } from '@/src/api/sessionManager';
import Constants from 'expo-constants';
import { useAppContext } from '@/context/AppContext';
import { config } from '@/src/config';
import { Colors } from '@/constants/Colors';
import { spacing, borderRadii } from '@/constants/spacing';
import { getShadow } from '@/constants/shadows';

type Reward = {
  reward_id: string;
  redeemed: string;
  reward_type: string;
};

const BEER_GOAL = 200;

// Animated TouchableOpacity for rewards
const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

// Progress Ring Component
const ProgressRing = ({
  progress,
  size = 120,
  strokeWidth = 10,
}: {
  progress: number;
  size?: number;
  strokeWidth?: number;
}) => {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const colors = isDark ? Colors.dark : Colors.light;

  const animatedProgress = useSharedValue(0);
  const celebrationScale = useSharedValue(1);

  useEffect(() => {
    animatedProgress.value = withTiming(progress, {
      duration: 1200,
      easing: Easing.out(Easing.cubic),
    });

    // Celebration pulse when progress is high
    if (progress >= 0.9) {
      celebrationScale.value = withRepeat(
        withSequence(withTiming(1.05, { duration: 800 }), withTiming(1, { duration: 800 })),
        -1,
        true
      );
    }
  }, [progress]);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const animatedStyle = useAnimatedStyle(() => {
    const strokeDashoffset = circumference * (1 - animatedProgress.value);
    return {
      strokeDashoffset,
      transform: [{ scale: celebrationScale.value }],
    };
  });

  const progressPercent = Math.round(progress * 100);

  return (
    <View
      style={[styles.progressRingContainer, { width: size, height: size }]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: progressPercent }}
      accessibilityLabel={`Progress: ${progressPercent}% toward 200 beers`}
    >
      <Animated.View style={animatedStyle}>
        <View style={StyleSheet.absoluteFill}>
          {/* Background circle */}
          <View
            style={[
              styles.progressCircle,
              {
                width: size,
                height: size,
                borderRadius: size / 2,
                borderWidth: strokeWidth,
                borderColor: colors.border,
              },
            ]}
          />
          {/* Progress indicator using View-based approach */}
          <View
            style={[
              styles.progressCircle,
              {
                width: size,
                height: size,
                borderRadius: size / 2,
                borderWidth: strokeWidth,
                borderColor: colors.accent,
                borderTopColor: 'transparent',
                borderRightColor: 'transparent',
                transform: [{ rotate: `${progress * 360 - 90}deg` }],
              },
            ]}
          />
        </View>
      </Animated.View>
      <View style={styles.progressRingInner}>
        <ThemedText style={styles.progressPercentage}>{Math.round(progress * 100)}%</ThemedText>
        <ThemedText type="muted" style={styles.progressLabel}>
          Complete
        </ThemedText>
      </View>
    </View>
  );
};

// Badge Icon Component
const RewardBadge = ({
  isRedeemed,
  isAnimating,
}: {
  isRedeemed: boolean;
  isAnimating: boolean;
}) => {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const colors = isDark ? Colors.dark : Colors.light;

  const shimmerValue = useSharedValue(0);

  useEffect(() => {
    if (!isRedeemed && isAnimating) {
      shimmerValue.value = withRepeat(
        withSequence(withTiming(1, { duration: 1500 }), withTiming(0, { duration: 1500 })),
        -1,
        false
      );
    }
  }, [isRedeemed, isAnimating]);

  const shimmerStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(shimmerValue.value, [0, 0.5, 1], [0.8, 1, 0.8]),
    };
  });

  const iconName = isRedeemed ? 'checkmark-circle' : 'gift';
  const iconColor = isRedeemed ? colors.textMuted : colors.accent;
  const backgroundColor = isRedeemed ? colors.backgroundSecondary : colors.accentMuted;

  return (
    <Animated.View
      style={[styles.badgeContainer, { backgroundColor }, !isRedeemed && shimmerStyle]}
    >
      <Ionicons name={iconName} size={24} color={iconColor} />
    </Animated.View>
  );
};

// Status Badge Component
const StatusBadge = ({ isRedeemed }: { isRedeemed: boolean }) => {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const colors = isDark ? Colors.dark : Colors.light;

  return (
    <View
      style={[
        styles.statusBadge,
        {
          backgroundColor: isRedeemed ? colors.backgroundSecondary : colors.successBg,
        },
      ]}
    >
      <ThemedText
        style={[styles.statusText, { color: isRedeemed ? colors.textMuted : colors.textOnStatus }]}
      >
        {isRedeemed ? 'Redeemed' : 'Available'}
      </ThemedText>
    </View>
  );
};

// Empty State Component
const EmptyState = ({ isVisitor }: { isVisitor: boolean }) => {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const colors = isDark ? Colors.dark : Colors.light;

  const bounceValue = useSharedValue(0);

  useEffect(() => {
    bounceValue.value = withRepeat(
      withSequence(withSpring(-10, { damping: 8 }), withSpring(0, { damping: 8 })),
      -1,
      true
    );
  }, []);

  const bounceStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bounceValue.value }],
  }));

  return (
    <Animated.View entering={FadeIn.duration(500)} style={styles.emptyStateContainer}>
      <Animated.View style={bounceStyle}>
        <Ionicons
          name={isVisitor ? 'lock-closed' : 'beer-outline'}
          size={64}
          color={colors.accent}
        />
      </Animated.View>
      <ThemedText type="subtitle" style={styles.emptyStateTitle}>
        {isVisitor ? 'Members Only' : 'No Rewards Yet'}
      </ThemedText>
      <ThemedText type="secondary" style={styles.emptyStateMessage}>
        {isVisitor
          ? 'Rewards are exclusive to UFO Club members. Log in to view and claim your rewards!'
          : 'Keep tasting new beers to earn rewards! Your first reward awaits after just a few check-ins.'}
      </ThemedText>
    </Animated.View>
  );
};

// Progress Header Component
const ProgressHeader = ({ tastedCount }: { tastedCount: number }) => {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const colors = isDark ? Colors.dark : Colors.light;
  const { width: screenWidth } = useWindowDimensions();

  const progress = Math.min(tastedCount / BEER_GOAL, 1);
  const remaining = Math.max(BEER_GOAL - tastedCount, 0);

  // Responsive ring size: smaller on narrow screens, larger on wide screens but capped
  const ringSize = Math.min(Math.max(screenWidth * 0.2, 80), 120);

  return (
    <Animated.View
      entering={FadeInDown.duration(600).delay(100)}
      style={[
        styles.progressHeader,
        {
          backgroundColor: colors.backgroundElevated,
          borderColor: colors.border,
        },
        getShadow('md', isDark),
      ]}
    >
      <View style={styles.progressHeaderContent}>
        <View style={styles.progressTextContainer}>
          <ThemedText type="subtitle" style={styles.progressTitle}>
            Your Journey
          </ThemedText>
          <ThemedText type="secondary" style={styles.progressSubtitle}>
            {tastedCount} of {BEER_GOAL} beers tasted
          </ThemedText>
          {remaining > 0 ? (
            <ThemedText type="muted" style={styles.progressRemaining}>
              {remaining} more to go!
            </ThemedText>
          ) : (
            <ThemedText style={[styles.progressComplete, { color: colors.success }]}>
              Plate Complete!
            </ThemedText>
          )}
        </View>
        <ProgressRing progress={progress} size={ringSize} />
      </View>

      {/* Milestone markers */}
      <View style={styles.milestoneContainer}>
        {[50, 100, 150, 200].map(milestone => {
          const reached = tastedCount >= milestone;
          return (
            <View
              key={milestone}
              style={[
                styles.milestone,
                {
                  backgroundColor: reached ? colors.accent : colors.backgroundSecondary,
                  borderColor: reached ? colors.accent : colors.border,
                },
              ]}
            >
              <ThemedText
                style={[
                  styles.milestoneText,
                  { color: reached ? colors.textOnPrimary : colors.textMuted },
                ]}
              >
                {milestone}
              </ThemedText>
            </View>
          );
        })}
      </View>
    </Animated.View>
  );
};

export const Rewards = () => {
  const { session, beers, loading, errors, refreshBeerData } = useAppContext();

  const [refreshing, setRefreshing] = useState(false);
  const [queueingRewards, setQueueingRewards] = useState<Record<string, boolean>>({});

  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const colors = isDark ? Colors.dark : Colors.light;

  const textColor = useThemeColor({}, 'text');

  const handleRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      if (!session.isVisitor) {
        const freshRewards = await fetchRewardsFromAPI();
        await rewardsRepository.insertMany(freshRewards);
        await refreshBeerData();
        console.log('Rewards refreshed and AppContext synced');
      }
    } catch (error) {
      console.error('Error refreshing rewards:', error);
    } finally {
      setRefreshing(false);
    }
  }, [session.isVisitor, refreshBeerData]);

  const queueReward = async (rewardId: string, rewardType: string) => {
    try {
      setQueueingRewards(prev => ({ ...prev, [rewardId]: true }));
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const sessionData = await getSessionData();

      if (!sessionData) {
        Alert.alert('Error', 'You are not logged in. Please log in to queue rewards.');
        return;
      }

      const {
        memberId,
        storeId,
        storeName,
        sessionId,
        username,
        firstName,
        lastName,
        email,
        cardNum,
      } = sessionData;

      const userAgent =
        Platform.OS === 'web'
          ? window.navigator.userAgent
          : `BeerSelector/${Constants.expoConfig?.version || '1.0.0'} (${Platform.OS}; ${Platform.Version})`;

      const formData = `chitCode=${rewardId}&chitRewardType=${encodeURIComponent(rewardType)}&chitStoreName=${encodeURIComponent(storeName)}&chitUserId=${memberId}`;

      console.log('Sending form data:', formData);

      const headers = {
        accept: '*/*',
        'accept-language': 'en-US,en;q=0.9',
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        origin: config.api.baseUrl,
        referer: config.api.referers.memberRewards,
        'sec-ch-ua': '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"macOS"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'user-agent': userAgent,
        'x-requested-with': 'XMLHttpRequest',
        Cookie: `store__id=${storeId}; PHPSESSID=${sessionId}; store_name=${encodeURIComponent(storeName)}; member_id=${memberId}; username=${encodeURIComponent(username || '')}; first_name=${encodeURIComponent(firstName || '')}; last_name=${encodeURIComponent(lastName || '')}; email=${encodeURIComponent(email || '')}; cardNum=${cardNum || ''}`,
      };

      console.log('Making API call with session data:', {
        memberId,
        storeId,
        storeName,
        sessionId: sessionId.substring(0, 5) + '...',
      });

      const response = await fetch(config.api.getFullUrl('addToRewardQueue'), {
        method: 'POST',
        headers: headers,
        body: formData,
      });

      const responseText = await response.text();
      console.log('API Response:', responseText);

      if (response.ok) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        if (!responseText || responseText.trim().length < 2) {
          console.log('Empty response received from server, considering reward queue successful');
          Alert.alert('Success', `${rewardType} has been added to your queue!`);
          handleRefresh();
          return;
        }

        try {
          const jsonResult = JSON.parse(responseText);
          console.log('Parsed JSON result:', jsonResult);
          Alert.alert('Success', `${rewardType} has been added to your queue!`);
        } catch (parseError) {
          console.log('Invalid JSON response, but got HTTP 200 OK');
          Alert.alert('Success', `${rewardType} has been added to your queue!`);
        }

        handleRefresh();
      } else {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        console.error('Failed to queue reward:', responseText);
        Alert.alert('Error', `Failed to queue the reward. Status: ${response.status}`);
      }
    } catch (err: unknown) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      console.error('Error queuing reward:', err);
      Alert.alert(
        'Error',
        `Failed to queue the reward: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    } finally {
      setQueueingRewards(prev => ({ ...prev, [rewardId]: false }));
    }
  };

  const handleRewardPress = useCallback(
    async (item: Reward) => {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const isRedeemed = item.redeemed === '1';

      if (isRedeemed) {
        Alert.alert('Already Redeemed', 'This reward has already been claimed.');
      } else {
        Alert.alert('Queue Reward', `Would you like to add "${item.reward_type}" to your queue?`, [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Queue It!',
            onPress: () => queueReward(item.reward_id, item.reward_type),
          },
        ]);
      }
    },
    [queueReward]
  );

  const renderRewardItem = useCallback(
    ({ item, index }: { item: Reward; index: number }) => {
      const isRedeemed = item.redeemed === '1';
      const isQueueing = queueingRewards[item.reward_id] || false;

      return (
        <Animated.View
          entering={FadeInDown.duration(400).delay(index * 100)}
          layout={Layout.springify()}
        >
          <AnimatedTouchableOpacity
            style={[
              styles.rewardCard,
              {
                backgroundColor: colors.backgroundElevated,
                borderColor: isRedeemed ? colors.border : colors.accent,
                opacity: isRedeemed ? 0.7 : 1,
              },
              getShadow(isRedeemed ? 'sm' : 'md', isDark),
            ]}
            onPress={() => handleRewardPress(item)}
            activeOpacity={0.8}
            disabled={isQueueing}
          >
            <RewardBadge isRedeemed={isRedeemed} isAnimating={!isRedeemed} />

            <View style={styles.rewardContent}>
              <ThemedText type="defaultSemiBold" style={styles.rewardType}>
                {item.reward_type}
              </ThemedText>
              <ThemedText type="muted" style={styles.rewardDescription}>
                {isRedeemed ? 'You have claimed this reward' : 'Tap to add to your queue'}
              </ThemedText>
              <StatusBadge isRedeemed={isRedeemed} />
            </View>

            <View style={styles.rewardAction}>
              {isQueueing ? (
                <ActivityIndicator size="small" color={colors.tint} />
              ) : !isRedeemed ? (
                <Ionicons name="chevron-forward" size={20} color={colors.tint} />
              ) : (
                <Ionicons name="checkmark" size={20} color={colors.textMuted} />
              )}
            </View>
          </AnimatedTouchableOpacity>
        </Animated.View>
      );
    },
    [colors, isDark, queueingRewards, handleRewardPress]
  );

  // Calculate tasted beer count from tastedBeers
  const tastedCount = beers.tastedBeers?.length || 0;

  if (loading.isLoadingRewards && !refreshing) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.tint} />
        <ThemedText type="secondary" style={styles.loadingText}>
          Loading your rewards...
        </ThemedText>
      </ThemedView>
    );
  }

  if (errors.rewardError) {
    return (
      <ThemedView style={styles.errorContainer}>
        <Ionicons name="alert-circle" size={48} color={colors.error} />
        <ThemedText type="secondary" style={styles.errorText}>
          {errors.rewardError}
        </ThemedText>
        <TouchableOpacity
          style={[styles.retryButton, { backgroundColor: colors.tint }]}
          onPress={handleRefresh}
        >
          <ThemedText style={[styles.retryButtonText, { color: colors.textOnPrimary }]}>
            Try Again
          </ThemedText>
        </TouchableOpacity>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <FlatList
        data={beers.rewards}
        renderItem={renderRewardItem}
        keyExtractor={item => item.reward_id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          !session.isVisitor ? <ProgressHeader tastedCount={tastedCount} /> : null
        }
        ListEmptyComponent={<EmptyState isVisitor={session.isVisitor} />}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[colors.tint]}
            tintColor={textColor}
          />
        }
        showsVerticalScrollIndicator={false}
      />
    </ThemedView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    padding: spacing.m,
    paddingBottom: spacing.xxl,
  },

  // Loading State
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.m,
  },
  loadingText: {
    marginTop: spacing.s,
  },

  // Error State
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
    gap: spacing.m,
  },
  errorText: {
    textAlign: 'center',
    marginTop: spacing.s,
  },
  retryButton: {
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.sm,
    borderRadius: borderRadii.m,
    marginTop: spacing.m,
  },
  retryButtonText: {
    fontWeight: '600',
    fontSize: 16,
  },

  // Progress Header
  progressHeader: {
    borderRadius: borderRadii.l,
    padding: spacing.m,
    marginBottom: spacing.l,
    borderWidth: 1,
  },
  progressHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  progressTextContainer: {
    flex: 1,
    paddingRight: spacing.m,
  },
  progressTitle: {
    marginBottom: spacing.xs,
  },
  progressSubtitle: {
    marginBottom: spacing.xs,
  },
  progressRemaining: {
    fontSize: 14,
  },
  progressComplete: {
    fontWeight: '700',
    fontSize: 16,
  },

  // Progress Ring
  progressRingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  progressCircle: {
    position: 'absolute',
  },
  progressRingInner: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressPercentage: {
    fontSize: 24,
    fontWeight: '700',
  },
  progressLabel: {
    fontSize: 12,
  },

  // Milestones
  milestoneContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: spacing.m,
    paddingTop: spacing.m,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(128, 128, 128, 0.2)',
  },
  milestone: {
    width: 44,
    height: 44,
    borderRadius: borderRadii.full,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  milestoneText: {
    fontSize: 12,
    fontWeight: '600',
  },

  // Reward Card
  rewardCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadii.l,
    padding: spacing.m,
    marginBottom: spacing.sm,
    borderWidth: 1.5,
    minHeight: 88,
  },
  rewardContent: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  rewardType: {
    fontSize: 17,
    marginBottom: spacing.xs,
  },
  rewardDescription: {
    fontSize: 13,
    marginBottom: spacing.s,
  },
  rewardAction: {
    padding: spacing.s,
  },

  // Badge
  badgeContainer: {
    width: 48,
    height: 48,
    borderRadius: borderRadii.full,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Status Badge
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.s,
    paddingVertical: spacing.xs,
    borderRadius: borderRadii.s,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Empty State
  emptyStateContainer: {
    alignItems: 'center',
    padding: spacing.xl,
    marginTop: spacing.xxl,
  },
  emptyStateTitle: {
    marginTop: spacing.l,
    marginBottom: spacing.s,
    textAlign: 'center',
  },
  emptyStateMessage: {
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: spacing.m,
  },
});
