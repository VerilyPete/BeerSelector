import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import React from 'react';
import Animated, {
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { router } from 'expo-router';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { BeerList } from '@/components/BeerList';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useThemeColor } from '@/hooks/useThemeColor';

const HEADER_HEIGHT = 250;

export function BeerListScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const scrollY = useSharedValue(0);
  const backgroundColor = useThemeColor({}, 'background');

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const headerAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          translateY: interpolate(
            scrollY.value,
            [-HEADER_HEIGHT, 0, HEADER_HEIGHT],
            [-HEADER_HEIGHT / 2, 0, HEADER_HEIGHT * 0.75]
          ),
        },
        {
          scale: interpolate(scrollY.value, [-HEADER_HEIGHT, 0, HEADER_HEIGHT], [2, 1, 1]),
        },
      ],
    };
  });

  // Pass this to BeerList to connect the scrolling
  const renderHeader = () => (
    <>
      <Animated.View
        style={[
          styles.header,
          { backgroundColor: colorScheme === 'dark' ? '#1D3D47' : '#A1CEDC' },
          headerAnimatedStyle,
        ]}>
        <View style={styles.headerContainer}>
          <Text style={styles.headerTitle}>Beer Selector</Text>
        </View>
      </Animated.View>
      <View style={[styles.contentContainer, { backgroundColor }]}>
        <View style={styles.titleContainer}>
          <ThemedText type="title" style={styles.title}>Available Beers</ThemedText>
        </View>
      </View>
    </>
  );

  return (
    <ThemedView style={styles.container}>
      <BeerListWithHeader 
        renderHeader={renderHeader} 
        onScroll={scrollHandler}
        backgroundColor={backgroundColor}
      />
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
  header: {
    height: HEADER_HEIGHT,
    overflow: 'hidden',
  },
  headerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: 'white',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: -1, height: 1 },
    textShadowRadius: 10,
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
});

export default function HomeScreen() {
  const backgroundColor = useThemeColor({}, 'background');
  const buttonColor = useThemeColor({}, 'tint');
  const colorScheme = useColorScheme() ?? 'light';
  
  // Determine the appropriate button text color based on theme
  const buttonTextColor = colorScheme === 'dark' ? '#000000' : '#FFFFFF';
  
  return (
    <ThemedView style={[styles.homeContainer, { backgroundColor }]}>
      <View style={styles.homeContentContainer}>
        <ThemedText type="title" style={styles.welcomeTitle}>Welcome to Beer Selector</ThemedText>
        <ThemedText style={styles.welcomeText}>
          Your ultimate guide to discovering great beers. 
          Browse our extensive collection and find your next favorite brew.
        </ThemedText>
        <TouchableOpacity 
          style={[styles.mainButton, { backgroundColor: buttonColor }]}
          onPress={() => router.navigate('/(tabs)/beerlist')}
        >
          <Text style={[styles.mainButtonText, { color: buttonTextColor }]}>Browse All Beers</Text>
        </TouchableOpacity>
      </View>
    </ThemedView>
  );
}
