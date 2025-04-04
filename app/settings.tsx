import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, TouchableOpacity, View, Switch, Alert, TextInput, ScrollView, ActivityIndicator, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { IconSymbol } from '@/components/ui/IconSymbol';
import * as WebBrowser from 'expo-web-browser';
import { WebView, WebViewNavigation } from 'react-native-webview';

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
  const [loginLoading, setLoginLoading] = useState(false);
  const [webviewVisible, setWebviewVisible] = useState(false);
  const webViewRef = useRef<WebView>(null);

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

  // Function to handle the login process using WebView
  const handleLogin = async () => {
    try {
      setLoginLoading(true);
      setWebviewVisible(true);
    } catch (error) {
      console.error('Login dialog error:', error);
      Alert.alert('Error', 'Failed to start the login process.');
      setLoginLoading(false);
    }
  };

  // Handle WebView navigation state changes
  const handleWebViewNavigationStateChange = (navState: WebViewNavigation) => {
    console.log('WebView URL:', navState.url);
    
    // If we're on the member dashboard page
    if (navState.url.includes('member-dash.php')) {
      // Inject JavaScript to extract the API URLs
      if (webViewRef.current) {
        webViewRef.current.injectJavaScript(`
          (function() {
            // Try to find variables in the page
            let userJsonUrl = null;
            let storeJsonUrl = null;
            
            // Look for PHP variables in script tags
            const scripts = document.querySelectorAll('script');
            for (const script of scripts) {
              const content = script.textContent || script.innerText;
              
              // Look for user_json_url
              const userMatch = content.match(/\\$user_json_url\\s*=\\s*["']([^"']+)["']/);
              if (userMatch && userMatch[1]) {
                userJsonUrl = userMatch[1];
              }
              
              // Look for store_json_url
              const storeMatch = content.match(/\\$store_json_url\\s*=\\s*["']([^"']+)["']/);
              if (storeMatch && storeMatch[1]) {
                storeJsonUrl = storeMatch[1];
              }
            }
            
            // Also look for URLs in the page source
            const html = document.documentElement.outerHTML;
            
            if (!userJsonUrl) {
              const memberJsonMatch = html.match(/https:\\/\\/[^"'\\s]+bk-member-json\\.php\\?uid=\\d+/i);
              if (memberJsonMatch) {
                userJsonUrl = memberJsonMatch[0];
              }
            }
            
            if (!storeJsonUrl) {
              const storeJsonMatch = html.match(/https:\\/\\/[^"'\\s]+bk-store-json\\.php\\?sid=\\d+/i);
              if (storeJsonMatch) {
                storeJsonUrl = storeJsonMatch[0];
              }
            }
            
            // Send the results back to React Native
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'URLs',
              userJsonUrl,
              storeJsonUrl,
              html: html.substring(0, 1000) // Send a portion of HTML for debugging
            }));
            
            true; // Return statement needed for Android
          })();
        `);
      }
    }
  };

  // Handle messages from WebView
  const handleWebViewMessage = async (event: {nativeEvent: {data: string}}) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      console.log('Received message from WebView:', data.type);
      
      if (data.type === 'URLs') {
        const { userJsonUrl, storeJsonUrl, html } = data;
        console.log('Extracted User JSON URL:', userJsonUrl);
        console.log('Extracted Store JSON URL:', storeJsonUrl);
        console.log('Sample HTML:', html);
        
        if (userJsonUrl && storeJsonUrl) {
          // Found the URLs, can close the WebView
          setWebviewVisible(false);
          setLoginLoading(false);
          
          // Update the preferences with the new URLs
          await setPreference('my_beers_api_url', userJsonUrl, 'API endpoint for fetching my beers');
          await setPreference('all_beers_api_url', storeJsonUrl, 'API endpoint for fetching all beers');
          
          // Save the login timestamp
          const loginTimestamp = new Date().toISOString();
          await setPreference('last_login_timestamp', loginTimestamp, 'Last successful login timestamp');
          
          // Reload the preferences to show updated values
          await loadPreferences();
          
          // Refresh the data with the new URLs
          await handleRefresh();
          
          Alert.alert(
            'Success', 
            'Login successful. API URLs have been updated and beer data has been refreshed.'
          );
        } else {
          console.log('URLs not found in injected JavaScript');
          // Continue browsing - user may need to complete login
        }
      }
    } catch (error) {
      console.error('Error handling WebView message:', error);
      // Reset loading state in case of error
      setLoginLoading(false);
    }
  };

  // Function to close the WebView and cancel login
  const closeWebView = () => {
    setWebviewVisible(false);
    setLoginLoading(false);
    Alert.alert('Login Cancelled', 'The login process was cancelled.');
  };

  // Function to reset API URLs
  const handleResetApiUrls = async () => {
    try {
      Alert.alert(
        'Reset API URLs',
        'Are you sure you want to reset the API URLs? This will clear the current endpoints.',
        [
          {
            text: 'Cancel',
            style: 'cancel'
          },
          {
            text: 'Reset',
            style: 'destructive',
            onPress: async () => {
              // Clear the API URL preferences
              await setPreference('all_beers_api_url', '', 'API endpoint for fetching all beers');
              await setPreference('my_beers_api_url', '', 'API endpoint for fetching my beers');
              
              // Also clear the login timestamp if it exists
              try {
                await setPreference('last_login_timestamp', '', 'Last successful login timestamp');
              } catch (err) {
                // Ignore if this preference doesn't exist
              }
              
              // Reload preferences to reflect changes
              await loadPreferences();
              
              Alert.alert('Success', 'API URL preferences have been reset.');
            }
          }
        ]
      );
    } catch (error) {
      console.error('Error resetting API URLs:', error);
      Alert.alert('Error', 'Failed to reset API URLs. Please try again.');
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
      
      {/* WebView Modal */}
      <Modal
        visible={webviewVisible}
        animationType="slide"
        onRequestClose={closeWebView}
      >
        <SafeAreaView style={{ flex: 1 }}>
          <View style={styles.webViewHeader}>
            <TouchableOpacity onPress={closeWebView} style={styles.closeButton}>
              <IconSymbol name="xmark" size={22} color={tintColor} />
            </TouchableOpacity>
            <ThemedText style={styles.webViewTitle}>Flying Saucer Login</ThemedText>
          </View>
          
          <WebView
            ref={webViewRef}
            source={{ uri: 'https://tapthatapp.beerknurd.com/kiosk.php' }}
            onNavigationStateChange={handleWebViewNavigationStateChange}
            onMessage={handleWebViewMessage}
            style={{ flex: 1 }}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            sharedCookiesEnabled={true}
          />
        </SafeAreaView>
      </Modal>
      
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

                {/* Login Button */}
                <TouchableOpacity 
                  style={[
                    styles.dataButton, 
                    styles.loginButton,
                    { 
                      backgroundColor: loginLoading ? '#88AAFF' : '#007AFF',
                      borderColor: borderColor
                    }
                  ]}
                  onPress={handleLogin}
                  disabled={loginLoading || refreshing}
                >
                  <ThemedText style={styles.dataButtonText}>
                    {loginLoading ? 'Logging in...' : 'Login to Flying Saucer'}
                  </ThemedText>
                </TouchableOpacity>

                {/* Reset API URLs Button */}
                <TouchableOpacity 
                  style={[
                    styles.dataButton, 
                    styles.resetButton,
                    { 
                      backgroundColor: '#8E8E93',
                      borderColor: borderColor
                    }
                  ]}
                  onPress={handleResetApiUrls}
                >
                  <ThemedText style={styles.dataButtonText}>
                    Reset API URLs
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
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  preferenceItem: {
    padding: 12,
    borderTopWidth: 0.5,
    borderTopColor: '#CCCCCC',
  },
  preferenceKey: {
    fontWeight: 'bold',
    marginBottom: 4,
  },
  preferenceDescription: {
    fontSize: 12,
    opacity: 0.7,
    marginBottom: 4,
  },
  preferenceValue: {
    fontSize: 12,
  },
  loginButton: {
    marginTop: 12,
  },
  resetButton: {
    marginTop: 12,
    backgroundColor: '#8E8E93',
  },
  webViewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
    backgroundColor: '#f9f9f9',
  },
  closeButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(200, 200, 200, 0.3)',
  },
  webViewTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginRight: 40, // To balance the close button
  },
}); 