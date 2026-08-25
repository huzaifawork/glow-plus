import { useApp } from '../context/AppContext.jsx';

/**
 * The prototype's enterX()/goHome() functions. They used to also kick off the
 * matching render*() call; that part is now handled by each view re-reading its
 * own data, so these are pure navigation.
 */
export function useNav() {
  const { showView, currentConsumer, currentMerchant } = useApp();
  return {
    goHome: () => showView('view-marketing'),
    // [F51] — with sessions now restored from stored tokens, "My rewards" and
    // "For salons" must go to the signed-in destination when there IS a
    // session. Sending an already-signed-in salon back to the sign-in form is
    // what made the Glow+ logo and the Back button feel like a logout.
    enterConsumerFlow: () =>
      showView(currentConsumer ? 'view-consumer-dashboard' : 'view-consumer-auth'),
    enterBusinessFlow: () =>
      showView(currentMerchant ? 'view-business-portal' : 'view-business-auth'),
    enterAdmin: () => showView('view-admin'),
  };
}
