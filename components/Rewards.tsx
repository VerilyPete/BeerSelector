import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import { rewardsRepository } from '@/src/database/repositories/RewardsRepository';
import { fetchRewardsFromAPI } from '@/src/api/beerApi';
import { ThemedText } from './ThemedText';
import { ThemedView } from './ThemedView';
import { useThemeColor } from '@/hooks/useThemeColor';
import { getSessionData } from '@/src/api/sessionManager';
import Constants from 'expo-constants';
import { useAppContext } from '@/context/AppContext';
import { config } from '@/src/config';

type Reward = {
  reward_id: string;
  redeemed: string;
  reward_type: string;
};

export const Rewards = () => {
  // MP-4 Step 2: Use context for rewards data instead of local state
  const { session, beers, loading, errors, refreshBeerData } = useAppContext();

  const [refreshing, setRefreshing] = useState(false);
  const [queueingRewards, setQueueingRewards] = useState<Record<string, boolean>>({});

  const cardColor = useThemeColor({}, 'background');
  const borderColor = useThemeColor({ light: '#e0e0e0', dark: '#333' }, 'text');
  const textColor = useThemeColor({}, 'text');
  const buttonColor = useThemeColor({ light: '#4caf50', dark: '#4caf50' }, 'text');
  const buttonTextColor = useThemeColor({ light: '#FFFFFF', dark: '#FFFFFF' }, 'text');

  // Note: Data loading now happens in _layout.tsx via AppContext
  // No need for loadRewards function or useEffect

  const handleRefresh = useCallback(async () => {
    try {
      setRefreshing(true);

      if (!session.isVisitor) {
        // Only refresh rewards if not in visitor mode

        // Step 1: Fetch fresh rewards from Flying Saucer API
        const freshRewards = await fetchRewardsFromAPI();

        // Step 2: Write to database using repository
        await rewardsRepository.insertMany(freshRewards);

        // Step 3: CRITICAL - Manual sync required!
        // Why: We just modified the database, so AppContext state is now stale.
        // AppContext provides single source of truth for UI components.
        // Without this sync, the UI won't reflect the new rewards data.
        // See docs/STATE_SYNC_GUIDELINES.md for full explanation.
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

      // Get session data
      const sessionData = await getSessionData();

      if (!sessionData) {
        Alert.alert('Error', 'You are not logged in. Please log in to queue rewards.');
        return;
      }

      // Extract required data for the request
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

      // Get the device's native user agent or use a fallback
      const userAgent =
        Platform.OS === 'web'
          ? window.navigator.userAgent
          : `BeerSelector/${Constants.expoConfig?.version || '1.0.0'} (${Platform.OS}; ${Platform.Version})`;

      // Prepare the raw form data string exactly as shown in the curl example
      // This is critical - using the raw rewardId directly as chitCode, not a compound ID
      const formData = `chitCode=${rewardId}&chitRewardType=${encodeURIComponent(rewardType)}&chitStoreName=${encodeURIComponent(storeName)}&chitUserId=${memberId}`;

      console.log('Sending form data:', formData);

      // Set up request headers with proper cookie formatting
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

      // Make the API call
      const response = await fetch(config.api.getFullUrl('addToRewardQueue'), {
        method: 'POST',
        headers: headers,
        body: formData,
      });

      const responseText = await response.text();
      console.log('API Response:', responseText);

      // Handle response similar to checkInBeer method
      if (response.ok) {
        // If response is empty or too short, still consider it a success
        if (!responseText || responseText.trim().length < 2) {
          console.log('Empty response received from server, considering reward queue successful');
          Alert.alert('Success', `${rewardType} has been added to your queue!`);
          handleRefresh();
          return;
        }

        try {
          // Try to parse as JSON if possible
          const jsonResult = JSON.parse(responseText);
          console.log('Parsed JSON result:', jsonResult);
          Alert.alert('Success', `${rewardType} has been added to your queue!`);
        } catch (parseError) {
          // If not valid JSON but we got a 200 OK, assume success
          console.log('Invalid JSON response, but got HTTP 200 OK');
          Alert.alert('Success', `${rewardType} has been added to your queue!`);
        }

        // Refresh the data to reflect the change
        handleRefresh();
      } else {
        console.error('Failed to queue reward:', responseText);
        Alert.alert('Error', `Failed to queue the reward. Status: ${response.status}`);
      }
    } catch (err: unknown) {
      console.error('Error queuing reward:', err);
      Alert.alert(
        'Error',
        `Failed to queue the reward: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    } finally {
      setQueueingRewards(prev => ({ ...prev, [rewardId]: false }));
    }
  };

  const renderRewardItem = ({ item }: { item: Reward }) => {
    const isRedeemed = item.redeemed === '1';
    const isQueueing = queueingRewards[item.reward_id] || false;

    return (
      <View
        style={[
          styles.rewardItem,
          {
            backgroundColor: cardColor,
            borderColor: borderColor,
            opacity: isRedeemed ? 0.5 : 1,
          },
        ]}
      >
        <View style={styles.rewardContent}>
          <ThemedText style={styles.rewardType}>{item.reward_type}</ThemedText>
          <ThemedText style={[styles.rewardStatus, { color: isRedeemed ? '#888' : '#4caf50' }]}>
            {isRedeemed ? 'Redeemed' : 'Available'}
          </ThemedText>

          {!isRedeemed && (
            <TouchableOpacity
              style={[styles.queueButton, { backgroundColor: buttonColor }]}
              onPress={() => queueReward(item.reward_id, item.reward_type)}
              disabled={isQueueing}
            >
              {isQueueing ? (
                <ActivityIndicator size="small" color={buttonTextColor} />
              ) : (
                <ThemedText style={[styles.queueButtonText, { color: buttonTextColor }]}>
                  Queue It Up!
                </ThemedText>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  if (loading.isLoadingRewards && !refreshing) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={textColor} />
      </ThemedView>
    );
  }

  if (errors.rewardError) {
    return (
      <ThemedView style={styles.errorContainer}>
        <ThemedText style={styles.errorText}>{errors.rewardError}</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <FlatList
        data={beers.rewards}
        renderItem={renderRewardItem}
        keyExtractor={item => item.reward_id}
        contentContainerStyle={[styles.listContent, { paddingBottom: 20 }]}
        ListEmptyComponent={
          <ThemedView style={styles.emptyContainer}>
            {session.isVisitor ? (
              <ThemedText style={styles.emptyText}>
                Rewards are not available in visitor mode. Please log in to view your rewards.
              </ThemedText>
            ) : (
              <ThemedText style={styles.emptyText}>No rewards found.</ThemedText>
            )}
          </ThemedView>
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={['#4caf50']}
            tintColor={textColor}
          />
        }
      />
    </ThemedView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    padding: 16,
  },
  rewardItem: {
    borderRadius: 8,
    marginBottom: 16,
    padding: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  rewardContent: {
    flex: 1,
  },
  rewardType: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  rewardId: {
    fontSize: 14,
    opacity: 0.7,
    marginBottom: 8,
  },
  rewardStatus: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    textAlign: 'center',
    fontSize: 16,
    marginTop: 10,
  },
  emptyContainer: {
    padding: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
  },
  queueButton: {
    padding: 10,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  queueButtonText: {
    fontWeight: 'bold',
    fontSize: 14,
  },
});
