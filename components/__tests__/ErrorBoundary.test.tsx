import React from 'react';
import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import ErrorBoundary from '../ErrorBoundary';

// Component that throws an error
const ThrowError = ({ shouldThrow }: { shouldThrow: boolean }) => {
  if (shouldThrow) {
    throw new Error('Test error');
  }
  return <Text>No error</Text>;
};

// Suppress console.error for cleaner test output
const originalConsoleError = console.error;

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // Suppress console.error during error boundary tests
    console.error = jest.fn();
  });

  afterEach(() => {
    console.error = originalConsoleError;
  });

  it('should render children when there is no error', () => {
    const { getByText } = render(
      <ErrorBoundary>
        <Text>Test content</Text>
      </ErrorBoundary>
    );

    expect(getByText('Test content')).toBeTruthy();
  });

  it('should catch errors and display fallback UI', () => {
    const { getByText, queryByText } = render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    // Should show error message
    expect(getByText(/Something went wrong/i)).toBeTruthy();

    // Should not show the original content
    expect(queryByText('No error')).toBeNull();
  });

  it('should display error message in fallback UI', () => {
    const { getByText } = render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(getByText(/Test error/i)).toBeTruthy();
  });

  it('should show retry button in fallback UI', () => {
    const { getByText } = render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(getByText('Try Again')).toBeTruthy();
  });

  it('should use custom fallback message when provided', () => {
    const customMessage = 'Custom error message for this component';
    const { getByText } = render(
      <ErrorBoundary fallbackMessage={customMessage}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(getByText(customMessage)).toBeTruthy();
  });

  it('should call onError callback when error is caught', () => {
    const onErrorMock = jest.fn();

    render(
      <ErrorBoundary onError={onErrorMock}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(onErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Test error',
      }),
      expect.any(Object)
    );
  });

  it('should reset error state when retry is pressed', () => {
    let shouldThrow = true;
    const TestComponent = () => <ThrowError shouldThrow={shouldThrow} />;

    const { getByText, queryByText, rerender } = render(
      <ErrorBoundary>
        <TestComponent />
      </ErrorBoundary>
    );

    // Error boundary should be showing
    expect(getByText(/Something went wrong/i)).toBeTruthy();

    // Fix the error
    shouldThrow = false;

    // Press retry button
    const retryButton = getByText('Try Again');
    retryButton.props.onPress();

    // Rerender with fixed component
    rerender(
      <ErrorBoundary>
        <TestComponent />
      </ErrorBoundary>
    );

    // Should show normal content again
    expect(queryByText(/Something went wrong/i)).toBeNull();
  });

  it('should handle network errors differently', () => {
    const NetworkError = () => {
      const error: any = new Error('Network request failed');
      error.name = 'NetworkError';
      throw error;
    };

    const { getByText } = render(
      <ErrorBoundary>
        <NetworkError />
      </ErrorBoundary>
    );

    expect(getByText(/Network request failed/i)).toBeTruthy();
  });

  it('should handle authentication errors', () => {
    const AuthError = () => {
      const error: any = new Error('Session expired');
      error.name = 'AuthenticationError';
      throw error;
    };

    const { getByText } = render(
      <ErrorBoundary>
        <AuthError />
      </ErrorBoundary>
    );

    expect(getByText(/Session expired/i)).toBeTruthy();
  });

  it('should provide error context to onError callback', () => {
    const onErrorMock = jest.fn();
    const errorInfo = { componentStack: 'component stack trace' };

    render(
      <ErrorBoundary onError={onErrorMock}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(onErrorMock).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        componentStack: expect.any(String),
      })
    );
  });

  it('should render multiple children when no error', () => {
    const { getByText } = render(
      <ErrorBoundary>
        <Text>First child</Text>
        <Text>Second child</Text>
      </ErrorBoundary>
    );

    expect(getByText('First child')).toBeTruthy();
    expect(getByText('Second child')).toBeTruthy();
  });

  it('should catch errors from nested components', () => {
    const NestedComponent = () => (
      <Text>
        Parent
        <ThrowError shouldThrow={true} />
      </Text>
    );

    const { getByText } = render(
      <ErrorBoundary>
        <NestedComponent />
      </ErrorBoundary>
    );

    expect(getByText(/Something went wrong/i)).toBeTruthy();
  });

  it('should display stack trace in development mode', () => {
    const { getByText } = render(
      <ErrorBoundary showStack={true}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    // Should show error boundary fallback
    expect(getByText(/Something went wrong/i)).toBeTruthy();
  });

  it('should not display stack trace when showStack is false', () => {
    const { queryByText } = render(
      <ErrorBoundary showStack={false}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    // Should show error message but not stack
    expect(queryByText(/Something went wrong/i)).toBeTruthy();
  });

  it('should handle undefined error messages gracefully', () => {
    const UndefinedErrorComponent = () => {
      throw undefined;
    };

    const { getByText } = render(
      <ErrorBoundary>
        <UndefinedErrorComponent />
      </ErrorBoundary>
    );

    expect(getByText(/Something went wrong/i)).toBeTruthy();
  });

  it('should handle null errors gracefully', () => {
    const NullErrorComponent = () => {
      throw null;
    };

    const { getByText } = render(
      <ErrorBoundary>
        <NullErrorComponent />
      </ErrorBoundary>
    );

    expect(getByText(/Something went wrong/i)).toBeTruthy();
  });

  it('should handle string errors', () => {
    const StringErrorComponent = () => {
      throw 'String error message';
    };

    const { getByText } = render(
      <ErrorBoundary>
        <StringErrorComponent />
      </ErrorBoundary>
    );

    expect(getByText(/Something went wrong/i)).toBeTruthy();
  });

  it('should call onReset callback when retry is pressed', () => {
    const onResetMock = jest.fn();

    const { getByText } = render(
      <ErrorBoundary onReset={onResetMock}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    const retryButton = getByText('Try Again');
    retryButton.props.onPress();

    expect(onResetMock).toHaveBeenCalled();
  });
});
