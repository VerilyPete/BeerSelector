/**
 * QueuedOperationsModal Component
 *
 * Displays a modal with list of queued operations, allowing users to:
 * - View all queued operations with details
 * - Manually retry individual operations
 * - Clear individual operations
 * - View retry status (pending, retrying, failed, success)
 *
 * @example
 * ```tsx
 * import { QueuedOperationsModal } from '@/components/QueuedOperationsModal';
 *
 * <QueuedOperationsModal
 *   visible={modalVisible}
 *   onClose={() => setModalVisible(false)}
 * />
 * ```
 */

import React from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useOperationQueue } from '@/context/OperationQueueContext';
import {
  OperationType,
  OperationStatus,
  QueuedOperation,
  isCheckInBeerPayload,
} from '@/src/types/operationQueue';
import { useThemeColor } from '@/hooks/useThemeColor';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

type QueuedOperationsModalProps = {
  /** Whether the modal is visible */
  visible: boolean;

  /** Callback when modal is closed */
  onClose: () => void;
};

// ============================================================================
// COMPONENT
// ============================================================================

export const QueuedOperationsModal: React.FC<QueuedOperationsModalProps> = ({
  visible,
  onClose,
}) => {
  const { queuedOperations, isRetrying, retryOperation, deleteOperation, clearQueue, retryConfig } =
    useOperationQueue();

  // Theme colors
  const backgroundColor = useThemeColor({}, 'backgroundElevated');
  const textColor = useThemeColor({}, 'text');
  const borderColor = useThemeColor({}, 'border');
  const modalBackground = useThemeColor({}, 'overlay');
  const backgroundSecondary = useThemeColor({}, 'backgroundSecondary');
  const warningColor = useThemeColor({}, 'warning');
  const infoColor = useThemeColor({}, 'info');
  const successColor = useThemeColor({}, 'success');
  const errorColor = useThemeColor({}, 'error');
  const textOnPrimary = useThemeColor({}, 'textOnPrimary');
  const textOnStatus = useThemeColor({}, 'textOnStatus');

  /**
   * Get human-readable operation type name
   */
  const getOperationTypeName = (type: OperationType): string => {
    switch (type) {
      case OperationType.CHECK_IN_BEER:
        return 'Check-in Beer';
      case OperationType.ADD_TO_REWARD_QUEUE:
        return 'Redeem Reward';
      case OperationType.REFRESH_ALL_DATA:
        return 'Refresh Data';
      case OperationType.REFRESH_REWARDS:
        return 'Refresh Rewards';
      case OperationType.UPDATE_PREFERENCES:
        return 'Update Settings';
      default:
        return type;
    }
  };

  /**
   * Get operation details for display
   */
  const getOperationDetails = (operation: QueuedOperation): string => {
    switch (operation.type) {
      case OperationType.CHECK_IN_BEER:
        if (isCheckInBeerPayload(operation.payload)) {
          return `${operation.payload.beerName} at ${operation.payload.storeName}`;
        }
        return 'Beer check-in';

      case OperationType.ADD_TO_REWARD_QUEUE:
        return 'Reward redemption';

      default:
        return 'Operation';
    }
  };

  /**
   * Get status color (uses theme-aware colors)
   */
  const getStatusColor = (status: OperationStatus): string => {
    switch (status) {
      case OperationStatus.PENDING:
        return warningColor;
      case OperationStatus.RETRYING:
        return infoColor;
      case OperationStatus.SUCCESS:
        return successColor;
      case OperationStatus.FAILED:
        return errorColor;
      default:
        return borderColor;
    }
  };

  /**
   * Get status text
   */
  const getStatusText = (status: OperationStatus): string => {
    switch (status) {
      case OperationStatus.PENDING:
        return 'Pending';
      case OperationStatus.RETRYING:
        return 'Retrying...';
      case OperationStatus.SUCCESS:
        return 'Success';
      case OperationStatus.FAILED:
        return 'Failed';
      default:
        return status;
    }
  };

  /**
   * Format timestamp
   */
  const formatTimestamp = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    // Less than 1 minute
    if (diff < 60000) {
      return 'Just now';
    }

    // Less than 1 hour
    if (diff < 3600000) {
      const minutes = Math.floor(diff / 60000);
      return `${minutes}m ago`;
    }

    // Less than 1 day
    if (diff < 86400000) {
      const hours = Math.floor(diff / 3600000);
      return `${hours}h ago`;
    }

    // Format as date
    return date.toLocaleDateString();
  };

  /**
   * Handle retry operation
   */
  const handleRetry = async (id: string) => {
    try {
      await retryOperation(id);
      Alert.alert('Success', 'Operation retry initiated');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      Alert.alert(
        'Retry Failed',
        `Could not retry operation: ${errorMessage}\n\nPlease check your connection and try again.`
      );
    }
  };

  /**
   * Handle delete operation
   */
  const handleDelete = (id: string) => {
    Alert.alert('Delete Operation', 'Are you sure you want to delete this queued operation?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteOperation(id);
            Alert.alert('Deleted', 'Operation removed from queue');
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

            Alert.alert('Delete Failed', `Could not delete operation: ${errorMessage}`);
          }
        },
      },
    ]);
  };

  /**
   * Handle clear all
   */
  const handleClearAll = () => {
    Alert.alert('Clear Queue', 'Are you sure you want to clear all queued operations?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear All',
        style: 'destructive',
        onPress: async () => {
          try {
            await clearQueue();
            onClose();
          } catch (error) {
            Alert.alert('Error', 'Failed to clear queue. Please try again.');
          }
        },
      },
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={[styles.modalOverlay, { backgroundColor: modalBackground }]}>
        <View style={[styles.modalContent, { backgroundColor }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: borderColor }]}>
            <Text style={[styles.title, { color: textColor }]}>Queued Operations</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={[styles.closeButtonText, { color: textColor }]}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Info */}
          <View style={[styles.infoContainer, { backgroundColor: backgroundSecondary }]}>
            <Text style={[styles.infoText, { color: textColor }]}>
              Operations will automatically retry when connection is restored.
            </Text>
            <Text style={[styles.infoText, { color: textColor, opacity: 0.7 }]}>
              Max retries: {retryConfig.maxRetries}
            </Text>
          </View>

          {/* Operations list */}
          <ScrollView style={styles.scrollView}>
            {queuedOperations.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={[styles.emptyText, { color: textColor, opacity: 0.5 }]}>
                  No queued operations
                </Text>
              </View>
            ) : (
              queuedOperations.map(operation => (
                <View
                  key={operation.id}
                  style={[
                    styles.operationCard,
                    { backgroundColor: backgroundSecondary, borderColor },
                  ]}
                >
                  {/* Operation header */}
                  <View style={styles.operationHeader}>
                    <View style={styles.operationTitleContainer}>
                      <Text style={[styles.operationType, { color: textColor }]}>
                        {getOperationTypeName(operation.type)}
                      </Text>
                      <View
                        style={[
                          styles.statusBadge,
                          { backgroundColor: getStatusColor(operation.status) },
                        ]}
                      >
                        <Text style={[styles.statusText, { color: textOnStatus }]}>
                          {getStatusText(operation.status)}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.timestamp, { color: textColor, opacity: 0.6 }]}>
                      {formatTimestamp(operation.timestamp)}
                    </Text>
                  </View>

                  {/* Operation details */}
                  <Text style={[styles.operationDetails, { color: textColor, opacity: 0.8 }]}>
                    {getOperationDetails(operation)}
                  </Text>

                  {/* Retry info */}
                  {operation.retryCount > 0 && (
                    <Text style={[styles.retryInfo, { color: textColor, opacity: 0.6 }]}>
                      Retries: {operation.retryCount}/{retryConfig.maxRetries}
                    </Text>
                  )}

                  {/* Error message */}
                  {operation.errorMessage && (
                    <Text style={[styles.errorMessage, { color: errorColor }]}>
                      {operation.errorMessage}
                    </Text>
                  )}

                  {/* Actions */}
                  <View style={styles.actions}>
                    {operation.status !== OperationStatus.RETRYING && (
                      <TouchableOpacity
                        onPress={() => handleRetry(operation.id)}
                        style={[styles.actionButton, { backgroundColor: infoColor }]}
                        disabled={isRetrying}
                      >
                        <Text style={[styles.actionButtonText, { color: textOnPrimary }]}>
                          Retry
                        </Text>
                      </TouchableOpacity>
                    )}
                    {operation.status === OperationStatus.RETRYING && (
                      <ActivityIndicator size="small" color={infoColor} />
                    )}
                    <TouchableOpacity
                      onPress={() => handleDelete(operation.id)}
                      style={[styles.actionButton, { backgroundColor: errorColor }]}
                      disabled={isRetrying}
                    >
                      <Text style={[styles.actionButtonText, { color: textOnPrimary }]}>
                        Delete
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </ScrollView>

          {/* Footer */}
          {queuedOperations.length > 0 && (
            <View style={[styles.footer, { borderTopColor: borderColor }]}>
              <TouchableOpacity
                onPress={handleClearAll}
                style={[styles.clearButton, { backgroundColor: errorColor }]}
                disabled={isRetrying}
              >
                <Text style={[styles.clearButtonText, { color: textOnPrimary }]}>Clear All</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContent: {
    maxHeight: '80%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    fontSize: 24,
    fontWeight: '300',
  },
  infoContainer: {
    padding: 12,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 8,
  },
  infoText: {
    fontSize: 12,
    marginBottom: 4,
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
  },
  operationCard: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
  },
  operationHeader: {
    marginBottom: 8,
  },
  operationTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  operationType: {
    fontSize: 16,
    fontWeight: '600',
    marginRight: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusText: {
    // Color applied dynamically via textOnStatus theme token for contrast on colored badge backgrounds
    fontSize: 10,
    fontWeight: 'bold',
  },
  timestamp: {
    fontSize: 12,
  },
  operationDetails: {
    fontSize: 14,
    marginBottom: 4,
  },
  retryInfo: {
    fontSize: 12,
    marginBottom: 4,
  },
  errorMessage: {
    fontSize: 12,
    marginBottom: 8,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
  },
  clearButton: {
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  clearButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
});
