import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  BUILD_TIME_API_BASE_URL,
  getConfig,
  loadConfig,
  setApiBaseUrl as persistApiBaseUrl,
  setDemoMode as persistDemoMode,
  subscribeToConfig,
} from '../api/config';

/**
 * React's view of the backend configuration  (R5.1, R5.2)
 *
 * The **source of truth is `src/api/config.js`**, not this context, and that
 * split is deliberate: `client.js` is not a component and must be able to read
 * the base URL from a push handler or a module-level call, long before any
 * provider has mounted. This subscribes to that module and mirrors it into
 * React so screens re-render when Settings changes it.
 *
 * Changing either value has an immediate, app-wide effect — turning demo mode
 * on swaps every subsequent request to the in-memory dataset — so the screens
 * that consume this treat a change as a reason to refetch.
 */
const ConfigContext = createContext(null);

export function ConfigProvider({ children }) {
  const [config, setConfig] = useState(getConfig);

  useEffect(() => {
    // The saved overrides live in AsyncStorage, which is async, so the first
    // frame uses the build-time defaults and this corrects them. `loaded` is
    // what lets the root wait rather than firing a request at the wrong URL.
    loadConfig().then(setConfig);
    return subscribeToConfig(setConfig);
  }, []);

  const setApiBaseUrl = useCallback((value) => persistApiBaseUrl(value), []);
  const setDemoMode = useCallback((value) => persistDemoMode(value), []);

  const value = useMemo(
    () => ({
      ...config,
      defaultApiBaseUrl: BUILD_TIME_API_BASE_URL,
      /** True when the user has pointed the app somewhere other than the shipped default. */
      isOverridden: Boolean(config.apiBaseUrl) && config.apiBaseUrl !== BUILD_TIME_API_BASE_URL,
      setApiBaseUrl,
      setDemoMode,
    }),
    [config, setApiBaseUrl, setDemoMode],
  );

  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}

export function useConfig() {
  const ctx = useContext(ConfigContext);
  if (!ctx) throw new Error('useConfig must be used inside <ConfigProvider>');
  return ctx;
}
