import React, { useEffect } from 'react';
import { StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router, useLocalSearchParams } from 'expo-router';
import { IconSymbol } from '@/components/ui/IconSymbol';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/Colors';
import { spacing, borderRadii } from '@/constants/spacing';

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
  // Safe area insets for proper positioning
  const insets = useSafeAreaInsets();

  // Theme colors
  const tintColor = useThemeColor({}, 'tint');
  const colorScheme = useColorScheme() ?? 'light';
  const backgroundSecondaryColor = useThemeColor(
    { light: Colors.light.backgroundSecondary, dark: Colors.dark.backgroundSecondary },
    'background'
  );
  const closeButtonBgColor = useThemeColor(
    { light: 'rgba(120, 120, 128, 0.12)', dark: 'rgba(120, 120, 128, 0.32)' },
    'background'
  );

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
    <ThemedView style={[styles.container, { backgroundColor: backgroundSecondaryColor }]}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />

      {/* Login WebView Modal */}
      <LoginWebView
        visible={loginWebViewVisible}
        onLoginSuccess={handleLoginSuccess}
        onLoginCancel={handleLoginCancel}
        onRefreshData={handleRefresh}
        loading={isLoggingIn}
      />

      {/* Back button - only show if not first login and we can go back */}
      {!isFirstLogin && canGoBack && (
        <TouchableOpacity
          testID="back-button"
          style={[styles.backButton, { backgroundColor: closeButtonBgColor, top: insets.top + 12 }]}
          onPress={() => router.back()}
        >
          <IconSymbol name="xmark" size={16} color={tintColor} weight="semibold" />
        </TouchableOpacity>
      )}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + spacing.m }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Title Section */}
        <ThemedText type="title" style={styles.pageTitle}>
          Settings
        </ThemedText>

        {/* Welcome Section - First Login Only */}
        {isFirstLogin && (
          <WelcomeSection
            onLogin={startMemberLogin}
            loginLoading={isLoggingIn}
            refreshing={refreshing}
          />
        )}

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
          />
        )}

        {/* About Section */}
        <AboutSection />

        {/* Developer Tools Section - Only visible in development mode */}
        <DeveloperSection />
      </ScrollView>
    </ThemedView>
  );
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
    paddingBottom: spacing.xxl,
  },
  backButton: {
    position: 'absolute',
    right: spacing.m,
    zIndex: 10,
    width: 30,
    height: 30,
    borderRadius: borderRadii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageTitle: {
    fontSize: 34,
    fontWeight: '700',
    marginBottom: spacing.l,
    marginTop: spacing.xs,
  },
});
