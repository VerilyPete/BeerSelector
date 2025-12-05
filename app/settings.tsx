import React, { useEffect } from 'react';
import { StyleSheet, TouchableOpacity, View, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router, useLocalSearchParams } from 'expo-router';
import { IconSymbol } from '@/components/ui/IconSymbol';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useColorScheme } from '@/hooks/useColorScheme';
// Import extracted components
import LoginWebView from '@/components/LoginWebView';
import AboutSection from '@/components/settings/AboutSection';
import DataManagementSection from '@/components/settings/DataManagementSection';
import WelcomeSection from '@/components/settings/WelcomeSection';
import DeveloperSection from '@/components/settings/DeveloperSection';

// Import custom hooks
import { useLoginFlow } from '@/hooks/useLoginFlow';
import { useSettingsState } from '@/hooks/useSettingsState';
import { useSettingsRefresh } from '@/hooks/useSettingsRefresh';
import { useAppContext } from '@/context/AppContext';

export default function SettingsScreen() {
  // Theme colors
  const tintColor = useThemeColor({}, 'tint');
  const colorScheme = useColorScheme() ?? 'light';
  const cardColor = useThemeColor({ light: '#F5F5F5', dark: '#1C1C1E' }, 'background');

  // URL search params
  const { action } = useLocalSearchParams<{ action?: string }>();

  // App context for refreshing beer data and session
  const { refreshBeerData, refreshSession } = useAppContext();

  // Custom hooks for state management
  const { apiUrlsConfigured, isFirstLogin, canGoBack, loadPreferences } = useSettingsState();

  const { refreshing, handleRefresh } = useSettingsRefresh();

  const {
    isLoggingIn,
    loginWebViewVisible,
    startMemberLogin,
    handleLoginSuccess,
    handleLoginCancel,
  } = useLoginFlow({
    onRefreshData: async () => {
      // Silent mode: suppress success alerts during automatic login refresh
      await handleRefresh(true);
      await loadPreferences();
      // Reload session to update visitor mode status
      await refreshSession();
      // Reload beer data into AppContext after refresh
      await refreshBeerData();
    },
  });

  // Auto-open login dialog if action=login is in URL params
  useEffect(() => {
    if (action === 'login') {
      startMemberLogin();
    }
  }, [action, startMemberLogin]);

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

      <SafeAreaView style={styles.safeArea} edges={['top', 'right', 'left']}>
        {/* Back button - only show if not first login and we can go back */}
        {!isFirstLogin && canGoBack && (
          <TouchableOpacity
            testID="back-button"
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
              <ThemedText type="title" style={styles.pageTitle}>
                Settings
              </ThemedText>
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
                canGoBack={canGoBack}
                onGoHome={() => router.replace('/(tabs)')}
                style={{ backgroundColor: cardColor }}
              />
            )}

            {/* Developer Tools Section - Only visible in development mode */}
            <DeveloperSection cardColor={cardColor} tintColor={tintColor} />
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
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
