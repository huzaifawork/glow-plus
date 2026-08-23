import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DashboardScreen from './DashboardScreen';
import BookScreen from './BookScreen';
import MyBookingsScreen from './MyBookingsScreen';
import { colors, spacing } from '../theme';

const TABS = [
  { key: 'rewards', label: 'Rewards', icon: '★' },
  { key: 'book', label: 'Book', icon: '+' },
  { key: 'bookings', label: 'My Bookings', icon: '≡' },
];

export default function MainTabs({ onLogout }) {
  const [active, setActive] = useState('rewards');
  // Bumping this forces MyBookingsScreen to remount and refetch right
  // after a new booking is created, so the list is current without
  // needing a shared state manager for three screens.
  const [bookingsRefreshKey, setBookingsRefreshKey] = useState(0);

  function handleBooked() {
    setBookingsRefreshKey((k) => k + 1);
    setActive('bookings');
  }

  return (
    // Only the bottom edge is handled here (for the tab bar clearing the
    // home indicator) — DashboardScreen already applies its own top-edge
    // SafeAreaView, so applying 'top' here too would double that inset on
    // the Rewards tab. Book/MyBookings get their own top-edge wrapper
    // below instead, so all three tabs get exactly one top inset, not
    // zero or two.
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <View style={styles.content}>
        {active === 'rewards' && <DashboardScreen onLogout={onLogout} />}
        {active === 'book' && (
          <SafeAreaView style={styles.screen} edges={['top']}>
            <BookScreen onBooked={handleBooked} />
          </SafeAreaView>
        )}
        {active === 'bookings' && (
          <SafeAreaView style={styles.screen} edges={['top']}>
            <MyBookingsScreen key={bookingsRefreshKey} />
          </SafeAreaView>
        )}
      </View>

      <View style={styles.tabBar}>
        {TABS.map((tab) => (
          <TouchableOpacity key={tab.key} style={styles.tabItem} onPress={() => setActive(tab.key)}>
            <Text style={[styles.tabIcon, active === tab.key && styles.tabIconActive]}>{tab.icon}</Text>
            <Text style={[styles.tabLabel, active === tab.key && styles.tabLabelActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.white,
    paddingTop: 8,
    paddingBottom: 8,
  },
  tabItem: { flex: 1, alignItems: 'center', gap: 2 },
  tabIcon: { fontSize: 18, color: colors.inkSoft },
  tabIconActive: { color: colors.accent },
  tabLabel: { fontSize: 11, fontWeight: '600', color: colors.inkSoft },
  tabLabelActive: { color: colors.accent },
});
