import React from 'react';
import { View, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';

/**
 * Props for WelcomeSection component
 */
interface WelcomeSectionProps {
  /**
   * Callback when user taps login button
   */
  onLogin: () => void;

  /**
   * Whether login is in progress (disables button)
   */
  loginLoading: boolean;

  /**
   * Whether any refresh is in progress (disables button)
   */
  refreshing: boolean;

  /**
   * Custom style for the container
   */
  style?: ViewStyle;

  /**
   * Test ID for testing
   */
  testID?: string;
}

/**
 * WelcomeSection Component
 *
 * Displays first-login welcome message with:
 * - Welcome title
 * - Instructional text
 * - Login button
 *
 * Shown only on first app launch before API URLs are configured.
 * Button is disabled during login or refresh operations.
 *
 * @example
 * ```tsx
 * <WelcomeSection
 *   onLogin={handleLogin}
 *   loginLoading={isLoggingIn}
 *   refreshing={refreshing}
 * />
 * ```
 */
export default function WelcomeSection({
  onLogin,
  loginLoading,
  refreshing,
  style,
  testID = 'welcome-section',
}: WelcomeSectionProps) {
  return (
    <ThemedView style={[styles.container, style]} testID={testID}>
      {/* Section Title */}
      <ThemedText style={styles.sectionTitle}>Welcome to Beer Selector</ThemedText>

      {/* Welcome Message */}
      <View style={styles.welcomeMessage}>
        <ThemedText style={styles.welcomeText}>
          Please log in to your UFO Club account or as a Visitor to start using the app.
        </ThemedText>

        {/* Login Button */}
        <TouchableOpacity
          testID="login-button"
          style={[
            styles.loginButton,
            (loginLoading || refreshing) && styles.loginButtonDisabled,
          ]}
          onPress={onLogin}
          disabled={loginLoading || refreshing}
          accessibilityRole="button"
          accessibilityLabel="Login to Flying Saucer"
          accessibilityHint="Opens login page to authenticate with Flying Saucer or continue as visitor"
          accessibilityState={{ disabled: loginLoading || refreshing }}
        >
          <ThemedText style={styles.loginButtonText}>
            {loginLoading ? 'Logging in...' : 'Login to Flying Saucer'}
          </ThemedText>
        </TouchableOpacity>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
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
  welcomeMessage: {
    alignItems: 'center',
  },
  welcomeText: {
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  loginButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    width: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  loginButtonDisabled: {
    opacity: 0.5,
  },
  loginButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
