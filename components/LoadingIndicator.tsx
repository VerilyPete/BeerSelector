import React from 'react';
import { ActivityIndicator, StyleSheet, View, Text } from 'react-native';
import { ThemedText } from './ThemedText';

type Props = {
  message?: string;
};

export const LoadingIndicator = ({ message = 'Loading...' }: Props) => {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" />
      <ThemedText style={styles.text}>{message}</ThemedText>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  text: {
    marginTop: 16,
    fontSize: 16,
    textAlign: 'center',
  },
}); 