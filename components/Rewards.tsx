import React, { useEffect, useState, useCallback } from 'react';
import { StyleSheet, View, FlatList, RefreshControl, ActivityIndicator, Text, TouchableOpacity, Alert, Platform } from 'react-native';
import { getAllRewards, fetchAndPopulateRewards, getPreference } from '@/src/database/db';
import { ThemedText } from './ThemedText';
import { ThemedView } from './ThemedView';
import { useThemeColor } from '@/hooks/useThemeColor';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getSessionData } from '@/src/api/sessionManager';
import Constants from 'expo-constants';
import { isVisitorMode } from '@/src/api/authService';

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
  const [isVisitor, setIsVisitor] = useState(false);

  const cardColor = useThemeColor({}, 'background');
  const borderColor = useThemeColor({ light: '#e0e0e0', dark: '#333' }, 'text');
  const textColor = useThemeColor({}, 'text');
  const buttonColor = useThemeColor({ light: '#4caf50', dark: '#4caf50' }, 'text');
  const buttonTextColor = useThemeColor({ light: '#FFFFFF', dark: '#FFFFFF' }, 'text');

  const checkVisitorMode = useCallback(async () => {
    try {
      const visitorMode = await isVisitorMode(true);
      setIsVisitor(visitorMode);
      return visitorMode;
    } catch (err) {
      console.error('Error checking visitor mode:', err);
      return false;
    }
  }, []);

  const loadRewards = async () => {
    try {
      setLoading(true);
      
      // First check if user is in visitor mode
      const visitorMode = await checkVisitorMode();
      
      if (visitorMode) {
        // In visitor mode, don't fetch rewards
        setRewards([]);
        setError(null);
      } else {
        // Normal mode, load rewards
        const data = await getAllRewards();
        setRewards(data);
        setError(null);
      }
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
      
      // Check visitor mode first
      const visitorMode = await checkVisitorMode();
      
      if (!visitorMode) {
        // Only refresh rewards if not in visitor mode
        await fetchAndPopulateRewards();
      }
      
      // Reload rewards (will handle visitor mode internally)
      loadRewards();
    } catch (error) {
      console.error('Error refreshing rewards:', error);
      setError('Failed to refresh rewards. Please try again later.');
    } finally {
      setRefreshing(false);
    }
  }, [checkVisitorMode]);

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
      const { memberId, storeId, storeName, sessionId, username, firstName, lastName, email, cardNum } = sessionData;
      
      // Get the device's native user agent or use a fallback
      const userAgent = Platform.OS === 'web' 
        ? window.navigator.userAgent 
        : `BeerSelector/${Constants.expoConfig?.version || '1.0.0'} (${Platform.OS}; ${Platform.Version})`;
      
      // Prepare the raw form data string exactly as shown in the curl example
      // This is critical - using the raw rewardId directly as chitCode, not a compound ID
      const formData = `chitCode=${rewardId}&chitRewardType=${encodeURIComponent(rewardType)}&chitStoreName=${encodeURIComponent(storeName)}&chitUserId=${memberId}`;
      
      console.log('Sending form data:', formData);
      
      // Set up request headers with proper cookie formatting
      const headers = {
        'accept': '*/*',
        'accept-language': 'en-US,en;q=0.9',
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'origin': 'https://tapthatapp.beerknurd.com',
        'referer': 'https://tapthatapp.beerknurd.com/memberRewards.php', // Changed to match the curl example
        'sec-ch-ua': '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"macOS"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'user-agent': userAgent,
        'x-requested-with': 'XMLHttpRequest',
        'Cookie': `store__id=${storeId}; PHPSESSID=${sessionId}; store_name=${encodeURIComponent(storeName)}; member_id=${memberId}; username=${encodeURIComponent(username || '')}; first_name=${encodeURIComponent(firstName || '')}; last_name=${encodeURIComponent(lastName || '')}; email=${encodeURIComponent(email || '')}; cardNum=${cardNum || ''}`
      };
      
      console.log('Making API call with session data:', {
        memberId, storeId, storeName, sessionId: sessionId.substring(0, 5) + '...'
      });
      
      // Make the API call
      const response = await fetch('https://tapthatapp.beerknurd.com/addToRewardQueue.php', {
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
            {isVisitor ? (
              <ThemedText style={styles.emptyText}>
                Rewards are not available in visitor mode.
                Please log in to view your rewards.
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
