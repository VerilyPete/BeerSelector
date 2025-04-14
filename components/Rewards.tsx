import React, { useEffect, useState, useCallback } from 'react';
import { StyleSheet, View, FlatList, RefreshControl, ActivityIndicator, Text, TouchableOpacity, Alert } from 'react-native';
import { getAllRewards, fetchAndPopulateRewards, getPreference } from '@/src/database/db';
import { ThemedText } from './ThemedText';
import { ThemedView } from './ThemedView';
import { useThemeColor } from '@/hooks/useThemeColor';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getSessionData } from '@/src/api/sessionManager';

type Reward = {
  reward_id: string;
  redeemed: string;
  reward_type: string;
};

export const Rewards = () => {
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queueingRewards, setQueueingRewards] = useState<Record<string, boolean>>({});

  const cardColor = useThemeColor({}, 'background');
  const borderColor = useThemeColor({ light: '#e0e0e0', dark: '#333' }, 'text');
  const textColor = useThemeColor({}, 'text');
  const buttonColor = useThemeColor({ light: '#4caf50', dark: '#4caf50' }, 'text');
  const buttonTextColor = useThemeColor({ light: '#FFFFFF', dark: '#FFFFFF' }, 'text');

  const loadRewards = async () => {
    try {
      setLoading(true);
      const data = await getAllRewards();
      setRewards(data);
      setError(null);
    } catch (err) {
      console.error('Failed to load rewards:', err);
      setError('Failed to load rewards. Please try again later.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadRewards();
  }, []);

  const handleRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      await fetchAndPopulateRewards();
      loadRewards();
    } catch (error) {
      console.error('Error refreshing rewards:', error);
      setError('Failed to refresh rewards. Please try again later.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  const queueReward = async (rewardId: string, rewardType: string) => {
    try {
      setQueueingRewards(prev => ({ ...prev, [rewardId]: true }));
      
      // Get session data
      const sessionData = await getSessionData();
      
      if (!sessionData) {
        Alert.alert('Error', 'You are not logged in. Please log in to queue rewards.');
        return;
      }
      
      // Get stored auth cookies
      const authCookiesStr = await getPreference('auth_cookies');
      if (!authCookiesStr) {
        Alert.alert('Error', 'Authentication information not found. Please log in again.');
        return;
      }
      
      // Parse the stored cookies and format them for the Cookie header
      const authCookies = JSON.parse(authCookiesStr);
      const cookieHeader = Object.entries(authCookies)
        .map(([name, value]) => `${name}=${value}`)
        .join('; ');
      
      // Prepare form data from session
      const formData = new URLSearchParams({
        'chitCode': rewardId,
        'chitRewardType': encodeURIComponent(rewardType),
        'chitStoreName': encodeURIComponent(sessionData.storeName),
        'chitUserId': sessionData.memberId
      }).toString();
      
      // Make the API call
      const response = await fetch('https://tapthatapp.beerknurd.com/addToRewardQueue.php', {
        method: 'POST',
        headers: {
          'Accept': '*/*',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          'Cookie': cookieHeader, // Use the properly formatted cookie header
        },
        body: formData,
      });
      
      const responseData = await response.text();
      
      if (response.ok) {
        Alert.alert('Success', `${rewardType} has been added to your queue!`);
        // Refresh the data to reflect the change
        handleRefresh();
      } else {
        Alert.alert('Error', `Failed to queue the reward: ${responseData}`);
      }
    } catch (err: any) {
      console.error('Error queuing reward:', err);
      Alert.alert('Error', `Failed to queue the reward: ${err.message}`);
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
            opacity: isRedeemed ? 0.5 : 1 
          }
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

  if (loading && !refreshing) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={textColor} />
      </ThemedView>
    );
  }

  if (error) {
    return (
      <ThemedView style={styles.errorContainer}>
        <ThemedText style={styles.errorText}>{error}</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <FlatList
        data={rewards}
        renderItem={renderRewardItem}
        keyExtractor={(item) => item.reward_id}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: 20 }
        ]}
        ListEmptyComponent={
          <ThemedView style={styles.emptyContainer}>
            <ThemedText style={styles.emptyText}>No rewards found.</ThemedText>
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
