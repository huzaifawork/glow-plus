import React from 'react';
import { StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import TabIcon from './TabIcon';
import RewardsScreen from '../screens/rewards/RewardsScreen';
import DiscoverScreen from '../screens/discover/DiscoverScreen';
import MyBookingsScreen from '../screens/bookings/MyBookingsScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';
import { colors, type } from '../theme';
import { useAuth } from '../context/AuthContext';

const Tab = createBottomTabNavigator();

/**
 * The four tabs.
 *
 * **Rewards is first for a signed-in user; Find a salon is first for a guest.**
 * The app's job differs by who opens it: a member is checking their points, a
 * visitor is looking for a salon. Reordering by session state is a one-line
 * `initialRouteName` and saves everyone a tap on every launch.
 *
 * **`headerShown: false`** because each screen draws its own large scrolling
 * title (`ScreenHeader`), which is the pattern both platforms use for tab
 * roots. Pushed screens — Salon — DO use the native stack header, because they
 * need a back button and the interactive swipe-back gesture.
 *
 * **My Bookings is hidden when signed out** rather than shown-and-empty: it is
 * a list of the viewer's own appointments, and a guest has none by definition.
 * Discover and Settings stay, because R3.1 requires the directory to work
 * without an account.
 */
export default function TabNavigator() {
  const { isAuthenticated } = useAuth();

  return (
    <Tab.Navigator
      initialRouteName={isAuthenticated ? 'RewardsTab' : 'DiscoverTab'}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.inkFaint,
        tabBarStyle: styles.bar,
        tabBarLabelStyle: styles.label,
        tabBarItemStyle: styles.item,
        // Keeping inactive tabs mounted means switching back is instant and
        // scroll position survives — the thing that most makes a tabbed app
        // feel native rather than like a set of pages.
        lazy: true,
      }}
    >
      {isAuthenticated ? (
        <Tab.Screen
          name="RewardsTab"
          component={RewardsScreen}
          options={{
            title: 'Rewards',
            tabBarIcon: ({ focused }) => <TabIcon glyph="✦" focused={focused} />,
          }}
        />
      ) : null}

      <Tab.Screen
        name="DiscoverTab"
        component={DiscoverScreen}
        options={{
          title: 'Find a salon',
          tabBarIcon: ({ focused }) => <TabIcon glyph="⌕" focused={focused} />,
        }}
      />

      {isAuthenticated ? (
        <Tab.Screen
          name="BookingsTab"
          component={MyBookingsScreen}
          options={{
            title: 'Bookings',
            tabBarIcon: ({ focused }) => <TabIcon glyph="◷" focused={focused} />,
          }}
        />
      ) : null}

      <Tab.Screen
        name="SettingsTab"
        component={SettingsScreen}
        options={{
          title: 'Settings',
          tabBarIcon: ({ focused }) => <TabIcon glyph="⚙" focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    // Taller than the default so the label is not crowded against the home
    // indicator on gesture-navigation devices. The navigator adds the safe
    // area inset on top of this.
    height: 62,
    paddingTop: 6,
    paddingBottom: 8,
  },
  label: { ...type.caption, marginTop: 2 },
  item: { paddingVertical: 2 },
});
