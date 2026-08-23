import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  // The prototype kept every view in the DOM and toggled an `active` class.
  // Same here — which is also what preserves half-filled form inputs when you
  // navigate away and back.
  const [view, setView] = useState('view-marketing');
  const [currentConsumer, setCurrentConsumer] = useState(null);
  const [currentMerchant, setCurrentMerchant] = useState(null);

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

  const value = {
    view,
    showView,
    currentConsumer,
    setCurrentConsumer,
    currentMerchant,
    setCurrentMerchant,
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
