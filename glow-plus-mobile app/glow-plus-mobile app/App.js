import React, { useCallback, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import 'react-native-gesture-handler';

import RootNavigator from './src/navigation/RootNavigator';
import ErrorBoundary from './src/components/ErrorBoundary';
import { ConfigProvider } from './src/context/ConfigContext';
import { AuthProvider } from './src/context/AuthContext';
import { NetworkProvider } from './src/context/NetworkContext';
import { LocationProvider } from './src/context/LocationContext';
import { NotificationProvider } from './src/context/NotificationContext';
import { ToastProvider } from './src/context/ToastContext';
import { navigationTheme } from './src/theme/navigationTheme';

/**
 * ============================================================================
 * Glow+ — the consumer mobile app.
 * ============================================================================
 *
 * iOS and Android from one codebase (Target Platforms 1-3), React Native via
 * Expo (Technical Constraints), one role only: the Consumer (Section 3). There
 * is no merchant login, no admin login and no role switch anywhere in this
 * app — Section 6's non-goals are met by those screens not existing rather
 * than by being hidden.
 *
 * ── The provider order is not arbitrary ────────────────────────────────────
 * Each layer depends on the ones outside it, and getting this wrong produces
 * failures that look like unrelated bugs:
 *
 *   ErrorBoundary   — outermost, so it can catch a provider that throws
 *   ConfigProvider  — WHERE the backend is (R5.2) and whether we call it at
 *                     all (R5.1). Everything that makes a request needs this.
 *   NetworkProvider — independent of the rest; sits high so any screen can ask
 *   AuthProvider    — needs Config (it must re-bootstrap when the backend
 *                     changes, or a user stays "signed in" to a server the app
 *                     is no longer talking to)
 *   Location        — independent, but below Auth so it is inside the tree
 *                     that re-renders on sign-in
 *   Notification    — needs Auth: a push token is registered PER SIGNED-IN
 *                     USER (R4.5), and unregistered on sign-out so a shared
 *                     phone stops delivering the previous account's
 *                     appointments
 *   Toast           — innermost provider, outside the navigator, so a toast
 *                     survives a screen transition and floats above it
 *
 * ── The one piece of cross-cutting wiring ──────────────────────────────────
 * `navigationRef` lets the notification handler navigate. A tapped booking
 * notification has to open My Bookings on that booking, and the handler runs
 * outside the navigator's React tree — including on a cold start, before any
 * screen has mounted.
 */
export default function App() {
  const navigationRef = useRef(null);

  /** R4.5 — a tapped notification lands on the booking it was about. */
  const openBooking = useCallback((bookingId) => {
    // Guarded: on a cold start this fires before the container is ready, and
    // navigating then is a no-op that silently swallows the deep link.
    if (!navigationRef.current?.isReady()) return;
    navigationRef.current.navigate('Tabs', {
      screen: 'BookingsTab',
      params: { bookingId },
    });
  }, []);

  /** Sending a signed-out user somewhere they can still use (R3.1). */
  const handleSignedOut = useCallback(() => {
    if (!navigationRef.current?.isReady()) return;
    navigationRef.current.navigate('Tabs', { screen: 'DiscoverTab' });
  }, []);

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <ConfigProvider>
          <NetworkProvider>
            <AuthProvider onSignedOut={handleSignedOut}>
              <LocationProvider>
                <NotificationProvider onOpenBooking={openBooking}>
                  <ToastProvider>
                    <NavigationContainer ref={navigationRef} theme={navigationTheme}>
                      <StatusBar style="dark" />
                      <RootNavigator />
                    </NavigationContainer>
                  </ToastProvider>
                </NotificationProvider>
              </LocationProvider>
            </AuthProvider>
          </NetworkProvider>
        </ConfigProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
