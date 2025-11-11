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

/**
 * Error boundary component for catching React component errors
 *
 * Note: This is a class component because React Error Boundaries
 * must be class components (they use lifecycle methods).
 * The dark mode styling is provided via a functional wrapper component.
 */
class ErrorBoundaryInner extends Component<ErrorBoundaryProps & { colorScheme: 'light' | 'dark' }, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps & { colorScheme: 'light' | 'dark' }) {
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
    const { showStack, colorScheme } = this.props;
    const { error, errorInfo } = this.state;
    const isDark = colorScheme === 'dark';

    if (!showStack) {
      return null;
    }

    return (
      <View style={styles.detailsContainer}>
        {error?.stack && (
          <View style={styles.stackContainer}>
            <Text style={[
              styles.detailsTitle,
              { color: isDark ? '#ECEDEE' : '#333' }
            ]}>
              Stack Trace:
            </Text>
            <ScrollView style={[
              styles.stackScroll,
              {
                backgroundColor: isDark ? '#1e1e1e' : '#fff',
                borderColor: isDark ? '#333' : '#ddd',
              }
            ]}>
              <Text style={[
                styles.stackText,
                { color: isDark ? '#d4d4d4' : '#444' }
              ]}>
                {error.stack}
              </Text>
            </ScrollView>
          </View>
        )}

        {errorInfo?.componentStack && (
          <View style={styles.stackContainer}>
            <Text style={[
              styles.detailsTitle,
              { color: isDark ? '#ECEDEE' : '#333' }
            ]}>
              Component Stack:
            </Text>
            <ScrollView style={[
              styles.stackScroll,
              {
                backgroundColor: isDark ? '#1e1e1e' : '#fff',
                borderColor: isDark ? '#333' : '#ddd',
              }
            ]}>
              <Text style={[
                styles.stackText,
                { color: isDark ? '#d4d4d4' : '#444' }
              ]}>
                {errorInfo.componentStack}
              </Text>
            </ScrollView>
          </View>
        )}
      </View>
    );
  }

  render(): ReactNode {
    const { colorScheme } = this.props;
    const isDark = colorScheme === 'dark';

    if (this.state.hasError) {
      const { fallbackMessage } = this.props;
      const errorMessage = this.getErrorMessage();
      const errorType = this.getErrorType();

      return (
        <SafeAreaView style={[
          styles.container,
          { backgroundColor: isDark ? '#151718' : '#f5f5f5' }
        ]}>
          <View style={styles.content}>
            {this.renderErrorIcon()}

            <Text style={[
              styles.title,
              { color: isDark ? '#ECEDEE' : '#333' }
            ]}>
              Something went wrong
            </Text>

            {fallbackMessage && (
              <Text style={[
                styles.customMessage,
                { color: isDark ? '#d4d4d4' : '#555' }
              ]}>
                {fallbackMessage}
              </Text>
            )}

            <Text style={[
              styles.errorMessage,
              { color: isDark ? '#b8b8b8' : '#666' }
            ]}>
              {errorMessage}
            </Text>

            {errorType && errorType !== 'Error' && (
              <Text style={[
                styles.errorType,
                { color: isDark ? '#999' : '#888' }
              ]}>
                Error Type: {errorType}
              </Text>
            )}

            <TouchableOpacity
              style={[
                styles.retryButton,
                { backgroundColor: isDark ? '#0a84ff' : '#007AFF' }
              ]}
              onPress={this.handleReset}
              activeOpacity={0.7}
            >
              <Text style={styles.retryButtonText}>Try Again</Text>
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
 * Functional wrapper component that provides color scheme to the class-based ErrorBoundary
 */
export default function ErrorBoundary(props: ErrorBoundaryProps) {
  const colorScheme = useColorScheme() ?? 'light';
  return <ErrorBoundaryInner {...props} colorScheme={colorScheme} />;
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
    color: '#fff',
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
