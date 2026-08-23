import { useApp } from './context/AppContext.jsx';
import TopBar from './components/TopBar.jsx';
import Toast from './components/Toast.jsx';
import T from './components/T.jsx';
import Marketing from './views/Marketing.jsx';
import ConsumerAuth from './views/ConsumerAuth.jsx';
import ConsumerDashboard from './views/ConsumerDashboard.jsx';
import BusinessAuth from './views/BusinessAuth.jsx';
import BusinessPortal from './views/BusinessPortal.jsx';
import Admin from './views/Admin.jsx';

/**
 * Same shell as the original document: promo bar, sticky topbar, <main> holding
 * all six views, then the toast.
 *
 * Every view stays mounted and is shown or hidden by the `.view.active` class,
 * exactly as showView() did. That is deliberate — it is what preserves
 * half-completed form input when you navigate away and come back.
 */
export default function App() {
  const { view } = useApp();

  return (
    <>
      <T as="div" className="promo-bar" k="promo_bar" />
      <TopBar />
      <main>
        <Marketing active={view === 'view-marketing'} />
        <ConsumerAuth active={view === 'view-consumer-auth'} />
        <ConsumerDashboard active={view === 'view-consumer-dashboard'} />
        <BusinessAuth active={view === 'view-business-auth'} />
        <BusinessPortal active={view === 'view-business-portal'} />
        <Admin active={view === 'view-admin'} />
      </main>
      <Toast />
    </>
  );
}
