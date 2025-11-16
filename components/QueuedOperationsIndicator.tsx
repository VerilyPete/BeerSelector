/**
 * QueuedOperationsIndicator Component
 *
 * Displays a badge/indicator when operations are queued, showing:
 * - Count of pending operations
 * - Retrying status
 * - Tap to open modal with details
 *
 * This component is typically displayed near the OfflineIndicator or in the tab bar.
 *
 * @example
 * ```tsx
 * import { QueuedOperationsIndicator } from '@/components/QueuedOperationsIndicator';
 *
 * <QueuedOperationsIndicator onPress={() => setModalVisible(true)} />
 * ```
 */

import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useOperationQueue } from '@/context/OperationQueueContext';
import { OperationStatus } from '@/src/types/operationQueue';
import { useColorScheme } from '@/hooks/useColorScheme';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface QueuedOperationsIndicatorProps {
  /** Callback when indicator is tapped */
  onPress?: () => void;

  /** Whether to show the indicator even if no operations are queued */
  alwaysShow?: boolean;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const QueuedOperationsIndicator: React.FC<QueuedOperationsIndicatorProps> = ({
  onPress,
  alwaysShow = false,
}) => {
  const { queuedOperations, isRetrying } = useOperationQueue();
  const colorScheme = useColorScheme();

  // Calculate counts
  const { pendingCount, failedCount, totalCount } = useMemo(() => {
    const pending = queuedOperations.filter((op) => op.status === OperationStatus.PENDING).length;
    const failed = queuedOperations.filter((op) => op.status === OperationStatus.FAILED).length;
    const total = queuedOperations.length;

    return {
      pendingCount: pending,
      failedCount: failed,
      totalCount: total,
    };
  }, [queuedOperations]);

  // Don't show if no operations and not set to always show
  if (totalCount === 0 && !alwaysShow) {
    return null;
  }

  // Determine colors based on theme
  const isDark = colorScheme === 'dark';
  const backgroundColor = isDark ? '#1a1a1a' : '#f5f5f5';
  const textColor = isDark ? '#ffffff' : '#000000';
  const accentColor = failedCount > 0 ? '#ff4444' : '#4CAF50';
  const borderColor = isDark ? '#333' : '#ddd';

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      style={[
        styles.container,
        {
          backgroundColor,
          borderColor,
        },
      ]}
      accessibilityLabel={`${pendingCount} queued operations`}
      accessibilityRole="button"
    >
      <View style={styles.content}>
        {/* Icon or spinner */}
        {isRetrying ? (
          <ActivityIndicator size="small" color={accentColor} style={styles.icon} />
        ) : (
          <View style={[styles.badge, { backgroundColor: accentColor }]}>
            <Text style={styles.badgeText}>{totalCount}</Text>
          </View>
        )}

        {/* Text */}
        <View style={styles.textContainer}>
          <Text style={[styles.title, { color: textColor }]}>
            {isRetrying ? 'Retrying...' : 'Queued Operations'}
          </Text>
          <Text style={[styles.subtitle, { color: textColor, opacity: 0.7 }]}>
            {pendingCount > 0 && `${pendingCount} pending`}
            {pendingCount > 0 && failedCount > 0 && ' • '}
            {failedCount > 0 && `${failedCount} failed`}
            {pendingCount === 0 && failedCount === 0 && 'No pending operations'}
          </Text>
        </View>

        {/* Arrow indicator if tappable */}
        {onPress && (
          <Text style={[styles.arrow, { color: textColor, opacity: 0.5 }]}>›</Text>
        )}
      </View>
    </TouchableOpacity>
  );
};

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    borderWidth: 1,
    marginHorizontal: 16,
    marginVertical: 8,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  icon: {
    marginRight: 12,
  },
  badge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 12,
  },
  arrow: {
    fontSize: 24,
    fontWeight: '300',
    marginLeft: 8,
  },
});
