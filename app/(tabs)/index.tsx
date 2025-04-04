import { StyleSheet, Text, View, TouchableOpacity, Alert } from 'react-native';
import React, { useState, useEffect } from 'react';
import Animated, {
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { IconSymbol } from '@/components/ui/IconSymbol';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { BeerList } from '@/components/BeerList';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useThemeColor } from '@/hooks/useThemeColor';
import { areApiUrlsConfigured } from '@/src/database/db';

export function BeerListScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const scrollY = useSharedValue(0);
  const backgroundColor = useThemeColor({}, 'background');

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  // Pass this to BeerList to connect the scrolling
  const renderHeader = () => (
    <>
      <View style={[styles.contentContainer, { backgroundColor }]}>
        <View style={styles.titleContainer}>
          <ThemedText type="title" style={styles.title}>Available Beers</ThemedText>
        </View>
      </View>
    </>
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={{flex: 1}} edges={['top', 'right', 'left']}>
        <BeerListWithHeader 
          renderHeader={renderHeader} 
          onScroll={scrollHandler}
          backgroundColor={backgroundColor}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

// Type definition for the BeerListWithHeader props
interface BeerListWithHeaderProps {
  renderHeader: () => React.ReactElement;
  onScroll: any; // Using 'any' for the Animated onScroll function
  backgroundColor: string;
}

// This is a wrapper component that adds a header to the BeerList
// while keeping FlatList as the primary scrollable container
function BeerListWithHeader({ renderHeader, onScroll, backgroundColor }: BeerListWithHeaderProps) {
  return (
    <Animated.FlatList
      data={[]} // BeerList will handle its own data
      renderItem={() => null}
      ListHeaderComponent={renderHeader}
      ListFooterComponent={() => (
        <View style={[styles.beerListContainer, { backgroundColor }]}>
          <BeerList />
        </View>
      )}
      onScroll={onScroll}
      scrollEventThrottle={16}
      showsVerticalScrollIndicator={false}
      style={styles.container}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    flexGrow: 1,
  },
  titleContainer: {
    padding: 16,
    paddingBottom: 8,
  },
  title: {
    marginBottom: 0,
  },
  beerListContainer: {
    flexGrow: 1,
  },
  homeContainer: {
    flex: 1,
  },
  homeContentContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    paddingTop: 60,
  },
  welcomeTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  welcomeText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 40,
    paddingHorizontal: 20,
  },
  mainButton: {
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 30,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    minWidth: 220,
    alignItems: 'center',
  },
  mainButtonText: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
  },
  settingsButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    padding: 12,
    zIndex: 1,
    backgroundColor: 'rgba(200, 200, 200, 0.3)',
    borderRadius: 30,
  },
  loginPrompt: {
    marginBottom: 40,
    paddingHorizontal: 20,
    textAlign: 'center',
  },
});

export default function HomeScreen() {
  const backgroundColor = useThemeColor({}, 'background');
  const buttonColor = useThemeColor({}, 'tint');
  const colorScheme = useColorScheme() ?? 'light';
  const [apiUrlsSet, setApiUrlsSet] = useState<boolean | null>(null);
  
  // Check if API URLs are configured on component mount
  useEffect(() => {
    const checkApiUrls = async () => {
      const isConfigured = await areApiUrlsConfigured();
      setApiUrlsSet(isConfigured);
    };
    
    checkApiUrls();
  }, []);
  
  // Determine the appropriate button text color based on theme
  const buttonTextColor = colorScheme === 'dark' ? '#000000' : '#FFFFFF';
  
  // If we're still checking API URL status, show nothing
  if (apiUrlsSet === null) {
    return null;
  }

  // If API URLs aren't set, render a login prompt
  if (!apiUrlsSet) {
    return (
      <ThemedView style={[styles.homeContainer, { backgroundColor }]}>
        <SafeAreaView style={styles.homeContentContainer} edges={['top', 'right', 'left']}>
          <ThemedText type="title" style={styles.welcomeTitle}>Welcome to Beer Selector</ThemedText>
          <ThemedText style={[styles.welcomeText, styles.loginPrompt]}>
            Please log in to your Flying Saucer account to start using the app.
          </ThemedText>
          <TouchableOpacity 
            style={[styles.mainButton, { backgroundColor: buttonColor }]}
            onPress={() => router.navigate('/settings')}
          >
            <Text style={[styles.mainButtonText, { color: buttonTextColor }]}>Go to Settings</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </ThemedView>
    );
  }
  
  // Normal view when API URLs are set
  return (
    <ThemedView style={[styles.homeContainer, { backgroundColor }]}>
      <SafeAreaView style={styles.homeContentContainer} edges={['top', 'right', 'left']}>
        {/* Settings button in top right */}
        <TouchableOpacity 
          style={styles.settingsButton}
          onPress={() => router.navigate('/settings')}
        >
          <IconSymbol name="gear" size={28} color={buttonColor} />
        </TouchableOpacity>
        
        <ThemedText type="title" style={styles.welcomeTitle}>Welcome to Beer Selector</ThemedText>
        <ThemedText style={styles.welcomeText}>
          What are you drinking tonight?
        </ThemedText>
        <TouchableOpacity 
          style={[styles.mainButton, { backgroundColor: buttonColor, marginBottom: 16 }]}
          onPress={() => router.navigate('/(tabs)/beerlist')}
        >
          <Text style={[styles.mainButtonText, { color: buttonTextColor }]}>Browse All Beers</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.mainButton, { backgroundColor: buttonColor }]}
          onPress={() => router.navigate('/(tabs)/mybeers')}
        >
          <Text style={[styles.mainButtonText, { color: buttonTextColor }]}>My Beers</Text>
        </TouchableOpacity>
      </SafeAreaView>
    </ThemedView>
  );
}
