import { StyleSheet, Text, View } from 'react-native';
import React from 'react';
import Animated, {
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { BeerList } from '@/components/BeerList';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useThemeColor } from '@/hooks/useThemeColor';

const HEADER_HEIGHT = 250;

export default function HomeScreen() {
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
});
