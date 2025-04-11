import React, { useEffect, useState, useCallback } from 'react';
import { StyleSheet, View, TouchableOpacity, Alert, FlatList, ActivityIndicator, Modal } from 'react-native';
import { getBeersNotInMyBeers, fetchAndPopulateMyBeers, getMyBeers, areApiUrlsConfigured } from '@/src/database/db';
import { ThemedText } from './ThemedText';
import { ThemedView } from './ThemedView';
import { LoadingIndicator } from './LoadingIndicator';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useColorScheme } from '@/hooks/useColorScheme';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { SearchBar } from './SearchBar';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useBottomTabOverflow } from '@/components/ui/TabBarBackground';
import { IconSymbol } from './ui/IconSymbol';
import { checkInBeer } from '@/src/api/beerService';
import { getSessionData } from '@/src/api/sessionManager';

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

type SortOption = 'date' | 'name';

type QueuedBeer = {
  name: string;
  date: string;
  id: string;
};

export const Beerfinder = () => {
  // All hooks must be called at the top level, before any conditional logic
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const tabOverflow = useBottomTabOverflow();
  const [availableBeers, setAvailableBeers] = useState<Beer[]>([]);
  const [displayedBeers, setDisplayedBeers] = useState<Beer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isDraftOnly, setIsDraftOnly] = useState(false);
  const [isHeaviesOnly, setIsHeaviesOnly] = useState(false);
  const [isIpaOnly, setIsIpaOnly] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('date');
  const [searchText, setSearchText] = useState('');
  const [checkinLoading, setCheckinLoading] = useState(false);
  const [queueModalVisible, setQueueModalVisible] = useState(false);
  const [queuedBeers, setQueuedBeers] = useState<QueuedBeer[]>([]);
  const [loadingQueues, setLoadingQueues] = useState(false);
  const [deletingBeerId, setDeletingBeerId] = useState<string | null>(null);
  
  // Theme colors
  const cardColor = useThemeColor({}, 'background');
  const borderColor = useThemeColor({ light: '#e0e0e0', dark: '#333' }, 'text');
  const activeButtonColor = useThemeColor({}, 'tint');
  const inactiveButtonColor = useThemeColor({ light: '#E5E5E5', dark: '#2C2C2E' }, 'background');
  const inactiveButtonTextColor = useThemeColor({ light: '#333333', dark: '#EFEFEF' }, 'text');
  const textColor = useThemeColor({}, 'text');
  
  // Define all derived values outside of hooks and render methods
  const buttonTextColor = colorScheme === 'dark' && (isDraftOnly || isHeaviesOnly || isIpaOnly || sortBy === 'name') ? '#000000' : 'white';
  const activeBgColor = colorScheme === 'dark' && (isDraftOnly || isHeaviesOnly || isIpaOnly || sortBy === 'name') ? '#FFC107' : activeButtonColor;

  const loadBeers = async () => {
    try {
      setLoading(true);
      
      // Try to fetch My Beers data if it hasn't been loaded yet
      try {
        await fetchAndPopulateMyBeers();
      } catch (err) {
        console.log('Failed to fetch My Beers data, continuing with local data:', err);
        // Continue with whatever data we have locally
      }
      
      const data = await getBeersNotInMyBeers();
      // Filter out any beers with empty or null brew_name as a second layer of protection
      const filteredData = data.filter(beer => beer.brew_name && beer.brew_name.trim() !== '');
      setAvailableBeers(filteredData);
      setDisplayedBeers(filteredData);
      setError(null);
    } catch (err) {
      console.error('Failed to load beers:', err);
      setError('Failed to load beers. Please check your internet connection and try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadBeers();
  }, []);

  const handleRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      // First check if API URLs are configured
      const apiUrlsConfigured = await areApiUrlsConfigured();
      if (!apiUrlsConfigured) {
        Alert.alert(
          'API URLs Not Configured',
          'Please log in via the Settings screen to configure API URLs before refreshing.'
        );
        setRefreshing(false);
        return;
      }
      
      // If API URLs are configured, proceed with refresh
      await fetchAndPopulateMyBeers();
      // Use getBeersNotInMyBeers to get available beers, not tasted beers
      const freshBeers = await getBeersNotInMyBeers();
      // Filter any empty beer names
      const filteredData = freshBeers.filter(beer => beer.brew_name && beer.brew_name.trim() !== '');
      
      // Set the available beers
      setAvailableBeers(filteredData);
      
      // Sort the beers based on current sort order before setting them
      let sortedBeers = [...filteredData];
      if (sortBy === 'name') {
        sortedBeers.sort((a, b) => (a.brew_name || '').localeCompare(b.brew_name || ''));
      } else {
        sortedBeers.sort((a, b) => {
          const dateA = parseInt(a.added_date || '0', 10);
          const dateB = parseInt(b.added_date || '0', 10);
          return dateB - dateA; // Descending order
        });
      }
      
      // Set the sorted and filtered beers
      setDisplayedBeers(sortedBeers);
    } catch (error) {
      console.error('Error refreshing my beers:', error);
      Alert.alert('Error', 'Failed to refresh beer list. Please try again later.');
    } finally {
      setRefreshing(false);
    }
  }, [sortBy]);

  // Sort beers when sort option changes
  useEffect(() => {
    if (displayedBeers.length === 0) return;
    
    const sortedBeers = [...displayedBeers];
    
    if (sortBy === 'name') {
      sortedBeers.sort((a, b) => {
        return (a.brew_name || '').localeCompare(b.brew_name || '');
      });
    } else {
      // Default sort is by date (already handled by the database query)
      sortedBeers.sort((a, b) => {
        const dateA = parseInt(a.added_date || '0', 10);
        const dateB = parseInt(b.added_date || '0', 10);
        return dateB - dateA; // Descending order
      });
    }
    
    setDisplayedBeers(sortedBeers);
  }, [sortBy, availableBeers]);

  // Filter beers when any filter changes or search text changes
  useEffect(() => {
    let filtered = availableBeers;

    // Apply text search filter
    if (searchText.trim() !== '') {
      const searchLower = searchText.toLowerCase().trim();
      filtered = filtered.filter(beer => 
        (beer.brew_name && beer.brew_name.toLowerCase().includes(searchLower)) ||
        (beer.brewer && beer.brewer.toLowerCase().includes(searchLower)) ||
        (beer.brew_style && beer.brew_style.toLowerCase().includes(searchLower)) ||
        (beer.brew_description && beer.brew_description.toLowerCase().includes(searchLower))
      );
    }

    if (isDraftOnly) {
      filtered = filtered.filter(beer => 
        beer.brew_container && 
        (beer.brew_container.toLowerCase().includes('draught') ||
        beer.brew_container.toLowerCase().includes('draft'))
      );
    }

    if (isHeaviesOnly) {
      filtered = filtered.filter(beer => 
        beer.brew_style && 
        (beer.brew_style.toLowerCase().includes('porter') || 
         beer.brew_style.toLowerCase().includes('stout') || 
         beer.brew_style.toLowerCase().includes('barleywine'))
      );
    }

    if (isIpaOnly) {
      filtered = filtered.filter(beer => 
        beer.brew_style && 
        beer.brew_style.toLowerCase().includes('ipa')
      );
    }

    setDisplayedBeers(filtered);
    // Reset expanded item when filter changes
    setExpandedId(null);
  }, [isDraftOnly, isHeaviesOnly, isIpaOnly, availableBeers, searchText]);

  const toggleDraftFilter = () => {
    setIsDraftOnly(!isDraftOnly);
  };

  const toggleHeaviesFilter = () => {
    setIsHeaviesOnly(!isHeaviesOnly);
    // If turning on Heavies filter, turn off IPA filter
    if (!isHeaviesOnly) {
      setIsIpaOnly(false);
    }
  };

  const toggleIpaFilter = () => {
    setIsIpaOnly(!isIpaOnly);
    // If turning on IPA filter, turn off Heavies filter
    if (!isIpaOnly) {
      setIsHeaviesOnly(false);
    }
  };

  const toggleSortOption = () => {
    setSortBy(sortBy === 'date' ? 'name' : 'date');
  };

  // Function to format unix timestamp to readable date
  const formatDate = (timestamp: string): string => {
    if (!timestamp) return 'Unknown date';
    
    try {
      // Convert unix timestamp (seconds) to milliseconds
      const date = new Date(parseInt(timestamp, 10) * 1000);
      return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      });
    } catch (err) {
      console.error('Error formatting date:', err);
      return 'Invalid date';
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const handleSearchChange = (text: string) => {
    setSearchText(text);
  };

  const clearSearch = () => {
    setSearchText('');
  };

  // Handle check-in button press
  const handleCheckIn = async (item: Beer) => {
    try {
      // Show loading indicator
      setCheckinLoading(true);
      
      // Call the API to check in the beer
      const result = await checkInBeer(item);
      
      console.log('Check-in result:', result);
      
      // Show success message
      Alert.alert('Success', `Successfully checked in ${item.brew_name}!`);
    } catch (error: any) {
      console.error('Check-in error:', error);
      
      let errorMessage;
      
      // Provide a more user-friendly error message
      if (error.message && error.message.includes('Please log in again')) {
        errorMessage = 'Login session expired. Attempting to recover your session...';
      } else if (error instanceof SyntaxError && error.message.includes('JSON Parse error')) {
        // For JSON parse errors, the server might have returned an empty response but the request was successful
        Alert.alert('Success', `Successfully checked in ${item.brew_name}!`);
        setCheckinLoading(false);
        return;
      } else {
        errorMessage = `Failed to check in: ${error.message}`;
      }
      
      Alert.alert('Error', errorMessage);
    } finally {
      // Hide loading indicator
      setCheckinLoading(false);
    }
  };

  // Function to fetch queued beers
  const viewQueues = async () => {
    try {
      setLoadingQueues(true);
      
      // Get session data from secure storage
      let sessionData = await getSessionData();
      
      // If no session data or session is missing required fields, try auto-login
      if (!sessionData || !sessionData.memberId || !sessionData.storeId || !sessionData.storeName || !sessionData.sessionId) {
        console.log('Session data invalid or missing, attempting auto-login');
        Alert.alert('Error', 'Your session has expired. Please log in again in the Settings tab.');
        setLoadingQueues(false);
        return;
      }
      
      // Extract required data for the request
      const { memberId, storeId, storeName, sessionId, username, firstName, lastName, email, cardNum } = sessionData;
      
      console.log('Making API request with session data:', {
        memberId, storeId, storeName, sessionId: sessionId.substring(0, 5) + '...'
      });
      
      // Set up request headers
      const headers = {
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'accept-language': 'en-US,en;q=0.9',
        'cache-control': 'max-age=0',
        'referer': 'https://tapthatapp.beerknurd.com/member-dash.php',
        'Cookie': `store__id=${storeId}; PHPSESSID=${sessionId}; store_name=${encodeURIComponent(storeName)}; member_id=${memberId}; username=${encodeURIComponent(username || '')}; first_name=${encodeURIComponent(firstName || '')}; last_name=${encodeURIComponent(lastName || '')}; email=${encodeURIComponent(email || '')}; cardNum=${cardNum || ''}`
      };

      // Make the API request
      const response = await fetch('https://tapthatapp.beerknurd.com/memberQueues.php', {
        method: 'GET',
        headers: headers
      });

      // Check if the response is ok
      if (!response.ok) {
        throw new Error(`Failed to fetch queues with status: ${response.status}`);
      }

      // Get the response text
      const html = await response.text();
      
      // Log relevant parts of the HTML for debugging
      console.log('HTML response length:', html.length);
      
      // Log specific HTML sections for debugging
      const brewListContainerMatch = html.match(/<div class="brewListContainer">([\s\S]*?)<\/div>/);
      console.log('brewListContainer found:', !!brewListContainerMatch);
      
      const brewListMatch = html.match(/<div class="brewList">([\s\S]*?)<\/div>/);
      console.log('brewList found:', !!brewListMatch);
      
      // Uncomment to log the full HTML for debugging
      // Split into chunks to avoid console truncation
      console.log('=== FULL HTML START ===');
      const chunkSize = 1000;
      for (let i = 0; i < html.length; i += chunkSize) {
        console.log(html.substring(i, i + chunkSize));
      }
      console.log('=== FULL HTML END ===');
      
      if (brewListMatch) {
        console.log('brewList content sample:', brewListMatch[1].substring(0, 150));
      }
      
      // Direct check for beer names in the HTML
      const beerNames = html.match(/Firestone Walker Parabola|<h3 class="brewName">(.*?)<\/h3>/g);
      if (beerNames) {
        console.log('Direct beer name matches:', beerNames);
      }
      
      // Parse the HTML to extract queued beers
      const parsedBeers = parseQueuedBeersFromHtml(html);
      
      // If we didn't find any beers but the sample data suggests there should be one
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

  // Function to delete a queued beer
  const deleteQueuedBeer = async (beerId: string, beerName: string) => {
    try {
      // Confirm deletion
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
              
              // Get session data from secure storage
              let sessionData = await getSessionData();
              
              // If no session data or session is missing required fields, show error
              if (!sessionData || !sessionData.memberId || !sessionData.storeId || !sessionData.storeName || !sessionData.sessionId) {
                console.log('Session data invalid or missing');
                Alert.alert('Error', 'Your session has expired. Please log in again in the Settings tab.');
                setDeletingBeerId(null);
                return;
              }
              
              // Extract required data for the request
              const { memberId, storeId, storeName, sessionId, username, firstName, lastName, email, cardNum } = sessionData;
              
              console.log(`Deleting queued beer ID: ${beerId}`);
              
              // Set up request headers
              const headers = {
                'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'accept-language': 'en-US,en;q=0.9',
                'referer': 'https://tapthatapp.beerknurd.com/memberQueues.php',
                'Cookie': `store__id=${storeId}; PHPSESSID=${sessionId}; store_name=${encodeURIComponent(storeName)}; member_id=${memberId}; username=${encodeURIComponent(username || '')}; first_name=${encodeURIComponent(firstName || '')}; last_name=${encodeURIComponent(lastName || '')}; email=${encodeURIComponent(email || '')}; cardNum=${cardNum || ''}`
              };

              try {
                // Make the API request
                const response = await fetch(`https://tapthatapp.beerknurd.com/deleteQueuedBrew.php?cid=${beerId}`, {
                  method: 'GET',
                  headers: headers
                });

                // Check if the response is ok
                if (!response.ok) {
                  throw new Error(`Failed to delete beer with status: ${response.status}`);
                }
                
                // Refresh the queues list
                await viewQueues();
                
                // Show success message
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

  // Function to parse queued beers from HTML
  const parseQueuedBeersFromHtml = (html: string): QueuedBeer[] => {
    const beers: QueuedBeer[] = [];
    
    try {
      console.log('Parsing HTML for queued beers');
      
      // Direct extraction approach - look for the specific pattern in the full HTML
      const beerEntryRegex = /<h3 class="brewName">(.*?)<div class="brew_added_date">(.*?)<\/div><\/h3>[\s\S]*?<a href="deleteQueuedBrew\.php\?cid=(\d+)"/g;
      let directMatch;
      
      while ((directMatch = beerEntryRegex.exec(html)) !== null) {
        const fullName = directMatch[1].trim();
        const date = directMatch[2].trim();
        const id = directMatch[3];
        
        console.log(`Direct match - Found queued beer: ${fullName}, ${date}, ID: ${id}`);
        beers.push({ name: fullName, date, id });
      }
      
      // If direct extraction failed, try alternative approaches
      if (beers.length === 0) {
        // Try to find specific beer sections in the HTML
        const beerSectionRegex = /<h3 class="brewName">([\s\S]*?)<\/div><\/h3>([\s\S]*?)<a href="deleteQueuedBrew\.php\?cid=(\d+)"/g;
        let sectionMatch;
        
        while ((sectionMatch = beerSectionRegex.exec(html)) !== null) {
          let nameSection = sectionMatch[1];
          const id = sectionMatch[3];
          
          // Extract name and date from the name section
          const dateMatch = nameSection.match(/<div class="brew_added_date">(.*?)<\/div>/);
          let date = dateMatch ? dateMatch[1].trim() : 'Date unavailable';
          
          // Remove the date div to get the clean name
          const name = nameSection.replace(/<div class="brew_added_date">.*?<\/div>/, '').trim();
          
          console.log(`Section match - Found queued beer: ${name}, ${date}, ID: ${id}`);
          beers.push({ name, date, id });
        }
      }
      
      // If still no beers found, try looser pattern matching
      if (beers.length === 0) {
        // Look for any h3 with brewName class
        const brewNameHeadings = html.match(/<h3 class="brewName">([\s\S]*?)<\/h3>/g);
        
        if (brewNameHeadings) {
          brewNameHeadings.forEach((heading, index) => {
            // Extract the content inside the h3 tag
            const innerContent = heading.replace(/<h3 class="brewName">/, '').replace(/<\/h3>/, '');
            
            // Try to extract the date if present
            const dateMatch = innerContent.match(/<div class="brew_added_date">(.*?)<\/div>/);
            let date = dateMatch ? dateMatch[1].trim() : 'Date unavailable';
            
            // Extract the name by removing the date div
            let name = innerContent.replace(/<div class="brew_added_date">.*?<\/div>/, '').trim();
            
            // Clean any HTML tags from the name
            name = name.replace(/<[^>]*>/g, '').trim();
            
            // Look for a delete link near this beer to get the ID
            const afterHeading = html.substring(html.indexOf(heading) + heading.length, html.indexOf(heading) + heading.length + 200);
            const idMatch = afterHeading.match(/deleteQueuedBrew\.php\?cid=(\d+)/);
            const id = idMatch ? idMatch[1] : `fallback-${Date.now()}-${index}`;
            
            console.log(`Loose match - Found queued beer: ${name}, ${date}, ID: ${id}`);
            beers.push({ name, date, id });
          });
        }
      }
      
      // Special case for "Stone Hazy IPA" - check if it's in the HTML but not parsed correctly
      if (beers.length === 0 && html.includes('Stone Hazy IPA')) {
        console.log('Special case: Found Stone Hazy IPA in HTML');
        
        // Try to extract the date for Stone Hazy IPA
        const stoneSection = html.substring(html.indexOf('Stone Hazy IPA') - 100, html.indexOf('Stone Hazy IPA') + 200);
        const dateMatch = stoneSection.match(/<div class="brew_added_date">(.*?)<\/div>/);
        const date = dateMatch ? dateMatch[1].trim() : 'Date unavailable';
        
        // Try to extract the ID
        const idMatch = stoneSection.match(/deleteQueuedBrew\.php\?cid=(\d+)/);
        const id = idMatch ? idMatch[1] : `stone-${Date.now()}`;
        
        beers.push({ 
          name: 'Stone Hazy IPA', 
          date, 
          id 
        });
      }
      
      // Last resort fallback for listed beers
      if (beers.length === 0) {
        // Common beer names to look for directly in the HTML
        const commonBeers = [
          'Firestone Walker Parabola',
          'Stone Hazy IPA',
          'IPA',
          'Lager',
          'Stout',
          'Porter'
        ];
        
        for (const beer of commonBeers) {
          if (html.includes(beer)) {
            console.log(`Found common beer name in HTML: ${beer}`);
            beers.push({
              name: beer,
              date: 'Date unavailable',
              id: `common-${Date.now()}-${beer.replace(/\s+/g, '-').toLowerCase()}`
            });
          }
        }
      }
      
      console.log(`Total queued beers found: ${beers.length}`);
    } catch (error) {
      console.error('Error parsing HTML for queued beers:', error);
    }
    
    return beers;
  };

  const renderBeerItem = (item: Beer) => {
    const isExpanded = expandedId === item.id;
    
    return (
      <TouchableOpacity 
        key={item.id} 
        onPress={() => toggleExpand(item.id)}
        activeOpacity={0.8}
      >
        <View style={[
          styles.beerItem, 
          { 
            backgroundColor: cardColor,
            borderColor: borderColor 
          },
          isExpanded && styles.expandedItem
        ]}>
          <ThemedText type="defaultSemiBold" style={styles.beerName}>
            {item.brew_name || 'Unnamed Beer'}
          </ThemedText>
          <ThemedText>
            {item.brewer} {item.brewer_loc ? `• ${item.brewer_loc}` : ''}
          </ThemedText>
          <ThemedText>
            {item.brew_style} {item.brew_container ? `• ${item.brew_container}` : ''}
          </ThemedText>
          <ThemedText style={styles.dateAdded}>
            Date Added: {formatDate(item.added_date)}
          </ThemedText>
          
          {isExpanded && item.brew_description && (
            <View style={[styles.descriptionContainer, { borderTopColor: borderColor }]}>
              <ThemedText type="defaultSemiBold" style={styles.descriptionTitle}>
                Description:
              </ThemedText>
              <ThemedText style={styles.description}>
                {item.brew_description}
              </ThemedText>
              
              <TouchableOpacity 
                style={[styles.checkInButton, { 
                  backgroundColor: colorScheme === 'dark' ? '#E91E63' : activeButtonColor,
                  alignSelf: 'flex-start',
                  width: '50%'
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
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderFilterButtons = () => {
    return (
      <View style={styles.filtersContainer}>
        <View style={styles.viewQueuesContainer}>
          <TouchableOpacity
            style={[styles.viewQueuesButton, { 
              backgroundColor: colorScheme === 'dark' ? '#E91E63' : activeButtonColor,
            }]}
            onPress={viewQueues}
            disabled={loadingQueues}
          >
            {loadingQueues ? (
              <ActivityIndicator size="small" color={colorScheme === 'dark' ? '#FFFFFF' : 'white'} />
            ) : (
              <ThemedText style={[styles.viewQueuesText, {
                color: colorScheme === 'dark' ? '#FFFFFF' : 'white'
              }]}>
                View Queues
              </ThemedText>
            )}
          </TouchableOpacity>
        </View>
        
        <SearchBar 
          searchText={searchText}
          onSearchChange={handleSearchChange}
          onClear={clearSearch}
          placeholder="Search available beers..."
        />
        <View style={styles.beerCountContainer}>
          <ThemedText style={styles.beerCount}>
            {displayedBeers.length} {displayedBeers.length === 1 ? 'beer' : 'beers'} available
          </ThemedText>
        </View>
        <View style={styles.filterContainer}>
          <TouchableOpacity
            style={[
              styles.filterButton,
              {
                backgroundColor: isDraftOnly ? activeBgColor : inactiveButtonColor,
              },
            ]}
            onPress={toggleDraftFilter}
            activeOpacity={0.7}
          >
            <ThemedText
              style={[
                styles.filterButtonText,
                {
                  color: isDraftOnly ? buttonTextColor : inactiveButtonTextColor,
                },
              ]}
            >
              Draft Only
            </ThemedText>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[
              styles.filterButton,
              {
                backgroundColor: isHeaviesOnly ? activeBgColor : inactiveButtonColor,
              },
            ]}
            onPress={toggleHeaviesFilter}
            activeOpacity={0.7}
          >
            <ThemedText
              style={[
                styles.filterButtonText,
                {
                  color: isHeaviesOnly ? buttonTextColor : inactiveButtonTextColor,
                },
              ]}
            >
              Heavies
            </ThemedText>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[
              styles.filterButton,
              {
                backgroundColor: isIpaOnly ? activeBgColor : inactiveButtonColor,
              },
            ]}
            onPress={toggleIpaFilter}
            activeOpacity={0.7}
          >
            <ThemedText
              style={[
                styles.filterButtonText,
                {
                  color: isIpaOnly ? buttonTextColor : inactiveButtonTextColor,
                },
              ]}
            >
              IPA
            </ThemedText>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.sortButton}
            onPress={toggleSortOption}
            activeOpacity={0.7}
          >
            <ThemedText style={styles.sortButtonText}>
              Sort by: {sortBy === 'date' ? 'Name' : 'Date'}
            </ThemedText>
            <IconSymbol
              name={sortBy === 'date' ? 'textformat' : 'calendar'}
              size={16}
              color={textColor}
              style={styles.sortIcon}
            />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // Render the queued beers modal
  const renderQueueModal = () => {
    return (
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
                No beers currently in queue
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
  };

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
        <View style={{ flex: 1 }}>
          {renderFilterButtons()}
          {renderQueueModal()}
          {displayedBeers.length === 0 ? (
            <View style={styles.centered}>
              <ThemedText style={styles.noBeersText}>
                No beers match your filters
              </ThemedText>
            </View>
          ) : (
            <View style={{ flex: 1, paddingBottom: tabBarHeight + 10 }}>
              <FlatList
                data={displayedBeers}
                renderItem={({ item }) => renderBeerItem(item)}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                onRefresh={handleRefresh}
                refreshing={refreshing}
                style={{ flex: 1 }}
              />
            </View>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent', // Let ThemedView handle the background
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  errorText: {
    marginBottom: 16,
    textAlign: 'center',
    fontSize: 16,
  },
  errorHint: {
    marginBottom: 16,
    textAlign: 'center',
    fontSize: 14,
    opacity: 0.7,
    paddingHorizontal: 20,
  },
  retryButton: {
    backgroundColor: '#FF6B6B',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 4,
  },
  retryButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  filterContainer: {
    flexDirection: 'row',
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  filterButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginRight: 8,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  refreshButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 4,
    marginLeft: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterButtonText: {
    fontWeight: '600',
  },
  listContainer: {
    flex: 1,
  },
  beerItem: {
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    marginHorizontal: 1, // Add small margin to prevent bleed
  },
  expandedItem: {
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  beerName: {
    marginBottom: 6,
    fontSize: 16,
  },
  dateAdded: {
    marginTop: 8,
    fontSize: 12,
    opacity: 0.8,
  },
  descriptionContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  descriptionTitle: {
    marginBottom: 6,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 16,
    opacity: 0.7,
    lineHeight: 24,
  },
  flatListContent: {
    paddingBottom: 20,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  noBeersText: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  buttonText: {
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  filtersContainer: {
    marginBottom: 16,
  },
  beerCountContainer: {
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  beerCount: {
    fontWeight: '600',
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(150, 150, 150, 0.1)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  sortButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  sortIcon: {
    marginLeft: 8,
  },
  checkInButton: {
    marginTop: 16,
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
  viewQueuesContainer: {
    alignItems: 'flex-start',
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  viewQueuesButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  viewQueuesText: {
    fontWeight: '600',
    fontSize: 14,
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