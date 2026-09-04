import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

/**
 * Is there a connection?  (NF4)
 *
 * *"The app must handle a lost or slow network connection gracefully, with a
 * clear message to the user rather than a silent failure or crash."*
 *
 * A failed request already produces a `NetworkError` with a sentence, so this
 * exists for the half that requests cannot cover: telling the user BEFORE they
 * tap, and refetching automatically when the connection comes back — the
 * behaviour that turns "the app broke while I was on the underground" into
 * "the app caught up when I came out".
 *
 * **`isInternetReachable`, not just `isConnected`.** Being on a wifi network is
 * not the same as having internet, and a captive portal (a hotel, an airport)
 * reports `isConnected: true` while every request fails. `null` means "not
 * determined yet" and is deliberately treated as ONLINE: assuming offline on
 * launch would show an offline banner for a moment on every cold start.
 */
const NetworkContext = createContext(null);

export function NetworkProvider({ children }) {
  const [state, setState] = useState({ isConnected: true, isInternetReachable: true });

  useEffect(() => {
    // The subscription fires immediately with the current state, so no
    // separate initial fetch is needed.
    return NetInfo.addEventListener((s) =>
      setState({
        isConnected: s.isConnected !== false,
        isInternetReachable: s.isInternetReachable !== false,
      }),
    );
  }, []);

  const value = useMemo(() => {
    const online = state.isConnected && state.isInternetReachable;
    return { online, offline: !online, ...state };
  }, [state]);

  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>;
}

export function useNetwork() {
  const ctx = useContext(NetworkContext);
  if (!ctx) throw new Error('useNetwork must be used inside <NetworkProvider>');
  return ctx;
}
