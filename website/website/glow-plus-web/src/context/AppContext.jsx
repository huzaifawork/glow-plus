import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  getAdminProfile,
  getAdminToken,
  getConsumerProfile,
  getConsumerToken,
  getMerchantProfile,
  getToken,
  logoutAdmin,
  logoutConsumer,
  logoutMerchant,
} from '../lib/api.js';

/**
 * The view the user was last on, per TAB  [F51]
 *
 * sessionStorage, not localStorage, and deliberately: a brand-new tab should
 * open on the marketing page the way a first-time visitor sees it, while a
 * RELOAD of a tab that was mid-session should come back where it was. A
 * restored view is only applied if the session it needs actually came back —
 * otherwise a signed-out reload would land on an empty portal.
 */
const VIEW_KEY = 'glowplus:view';
const VIEW_REQUIRES = {
  'view-business-portal': 'merchant',
  'view-consumer-dashboard': 'consumer',
};

function readStoredView() {
  try {
    return window.sessionStorage.getItem(VIEW_KEY);
  } catch {
    return null;
  }
}

/**
 * Which view a standalone page asked us to open.  [F66]
 *
 * The reset, forgot-password and verify-email pages are separate HTML entry
 * points, not SPA views, so they cannot call `showView()` — they can only link.
 * Linking to `/` would land someone who has just set a new password on the
 * marketing page, leaving them to work out that "My rewards" is the way in.
 * `/?view=view-consumer-auth` puts them on the sign-in form they were always
 * headed for.
 *
 * Allow-listed rather than trusted: `view` comes off the URL, so anyone can
 * put anything in it. Only the two AUTH views are permitted — a link must
 * never be able to open the portal or the dashboard, which is what
 * VIEW_REQUIRES guards for the restore path.
 */
const LINKABLE_VIEWS = ['view-consumer-auth', 'view-business-auth'];

function readRequestedView() {
  try {
    const asked = new URLSearchParams(window.location.search).get('view');
    return LINKABLE_VIEWS.includes(asked) ? asked : null;
  } catch {
    return null;
  }
}

const AppContext = createContext(null);

export function AppProvider({ children }) {
  // The prototype kept every view in the DOM and toggled an `active` class.
  // Same here — which is also what preserves half-filled form inputs when you
  // navigate away and back.
  const [view, setView] = useState('view-marketing');
  const [currentConsumer, setCurrentConsumer] = useState(null);
  const [currentMerchant, setCurrentMerchant] = useState(null);
  // T38. Deliberately a THIRD session, not a flag on the merchant one: the
  // admin token has its own storage key (`glowplus:token:admin`) precisely so
  // a platform admin can be signed in alongside a salon owner in the same
  // browser without either clobbering the other.
  //
  // Like the other two, it is NOT restored from the stored token on reload —
  // `currentMerchant` and `currentConsumer` aren't either, and an admin who
  // appeared signed in while the merchant view had signed itself out would be
  // the odd one out in the same shell. The token survives; the session state
  // does not. (Making all three survive a refresh is T47's territory.)
  const [currentAdmin, setCurrentAdmin] = useState(null);
  // False until the token-restore pass below has finished. Views that need to
  // tell "signed out" from "not asked yet" read this.
  const [hydrated, setHydrated] = useState(false);

  // Bumped after every write. Views re-read through useAsyncData, which stands
  // in for the prototype's habit of calling render*() straight after a save.
  const [dataVersion, setDataVersion] = useState(0);
  const bumpData = useCallback(() => setDataVersion((v) => v + 1), []);

  const [toastState, setToastState] = useState({ msg: '', show: false });
  const toastTimer = useRef(null);

  const showView = useCallback((id) => {
    setView(id);
    try {
      window.sessionStorage.setItem(VIEW_KEY, id);
    } catch {
      /* private-mode browsers throw; navigation must still work */
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const toast = useCallback((msg, ms) => {
    setToastState({ msg, show: true });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(
      () => setToastState((s) => ({ ...s, show: false })),
      ms || 3200
    );
  }, []);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  /**
   * Restore sessions from stored tokens on load  [F51]
   *
   * Before this, all three sessions lived only in React state: a valid access
   * token and a 30-day refresh token sat in localStorage while the app
   * rendered its signed-out shell, so a refresh, the browser Back button, the
   * Glow+ logo, or the return trip from Stripe Checkout all looked like being
   * logged out. (The Stripe success page's "log in again to see your updated
   * status" line existed only to paper over this.)
   *
   * Each role is restored by ASKING THE SERVER who the token belongs to,
   * rather than by caching the profile locally. That matters beyond
   * tidiness: `Merchant.status` changes underneath the client — an admin
   * approves it, or a completed checkout flips it to ACTIVE — and a cached
   * copy would keep showing the pending banner to a salon that is already
   * live.
   *
   * The three calls are independent and each carries its own token key, so
   * they cannot replay one another's refresh token (`refreshSession` is
   * single-flight per key). A failure is swallowed on purpose: `apiRequest`
   * has already cleared a session it could not refresh, and the correct
   * outcome for the user is simply the signed-out view they would have got
   * anyway.
   */
  useEffect(() => {
    let cancelled = false;

    async function restore() {
      const jobs = [];

      if (getToken()) {
        jobs.push(
          getMerchantProfile()
            .then((m) => {
              if (cancelled) return;
              setCurrentMerchant({
                id: m.id,
                businessName: m.businessName,
                status: m.status,
                foundingMember: m.foundingMember,
                // [F74] — the portal banner needs to know whether a plan has
                // been started, because an approved-but-unsubscribed salon is
                // now hidden from "Find a salon" and has to be told why.
                subscriptionStatus: m.subscription ? m.subscription.status : null,
                createdAt: Date.parse(m.createdAt) || Date.now(),
              });
            })
            .catch(() => {}),
        );
      }

      if (getConsumerToken()) {
        jobs.push(
          getConsumerProfile()
            .then((u) => {
              if (cancelled) return;
              setCurrentConsumer({
                id: u.id,
                name: u.name,
                email: u.email,
                emailVerified: u.emailVerified,
              });
            })
            .catch(() => {}),
        );
      }

      if (getAdminToken()) {
        jobs.push(
          getAdminProfile()
            .then((a) => {
              if (cancelled) return;
              setCurrentAdmin({ id: a.id, email: a.email });
            })
            .catch(() => {}),
        );
      }

      if (jobs.length === 0) return;
      await Promise.all(jobs);
    }

    restore().finally(() => {
      if (!cancelled) setHydrated(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Put the tab back on the view it was showing, once we know which sessions
   * survived. Runs after hydration so it can refuse to restore a view whose
   * session did not come back.
   */
  useEffect(() => {
    if (!hydrated) return;
    // [F66] — an explicit ?view= beats the remembered one. Someone arriving
    // from "Password updated" wants the sign-in form, not wherever this tab
    // happened to be before.
    const requested = readRequestedView();
    if (requested) {
      setView(requested);
      return;
    }

    const stored = readStoredView();
    if (!stored || stored === view) return;
    const needs = VIEW_REQUIRES[stored];
    if (needs === 'merchant' && !currentMerchant) return;
    if (needs === 'consumer' && !currentConsumer) return;
    setView(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // T35 — real sessions, so a real logout must drop the real token, not just
  // the local view state (the fake data.js flow had no token to worry about).
  const signOutConsumer = useCallback(() => {
    logoutConsumer();
    setCurrentConsumer(null);
    showView('view-consumer-auth');
  }, [showView]);

  const signOutMerchant = useCallback(() => {
    logoutMerchant();
    setCurrentMerchant(null);
    showView('view-business-auth');
  }, [showView]);

  // No showView() here, unlike the other two. The consumer and merchant flows
  // each have a separate auth *view* to fall back to; the admin sign-in form
  // lives inside view-admin itself, so clearing the session is all that is
  // needed — the same view re-renders as the login card.
  const signOutAdmin = useCallback(() => {
    logoutAdmin();
    setCurrentAdmin(null);
  }, []);

  const value = {
    view,
    showView,
    currentConsumer,
    setCurrentConsumer,
    signOutConsumer,
    currentMerchant,
    setCurrentMerchant,
    signOutMerchant,
    currentAdmin,
    setCurrentAdmin,
    signOutAdmin,
    hydrated,
    dataVersion,
    bumpData,
    toast,
    toastState,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  return useContext(AppContext);
}
