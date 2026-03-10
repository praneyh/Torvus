// ============================================================
// TORVUS — Tab Bar Layout
// app/(tabs)/_layout.tsx  (Expo Router)
//
// Four tabs: Workout · Nutrition · Progress · Profile
// Custom tab bar with Torvus design language.
// ============================================================

import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Tabs } from 'expo-router';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

// ─────────────────────────────────────────────────────────────
// TAB DEFINITIONS
// ─────────────────────────────────────────────────────────────

// Using unicode symbols as icon fallbacks until @expo/vector-icons is confirmed
const TABS = [
  { name: 'index',     route: '/',           label: 'Workout',   icon: '⚡', },
  { name: 'nutrition', route: '/nutrition',  label: 'Nutrition', icon: '◎', },
  { name: 'progress',  route: '/progress',   label: 'Progress',  icon: '▲', },
  { name: 'profile',   route: '/profile',    label: 'Profile',   icon: '○', },
] as const;

// ─────────────────────────────────────────────────────────────
// CUSTOM TAB BAR
// ─────────────────────────────────────────────────────────────

function TorvusTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const activeIndex = state.index;

  return (
    <View style={styles.tabBar}>
      {/* Top border accent */}
      <View style={styles.topBorder} />

      <View style={styles.tabRow}>
        {state.routes.map((route, index) => {
          const tab = TABS[index];
          const isActive = index === activeIndex;
          const { options } = descriptors[route.key];
          const label = options.tabBarLabel ?? options.title ?? tab?.label ?? route.name;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!isActive && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          return (
            <TouchableOpacity
              key={route.key}
              style={styles.tab}
              onPress={onPress}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={typeof label === 'string' ? label : route.name}
            >
              {/* Active indicator pill */}
              {isActive && <View style={styles.activePill} />}

              {/* Icon */}
              <Text style={[styles.tabIcon, isActive && styles.tabIconActive]}>
                {tab?.icon ?? '·'}
              </Text>

              {/* Label */}
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                {typeof label === 'string' ? label.toUpperCase() : route.name.toUpperCase()}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// LAYOUT
// ─────────────────────────────────────────────────────────────

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <TorvusTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Workout', tabBarLabel: 'Workout' }}
      />
      <Tabs.Screen
        name="nutrition"
        options={{ title: 'Nutrition', tabBarLabel: 'Nutrition' }}
      />
      <Tabs.Screen
        name="progress"
        options={{ title: 'Progress', tabBarLabel: 'Progress' }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarLabel: 'Profile' }}
      />
    </Tabs>
  );
}

// ─────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#0E0D0B',
    paddingBottom: Platform.OS === 'ios' ? 28 : 10,
  },
  topBorder: {
    height: 1,
    backgroundColor: '#1E1D1A',
  },
  tabRow: {
    flexDirection: 'row',
    paddingTop: 10,
    paddingHorizontal: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
    position: 'relative',
  },
  activePill: {
    position: 'absolute',
    top: -10,
    width: 28,
    height: 2,
    backgroundColor: '#EF6C3E',
    borderRadius: 1,
  },
  tabIcon: {
    fontSize: 18,
    color: '#3A3835',
    marginBottom: 3,
  },
  tabIconActive: {
    color: '#EF6C3E',
  },
  tabLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: '#3A3835',
  },
  tabLabelActive: {
    color: '#EF6C3E',
  },
});
