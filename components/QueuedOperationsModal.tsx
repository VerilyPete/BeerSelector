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
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/Colors';

type QueuedOperationsModalProps = {
  visible: boolean;
  onClose: () => void;
};

export const QueuedOperationsModal: React.FC<QueuedOperationsModalProps> = ({
  visible,
  onClose,
}) => {
  const { queuedOperations, isRetrying, retryOperation, deleteOperation, clearQueue, retryConfig } =
    useOperationQueue();

  const colorScheme = useColorScheme() ?? 'dark';
  const colors = Colors[colorScheme];

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

  const getStatusColor = (status: OperationStatus): string => {
    switch (status) {
      case OperationStatus.PENDING:
        return colors.warning;
      case OperationStatus.RETRYING:
        return colors.info;
      case OperationStatus.SUCCESS:
        return colors.success;
      case OperationStatus.FAILED:
        return colors.error;
      default:
        return colors.border;
    }
  };

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

  const formatTimestamp = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    if (diff < 60000) {
      return 'Just now';
    }
    if (diff < 3600000) {
      const minutes = Math.floor(diff / 60000);
      return `${minutes}m ago`;
    }
    if (diff < 86400000) {
      const hours = Math.floor(diff / 3600000);
      return `${hours}h ago`;
    }
    return date.toLocaleDateString();
  };

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
      <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
        <View style={[styles.modalContent, { backgroundColor: colors.backgroundElevated }]}>
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.text }]}>Queued Operations</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={[styles.closeButtonText, { color: colors.text }]}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.infoContainer, { backgroundColor: colors.backgroundActive }]}>
            <Text style={[styles.infoText, { color: colors.text }]}>
              Operations will automatically retry when connection is restored.
            </Text>
            <Text style={[styles.infoText, { color: colors.textSecondary }]}>
              Max retries: {retryConfig.maxRetries}
            </Text>
          </View>

          <ScrollView style={styles.scrollView}>
            {queuedOperations.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                  No queued operations
                </Text>
              </View>
            ) : (
              queuedOperations.map(operation => (
                <View
                  key={operation.id}
                  style={[
                    styles.operationCard,
                    { backgroundColor: colors.backgroundActive, borderColor: colors.border },
                  ]}
                >
                  <View style={styles.operationHeader}>
                    <View style={styles.operationTitleContainer}>
                      <Text style={[styles.operationType, { color: colors.text }]}>
                        {getOperationTypeName(operation.type)}
                      </Text>
                      <View
                        style={[
                          styles.statusBadge,
                          { backgroundColor: getStatusColor(operation.status) },
                        ]}
                      >
                        <Text style={[styles.statusText, { color: colors.textOnStatus }]}>
                          {getStatusText(operation.status)}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.timestamp, { color: colors.textSecondary }]}>
                      {formatTimestamp(operation.timestamp)}
                    </Text>
                  </View>

                  <Text style={[styles.operationDetails, { color: colors.text }]}>
                    {getOperationDetails(operation)}
                  </Text>

                  {operation.retryCount > 0 && (
                    <Text style={[styles.retryInfo, { color: colors.textSecondary }]}>
                      Retries: {operation.retryCount}/{retryConfig.maxRetries}
                    </Text>
                  )}

                  {operation.errorMessage && (
                    <Text style={[styles.errorMessage, { color: colors.error }]}>
                      {operation.errorMessage}
                    </Text>
                  )}

                  <View style={styles.actions}>
                    {operation.status !== OperationStatus.RETRYING && (
                      <TouchableOpacity
                        onPress={() => handleRetry(operation.id)}
                        style={[styles.actionButton, { borderColor: colors.tint }]}
                        disabled={isRetrying}
                      >
                        <Text style={[styles.actionButtonText, { color: colors.tint }]}>
                          RETRY
                        </Text>
                      </TouchableOpacity>
                    )}
                    {operation.status === OperationStatus.RETRYING && (
                      <ActivityIndicator size="small" color={colors.tint} />
                    )}
                    <TouchableOpacity
                      onPress={() => handleDelete(operation.id)}
                      style={[styles.actionButton, { borderColor: colors.error }]}
                      disabled={isRetrying}
                    >
                      <Text style={[styles.actionButtonText, { color: colors.error }]}>
                        DELETE
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </ScrollView>

          {queuedOperations.length > 0 && (
            <View style={[styles.footer, { borderTopColor: colors.border }]}>
              <TouchableOpacity
                onPress={handleClearAll}
                style={[styles.clearButton, { borderColor: colors.error }]}
                disabled={isRetrying}
              >
                <Text style={[styles.clearButtonText, { color: colors.error }]}>CLEAR ALL</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContent: {
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  title: {
    fontFamily: 'Inter',
    fontSize: 18,
    fontWeight: '700',
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
  },
  infoText: {
    fontFamily: 'Space Mono',
    fontSize: 11,
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
    fontFamily: 'Space Mono',
    fontSize: 11,
  },
  operationCard: {
    padding: 12,
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
    fontFamily: 'Inter',
    fontSize: 15,
    fontWeight: '600',
    marginRight: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  statusText: {
    fontFamily: 'Inter',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1,
  },
  timestamp: {
    fontFamily: 'Space Mono',
    fontSize: 11,
  },
  operationDetails: {
    fontFamily: 'Inter',
    fontSize: 13,
    marginBottom: 4,
  },
  retryInfo: {
    fontFamily: 'Space Mono',
    fontSize: 11,
    marginBottom: 4,
  },
  errorMessage: {
    fontFamily: 'Space Mono',
    fontSize: 11,
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
    borderWidth: 1,
  },
  actionButtonText: {
    fontFamily: 'Inter',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 2,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
  },
  clearButton: {
    padding: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  clearButtonText: {
    fontFamily: 'Inter',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 2,
  },
});
