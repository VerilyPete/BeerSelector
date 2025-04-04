import React, { useState, useEffect } from 'react';
import { StyleSheet, TouchableOpacity, View, Switch, Alert, TextInput, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { IconSymbol } from '@/components/ui/IconSymbol';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useColorScheme } from '@/hooks/useColorScheme';
import { refreshAllDataFromAPI, getAllPreferences, setPreference } from '@/src/database/db';

// Define a Preference type for typechecking
interface Preference {
  key: string;
  value: string;
  description: string;
  editable?: boolean;
}

export default function SettingsScreen() {
  const backgroundColor = useThemeColor({}, 'background');
  const cardColor = useThemeColor({ light: '#F5F5F5', dark: '#1C1C1E' }, 'background');
  const tintColor = useThemeColor({}, 'tint');
  const textColor = useThemeColor({}, 'text');
  const borderColor = useThemeColor({ light: '#e0e0e0', dark: '#333' }, 'text');
  const colorScheme = useColorScheme() ?? 'light';

  // Removed the filter preferences and notifications state variables
  const [refreshing, setRefreshing] = useState(false);
  const [preferences, setPreferences] = useState<Preference[]>([]);
  const [loading, setLoading] = useState(true);

  // Load preferences on component mount
  useEffect(() => {
    loadPreferences();
  }, []);

  // Function to load preferences from the database
  const loadPreferences = async () => {
    try {
      setLoading(true);
      const prefs = await getAllPreferences();
      setPreferences(prefs);
    } catch (error) {
      console.error('Failed to load preferences:', error);
      Alert.alert('Error', 'Failed to load preferences.');
    } finally {
      setLoading(false);
    }
  };

  // Function to handle refreshing all data from APIs
  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      
      // Perform the refresh of both tables
      const refreshResult = await refreshAllDataFromAPI();
      
      // Show success message
      Alert.alert(
        'Success', 
        `Successfully refreshed:\n- ${refreshResult.allBeers.length} beers\n- ${refreshResult.myBeers.length} tasted beers`
      );
    } catch (err) {
      console.error('Failed to refresh data:', err);
      Alert.alert('Error', 'Failed to refresh data from server. Please try again later.');
    } finally {
      // Set refreshing to false at the end, in both success and error cases
      setRefreshing(false);
    }
  };

  // Render a preference item - simplified to just display
  const renderPreferenceItem = (preference: Preference) => {
    return (
      <View key={preference.key} style={styles.preferenceItem}>
        <ThemedText style={styles.preferenceKey}>{preference.key}</ThemedText>
        <ThemedText style={styles.preferenceDescription}>{preference.description}</ThemedText>
        <ThemedText style={styles.preferenceValue} numberOfLines={2} ellipsizeMode="middle">
          {preference.value}
        </ThemedText>
      </View>
    );
  };

  return (
    <ThemedView style={styles.container}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <SafeAreaView style={styles.safeArea} edges={['top', 'right', 'left']}>
        {/* Back button */}
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <IconSymbol name="xmark" size={22} color={tintColor} />
        </TouchableOpacity>

        <ScrollView style={styles.scrollView}>
          <View style={styles.content}>
            {/* Title Section */}
            <View style={styles.titleSection}>
              <ThemedText type="title" style={styles.pageTitle}>Settings</ThemedText>
            </View>
            
            {/* Removed Filter Preferences Section */}
            
            {/* Removed Notifications Section */}

            {/* API Endpoints Section */}
            <View style={[styles.section, { backgroundColor: cardColor }]}>
              <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>API Endpoints</ThemedText>
              
              {loading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="small" color={tintColor} />
                  <ThemedText>Loading preferences...</ThemedText>
                </View>
              ) : (
                preferences
                  .filter(pref => pref.key.includes('api_url'))
                  .map(pref => renderPreferenceItem(pref))
              )}
            </View>

            {/* About Section */}
            <View style={[styles.section, { backgroundColor: cardColor }]}>
              <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>About</ThemedText>
              
              <View style={styles.aboutInfo}>
                <ThemedText>Beer Selector</ThemedText>
                <ThemedText style={styles.versionText}>Version 1.0.0 (Build 2)</ThemedText>
              </View>
            </View>

            {/* Data Management Section */}
            <View style={[styles.section, { backgroundColor: cardColor }]}>
              <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>Data Management</ThemedText>
              
              <View style={styles.buttonContainer}>
                <TouchableOpacity 
                  style={[
                    styles.dataButton, 
                    { 
                      backgroundColor: refreshing ? '#FF8888' : '#FF3B30',
                      borderColor: borderColor
                    }
                  ]}
                  onPress={handleRefresh}
                  disabled={refreshing}
                >
                  <ThemedText style={styles.dataButtonText}>
                    {refreshing ? 'Refreshing data...' : 'Refresh All Beer Data'}
                  </ThemedText>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  backButton: {
    position: 'absolute',
    top: 30,
    right: 16,
    zIndex: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(200, 200, 200, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 30,
  },
  titleSection: {
    marginBottom: 20,
    alignItems: 'center',
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  section: {
    borderRadius: 12,
    marginBottom: 20,
    overflow: 'hidden',
  },
  sectionTitle: {
    fontSize: 16,
    padding: 12,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderTopWidth: 0.5,
    borderTopColor: '#CCCCCC',
  },
  aboutInfo: {
    padding: 12,
  },
  versionText: {
    marginTop: 4,
    fontSize: 12,
    opacity: 0.7,
  },
  buttonContainer: {
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 0.5,
    borderTopColor: '#CCCCCC',
  },
  dataButton: {
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    width: '60%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  dataButtonText: {
    color: 'white',
    fontWeight: '600',
  },
  loadingContainer: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  preferenceItem: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderTopWidth: 0.5,
    borderTopColor: '#CCCCCC',
  },
  preferenceKey: {
    fontWeight: '600',
    fontSize: 14,
  },
  preferenceDescription: {
    fontSize: 12,
    opacity: 0.7,
    marginBottom: 4,
  },
  preferenceValue: {
    fontSize: 12,
    opacity: 0.9,
    marginVertical: 4,
  },
}); 