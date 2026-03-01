import { Link, Stack } from 'expo-router';
import { StyleSheet, View, Text } from 'react-native';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/Colors';

export default function NotFoundScreen() {
  const colorScheme = useColorScheme() ?? 'dark';
  const colors = Colors[colorScheme];

  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.title, { color: colors.text }]}>This screen doesn't exist.</Text>
        <Link href="/" style={styles.link}>
          <Text style={[styles.linkText, { color: colors.tint }]}>Go to home screen!</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontFamily: 'Inter',
    fontSize: 28,
    fontWeight: '700',
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
  },
  linkText: {
    fontFamily: 'Inter',
    fontSize: 15,
    fontWeight: '500',
  },
});
