import { Tabs } from 'expo-router';
import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

import { IconSymbol, IconSymbolName } from '@/components/ui/IconSymbol';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useAppContext } from '@/context/AppContext';

type TabConfig = {
  label: string;
  icon: IconSymbolName;
  memberOnly?: boolean;
};

const TAB_CONFIGS: Record<string, TabConfig> = {
  index: { label: 'HOME', icon: 'house.fill' },
  beerlist: { label: 'BEERS', icon: 'mug.fill' },
  mybeers: { label: 'FINDER', icon: 'star.fill', memberOnly: true },
  tastedbrews: { label: 'TASTED', icon: 'checkmark.circle.fill', memberOnly: true },
};

function TerminalTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const colorScheme = useColorScheme() ?? 'dark';
  const colors = Colors[colorScheme];
  const insets = useSafeAreaInsets();
  const { session } = useAppContext();

  const visibleRoutes = state.routes.filter((route) => {
    const cfg = TAB_CONFIGS[route.name];
    if (!cfg) return false;
    if (cfg.memberOnly && session.isVisitor) return false;
    const options = descriptors[route.key].options;
    return options.href !== null;
  });

  return (
    <View style={[styles.tabBarOuter, { paddingBottom: Math.max(insets.bottom, 12), backgroundColor: colors.background }]}>
      <View style={[styles.tabBarPillOuter, { borderColor: colorScheme === 'dark' ? '#FFFFFF30' : colors.border }]}>
        <View style={[styles.tabBarPillInner, { borderColor: colors.border, backgroundColor: colors.backgroundSecondary }]}>
          {visibleRoutes.map((route) => {
            const realIndex = state.routes.indexOf(route);
            const isFocused = state.index === realIndex;
            const cfg = TAB_CONFIGS[route.name];
            if (!cfg) return null;

            const activeColor = isFocused ? colors.tint : colors.tabIconDefault;

            const onPress = () => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            };

            return (
              <TouchableOpacity
                key={route.key}
                accessibilityRole="button"
                accessibilityState={isFocused ? { selected: true } : {}}
                onPress={onPress}
                style={[
                  styles.tabItem,
                  isFocused && {
                    backgroundColor: colorScheme === 'dark' ? '#1A2A2A' : colors.backgroundSecondary,
                    borderWidth: 1,
                    borderColor: colors.accentMuted,
                  },
                ]}
                activeOpacity={0.7}
              >
                <IconSymbol name={cfg.icon} size={18} color={activeColor} />
                <Text style={[styles.tabLabel, { color: activeColor }]}>
                  {cfg.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabBarOuter: {
    paddingHorizontal: 16,
    paddingTop: 0,
  },
  tabBarPillOuter: {
    borderRadius: 36,
    height: 62,
    padding: 4,
    borderWidth: 1,
    backgroundColor: '#8A919A',
  },
  tabBarPillInner: {
    flex: 1,
    flexDirection: 'row',
    borderRadius: 33,
    padding: 3,
    gap: 3,
    borderWidth: 1,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 30,
    gap: 3,
  },
  tabLabel: {
    fontFamily: 'SpaceMono',
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 1,
  },
});

export default function TabLayout() {
  const { session } = useAppContext();
  const isInVisitorMode = session.isVisitor;

  useEffect(() => {
    console.log('Tab layout rendering with visitor mode:', isInVisitorMode);
  }, [isInVisitorMode]);

  return (
    <Tabs
      tabBar={(props) => <TerminalTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="beerlist" options={{ title: 'All Beer' }} />
      <Tabs.Screen
        name="mybeers"
        options={{ title: 'Beerfinder', href: isInVisitorMode ? null : undefined }}
      />
      <Tabs.Screen
        name="tastedbrews"
        options={{ title: 'Tasted Brews', href: isInVisitorMode ? null : undefined }}
      />
    </Tabs>
  );
}
