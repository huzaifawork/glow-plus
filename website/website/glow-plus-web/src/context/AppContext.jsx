import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { logoutAdmin, logoutConsumer, logoutMerchant } from '../lib/api.js';

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

  // Bumped after every write. Views re-read through useAsyncData, which stands
  // in for the prototype's habit of calling render*() straight after a save.
  const [dataVersion, setDataVersion] = useState(0);
  const bumpData = useCallback(() => setDataVersion((v) => v + 1), []);

  const [toastState, setToastState] = useState({ msg: '', show: false });
  const toastTimer = useRef(null);

  const showView = useCallback((id) => {
    setView(id);
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
