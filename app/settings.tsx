import React, { useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/Colors';

import LoginWebView from '@/components/LoginWebView';
import AboutSection from '@/components/settings/AboutSection';
import DataManagementSection from '@/components/settings/DataManagementSection';
import WelcomeSection from '@/components/settings/WelcomeSection';
import DeveloperSection from '@/components/settings/DeveloperSection';

import { useLoginFlow } from '@/hooks/useLoginFlow';
import { useSettingsState } from '@/hooks/useSettingsState';
import { useSettingsRefresh } from '@/hooks/useSettingsRefresh';
import { useAppContext } from '@/context/AppContext';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme() ?? 'dark';
  const colors = Colors[colorScheme];

  const { action } = useLocalSearchParams<{ action?: string }>();

  const { refreshBeerData, refreshSession } = useAppContext();

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
      await handleRefresh(true);
      await loadPreferences();
      await refreshSession();
      await refreshBeerData();
    },
  });

  useEffect(() => {
    if (action === 'login') {
      startMemberLogin();
    }
  }, [action, startMemberLogin]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />

      <LoginWebView
        visible={loginWebViewVisible}
        onLoginSuccess={handleLoginSuccess}
        onLoginCancel={handleLoginCancel}
        onRefreshData={handleRefresh}
        loading={isLoggingIn}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 16 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <Text style={[styles.pageTitle, { color: colors.text }]}>Settings</Text>
          {!isFirstLogin && canGoBack && (
            <TouchableOpacity
              testID="back-button"
              style={[styles.closeButton, { backgroundColor: colors.backgroundActive }]}
              onPress={() => router.back()}
            >
              <Ionicons name="close" size={16} color={colors.text} />
            </TouchableOpacity>
          )}
        </View>

        {isFirstLogin && (
          <WelcomeSection
            onLogin={startMemberLogin}
            loginLoading={isLoggingIn}
            refreshing={refreshing}
          />
        )}

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

        <AboutSection />

        <DeveloperSection />
      </ScrollView>
    </View>
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
    paddingHorizontal: 24,
    paddingBottom: 48,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 8,
  },
  pageTitle: {
    fontFamily: 'Inter',
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  closeButton: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
