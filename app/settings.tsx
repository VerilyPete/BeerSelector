import React, { useEffect } from 'react';
import { StyleSheet, TouchableOpacity, View, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router, useLocalSearchParams } from 'expo-router';
import { IconSymbol } from '@/components/ui/IconSymbol';
import Constants from 'expo-constants';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useColorScheme } from '@/hooks/useColorScheme';
import { clearUntappdCookies } from '@/src/database/db';
import { createMockSession } from '@/src/api/mockSession';

// Import extracted components
import LoginWebView from '@/components/LoginWebView';
import UntappdLoginWebView from '@/components/UntappdLoginWebView';
import AboutSection from '@/components/settings/AboutSection';
import DataManagementSection from '@/components/settings/DataManagementSection';
import WelcomeSection from '@/components/settings/WelcomeSection';

// Import custom hooks
import { useLoginFlow } from '@/hooks/useLoginFlow';
import { useUntappdLogin } from '@/hooks/useUntappdLogin';
import { useSettingsState } from '@/hooks/useSettingsState';
import { useSettingsRefresh } from '@/hooks/useSettingsRefresh';

export default function SettingsScreen() {
  // Theme colors
  const tintColor = useThemeColor({}, 'tint');
  const colorScheme = useColorScheme() ?? 'light';
  const cardColor = useThemeColor({ light: '#F5F5F5', dark: '#1C1C1E' }, 'background');

  // URL search params
  const { action } = useLocalSearchParams<{ action?: string }>();

  // Custom hooks for state management
  const {
    apiUrlsConfigured,
    isFirstLogin,
    canGoBack,
    loadPreferences,
  } = useSettingsState();

  const { refreshing, handleRefresh } = useSettingsRefresh();

  const {
    isLoggingIn,
    loginWebViewVisible,
    startMemberLogin,
    handleLoginSuccess,
    handleLoginCancel,
  } = useLoginFlow({
    onRefreshData: async () => {
      await handleRefresh();
      await loadPreferences();
    },
  });

  const {
    untappdWebViewVisible,
    isUntappdLoggedIn,
    startUntappdLogin,
    handleUntappdLoginSuccess,
    handleUntappdLoginCancel,
    checkUntappdLoginStatus,
  } = useUntappdLogin();

  // Auto-open login dialog if action=login is in URL params
  useEffect(() => {
    if (action === 'login') {
      startMemberLogin();
    }
  }, [action, startMemberLogin]);

  // Handle Untappd logout
  const handleUntappdLogout = async () => {
    try {
      await clearUntappdCookies();
      await checkUntappdLoginStatus();
      Alert.alert(
        'Untappd Credentials Cleared',
        'Your cached Untappd session has been cleared. To fully log out:\n\n1. Press "Check Untappd" while viewing a beer\n2. Manually log out of Untappd from that session\n3. Re-login to Untappd from the settings page',
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.error('Error clearing Untappd credentials:', error);
      Alert.alert(
        'Error',
        'Failed to clear Untappd credentials. Please try again.',
        [{ text: 'OK' }]
      );
    }
  };

  // Dev-only: Create mock session
  const handleCreateMockSession = async () => {
    try {
      await createMockSession();
      Alert.alert('Success', 'Mock session created successfully!');
    } catch (error) {
      console.error('Failed to create mock session:', error);
      Alert.alert('Error', 'Failed to create mock session.');
    }
  };

  return (
    <ThemedView style={styles.container}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />

      {/* Login WebView Modal */}
      <LoginWebView
        visible={loginWebViewVisible}
        onLoginSuccess={handleLoginSuccess}
        onLoginCancel={handleLoginCancel}
        onRefreshData={handleRefresh}
        loading={isLoggingIn}
      />

      {/* Untappd WebView Modal */}
      <UntappdLoginWebView
        visible={untappdWebViewVisible}
        onLoginSuccess={handleUntappdLoginSuccess}
        onLoginCancel={handleUntappdLoginCancel}
        loading={false}
      />

      <SafeAreaView style={styles.safeArea} edges={['top', 'right', 'left']}>
        {/* Back button - only show if not first login and we can go back */}
        {!isFirstLogin && canGoBack && (
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <IconSymbol name="xmark" size={26} color={tintColor} />
          </TouchableOpacity>
        )}

        <ScrollView style={styles.scrollView}>
          <View style={styles.content}>
            {/* Title Section */}
            <View style={styles.titleSection}>
              <ThemedText type="title" style={styles.pageTitle}>Settings</ThemedText>
            </View>

            {/* Welcome Section - First Login Only */}
            {isFirstLogin && (
              <WelcomeSection
                onLogin={startMemberLogin}
                loginLoading={isLoggingIn}
                refreshing={refreshing}
                style={{ backgroundColor: cardColor }}
              />
            )}

            {/* About Section */}
            <AboutSection style={{ backgroundColor: cardColor }} />

            {/* Data Management Section */}
            {(!isFirstLogin || apiUrlsConfigured) && (
              <DataManagementSection
                apiUrlsConfigured={apiUrlsConfigured}
                refreshing={refreshing}
                onRefresh={handleRefresh}
                isFirstLogin={isFirstLogin}
                onLogin={startMemberLogin}
                isUntappdLoggedIn={isUntappdLoggedIn}
                onUntappdLogin={startUntappdLogin}
                onUntappdLogout={handleUntappdLogout}
                canGoBack={canGoBack}
                onGoHome={() => router.replace('/(tabs)')}
                style={{ backgroundColor: cardColor }}
              />
            )}

            {/* Development Section */}
            {Constants.expoConfig?.extra?.NODE_ENV === 'development' && (
              <View style={[styles.section, { backgroundColor: cardColor }]}>
                <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>Development</ThemedText>
                <View style={styles.infoContainer}>
                  <TouchableOpacity style={styles.devButton} onPress={handleCreateMockSession}>
                    <ThemedText style={styles.buttonText}>Create Mock Session</ThemedText>
                  </TouchableOpacity>
                </View>
              </View>
            )}
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
    top: 60,
    right: 20,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(200, 200, 200, 0.5)',
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
    padding: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  infoContainer: {
    paddingTop: 8,
  },
  devButton: {
    backgroundColor: '#E91E63',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});