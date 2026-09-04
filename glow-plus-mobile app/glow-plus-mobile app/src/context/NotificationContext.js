import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as api from '../api/client';
import { useAuth } from './AuthContext';

/**
 * Booking-status notifications  (R4.5)
 *
 * *"The app should notify the user when a booking's status changes (for
 * example, when a salon confirms a pending request), without requiring the
 * user to manually check."*
 *
 * The chain: the app registers this installation's Expo push token with
 * `POST /me/devices`; the backend's `BookingsService.announce` sends through
 * Expo whenever a salon confirms, cancels, completes or no-shows a booking.
 * "Without requiring the user to manually check" is why it is a real push and
 * not a poll — a poll only runs while the app is open, which is precisely when
 * the user IS checking.
 *
 * ── ⚠️ Why `expo-notifications` is REQUIRED lazily, not imported ────────────
 *
 * **Expo Go cannot do remote push at all as of SDK 53.** The module does not
 * degrade quietly — importing it in Expo Go and touching anything push-shaped
 * **throws at module-evaluation time**:
 *
 *   > `expo-notifications: Android Push notifications (remote notifications)
 *   > functionality provided by expo-notifications was removed from Expo Go
 *   > with the release of SDK 53. Use a development build instead.`
 *
 * A static `import` is hoisted and evaluated before any of this file's own
 * code runs, so there is no `try`/`catch` or feature flag inside the component
 * that can prevent it. The whole app dies on the red screen — every screen,
 * including the ones that have nothing to do with notifications — because of
 * one optional feature.
 *
 * So the module is pulled in with `require()` **behind a runtime check**, and
 * every call site treats its absence as normal. In Expo Go the app is fully
 * usable and notifications are simply reported as unavailable; in a
 * development or production build the feature works exactly as before.
 *
 * That is also the honest reading of the requirement: R4.5 is the spec's only
 * *"should"*, and it is the one feature that cannot work in the review client.
 *
 * ── Three things that are easy to get wrong ────────────────────────────────
 *
 * 1. **Permission is requested after sign-in, never on launch.** A permission
 *    prompt on first open, before the user has any bookings, is the one most
 *    people deny — and a denial is close to permanent.
 *
 * 2. **The token is registered per SIGNED-IN USER, and unregistered on sign
 *    out.** Otherwise a shared phone keeps delivering one person's appointment
 *    details to the next person who uses it. The backend enforces the same
 *    thing (the unique index is on the token alone, so registering moves it),
 *    but the client must not rely on that to avoid the leak.
 *
 * 3. **A physical device is required.** Simulators cannot receive push tokens
 *    at all; asking produces an error rather than a token, so the whole flow is
 *    skipped there rather than failing loudly on every developer's machine.
 */
const NotificationContext = createContext(null);

const ENABLED_KEY = 'glowplus.notifications.enabled';

/**
 * Are we inside the Expo Go client?
 *
 * `ExecutionEnvironment.StoreClient` is Expo Go; `Standalone` and `Bare` are
 * real builds. Checked from `expo-constants`, which is safe to import
 * anywhere — unlike `expo-notifications`.
 */
const IN_EXPO_GO = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/**
 * The module, or null. Loaded with `require` so the import never happens in
 * Expo Go — see the note above for why an `import` cannot be guarded.
 *
 * The `try` is a second belt: a future SDK could move the throw somewhere
 * else, and a red screen on every launch is too high a price for a "should".
 */
const Notifications = (() => {
  if (IN_EXPO_GO) return null;
  try {
    // eslint-disable-next-line global-require
    return require('expo-notifications');
  } catch {
    return null;
  }
})();

/** Only meaningful in a real build; `expo-device` is only needed there too. */
const Device = (() => {
  if (IN_EXPO_GO) return null;
  try {
    // eslint-disable-next-line global-require
    return require('expo-device');
  } catch {
    return null;
  }
})();

/**
 * A notification arriving while the app is OPEN should still be seen — a user
 * looking at Rewards when their booking is confirmed gets the banner too.
 */
if (Notifications) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      // SDK 53 split the old `shouldShowAlert` in two, and warns on every
      // notification if you still use it. `shouldShowBanner` is the heads-up
      // banner; `shouldShowList` is whether it also lands in the notification
      // centre. Both true, because a booking confirmation the user misses
      // while looking at another screen should still be findable afterwards.
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

export function NotificationProvider({ children, onOpenBooking }) {
  const { isAuthenticated } = useAuth();
  const [token, setToken] = useState(null);
  // 'unsupported' is its own state, distinct from 'denied': the user has
  // refused nothing, the client simply cannot do it. Settings says so rather
  // than showing a toggle that would do nothing.
  const [status, setStatus] = useState(Notifications ? 'undetermined' : 'unsupported');
  const [enabled, setEnabled] = useState(true);
  const registered = useRef(null);

  useEffect(() => {
    AsyncStorage.getItem(ENABLED_KEY)
      .then((v) => setEnabled(v !== 'false'))
      .catch(() => {});
  }, []);

  /**
   * Android requires a channel to exist before a notification can use it, and
   * the backend sends `channelId: 'bookings'`. Without this, a push arrives
   * silently and without a heads-up banner — delivered, and invisible.
   */
  useEffect(() => {
    if (!Notifications || Platform.OS !== 'android') return;
    Notifications.setNotificationChannelAsync('bookings', {
      name: 'Appointment updates',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 200, 100, 200],
      lightColor: '#E0116F',
    }).catch(() => {});
  }, []);

  const registerForPush = useCallback(async () => {
    if (!Notifications) return null;
    // `Device.isDevice` is false on a simulator, which cannot mint a token.
    if (Device && !Device.isDevice) return null;

    try {
      const existing = await Notifications.getPermissionsAsync();
      let granted = existing.status === 'granted';

      if (!granted && existing.canAskAgain) {
        const asked = await Notifications.requestPermissionsAsync();
        granted = asked.status === 'granted';
      }

      setStatus(granted ? 'granted' : 'denied');
      if (!granted) return null;

      // `projectId` is required by SDK 49+ to mint a token; without it the
      // call throws with a message that reads like a bug rather than missing
      // configuration. `eas build:configure` is what writes it.
      const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

      const { data } = await Notifications.getExpoPushTokenAsync(
        projectId ? { projectId } : undefined,
      );
      setToken(data);
      return data;
    } catch {
      // A device that cannot mint a token is not a broken app. R4.5 is a
      // "should", and everything else keeps working — My Bookings still
      // refreshes on pull (R4.4).
      setStatus('unavailable');
      return null;
    }
  }, []);

  /** Register once signed in; unregister on sign-out. */
  useEffect(() => {
    if (!Notifications) return undefined;
    let cancelled = false;

    (async () => {
      if (!isAuthenticated || !enabled) {
        if (registered.current) {
          const stale = registered.current;
          registered.current = null;
          // See note 2 above — this is what stops a shared phone from
          // receiving the previous account's appointments.
          api.unregisterDevice(stale).catch(() => {});
        }
        return;
      }

      const pushToken = await registerForPush();
      if (cancelled || !pushToken || registered.current === pushToken) return;

      try {
        await api.registerDevice(pushToken, Platform.OS);
        registered.current = pushToken;
      } catch {
        // Registration failing must never block the app. The user simply does
        // not get pushes this session.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, enabled, registerForPush]);

  /**
   * Tapping a notification opens the booking it is about.
   *
   * `getLastNotificationResponseAsync` covers the cold-start case — the app
   * was not running, so the listener below was not mounted when the tap
   * happened, and without this the user lands on the default tab having been
   * promised a specific booking.
   */
  useEffect(() => {
    if (!Notifications) return undefined;

    const handle = (response) => {
      const data = response?.notification?.request?.content?.data;
      if (data?.type === 'booking-status' && data?.bookingId) {
        onOpenBooking?.(data.bookingId);
      }
    };

    Notifications.getLastNotificationResponseAsync()
      .then((r) => r && handle(r))
      .catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(handle);
    return () => sub.remove();
  }, [onOpenBooking]);

  const setNotificationsEnabled = useCallback(async (next) => {
    setEnabled(next);
    try {
      await AsyncStorage.setItem(ENABLED_KEY, String(next));
    } catch {
      /* the in-memory value already took effect */
    }
  }, []);

  const value = useMemo(
    () => ({
      token,
      status,
      enabled,
      /** False in Expo Go: the client cannot receive remote push at all. */
      supported: Boolean(Notifications),
      inExpoGo: IN_EXPO_GO,
      setNotificationsEnabled,
      registerForPush,
    }),
    [token, status, enabled, setNotificationsEnabled, registerForPush],
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used inside <NotificationProvider>');
  return ctx;
}
