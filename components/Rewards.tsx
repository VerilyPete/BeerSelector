import React, { useState, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Platform,
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
import { useColorScheme } from '@/hooks/useColorScheme';
import { getSessionData } from '@/src/api/sessionManager';
import Constants from 'expo-constants';
import { useAppContext } from '@/context/AppContext';
import { config } from '@/src/config';
import { Colors } from '@/constants/Colors';

type Reward = {
  reward_id: string;
  redeemed: string;
  reward_type: string;
};

const BEER_GOAL = 200;

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

const ProgressRing = ({
  progress,
  size = 120,
  strokeWidth = 10,
}: {
  progress: number;
  size?: number;
  strokeWidth?: number;
}) => {
  const colorScheme = useColorScheme() ?? 'dark';
  const colors = Colors[colorScheme];

  const animatedProgress = useSharedValue(0);
  const celebrationScale = useSharedValue(1);

  useEffect(() => {
    animatedProgress.value = withTiming(progress, {
      duration: 1200,
      easing: Easing.out(Easing.cubic),
    });

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
      style={[styles.progressRingContainer, { width: size + 8, height: size + 8 }]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: progressPercent }}
      accessibilityLabel={`Progress: ${progressPercent}% toward 200 beers`}
    >
      <Animated.View style={[animatedStyle, { width: size, height: size }]}>
        <View style={StyleSheet.absoluteFill}>
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
          <View
            style={[
              styles.progressCircle,
              {
                width: size,
                height: size,
                borderRadius: size / 2,
                borderWidth: strokeWidth,
                borderColor: colors.tint,
                borderTopColor: 'transparent',
                borderRightColor: 'transparent',
                transform: [{ rotate: `${progress * 360 - 90}deg` }],
              },
            ]}
          />
        </View>
      </Animated.View>
      <View style={styles.progressRingInner}>
        <Text style={[styles.progressPercentage, { fontSize: size * 0.2, color: colors.text }]}>
          {Math.round(progress * 100)}%
        </Text>
        <Text style={[styles.progressLabel, { fontSize: size * 0.1, color: colors.textSecondary }]}>
          Complete
        </Text>
      </View>
    </View>
  );
};

const RewardBadge = ({
  isRedeemed,
  isAnimating,
}: {
  isRedeemed: boolean;
  isAnimating: boolean;
}) => {
  const colorScheme = useColorScheme() ?? 'dark';
  const colors = Colors[colorScheme];

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
  const iconColor = isRedeemed ? colors.textSecondary : colors.tint;
  const backgroundColor = isRedeemed ? colors.backgroundActive : colors.backgroundElevated;

  return (
    <Animated.View
      style={[
        styles.badgeContainer,
        { backgroundColor, borderWidth: 1, borderColor: colors.border },
        !isRedeemed && shimmerStyle,
      ]}
    >
      <Ionicons name={iconName} size={24} color={iconColor} />
    </Animated.View>
  );
};

const StatusBadge = ({ isRedeemed }: { isRedeemed: boolean }) => {
  const colorScheme = useColorScheme() ?? 'dark';
  const colors = Colors[colorScheme];

  return (
    <View
      style={[
        styles.statusBadge,
        {
          backgroundColor: isRedeemed ? colors.backgroundActive : 'transparent',
          borderWidth: isRedeemed ? 0 : 1,
          borderColor: isRedeemed ? 'transparent' : colors.tint,
        },
      ]}
    >
      <Text
        style={[styles.statusText, { color: isRedeemed ? colors.textSecondary : colors.tint }]}
      >
        {isRedeemed ? 'REDEEMED' : 'AVAILABLE'}
      </Text>
    </View>
  );
};

const EmptyState = ({ isVisitor }: { isVisitor: boolean }) => {
  const colorScheme = useColorScheme() ?? 'dark';
  const colors = Colors[colorScheme];

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
          color={colors.tint}
        />
      </Animated.View>
      <Text style={[styles.emptyStateTitle, { color: colors.text }]}>
        {isVisitor ? 'Members Only' : 'No Rewards Yet'}
      </Text>
      <Text style={[styles.emptyStateMessage, { color: colors.textSecondary }]}>
        {isVisitor
          ? 'Rewards are exclusive to UFO Club members. Log in to view and claim your rewards!'
          : 'Keep tasting new beers to earn rewards! Your first reward awaits after just a few check-ins.'}
      </Text>
    </Animated.View>
  );
};

const ProgressHeader = ({ tastedCount }: { tastedCount: number }) => {
  const colorScheme = useColorScheme() ?? 'dark';
  const colors = Colors[colorScheme];
  const { width: screenWidth } = useWindowDimensions();

  const progress = Math.min(tastedCount / BEER_GOAL, 1);
  const remaining = Math.max(BEER_GOAL - tastedCount, 0);

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
      ]}
    >
      <View style={styles.progressHeaderContent}>
        <View style={styles.progressTextContainer}>
          <Text style={[styles.progressSectionLabel, { color: colors.textSecondary }]}>
            YOUR JOURNEY
          </Text>
          <Text style={[styles.progressSubtitle, { color: colors.text }]}>
            {tastedCount} of {BEER_GOAL} beers tasted
          </Text>
          {remaining > 0 ? (
            <Text style={[styles.progressRemaining, { color: colors.textSecondary }]}>
              {remaining} more to go
            </Text>
          ) : (
            <Text style={[styles.progressComplete, { color: colors.tint }]}>
              Plate Complete!
            </Text>
          )}
        </View>
        <ProgressRing progress={progress} size={ringSize} />
      </View>

      <View style={[styles.milestoneContainer, { borderTopColor: colors.separator }]}>
        {[50, 100, 150, 200].map(milestone => {
          const reached = tastedCount >= milestone;
          return (
            <View
              key={milestone}
              style={[
                styles.milestone,
                {
                  backgroundColor: reached ? colors.tint : 'transparent',
                  borderColor: reached ? colors.tint : colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.milestoneText,
                  { color: reached ? colors.textOnPrimary : colors.textSecondary },
                ]}
              >
                {milestone}
              </Text>
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

  const colorScheme = useColorScheme() ?? 'dark';
  const colors = Colors[colorScheme];

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
                borderColor: isRedeemed ? colors.border : colors.tint,
                opacity: isRedeemed ? 0.7 : 1,
              },
            ]}
            onPress={() => handleRewardPress(item)}
            activeOpacity={0.8}
            disabled={isQueueing}
          >
            <RewardBadge isRedeemed={isRedeemed} isAnimating={!isRedeemed} />

            <View style={styles.rewardContent}>
              <Text style={[styles.rewardType, { color: colors.text }]}>
                {item.reward_type}
              </Text>
              <Text style={[styles.rewardDescription, { color: colors.textSecondary }]}>
                {isRedeemed ? 'You have claimed this reward' : 'Tap to add to your queue'}
              </Text>
              <StatusBadge isRedeemed={isRedeemed} />
            </View>

            <View style={styles.rewardAction}>
              {isQueueing ? (
                <ActivityIndicator size="small" color={colors.tint} />
              ) : !isRedeemed ? (
                <Ionicons name="chevron-forward" size={20} color={colors.tint} />
              ) : (
                <Ionicons name="checkmark" size={20} color={colors.textSecondary} />
              )}
            </View>
          </AnimatedTouchableOpacity>
        </Animated.View>
      );
    },
    [colors, queueingRewards, handleRewardPress]
  );

  const tastedCount = beers.tastedBeers?.length || 0;

  if (loading.isLoadingRewards && !refreshing) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.tint} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
          Loading your rewards...
        </Text>
      </View>
    );
  }

  if (errors.rewardError) {
    return (
      <View style={[styles.errorContainer, { backgroundColor: colors.background }]}>
        <Ionicons name="alert-circle" size={48} color={colors.error} />
        <Text style={[styles.errorText, { color: colors.textSecondary }]}>
          {errors.rewardError}
        </Text>
        <TouchableOpacity
          style={[styles.retryButton, { borderColor: colors.tint }]}
          onPress={handleRefresh}
        >
          <Text style={[styles.retryButtonText, { color: colors.tint }]}>
            TRY AGAIN
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
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
            tintColor={colors.text}
          />
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    padding: 24,
    paddingBottom: 48,
  },

  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontFamily: 'Space Mono',
    fontSize: 11,
    marginTop: 8,
  },

  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 16,
  },
  errorText: {
    fontFamily: 'Space Mono',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 8,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderWidth: 1,
    marginTop: 16,
  },
  retryButtonText: {
    fontFamily: 'Inter',
    fontWeight: '600',
    fontSize: 10,
    letterSpacing: 2,
  },

  progressHeader: {
    padding: 24,
    marginBottom: 24,
    borderWidth: 1,
  },
  progressHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressTextContainer: {
    flex: 1,
    marginRight: 16,
  },
  progressSectionLabel: {
    fontFamily: 'Inter',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 3,
    marginBottom: 8,
  },
  progressSubtitle: {
    fontFamily: 'Inter',
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 4,
  },
  progressRemaining: {
    fontFamily: 'Space Mono',
    fontSize: 11,
  },
  progressComplete: {
    fontFamily: 'Inter',
    fontWeight: '700',
    fontSize: 16,
  },

  progressRingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
    overflow: 'hidden',
  },
  progressCircle: {
    position: 'absolute',
  },
  progressRingInner: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressPercentage: {
    fontFamily: 'Inter',
    fontSize: 24,
    fontWeight: '700',
  },
  progressLabel: {
    fontFamily: 'Space Mono',
    fontSize: 12,
  },

  milestoneContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
  },
  milestone: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  milestoneText: {
    fontFamily: 'Inter',
    fontSize: 12,
    fontWeight: '600',
  },

  rewardCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    minHeight: 88,
  },
  rewardContent: {
    flex: 1,
    marginLeft: 12,
  },
  rewardType: {
    fontFamily: 'Inter',
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 4,
  },
  rewardDescription: {
    fontFamily: 'Space Mono',
    fontSize: 11,
    marginBottom: 8,
  },
  rewardAction: {
    padding: 8,
  },

  badgeContainer: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },

  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusText: {
    fontFamily: 'Inter',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 2,
  },

  emptyStateContainer: {
    alignItems: 'center',
    padding: 32,
    marginTop: 48,
  },
  emptyStateTitle: {
    fontFamily: 'Inter',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 24,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyStateMessage: {
    fontFamily: 'Space Mono',
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 16,
  },
});
