/**
 * ErrorBoundary Component
 *
 * React error boundary for catching and handling component errors gracefully.
 * Provides user-friendly error messages with retry functionality.
 * Supports dark mode for better user experience.
 *
 * @example
 * <ErrorBoundary
 *   fallbackMessage="Failed to load beer list"
 *   onError={(error) => logError(error, { operation: 'renderBeerList' })}
 * >
 *   <BeerList />
 * </ErrorBoundary>
 */

import React, { Component, ReactNode, ErrorInfo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { logError } from '../src/utils/errorLogger';
import { Colors } from '@/constants/Colors';

interface ErrorBoundaryProps {
  /** Content to render when no error occurs */
  children: ReactNode;
  /** Custom message to display in error state */
  fallbackMessage?: string;
  /** Callback when error is caught */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** Callback when retry button is pressed */
  onReset?: () => void;
  /** Whether to show stack trace (useful in development) */
  showStack?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/** Theme colors interface passed from wrapper */
interface ThemeColors {
  text: string;
  textSecondary: string;
  textMuted: string;
  background: string;
  backgroundElevated: string;
  border: string;
  tint: string;
  textOnPrimary: string;
}

/**
 * Error boundary component for catching React component errors
 *
 * Note: This is a class component because React Error Boundaries
 * must be class components (they use lifecycle methods).
 * The dark mode styling is provided via a functional wrapper component.
 */
class ErrorBoundaryInner extends Component<
  ErrorBoundaryProps & { colors: ThemeColors },
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps & { colors: ThemeColors }) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log the error with context
    logError(error, {
      operation: 'React Component Render',
      component: 'ErrorBoundary',
      additionalData: {
        componentStack: errorInfo.componentStack,
      },
    });

    // Update state with error info
    this.setState({
      errorInfo,
    });

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleReset = (): void => {
    // Reset error state
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });

    // Call custom reset handler if provided
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  getErrorMessage(): string {
    const { error } = this.state;

    if (!error) {
      return 'An unknown error occurred';
    }

    if (typeof error === 'string') {
      return error;
    }

    if (error instanceof Error) {
      return error.message || 'An error occurred';
    }

    return 'An unknown error occurred';
  }

  getErrorType(): string | null {
    const { error } = this.state;

    if (error instanceof Error && error.name) {
      return error.name;
    }

    return null;
  }

  renderErrorIcon(): ReactNode {
    const errorType = this.getErrorType();

    // Different icons/colors for different error types
    if (errorType === 'NetworkError') {
      return <Text style={styles.errorIcon}>📡</Text>;
    }

    if (errorType === 'AuthenticationError') {
      return <Text style={styles.errorIcon}>🔒</Text>;
    }

    return <Text style={styles.errorIcon}>⚠️</Text>;
  }

  renderErrorDetails(): ReactNode {
    const { showStack, colors } = this.props;
    const { error, errorInfo } = this.state;

    if (!showStack) {
      return null;
    }

    return (
      <View style={styles.detailsContainer}>
        {error?.stack && (
          <View style={styles.stackContainer}>
            <Text style={[styles.detailsTitle, { color: colors.text }]}>Stack Trace:</Text>
            <ScrollView
              style={[
                styles.stackScroll,
                {
                  backgroundColor: colors.backgroundElevated,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text style={[styles.stackText, { color: colors.textSecondary }]}>{error.stack}</Text>
            </ScrollView>
          </View>
        )}

        {errorInfo?.componentStack && (
          <View style={styles.stackContainer}>
            <Text style={[styles.detailsTitle, { color: colors.text }]}>Component Stack:</Text>
            <ScrollView
              style={[
                styles.stackScroll,
                {
                  backgroundColor: colors.backgroundElevated,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text style={[styles.stackText, { color: colors.textSecondary }]}>
                {errorInfo.componentStack}
              </Text>
            </ScrollView>
          </View>
        )}
      </View>
    );
  }

  render(): ReactNode {
    const { colors } = this.props;

    if (this.state.hasError) {
      const { fallbackMessage } = this.props;
      const errorMessage = this.getErrorMessage();
      const errorType = this.getErrorType();

      return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
          <View style={styles.content}>
            {this.renderErrorIcon()}

            <Text style={[styles.title, { color: colors.text }]}>Something went wrong</Text>

            {fallbackMessage && (
              <Text style={[styles.customMessage, { color: colors.textSecondary }]}>
                {fallbackMessage}
              </Text>
            )}

            <Text style={[styles.errorMessage, { color: colors.textMuted }]}>{errorMessage}</Text>

            {errorType && errorType !== 'Error' && (
              <Text style={[styles.errorType, { color: colors.textMuted }]}>
                Error Type: {errorType}
              </Text>
            )}

            <TouchableOpacity
              style={[styles.retryButton, { backgroundColor: colors.tint }]}
              onPress={this.handleReset}
              activeOpacity={0.7}
            >
              <Text style={[styles.retryButtonText, { color: colors.textOnPrimary }]}>
                Try Again
              </Text>
            </TouchableOpacity>

            {this.renderErrorDetails()}
          </View>
        </SafeAreaView>
      );
    }

    return this.props.children;
  }
}

/**
 * Functional wrapper component that provides theme colors to the class-based ErrorBoundary
 */
export default function ErrorBoundary(props: ErrorBoundaryProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const colors: ThemeColors = {
    text: Colors[colorScheme].text,
    textSecondary: Colors[colorScheme].textSecondary,
    textMuted: Colors[colorScheme].textMuted,
    background: Colors[colorScheme].background,
    backgroundElevated: Colors[colorScheme].backgroundElevated,
    border: Colors[colorScheme].border,
    tint: Colors[colorScheme].tint,
    textOnPrimary: Colors[colorScheme].textOnPrimary,
  };
  return <ErrorBoundaryInner {...props} colors={colors} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  content: {
    alignItems: 'center',
    maxWidth: 400,
    width: '100%',
  },
  errorIcon: {
    fontSize: 64,
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  customMessage: {
    fontSize: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 14,
    marginBottom: 8,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  errorType: {
    fontSize: 12,
    marginBottom: 20,
    fontStyle: 'italic',
  },
  retryButton: {
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  detailsContainer: {
    marginTop: 24,
    width: '100%',
  },
  stackContainer: {
    marginTop: 16,
    width: '100%',
  },
  detailsTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  stackScroll: {
    maxHeight: 200,
    borderRadius: 4,
    borderWidth: 1,
    padding: 8,
  },
  stackText: {
    fontSize: 11,
    fontFamily: 'monospace',
  },
});
