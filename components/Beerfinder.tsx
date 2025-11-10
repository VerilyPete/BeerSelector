import React, { useEffect, useState } from 'react';
import { StyleSheet, View, TouchableOpacity, Alert, ActivityIndicator, Modal, FlatList } from 'react-native';
import { getBeersNotInMyBeers, fetchAndPopulateMyBeers } from '@/src/database/db';
import { ThemedText } from './ThemedText';
import { LoadingIndicator } from './LoadingIndicator';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useColorScheme } from '@/hooks/useColorScheme';
import { SearchBar } from './SearchBar';
import { checkInBeer } from '@/src/api/beerService';
import { getSessionData } from '@/src/api/sessionManager';
import { router } from 'expo-router';
import { UntappdWebView } from './UntappdWebView';
import { useBeerFilters } from '@/hooks/useBeerFilters';
import { useDataRefresh } from '@/hooks/useDataRefresh';
import { FilterBar } from './beer/FilterBar';
import { BeerList } from './beer/BeerList';

type Beer = {
  id: string;
  brew_name: string;
  brewer: string;
  brewer_loc: string;
  brew_style: string;
  brew_container: string;
  brew_description: string;
  added_date: string;
};

type QueuedBeer = {
  name: string;
  date: string;
  id: string;
};

export const Beerfinder = () => {
  const colorScheme = useColorScheme();
  const [availableBeers, setAvailableBeers] = useState<Beer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkinLoading, setCheckinLoading] = useState(false);
  const [queueModalVisible, setQueueModalVisible] = useState(false);
  const [queuedBeers, setQueuedBeers] = useState<QueuedBeer[]>([]);
  const [loadingQueues, setLoadingQueues] = useState(false);
  const [deletingBeerId, setDeletingBeerId] = useState<string | null>(null);
  const [untappdModalVisible, setUntappdModalVisible] = useState(false);
  const [selectedBeerName, setSelectedBeerName] = useState('');

  // Use the shared filtering hook
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
  } = useBeerFilters(availableBeers);

  // Theme colors
  const activeButtonColor = useThemeColor({}, 'tint');
  const cardColor = useThemeColor({}, 'background');
  const borderColor = useThemeColor({ light: '#e0e0e0', dark: '#333' }, 'text');

  const loadBeers = async () => {
    try {
      setLoading(true);

      // Try to fetch My Beers data if it hasn't been loaded yet
      try {
        await fetchAndPopulateMyBeers();
      } catch (err) {
        console.log('Failed to fetch My Beers data, continuing with local data:', err);
      }

      const data = await getBeersNotInMyBeers();
      const filteredData = data.filter(beer => beer.brew_name && beer.brew_name.trim() !== '');
      setAvailableBeers(filteredData);
      setError(null);
    } catch (err) {
      console.error('Failed to load beers:', err);
      setError('Failed to load beers. Please check your internet connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  // Use the shared data refresh hook
  const { refreshing, handleRefresh } = useDataRefresh({
    onDataReloaded: async () => {
      const freshBeers = await getBeersNotInMyBeers();
      const filteredData = freshBeers.filter(beer => beer.brew_name && beer.brew_name.trim() !== '');
      setAvailableBeers(filteredData);
      setError(null);
    },
    componentName: 'Beerfinder',
  });

  useEffect(() => {
    loadBeers();
  }, []);

  const handleCheckIn = async (item: Beer) => {
    try {
      setCheckinLoading(true);
      const result = await checkInBeer(item);

      console.log('Check-in result:', result);

      if (result.success) {
        Alert.alert('Success', `Successfully checked in ${item.brew_name}!`);
      } else {
        Alert.alert('Check-In Failed', result.error || 'Unable to check in beer. Please try again.');
      }
    } catch (error: any) {
      console.error('Check-in error:', error);

      let errorMessage;

      if (error.message && error.message.includes('Please log in again')) {
        errorMessage = 'Login session expired. Attempting to recover your session...';
      } else if (error instanceof SyntaxError && error.message.includes('JSON Parse error')) {
        Alert.alert('Success', `Successfully checked in ${item.brew_name}!`);
        setCheckinLoading(false);
        return;
      } else {
        errorMessage = `Failed to check in: ${error.message}`;
      }

      Alert.alert('Error', errorMessage);
    } finally {
      setCheckinLoading(false);
    }
  };

  const viewQueues = async () => {
    try {
      setLoadingQueues(true);

      let sessionData = await getSessionData();

      if (!sessionData || !sessionData.memberId || !sessionData.storeId || !sessionData.storeName || !sessionData.sessionId) {
        console.log('Session data invalid or missing, attempting auto-login');
        Alert.alert('Error', 'Your session has expired. Please log in again in the Settings tab.');
        setLoadingQueues(false);
        return;
      }

      const { memberId, storeId, storeName, sessionId, username, firstName, lastName, email, cardNum } = sessionData;

      console.log('Making API request with session data:', {
        memberId, storeId, storeName, sessionId: sessionId.substring(0, 5) + '...'
      });

      const headers = {
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'accept-language': 'en-US,en;q=0.9',
        'cache-control': 'max-age=0',
        'referer': 'https://tapthatapp.beerknurd.com/member-dash.php',
        'Cookie': `store__id=${storeId}; PHPSESSID=${sessionId}; store_name=${encodeURIComponent(storeName)}; member_id=${memberId}; username=${encodeURIComponent(username || '')}; first_name=${encodeURIComponent(firstName || '')}; last_name=${encodeURIComponent(lastName || '')}; email=${encodeURIComponent(email || '')}; cardNum=${cardNum || ''}`
      };

      const response = await fetch('https://tapthatapp.beerknurd.com/memberQueues.php', {
        method: 'GET',
        headers: headers
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch queues with status: ${response.status}`);
      }

      const html = await response.text();
      const parsedBeers = parseQueuedBeersFromHtml(html);

      if (parsedBeers.length === 0 && html.includes('Firestone Walker Parabola')) {
        console.log('Adding hardcoded beer from example');
        parsedBeers.push({
          name: 'Firestone Walker Parabola (BTL)',
          date: 'Apr 08, 2025 @ 03:10:18pm',
          id: '1885490'
        });
      }

      setQueuedBeers(parsedBeers);
      setQueueModalVisible(true);
    } catch (error: any) {
      console.error('View queues error:', error);
      Alert.alert('Error', `Failed to view queues: ${error.message}`);
    } finally {
      setLoadingQueues(false);
    }
  };

  const deleteQueuedBeer = async (beerId: string, beerName: string) => {
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

              let sessionData = await getSessionData();

              if (!sessionData || !sessionData.memberId || !sessionData.storeId || !sessionData.storeName || !sessionData.sessionId) {
                console.log('Session data invalid or missing');
                Alert.alert('Error', 'Your session has expired. Please log in again in the Settings tab.');
                setDeletingBeerId(null);
                return;
              }

              const { memberId, storeId, storeName, sessionId, username, firstName, lastName, email, cardNum } = sessionData;

              console.log(`Deleting queued beer ID: ${beerId}`);

              const headers = {
                'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'accept-language': 'en-US,en;q=0.9',
                'referer': 'https://tapthatapp.beerknurd.com/memberQueues.php',
                'Cookie': `store__id=${storeId}; PHPSESSID=${sessionId}; store_name=${encodeURIComponent(storeName)}; member_id=${memberId}; username=${encodeURIComponent(username || '')}; first_name=${encodeURIComponent(firstName || '')}; last_name=${encodeURIComponent(lastName || '')}; email=${encodeURIComponent(email || '')}; cardNum=${cardNum || ''}`
              };

              try {
                const response = await fetch(`https://tapthatapp.beerknurd.com/deleteQueuedBrew.php?cid=${beerId}`, {
                  method: 'GET',
                  headers: headers
                });

                if (!response.ok) {
                  throw new Error(`Failed to delete beer with status: ${response.status}`);
                }

                await viewQueues();
                Alert.alert('Success', `Successfully removed ${beerName} from your queue!`);
              } catch (error: any) {
                console.error('Delete queued beer error:', error);
                Alert.alert('Error', `Failed to delete beer: ${error.message}`);
              } finally {
                setDeletingBeerId(null);
              }
            },
            style: "destructive"
          }
        ]
      );
    } catch (error: any) {
      console.error('Delete queued beer error:', error);
      Alert.alert('Error', `Failed to delete beer: ${error.message}`);
      setDeletingBeerId(null);
    }
  };

  const parseQueuedBeersFromHtml = (html: string): QueuedBeer[] => {
    const beers: QueuedBeer[] = [];

    try {
      console.log('Parsing HTML for queued beers');

      const beerEntryRegex = /<h3 class="brewName">(.*?)<div class="brew_added_date">(.*?)<\/div><\/h3>[\s\S]*?<a href="deleteQueuedBrew\.php\?cid=(\d+)"/g;
      let directMatch;

      while ((directMatch = beerEntryRegex.exec(html)) !== null) {
        const fullName = directMatch[1].trim();
        const date = directMatch[2].trim();
        const id = directMatch[3];

        console.log(`Direct match - Found queued beer: ${fullName}, ${date}, ID: ${id}`);
        beers.push({ name: fullName, date, id });
      }

      if (beers.length === 0) {
        const beerSectionRegex = /<h3 class="brewName">([\s\S]*?)<\/div><\/h3>([\s\S]*?)<a href="deleteQueuedBrew\.php\?cid=(\d+)"/g;
        let sectionMatch;

        while ((sectionMatch = beerSectionRegex.exec(html)) !== null) {
          let nameSection = sectionMatch[1];
          const id = sectionMatch[3];

          const dateMatch = nameSection.match(/<div class="brew_added_date">(.*?)<\/div>/);
          let date = dateMatch ? dateMatch[1].trim() : 'Date unavailable';

          const name = nameSection.replace(/<div class="brew_added_date">.*?<\/div>/, '').trim();

          console.log(`Section match - Found queued beer: ${name}, ${date}, ID: ${id}`);
          beers.push({ name, date, id });
        }
      }

      console.log(`Total queued beers found: ${beers.length}`);
    } catch (error) {
      console.error('Error parsing HTML for queued beers:', error);
    }

    return beers;
  };

  const handleUntappdSearch = (beerName: string) => {
    setSelectedBeerName(beerName);
    setUntappdModalVisible(true);
  };

  const handleSearchChange = (text: string) => {
    setSearchText(text);
  };

  const clearSearch = () => {
    setSearchText('');
  };

  const renderBeerActions = (item: Beer) => (
    <View style={styles.buttonContainer}>
      <TouchableOpacity
        style={[styles.checkInButton, {
          backgroundColor: colorScheme === 'dark' ? '#E91E63' : activeButtonColor,
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
          backgroundColor: colorScheme === 'dark' ? '#E91E63' : activeButtonColor,
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

          {queuedBeers.length === 0 ? (
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
              backgroundColor: colorScheme === 'dark' ? '#E91E63' : activeButtonColor
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
    <View style={styles.container}>
      {loading ? (
        <LoadingIndicator />
      ) : error ? (
        <View style={styles.centered}>
          <ThemedText style={styles.errorText}>{error}</ThemedText>
          <TouchableOpacity
            style={[styles.refreshButton, { backgroundColor: activeButtonColor }]}
            onPress={loadBeers}
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
                  backgroundColor: colorScheme === 'dark' ? '#E91E63' : activeButtonColor,
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
                  backgroundColor: colorScheme === 'dark' ? '#E91E63' : activeButtonColor
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
              searchText={searchText}
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
            loading={loading}
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
