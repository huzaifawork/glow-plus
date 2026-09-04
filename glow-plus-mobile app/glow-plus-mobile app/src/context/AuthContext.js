import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as api from '../api/client';
import { restoreSession } from '../api/session';
import { ApiError } from '../api/errors';
import { useConfig } from './ConfigContext';

/**
 * Who is signed in  (R1.1 – R1.7)
 *
 * The whole session lifecycle lives here so that no screen has to think about
 * it. Three requirements are met by this file specifically:
 *
 * **R1.5 — stay logged in across restarts.** `bootstrap()` reads the keychain
 * (`restoreSession`) and, if a token is there, asks `GET /me` who it belongs
 * to. Nothing is cleared on launch.
 *
 * **R1.6 — detect an invalid session and return to Login.** Two paths reach
 * that, and both are needed:
 *   · on launch, `GET /me` answering 401 → we never enter the app at all;
 *   · mid-session, ANY request answering 401 after a failed refresh →
 *     `client.js` calls the handler registered below.
 * The second is the one that matters in practice: a session revoked while the
 * app is backgrounded produces no launch, so without it the user would sit on
 * a Rewards screen full of stale data watching every action fail.
 *
 * **R1.3 — the same account system as the rest of the platform.** There is no
 * app-local account model here: `user` is whatever `GET /me` returns.
 */
const AuthContext = createContext(null);

/** What the root renders on. `bootstrapping` is the splash; the rest is the app. */
const initial = { status: 'bootstrapping', user: null, error: null };

export function AuthProvider({ children, onSignedOut }) {
  const [state, setState] = useState(initial);
  const { loaded: configLoaded, demoMode, apiBaseUrl } = useConfig();

  // Tracked so a config change re-bootstraps against the new backend rather
  // than leaving a user "signed in" to a server the app is no longer talking
  // to. The ref avoids re-running on the very first pass.
  const lastTarget = useRef(null);

  const bootstrap = useCallback(async () => {
    setState((s) => ({ ...s, status: 'bootstrapping', error: null }));

    await restoreSession();

    try {
      const user = await api.getProfile();
      setState({ status: 'authenticated', user, error: null });
    } catch (err) {
      // R1.6 — a stored token that the server refuses is not a session.
      // Anything else (no network, a 500) leaves the user signed OUT rather
      // than stuck: the app is fully usable logged out (R3.1 — the directory
      // is public), so a signed-out shell is a working app, and a spinner
      // that never resolves is not.
      if (err instanceof ApiError && err.isAuthFailure) await api.logout();
      setState({ status: 'anonymous', user: null, error: null });
    }
  }, []);

  useEffect(() => {
    if (!configLoaded) return;
    const target = `${demoMode ? 'demo' : 'live'}:${apiBaseUrl}`;
    if (lastTarget.current === target) return;
    lastTarget.current = target;
    bootstrap();
  }, [configLoaded, demoMode, apiBaseUrl, bootstrap]);

  /**
   * R1.6, the mid-session half.
   *
   * Registered with the API module rather than the module importing this
   * context, because `client.js` must stay usable outside React.
   */
  useEffect(() => {
    api.setSessionExpiredHandler(() => {
      setState({
        status: 'anonymous',
        user: null,
        error: 'Your session has ended. Please sign in again.',
      });
      onSignedOut?.();
    });
    return () => api.setSessionExpiredHandler(null);
  }, [onSignedOut]);

  const signIn = useCallback(async (email, password) => {
    await api.login(email, password);

    // `login` already persisted the token, and its response carries a user
    // object — but a TRIMMED one: `{ id, name, emailVerified }`, with no
    // email. `GET /me` is asked ALWAYS, not just as a fallback, so that every
    // screen reads the same shape whether the session was created a second
    // ago or restored from the keychain on launch.
    //
    // The earlier `user ?? await api.getProfile()` short-circuited on the
    // truthy login response, so Settings showed a blank email until the next
    // app restart — the same account rendering two different ways depending
    // on how you arrived at it.
    const profile = await api.getProfile();
    setState({ status: 'authenticated', user: profile, error: null });
    return profile;
  }, []);

  const signUp = useCallback(async (payload) => {
    // Deliberately does NOT sign in. The platform requires a verified email
    // before a consumer may log in, so treating signup as a session would drop
    // the user onto a dashboard where every call 403s.
    return api.signup(payload);
  }, []);

  const signOut = useCallback(async () => {
    // Optimistic: the user tapped Sign out and must leave immediately, whether
    // or not the revoke request completes. `api.logout` clears local storage
    // regardless and fires the revoke in the background.
    setState({ status: 'anonymous', user: null, error: null });
    onSignedOut?.();
    await api.logout();
  }, [onSignedOut]);

  const clearError = useCallback(() => setState((s) => ({ ...s, error: null })), []);

  const value = useMemo(
    () => ({
      ...state,
      isAuthenticated: state.status === 'authenticated',
      isBootstrapping: state.status === 'bootstrapping',
      signIn,
      signUp,
      signOut,
      clearError,
      refresh: bootstrap,
    }),
    [state, signIn, signUp, signOut, clearError, bootstrap],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
