import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Linking, Platform } from 'react-native';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The user's position — on this device, and only on this device.
 *
 * ── NF6, first and loudest ─────────────────────────────────────────────────
 * *"The user's precise location must not be stored on the backend or shared
 * with any salon — it is used only, on-device, to sort and filter the salon
 * list the user already has permission to see."*
 *
 * So: **the coordinates never leave this context.** They are read by
 * `utils/distance.js` to compute a number, and that number is rendered. There
 * is no request in this app that carries a latitude — grep `client.js` and
 * confirm it. They are also never written to storage; the only thing persisted
 * here is a boolean saying whether the user has already dismissed the prompt,
 * so the app does not nag.
 *
 * ── NF5 ────────────────────────────────────────────────────────────────────
 * *"...must clearly explain why location is being requested before or at the
 * time of that prompt."* `requestPermission()` is therefore **never called on
 * launch**. It is called by `LocationPrompt`, which is the explanation. The
 * `Info.plist` / manifest strings in `app.json` are the "at the time of"
 * backstop.
 *
 * ── R3.9 ───────────────────────────────────────────────────────────────────
 * *"If the user declines ... the app must still allow full use of the salon
 * directory."* Every failure path here ends in `coords: null` and a status the
 * UI can explain. Nothing in this file throws into a screen, and no screen
 * blocks on it.
 */
const LocationContext = createContext(null);

const DISMISSED_KEY = 'glowplus.location.promptDismissed';

/** `undetermined` → never asked · `granted` · `denied` · `unavailable` (services off). */
const STATUS = {
  UNDETERMINED: 'undetermined',
  GRANTED: 'granted',
  DENIED: 'denied',
  UNAVAILABLE: 'unavailable',
};

export function LocationProvider({ children }) {
  const [status, setStatus] = useState(STATUS.UNDETERMINED);
  const [coords, setCoords] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const stored = await AsyncStorage.getItem(DISMISSED_KEY);
        if (!cancelled && stored === 'true') setDismissed(true);
      } catch {
        /* a device that cannot read a preference still gets the prompt */
      }

      // Reading the CURRENT permission is not a request and shows no dialog —
      // it is what lets a returning user who already granted access get their
      // distances back without being asked again.
      try {
        const { status: existing } = await Location.getForegroundPermissionsAsync();
        if (cancelled) return;
        if (existing === 'granted') {
          setStatus(STATUS.GRANTED);
          readPosition();
        }
      } catch {
        /* location services may be entirely absent; not an error worth showing */
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const readPosition = useCallback(async () => {
    setLoading(true);
    try {
      const position = await Location.getCurrentPositionAsync({
        // `Balanced` (~100 m) and not `High`. Sorting a salon list needs city
        // block precision, and `High` turns on GPS, which costs battery and
        // takes seconds. Asking for less precision than we could get is also
        // the right posture for a value we have promised not to transmit.
        accuracy: Location.Accuracy.Balanced,
      });
      setCoords({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
      setStatus(STATUS.GRANTED);
    } catch {
      // Permission granted but no fix — airplane mode, or location services
      // switched off at the OS level. Distinct from a denial: the user did
      // nothing wrong and re-prompting would be pointless.
      setStatus(STATUS.UNAVAILABLE);
      setCoords(null);
    } finally {
      setLoading(false);
    }
  }, []);

  /** Called by `LocationPrompt` — i.e. only after the user has been told why. */
  const requestPermission = useCallback(async () => {
    setLoading(true);
    try {
      const { status: result, canAskAgain } = await Location.requestForegroundPermissionsAsync();

      if (result === 'granted') {
        await readPosition();
        return true;
      }

      setStatus(STATUS.DENIED);
      setCoords(null);

      // On both platforms, a second refusal makes the OS stop showing the
      // dialog entirely. Asking again would do nothing at all, so the only
      // honest next step is the Settings app — which is what `LocationPrompt`
      // offers once `status` is `denied`.
      if (!canAskAgain) await dismiss();
      return false;
    } catch {
      setStatus(STATUS.UNAVAILABLE);
      return false;
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readPosition]);

  const openSettings = useCallback(() => {
    // `openSettings()` lands on this app's own page on both platforms.
    if (Platform.OS === 'ios') Linking.openURL('app-settings:');
    else Linking.openSettings();
  }, []);

  const dismiss = useCallback(async () => {
    setDismissed(true);
    try {
      await AsyncStorage.setItem(DISMISSED_KEY, 'true');
    } catch {
      /* a prompt shown once more is a small cost */
    }
  }, []);

  const value = useMemo(
    () => ({
      status,
      /** `{ latitude, longitude }` or null. NEVER send this anywhere — NF6. */
      coords,
      loading,
      /** R3.7/R3.8 — is distance sorting possible at all right now? */
      available: status === STATUS.GRANTED && coords != null,
      granted: status === STATUS.GRANTED,
      denied: status === STATUS.DENIED,
      /** Should the explanatory card be shown above the list? */
      shouldPrompt: status !== STATUS.GRANTED && !dismissed,
      requestPermission,
      refresh: readPosition,
      openSettings,
      dismiss,
    }),
    [status, coords, loading, dismissed, requestPermission, readPosition, openSettings, dismiss],
  );

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useLocation() {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error('useLocation must be used inside <LocationProvider>');
  return ctx;
}
