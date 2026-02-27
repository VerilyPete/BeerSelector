/**
 * OptimisticStatusBadge - Visual indicator for optimistic update status
 *
 * Displays the current status of an optimistic update with appropriate
 * colors, icons, and animations.
 *
 * Statuses:
 * - PENDING: Yellow/orange badge with "Pending..." text
 * - SYNCING: Blue badge with "Syncing..." text and animated spinner
 * - SUCCESS: Green badge with checkmark (auto-hide after 1s)
 * - FAILED: Red badge with "Failed - Tap to Retry" text
 *
 * @example
 * ```tsx
 * <OptimisticStatusBadge
 *   status={OptimisticUpdateStatus.SYNCING}
 *   onRetry={() => retryCheckIn(beerId)}
 * />
 * ```
 */

import React from 'react';
import { StyleSheet, View, TouchableOpacity, ActivityIndicator } from 'react-native';
import { ThemedText } from '../ThemedText';
import { useColorScheme } from '@/hooks/useColorScheme';
import { OptimisticUpdateStatus } from '@/src/types/optimisticUpdate';
import { Colors } from '@/constants/Colors';

type OptimisticStatusBadgeProps = {
  /** Current status of the optimistic update */
  status: OptimisticUpdateStatus;

  /** Error message (for FAILED status) */
  error?: string;

  /** Callback when user taps to retry */
  onRetry?: () => void;

  /** Callback when user taps to rollback/cancel */
  onCancel?: () => void;
};

export const OptimisticStatusBadge: React.FC<OptimisticStatusBadgeProps> = ({
  status,
  error: _error,
  onRetry,
  onCancel,
}) => {
  const colorScheme = useColorScheme();

  // Color schemes for different statuses
  const getStatusColors = () => {
    const theme = colorScheme ?? 'light';
    const themeColors = Colors[theme];

    switch (status) {
      case OptimisticUpdateStatus.PENDING:
        return {
          bg: themeColors.warningBg,
          border: themeColors.warningBorder,
          text: themeColors.textOnStatus, // Always white on colored status backgrounds for visibility
        };

      case OptimisticUpdateStatus.SYNCING:
        return {
          bg: themeColors.infoBg,
          border: themeColors.infoBorder,
          text: themeColors.textOnStatus, // Always white on colored status backgrounds for visibility
        };

      case OptimisticUpdateStatus.SUCCESS:
        return {
          bg: themeColors.successBg,
          border: themeColors.successBorder,
          text: themeColors.textOnStatus, // Always white on colored status backgrounds for visibility
        };

      case OptimisticUpdateStatus.FAILED:
        return {
          bg: themeColors.errorBg,
          border: themeColors.errorBorder,
          text: themeColors.textOnStatus, // Always white on colored status backgrounds for visibility
        };

      default:
        return {
          bg: themeColors.backgroundSecondary,
          border: themeColors.border,
          text: themeColors.text,
        };
    }
  };

  const colors = getStatusColors();

  // Get status text
  const getStatusText = () => {
    switch (status) {
      case OptimisticUpdateStatus.PENDING:
        return 'Pending...';
      case OptimisticUpdateStatus.SYNCING:
        return 'Syncing...';
      case OptimisticUpdateStatus.SUCCESS:
        return 'Success!';
      case OptimisticUpdateStatus.FAILED:
        return onRetry ? 'Failed - Tap to Retry' : 'Failed';
      default:
        return 'Unknown';
    }
  };

  // Don't render success badge (it auto-hides)
  if (status === OptimisticUpdateStatus.SUCCESS) {
    return null;
  }

  const handlePress = () => {
    if (status === OptimisticUpdateStatus.FAILED && onRetry) {
      onRetry();
    }
  };

  const BadgeContent = (
    <View style={[styles.badge, { backgroundColor: colors.bg, borderColor: colors.border }]}>
      {status === OptimisticUpdateStatus.SYNCING && (
        <ActivityIndicator size="small" color={colors.text} style={styles.spinner} />
      )}

      <ThemedText style={[styles.badgeText, { color: colors.text }]}>{getStatusText()}</ThemedText>

      {status === OptimisticUpdateStatus.PENDING && onCancel && (
        <TouchableOpacity onPress={onCancel} style={styles.cancelButton}>
          <ThemedText style={[styles.cancelText, { color: colors.text }]}>✕</ThemedText>
        </TouchableOpacity>
      )}
    </View>
  );

  if (status === OptimisticUpdateStatus.FAILED && onRetry) {
    return (
      <TouchableOpacity onPress={handlePress} activeOpacity={0.7}>
        {BadgeContent}
      </TouchableOpacity>
    );
  }

  return BadgeContent;
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  spinner: {
    marginRight: 6,
  },
  cancelButton: {
    marginLeft: 8,
    padding: 2,
  },
  cancelText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
});
