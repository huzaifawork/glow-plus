import { useApp } from '../context/AppContext.jsx';

/**
 * The prototype's enterX()/goHome() functions. They used to also kick off the
 * matching render*() call; that part is now handled by each view re-reading its
 * own data, so these are pure navigation.
 */
export function useNav() {
  const { showView } = useApp();
  return {
    goHome: () => showView('view-marketing'),
    enterConsumerFlow: () => showView('view-consumer-auth'),
    enterBusinessFlow: () => showView('view-business-auth'),
    enterAdmin: () => showView('view-admin'),
  };
}
