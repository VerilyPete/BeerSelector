import React, { useEffect, useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  FlatList,
  Platform,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/Colors';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { SearchBar } from './SearchBar';
import { router, Href } from 'expo-router';
import { UntappdWebView } from './UntappdWebView';
import { useBeerFilters } from '@/hooks/useBeerFilters';
import { useDataRefresh } from '@/hooks/useDataRefresh';
import { FilterBar } from './beer/FilterBar';
import { BeerList } from './beer/BeerList';
import { SkeletonLoader } from './beer/SkeletonLoader';
import { QueuedBeer } from '@/src/utils/htmlParser';
import { getQueuedBeers, deleteQueuedBeer as deleteQueuedBeerApi } from '@/src/api/queueService';
import { BeerWithContainerType } from '@/src/types/beer';
import { useDebounce } from '@/hooks/useDebounce';
import { useAppContext } from '@/context/AppContext';
import { useQueuedCheckIn } from '@/hooks/useQueuedCheckIn';
import { getSessionData } from '@/src/api/sessionManager';
import { updateLiveActivityWithQueue } from '@/src/services/liveActivityService';

export const Beerfinder = () => {
  // MP-4 Step 2: Use context for beer data instead of local state
  const { beers, loading, errors, syncQueuedBeerIds, refreshBeerData } = useAppContext();

  // Responsive layout: 1 column on phone, 2 on tablet portrait, 3 on tablet landscape
  const { numColumns } = useBreakpoint();

  const { queuedCheckIn, isLoading: checkinLoading } = useQueuedCheckIn();
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
  // Filter out both tasted beers AND queued beers (to prevent double check-ins)
  const untastedBeers = beers.allBeers.filter(beer => {
    const tastedIds = new Set(beers.tastedBeers.map(b => b.id));
    return !tastedIds.has(beer.id) && !beers.queuedBeerIds.has(beer.id);
  });

  const {
    filteredBeers,
    containerFilter,
    sortBy,
    sortDirection,
    expandedId,
    setSearchText,
    cycleContainerFilter,
    cycleSort,
    toggleSortDirection,
    toggleExpand,
  } = useBeerFilters(untastedBeers);

  const colorScheme = useColorScheme() ?? 'dark';
  const colors = Colors[colorScheme];
  // Use the shared data refresh hook
  // Use AppContext's refreshBeerData to reload from database after refresh
  const { refreshing, handleRefresh: baseHandleRefresh } = useDataRefresh({
    onDataReloaded: refreshBeerData,
    componentName: 'Beerfinder',
  });

  // Wrap refresh to also sync queued beer IDs
  const handleRefresh = useCallback(async () => {
    await baseHandleRefresh();

    // Sync queued beer IDs with API to handle external deletions
    try {
      const parsedBeers = await getQueuedBeers();
      const queuedIds = parsedBeers
        .map(queuedBeer => {
          const matchingBeer = beers.allBeers.find(
            beer =>
              queuedBeer.name.includes(beer.brew_name) || beer.brew_name.includes(queuedBeer.name)
          );
          return matchingBeer?.id;
        })
        .filter((id): id is string => id !== undefined);
      syncQueuedBeerIds(queuedIds);
    } catch (error) {
      // Silently fail - queue sync is not critical for refresh
      console.log('[Beerfinder] Failed to sync queued beers on refresh:', error);
    }
  }, [baseHandleRefresh, beers.allBeers, syncQueuedBeerIds]);

  // Sync debounced search text with hook's search state
  useEffect(() => {
    setSearchText(debouncedSearchText);
  }, [debouncedSearchText, setSearchText]);

  /**
   * MP-3 Bottleneck #5: Memoized event handlers for stable references
   * MP-7 Step 2: Use queued check-in with offline support
   */
  const handleCheckIn = useCallback(
    async (item: BeerWithContainerType) => {
      await queuedCheckIn(item);
    },
    [queuedCheckIn]
  );

  const viewQueues = useCallback(async () => {
    try {
      setLoadingQueues(true);
      setQueueError(null); // Clear any previous errors

      // Use the queue service to fetch queued beers
      const parsedBeers = await getQueuedBeers();

      setQueuedBeers(parsedBeers);

      // Match queue beer names to allBeers to get beer IDs for filtering
      // Queue returns names like "Beer Name (Draft)" which should match brew_name
      const queuedBeerIds = parsedBeers
        .map(queuedBeer => {
          // Find matching beer by name (queue name may include container type)
          const matchingBeer = beers.allBeers.find(
            beer =>
              queuedBeer.name.includes(beer.brew_name) || beer.brew_name.includes(queuedBeer.name)
          );
          return matchingBeer?.id;
        })
        .filter((id): id is string => id !== undefined);

      syncQueuedBeerIds(queuedBeerIds);
      setQueueError(null); // Success - clear error
      setQueueModalVisible(true);
    } catch (error: unknown) {
      console.error('View queues error:', error);

      // Set appropriate error message
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to load queue. Please try again.';
      setQueueError(errorMessage);

      Alert.alert('Error', errorMessage);
    } finally {
      setLoadingQueues(false);
    }
  }, [beers.allBeers, syncQueuedBeerIds]);

  const deleteQueuedBeer = useCallback(
    async (beerId: string, beerName: string) => {
      try {
        Alert.alert(
          'Confirm Deletion',
          `Are you sure you want to remove ${beerName} from your queue?`,
          [
            {
              text: 'Cancel',
              style: 'cancel',
            },
            {
              text: 'Delete',
              onPress: async () => {
                setDeletingBeerId(beerId);

                try {
                  // Use the queue service to delete the beer
                  const success = await deleteQueuedBeerApi(beerId);

                  if (success) {
                    // Refresh the queue list
                    await viewQueues();

                    // Update Live Activity with updated queue (iOS only)
                    if (Platform.OS === 'ios') {
                      try {
                        const sessionData = await getSessionData();
                        const updatedQueuedBeers = await getQueuedBeers();
                        await updateLiveActivityWithQueue(updatedQueuedBeers, sessionData, false);
                      } catch (liveActivityError) {
                        // Live Activity errors should never block the main flow
                        console.log('[Beerfinder] Live Activity update failed:', liveActivityError);
                      }
                    }
                  } else {
                    Alert.alert('Error', 'Failed to delete beer. Please try again.');
                  }
                } catch (error: unknown) {
                  console.error('Delete queued beer error:', error);
                  Alert.alert(
                    'Error',
                    error instanceof Error
                      ? error.message
                      : 'Failed to delete beer. Please try again.'
                  );
                } finally {
                  setDeletingBeerId(null);
                }
              },
              style: 'destructive',
            },
          ]
        );
      } catch (error: unknown) {
        console.error('Delete queued beer error:', error);
        Alert.alert(
          'Error',
          `Failed to delete beer: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        setDeletingBeerId(null);
      }
    },
    [viewQueues]
  );

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

  const renderBeerActions = (item: BeerWithContainerType) => (
    <View style={styles.buttonContainer}>
      <TouchableOpacity
        style={[styles.amberButtonOuter, { backgroundColor: colors.amber, borderColor: colors.amberBorderOuter }]}
        onPress={() => handleCheckIn(item)}
        activeOpacity={0.8}
        disabled={checkinLoading}
      >
        <View style={[styles.amberButtonInner, { backgroundColor: colors.amberWell, borderColor: colors.amberBorderInner }]}>
          {checkinLoading ? (
            <ActivityIndicator size="small" color={colors.amber} />
          ) : (
            <Text style={[styles.amberButtonText, { color: colors.amber }]} numberOfLines={1}>
              CHECK IN
            </Text>
          )}
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.amberButtonOuter, { backgroundColor: colors.amber, borderColor: colors.amberBorderOuter }]}
        onPress={() => handleUntappdSearch(item.brew_name)}
        activeOpacity={0.8}
      >
        <View style={[styles.amberButtonInner, { backgroundColor: colors.amberWell, borderColor: colors.amberBorderInner }]}>
          <Text style={[styles.amberButtonText, { color: colors.amber }]} numberOfLines={1}>
            UNTAPPD
          </Text>
        </View>
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
      <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
        <View style={[styles.modalContent, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <Text style={styles.modalTitle}>Queued Brews</Text>

          {queueError ? (
            <View style={styles.queueErrorContainer}>
              <Text style={[styles.queueErrorText, { color: colors.error }]}>
                {queueError}
              </Text>
              <TouchableOpacity
                style={[styles.amberButtonOuter, { backgroundColor: colors.amber, borderColor: colors.amberBorderOuter, flex: 0 }]}
                onPress={viewQueues}
                activeOpacity={0.8}
                disabled={loadingQueues}
              >
                <View style={[styles.amberButtonInner, { backgroundColor: colors.amberWell, borderColor: colors.amberBorderInner }]}>
                  {loadingQueues ? (
                    <ActivityIndicator size="small" color={colors.amber} />
                  ) : (
                    <Text style={[styles.amberButtonText, { color: colors.amber }]}>TRY AGAIN</Text>
                  )}
                </View>
              </TouchableOpacity>
            </View>
          ) : queuedBeers.length === 0 ? (
            <Text style={styles.noQueuesText}>No beer currently in queue</Text>
          ) : (
            <FlatList
              data={queuedBeers}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <View style={[styles.queuedBeerItem, { borderColor: colors.border }]}>
                  <View style={styles.queuedBeerContent}>
                    <Text style={[styles.queuedBeerName, { color: colors.text }]}>
                      {item.name}
                    </Text>
                    <Text style={styles.queuedBeerDate}>{item.date}</Text>
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.deleteButton,
                      {
                        backgroundColor: colors.errorBg,
                        borderColor: colors.errorBorder,
                      },
                    ]}
                    onPress={() => deleteQueuedBeer(item.id, item.name)}
                    disabled={deletingBeerId === item.id}
                  >
                    {deletingBeerId === item.id ? (
                      <ActivityIndicator
                        size="small"
                        color={colorScheme === 'dark' ? colors.textOnPrimary : colors.error}
                      />
                    ) : (
                      <Text
                        style={[
                          styles.deleteButtonText,
                          {
                            color: colorScheme === 'dark' ? colors.textOnPrimary : colors.error,
                          },
                        ]}
                      >
                        Delete
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}
              style={styles.queuesList}
              contentContainerStyle={{ paddingBottom: 10 }}
            />
          )}

          <TouchableOpacity
            style={[styles.amberButtonOuter, { backgroundColor: colors.amber, borderColor: colors.amberBorderOuter, flex: 0, marginTop: 16 }]}
            onPress={() => setQueueModalVisible(false)}
            activeOpacity={0.8}
          >
            <View style={[styles.amberButtonInner, { backgroundColor: colors.amberWell, borderColor: colors.amberBorderInner }]}>
              <Text style={[styles.amberButtonText, { color: colors.amber }]}>CLOSE</Text>
            </View>
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
                style={[styles.amberButtonOuter, { backgroundColor: colors.amber, borderColor: colors.amberBorderOuter }]}
                onPress={viewQueues}
                activeOpacity={0.8}
                disabled={loadingQueues}
              >
                <View style={[styles.amberButtonInner, { backgroundColor: colors.amberWell, borderColor: colors.amberBorderInner }]}>
                  {loadingQueues ? (
                    <ActivityIndicator size="small" color={colors.amber} />
                  ) : (
                    <Text style={[styles.amberButtonText, { color: colors.amber }]}>QUEUE</Text>
                  )}
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.amberButtonOuter, { backgroundColor: colors.amber, borderColor: colors.amberBorderOuter }]}
                onPress={() => router.push('/screens/rewards' as Href)}
                activeOpacity={0.8}
              >
                <View style={[styles.amberButtonInner, { backgroundColor: colors.amberWell, borderColor: colors.amberBorderInner }]}>
                  <Text style={[styles.amberButtonText, { color: colors.amber }]}>REWARDS</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
          <SkeletonLoader count={20} />
        </>
      ) : errors.beerError ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{errors.beerError}</Text>
          <TouchableOpacity
            style={[styles.refreshButton, { backgroundColor: colors.tint }]}
            onPress={handleRefresh}
          >
            <Text style={[styles.buttonText, { color: colors.textOnPrimary }]}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.filtersContainer}>
            <View style={styles.buttonsContainer}>
              <TouchableOpacity
                style={[styles.amberButtonOuter, { backgroundColor: colors.amber, borderColor: colors.amberBorderOuter }]}
                onPress={viewQueues}
                activeOpacity={0.8}
                disabled={loadingQueues}
              >
                <View style={[styles.amberButtonInner, { backgroundColor: colors.amberWell, borderColor: colors.amberBorderInner }]}>
                  {loadingQueues ? (
                    <ActivityIndicator size="small" color={colors.amber} />
                  ) : (
                    <Text style={[styles.amberButtonText, { color: colors.amber }]}>QUEUE</Text>
                  )}
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.amberButtonOuter, { backgroundColor: colors.amber, borderColor: colors.amberBorderOuter }]}
                onPress={() => router.push('/screens/rewards' as Href)}
                activeOpacity={0.8}
              >
                <View style={[styles.amberButtonInner, { backgroundColor: colors.amberWell, borderColor: colors.amberBorderInner }]}>
                  <Text style={[styles.amberButtonText, { color: colors.amber }]}>REWARDS</Text>
                </View>
              </TouchableOpacity>
            </View>

            <SearchBar
              searchText={localSearchText}
              onSearchChange={handleSearchChange}
              onClear={clearSearch}
              placeholder="Search available beer..."
            />
            <View style={styles.beerCountContainer}>
              <Text style={[styles.beerCount, { color: colors.textSecondary }]}>
                {filteredBeers.length} beers to discover
              </Text>
            </View>

            <FilterBar
              containerFilter={containerFilter}
              sortBy={sortBy}
              sortDirection={sortDirection}
              onCycleContainerFilter={cycleContainerFilter}
              onCycleSort={cycleSort}
              onToggleSortDirection={toggleSortDirection}
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
            numColumns={numColumns}
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
    paddingHorizontal: 18,
  },
  filtersContainer: {
    paddingTop: 0,
    paddingBottom: 8,
    backgroundColor: 'transparent',
  },
  beerCountContainer: {
    marginBottom: 8,
  },
  beerCount: {
    fontFamily: 'SpaceMono',
    fontSize: 10,
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
    fontSize: 13,
    fontFamily: 'SpaceMono',
  },
  refreshButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  buttonText: {
    fontFamily: 'SpaceGrotesk-SemiBold',
    fontSize: 13,
  },
  buttonsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 10,
  },
  amberButtonOuter: {
    flex: 1,
    borderRadius: 10,
    padding: 5,
    borderWidth: 1,
    shadowColor: '#FFB300',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 6,
  },
  amberButtonInner: {
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  amberButtonText: {
    fontFamily: 'SpaceMono',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  buttonContainer: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 8,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    padding: 20,
    borderRadius: 16,
    width: '90%',
    maxHeight: '80%',
    borderWidth: 1,
  },
  modalTitle: {
    fontFamily: 'SpaceGrotesk-Bold',
    fontSize: 20,
    marginBottom: 16,
    textAlign: 'center',
  },
  noQueuesText: {
    fontFamily: 'SpaceMono',
    fontSize: 13,
    textAlign: 'center',
    marginVertical: 24,
  },
  queueErrorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 24,
  },
  queueErrorText: {
    fontFamily: 'SpaceMono',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 16,
  },
  queuesList: {
    marginVertical: 10,
  },
  queuedBeerItem: {
    padding: 12,
    borderBottomWidth: 1,
    marginBottom: 8,
    borderRadius: 10,
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
    fontFamily: 'SpaceGrotesk-SemiBold',
    fontSize: 14,
    marginBottom: 4,
  },
  queuedBeerDate: {
    fontFamily: 'SpaceMono',
    fontSize: 11,
    opacity: 0.7,
  },
  deleteButton: {
    padding: 8,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
    borderWidth: 1,
  },
  deleteButtonText: {
    fontFamily: 'SpaceGrotesk-SemiBold',
    fontSize: 12,
  },
});
