import React from 'react';
import { Modal, StyleSheet, View, TouchableOpacity, SafeAreaView } from 'react-native';
import { WebView } from 'react-native-webview';
import { ThemedText } from './ThemedText';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useUntappdColor } from '@/hooks/useUntappdColor';
import { useColorScheme } from '@/hooks/useColorScheme';
import { config } from '@/src/config';

interface UntappdWebViewProps {
  visible: boolean;
  onClose: () => void;
  beerName: string;
}

export const UntappdWebView = ({ visible, onClose, beerName }: UntappdWebViewProps) => {
  const colorScheme = useColorScheme();
  const cardColor = useThemeColor({}, 'background');
  const untappdColor = useUntappdColor();
  const textColor = useThemeColor({}, 'text');

  // Use config module to generate search URL
  const searchUrl = config.external.untappd.searchUrl(beerName);

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
                backgroundColor: untappdColor
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