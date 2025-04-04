import React from 'react';
import { StyleSheet, TouchableOpacity, View, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { IconSymbol } from '@/components/ui/IconSymbol';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useColorScheme } from '@/hooks/useColorScheme';

export default function SettingsScreen() {
  const backgroundColor = useThemeColor({}, 'background');
  const cardColor = useThemeColor({ light: '#F5F5F5', dark: '#1C1C1E' }, 'background');
  const tintColor = useThemeColor({}, 'tint');
  const textColor = useThemeColor({}, 'text');
  const colorScheme = useColorScheme() ?? 'light';

  // Example state for settings
  const [draftFilterEnabled, setDraftFilterEnabled] = React.useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = React.useState(true);

  return (
    <ThemedView style={styles.container}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <SafeAreaView style={styles.safeArea} edges={['top', 'right', 'left']}>
        {/* Back button */}
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <IconSymbol name="xmark" size={22} color={tintColor} />
        </TouchableOpacity>

        <View style={styles.content}>
          {/* Title Section */}
          <View style={styles.titleSection}>
            <ThemedText type="title" style={styles.pageTitle}>Settings</ThemedText>
          </View>
          
          {/* Filter Preferences Section */}
          <View style={[styles.section, { backgroundColor: cardColor }]}>
            <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>Filter Preferences</ThemedText>
            
            <View style={styles.settingRow}>
              <ThemedText>Default to Draft Filter</ThemedText>
              <Switch
                value={draftFilterEnabled}
                onValueChange={setDraftFilterEnabled}
                trackColor={{ false: '#767577', true: tintColor }}
                thumbColor={'#f4f3f4'}
                ios_backgroundColor="#3e3e3e"
              />
            </View>
          </View>

          {/* Notifications Section */}
          <View style={[styles.section, { backgroundColor: cardColor }]}>
            <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>Notifications</ThemedText>
            
            <View style={styles.settingRow}>
              <ThemedText>Enable Notifications</ThemedText>
              <Switch
                value={notificationsEnabled}
                onValueChange={setNotificationsEnabled}
                trackColor={{ false: '#767577', true: tintColor }}
                thumbColor={'#f4f3f4'}
                ios_backgroundColor="#3e3e3e"
              />
            </View>
          </View>

          {/* About Section */}
          <View style={[styles.section, { backgroundColor: cardColor }]}>
            <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>About</ThemedText>
            
            <View style={styles.aboutInfo}>
              <ThemedText>Beer Selector</ThemedText>
              <ThemedText style={styles.versionText}>Version 1.0.0</ThemedText>
            </View>
          </View>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  backButton: {
    position: 'absolute',
    top: 30,
    right: 16,
    zIndex: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(200, 200, 200, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  titleSection: {
    marginBottom: 20,
    alignItems: 'center',
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  section: {
    borderRadius: 12,
    marginBottom: 20,
    overflow: 'hidden',
  },
  sectionTitle: {
    fontSize: 16,
    padding: 12,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderTopWidth: 0.5,
    borderTopColor: '#CCCCCC',
  },
  aboutInfo: {
    padding: 12,
  },
  versionText: {
    marginTop: 4,
    fontSize: 12,
    opacity: 0.7,
  },
}); 