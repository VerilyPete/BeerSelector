import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useColorScheme } from '@/hooks/useColorScheme';
import { OptimisticUpdateStatus } from '@/src/types/optimisticUpdate';
import { Colors } from '@/constants/Colors';

type OptimisticStatusBadgeProps = {
  status: OptimisticUpdateStatus;
  error?: string;
  onRetry?: () => void;
  onCancel?: () => void;
};

export const OptimisticStatusBadge: React.FC<OptimisticStatusBadgeProps> = ({
  status,
  error: _error,
  onRetry,
  onCancel,
}) => {
  const colorScheme = useColorScheme() ?? 'dark';
  const colors = Colors[colorScheme];

  const getStatusColors = () => {
    switch (status) {
      case OptimisticUpdateStatus.PENDING:
        return {
          bg: colors.warningBg,
          border: colors.warningBorder,
          text: colors.textOnStatus,
        };
      case OptimisticUpdateStatus.SYNCING:
        return {
          bg: colors.infoBg,
          border: colors.infoBorder,
          text: colors.textOnStatus,
        };
      case OptimisticUpdateStatus.SUCCESS:
        return {
          bg: colors.successBg,
          border: colors.successBorder,
          text: colors.textOnStatus,
        };
      case OptimisticUpdateStatus.FAILED:
        return {
          bg: colors.errorBg,
          border: colors.errorBorder,
          text: colors.textOnStatus,
        };
      default:
        return {
          bg: colors.backgroundSecondary,
          border: colors.border,
          text: colors.text,
        };
    }
  };

  const statusColors = getStatusColors();

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

  if (status === OptimisticUpdateStatus.SUCCESS) {
    return null;
  }

  const handlePress = () => {
    if (status === OptimisticUpdateStatus.FAILED && onRetry) {
      onRetry();
    }
  };

  const BadgeContent = (
    <View style={[styles.badge, { backgroundColor: statusColors.bg, borderColor: statusColors.border }]}>
      {status === OptimisticUpdateStatus.SYNCING && (
        <ActivityIndicator size="small" color={statusColors.text} style={styles.spinner} />
      )}

      <Text style={[styles.badgeText, { color: statusColors.text }]}>{getStatusText()}</Text>

      {status === OptimisticUpdateStatus.PENDING && onCancel && (
        <TouchableOpacity onPress={onCancel} style={styles.cancelButton}>
          <Text style={[styles.cancelText, { color: statusColors.text }]}>✕</Text>
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
    borderWidth: 1,
    marginTop: 8,
  },
  badgeText: {
    fontFamily: 'SpaceMono',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 2,
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
