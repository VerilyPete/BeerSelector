import React from 'react';
import { Modal, StyleSheet, View, TouchableOpacity, SafeAreaView } from 'react-native';
import { WebView } from 'react-native-webview';
import { ThemedText } from './ThemedText';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useColorScheme } from '@/hooks/useColorScheme';

interface UntappdWebViewProps {
  visible: boolean;
  onClose: () => void;
  beerName: string;
}

export const UntappdWebView = ({ visible, onClose, beerName }: UntappdWebViewProps) => {
  const colorScheme = useColorScheme();
  const cardColor = useThemeColor({}, 'background');
  const activeButtonColor = useThemeColor({}, 'tint');
  const textColor = useThemeColor({}, 'text');

  // Parse out words in parentheses from the beer name
  const parseBeerName = (name: string): string => {
    // Remove anything in parentheses (including the parentheses)
    return name.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  };

  const parsedBeerName = parseBeerName(beerName);
  const searchUrl = `https://untappd.com/search?q=${encodeURIComponent(parsedBeerName)}`;

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.modalContainer}>
        <View style={[styles.modalContent, { backgroundColor: cardColor }]}>
          <View style={[styles.header, { borderBottomColor: colorScheme === 'dark' ? '#444' : '#ccc' }]}>
            <ThemedText style={styles.title}>Untappd Search</ThemedText>
            <TouchableOpacity
              style={[styles.closeButton, { 
                backgroundColor: colorScheme === 'dark' ? '#E91E63' : activeButtonColor 
              }]}
              onPress={onClose}
            >
              <ThemedText style={[styles.closeButtonText, { color: 'white' }]}>
                Close
              </ThemedText>
            </TouchableOpacity>
          </View>
          <WebView
            source={{ uri: searchUrl }}
            style={styles.webview}
            javaScriptEnabled={true}
            domStorageEnabled={true}
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    flex: 1,
    margin: 0,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  closeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  closeButtonText: {
    fontWeight: '600',
  },
  webview: {
    flex: 1,
  },
}); 