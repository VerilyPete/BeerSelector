import React, { useEffect, useState, useCallback } from 'react';
import { StyleSheet, View, TouchableOpacity, Alert, ActivityIndicator, Modal, FlatList } from 'react-native';
import { ThemedText } from './ThemedText';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useUntappdColor } from '@/hooks/useUntappdColor';
import { useColorScheme } from '@/hooks/useColorScheme';
import { SearchBar } from './SearchBar';
import { checkInBeer } from '@/src/api/beerService';
import { router } from 'expo-router';
import { UntappdWebView } from './UntappdWebView';
import { useBeerFilters } from '@/hooks/useBeerFilters';
import { useDataRefresh } from '@/hooks/useDataRefresh';
import { FilterBar } from './beer/FilterBar';
import { BeerList } from './beer/BeerList';
import { SkeletonLoader } from './beer/SkeletonLoader';
import { QueuedBeer } from '@/src/utils/htmlParser';
import { getQueuedBeers, deleteQueuedBeer as deleteQueuedBeerApi } from '@/src/api/queueService';
import { Beer } from '@/src/types/beer';
import { useDebounce } from '@/hooks/useDebounce';
import { useAppContext } from '@/context/AppContext';


export const Beerfinder = () => {
  // MP-4 Step 2: Use context for beer data instead of local state
  const { beers, loading, errors } = useAppContext();

  const colorScheme = useColorScheme();
  const [checkinLoading, setCheckinLoading] = useState(false);
  const [queueModalVisible, setQueueModalVisible] = useState(false);
  const [queuedBeers, setQueuedBeers] = useState<QueuedBeer[]>([]);
  const [loadingQueues, setLoadingQueues] = useState(false);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [deletingBeerId, setDeletingBeerId] = useState<string | null>(null);
  const [untappdModalVisible, setUntappdModalVisible] = useState(false);
  const [selectedBeerName, setSelectedBeerName] = useState('');

  /**
   * MP-3 Bottleneck #4: Local search state for immediate UI updates
   * Debounced version used for filtering to reduce excessive re-renders
   */
  const [localSearchText, setLocalSearchText] = useState('');
  const debouncedSearchText = useDebounce(localSearchText, 300);

  // Use the shared filtering hook with untasted beers from context
  // Note: We need to compute untasted beers locally until context provides this
  const untastedBeers = beers.allBeers.filter(beer => {
    const tastedIds = new Set(beers.tastedBeers.map(b => b.id));
    return !tastedIds.has(beer.id);
  });

  const {
    filteredBeers,
    filters,
    sortBy,
    searchText,
    expandedId,
    setSearchText,
    toggleFilter,
    toggleSort,
    toggleExpand,
  } = useBeerFilters(untastedBeers);

  // Theme colors
  const activeButtonColor = useThemeColor({}, 'tint');
  const untappdColor = useUntappdColor();
  const cardColor = useThemeColor({}, 'background');
  const borderColor = useThemeColor({ light: '#e0e0e0', dark: '#333' }, 'text');

  // Use the shared data refresh hook
  // Note: Data loading now happens in _layout.tsx via AppContext
  const { refreshing, handleRefresh } = useDataRefresh({
    onDataReloaded: async () => {
      // Data refresh is handled by _layout.tsx, no need to update local state
    },
    componentName: 'Beerfinder',
  });

  // Sync debounced search text with hook's search state
  useEffect(() => {
    setSearchText(debouncedSearchText);
  }, [debouncedSearchText, setSearchText]);

  /**
   * MP-3 Bottleneck #5: Memoized event handlers for stable references
   */
  const handleCheckIn = useCallback(async (item: Beer) => {
    try {
      setCheckinLoading(true);
      const result = await checkInBeer(item);

      console.log('Check-in result:', result);

      if (result.success) {
        Alert.alert('Success', `Successfully checked in ${item.brew_name}!`);
      } else {
        Alert.alert('Check-In Failed', result.error || 'Unable to check in beer. Please try again.');
      }
    } catch (error: unknown) {
      console.error('Check-in error:', error);

      let errorMessage;

      if (error instanceof Error && error.message && error.message.includes('Please log in again')) {
        errorMessage = 'Login session expired. Attempting to recover your session...';
      } else if (error instanceof SyntaxError && error.message.includes('JSON Parse error')) {
        Alert.alert('Success', `Successfully checked in ${item.brew_name}!`);
        setCheckinLoading(false);
        return;
      } else {
        errorMessage = `Failed to check in: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }

      Alert.alert('Error', errorMessage);
    } finally {
      setCheckinLoading(false);
    }
  }, []);

  const viewQueues = useCallback(async () => {
    try {
      setLoadingQueues(true);
      setQueueError(null); // Clear any previous errors

      // Use the queue service to fetch queued beers
      const parsedBeers = await getQueuedBeers();

      setQueuedBeers(parsedBeers);
      setQueueError(null); // Success - clear error
      setQueueModalVisible(true);
    } catch (error: unknown) {
      console.error('View queues error:', error);

      // Set appropriate error message
      const errorMessage = error instanceof Error ? error.message : 'Failed to load queue. Please try again.';
      setQueueError(errorMessage);

      Alert.alert('Error', errorMessage);
    } finally {
      setLoadingQueues(false);
    }
  }, []);

  const deleteQueuedBeer = useCallback(async (beerId: string, beerName: string) => {
    try {
      Alert.alert(
        "Confirm Deletion",
        `Are you sure you want to remove ${beerName} from your queue?`,
        [
          {
            text: "Cancel",
            style: "cancel"
          },
          {
            text: "Delete",
            onPress: async () => {
              setDeletingBeerId(beerId);

              try {
                // Use the queue service to delete the beer
                const success = await deleteQueuedBeerApi(beerId);

                if (success) {
                  // Refresh the queue list
                  await viewQueues();
                  Alert.alert('Success', `Successfully removed ${beerName} from your queue!`);
                } else {
                  Alert.alert('Error', 'Failed to delete beer. Please try again.');
                }
              } catch (error: unknown) {
                console.error('Delete queued beer error:', error);
                Alert.alert('Error', error instanceof Error ? error.message : 'Failed to delete beer. Please try again.');
              } finally {
                setDeletingBeerId(null);
              }
            },
            style: "destructive"
          }
        ]
      );
    } catch (error: unknown) {
      console.error('Delete queued beer error:', error);
      Alert.alert('Error', `Failed to delete beer: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setDeletingBeerId(null);
    }
  }, [viewQueues]);


  const handleUntappdSearch = useCallback((beerName: string) => {
    setSelectedBeerName(beerName);
    setUntappdModalVisible(true);
  }, []);

  /**
   * MP-3 Bottleneck #4: Update local search for immediate UI, debouncing handles filtering
   */
  const handleSearchChange = useCallback((text: string) => {
    setLocalSearchText(text);
  }, []);

  const clearSearch = useCallback(() => {
    setLocalSearchText('');
  }, []);

  const renderBeerActions = (item: Beer) => (
    <View style={styles.buttonContainer}>
      <TouchableOpacity
        style={[styles.checkInButton, {
          backgroundColor: untappdColor,
          width: '48%'
        }]}
        onPress={() => handleCheckIn(item)}
        activeOpacity={0.7}
        disabled={checkinLoading}
      >
        {checkinLoading ? (
          <ActivityIndicator size="small" color={colorScheme === 'dark' ? '#FFFFFF' : 'white'} />
        ) : (
          <ThemedText style={[styles.checkInButtonText, {
            color: colorScheme === 'dark' ? '#FFFFFF' : 'white'
          }]}>
            Check Me In!
          </ThemedText>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.checkInButton, {
          backgroundColor: untappdColor,
          width: '48%'
        }]}
        onPress={() => handleUntappdSearch(item.brew_name)}
        activeOpacity={0.7}
      >
        <ThemedText style={[styles.checkInButtonText, {
          color: colorScheme === 'dark' ? '#FFFFFF' : 'white'
        }]}>
          Check Untappd
        </ThemedText>
      </TouchableOpacity>
    </View>
  );

  const renderQueueModal = () => (
    <Modal
      animationType="slide"
      transparent={true}
      visible={queueModalVisible}
      onRequestClose={() => setQueueModalVisible(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: cardColor, borderColor }]}>
          <ThemedText style={styles.modalTitle}>Queued Brews</ThemedText>

          {queueError ? (
            <View style={styles.queueErrorContainer}>
              <ThemedText style={styles.queueErrorText}>
                {queueError}
              </ThemedText>
              <TouchableOpacity
                style={[styles.retryButton, {
                  backgroundColor: untappdColor
                }]}
                onPress={viewQueues}
                disabled={loadingQueues}
              >
                {loadingQueues ? (
                  <ActivityIndicator size="small" color={colorScheme === 'dark' ? '#FFFFFF' : 'white'} />
                ) : (
                  <ThemedText style={[styles.retryButtonText, { color: 'white' }]}>
                    Try Again
                  </ThemedText>
                )}
              </TouchableOpacity>
            </View>
          ) : queuedBeers.length === 0 ? (
            <ThemedText style={styles.noQueuesText}>
              No beer currently in queue
            </ThemedText>
          ) : (
            <FlatList
              data={queuedBeers}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <View style={[styles.queuedBeerItem, { borderColor }]}>
                  <View style={styles.queuedBeerContent}>
                    <ThemedText type="defaultSemiBold" style={styles.queuedBeerName}>
                      {item.name}
                    </ThemedText>
                    <ThemedText style={styles.queuedBeerDate}>
                      {item.date}
                    </ThemedText>
                  </View>
                  <TouchableOpacity
                    style={[styles.deleteButton, {
                      backgroundColor: colorScheme === 'dark' ? '#ff4d4f' : '#fff0f0',
                      borderColor: colorScheme === 'dark' ? '#ff7875' : '#ffa39e'
                    }]}
                    onPress={() => deleteQueuedBeer(item.id, item.name)}
                    disabled={deletingBeerId === item.id}
                  >
                    {deletingBeerId === item.id ? (
                      <ActivityIndicator size="small" color={colorScheme === 'dark' ? 'white' : '#f5222d'} />
                    ) : (
                      <ThemedText style={[styles.deleteButtonText, {
                        color: colorScheme === 'dark' ? 'white' : '#f5222d'
                      }]}>
                        Delete
                      </ThemedText>
                    )}
                  </TouchableOpacity>
                </View>
              )}
              style={styles.queuesList}
              contentContainerStyle={{ paddingBottom: 10 }}
            />
          )}

          <TouchableOpacity
            style={[styles.closeButton, {
              backgroundColor: untappdColor
            }]}
            onPress={() => setQueueModalVisible(false)}
          >
            <ThemedText style={[styles.closeButtonText, { color: 'white' }]}>
              Close
            </ThemedText>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  return (
    <View testID="beerfinder-container" style={styles.container}>
      {/* Show skeleton during initial load (when loading=true and no beers yet) */}
      {loading.isLoadingBeers && beers.allBeers.length === 0 ? (
        <>
          {/* MP-3 Step 3b: Show action buttons even during loading */}
          <View style={styles.filtersContainer}>
            <View style={styles.buttonsContainer}>
              <TouchableOpacity
                style={[styles.actionButton, {
                  backgroundColor: untappdColor,
                  marginRight: 8
                }]}
                onPress={viewQueues}
                disabled={loadingQueues}
              >
                {loadingQueues ? (
                  <ActivityIndicator size="small" color={colorScheme === 'dark' ? '#FFFFFF' : 'white'} />
                ) : (
                  <ThemedText style={[styles.actionButtonText, {
                    color: colorScheme === 'dark' ? '#FFFFFF' : 'white'
                  }]}>
                    View Queues
                  </ThemedText>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, {
                  backgroundColor: untappdColor
                }]}
                onPress={() => router.push("/screens/rewards" as any)}
              >
                <ThemedText style={[styles.actionButtonText, {
                  color: colorScheme === 'dark' ? '#FFFFFF' : 'white'
                }]}>
                  Rewards
                </ThemedText>
              </TouchableOpacity>
            </View>
          </View>
          <SkeletonLoader count={20} />
        </>
      ) : errors.beerError ? (
        <View style={styles.centered}>
          <ThemedText style={styles.errorText}>{errors.beerError}</ThemedText>
          <TouchableOpacity
            style={[styles.refreshButton, { backgroundColor: activeButtonColor }]}
            onPress={handleRefresh}
          >
            <ThemedText style={[styles.buttonText, { color: 'white' }]}>
              Try Again
            </ThemedText>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.filtersContainer}>
            <View style={styles.buttonsContainer}>
              <TouchableOpacity
                style={[styles.actionButton, {
                  backgroundColor: untappdColor,
                  marginRight: 8
                }]}
                onPress={viewQueues}
                disabled={loadingQueues}
              >
                {loadingQueues ? (
                  <ActivityIndicator size="small" color={colorScheme === 'dark' ? '#FFFFFF' : 'white'} />
                ) : (
                  <ThemedText style={[styles.actionButtonText, {
                    color: colorScheme === 'dark' ? '#FFFFFF' : 'white'
                  }]}>
                    View Queues
                  </ThemedText>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, {
                  backgroundColor: untappdColor
                }]}
                onPress={() => router.push("/screens/rewards" as any)}
              >
                <ThemedText style={[styles.actionButtonText, {
                  color: colorScheme === 'dark' ? '#FFFFFF' : 'white'
                }]}>
                  Rewards
                </ThemedText>
              </TouchableOpacity>
            </View>

            <SearchBar
              searchText={localSearchText}
              onSearchChange={handleSearchChange}
              onClear={clearSearch}
              placeholder="Search available beer..."
            />
            <View style={styles.beerCountContainer}>
              <ThemedText style={styles.beerCount}>
                {filteredBeers.length} {filteredBeers.length === 1 ? 'brew' : 'brews'} available
              </ThemedText>
            </View>

            <FilterBar
              filters={filters}
              sortBy={sortBy}
              onToggleFilter={toggleFilter}
              onToggleSort={toggleSort}
            />
          </View>

          <BeerList
            beers={filteredBeers}
            loading={loading.isLoadingBeers}
            refreshing={refreshing}
            onRefresh={handleRefresh}
            emptyMessage="No beer found"
            expandedId={expandedId}
            onToggleExpand={toggleExpand}
            renderItemActions={renderBeerActions}
          />

          {renderQueueModal()}
          <UntappdWebView
            visible={untappdModalVisible}
            onClose={() => setUntappdModalVisible(false)}
            beerName={selectedBeerName}
          />
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  filtersContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: 'transparent',
  },
  beerCountContainer: {
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  beerCount: {
    fontWeight: '600',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    marginBottom: 16,
    textAlign: 'center',
    fontSize: 16,
  },
  refreshButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 24,
  },
  buttonText: {
    fontWeight: '600',
  },
  buttonsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    justifyContent: 'center',
  },
  actionButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    flex: 0.5,
    maxWidth: '45%',
  },
  actionButtonText: {
    fontWeight: '600',
    fontSize: 14,
    textAlign: 'center',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  checkInButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkInButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: 20,
  },
  modalContent: {
    padding: 20,
    borderRadius: 12,
    width: '90%',
    maxHeight: '80%',
    borderWidth: 1,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  noQueuesText: {
    fontSize: 16,
    textAlign: 'center',
    marginVertical: 24,
  },
  queueErrorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 24,
  },
  queueErrorText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16,
    color: '#f5222d',
  },
  retryButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginTop: 8,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  queuesList: {
    marginVertical: 10,
  },
  queuedBeerItem: {
    padding: 12,
    borderBottomWidth: 1,
    marginBottom: 8,
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  queuedBeerContent: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'center',
  },
  queuedBeerName: {
    fontSize: 16,
    marginBottom: 4,
  },
  queuedBeerDate: {
    fontSize: 14,
    opacity: 0.7,
  },
  deleteButton: {
    padding: 8,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
    borderWidth: 1,
  },
  deleteButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  closeButton: {
    marginTop: 16,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
});
